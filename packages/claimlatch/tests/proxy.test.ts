import assert from "node:assert/strict";
import test from "node:test";
import { ClaimLatch } from "../src/gate.js";
import { createOpenAIProxy } from "../src/proxy.js";
import { resolveProxyProviderConfiguration } from "../src/proxy-cli-options.js";
import { PROXY_PROVIDER_PROFILE_NAMES } from "../src/proxy-profiles.js";
import type { ClaimExtractor, ClaimVerifier, EvidenceProvider } from "../src/types.js";
import type { OpenAIProxyOptions } from "../src/proxy.js";
import type { ProxyProviderProfileName } from "../src/proxy-profiles.js";

const HOSTED_PROFILE_BASE_URLS: Record<Exclude<ProxyProviderProfileName, "aphrodite" | "azure" | "cerebrium" | "cloudflare" | "databricks" | "fastchat" | "foundry" | "jan" | "koboldcpp" | "litellm" | "llamacpp" | "lmdeploy" | "lmstudio" | "localai" | "mlc" | "mlx" | "modal" | "ollama" | "openllm" | "openrouter" | "sglang" | "tgi" | "tensorrtllm" | "textgen" | "vllm" | "xinference">, string> = {
  ai21: "https://api.ai21.com/studio/v1",
  aimlapi: "https://api.aimlapi.com",
  baichuan: "https://api.baichuan-ai.com/v1",
  baseten: "https://inference.baseten.co/v1",
  cerebras: "https://api.cerebras.ai/v1",
  chutes: "https://llm.chutes.ai/v1",
  clarifai: "https://api.clarifai.com/v2/ext/openai/v1",
  cohere: "https://api.cohere.ai/compatibility/v1",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepinfra: "https://api.deepinfra.com/v1",
  deepseek: "https://api.deepseek.com",
  featherless: "https://api.featherless.ai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  friendli: "https://api.friendli.ai/serverless/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  huggingface: "https://router.huggingface.co/v1",
  hyperbolic: "https://api.hyperbolic.xyz/v1",
  inferencenet: "https://api.inference.net/v1",
  ionos: "https://openai.inference.de-txl.ionos.com/v1",
  lamini: "https://api.lamini.ai/inf",
  hunyuan: "https://api.hunyuan.cloud.tencent.com/v1",
  minimax: "https://api.minimax.io/v1",
  mimo: "https://api.xiaomimimo.com/v1",
  mistral: "https://api.mistral.ai/v1",
  moonshot: "https://api.moonshot.ai/v1",
  nebius: "https://api.tokenfactory.nebius.com/v1",
  nscale: "https://inference.api.nscale.com/v1",
  novita: "https://api.novita.ai/openai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  openai: "https://api.openai.com/v1",
  ovhcloud: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
  perplexity: "https://api.perplexity.ai/router/v1",
  poe: "https://api.poe.com/v1",
  qianfan: "https://qianfan.baidubce.com/v2",
  requesty: "https://router.requesty.ai/v1",
  sambanova: "https://api.sambanova.ai/v1",
  scaleway: "https://api.scaleway.ai/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  stepfun: "https://api.stepfun.ai/v1",
  together: "https://api.together.xyz/v1",
  tokenhub: "https://tokenhub.tencentmaas.com/v1",
  upstage: "https://api.upstage.ai/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  xai: "https://api.x.ai/v1",
  zai: "https://api.z.ai/api/paas/v4",
} as const;

function fixtureGate(): ClaimLatch {
  const extractor: ClaimExtractor = {
    async extract({ answer }) {
      return [{ id: "claim_1", text: answer, kind: "fact", importance: "critical" }];
    },
  };
  const evidenceProvider: EvidenceProvider = {
    async search(claim) {
      return [{
        id: "e1",
        claimId: claim.id,
        title: "fixture",
        url: "https://example.test/source",
        snippet: "fixture",
        sourceType: "primary",
        retrievedAt: "2026-09-28T00:00:00.000Z",
        provider: "fixture",
      }];
    },
  };
  const verifier: ClaimVerifier = {
    async verify({ claim, evidence }) {
      const status = claim.text.includes("wrong") ? "CONTRADICTED" as const : "SUPPORTED" as const;
      return { claim, status, reason: "fixture", evidenceIds: ["e1"], evidence };
    },
  };
  return new ClaimLatch({ extractor, evidenceProvider, verifier });
}

function upstreamFetchPayload(payload: unknown, headers: HeadersInit = { "content-type": "application/json" }): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers,
  })) as typeof fetch;
}

function upstreamFetch(answer: string): typeof fetch {
  return upstreamFetchPayload({
    id: "chatcmpl_test",
    object: "chat.completion",
    choices: [{ message: { role: "assistant", content: answer }, finish_reason: "stop", index: 0 }],
  });
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function upstreamFetchSse(frames: string[]): typeof fetch {
  return (async () => new Response(frames.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })) as typeof fetch;
}

async function withProxyOptions(
  options: OpenAIProxyOptions,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const proxy = createOpenAIProxy(options);
  await proxy.listen(0, "127.0.0.1");
  const address = proxy.server.address();
  if (!address || typeof address === "string") throw new Error("missing proxy address");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await proxy.close();
  }
}

async function withProxyPayload(
  payload: unknown,
  run: (url: string) => Promise<void>,
  responseHeaders?: HeadersInit,
): Promise<void> {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetchPayload(payload, responseHeaders),
  }, run);
}

async function withProxy(answer: string, run: (url: string) => Promise<void>): Promise<void> {
  const proxy = createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetch(answer),
  });
  await proxy.listen(0, "127.0.0.1");
  const address = proxy.server.address();
  if (!address || typeof address === "string") throw new Error("missing proxy address");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await proxy.close();
  }
}

test("proxy releases an upstream completion only after the gate passes", async () => {
  await withProxy("This is supported.", async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-claimlatch-result"), "pass");
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    assert.equal(body.choices?.[0]?.message?.content, "This is supported.");
  });
});

test("proxy blocks a contradicted completion with a structured 422", async () => {
  await withProxy("This answer is wrong.", async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "x", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 422);
    assert.equal(response.headers.get("x-claimlatch-result"), "blocked");
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_blocked");
  });
});

test("proxy forwards OpenAI-compatible model listing without invoking the gate", async () => {
  let capturedUrl: string | undefined;
  let capturedMethod: string | undefined;
  let capturedAuthorization: string | null | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method;
      capturedAuthorization = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ object: "list", data: [{ id: "fixture-model", object: "model" }] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "openai-processing-ms": "4",
        },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`, {
      headers: { authorization: "Bearer client-key" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(response.headers.get("openai-processing-ms"), "4");
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "fixture-model", object: "model" }],
    });
    assert.equal(capturedUrl, "https://upstream.example/v1/models?limit=1");
    assert.equal(capturedMethod, "GET");
    assert.equal(capturedAuthorization, "Bearer client-key");
  });
});

test("proxy applies provider-specific model path and authentication settings", async () => {
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example",
    upstreamApiKey: "provider-key",
    upstreamApiKeyHeader: "x-api-key",
    upstreamModelsPath: "/v1/models?scope=active",
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/models?limit=1`, {
      headers: { authorization: "Bearer client-key" },
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://upstream.example/v1/models?scope=active&limit=1");
  assert.equal(capturedHeaders?.get("x-api-key"), "provider-key");
  assert.equal(capturedHeaders?.get("authorization"), null);
});

test("proxy forwards encoded model retrieval requests through the configured model path", async () => {
  let capturedUrl: string | undefined;
  let capturedMethod: string | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example",
    upstreamModelsPath: "/v1/models?scope=active",
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method;
      return new Response(JSON.stringify({ id: "org/model", object: "model" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/org%2Fmodel?verbose=true`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "org/model", object: "model" });
  });

  assert.equal(capturedUrl, "https://upstream.example/v1/models/org%2Fmodel?scope=active&verbose=true");
  assert.equal(capturedMethod, "GET");
});

test("proxy does not treat model path traversal as a model retrieval route", async () => {
  let fetchCalls = 0;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: (async () => {
      fetchCalls += 1;
      return new Response("unexpected", { status: 200 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/%2E%2E`);
    assert.equal(response.status, 404);
  });
  assert.equal(fetchCalls, 0);
});

