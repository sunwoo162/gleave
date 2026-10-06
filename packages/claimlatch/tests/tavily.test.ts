import assert from "node:assert/strict";
import test from "node:test";
import { TavilyEvidenceProvider } from "../src/providers/tavily.js";

const claim = { id: "claim_1", text: "Mars is known as the Red Planet.", kind: "fact" as const, importance: "normal" as const };

test("official domain policy scopes Tavily search and filters returned evidence", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new TavilyEvidenceProvider({
    apiKey: "test-key",
    domainPolicy: { officialDomains: ["nasa.gov"] },
    fetchImpl: (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        results: [
          { title: "NASA", url: "https://science.nasa.gov/mars", content: "Mars is known as the Red Planet." },
          { title: "Unapproved", url: "https://example.com/mars", content: "Unapproved source." },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });

  const results = await provider.search(claim);
  assert.deepEqual(requestBody?.include_domains, ["nasa.gov"]);
  assert.deepEqual(results.map((item) => item.url), ["https://science.nasa.gov/mars"]);
  assert.equal(results[0]?.sourceType, "primary");
});

test("official domain resolver receives the claim and scopes each search", async () => {
  let resolvedText: string | undefined;
  let requestBody: Record<string, unknown> | undefined;
  const provider = new TavilyEvidenceProvider({
    apiKey: "test-key",
    domainPolicy: {
      resolveOfficialDomains: (input) => {
        resolvedText = input.text;
        return ["who.int"];
      },
    },
    fetchImpl: (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        results: [{ title: "WHO", url: "https://www.who.int/mars", content: "Mars is known as the Red Planet." }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });

  const results = await provider.search(claim);
  assert.equal(resolvedText, claim.text);
  assert.deepEqual(requestBody?.include_domains, ["who.int"]);
  assert.equal(results[0]?.sourceType, "primary");
});

test("empty official resolver output fails closed without calling Tavily", async () => {
  let called = false;
  const provider = new TavilyEvidenceProvider({
    apiKey: "test-key",
    domainPolicy: { resolveOfficialDomains: () => [] },
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  assert.deepEqual(await provider.search(claim), []);
  assert.equal(called, false);
});

test("official resolver errors fail closed without calling Tavily", async () => {
  let called = false;
  const provider = new TavilyEvidenceProvider({
    apiKey: "test-key",
    domainPolicy: { resolveOfficialDomains: () => { throw new Error("resolver unavailable"); } },
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
  });

  assert.deepEqual(await provider.search(claim), []);
  assert.equal(called, false);
});

test("invalid official domain policy is rejected at provider construction", () => {
  assert.throws(() => new TavilyEvidenceProvider({
    apiKey: "test-key",
    domainPolicy: { officialDomains: ["https://nasa.gov"] },
  }), /domain must be a hostname/);
});
