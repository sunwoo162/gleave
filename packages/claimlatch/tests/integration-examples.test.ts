import assert from "node:assert/strict";
import test from "node:test";
import cloudflareWorker from "../examples/cloudflare-worker.js";
import bunServer, { createBunGuardedAnswerHandler } from "../examples/bun-server.js";
import denoServer, { createDenoGuardedAnswerHandler } from "../examples/deno-server.js";
import {
  createExpressGuardedAnswerHandler,
  type ExpressRequest,
  type ExpressResponse,
} from "../examples/express-route-handler.js";
import {
  createFastifyGuardedAnswerHandler,
  type FastifyReply,
  type FastifyRequest,
} from "../examples/fastify-route-handler.js";
import {
  createHapiGuardedAnswerHandler,
  type HapiRequest,
  type HapiResponseObject,
  type HapiResponseToolkit,
} from "../examples/hapi-route-handler.js";
import {
  createHonoGuardedAnswerHandler,
  type HonoContext,
} from "../examples/hono-route-handler.js";
import {
  createSvelteKitGuardedAnswerHandler,
  type SvelteKitRequestEvent,
} from "../examples/sveltekit-route-handler.js";
import {
  createAwsLambdaHttpApiV2Handler,
  type AwsLambdaHttpApiV2Event,
} from "../examples/aws-lambda-http-api-handler.js";
import {
  createKoaGuardedAnswerHandler,
  type KoaContext,
} from "../examples/koa-route-handler.js";
import { GET, POST, runtime } from "../examples/next-route-handler.js";
import { action, loader } from "../examples/remix-route-handler.js";
import {
  isReceiptStorageMainModule,
  renderReceiptStorageOutput,
} from "../examples/receipt-storage.js";

test("Next.js route example exports Fetch-native GET and POST handlers", () => {
  assert.equal(typeof GET, "function");
  assert.equal(typeof POST, "function");
  assert.equal(runtime, "nodejs");
});

test("Remix route example exports Fetch-native loader and action handlers", () => {
  assert.equal(typeof loader, "function");
  assert.equal(typeof action, "function");
});

test("Cloudflare Worker example exports a Fetch-native worker", () => {
  assert.equal(typeof cloudflareWorker.fetch, "function");
});

test("Deno example adapts a Fetch-native handler and preserves the response", async () => {
  const handler = createDenoGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://example.test/answer");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-claimlatch-result": "pass" },
    });
  });

  const response = await handler(new Request("https://example.test/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "question", draft: "draft" }),
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("x-claimlatch-result"), "pass");
  assert.deepEqual(await response.json(), { answer: "verified" });
});

test("Deno example default fetch lazily initializes from Deno.env", async () => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env: { get(name: string): string | undefined } };
  };
  const previousDeno = runtime.Deno;
  const reads: string[] = [];
  runtime.Deno = {
    env: {
      get(name) {
        reads.push(name);
        return {
          CLAIMLATCH_LLM_MODEL: "test-model",
          TAVILY_API_KEY: "test-tavily-key",
        }[name];
      },
    },
  };

  try {
    assert.deepEqual(reads, []);
    const response = await denoServer.fetch(new Request("https://example.test/health"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: "claimlatch-guarded-answer" });
    assert.deepEqual(reads, [
      "CLAIMLATCH_LLM_MODEL",
      "TAVILY_API_KEY",
      "CLAIMLATCH_LLM_API_KEY",
      "CLAIMLATCH_LLM_BASE_URL",
    ]);
  } finally {
    if (previousDeno) runtime.Deno = previousDeno;
    else delete runtime.Deno;
  }
});

test("Bun example adapts a Fetch-native handler and preserves the response", async () => {
  const handler = createBunGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://example.test/answer");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-claimlatch-result": "pass" },
    });
  });

  const response = await handler(new Request("https://example.test/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "question", draft: "draft" }),
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("x-claimlatch-result"), "pass");
  assert.deepEqual(await response.json(), { answer: "verified" });
});

test("Bun example default fetch lazily initializes from Bun.env", async () => {
  const runtime = globalThis as typeof globalThis & {
    Bun?: { env: Record<string, string | undefined> };
  };
  const previousBun = runtime.Bun;
  const reads: string[] = [];
  runtime.Bun = {
    env: new Proxy<Record<string, string | undefined>>({
      CLAIMLATCH_LLM_MODEL: "test-model",
      TAVILY_API_KEY: "test-tavily-key",
    }, {
      get(target, name: string) {
        reads.push(name);
        return target[name];
      },
    }),
  };

  try {
    assert.deepEqual(reads, []);
    const response = await bunServer.fetch(new Request("https://example.test/health"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: "claimlatch-guarded-answer" });
    assert.deepEqual(reads, [
      "CLAIMLATCH_LLM_MODEL",
      "TAVILY_API_KEY",
      "CLAIMLATCH_LLM_API_KEY",
      "CLAIMLATCH_LLM_BASE_URL",
    ]);
  } finally {
    if (previousBun) runtime.Bun = previousBun;
    else delete runtime.Bun;
  }
});