test("proxy fails closed when the upstream model listing exceeds the response limit", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    maxBufferedResponseBytes: 1_024,
    fetchImpl: (async () => new Response(`{"data":"${"x".repeat(2_000)}"}`, {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_invalid_upstream_models_response");
  });
});

test("proxy replays a buffered stream only after every choice passes", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_stream",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { role: "assistant", content: "This is " } }],
      }),
      sseData({
        id: "chatcmpl_stream",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "supported." }, finish_reason: "stop" }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(response.headers.get("x-claimlatch-result"), "pass");
    const body = await response.text();
    assert.match(body, /This is /);
    assert.match(body, /supported\./);
    assert.match(body, /data: \[DONE\]/);
  });
});

test("proxy blocks a buffered stream without releasing any SSE frame", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_blocked_stream",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { role: "assistant", content: "This is wrong." } }],
      }),
      sseData({
        id: "chatcmpl_blocked_stream",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 422);
    assert.equal(response.headers.get("x-claimlatch-result"), "blocked");
    assert.ok(response.headers.get("content-type") !== "text/event-stream");
    const body = await response.text();
    assert.ok(!/data: /u.test(body));
  });
});

test("proxy fails closed for a truncated or malformed upstream stream", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_truncated_stream",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { role: "assistant", content: "partial" } }],
      }),
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_invalid_upstream_stream");
  });
});

test("proxy verifies every buffered streaming choice", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_multi_stream",
        object: "chat.completion.chunk",
        choices: [
          { index: 0, delta: { role: "assistant", content: "First supported." } },
          { index: 1, delta: { role: "assistant", content: "Second supported." } },
        ],
      }),
      sseData({
        id: "chatcmpl_multi_stream",
        object: "chat.completion.chunk",
        choices: [
          { index: 0, delta: {}, finish_reason: "stop" },
          { index: 1, delta: {}, finish_reason: "stop" },
        ],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, n: 2, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-claimlatch-claims"), "2");
  });
});

test("proxy releases a streaming tool call only through an explicit verifier", async () => {
  let verifierCalled = false;
  let verifiedChoice: unknown;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    structuredOutputVerifier: {
      async verify({ question, choice, stream }) {
        verifierCalled = true;
        verifiedChoice = choice;
        assert.equal(question, "question");
        assert.equal(stream, true);
        return fixtureGate().verify({ question, answer: "The tool call is verified." });
      },
    },
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_stream_tool_call",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [{
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "lookup", arguments: "" },
            }],
          },
        }],
      }),
      sseData({
        id: "chatcmpl_stream_tool_call",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"city":"Seoul"}' } }],
          },
          finish_reason: "tool_calls",
        }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-claimlatch-result"), "pass");
    const body = await response.text();
    assert.match(body, /tool_calls/);
    assert.match(body, /Seoul/);
  });

  assert.equal(verifierCalled, true);
  const message = (verifiedChoice as { message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }).message;
  assert.equal(message?.tool_calls?.[0]?.function?.arguments, '{"city":"Seoul"}');
});

test("proxy fails closed for a streaming structured output without a verifier", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_stream_unverified_tool_call",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup" } }],
          },
        }],
      }),
      sseData({
        id: "chatcmpl_stream_unverified_tool_call",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.ok(!body.includes("chatcmpl_stream_unverified_tool_call"));
    assert.match(body, /claimlatch_missing_assistant_text/);
  });
});

test("proxy releases streaming multimodal content only through an explicit verifier", async () => {
  let verifiedChoice: unknown;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    structuredOutputVerifier: {
      async verify({ choice, stream }) {
        assert.equal(stream, true);
        verifiedChoice = choice;
        return fixtureGate().verify({ question: "question", answer: "The multimodal output is verified." });
      },
    },
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_stream_multimodal",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            content: [{ type: "text", text: "A chart" }],
          },
        }],
      }),
      sseData({
        id: "chatcmpl_stream_multimodal",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: {
            content: [{ type: "image_url", image_url: { url: "https://example.test/chart.png" } }],
          },
          finish_reason: "stop",
        }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /image_url/);
  });

  const message = (verifiedChoice as { message?: { content?: unknown[] } }).message;
  assert.deepEqual(message?.content, [
    { type: "text", text: "A chart" },
    { type: "image_url", image_url: { url: "https://example.test/chart.png" } },
  ]);
});

test("proxy fails closed when a streaming structured verifier throws", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    structuredOutputVerifier: {
      async verify() {
        throw new Error("streaming structured verifier unavailable");
      },
    },
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_stream_structured_error",
        object: "chat.completion.chunk",
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup" } }],
          },
          finish_reason: "tool_calls",
        }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_structured_output_verifier_error");
  });
});

test("proxy fails closed when a buffered stream exceeds its size limit", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    maxBufferedResponseBytes: 1_024,
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_large_stream",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { role: "assistant", content: "x".repeat(2_000) } }],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_invalid_upstream_stream");
  });
});

test("proxy fails closed when a buffered stream exceeds its choice limit", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    maxBufferedChoices: 1,
    fetchImpl: upstreamFetchSse([
      sseData({
        id: "chatcmpl_choice_limit",
        object: "chat.completion.chunk",
        choices: [
          { index: 0, delta: { role: "assistant", content: "First supported." } },
          { index: 1, delta: { role: "assistant", content: "Second supported." } },
        ],
      }),
      "data: [DONE]\n\n",
    ]),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, n: 2, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_invalid_upstream_stream");
  });
});

test("proxy aborts an upstream request that exceeds its configured timeout", async () => {
  let upstreamSignal: AbortSignal | undefined;
  let upstreamAbortReason: string | undefined;
  const upstreamFetchWithTimeout = (async (_input, init) => {
    upstreamSignal = init?.signal ?? undefined;
    init?.signal?.addEventListener("abort", () => {
      const reason = init?.signal?.reason as { name?: unknown } | undefined;
      upstreamAbortReason = typeof reason?.name === "string" ? reason.name : undefined;
    }, { once: true });
    await new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      }, { once: true });
    });
    throw new Error("unreachable");
  }) as typeof fetch;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamTimeoutMs: 20,
    fetchImpl: upstreamFetchWithTimeout,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 504);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_upstream_timeout");
    assert.equal(upstreamSignal?.aborted, true);
    assert.equal(upstreamAbortReason, "TimeoutError");
  });
});

test("proxy fails closed when an upstream transport ignores an expired signal", async () => {
  const slowIgnoringFetch = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response(JSON.stringify({
      id: "chatcmpl_late",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "This is late." } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamTimeoutMs: 20,
    fetchImpl: slowIgnoringFetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 504);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_upstream_timeout");
  });
});

test("proxy aborts upstream buffering when the client disconnects", async () => {
  let upstreamStarted = false;
  let upstreamAborted = false;
  let upstreamAbortReason: string | undefined;
  const upstreamFetchWithHangingStream = (async (_input, init) => {
    upstreamStarted = true;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseData({
          id: "chatcmpl_disconnect",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { role: "assistant", content: "partial" } }],
        })));
        init?.signal?.addEventListener("abort", () => {
          upstreamAborted = true;
          const reason = init?.signal?.reason as { name?: unknown } | undefined;
          upstreamAbortReason = typeof reason?.name === "string" ? reason.name : undefined;
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      },
      pull() {},
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamTimeoutMs: 250,
    fetchImpl: upstreamFetchWithHangingStream,
  }, async (url) => {
    const clientController = new AbortController();
    const responsePromise = fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "question" }] }),
      signal: clientController.signal,
    });

    for (let attempt = 0; attempt < 100 && !upstreamStarted; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(upstreamStarted, true);
    const clientAbortStartedAt = Date.now();
    clientController.abort();
    await assert.rejects(responsePromise);

    for (let attempt = 0; attempt < 100 && !upstreamAborted; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(upstreamAborted, true);
    assert.equal(upstreamAbortReason, "AbortError");
    assert.ok(Date.now() - clientAbortStartedAt < 1_000);
  });
});

test("proxy verifies and releases every textual choice", async () => {
  await withProxyPayload({
    id: "chatcmpl_multi",
    object: "chat.completion",
    choices: [
      { message: { role: "assistant", content: "First supported answer." }, finish_reason: "stop", index: 0 },
      { message: { role: "assistant", content: [{ type: "text", text: "Second supported answer." }] }, finish_reason: "stop", index: 1 },
    ],
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 2, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-claimlatch-result"), "pass");
    assert.equal(response.headers.get("x-claimlatch-claims"), "2");
    const body = await response.json() as { choices?: unknown[] };
    assert.equal(body.choices?.length, 2);
  });
});

