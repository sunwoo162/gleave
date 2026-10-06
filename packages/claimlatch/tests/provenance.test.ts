import assert from "node:assert/strict";
import test from "node:test";
import { ProvenanceEvidenceProvider, isSafePublicHttpUrl } from "../src/providers/provenance.js";
import { extractPdfPages } from "../src/providers/pdf.js";
import { StaticEvidenceProvider } from "../src/providers/static.js";

const claim = { id: "claim_1", text: "Mars is known as the Red Planet.", kind: "fact" as const, importance: "normal" as const };

test("provenance provider binds evidence to fetched document text and hash", async () => {
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Mars",
        url: "https://example.test/mars",
        snippet: "Search snippet",
        sourceType: "primary",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    fetchImpl: (async () =>
      new Response(
        "<html><body><h1>Mars</h1><p>Mars is commonly known as the Red Planet because of its reddish appearance.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      )) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.equal(result[0]?.provenance?.kind, "retrieved-document");
  assert.match(result[0]?.snippet ?? "", /Mars.*Red Planet/i);
  assert.equal(result[0]?.provenance?.contentSha256?.length, 64);
  assert.equal(typeof result[0]?.provenance?.quoteStart, "number");
});

test("private network evidence URLs are never fetched", async () => {
  let called = false;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Unsafe",
        url: "http://127.0.0.1:8080/admin",
        snippet: "fallback",
        sourceType: "unknown",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.equal(called, false);
  assert.equal(result[0]?.provenance?.kind, "search-snippet");
});

test("credentialed evidence URLs are redacted in fallback provenance", async () => {
  let called = false;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [{
      id: "e1",
      claimId: "claim_1",
      title: "Credentialed source",
      url: "https://user:password@example.test/mars",
      snippet: "fallback",
      sourceType: "unknown",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      provider: "fixture",
      provenance: {
        kind: "search-snippet",
        sourceUrl: "https://source-user:source-password@example.test/mars",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        quote: "fallback",
      },
    }]),
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.equal(called, false);
  assert.equal(result[0]?.url, "https://example.test/mars");
  assert.equal(result[0]?.provenance?.sourceUrl, "https://example.test/mars");
});

test("outbound host allowlist blocks a non-matching evidence URL before fetch", async () => {
  let called = false;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [{
      id: "e1",
      claimId: "claim_1",
      title: "Disallowed host",
      url: "https://other.example.test/mars",
      snippet: "fallback",
      sourceType: "unknown",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      provider: "fixture",
    }]),
    outboundAllowlist: { hosts: ["allowed.example.test"] },
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.equal(called, false);
  assert.equal(result[0]?.provenance?.kind, "search-snippet");
});

test("outbound host allowlist permits the configured domain and its subdomains", async () => {
  let requestedUrl: string | undefined;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [{
      id: "e1",
      claimId: "claim_1",
      title: "Allowed host",
      url: "https://docs.allowed.example.test/mars",
      snippet: "fallback",
      sourceType: "primary",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      provider: "fixture",
    }]),
    outboundAllowlist: { hosts: ["allowed.example.test"], ports: [443] },
    fetchImpl: (async (url) => {
      requestedUrl = String(url);
      return new Response("Mars is known as the Red Planet.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.equal(requestedUrl, "https://docs.allowed.example.test/mars");
  assert.equal(result[0]?.provenance?.kind, "retrieved-document");
});

test("outbound allowlist is rechecked before following a redirect", async () => {
  const requestedUrls: string[] = [];
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [{
      id: "e1",
      claimId: "claim_1",
      title: "Redirect target",
      url: "https://allowed.example.test/start",
      snippet: "fallback",
      sourceType: "unknown",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      provider: "fixture",
    }]),
    outboundAllowlist: { hosts: ["allowed.example.test"] },
    fetchImpl: (async (url) => {
      requestedUrls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "https://other.example.test/final" },
      });
    }) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.deepEqual(requestedUrls, ["https://allowed.example.test/start"]);
  assert.equal(result[0]?.provenance?.kind, "search-snippet");
});