test("Express example adapts parsed JSON requests to the guarded Fetch handler", async () => {
  let statusCode: number | undefined;
  const responseHeaders = new Map<string, string | string[]>();
  let responseBody: string | undefined;
  const handler = createExpressGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "http://example.test/answer");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: [
        ["content-type", "application/json"],
        ["x-claimlatch-result", "pass"],
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "theme=dark; Path=/"],
      ],
    });
  });
  const request: ExpressRequest = {
    method: "POST",
    protocol: "http",
    originalUrl: "/api/answer",
    url: "/answer",
    body: { question: "question", draft: "draft" },
    get(name) {
      return name.toLowerCase() === "host" ? "example.test" : undefined;
    },
  };
  const response: ExpressResponse = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      responseHeaders.set(name.toLowerCase(), value);
      return this;
    },
    send(body) {
      responseBody = body;
      return this;
    },
  };

  await handler(request, response);

  assert.equal(statusCode, 200);
  assert.equal(responseHeaders.get("content-type"), "application/json");
  assert.equal(responseHeaders.get("x-claimlatch-result"), "pass");
  assert.deepEqual(responseHeaders.get("set-cookie"), ["session=abc; Path=/", "theme=dark; Path=/"]);
  assert.equal(responseBody, JSON.stringify({ answer: "verified" }));
});

test("Fastify example adapts parsed JSON requests to the guarded Fetch handler", async () => {
  let statusCode: number | undefined;
  const responseHeaders = new Map<string, string | string[]>();
  let responseBody: string | undefined;
  const handler = createFastifyGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "http://example.test:3000/answer?trace=1");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: [
        ["content-type", "application/json"],
        ["x-claimlatch-result", "pass"],
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "theme=dark; Path=/"],
      ],
    });
  });
  const request: FastifyRequest = {
    method: "POST",
    protocol: "http",
    host: "example.test:3000",
    url: "/answer?trace=1",
    body: { question: "question", draft: "draft" },
  };
  const response: FastifyReply = {
    code(code) {
      statusCode = code;
      return this;
    },
    header(name, value) {
      responseHeaders.set(name.toLowerCase(), value);
      return this;
    },
    send(body) {
      responseBody = body;
      return this;
    },
  };

  const result = await handler(request, response);

  assert.equal(result, response);
  assert.equal(statusCode, 200);
  assert.equal(responseHeaders.get("content-type"), "application/json");
  assert.equal(responseHeaders.get("x-claimlatch-result"), "pass");
  assert.deepEqual(responseHeaders.get("set-cookie"), ["session=abc; Path=/", "theme=dark; Path=/"]);
  assert.equal(responseBody, JSON.stringify({ answer: "verified" }));
});

test("Hono example adapts c.req.raw to the guarded Fetch handler", async () => {
  const handler = createHonoGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://example.test/answer");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-claimlatch-result": "pass" },
    });
  });

  const context: HonoContext = {
    req: {
      raw: new Request("https://example.test/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "question", draft: "draft" }),
      }),
    },
  };

  const response = await handler(context);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("x-claimlatch-result"), "pass");
  assert.deepEqual(await response.json(), { answer: "verified" });
});

test("SvelteKit example adapts event.request to the guarded Fetch handler", async () => {
  const handler = createSvelteKitGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://example.test/answer");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-claimlatch-result": "pass" },
    });
  });

  const event: SvelteKitRequestEvent = {
    request: new Request("https://example.test/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "question", draft: "draft" }),
    }),
  };

  const response = await handler(event);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("x-claimlatch-result"), "pass");
  assert.deepEqual(await response.json(), { answer: "verified" });
});

test("AWS Lambda HTTP API example adapts payload v2 events and responses", async () => {
  const handler = createAwsLambdaHttpApiV2Handler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://lambda.invalid/answer?mode=verified");
    assert.equal(request.headers.get("x-request-id"), "request-1");
    assert.equal(request.headers.get("cookie"), "session=abc; theme=dark");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: [
        ["content-type", "application/json"],
        ["x-claimlatch-result", "pass"],
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "theme=dark; Path=/"],
      ],
    });
  });

  const event: AwsLambdaHttpApiV2Event = {
    version: "2.0",
    rawPath: "/answer",
    rawQueryString: "mode=verified",
    headers: { "content-type": "application/json", "x-request-id": "request-1" },
    cookies: ["session=abc", "theme=dark"],
    requestContext: { http: { method: "POST" } },
    body: btoa(JSON.stringify({ question: "question", draft: "draft" })),
    isBase64Encoded: true,
  };

  const response = await handler(event);

  assert.equal(response.statusCode, 200);
  assert.equal(response.isBase64Encoded, true);
  assert.equal(response.headers["content-type"], "application/json");
  assert.equal(response.headers["x-claimlatch-result"], "pass");
  assert.deepEqual(response.cookies, ["session=abc; Path=/", "theme=dark; Path=/"]);
  assert.deepEqual(JSON.parse(atob(response.body)), { answer: "verified" });
});