test("proxy blocks the whole completion when any textual choice is contradicted", async () => {
  await withProxyPayload({
    id: "chatcmpl_multi",
    object: "chat.completion",
    choices: [
      { message: { role: "assistant", content: "First supported answer." }, finish_reason: "stop", index: 0 },
      { message: { role: "assistant", content: "Second wrong answer." }, finish_reason: "stop", index: 1 },
    ],
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 2, messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 422);
    assert.equal(response.headers.get("x-claimlatch-result"), "blocked");
    const body = await response.json() as { claimlatchReports?: unknown[] };
    assert.equal(body.claimlatchReports?.length, 2);
  });
});

test("proxy fails closed when an upstream choice is malformed", async () => {
  await withProxyPayload({
    id: "chatcmpl_malformed",
    object: "chat.completion",
    choices: [null],
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_missing_assistant_text");
  });
});

test("proxy fails closed when a non-streaming assistant output mixes text and multimodal parts", async () => {
  await withProxyPayload({
    id: "chatcmpl_mixed_multimodal",
    object: "chat.completion",
    choices: [{
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "This answer is supported." },
          { type: "image_url", image_url: { url: "https://example.test/image.png" } },
        ],
      },
    }],
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_missing_assistant_text");
  });
});

test("proxy fails closed when a non-streaming assistant output includes tool calls", async () => {
  await withProxyPayload({
    id: "chatcmpl_tool_call",
    object: "chat.completion",
    choices: [{
      message: {
        role: "assistant",
        content: "This answer is supported.",
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: "lookup", arguments: "{}" },
        }],
      },
    }],
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_missing_assistant_text");
  });
});

test("proxy releases a structured output only through an explicit verifier", async () => {
  let verifierCalled = false;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    structuredOutputVerifier: {
      async verify({ question, choice, stream }) {
        verifierCalled = true;
        assert.equal(question, "question");
        assert.equal(stream, false);
        const message = (choice as { message?: { tool_calls?: unknown[] } }).message;
        assert.equal(message?.tool_calls?.length, 1);
        return fixtureGate().verify({ question, answer: "The structured tool call is verified." });
      },
    },
    fetchImpl: upstreamFetchPayload({
      id: "chatcmpl_verified_tool_call",
      object: "chat.completion",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "lookup", arguments: "{}" },
          }],
        },
      }],
    }),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-claimlatch-result"), "pass");
  });
  assert.equal(verifierCalled, true);
});

test("proxy fails closed when the structured output verifier throws", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    structuredOutputVerifier: {
      async verify() {
        throw new Error("structured verifier unavailable");
      },
    },
    fetchImpl: upstreamFetchPayload({
      id: "chatcmpl_structured_error",
      object: "chat.completion",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }],
        },
      }],
    }),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 502);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "claimlatch_structured_output_verifier_error");
  });
});

test("proxy forwards compatible request headers and configured authentication", async () => {
  let capturedHeaders: Headers | undefined;
  await withProxyOptions({
      gate: fixtureGate(),
      upstreamBaseUrl: "https://upstream.example/v1",
      upstreamApiKey: "server-key",
      fetchImpl: (async (_input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({
          id: "chatcmpl_headers",
          object: "chat.completion",
          choices: [{ message: { role: "assistant", content: "Header-compatible answer." } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    }, async (url) => {
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer client-key",
          accept: "application/json",
          "openai-organization": "org_test",
          "openai-project": "proj_test",
          "x-request-id": "request_test",
          connection: "keep-alive",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
      });
      assert.equal(response.status, 200);
  });

  assert.equal(capturedHeaders?.get("authorization"), "Bearer server-key");
  assert.equal(capturedHeaders?.get("accept"), "application/json");
  assert.equal(capturedHeaders?.get("openai-organization"), "org_test");
  assert.equal(capturedHeaders?.get("openai-project"), "proj_test");
  assert.equal(capturedHeaders?.get("x-request-id"), "request_test");
  assert.equal(capturedHeaders?.get("connection"), null);
});

test("proxy injects configured upstream request headers with server precedence", async () => {
  let capturedHeaders: Headers | undefined;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamRequestHeaders: {
      "x-provider-tenant": "server-tenant",
      "x-provider-version": "2026-09",
    },
    fetchImpl: (async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_static_headers",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Static header-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-provider-tenant": "client-tenant",
        "x-provider-version": "client-version",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedHeaders?.get("x-provider-tenant"), "server-tenant");
  assert.equal(capturedHeaders?.get("x-provider-version"), "2026-09");
});

test("proxy supports provider-specific upstream API key headers", async () => {
  let capturedHeaders: Headers | undefined;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamApiKey: "provider-key",
    upstreamApiKeyHeader: "api-key",
    fetchImpl: (async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_provider_auth",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Provider-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer client-key",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedHeaders?.get("api-key"), "provider-key");
  assert.equal(capturedHeaders?.get("authorization"), null);
});

test("proxy supports a configurable upstream API key prefix", async () => {
  let capturedHeaders: Headers | undefined;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamApiKey: "provider-key",
    upstreamApiKeyPrefix: "Api-Key",
    fetchImpl: (async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_provider_auth_prefix",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Provider-prefix-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedHeaders?.get("authorization"), "Api-Key provider-key");
});

test("proxy forwards OpenRouter attribution headers to the upstream request", async () => {
  let capturedHeaders: Headers | undefined;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://openrouter.ai/api/v1",
    upstreamApiKey: "openrouter-key",
    upstreamRequestHeaders: {
      "HTTP-Referer": "https://claimlatch.example",
      "X-Title": "ClaimLatch",
    },
    fetchImpl: (async (_input, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_openrouter_attribution",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "OpenRouter-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedHeaders?.get("http-referer"), "https://claimlatch.example");
  assert.equal(capturedHeaders?.get("x-title"), "ClaimLatch");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer openrouter-key");
});

test("proxy supports provider-specific upstream chat completions paths and query parameters", async () => {
  let capturedUrl: string | undefined;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://resource.example",
    upstreamChatCompletionsPath: "/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21",
    fetchImpl: (async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({
        id: "chatcmpl_provider_path",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Path-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(
    capturedUrl,
    "https://resource.example/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21",
  );
});

test("Azure provider profile sends its deployment path and api-key header", async () => {
  const env = {
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "azure",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://claimlatch-resource.openai.azure.com",
  };
  const profile = resolveProxyProviderConfiguration(env);
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;
  let capturedBody: string | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "azure-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      capturedBody = typeof init?.body === "string" ? init.body : undefined;
      return new Response(JSON.stringify({
        id: "chatcmpl_azure_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Azure-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(
    capturedUrl,
    "https://claimlatch-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21",
  );
  assert.equal(capturedHeaders?.get("api-key"), "azure-key");
  assert.equal(capturedHeaders?.get("authorization"), null);
  assert.equal(JSON.parse(capturedBody ?? "{}").model, "gpt-4o-mini");
});

test("Azure provider profile sends its model-list path and api-key header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "azure",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://claimlatch-resource.openai.azure.com",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "azure-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "gpt-4o-mini", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "gpt-4o-mini", object: "model" }],
    });
  });

  assert.equal(
    capturedUrl,
    "https://claimlatch-resource.openai.azure.com/openai/models?api-version=2024-10-21&limit=1",
  );
  assert.equal(capturedHeaders?.get("api-key"), "azure-key");
  assert.equal(capturedHeaders?.get("authorization"), null);
});

test("DashScope provider profile sends its model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "dashscope",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "dashscope-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "qwen-plus", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "qwen-plus", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer dashscope-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Hyperbolic provider profile fails closed for retired model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "hyperbolic",
  });
  const upstreamRequests: Array<{ url: string; headers: Headers }> = [];

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "hyperbolic-key",
    fetchImpl: (async (requestUrl, init) => {
      upstreamRequests.push({ url: String(requestUrl), headers: new Headers(init?.headers) });
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 404);
    assert.deepEqual(await modelsResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_route_unavailable",
        message: "The configured provider does not expose a model-list route.",
      },
    });

    const retrievalResponse = await fetch(`${url}/v1/models/Qwen%2FQwen3-235B-A22B`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_route_unavailable",
        message: "The configured provider does not expose a model-list route.",
      },
    });
  });

  assert.deepEqual(upstreamRequests, []);
});