test("outbound port allowlist rejects non-default ports", async () => {
  let called = false;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [{
      id: "e1",
      claimId: "claim_1",
      title: "Disallowed port",
      url: "https://allowed.example.test:8443/mars",
      snippet: "fallback",
      sourceType: "unknown",
      retrievedAt: "2026-09-28T00:00:00.000Z",
      provider: "fixture",
    }]),
    outboundAllowlist: { hosts: ["allowed.example.test"], ports: [443] },
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  const result = await provider.search(claim);
  assert.equal(called, false);
  assert.equal(result[0]?.provenance?.kind, "search-snippet");
});

test("outbound allowlist rejects malformed configuration", () => {
  assert.throws(() => new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => []),
    outboundAllowlist: { ports: [0] },
  }), /port must be an integer/);
  assert.throws(() => new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => []),
    outboundAllowlist: { hosts: ["https://example.test"] },
  }), /host must be a hostname/);
});

test("public URL filter rejects common private and local targets", () => {
  assert.equal(isSafePublicHttpUrl(new URL("http://localhost/test")), false);
  assert.equal(isSafePublicHttpUrl(new URL("http://localhost./test")), false);
  assert.equal(isSafePublicHttpUrl(new URL("http://service.local./test")), false);
  assert.equal(isSafePublicHttpUrl(new URL("http://10.0.0.1/test")), false);
  assert.equal(isSafePublicHttpUrl(new URL("http://192.168.1.1/test")), false);
  assert.equal(isSafePublicHttpUrl(new URL("http://169.254.169.254/latest/meta-data")), false);
  for (const value of [
    "http://2130706433/test",
    "http://0177.0.0.1/test",
    "http://0x7f000001/test",
    "http://127.1/test",
  ]) {
    assert.equal(isSafePublicHttpUrl(new URL(value)), false);
  }
  assert.equal(isSafePublicHttpUrl(new URL("https://user:password@example.com/test")), false);
  assert.equal(isSafePublicHttpUrl(new URL("https://example.com/test")), true);
});

test("public URL filter rejects reserved and non-routable IPv4 and IPv6 targets", () => {
  for (const value of [
    "http://192.0.0.1/test",
    "http://198.18.0.1/test",
    "http://198.51.100.1/test",
    "http://203.0.113.1/test",
    "http://224.0.0.1/test",
    "http://[::]/test",
    "http://[ff02::1]/test",
    "http://[2001:db8::1]/test",
  ]) {
    assert.equal(isSafePublicHttpUrl(new URL(value)), false);
  }
  assert.equal(isSafePublicHttpUrl(new URL("https://[2001:4860:4860::8888]/test")), true);
});

test("DNS resolution rejects a public hostname that resolves to a private address", async () => {
  let lookupCalled = false;
  let requestCalled = false;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "DNS rebinding target",
        url: "http://public.example.test/mars",
        snippet: "fallback",
        sourceType: "unknown",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    lookupImpl: async () => {
      lookupCalled = true;
      return [{ address: "127.0.0.1", family: 4 }];
    },
    requestImpl: async () => {
      requestCalled = true;
      return new Response("should not be fetched", { status: 200, headers: { "content-type": "text/plain" } });
    },
  });

  const result = await provider.search(claim);
  assert.equal(lookupCalled, true);
  assert.equal(requestCalled, false);
  assert.equal(result[0]?.provenance?.kind, "search-snippet");
});

test("DNS lookup timeout fails closed instead of hanging document hydration", async () => {
  let requestCalled = false;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Hanging DNS target",
        url: "http://public.example.test/mars",
        snippet: "fallback",
        sourceType: "unknown",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    lookupImpl: async () => new Promise(() => undefined),
    requestImpl: async () => {
      requestCalled = true;
      return new Response("should not be fetched", { status: 200, headers: { "content-type": "text/plain" } });
    },
    timeoutMs: 250,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      provider.search(claim),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup did not honor the request timeout.")), 1_000);
      }),
    ]);
    assert.equal(requestCalled, false);
    assert.equal(result[0]?.provenance?.kind, "search-snippet");
  } finally {
    if (timer) clearTimeout(timer);
  }
});

