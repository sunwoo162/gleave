import assert from "node:assert/strict";
import test from "node:test";
import { GleaveMobileClient, MemoryTokenStore } from "../src/client.js";

test("mobile client pairs, stores the Desktop token, and resumes event cursors", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    if (request.url.endsWith("/api/mobile/pair")) {
      return new Response(JSON.stringify({ deviceId: "mobile-1", deviceName: "Phone", accessToken: "token-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ cursor: 3, events: [{ cursor: 3, kind: "project.completed", payload: {}, createdAt: "2026-10-06T00:00:00Z" }] }), { status: 200 });
  };

  try {
    const store = new MemoryTokenStore();
    const client = new GleaveMobileClient("http://desktop.local/", store);
    await client.pair("123456", "Phone");
    const batch = await client.events(2);

    assert.equal(store.get(), "token-1");
    assert.equal(batch.events[0]?.cursor, 3);
    assert.equal(calls[1]?.headers.get("X-Gleave-Bridge-Token"), "token-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