test("Qianfan provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "qianfan",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "qianfan-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "ernie-5.0", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "ernie-5.0", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/ernie-5.0`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://qianfan.baidubce.com/v2/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer qianfan-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("TokenHub provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "tokenhub",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "tokenhub-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "hy4-preview", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "hy4-preview", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/hy4-preview`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://tokenhub.tencentmaas.com/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer tokenhub-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Novita provider profile sends its model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "novita",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "novita-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "openai/gpt-oss-120b", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "openai/gpt-oss-120b", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "https://api.novita.ai/openai/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer novita-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Novita provider profile forwards its documented model retrieval path", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "novita",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "novita-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ id: "openai/gpt-oss-120b", object: "model" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/openai%2Fgpt-oss-120b`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "openai/gpt-oss-120b", object: "model" });
  });

  assert.equal(capturedUrl, "https://api.novita.ai/openai/v1/models/openai%2Fgpt-oss-120b");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer novita-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Chutes provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "chutes",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "chutes-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "google/gemma-4-31B-turbo-TEE", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "google/gemma-4-31B-turbo-TEE", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/google%2Fgemma-4-31B-turbo-TEE`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://llm.chutes.ai/v1/models");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer chutes-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Poe provider profile sends its model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "poe",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "poe-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "Claude-Sonnet-4.6", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "Claude-Sonnet-4.6", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "https://api.poe.com/v1/models");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer poe-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Poe provider profile fails closed for undocumented model retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "poe",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "poe-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/Claude-Sonnet-4.6`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("Upstage provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "upstage",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "upstage-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_upstage_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Upstage-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "solar-pro4", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.upstage.ai/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer upstage-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Upstage provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "upstage",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "upstage-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/solar-pro4"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Requesty provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "requesty",
  });
  const upstreamRequests: Array<{ url: string; headers: Headers }> = [];

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "requesty-key",
    fetchImpl: (async (input, init) => {
      upstreamRequests.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ object: "list", data: [{ id: "openai/gpt-6-luna", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "openai/gpt-6-luna", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/openai%2Fgpt-6-luna`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(upstreamRequests.map(({ url }) => url), ["https://router.requesty.ai/v1/models"]);
  assert.equal(upstreamRequests[0]?.headers.get("authorization"), "Bearer requesty-key");
  assert.equal(upstreamRequests[0]?.headers.get("api-key"), null);
});

test("Featherless provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "featherless",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "featherless-key",
    fetchImpl: (async (input, init) => {
      const requestUrl = String(input);
      capturedUrls.push(requestUrl);
      capturedHeaders = new Headers(init?.headers);
      const body = requestUrl.endsWith("/models")
        ? { object: "list", data: [{ id: "Qwen/Qwen2.5-7B-Instruct", object: "model" }] }
        : { object: "model", id: "Qwen/Qwen2.5-7B-Instruct", data: [{ id: "Qwen/Qwen2.5-7B-Instruct", object: "model" }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "Qwen/Qwen2.5-7B-Instruct", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/Qwen%2FQwen2.5-7B-Instruct`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      object: "model",
      id: "Qwen/Qwen2.5-7B-Instruct",
      data: [{ id: "Qwen/Qwen2.5-7B-Instruct", object: "model" }],
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.featherless.ai/v1/models",
    "https://api.featherless.ai/v1/models/Qwen%2FQwen2.5-7B-Instruct",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer featherless-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("IONOS provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ionos",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ionos-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "openai/gpt-oss-120b", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "openai/gpt-oss-120b", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/openai%2Fgpt-oss-120b`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://openai.inference.de-txl.ionos.com/v1/models");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer ionos-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Inference.net provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "inferencenet",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "inferencenet-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "glm-5.2", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "glm-5.2", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/glm-5.2`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://api.inference.net/v1/models");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer inferencenet-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Scaleway provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "scaleway",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "scaleway-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "llama-3.3-70b-instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "llama-3.3-70b-instruct", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/llama-3.3-70b-instruct`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://api.scaleway.ai/v1/models");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer scaleway-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Lamini provider profile forwards model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "lamini",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "lamini-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "meta-llama/Llama-3.2-3B-Instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "meta-llama/Llama-3.2-3B-Instruct", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/meta-llama%2FLlama-3.2-3B-Instruct`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(capturedUrl, "https://api.lamini.ai/inf/models");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer lamini-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("AI/ML API provider profile sends its distinct completion and model-list paths and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "aimlapi",
  });
  const capturedRequests: Array<{ url: string; headers: Headers }> = [];

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "aimlapi-key",
    fetchImpl: (async (input, init) => {
      capturedRequests.push({ url: String(input), headers: new Headers(init?.headers) });
      if (String(input).endsWith("/models")) {
        return new Response(JSON.stringify([{ id: "openai/gpt-5-chat-latest", type: "chat-completion" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        id: "chatcmpl_aimlapi_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "AI/ML API-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), [{ id: "openai/gpt-5-chat-latest", type: "chat-completion" }]);

    const retrievalResponse = await fetch(`${url}/v1/models/openai%2Fgpt-5-chat-latest`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });

    const completionResponse = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5-chat-latest", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(completionResponse.status, 200);
  });

  assert.deepEqual(capturedRequests.map(({ url }) => url), [
    "https://api.aimlapi.com/models",
    "https://api.aimlapi.com/v1/chat/completions",
  ]);
  assert.equal(capturedRequests[0]?.headers.get("authorization"), "Bearer aimlapi-key");
  assert.equal(capturedRequests[1]?.headers.get("authorization"), "Bearer aimlapi-key");
  assert.equal(capturedRequests[0]?.headers.get("api-key"), null);
  assert.equal(capturedRequests[1]?.headers.get("api-key"), null);
});

test("Hyperbolic provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "hyperbolic",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "hyperbolic-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_hyperbolic_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Hyperbolic-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "Qwen/Qwen3-235B-A22B", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.hyperbolic.xyz/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer hyperbolic-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("StepFun provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "stepfun",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "stepfun-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_stepfun_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "StepFun-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "step-3.7-flash", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.stepfun.ai/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer stepfun-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("StepFun provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "stepfun",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "stepfun-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "step-5-preview", object: "model", owned_by: "stepai" }] }
        : { id: "step-5-preview", object: "model", owned_by: "stepai" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "step-5-preview", object: "model", owned_by: "stepai" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/step-5-preview`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "step-5-preview",
      object: "model",
      owned_by: "stepai",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.stepfun.ai/v1/models",
    "https://api.stepfun.ai/v1/models/step-5-preview",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer stepfun-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("AI21 provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ai21",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ai21-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_ai21_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "AI21-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "jamba-mini", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.ai21.com/studio/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer ai21-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("AI21 provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ai21",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ai21-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/jamba-1.6-mini"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("DeepInfra provider profile forwards documented model listing and fails closed for retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "deepinfra",
  });
  const upstreamRequests: Array<{ url: string; headers: Headers }> = [];

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "deepinfra-key",
    fetchImpl: (async (requestUrl, init) => {
      upstreamRequests.push({ url: String(requestUrl), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "deepseek-ai/DeepSeek-V4-Flash", object: "model", owned_by: "deepinfra" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "deepseek-ai/DeepSeek-V4-Flash", object: "model", owned_by: "deepinfra" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/deepseek-ai%2FDeepSeek-V4-Flash`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(upstreamRequests.map(({ url }) => url), ["https://api.deepinfra.com/v1/models"]);
  assert.equal(upstreamRequests[0]?.headers.get("authorization"), "Bearer deepinfra-key");
});

test("hosted Gemini provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "gemini",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "gemini-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_gemini_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Gemini-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gemini-2.5-flash", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer gemini-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Gemini provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "gemini",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "gemini-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "gemini-3.8-flash", object: "model", owned_by: "Google" }] }
        : { id: "gemini-3.8-flash", object: "model", owned_by: "Google" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "gemini-3.8-flash", object: "model", owned_by: "Google" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/gemini-3.8-flash`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "gemini-3.8-flash",
      object: "model",
      owned_by: "Google",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://generativelanguage.googleapis.com/v1beta/openai/models",
    "https://generativelanguage.googleapis.com/v1beta/openai/models/gemini-3.8-flash",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer gemini-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Hugging Face provider profile forwards documented model-list and multi-segment retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "huggingface",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "hf-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "deepseek-ai/DeepSeek-V4-Pro", object: "model", owned_by: "deepseek-ai" }] }
        : { id: "deepseek-ai/DeepSeek-V4-Pro", object: "model", owned_by: "deepseek-ai" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "deepseek-ai/DeepSeek-V4-Pro", object: "model", owned_by: "deepseek-ai" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/deepseek-ai/DeepSeek-V4-Pro`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "deepseek-ai/DeepSeek-V4-Pro",
      object: "model",
      owned_by: "deepseek-ai",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://router.huggingface.co/v1/models",
    "https://router.huggingface.co/v1/models/deepseek-ai/DeepSeek-V4-Pro",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer hf-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Hugging Face path-style model retrieval rejects dot-segment traversal", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "huggingface",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "hf-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/%2E%2E%2Fsecret-model`);
    assert.equal(response.status, 404);
  });

  assert.equal(upstreamCalled, false);
});

test("Groq provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "groq",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "groq-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "llama-3.1-8b-instant", object: "model" }] }
        : { id: "llama-3.1-8b-instant", object: "model", owned_by: "Meta" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "llama-3.1-8b-instant", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/llama-3.1-8b-instant?include=metadata`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "llama-3.1-8b-instant",
      object: "model",
      owned_by: "Meta",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.groq.com/openai/v1/models?limit=1",
    "https://api.groq.com/openai/v1/models/llama-3.1-8b-instant?include=metadata",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer groq-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Cerebras provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "cerebras",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "cerebras-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "gpt-oss-120b", object: "model", created: 0, owned_by: "Cerebras" }] }
        : { id: "gpt-oss-120b", object: "model", created: 1721692800, owned_by: "Cerebras" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "gpt-oss-120b", object: "model", created: 0, owned_by: "Cerebras" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/gpt-oss-120b`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "gpt-oss-120b",
      object: "model",
      created: 1721692800,
      owned_by: "Cerebras",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.cerebras.ai/v1/models",
    "https://api.cerebras.ai/v1/models/gpt-oss-120b",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer cerebras-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("OpenAI provider profile forwards official model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "openai",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "openai-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "gpt-5.6", object: "model" }] }
        : { id: "gpt-5.6", object: "model", owned_by: "openai" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "gpt-5.6", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/gpt-5.6?include=permissions`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "gpt-5.6",
      object: "model",
      owned_by: "openai",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.openai.com/v1/models?limit=1",
    "https://api.openai.com/v1/models/gpt-5.6?include=permissions",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer openai-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("xAI provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "xai",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "xai-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "grok-4.7", object: "model" }] }
        : { id: "grok-4.7", object: "model", owned_by: "xai" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "grok-4.7", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/grok-4.7?include=pricing`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "grok-4.7",
      object: "model",
      owned_by: "xai",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.x.ai/v1/models?limit=1",
    "https://api.x.ai/v1/models/grok-4.7?include=pricing",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer xai-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Z.AI provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "zai",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "zai-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_zai_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Z.AI-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "glm-5.3", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.z.ai/api/paas/v4/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer zai-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Z.AI provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "zai",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "zai-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/glm-5.3"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Moonshot provider profile forwards its documented model list and blocks undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "moonshot",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "moonshot-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "kimi-k3", object: "model", owned_by: "moonshot" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "kimi-k3", object: "model", owned_by: "moonshot" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/kimi-k3`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.moonshot.ai/v1/models?limit=1",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer moonshot-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("DeepSeek provider profile forwards its documented model list and blocks undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "deepseek",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "deepseek-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "deepseek-flash", object: "model", owned_by: "deepseek" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "deepseek-flash", object: "model", owned_by: "deepseek" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/deepseek-flash`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.deepseek.com/models?limit=1",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer deepseek-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Mistral provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mistral",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mistral-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "mistral-large-latest", object: "model" }] }
        : { id: "mistral-large-latest", object: "model", owned_by: "mistralai" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "mistral-large-latest", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/mistral-large-latest?include=capabilities`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "mistral-large-latest",
      object: "model",
      owned_by: "mistralai",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.mistral.ai/v1/models?limit=1",
    "https://api.mistral.ai/v1/models/mistral-large-latest?include=capabilities",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mistral-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Nebius provider profile forwards model listing and fails closed for undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "nebius",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "nebius-key",
    fetchImpl: (async (input, init) => {
      upstreamCalled = true;
      assert.equal(String(input), "https://api.tokenfactory.nebius.com/v1/models");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer nebius-key");
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "openai/gpt-oss-120b", object: "model" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "openai/gpt-oss-120b", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/openai%2Fgpt-oss-120b`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, true);
});

test("SiliconFlow provider profile forwards model listing and fails closed for undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "siliconflow",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "siliconflow-key",
    fetchImpl: (async (input, init) => {
      upstreamCalled = true;
      assert.equal(String(input), "https://api.siliconflow.cn/v1/models?type=text");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer siliconflow-key");
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "deepseek-ai/DeepSeek-V4-Flash", object: "model" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?type=text`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "deepseek-ai/DeepSeek-V4-Flash", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/deepseek-ai%2FDeepSeek-V4-Flash`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, true);
});

test("MiniMax provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "minimax",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "minimax-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_minimax_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "MiniMax-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "MiniMax-M3.1-Flash-Preview", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.minimax.io/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer minimax-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("MiniMax provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "minimax",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "minimax-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "MiniMax-M3", object: "model", owned_by: "minimax" }] }
        : { id: "MiniMax-M3", object: "model", owned_by: "minimax" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "MiniMax-M3", object: "model", owned_by: "minimax" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/MiniMax-M3`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "MiniMax-M3",
      object: "model",
      owned_by: "minimax",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.minimax.io/v1/models",
    "https://api.minimax.io/v1/models/MiniMax-M3",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer minimax-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Tencent Hunyuan provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "hunyuan",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "hunyuan-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_hunyuan_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Hunyuan-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "hunyuan-turbos-latest", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.hunyuan.cloud.tencent.com/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer hunyuan-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Tencent Hunyuan provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "hunyuan",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "hunyuan-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/hunyuan-turbos-latest"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Volcengine Ark provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "volcengine",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "volcengine-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_volcengine_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Volcengine Ark-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "doubao-seed-2-1-pro-260628", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer volcengine-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Volcengine Ark provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "volcengine",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "volcengine-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/doubao-seed-2-1-pro-260628"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("OpenRouter provider profile forwards attribution headers with bearer auth", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "openrouter",
    CLAIMLATCH_PROXY_OPENROUTER_SITE_URL: "https://claimlatch.example",
    CLAIMLATCH_PROXY_OPENROUTER_APP_NAME: "ClaimLatch",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "openrouter-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_openrouter_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "OpenRouter-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer openrouter-key");
  assert.equal(capturedHeaders?.get("http-referer"), "https://claimlatch.example");
  assert.equal(capturedHeaders?.get("x-title"), "ClaimLatch");
});

test("OVHcloud provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ovhcloud",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ovhcloud-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_ovhcloud_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "OVHcloud-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-oss-20b", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer ovhcloud-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Baichuan provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "baichuan",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "baichuan-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_baichuan_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Baichuan-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "Baichuan2-Turbo", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.baichuan-ai.com/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer baichuan-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Baichuan provider profile fails closed for unsupported model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "baichuan",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "baichuan-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/Baichuan2-Turbo"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Fireworks provider profile fails closed for management-only model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "fireworks",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "fireworks-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 404);
    assert.deepEqual(await modelsResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_route_unavailable",
        message: "The configured provider does not expose a model-list route.",
      },
    });

    const retrievalResponse = await fetch(`${url}/v1/models/accounts%2Ffireworks%2Fmodels%2Fllama-v3p1-8b-instruct`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_route_unavailable",
        message: "The configured provider does not expose a model-list route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("FriendliAI provider profile forwards its documented model list and blocks undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "friendli",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "friendli-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "zai-org/GLM-5.3", object: "model", owned_by: "friendli" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "zai-org/GLM-5.3", object: "model", owned_by: "friendli" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/zai-org%2FGLM-5.3`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.friendli.ai/serverless/v1/models?limit=1",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer friendli-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Together AI provider profile forwards its documented model list and blocks undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "together",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "together-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify([
        { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", object: "model", type: "chat" },
      ]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?dedicated=false`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", object: "model", type: "chat" },
    ]);

    const retrievalResponse = await fetch(`${url}/v1/models/meta-llama%2FLlama-3.3-70B-Instruct-Turbo`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.together.xyz/v1/models?dedicated=false",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer together-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Perplexity Router provider profile forwards its documented model list and blocks undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "perplexity",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "perplexity-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "perplexity/glm-5.3", object: "model" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "perplexity/glm-5.3", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/perplexity%2Fglm-5.3`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.perplexity.ai/router/v1/models?limit=1",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer perplexity-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("SambaNova provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "sambanova",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sambanova-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "DeepSeek-R1", object: "model" }] }
        : { id: "DeepSeek-R1", object: "model", owned_by: "SambaNova" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "DeepSeek-R1", object: "model" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/DeepSeek-R1`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "DeepSeek-R1",
      object: "model",
      owned_by: "SambaNova",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://api.sambanova.ai/v1/models",
    "https://api.sambanova.ai/v1/models/DeepSeek-R1",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sambanova-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Baseten provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "baseten",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "baseten-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_baseten_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Baseten-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "zai-org/GLM-5.3", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://inference.baseten.co/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer baseten-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Baseten provider profile sends its model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "baseten",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "baseten-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "zai-org/GLM-5.3", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "zai-org/GLM-5.3", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "https://inference.baseten.co/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer baseten-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Clarifai provider profile sends its Key-authenticated OpenAI-compatible contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "clarifai",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "clarifai-pat",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_clarifai_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Clarifai-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
        messages: [{ role: "user", content: "question" }],
      }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.clarifai.com/v2/ext/openai/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Key clarifai-pat");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Clarifai provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "clarifai",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "clarifai-pat",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/https%3A%2F%2Fclarifai.com%2Fopenai%2Fchat-completion%2Fmodels%2Fgpt-oss-120b"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Modal provider profile sends the endpoint-scoped bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "modal",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://modal-endpoint.example",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "modal-token-id.modal-token-secret",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_modal_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Modal-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "model-name", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://modal-endpoint.example/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer modal-token-id.modal-token-secret");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Modal provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "modal",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://modal-endpoint.example",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "modal-token",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/model-name"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Cerebrium provider profile sends the deployment-scoped bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "cerebrium",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://api.cortex.cerebrium.ai/v4/project/app/run",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "cerebrium-jwt",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_cerebrium_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Cerebrium-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.cortex.cerebrium.ai/v4/project/app/run/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer cerebrium-jwt");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Cerebrium provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "cerebrium",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://api.cortex.cerebrium.ai/v4/project/app/run",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "cerebrium-jwt",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/model-name"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Nscale provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "nscale",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "nscale-token",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_nscale_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Nscale-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "meta-llama/Llama-3.1-8B-Instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://inference.api.nscale.com/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer nscale-token");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Nscale provider profile sends its model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "nscale",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "nscale-token",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "meta-llama/Llama-3.1-8B-Instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "meta-llama/Llama-3.1-8B-Instruct", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "https://inference.api.nscale.com/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer nscale-token");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Nscale provider profile fails closed for undocumented model retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "nscale",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "nscale-token",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/meta-llama%2FLlama-3.1-8B-Instruct`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("LiteLLM provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "litellm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:4000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "litellm-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_litellm_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "LiteLLM-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture-model", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:4000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer litellm-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LiteLLM provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "litellm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:4000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "litellm-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "fixture-model", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "fixture-model", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:4000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer litellm-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Ollama provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ollama",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:11434",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ollama",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_ollama_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Ollama-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "llama3.2", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:11434/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer ollama");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Ollama provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ollama",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:11434",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ollama",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "llama3.2", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "llama3.2", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:11434/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer ollama");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("llama.cpp provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "llamacpp",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8080",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-no-key-required",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_llamacpp_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "llama.cpp-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "model.gguf", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:8080/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-no-key-required");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("llama.cpp provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "llamacpp",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8080",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-no-key-required",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "model.gguf", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "model.gguf", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:8080/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-no-key-required");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("vLLM provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "vllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "token-abc123",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_vllm_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "vLLM-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "Qwen/Qwen2.5-1.5B-Instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer token-abc123");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("vLLM provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "vllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "token-abc123",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "Qwen/Qwen2.5-1.5B-Instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "Qwen/Qwen2.5-1.5B-Instruct", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer token-abc123");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LM Studio provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "lmstudio",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:1234",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "lm-studio",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_lmstudio_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "LM Studio-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "model-identifier", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:1234/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer lm-studio");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LM Studio provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "lmstudio",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:1234",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "lm-studio",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "model-identifier", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "model-identifier", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:1234/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer lm-studio");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Jan provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "jan",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://127.0.0.1:1337",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "secret-key-123",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_jan_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Jan-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "jan-v3-4b-base-instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://127.0.0.1:1337/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer secret-key-123");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Jan provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "jan",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://127.0.0.1:1337",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "secret-key-123",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "jan-v3-4b-base-instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "jan-v3-4b-base-instruct", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://127.0.0.1:1337/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer secret-key-123");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LocalAI provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "localai",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8080",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-localai",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_localai_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "LocalAI-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen3-4b", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:8080/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-localai");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LocalAI provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "localai",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8080",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-localai",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "qwen3-4b", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "qwen3-4b", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:8080/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-localai");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("SGLang provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "sglang",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:30000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sglang-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_sglang_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "SGLang-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "Qwen/Qwen3-0.6B", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:30000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sglang-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("SGLang provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "sglang",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:30000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sglang-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "Qwen/Qwen3-0.6B", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "Qwen/Qwen3-0.6B", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:30000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sglang-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("TGI provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "tgi",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:3000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "-",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_tgi_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "TGI-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "tgi", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:3000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer -");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("TGI provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "tgi",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:3000",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "-",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/tgi"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("MLX-LM provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mlx",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://127.0.0.1:8080",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mlx-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_mlx_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "MLX-LM-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "mlx-community/Mistral-7B-Instruct-v0.3-4bit", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://127.0.0.1:8080/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mlx-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("MLX-LM provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mlx",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://127.0.0.1:8080",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mlx-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "mlx-community/Mistral-7B-Instruct-v0.3-4bit", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "mlx-community/Mistral-7B-Instruct-v0.3-4bit", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://127.0.0.1:8080/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mlx-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("FastChat provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "fastchat",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "EMPTY",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_fastchat_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "FastChat-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "vicuna-7b-v1.5", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer EMPTY");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("FastChat provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "fastchat",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "EMPTY",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "vicuna-7b-v1.5", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "vicuna-7b-v1.5", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer EMPTY");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("FastChat provider profile fails closed for unsupported model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "fastchat",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "EMPTY",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/vicuna-7b-v1.5`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("OpenLLM provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "openllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:3000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "openllm-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_openllm_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "OpenLLM-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "meta-llama/Llama-3.2-1B-Instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:3000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer openllm-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("OpenLLM provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "openllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:3000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "openllm-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "meta-llama/Llama-3.2-1B-Instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "meta-llama/Llama-3.2-1B-Instruct", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:3000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer openllm-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("OpenLLM provider profile fails closed for unsupported model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "openllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:3000",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "openllm-local",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/meta-llama%2FLlama-3.2-1B-Instruct`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("TensorRT-LLM provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "tensorrtllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "tensorrt_llm",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_tensorrtllm_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "TensorRT-LLM-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer tensorrt_llm");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("TensorRT-LLM provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "tensorrtllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "tensorrt_llm",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer tensorrt_llm");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("TensorRT-LLM provider profile fails closed for unsupported model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "tensorrtllm",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "tensorrt_llm",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/TinyLlama%2FTinyLlama-1.1B-Chat-v1.0`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("Aphrodite provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "aphrodite",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:2242",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-empty",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_aphrodite_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Aphrodite-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "meta-llama/Meta-Llama-3.1-8B-Instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:2242/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-empty");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Aphrodite provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "aphrodite",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:2242",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-empty",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "meta-llama/Meta-Llama-3.1-8B-Instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "meta-llama/Meta-Llama-3.1-8B-Instruct", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:2242/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer sk-empty");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Aphrodite provider profile fails closed for undocumented model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "aphrodite",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:2242",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "sk-empty",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/meta-llama%2FMeta-Llama-3.1-8B-Instruct`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("KoboldCpp provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "koboldcpp",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:5001",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "koboldcpp-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_koboldcpp_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "KoboldCpp-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "koboldcpp-model", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:5001/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer koboldcpp-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("KoboldCpp provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "koboldcpp",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:5001",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "koboldcpp-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "koboldcpp-model", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "koboldcpp-model", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:5001/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer koboldcpp-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("KoboldCpp provider profile fails closed for undocumented model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "koboldcpp",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:5001",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "koboldcpp-local",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/koboldcpp-model`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("LMDeploy provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "lmdeploy",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:23333",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "lmdeploy-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_lmdeploy_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "LMDeploy-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "lmdeploy-model", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:23333/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer lmdeploy-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LMDeploy provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "lmdeploy",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:23333",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "lmdeploy-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "lmdeploy-model", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "lmdeploy-model", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:23333/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer lmdeploy-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("LMDeploy provider profile fails closed for undocumented model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "lmdeploy",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:23333",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "lmdeploy-local",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/lmdeploy-model`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("Xinference provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "xinference",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:9997",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "xinference-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_xinference_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Xinference-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen2.5-instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:9997/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer xinference-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Xinference provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "xinference",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:9997",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "xinference-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "qwen2.5-instruct", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "qwen2.5-instruct", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:9997/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer xinference-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Xinference provider profile forwards its documented model retrieval route", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "xinference",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:9997",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "xinference-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        model_uid: "xinference-model",
        model_name: "qwen2.5-instruct",
        replica: 1,
        model_engine: "llama.cpp",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/xinference-model?include=metadata`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      model_uid: "xinference-model",
      model_name: "qwen2.5-instruct",
      replica: 1,
      model_engine: "llama.cpp",
    });
  });

  assert.equal(capturedUrl, "http://localhost:9997/v1/models/xinference-model?include=metadata");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer xinference-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("text-generation-webui provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "textgen",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:5000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "textgen-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_textgen_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "text-generation-webui-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "textgen-model", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:5000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer textgen-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("text-generation-webui provider profile sends its model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "textgen",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:5000",
  });
  let capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "textgen-local",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "textgen-model", object: "model" }] }
        : { id: "textgen-model", object: "model", owned_by: "text-generation-webui" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "textgen-model", object: "model" }],
    });
    const retrievalResponse = await fetch(`${url}/v1/models/textgen-model?include=metadata`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "textgen-model",
      object: "model",
      owned_by: "text-generation-webui",
    });
  });

  assert.deepEqual(capturedUrls, [
    "http://localhost:5000/v1/models?limit=1",
    "http://localhost:5000/v1/models/textgen-model?include=metadata",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer textgen-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("MLC LLM provider profile sends its versioned Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mlc",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mlc-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_mlc_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "MLC LLM-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "HF://mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mlc-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("MLC LLM provider profile sends its versioned model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mlc",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mlc-local",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "HF://mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "HF://mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "http://localhost:8000/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mlc-local");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("MLC LLM provider profile fails closed for undocumented model retrieval routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mlc",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "http://localhost:8000",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mlc-local",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/mlc-model`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("Databricks provider profile sends its AI Gateway Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "databricks",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://workspace.example/ai-gateway/mlflow/v1",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "databricks-token",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_databricks_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Databricks-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "system.ai.databricks-model", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Databricks-compatible answer/);
  });

  assert.equal(capturedUrl, "https://workspace.example/ai-gateway/mlflow/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer databricks-token");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Databricks provider profile fails closed for unsupported model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "databricks",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://workspace.example/ai-gateway/mlflow/v1",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "databricks-token",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models/databricks-model`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_route_unavailable",
        message: "The configured provider does not expose a model-list route.",
      },
    });
  });

  assert.equal(upstreamCalled, false);
});