test("DNS resolution pins the selected public address for the document request", async () => {
  let lookupCalled = false;
  let requestedAddress: string | undefined;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Pinned DNS target",
        url: "http://public.example.test/mars",
        snippet: "fallback",
        sourceType: "unknown",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    lookupImpl: async () => {
      lookupCalled = true;
      return [{ address: "93.184.216.34", family: 4 }];
    },
    requestImpl: async (_url: URL, options) => {
      requestedAddress = options.address;
      return new Response("Mars is known as the Red Planet.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  const result = await provider.search(claim);
  assert.equal(lookupCalled, true);
  assert.equal(requestedAddress, "93.184.216.34");
  assert.equal(result[0]?.provenance?.kind, "retrieved-document");
});

test("DNS resolution pins a public IPv6 address with its address family", async () => {
  let requestedAddress: string | undefined;
  let requestedFamily: 4 | 6 | undefined;
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Pinned IPv6 DNS target",
        url: "http://public.example.test/mars",
        snippet: "fallback",
        sourceType: "unknown",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    lookupImpl: async () => [{ address: "2001:4860:4860::8888", family: 6 }],
    requestImpl: async (_url: URL, options) => {
      requestedAddress = options.address;
      requestedFamily = options.family;
      return new Response("Mars is known as the Red Planet.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  const result = await provider.search(claim);
  assert.equal(requestedAddress, "2001:4860:4860::8888");
  assert.equal(requestedFamily, 6);
  assert.equal(result[0]?.provenance?.kind, "retrieved-document");
});

test("PDF provenance records the matching page and page-local quote offsets", async () => {
  const options = {
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Mars PDF",
        url: "https://example.test/mars.pdf",
        snippet: "Search snippet",
        sourceType: "primary",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    fetchImpl: (async () => new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    })) as typeof fetch,
    pdfParser: async () => [
      { page: 1, text: "Introduction to Mars." },
      { page: 2, text: "Mars is known as the Red Planet." },
    ],
  };
  const provider = new ProvenanceEvidenceProvider(
    options as ConstructorParameters<typeof ProvenanceEvidenceProvider>[0],
  );

  const result = await provider.search(claim);
  const provenance = result[0]?.provenance as (typeof result[0]["provenance"] & { page?: number });
  assert.equal(provenance?.kind, "retrieved-document");
  assert.equal(provenance?.page, 2);
  assert.equal(provenance?.quoteStart, 0);
  assert.equal(provenance?.quoteEnd, "Mars is known as the Red Planet.".length);
});

test("PDF parser extracts text from a PDF page", async () => {
  const pages = await extractPdfPages(makePdf("Mars is known as the Red Planet."));
  assert.equal(pages.length, 1);
  assert.match(pages[0]?.text ?? "", /Mars is known as the Red Planet/);
});

test("PDF parsing failures fall back to search-snippet provenance", async () => {
  const provider = new ProvenanceEvidenceProvider({
    provider: new StaticEvidenceProvider(() => [
      {
        id: "e1",
        claimId: "claim_1",
        title: "Unreadable PDF",
        url: "https://example.test/unreadable.pdf",
        snippet: "fallback",
        sourceType: "unknown",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      },
    ]),
    fetchImpl: (async () => new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    })) as typeof fetch,
    pdfParser: async () => {
      throw new Error("invalid PDF");
    },
  });

  const result = await provider.search(claim);
  assert.equal(result[0]?.provenance?.kind, "search-snippet");
});

function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = new TextEncoder().encode(document).byteLength;
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = new TextEncoder().encode(document).byteLength;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`).join("");
  document += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(document);
}