test("AWS Lambda HTTP API example omits bodies for GET and HEAD requests", async () => {
  const handler = createAwsLambdaHttpApiV2Handler(async (request) => {
    assert.equal(request.body, null);
    return new Response(null, { status: 204 });
  });

  for (const method of ["GET", "HEAD"] as const) {
    const response = await handler({
      version: "2.0",
      rawPath: "/answer",
      rawQueryString: "",
      requestContext: { http: { method } },
      body: btoa("ignored"),
      isBase64Encoded: false,
    });

    assert.equal(response.statusCode, 204);
  }
});

test("Koa example adapts parsed JSON requests and response setters", async () => {
  const handler = createKoaGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "http://example.test:3000/answer?trace=1");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: [
        ["content-type", "application/json"],
        ["x-claimlatch-result", "pass"],
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "theme=dark; Path=/"],
      ],
    });
  });

  let statusCode: number | undefined;
  let responseBody: unknown;
  const responseHeaders = new Map<string, string | string[]>();
  const context: KoaContext = {
    request: {
      method: "POST",
      protocol: "http",
      host: "example.test:3000",
      originalUrl: "/answer?trace=1",
      body: { question: "question", draft: "draft" },
    },
    response: {
      status: 404,
      set(name, value) {
        responseHeaders.set(name.toLowerCase(), value);
      },
      set body(value: unknown) {
        responseBody = value;
      },
    },
  };

  await handler(context);
  statusCode = context.response.status;

  assert.equal(statusCode, 200);
  assert.equal(responseHeaders.get("content-type"), "application/json");
  assert.equal(responseHeaders.get("x-claimlatch-result"), "pass");
  assert.deepEqual(responseHeaders.get("set-cookie"), ["session=abc; Path=/", "theme=dark; Path=/"]);
  assert.equal(responseBody, JSON.stringify({ answer: "verified" }));
});

test("Hapi example adapts parsed JSON requests and response toolkit", async () => {
  const handler = createHapiGuardedAnswerHandler(async (request) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "https://example.test:3443/answer?trace=1");
    assert.deepEqual(await request.json(), { question: "question", draft: "draft" });
    return new Response(JSON.stringify({ answer: "verified" }), {
      status: 200,
      headers: [
        ["content-type", "application/json"],
        ["x-claimlatch-result", "pass"],
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "theme=dark; Path=/"],
      ],
    });
  });

  const responseHeaders = new Map<string, string[]>();
  let responseBody: unknown;
  let statusCode: number | undefined;
  const responseObject: HapiResponseObject = {
    code(status) {
      statusCode = status;
      return responseObject;
    },
    header(name, value) {
      const current = responseHeaders.get(name.toLowerCase()) ?? [];
      current.push(value);
      responseHeaders.set(name.toLowerCase(), current);
      return responseObject;
    },
  };
  const toolkit: HapiResponseToolkit = {
    response(payload) {
      responseBody = payload;
      return responseObject;
    },
  };
  const request: HapiRequest = {
    method: "post",
    url: "/answer?trace=1",
    headers: { host: "example.test:3443" },
    server: { info: { protocol: "https" } },
    info: { host: "example.test:3443" },
    payload: { question: "question", draft: "draft" },
  };

  await handler(request, toolkit);

  assert.equal(statusCode, 200);
  assert.deepEqual(responseHeaders.get("content-type"), ["application/json"]);
  assert.deepEqual(responseHeaders.get("x-claimlatch-result"), ["pass"]);
  assert.deepEqual(responseHeaders.get("set-cookie"), ["session=abc; Path=/", "theme=dark; Path=/"]);
  assert.equal(responseBody, JSON.stringify({ answer: "verified" }));
});

test("receipt storage example renders the canonical payload hash", () => {
  const output = JSON.parse(renderReceiptStorageOutput({
    receiptId: "demo-receipt",
    receiptDirectory: "./var/claimlatch-receipts",
    verified: true,
    payloadSha256: "a".repeat(64),
  })) as { verified?: boolean; payloadSha256?: string };
  assert.equal(output.verified, true);
  assert.match(output.payloadSha256 ?? "", /^[0-9a-f]{64}$/u);
});

test("receipt storage example main guard normalizes POSIX and Windows paths", () => {
  assert.equal(
    isReceiptStorageMainModule(
      "file:///home/runner/claimlatch/dist/examples/receipt-storage.js",
      "/home/runner/claimlatch/dist/examples/receipt-storage.js",
    ),
    true,
  );
  assert.equal(
    isReceiptStorageMainModule(
      "file:///C:/claimlatch/dist/examples/receipt-storage.js",
      "C:\\claimlatch\\dist\\examples\\receipt-storage.js",
    ),
    true,
  );
  assert.equal(
    isReceiptStorageMainModule(
      "file:///home/runner/claimlatch/dist/examples/receipt-storage.js",
      "/home/runner/claimlatch/dist/examples/other.js",
    ),
    false,
  );
});