test("Microsoft Foundry provider profile sends its OpenAI v1 Chat Completions contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "foundry",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://foundry-resource.services.ai.azure.com",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "foundry-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_foundry_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Foundry-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Foundry-compatible answer/);
  });

  assert.equal(capturedUrl, "https://foundry-resource.services.ai.azure.com/openai/v1/chat/completions");
  assert.equal(capturedHeaders?.get("api-key"), "foundry-key");
  assert.equal(capturedHeaders?.get("authorization"), null);
});

test("Microsoft Foundry provider profile forwards documented model-list and retrieval paths", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "foundry",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://foundry-resource.services.ai.azure.com",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "foundry-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify(capturedUrls.length === 1
        ? { object: "list", data: [{ id: "gpt-4o-mini", object: "model" }] }
        : { id: "gpt-4o-mini", object: "model", owned_by: "azure" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "gpt-4o-mini", object: "model" }],
    });
    const retrievalResponse = await fetch(`${url}/v1/models/gpt-4o-mini?include=metadata`);
    assert.equal(retrievalResponse.status, 200);
    assert.deepEqual(await retrievalResponse.json(), {
      id: "gpt-4o-mini",
      object: "model",
      owned_by: "azure",
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://foundry-resource.services.ai.azure.com/openai/v1/models?limit=1",
    "https://foundry-resource.services.ai.azure.com/openai/v1/models/gpt-4o-mini?include=metadata",
  ]);
  assert.equal(capturedHeaders?.get("api-key"), "foundry-key");
});

