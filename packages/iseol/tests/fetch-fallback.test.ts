import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAllconCurlArgs,
  fetchAllconWithValidatedRedirects,
  getAllconRedirectMode,
  isAllconUrl,
  parseAllconCurlOutput,
  resolveAllconRedirect,
} from "../src/services/fetch-fallback.js";

test("Allcon fallback accepts only HTTPS canonical hosts", () => {
  assert.equal(isAllconUrl("https://all-con.co.kr/list/contest"), true);
  assert.equal(isAllconUrl("https://www.all-con.co.kr/list/contest"), true);

  for (const value of [
    null,
    "http://www.all-con.co.kr/list/contest",
    "https://api.all-con.co.kr/list/contest",
    "https://www.all-con.co.kr.attacker.example/list/contest",
    "https://www.all-con.co.kr@attacker.example/list/contest",
    "https://www.all-con.co.kr:444/list/contest",
    "https://www.all-con.co.kr\\@attacker.example/list/contest",
    "not-a-url",
  ]) {
    assert.equal(isAllconUrl(value), false, value ?? "null");
  }
});

test("Allcon curl fallback never follows an unvalidated redirect", () => {
  const args = buildAllconCurlArgs("https://www.all-con.co.kr/list/contest", {
    headers: { "X-Test": "yes" },
  });

  assert.equal(args.includes("--location"), false);
  assert.deepEqual(args.slice(args.indexOf("--max-redirs"), args.indexOf("--max-redirs") + 2), ["--max-redirs", "0"]);
  assert.equal(args.at(-1), "https://www.all-con.co.kr/list/contest");
  assert.equal(args.includes("--insecure"), true);
  assert.equal(args.includes("x-test: yes"), true);
  assert.equal(args.some((value) => value.includes("%{http_code}") && value.includes("%{redirect_url}")), true);
});

test("Allcon curl fallback rejects a URL outside its allowlist before spawning curl", () => {
  assert.throws(
    () => buildAllconCurlArgs("https://attacker.example/redirect"),
    /Allcon fallback URL is not allowed/,
  );
});

test("Allcon redirect targets stay within the HTTPS canonical host allowlist", () => {
  const currentUrl = "https://www.all-con.co.kr/list/contest";
  assert.equal(
    resolveAllconRedirect(currentUrl, new Response(null, { status: 302, headers: { location: "/next" } })),
    "https://www.all-con.co.kr/next",
  );
  assert.equal(resolveAllconRedirect(currentUrl, new Response(null, { status: 200 })), null);
  assert.throws(
    () => resolveAllconRedirect(currentUrl, new Response(null, { status: 302, headers: { location: "https://attacker.example/" } })),
    /Allcon redirect target is not allowed/,
  );
  assert.throws(
    () => resolveAllconRedirect(currentUrl, new Response(null, { status: 302, headers: { location: "https://all-con.co.kr/next" } })),
    /Allcon redirect target is not allowed/,
  );
});

test("native Allcon redirect handling validates every hop before fetching it", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response(null, { status: 302, headers: { location: "https://attacker.example/" } });
  };

  await assert.rejects(
    () => fetchAllconWithValidatedRedirects("https://www.all-con.co.kr/start", undefined, fetcher),
    /Allcon redirect target is not allowed/,
  );
  assert.deepEqual(calls, ["https://www.all-con.co.kr/start"]);
});

test("native Allcon redirects preserve Fetch method rules", async () => {
  const run = async (status: number, method: string, body: string | undefined) => {
    const requests: Array<{ method?: string; body?: BodyInit | null }> = [];
    let call = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      requests.push({ method: init?.method, body: init?.body });
      call += 1;
      return call === 1
        ? new Response(null, { status, headers: { location: "/next" } })
        : new Response("ok", { status: 200 });
    };
    await fetchAllconWithValidatedRedirects("https://www.all-con.co.kr/start", { method, body }, fetcher);
    return requests;
  };

  assert.deepEqual((await run(302, "PUT", undefined)).map((request) => request.method), ["PUT", "PUT"]);
  assert.deepEqual((await run(302, "POST", "payload")).map((request) => request.method), ["POST", "GET"]);
  assert.deepEqual((await run(303, "DELETE", "payload")).map((request) => request.method), ["DELETE", "GET"]);
  assert.deepEqual((await run(307, "PUT", undefined)).map((request) => request.method), ["PUT", "PUT"]);
});

test("Allcon curl output preserves status and uses null bodies for no-body statuses", () => {
  assert.deepEqual(parseAllconCurlOutput("html\n__ISEOL_CURL_STATUS__200\t"), { body: "html", location: null, status: 200 });
  assert.deepEqual(
    parseAllconCurlOutput("ignored\n__ISEOL_CURL_STATUS__302\thttps://www.all-con.co.kr/next"),
    { body: "ignored", location: "https://www.all-con.co.kr/next", status: 302 },
  );
  for (const status of [204, 205, 304]) {
    assert.deepEqual(parseAllconCurlOutput(`ignored\n__ISEOL_CURL_STATUS__${status}\t`), { body: null, location: null, status });
  }
  assert.throws(() => parseAllconCurlOutput("body\n__ISEOL_CURL_STATUS__100"), /status is invalid/);
});

test("Allcon curl fallback fails closed for non-GET requests with bodies", () => {
  assert.throws(
    () => buildAllconCurlArgs("https://www.all-con.co.kr/list/contest", { method: "POST", body: "payload" }),
    /supports only GET requests without a body/,
  );
});

test("Allcon redirect mode preserves Request semantics when init is omitted", () => {
  const source = "https://www.all-con.co.kr/list/contest";
  assert.equal(getAllconRedirectMode(new Request(source, { redirect: "error" })), "error");
  assert.equal(getAllconRedirectMode(new Request(source, { redirect: "manual" })), "manual");
  assert.equal(getAllconRedirectMode(new Request(source, { redirect: "error" }), { redirect: "follow" }), "follow");
});