test("Cloudflare Workers AI provider profile sends the account-scoped bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "cloudflare",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "cloudflare-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_cloudflare_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Cloudflare-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "@cf/meta/llama-3.1-8b-instruct", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer cloudflare-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Cloudflare Workers AI provider profile fails closed for undocumented model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "cloudflare",
    CLAIMLATCH_PROXY_UPSTREAM_BASE_URL: "https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "cloudflare-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/@cf%2Fmeta%2Fllama-3.1-8b-instruct"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("Cohere provider profile fails closed for compatibility-unsupported model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "cohere",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "cohere-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/command-a-03-2025"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("NVIDIA hosted provider profile forwards its documented model list and blocks undocumented retrieval", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "nvidia",
  });
  const capturedUrls: string[] = [];
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "nvidia-key",
    fetchImpl: (async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        object: "list",
        data: [{ id: "meta/llama-3.1-8b-instruct", object: "model", owned_by: "nvidia" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const modelsResponse = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: "list",
      data: [{ id: "meta/llama-3.1-8b-instruct", object: "model", owned_by: "nvidia" }],
    });

    const retrievalResponse = await fetch(`${url}/v1/models/meta%2Fllama-3.1-8b-instruct`);
    assert.equal(retrievalResponse.status, 404);
    assert.deepEqual(await retrievalResponse.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_model_retrieval_route_unavailable",
        message: "The configured provider does not expose a model-retrieval route.",
      },
    });
  });

  assert.deepEqual(capturedUrls, [
    "https://integrate.api.nvidia.com/v1/models?limit=1",
  ]);
  assert.equal(capturedHeaders?.get("authorization"), "Bearer nvidia-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Xiaomi MiMo provider profile sends the OpenAI-compatible bearer contract", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mimo",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mimo-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_mimo_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "MiMo-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "mimo-v2.5-pro", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://api.xiaomimimo.com/v1/chat/completions");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mimo-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("Xiaomi MiMo provider profile sends its model-list path and bearer header", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "mimo",
  });
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "mimo-key",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ object: "list", data: [{ id: "mimo-v2.5-pro", object: "model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/models?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [{ id: "mimo-v2.5-pro", object: "model" }],
    });
  });

  assert.equal(capturedUrl, "https://api.xiaomimimo.com/v1/models?limit=1");
  assert.equal(capturedHeaders?.get("authorization"), "Bearer mimo-key");
  assert.equal(capturedHeaders?.get("api-key"), null);
});

test("OVHcloud provider profile fails closed for unsupported model routes", async () => {
  const profile = resolveProxyProviderConfiguration({
    CLAIMLATCH_PROXY_PROVIDER_PROFILE: "ovhcloud",
  });
  let upstreamCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    ...profile,
    upstreamApiKey: "ovhcloud-key",
    fetchImpl: (async () => {
      upstreamCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    }) as typeof fetch,
  }, async (url) => {
    for (const path of ["/v1/models", "/v1/models/gpt-oss-20b"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: {
          type: "claimlatch_proxy_error",
          code: "claimlatch_model_route_unavailable",
          message: "The configured provider does not expose a model-list route.",
        },
      });
    }
  });

  assert.equal(upstreamCalled, false);
});

test("hosted provider profiles preserve their resolver contracts through the proxy", async () => {
  const expectedHostedProfiles = PROXY_PROVIDER_PROFILE_NAMES.filter(
    (profileName) => profileName !== "aphrodite" && profileName !== "azure" && profileName !== "cerebrium" && profileName !== "cloudflare" && profileName !== "databricks" && profileName !== "fastchat" && profileName !== "foundry" && profileName !== "jan" && profileName !== "koboldcpp" && profileName !== "litellm" && profileName !== "llamacpp" && profileName !== "lmdeploy" && profileName !== "lmstudio" && profileName !== "localai" && profileName !== "mlc" && profileName !== "mlx" && profileName !== "modal" && profileName !== "ollama" && profileName !== "openllm" && profileName !== "openrouter" && profileName !== "sglang" && profileName !== "tgi" && profileName !== "tensorrtllm" && profileName !== "textgen" && profileName !== "vllm" && profileName !== "xinference",
  );
  assert.deepEqual(Object.keys(HOSTED_PROFILE_BASE_URLS).sort(), [...expectedHostedProfiles].sort());

  for (const [profileName, expectedBaseUrl] of Object.entries(HOSTED_PROFILE_BASE_URLS)) {
    const profile = resolveProxyProviderConfiguration({
      CLAIMLATCH_PROXY_PROVIDER_PROFILE: profileName,
    });
    let capturedUrl: string | undefined;
    let capturedHeaders: Headers | undefined;

    await withProxyOptions({
      gate: fixtureGate(),
      ...profile,
      upstreamApiKey: `${profileName}-key`,
      fetchImpl: (async (input, init) => {
        capturedUrl = String(input);
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({
          id: `chatcmpl_${profileName}`,
          object: "chat.completion",
          choices: [{ message: { role: "assistant", content: "Hosted-compatible answer." } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    }, async (url) => {
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "fixture-model", messages: [{ role: "user", content: "question" }] }),
      });
      assert.equal(response.status, 200);
    });

    const expectedChatCompletionsPath = profileName === "aimlapi"
      ? "/v1/chat/completions"
      : "/chat/completions";
    assert.equal(capturedUrl, `${expectedBaseUrl}${expectedChatCompletionsPath}`);
    assert.equal(capturedHeaders?.get("authorization"), `${profileName === "clarifai" ? "Key" : "Bearer"} ${profileName}-key`);
    assert.equal(capturedHeaders?.get("api-key"), null);
  }
});

test("proxy supports a custom provider compatibility profile", async () => {
  let capturedUrl: string | undefined;
  let capturedHeaders: Headers | undefined;
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://provider.example",
    upstreamApiKey: "profile-key",
    upstreamApiKeyHeader: "x-api-key",
    upstreamChatCompletionsPath: "/v1/chat/completions?profile=custom",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "chatcmpl_provider_profile",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Profile-compatible answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer client-key",
        "x-provider-request-id": "profile-request",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(capturedUrl, "https://provider.example/v1/chat/completions?profile=custom");
  assert.equal(capturedHeaders?.get("x-api-key"), "profile-key");
  assert.equal(capturedHeaders?.get("authorization"), null);
  assert.equal(capturedHeaders?.get("x-provider-request-id"), "profile-request");
});

test("proxy rejects an absolute upstream chat completions path configuration", () => {
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamChatCompletionsPath: "https://evil.example/chat/completions",
  }), /relative HTTP path/);
});

test("proxy rejects malformed upstream base URL configuration", () => {
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "upstream.example/v1",
  }), /absolute HTTP URL/);
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://user:password@upstream.example/v1",
  }), /credentials/);
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1?api-version=1",
  }), /query or fragment/);
});

test("proxy pins upstream requests to a validated public DNS address", async () => {
  let lookupHostname: string | undefined;
  let pinnedAddress: string | undefined;
  let pinnedServername: string | undefined;
  let acceptEncoding: string | undefined;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    lookupImpl: async (hostname) => {
      lookupHostname = hostname;
      return [
        { address: "8.8.8.8", family: 4 },
        { address: "1.1.1.1", family: 4 },
      ];
    },
    requestImpl: async (url, options) => {
      pinnedAddress = options.address;
      pinnedServername = url.hostname;
      acceptEncoding = options.headers["accept-encoding"];
      return new Response(JSON.stringify({
        id: "chatcmpl_pinned_proxy",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Pinned upstream answer." } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(lookupHostname, "upstream.example");
  assert.equal(pinnedAddress, "8.8.8.8");
  assert.equal(pinnedServername, "upstream.example");
  assert.equal(acceptEncoding, "identity");
});

test("proxy fails closed when upstream DNS resolves to a private address", async () => {
  let requestCalled = false;

  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
    requestImpl: async () => {
      requestCalled = true;
      return new Response("unexpected upstream request", { status: 500 });
    },
  }, async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        type: "claimlatch_proxy_error",
        code: "claimlatch_proxy_error",
        message: "Upstream hostname resolved to a non-public address.",
      },
    });
  });

  assert.equal(requestCalled, false);
});

test("proxy rejects restricted upstream API key header configuration", () => {
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamApiKeyHeader: "content-type",
  }), /restricted proxy header/);
});

test("proxy rejects an unsafe upstream API key prefix", () => {
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamApiKeyPrefix: "Api Key",
  }), /authentication scheme token/);
});

test("proxy preserves compatible upstream response headers on pass", async () => {
  await withProxyPayload({
    id: "chatcmpl_response_headers",
    object: "chat.completion",
    choices: [{ message: { role: "assistant", content: "Response-header-compatible answer." } }],
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-claimlatch-result"), "pass");
    assert.equal(response.headers.get("x-request-id"), "resp_test");
    assert.equal(response.headers.get("x-ratelimit-limit-requests"), "10");
    assert.equal(response.headers.get("x-ms-request-id"), "ms_req_test");
    assert.equal(response.headers.get("x-ms-region"), "koreacentral");
    assert.equal(response.headers.get("apim-request-id"), "apim_req_test");
    assert.equal(response.headers.get("x-goog-request-id"), "goog_req_test");
    assert.equal(response.headers.get("x-amzn-requestid"), "amzn_req_test");
    assert.equal(response.headers.get("anthropic-ratelimit-requests-limit"), "10");
  }, {
    "content-type": "application/json",
    "x-request-id": "resp_test",
    "x-ratelimit-limit-requests": "10",
    "x-ms-request-id": "ms_req_test",
    "x-ms-region": "koreacentral",
    "apim-request-id": "apim_req_test",
    "x-goog-request-id": "goog_req_test",
    "x-amzn-requestid": "amzn_req_test",
    "anthropic-ratelimit-requests-limit": "10",
    connection: "close",
  });
});

test("proxy forwards explicitly configured provider response headers", async () => {
  await withProxyOptions({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamResponseHeaderNames: ["x-vendor-request-id"],
    upstreamResponseHeaderPrefixes: ["x-vendor-rate-"],
    fetchImpl: upstreamFetchPayload({
      id: "chatcmpl_custom_response_headers",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "Custom response headers." } }],
    }, {
      "content-type": "application/json",
      "x-vendor-request-id": "vendor-request",
      "x-vendor-rate-limit": "20",
      "x-vendor-private": "not-forwarded",
    }),
  }, async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "question" }] }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-vendor-request-id"), "vendor-request");
    assert.equal(response.headers.get("x-vendor-rate-limit"), "20");
    assert.equal(response.headers.get("x-vendor-private"), null);
  });
});

test("proxy rejects unsafe configured response headers", () => {
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamResponseHeaderNames: ["content-length"],
  }), /restricted proxy response header/);
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamResponseHeaderPrefixes: ["bad prefix"],
  }), /valid HTTP header prefix/);
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamResponseHeaderNames: ["x-vendor-request-id", "X-Vendor-Request-Id"],
  }), /duplicate proxy response header name/);
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamResponseHeaderPrefixes: ["x-vendor-rate-", "X-Vendor-Rate-"],
  }), /duplicate proxy response header prefix/);
});

test("proxy rejects restricted upstream request headers", () => {
  assert.throws(() => createOpenAIProxy({
    gate: fixtureGate(),
    upstreamBaseUrl: "https://upstream.example/v1",
    upstreamRequestHeaders: { authorization: "Bearer static" },
  }), /restricted proxy request header/);
});
