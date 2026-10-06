# ClaimLatch

**An evidence-backed release gate for LLM answers.**

LLMs can produce fluent answers before they have earned the level of confidence a user expects. ClaimLatch sits between generation and delivery: it extracts factual claims, gathers evidence, binds each claim to concrete evidence, verifies the result, and deterministically **PASS**es or **BLOCK**s the draft according to policy.

> ClaimLatch does not ask a model "how confident are you?" and turn that self-report into a trust score.

## Pipeline

```text
User question
    ↓
LLM draft answer
    ↓
ClaimExtractor
    ↓
EvidenceProvider
    ↓
Optional document provenance hydration
    ↓
ClaimVerifier
    ↓
Core invariant enforcement
    ↓
Deterministic policy gate
    ↓
PASS / BLOCK
```

Every factual claim ends in exactly one of these states:

- `SUPPORTED`
- `CONTRADICTED`
- `UNSUPPORTED`
- `UNVERIFIABLE`

`coverage` is the fraction of claims that could receive a supported or contradicted verdict based on sufficient evidence. It is not an accuracy percentage.

Claim confidence is a separate, opt-in signal. When configured with a caller-owned scorer and an independently calibrated profile, each claim can include a probability that the verification status (`SUPPORTED`, `CONTRADICTED`, `UNSUPPORTED`, or `UNVERIFIABLE`) is correct. This is not a probability that the underlying fact is true.

## Install and build

```bash
npm install
npm run build
npm test
```

For the complete credential-free release check, run `npm run verify`. It runs the TypeScript build, the full test suite, and validation of the frozen independent benchmark against its committed integrity manifest.

Node.js 20 or later is supported. PDF extraction uses the PDF.js runtime dependency; TypeScript is a development-only dependency.

## CLI

Configure an OpenAI-compatible verification model and Tavily search.

```bash
export CLAIMLATCH_LLM_API_KEY="..."
export CLAIMLATCH_LLM_MODEL="your-model"
# Optional: export CLAIMLATCH_LLM_BASE_URL="https://your-endpoint/v1"
export TAVILY_API_KEY="..."
```

Verify a draft answer before delivering it to a user.

```bash
claimlatch \
  --question "What is the currently supported version?" \
  --answer "Version 4 is the current LTS release."
```

By default, search results are hydrated from the original web page when possible. The report records whether selected evidence is a `search-snippet` or a `retrieved-document` quote.

Strict provenance mode rejects decisive verdicts backed only by search snippets.

```bash
claimlatch \
  -q "..." \
  -a "..." \
  --require-document-provenance
```

Blocked reports return exit code `1`; usage or provider errors return exit code `2`.

Use `--json` for machine-readable output.

```bash
claimlatch -q "..." -a "..." --json
```

## OpenAI-compatible reverse proxy

`claimlatch-proxy` can sit in front of an OpenAI Chat Completions-compatible provider. It buffers the generated answer, verifies it, and releases the upstream completion only when it passes. By default, outbound upstream requests resolve DNS first, reject non-public results, and pin the connection to the selected public address.

Run `claimlatch-proxy --help` for the required credentials, supported routes, provider compatibility settings, and fail-closed behavior without configuring credentials.

```bash
export CLAIMLATCH_PROXY_UPSTREAM_BASE_URL="https://api.openai.com/v1"
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY="..."

export CLAIMLATCH_LLM_API_KEY="..."
export CLAIMLATCH_LLM_MODEL="your-verifier-model"
export TAVILY_API_KEY="..."

claimlatch-proxy
```

Point an existing client at:

```text
http://127.0.0.1:4317/v1
```

Behavior:

- PASS: returns the original upstream Chat Completions JSON with `x-claimlatch-result: pass`.
- When upstream returns multiple textual choices, such as with `n > 1`, every choice is verified and the response headers report aggregate coverage and claim counts.
- Compatible end-to-end request headers such as `Accept`, `OpenAI-Organization`, `OpenAI-Project`, and client request IDs are forwarded. A configured `CLAIMLATCH_PROXY_UPSTREAM_API_KEY` overrides the incoming `Authorization` header.
- Upstream `OpenAI-*`, `X-RateLimit-*`, `RateLimit-*`, `X-MS-*`, `X-Goog-*`, `X-Amzn-*`, `Anthropic-*`, `APIM-Request-ID`, `Retry-After`, `X-Request-Id`, and `Content-Type` response headers are preserved on released responses.
- BLOCK: returns HTTP `422` with `error.code = "claimlatch_blocked"` and verification reports.
- If any choice is blocked, the entire response is blocked and per-choice reports are returned as `claimlatchReports`.
- `stream: true`: the upstream SSE stream is buffered privately, every textual choice is verified, and the stream is replayed only after PASS. Structured choices can be released only through an explicit `structuredOutputVerifier`; otherwise blocked, malformed, truncated, or over-limit streams fail closed.
- `GET /v1/models`, `GET /models`, `GET /v1/models/:id`, and `GET /models/:id` are forwarded as bounded model metadata requests without invoking the answer gate, so standard OpenAI-compatible clients can discover or retrieve available models. Model IDs are encoded as one path segment, and model responses are still subject to the configured upstream timeout and response-size limit.
- `/health`: a lightweight local health endpoint.

If no upstream API key is configured, the incoming `Authorization` header is forwarded to the upstream provider. The proxy binds to `127.0.0.1` by default. Custom `fetchImpl` or request transports bypass the built-in DNS/IP pinning and must provide equivalent protections.

Do not set the ClaimLatch proxy itself as `CLAIMLATCH_LLM_BASE_URL`. The verifier must use an endpoint that does not recursively pass through the gate.

For an SDK configuration example using an Azure-style API key header and deployment-specific completion path, run:

```bash
export CLAIMLATCH_PROXY_UPSTREAM_BASE_URL="https://your-resource.openai.azure.com"
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY="..."
export CLAIMLATCH_LLM_API_KEY="..."
export CLAIMLATCH_LLM_MODEL="your-verifier-model"
export TAVILY_API_KEY="..."
npm run example:provider-proxy
```

The example defaults to `api-key`, `/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21`, and `/openai/models?api-version=2024-10-21` for Azure model listing/retrieval; override `CLAIMLATCH_PROXY_UPSTREAM_API_KEY_HEADER`, `CLAIMLATCH_PROXY_UPSTREAM_API_KEY_PREFIX`, `CLAIMLATCH_PROXY_UPSTREAM_CHAT_COMPLETIONS_PATH`, or `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` for another provider.

For Cerebras' OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="cerebras"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.cerebras.ai/v1`, bearer authentication, `/chat/completions`, and `/models` for model listing and per-model retrieval. See Cerebras' [list models API reference](https://inference-docs.cerebras.ai/api-reference/models/list-models), [retrieve model API reference](https://inference-docs.cerebras.ai/api-reference/models/retrieve-model), and [OpenAI compatibility guide](https://inference-docs.cerebras.ai/resources/openai).

For Cloudflare Workers AI's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="cloudflare"`, provide an account-scoped `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` such as `https://api.cloudflare.com/client/v4/accounts/<account_id>/ai/v1`, and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses bearer authentication and `/chat/completions`; its model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured because the official compatibility contract documents Chat Completions but not a model-list route. See [Cloudflare's OpenAI-compatible Workers AI documentation](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/).

The same example includes an OpenRouter profile. Set the required attribution metadata; the profile supplies the OpenRouter base URL, bearer authentication, and attribution headers:

```bash
export CLAIMLATCH_PROXY_PROVIDER_PROFILE="openrouter"
export CLAIMLATCH_PROXY_OPENROUTER_SITE_URL="https://your-app.example"
export CLAIMLATCH_PROXY_OPENROUTER_APP_NAME="Your App"
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY="..."
export CLAIMLATCH_LLM_API_KEY="..."
export CLAIMLATCH_LLM_MODEL="your-verifier-model"
export TAVILY_API_KEY="..."
npm run example:provider-proxy
```

The profile fails closed when either attribution value is missing or the site URL is not an absolute HTTP(S) URL without embedded username or password credentials. Explicit `CLAIMLATCH_PROXY_UPSTREAM_*` values override profile defaults.

For AI21's OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="ai21"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.ai21.com/studio/v1`, bearer authentication, and `/chat/completions`. Model listing and per-model retrieval fail closed because AI21's documented API reference does not expose model routes; see [AI21's API reference](https://docs.ai21.com/reference) and [documentation index](https://docs.ai21.com/llms.txt).

For Baichuan's OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="baichuan"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.baichuan-ai.com/v1`, bearer authentication, and `/chat/completions`. Its model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured; see [Baichuan's official API documentation](https://platform.baichuan-ai.com/docs/api?activity=true).

For Baseten Model APIs' OpenAI-compatible endpoints, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="baseten"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://inference.baseten.co/v1`, bearer authentication, `/chat/completions`, and `/models`; see [Baseten's Model APIs documentation](https://docs.baseten.co/inference/model-apis/overview) and [Quickstart](https://docs.baseten.co/quickstart).

For Cerebrium deployment endpoints, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="cerebrium"`, provide the deployment function URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL`, and provide the Cerebrium JWT as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses the endpoint URL plus `/v1/chat/completions` with bearer authentication; model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured because Cerebrium's OpenAI-compatible deployment documentation does not document an OpenAI model-list route. See [Cerebrium's OpenAI-compatible endpoint guide](https://cerebrium.ai/blog/deploying-deepseek-r1-a-guide-to-a-serverless-high-performaning-openai-compatible-endpoint).

For Clarifai's OpenAI-compatible inference endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="clarifai"` and provide a Clarifai PAT as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.clarifai.com/v2/ext/openai/v1`, `Authorization: Key`, and `/chat/completions`; model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured because Clarifai's OpenAI compatibility documentation does not document `/models`. See [Clarifai's OpenAI documentation](https://docs.clarifai.com/compute/inference/open-ai/) and [inference overview](https://docs.clarifai.com/compute/inference/).

For Modal Endpoints, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="modal"`, provide the endpoint URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL`, and provide the endpoint's proxy token as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses the endpoint URL plus `/v1/chat/completions` with bearer authentication; model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured because Modal documents endpoint-specific Chat Completions but not an OpenAI model-list route. See [Modal's Endpoints documentation](https://modal.com/docs/guide/endpoints).

For Nscale Serverless Inference, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="nscale"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://inference.api.nscale.com/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval is fail-closed because the documented API reference exposes model listing without a per-model retrieval route. See [Nscale's Create chat completion API reference](https://docs.nscale.com/api-reference/inference/create-chat-completion) and [List models API reference](https://docs.nscale.com/api-reference/models/list-models).

For Ollama's OpenAI-compatible local or cloud API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="ollama"`, provide the server base URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:11434` or `https://ollama.com`), and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY` for cloud access. Local Ollama requests can omit the key because Ollama ignores the compatibility Authorization header. The profile uses `/v1/chat/completions` and `/v1/models`; see [Ollama's OpenAI compatibility documentation](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx) and [API introduction](https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx).

For a self-hosted llama.cpp server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="llamacpp"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:8080`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models`; see [llama.cpp server's API documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) and [server routes](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server.cpp).

For a self-hosted vLLM server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="vllm"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:8000`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models`; see [vLLM's OpenAI-compatible server documentation](https://github.com/vllm-project/vllm/blob/main/docs/serving/online_serving/openai_compatible_server.md) and [quickstart](https://github.com/vllm-project/vllm/blob/main/docs/getting_started/quickstart.md).

For LM Studio's local OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="lmstudio"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:1234`), and optionally provide the configured API token as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models`; see [LM Studio's OpenAI compatibility documentation](https://lmstudio.ai/docs/developer/openai-compat), [Chat Completions](https://beta.lmstudio.ai/docs/developer/openai-compat/chat-completions), and [List Models](https://lmstudio.ai/docs/developer/openai-compat/models).

For Jan's local OpenAI-compatible API server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="jan"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://127.0.0.1:1337`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication; see [Jan's local API server documentation](https://www.jan.ai/docs/desktop/api-server) and [API reference](https://www.jan.ai/docs/desktop/api-preference).

For LocalAI's local OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="localai"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:8080`), and optionally provide `LOCALAI_API_KEY` as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with `Authorization: Bearer` authentication; see [LocalAI's authentication documentation](https://localai.io/docs/features/authentication/), [try it out guide](https://localai.io/docs/basics/try/), and [model setup guide](https://localai.io/docs/getting-started/models/index.html).

For an SGLang server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="sglang"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:30000`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication; see [SGLang's official quickstart](https://github.com/sgl-project/sglang/blob/main/docs/docs/get-started/quickstart.mdx) and [OpenAI-compatible server routes](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/entrypoints/http_server.py).

For a self-hosted Text Generation Inference (TGI) server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="tgi"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:3000`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` with Bearer authentication. Model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured because TGI's official Messages API documentation does not document an OpenAI `/v1/models` route; see [TGI's Messages API documentation](https://huggingface.co/docs/text-generation-inference/main/messages_api).

For a self-hosted TensorRT-LLM `trtllm-serve` server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="tensorrtllm"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:8000`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because TensorRT-LLM's official `trtllm-serve` documentation does not document a per-model retrieval route. See [TensorRT-LLM's `trtllm-serve` documentation](https://nvidia.github.io/TensorRT-LLM/commands/trtllm-serve/trtllm-serve.html) and [quick start guide](https://github.com/NVIDIA/TensorRT-LLM/blob/main/docs/source/quick-start-guide.md).

For a self-hosted Aphrodite Engine server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="aphrodite"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:2242`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because Aphrodite's official server implements model listing but does not document a per-model retrieval route. See [Aphrodite Engine's official repository](https://github.com/Unicorn-Dynamics/aphrodite-engine), [OpenAI API server implementation](https://github.com/Unicorn-Dynamics/aphrodite-engine/blob/main/aphrodite/endpoints/openai/api_server.py), and [OpenAI API server usage documentation](https://github.com/dphnAI/sonar/wiki/2.-Usage).

For a self-hosted KoboldCpp server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="koboldcpp"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:5001`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because KoboldCpp's official OpenAI-compatible API documentation confirms model listing but does not document a per-model retrieval route. See [KoboldCpp's official repository](https://github.com/LostRuins/koboldcpp) and [OpenAI-compatible API notes](https://github.com/LostRuins/koboldcpp?ref=onnetwork.io).

For a self-hosted LMDeploy API server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="lmdeploy"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:23333`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because LMDeploy's official OpenAI-compatible API documentation confirms model listing but does not document a per-model retrieval route. See [LMDeploy's OpenAI-compatible server documentation](https://github.com/InternLM/lmdeploy/blob/main/docs/en/llm/api_server.md) and [API server implementation](https://github.com/InternLM/lmdeploy/blob/main/lmdeploy/serve/openai/api_server.py).

For a self-hosted Xinference server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="xinference"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:9997`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions`, `/v1/models`, and `/v1/models/:model_uid` with optional Bearer authentication. See [Xinference's OpenAI-compatible API documentation](https://github.com/xorbitsai/inference/blob/main/doc/source/getting_started/using_xinference.rst) and [REST API tests](https://github.com/xorbitsai/inference/blob/main/xinference/core/tests/test_restful_api.py).

For a self-hosted text-generation-webui API, start the server with `--api`, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="textgen"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:5000`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions`, `/v1/models`, and `/v1/models/:id` with Bearer authentication; see [text-generation-webui's OpenAI API documentation](https://github.com/oobabooga/text-generation-webui/blob/main/docs/12%20-%20OpenAI%20API.md).

For a self-hosted MLC LLM REST server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="mlc"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:8000`), and optionally provide an API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY` when an external authentication layer is configured. The profile uses `/v1/chat/completions` and `/v1/models`; model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because MLC LLM's official OpenAI-compatible server exposes model listing but does not document a per-model retrieval route. See [MLC LLM's REST server documentation](https://github.com/mlc-ai/mlc-llm/blob/main/docs/get_started/introduction.rst) and [OpenAI-compatible server entrypoints](https://github.com/mlc-ai/mlc-llm/blob/main/python/mlc_llm/serve/entrypoints/openai_entrypoints.py).

For an MLX-LM local server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="mlx"` and provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://127.0.0.1:8080`). The profile uses `/v1/chat/completions` and `/v1/models`. MLX-LM's server does not provide built-in API-key authentication; leave `CLAIMLATCH_PROXY_UPSTREAM_API_KEY` unset for direct local use, or set it only when an external authentication layer is configured to consume the proxy's optional `Authorization: Bearer` header. See [MLX-LM's HTTP model server documentation](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md) and [server implementation](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/server.py).

For a self-hosted FastChat OpenAI-compatible server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="fastchat"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:8000`), and provide `EMPTY` or a configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication. FastChat documents model listing but not `/v1/models/:id`; the proxy therefore returns a local 404 for model retrieval unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured. See [FastChat's OpenAI API documentation](https://github.com/lm-sys/FastChat/blob/main/docs/openai_api.md) and [OpenAI API server implementation](https://github.com/lm-sys/FastChat/blob/main/fastchat/serve/openai_api_server.py).

For a self-hosted OpenLLM server, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="openllm"`, provide the server URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:3000`), and optionally provide the configured API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `/v1/chat/completions` and `/v1/models` with Bearer authentication. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because OpenLLM's official documentation does not document a per-model retrieval route. See [OpenLLM's official documentation](https://github.com/bentoml/openllm) for the local server and OpenAI-compatible client setup.

For AI/ML API's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="aimlapi"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.aimlapi.com` with bearer authentication, `/v1/chat/completions` for Chat Completions, and `/models` for the model list; individual model retrieval fails closed because the official API documents the complete model list but not a per-model retrieval route. See [AI/ML API's SDK guide](https://docs.aimlapi.com/quickstart/supported-sdks) and [model-list reference](https://docs.aimlapi.com/api-references/service-endpoints/complete-model-list).

For Chutes' OpenAI-compatible LLM gateway, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="chutes"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://llm.chutes.ai/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because Chutes documents the shared `/v1/models` catalog but not a per-model retrieval route. See [Chutes' agent connection guide](https://chutes.ai/agents) and [OpenAI-compatible model endpoint documentation](https://chutes.ai/docs/models/chutes-qwen-qwen3-5-397b-a17b-tee).

For Groq's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="groq"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.groq.com/openai/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; the proxy does not enable Groq's separate Responses API route. See [Groq's OpenAI compatibility documentation](https://console.groq.com/docs/openai), [model reference](https://console.groq.com/docs/api-reference), and [supported models](https://console.groq.com/docs/models).

For Hugging Face Inference Providers' OpenAI-compatible endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="huggingface"` and provide a Hugging Face token as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://router.huggingface.co/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; repository-style model IDs containing `/` are forwarded as multi-segment retrieval paths. See [Hugging Face's Inference Providers Hub API documentation](https://huggingface.co/docs/inference-providers/main/hub-api).

For Hyperbolic's OpenAI-compatible inference API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="hyperbolic"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.hyperbolic.xyz/v1`, bearer authentication, and `/chat/completions`; model-list and individual model-retrieval routes fail closed because Hyperbolic documents the serverless inference endpoints as retired. See [Hyperbolic's inference model documentation](https://docs.hyperbolic.ai/inference/overview).

For Inference.net's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="inferencenet"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.inference.net/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because the official API documents model listing but not a per-model retrieval route. See [Inference.net's API Quickstart](https://docs.inference.net/api/api-quickstart).

For IONOS Cloud AI Model Hub's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="ionos"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://openai.inference.de-txl.ionos.com/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because the official OpenAI-compatible contract documents model selection from the shared catalog, not a per-model retrieval route. See [IONOS text generation documentation](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/text-generation) and [OpenAI compatibility migration guide](https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/migration-guide).

For Lamini's OpenAI-compatible inference API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="lamini"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.lamini.ai/inf`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because Lamini documents model listing but not a per-model retrieval route. See [Lamini's OpenAI API documentation](https://docs.lamini.ai/inference/infv2/) and [supported models](https://docs.lamini.ai/models/).

For a self-hosted LiteLLM gateway, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="litellm"`, provide the gateway URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `http://localhost:4000`), and provide the gateway key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses bearer authentication, `/v1/chat/completions`, and `/v1/models`; see [LiteLLM's gateway quickstart](https://docs.litellm.ai/docs/proxy/docker_quick_start) and [proxy overview](https://docs.litellm.ai/docs/).

For OVHcloud AI Endpoints' OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="ovhcloud"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`, bearer authentication, and `/chat/completions`. Its model-list and model-retrieval routes return a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH` is explicitly configured, because OVHcloud documents its model catalog as a separate API. See [OVHcloud's Responses API guide](https://github.com/ovh/docs/blob/develop/pages/public_cloud/ai_machine_learning/endpoints_guide_09_responses_api/guide.en-gb.md) and [AI Endpoints catalog API documentation](https://github.com/ovh/ovhcloud-docs/blob/develop/docs/fr/guides/public-cloud/ai-machine-learning/ai-endpoints-catalog-api.mdx).

The Tencent Hunyuan OpenAI-compatible endpoint is retired: Tencent's official migration notice says the former Hunyuan platform shut down on 2026-09-30. Do not configure new deployments with the legacy `hunyuan` profile; use the `tokenhub` profile instead. The legacy profile remains only for existing configuration compatibility and fails closed for model-list and per-model retrieval routes. See [Tencent Cloud's migration notice](https://cloud.tencent.com/document/product/1729/131925) and [Hunyuan OpenAI compatibility examples](https://cloud.tencent.com/document/product/1729/111007).

For Tencent Cloud TokenHub's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="tokenhub"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://tokenhub.tencentmaas.com/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because TokenHub documents the shared model list but not an OpenAI-compatible `/models/:id` route. Override `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` for the documented international endpoint when needed. See [TokenHub's API usage guide](https://cloud.tencent.com/document/product/1823/130078) and [Hunyuan integration guide](https://cloud.tencent.com/document/product/1823/132252).

For Upstage's OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="upstage"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.upstage.ai/v1`, bearer authentication, and `/chat/completions`. Model listing and per-model retrieval fail closed because Upstage's documented contract does not expose model routes. See [Upstage's Chat API documentation](https://console.upstage.ai/api/chat).

For MiniMax's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="minimax"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.minimax.io/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/{model_id}`; see MiniMax's [Chat Completions API](https://platform.minimax.io/docs/api-reference/text-chat-openai), [model-list API](https://platform.minimax.io/docs/api-reference/models/openai/list-models), and [model-retrieval API](https://platform.minimax.io/docs/api-reference/models/openai/retrieve-model).

For Xiaomi MiMo's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="mimo"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.xiaomimimo.com/v1`, bearer authentication, `/chat/completions`, and `/models`; see [MiMo's official OpenAI-compatible usage guide](https://platform.xiaomimimo.com/docs/en-US/usage-guide/passing-back-reasoning_content) and [model-list API documentation](https://mimo.mi.com/docs/en-US/api/model/list-models).

For Mistral's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="mistral"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.mistral.ai/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; see [Mistral's Chat API](https://docs.mistral.ai/api/endpoint/chat) and [Models API](https://docs.mistral.ai/api/endpoint/models).

For Moonshot's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="moonshot"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.moonshot.ai/v1`, bearer authentication, `/chat/completions`, and `/models`. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because Kimi's official API documents model listing but not a per-model retrieval route; see [Kimi's Chat Completions documentation](https://platform.kimi.ai/docs/api/chat) and [List Models documentation](https://platform.kimi.ai/docs/api/list-models).

For Nebius Token Factory's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="nebius"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.tokenfactory.nebius.com/v1`, bearer authentication, `/chat/completions`, and `/models`; per-model retrieval fails closed because the official OpenAI-compatible Swagger documents model listing but not a `/v1/models/{id}` route. See [Nebius Token Factory's API reference](https://api.tokenfactory.nebius.com/docs).

For Novita AI's OpenAI-compatible LLM API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="novita"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.novita.ai/openai/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; see [Novita's API reference overview](https://docs.novita.ai/api-reference/api-reference-overview), [Chat Completion reference](https://docs.novita.ai/api-reference/model-apis-llm-create-chat-completion), [List Models](https://novita.ai/docs/api-reference/model-apis-llm-list-models.md), and [Retrieve Model](https://novita.ai/docs/api-reference/model-apis-llm-retrieve-model.md).

For Poe's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="poe"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.poe.com/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval is fail-closed because Poe documents model listing without a per-model retrieval route. See [Poe's OpenAI-compatible API guide](https://creator.poe.com/docs/external-applications/openai-compatible-api) and [List available models](https://creator.poe.com/api-reference/listModels).

For Requesty's OpenAI-compatible gateway, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="requesty"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://router.requesty.ai/v1`, bearer-authenticated `/chat/completions`, and the documented `/models` list route; individual model retrieval is fail-closed because the provider does not document a per-model route. See [Requesty's Quickstart](https://docs.requesty.ai/) and [supported models](https://docs.requesty.ai/features/supported-models).

For the direct OpenAI API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="openai"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.openai.com/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; see [OpenAI's Models API reference](https://platform.openai.com/docs/api-reference/models).

For NVIDIA NIM's hosted OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="nvidia"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://integrate.api.nvidia.com/v1`, bearer authentication, `/chat/completions`, and `/models`. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because NVIDIA's hosted API documents model listing but not per-model retrieval. See [NVIDIA's hosted LLM API reference](https://docs.api.nvidia.com/nim/reference/llm-apis) and [NVIDIA NIM Operator documentation](https://docs.nvidia.com/nim-operator/latest/guardrail.html).

For Cohere's Compatibility API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="cohere"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.cohere.ai/compatibility/v1`, bearer authentication, and `/chat/completions`. Model-list and model-retrieval routes return local 404 responses unless explicitly configured because Cohere's official OpenAI compatibility documentation does not document `/models`; its native Models API is a separate contract. See [Cohere's Compatibility API documentation](https://docs.cohere.com/docs/compatibility-api) and [native Models API](https://docs.cohere.com/reference/list-models).

For Alibaba Cloud Model Studio's DashScope OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="dashscope"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://dashscope.aliyuncs.com/compatible-mode/v1`, bearer authentication, `/chat/completions`, and `/models`; see [Alibaba Cloud's base URL overview](https://www.alibabacloud.com/help/en/model-studio/base-url) and [OpenAI-compatible Chat documentation](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/compatibility-of-openai-with-dashscope).

For Databricks Model Serving's OpenAI-compatible AI Gateway, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="databricks"`, provide the workspace URL through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `https://<workspace-host>/ai-gateway/mlflow/v1`), and provide a Databricks OAuth or personal access token as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses bearer authentication and `/chat/completions`; model listing and per-model retrieval return local 404 responses unless explicitly configured because the documented AI Gateway contract is model-name-based Chat Completions rather than a shared model catalog route. See [Databricks' Chat model serving documentation](https://docs.databricks.com/aws/en/machine-learning/model-serving/query-chat-models) and [OpenAI-compatible external model documentation](https://docs.databricks.com/aws/en/machine-learning/foundation-models/external-models).

For Microsoft Foundry Models' OpenAI v1 API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="foundry"`, provide the resource host through `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL` (for example `https://<resource-name>.services.ai.azure.com`), and provide the API key as `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses the documented `api-key` header, `/openai/v1/chat/completions`, `/openai/v1/models`, and `/openai/v1/models/:id` routes. See [Microsoft Foundry's Chat Completions reference](https://learn.microsoft.com/en-us/azure/foundry/openai/latest) and [Models API reference](https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/models).

For DeepInfra's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="deepinfra"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.deepinfra.com/v1`, bearer authentication, `/chat/completions`, and `/models`; model retrieval returns a local 404 because the documented OpenAI model API does not expose a per-model retrieval route, while the separate native catalog API is not treated as an OpenAI-compatible route. See [DeepInfra's OpenAI Chat Completions API](https://docs.deepinfra.com/api-reference/chat-completions/openai-chat-completions), [OpenAI Models API](https://docs.deepinfra.com/api-reference/models/openai-models), and [native model catalog](https://docs.deepinfra.com/api-reference/models/models-list).

For DeepSeek's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="deepseek"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.deepseek.com`, bearer authentication, `/chat/completions`, and `/models`. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because DeepSeek's official API documents model listing but not a per-model retrieval route. See [DeepSeek's List Models API reference](https://api-docs.deepseek.com/api/list-models/) and [authentication reference](https://api-docs.deepseek.com/api/deepseek-api/).

For Featherless AI's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="featherless"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.featherless.ai/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; model IDs containing `/` are forwarded as encoded single-segment retrieval paths. See [Featherless's API overview](https://featherless.ai/docs/api-overview-and-common-options) and [model-list and retrieval reference](https://featherless.ai/docs/api-reference-models).

For Fireworks' OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="fireworks"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.fireworks.ai/inference/v1`, bearer authentication, and `/chat/completions`. Model-list and model-retrieval routes return local 404 responses unless explicitly configured because Fireworks documents model management under the account-scoped `/v1/accounts/{account_id}/models` API rather than the inference-compatible `/models` route. See [Fireworks' Chat Completions API reference](https://docs.fireworks.ai/api-reference/post-chatcompletions), [List Models API reference](https://docs.fireworks.ai/api-reference/list-models), and [Get Model API reference](https://docs.fireworks.ai/api-reference/get-model).

For FriendliAI's serverless OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="friendli"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.friendli.ai/serverless/v1`, bearer authentication, `/chat/completions`, and `/models`. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because FriendliAI documents the serverless model list but not a per-model retrieval route. See [FriendliAI's OpenAI-compatible client guide](https://learn.friendli.ai/articles/4213111023-q10-1-how-do-i-connect-friendliai-with-litellm-or-other-openai-compatible-client) and [Model API availability guide](https://learn.friendli.ai/articles/6490778657-q1-1-which-models-are-available-on-model-api-serverless).

For Google's Gemini OpenAI-compatible endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="gemini"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY` with a Gemini API key. The profile uses `https://generativelanguage.googleapis.com/v1beta/openai`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; see [Google's OpenAI compatibility documentation](https://ai.google.dev/gemini-api/docs/openai).

For Together AI's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="together"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.together.xyz/v1`, bearer authentication, `/chat/completions`, and `/models`. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because Together AI documents model listing but not a per-model retrieval route. See [Together AI's model API reference](https://docs.together.ai/reference/models) and [Chat Completions API reference](https://docs.together.ai/reference/chat-completions).

For Volcengine Ark's OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="volcengine"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://ark.cn-beijing.volces.com/api/v3`, bearer authentication, and `/chat/completions`; model-list and per-model retrieval routes fail closed because the official OpenAI compatibility guide does not document OpenAI `/models` routes. See [Volcengine Ark's OpenAI SDK compatibility guide](https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=en) and [ChatCompletions API reference](https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01).

For xAI's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="xai"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.x.ai/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/:id`; see [xAI's Models API reference](https://docs.x.ai/developers/rest-api-reference/inference/models).

For Z.AI's OpenAI-compatible Chat Completions endpoint, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="zai"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.z.ai/api/paas/v4`, bearer authentication, and `/chat/completions`; model-list and per-model retrieval routes fail closed because they are not documented by the provider. See [Z.AI's Chat Completion API reference](https://docs.z.ai/api-reference/llm/chat-completion).

For Perplexity's Router API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="perplexity"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.perplexity.ai/router/v1`, bearer authentication, `/chat/completions`, and `/models`. Model retrieval returns a local 404 unless `CLAIMLATCH_PROXY_UPSTREAM_MODEL_RETRIEVAL_PATH` is explicitly configured because Perplexity documents the Router model catalog but not a per-model retrieval route. See [Perplexity's Router models documentation](https://docs.perplexity.ai/docs/router/models) and [Router API quickstart](https://docs.perplexity.ai/docs/router/quickstart).

For Baidu Qianfan's v2 OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="qianfan"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://qianfan.baidubce.com/v2`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because Qianfan's documented model-details APIs use separate signed POST actions rather than an OpenAI-compatible `/models/:id` route. See [Qianfan's OpenAI-compatible SDK documentation](https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai), [model-list API reference](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y), and [model-details API reference](https://cloud.baidu.com/doc/qianfan-api/s/Omh4sv3in).

For SambaNova's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="sambanova"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.sambanova.ai/v1`, bearer authentication, `/chat/completions`, and `/models` for both model listing and per-model retrieval. See SambaNova's [official OpenAPI specification](https://raw.githubusercontent.com/sambanova/sambanova-inference-api-spec/refs/heads/main/openapi.documented.json) and [API reference overview](https://docs.sambanova.ai/docs/en/api-reference/overview).

For Scaleway Generative APIs' OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="scaleway"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.scaleway.ai/v1`, bearer authentication, `/chat/completions`, and `/models`; individual model retrieval fails closed because Scaleway documents the shared `/v1/models` endpoint and model catalog, not a per-model retrieval route. See [Scaleway's OpenAI compatibility documentation](https://www.scaleway.com/en/developers/api/generative-apis) and [supported models catalog](https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/).

For SiliconFlow's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="siliconflow"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.siliconflow.cn/v1`, bearer authentication, `/chat/completions`, and `/models`; per-model retrieval fails closed because SiliconFlow's API documentation exposes model listing but not a `/v1/models/{id}` route. See SiliconFlow's [Chat Completions documentation](https://siliconflow.readme.io/reference/chat-completions-1) and [model-list API documentation](https://siliconflow.readme.io/reference/retrieve-a-list-of-models).

For StepFun's OpenAI-compatible API, set `CLAIMLATCH_PROXY_PROVIDER_PROFILE="stepfun"` and provide `CLAIMLATCH_PROXY_UPSTREAM_API_KEY`. The profile uses `https://api.stepfun.ai/v1`, bearer authentication, `/chat/completions`, `/models`, and `/models/{model}`; use `CLAIMLATCH_PROXY_UPSTREAM_BASE_URL="https://api.stepfun.com/v1"` for the documented China platform endpoint. See StepFun's [official model-list documentation](https://platform.stepfun.ai/docs/en/api-reference/models/list), [model-retrieval documentation](https://platform.stepfun.ai/docs/en/api-reference/models/retrieve), and [JSON mode guide](https://platform.stepfun.com/docs/guide/json_mode).

For a custom provider profile, the same example can use a different credential header and relative completion path while retaining the proxy's restricted header policy:

```bash
export CLAIMLATCH_PROXY_UPSTREAM_BASE_URL="https://provider.example"
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY="..."
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY_HEADER="x-api-key"
export CLAIMLATCH_PROXY_UPSTREAM_CHAT_COMPLETIONS_PATH="/v1/chat/completions?profile=custom"
export CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS="x-provider-tenant=prod,x-provider-version=2026-09"
npm run example:provider-proxy
```

See [`examples/provider-compatible-proxy.env.example`](examples/provider-compatible-proxy.env.example) for a credential-free environment variable reference covering hosted profiles, Azure-style deployments, OpenRouter attribution, and custom providers. The file is documentation only; the example does not load `.env` files automatically.

Client request tracing headers such as `X-Request-Id` and provider-specific non-hop-by-hop headers are forwarded. Hop-by-hop, cookie, host, and request body framing headers remain excluded.

Optional proxy settings:

```bash
export CLAIMLATCH_PROXY_HOST="127.0.0.1"
export CLAIMLATCH_PROXY_PORT="4317"
export CLAIMLATCH_REQUIRE_DOCUMENT_PROVENANCE="1"
export CLAIMLATCH_PROXY_UPSTREAM_TIMEOUT_MS="120000"
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY_HEADER="api-key"
export CLAIMLATCH_PROXY_UPSTREAM_CHAT_COMPLETIONS_PATH="/chat/completions"
export CLAIMLATCH_PROXY_UPSTREAM_MODELS_PATH="/models"
export CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS="x-provider-tenant=prod,x-provider-version=2026-09"
export CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES="x-vendor-request-id"
export CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES="x-vendor-rate-"
```

SDK callers can set `upstreamApiKeyHeader` when the generation provider expects a credential header other than `Authorization` (for example, Azure-style `api-key`) and `upstreamApiKeyPrefix` when the provider expects a non-default authentication scheme such as `Api-Key`. The CLI equivalent is `CLAIMLATCH_PROXY_UPSTREAM_API_KEY_PREFIX`; it defaults to `Bearer` for `Authorization` and to no prefix for other credential headers. `upstreamBaseUrl` must be an absolute `http://` or `https://` URL without credentials, query, or fragment. Set `upstreamChatCompletionsPath` when the provider uses a deployment-specific path or query parameter (for example, `/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21`); set `upstreamModelsPath` when its model-list route differs from `/models`, and set `upstreamModelRetrievalPath` when model retrieval uses another route or is unsupported (`null` fails closed). The model-retrieval path defaults to the model-list path. Only relative HTTP paths are accepted; incoming model-list or model-retrieval query strings are appended to the configured path. The defaults remain `authorization`, `/chat/completions`, and `/models`. `maxBufferedResponseBytes`, `maxBufferedChoices`, `maxBufferedChoiceBytes`, and `upstreamTimeoutMs` bound the private model-list/completion response buffer, number of choices, reconstructed choice payload per choice, and upstream request duration before verification. The upstream timeout defaults to 120 seconds; set it to `0` only when the deployment intentionally manages the deadline elsewhere. A client disconnect aborts the in-flight upstream request.

Use `upstreamRequestHeaders` or the CLI's comma-separated `CLAIMLATCH_PROXY_UPSTREAM_REQUEST_HEADERS` (`name=value,name=value`) when a provider requires fixed tenant, version, or routing headers. These server-configured headers override same-name client headers. Authentication, host, cookie, content-type, framing, and hop-by-hop headers remain restricted.

By default, non-streaming and buffered streaming tool-call or multimodal choices fail closed because ClaimLatch cannot infer safe semantics for an action or non-text output. An application may explicitly provide `structuredOutputVerifier` to `createOpenAIProxy`; the hook receives the reconstructed raw choice and a `stream` boolean, and must return a `VerificationReport` after applying the application's tool or multimodal safety policy. Hook failures return `502`, and no SSE frame is released before every choice passes.

The proxy intentionally has a small scope: model listing/retrieval, Chat Completions, text-form user/assistant content, multiple choices, and buffered verified streaming. Model metadata is passthrough only and never releases generated answer content. Structured output requires an application-provided verifier; mixed or unsupported output shapes fail closed instead of dropping unknown parts. Hop-by-hop headers, cookies, host metadata, and request body framing headers are not forwarded to the upstream. By default, only known provider diagnostic response headers are preserved; set `upstreamResponseHeaderNames` or `upstreamResponseHeaderPrefixes` for an explicitly supported provider-specific response header. The CLI accepts comma-separated `CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_NAMES` and `CLAIMLATCH_PROXY_UPSTREAM_RESPONSE_HEADER_PREFIXES` values. Response framing, hop-by-hop, and cookie headers remain blocked even when configured. See [the streaming protocol](docs/STREAMING.md) for the limits and fail-closed behavior.

## SDK

```ts
import {
  ClaimLatch,
  LlmClaimExtractor,
  LlmClaimVerifier,
  OpenAICompatibleClient,
  ProvenanceEvidenceProvider,
  TavilyEvidenceProvider,
} from "claimlatch";

const llm = new OpenAICompatibleClient({
  apiKey: process.env.CLAIMLATCH_LLM_API_KEY,
  model: process.env.CLAIMLATCH_LLM_MODEL!,
});

const search = new TavilyEvidenceProvider({
  apiKey: process.env.TAVILY_API_KEY!,
  primaryDomains: ["docs.example.com"],
});

const gate = new ClaimLatch({
  extractor: new LlmClaimExtractor(llm),
  evidenceProvider: new ProvenanceEvidenceProvider({ provider: search }),
  verifier: new LlmClaimVerifier(llm),
});

const report = await gate.verify({
  question,
  answer: draft,
  policy: {
    minimumCoverage: 1,
    maxUnsupportedClaims: 0,
    maxUnverifiableClaims: 0,
    blockOnContradiction: true,
    requireRetrievedDocumentForDecisiveClaims: true,
  },
});

if (!report.passed) {
  // Do not release the draft as a verified answer.
}
```

All extraction, search, and verification components are defined as interfaces. You can replace the default adapters with a local model, private corpus, official API, or custom RAG system.

### Optional calibrated confidence

Confidence is never inferred from an LLM's self-report. The caller must provide a scorer and a profile fitted offline from independent labels. Without `confidence` configuration, reports contain no confidence field. Adding confidence does not change `PASS`/`BLOCK`, coverage, counts, policy violations, or evidence bindings.

```ts
import { ClaimLatch, type ClaimConfidenceScorer, type ConfidenceCalibrationProfile } from "claimlatch";

const scorer: ClaimConfidenceScorer = {
  id: "my-verifier-v1",
  score: ({ verification }) => verification.status === "SUPPORTED" ? 0.9 : 0.2,
};
const profile: ConfidenceCalibrationProfile = JSON.parse(profileJson) as ConfidenceCalibrationProfile;

const gate = new ClaimLatch({
  extractor,
  evidenceProvider,
  verifier,
  confidence: { scorer, profile },
});
```

The profile maps raw scorer output through a monotonic isotonic calibration and records separate calibration/evaluation dataset hashes. It describes measured verification-status correctness on data similar to the calibration task; it must not be presented as factual truth probability or as a confidence-based release rule.

Tavily search can apply an official-source domain policy. `officialDomains` scopes every search to fixed domains; `resolveOfficialDomains` can return domains from the claim (for example, government, standards, or vendor documentation domains). Configured policy results are filtered again after the API response, and an empty or failing resolver returns no evidence instead of falling back to unrestricted search.

When using `createDefaultClaimLatch`, document hydration can be restricted with an outbound allowlist. Host entries match the exact host and its subdomains; configured ports are checked against explicit URL ports or the scheme defaults (`80` for HTTP and `443` for HTTPS). The allowlist is checked again for every redirect.

```ts
import { createDefaultClaimLatch } from "claimlatch";

const gate = createDefaultClaimLatch({
  llmModel: "your-verifier-model",
  tavilyApiKey: process.env.TAVILY_API_KEY!,
  outboundAllowlist: {
    hosts: ["docs.example.com", "www.example.org"],
    ports: [443],
  },
});
```

## Application integration example

`verifyBeforeRelease` returns a draft only when it passes at the application's final delivery boundary. On BLOCK it throws `ClaimLatchBlockedError` with the verification report, so the error path can keep the draft away from the user.

```bash
export CLAIMLATCH_EXAMPLE_QUESTION="What is the current release status?"
export CLAIMLATCH_EXAMPLE_DRAFT="The current release is stable."
export CLAIMLATCH_LLM_MODEL="your-verifier-model"
export CLAIMLATCH_LLM_API_KEY="..."
export TAVILY_API_KEY="..."

npm run example:guarded
```

The complete example is in [`examples/guarded-answer.ts`](examples/guarded-answer.ts). In a real application, replace `CLAIMLATCH_EXAMPLE_DRAFT` with the result of the generation call and deliver only the `answer` returned by `verifyBeforeRelease`.

For an HTTP integration, ClaimLatch also provides `createGuardedAnswerServer`. It exposes `GET /health` and `POST /answer` by default; set `healthPath` and `answerPath` to mount the same fail-closed handler under framework-specific routes. A passing request returns the verified answer, a blocked request returns `422` with its report, and verification failures return `502` without releasing the draft.

```bash
export CLAIMLATCH_LLM_MODEL="your-verifier-model"
export CLAIMLATCH_LLM_API_KEY="..."
export TAVILY_API_KEY="..."

npm run example:guarded-http
curl -X POST http://127.0.0.1:4318/answer \
  -H 'content-type: application/json' \
  -d '{"question":"What is the current release status?","draft":"The current release is stable."}'
```

The complete service example is in [`examples/guarded-http-service.ts`](examples/guarded-http-service.ts). The service keeps the gate at the final delivery boundary and never returns a blocked draft as an answer.

For Fetch-native runtimes such as Next.js Route Handlers, Cloudflare Workers, Deno, or Bun, use `createGuardedAnswerFetchHandler`. It accepts `Request` objects and returns `Response` objects without adding a web framework dependency:

```ts
import { createDefaultClaimLatch, createGuardedAnswerFetchHandler } from "claimlatch";

const gate = createDefaultClaimLatch({
  llmModel: process.env.CLAIMLATCH_LLM_MODEL!,
  tavilyApiKey: process.env.TAVILY_API_KEY!,
});
const guarded = createGuardedAnswerFetchHandler({
  gate,
  healthPath: "/api/health",
  answerPath: "/api/answer",
});

export const GET = guarded;
export const POST = guarded;
```

The complete route-oriented example is in [`examples/fetch-route-handler.ts`](examples/fetch-route-handler.ts). It keeps the same fail-closed contract as the Node HTTP integration, including 413 request-size limits, 422 blocked reports, and 502 fail-closed verification errors. Custom paths must be absolute URL paths without query strings or fragments.

For a Next.js App Router route, copy [`examples/next-route-handler.ts`](examples/next-route-handler.ts) to a route such as `app/api/answer/route.ts`. It exports the framework-native `GET` and `POST` handlers, explicitly selects the Node.js runtime required by the default gate, initializes the gate lazily, and keeps credentials out of module-load time.

For Remix route modules, copy the `loader` export from [`examples/remix-route-handler.ts`](examples/remix-route-handler.ts) to `app/routes/health.ts` and the `action` export to `app/routes/answer.ts`. Both routes share the same lazy gate initialization and preserve the guarded integration's fail-closed responses without adding a Remix dependency to the core package.

For Cloudflare Workers, copy [`examples/cloudflare-worker.ts`](examples/cloudflare-worker.ts) into the Worker module and export its default object. Bind `CLAIMLATCH_LLM_MODEL`, `TAVILY_API_KEY`, and optional `CLAIMLATCH_LLM_API_KEY` / `CLAIMLATCH_LLM_BASE_URL` through the Worker environment; the adapter passes each `Request` to the same Fetch-native guarded handler and keeps the core package dependency-light.

For Deno, use [`examples/deno-server.ts`](examples/deno-server.ts) as the default Fetch-native module. It reads the verifier settings through `Deno.env` and initializes the gate lazily on the first request. After `npm run build`, start the compiled module with `deno serve --allow-env --allow-net --port 4318 dist/examples/deno-server.js`. Deno's `deno serve` command invokes the exported `fetch` handler without requiring a framework dependency; see [Deno's HTTP server documentation](https://docs.deno.com/runtime/fundamentals/http_server/).

For Bun, use [`examples/bun-server.ts`](examples/bun-server.ts) as the default Fetch-native module. It reads the verifier settings through `Bun.env` and initializes the gate lazily on the first request. After `npm run build`, start the compiled module with `bun --port 4318 dist/examples/bun-server.js`. Bun starts the default export's `fetch` handler with `Bun.serve` without requiring an additional framework dependency; see [Bun's HTTP server documentation](https://bun.sh/docs/runtime/http/server).

For Express, install and enable `express.json()` before mounting the adapter from [`examples/express-route-handler.ts`](examples/express-route-handler.ts). It converts Express's parsed JSON request and response objects to the same Fetch-native guarded handler without adding Express to ClaimLatch's package dependencies:

```ts
import express from "express";
import { createExpressGuardedAnswerHandler } from "claimlatch/examples/express-route-handler.js";

const app = express();
app.use(express.json());
app.all("/answer", createExpressGuardedAnswerHandler());
app.listen(3000);
```

For Fastify, enable its built-in JSON content-type parser and mount the adapter from [`examples/fastify-route-handler.ts`](examples/fastify-route-handler.ts). It maps Fastify's parsed request body and `reply` methods to the same Fetch-native guarded handler without adding Fastify to ClaimLatch's package dependencies:

```ts
import Fastify from "fastify";
import { createFastifyGuardedAnswerHandler } from "claimlatch/examples/fastify-route-handler.js";

const app = Fastify();
app.all("/answer", createFastifyGuardedAnswerHandler());
await app.listen({ host: "127.0.0.1", port: 3000 });
```

For Hono, mount the adapter from [`examples/hono-route-handler.ts`](examples/hono-route-handler.ts). It passes Hono's `c.req.raw` request to the same Fetch-native guarded handler without adding Hono to ClaimLatch's package dependencies:

```ts
import { Hono } from "hono";
import { createHonoGuardedAnswerHandler } from "claimlatch/examples/hono-route-handler.js";

const app = new Hono();
app.post("/answer", createHonoGuardedAnswerHandler());
export default app;
```

For SvelteKit, copy [`examples/sveltekit-route-handler.ts`](examples/sveltekit-route-handler.ts) to a `+server.ts` route and export the adapter as the `POST` handler. It passes SvelteKit's `event.request` to the same Fetch-native guarded handler without adding SvelteKit to ClaimLatch's package dependencies:

```ts
import { createSvelteKitGuardedAnswerHandler } from "claimlatch/examples/sveltekit-route-handler.js";

export const POST = createSvelteKitGuardedAnswerHandler();
```

For AWS Lambda behind API Gateway HTTP API payload format `2.0`, use [`examples/aws-lambda-http-api-handler.ts`](examples/aws-lambda-http-api-handler.ts). It converts the Lambda event to a Fetch `Request` and returns the guarded `Response` as a base64-encoded Lambda proxy response without adding an AWS SDK dependency. Configure the API Gateway integration with payload format version `2.0`; see [AWS's HTTP API Lambda proxy integration documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html).

```ts
import { createAwsLambdaHttpApiV2Handler } from "claimlatch/examples/aws-lambda-http-api-handler.js";

export const handler = createAwsLambdaHttpApiV2Handler();
```

For Koa, enable a JSON body parser and mount the adapter from [`examples/koa-route-handler.ts`](examples/koa-route-handler.ts). It maps Koa's parsed `ctx.request` and `ctx.response` objects to the same Fetch-native guarded handler without adding Koa to ClaimLatch's package dependencies; see [Koa's context documentation](https://koajs.com/#context).

```ts
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { createKoaGuardedAnswerHandler } from "claimlatch/examples/koa-route-handler.js";

const app = new Koa();
app.use(bodyParser());
app.use(createKoaGuardedAnswerHandler());
app.listen(3000);
```

For Hapi, enable a JSON payload parser and mount the adapter from [`examples/hapi-route-handler.ts`](examples/hapi-route-handler.ts). It maps Hapi's parsed request payload and response toolkit to the same Fetch-native guarded handler without adding Hapi to ClaimLatch's package dependencies; see [Hapi's server methods documentation](https://hapi.dev/api/?v=21.4.0#-serverrouteoptions).

```ts
import Hapi from "@hapi/hapi";
import { createHapiGuardedAnswerHandler } from "claimlatch/examples/hapi-route-handler.js";

const server = Hapi.server({ port: 3000 });
server.route({
  method: "POST",
  path: "/answer",
  handler: createHapiGuardedAnswerHandler(),
});
await server.start();
```

### Structured-output proxy policy example

`structuredOutputVerifier` is the application-owned safety boundary for tool calls and multimodal output. The runnable example below allows only the comma-separated tool names in `CLAIMLATCH_ALLOWED_TOOLS`; any other tool call is returned as a deterministic BLOCK report. The example uses a local policy report for structured output and the configured ClaimLatch gate for ordinary textual responses.

```bash
export CLAIMLATCH_LLM_MODEL="your-verifier-model"
export CLAIMLATCH_LLM_API_KEY="..."
export TAVILY_API_KEY="..."
export CLAIMLATCH_PROXY_UPSTREAM_API_KEY="..."
export CLAIMLATCH_ALLOWED_TOOLS="lookup,search"

npm run example:structured
```

The complete example is in [`examples/structured-output-verifier.ts`](examples/structured-output-verifier.ts). It demonstrates the important boundary: ClaimLatch does not infer whether an action is safe; the application must define and verify its own allowlist before any buffered stream is released.

## Signed verification receipts

A verification report can be wrapped in an Ed25519-signed receipt. The receipt includes the report and public key in its payload, then signs the complete payload using canonical JSON serialization.

```ts
import {
  createSignedVerificationReceipt,
  hashVerificationReceiptPayload,
  verifySignedVerificationReceipt,
} from "claimlatch";

const receipt = createSignedVerificationReceipt(report, {
  privateKeyPem: process.env.CLAIMLATCH_RECEIPT_PRIVATE_KEY!,
  publicKeyPem: process.env.CLAIMLATCH_RECEIPT_PUBLIC_KEY!,
  keyId: "production-verifier-2026",
});

const isAuthentic = verifySignedVerificationReceipt(receipt);
const payloadSha256 = hashVerificationReceiptPayload(receipt.payload);
```

The signature does not establish that the report is factually correct. It only authenticates that the signed report payload has not changed and was verified against a particular public key. Manage the private key using an environment-appropriate secure mechanism such as a secret manager.

`hashVerificationReceiptPayload` returns the same canonical payload SHA-256 surfaced by the receipt CLI JSON output, so SDK audit records can correlate with CLI verification logs.

For a simple persistent backend, ClaimLatch includes a filesystem store. Receipt IDs are validated as safe filenames, writes use a temporary file followed by rename, and missing receipts return `undefined`; the store does not replace signature verification.

```ts
import {
  FileVerificationReceiptStore,
  verifySignedVerificationReceipt,
} from "claimlatch";

const store = new FileVerificationReceiptStore({ directory: "./var/claimlatch-receipts" });
await store.save("answer-2026-09-29-001", receipt);

const stored = await store.load("answer-2026-09-29-001");
const authentic = stored !== undefined && verifySignedVerificationReceipt(stored);
```

For key rotation, issue a unique non-empty `keyId` for each signing key and keep old public keys available for the receipt retention period. Resolve the key by `keyId` when verifying; removing a retired key intentionally makes receipts signed by it fail closed.

```ts
const publicKeys: Record<string, string> = {
  "production-verifier-2026": process.env.CLAIMLATCH_RECEIPT_PUBLIC_KEY_2026!,
  "production-verifier-2027": process.env.CLAIMLATCH_RECEIPT_PUBLIC_KEY_2027!,
};

const authenticAfterRotation = verifySignedVerificationReceipt(stored!, {
  keyResolver: (keyId) => (keyId ? publicKeys[keyId] : undefined),
});
```

Receipts can also be verified from automation without provider credentials:

```bash
claimlatch-receipt verify --file ./var/claimlatch-receipts/answer-2026-09-29-001.json
claimlatch-receipt verify --file ./var/claimlatch-receipts/answer-2026-09-29-001.json --json
```

The command exits `0` for a valid signature, `1` for an invalid receipt or signature, and `2` for usage or file errors.

Receipt verification also fails closed when a signed payload does not contain the required verification report shape, even if its cryptographic signature is valid.

With `--json`, the output includes `valid`, `file`, and, when the receipt has the expected signed shape, its `version`, `algorithm`, and `keyId`; `publicKeyFile` is included when an external trust anchor was supplied. When signature verification succeeds, the signed report's `decision` (`PASS` or `BLOCK`), `generatedAt`, `coverage`, claim status `counts`, and `payloadSha256` (the SHA-256 hash of the canonical signed payload) are also included.

The default mode verifies against the public key embedded in the receipt. For an external trust anchor, pass `--public-key-file <path>`; verification then fails closed if the receipt was signed by a different key.

Do not put private keys in the receipt directory or source control. Use a secret manager/HSM, restrict receipt directory permissions, define a retention policy, and back up receipts with their public-key registry if historical verification is required.

The runnable [`examples/receipt-storage.ts`](examples/receipt-storage.ts) example generates an ephemeral Ed25519 key, saves a receipt, loads it from the filesystem store, and verifies it through a key resolver:

```bash
npm run example:receipts
```

The example prints the receipt ID, verification result, and canonical signed payload `payloadSha256` for audit logs; importing the example module does not write files or execute the demo.

The generated key is for demonstration only. Production applications should load signing keys from a secret manager or HSM and use a durable, access-controlled receipt directory.

## Evidence provenance

When document hydration succeeds, ClaimLatch stores:

- the final source URL after validated redirects
- the exact quote passed to the verifier
- character offsets for the quote in normalized source text
- for PDFs, the page number and page-local quote offsets
- retrieval time and content type
- SHA-256 of the normalized retrieved document

This makes a verdict auditable. It does not prove that the publisher is correct or that HTML extraction preserved every piece of context.

The built-in fetcher blocks localhost (including fully qualified forms), embedded URL credentials, private-network, reserved, documentation, multicast, unspecified, and other non-routable IPv4/IPv6 targets. Credential-bearing evidence URLs are also redacted from fallback evidence metadata. It resolves DNS addresses before making a request; DNS lookup and document transfer share the request timeout, and any non-public result fails closed before the connection is pinned to a selected public IP. Redirects are validated again, and response size is limited. If you provide a custom fetch/request transport, you must preserve the same protections yourself. See `docs/TRUST_MODEL.md` and `SECURITY.md` for remaining network risks.

For deployments with a restricted egress policy, configure `outboundAllowlist` on `ProvenanceEvidenceProvider` or `createDefaultClaimLatch`. A blocked host or port never reaches the configured fetch transport and falls back to search-snippet provenance.

`application/pdf` documents are extracted page by page with PDF.js. Quotes are linked to the most relevant page, and the page number plus page-local offsets are recorded in provenance. If PDF parsing or text extraction fails, the document is not used as decisive document evidence and the provider falls back to search-snippet provenance.

## Default gate policy

The default policy is intentionally strict:

- blocks every contradiction
- blocks a cross-source contradiction when distinct sources support and contradict the same claim
- allows no unsupported claims
- allows no unverifiable claims
- requires 100% evidence coverage
- requires every critical claim to be `SUPPORTED`
- fails closed when no verifiable claims are extracted

Document-level provenance can be enabled as an additional strict policy. It is not enabled by default because some otherwise valid sources cannot be fetched reliably.

Core invariants are checked again after custom providers return. Duplicate claim IDs are rejected, nonexistent evidence bindings are removed, and decisive verdicts without valid evidence bindings are downgraded to `UNVERIFIABLE`.

## Independent-label benchmark

`benchmarks/independent.jsonl` contains 200 cases across 100 paired topics, with one positive and one negative answer per topic. Each case records a public label-source URL, and labels were not generated from ClaimLatch output. The same frozen aggregate is partitioned into `benchmarks/train.jsonl` (164 cases), `benchmarks/dev.jsonl` (24 cases), and `benchmarks/test.jsonl` (12 cases), with balanced positive and negative labels in every split.

The default `claimlatch-bench` command verifies `benchmarks/independent.jsonl` against `benchmarks/MANIFEST.json` before contacting any model or evidence provider. For a custom dataset, pass `--manifest <path>` to enable the same SHA-256 and case-count check; a mismatch fails closed before a benchmark report is produced.

Benchmark reports include decision accuracy, false-pass/false-block rates, and `averageCoverage`, the arithmetic mean of the per-case evidence coverage reported by the gate. Text and JSON expose these as top-level fields; JUnit emits suite properties and SARIF emits run properties. Coverage is not accuracy and is not a probability calibration score.

Use `claimlatch-bench --validate` to verify the selected JSONL dataset and manifest without provider credentials or live model/evidence calls. Add `--json` for machine-readable validation output; `--validate` supports only text and JSON formats.

For a credential-free repository check, run `npm run bench:validate`. The same command runs in [the benchmark validation workflow](.github/workflows/benchmark-validation.yml) when benchmark inputs or validation code change.

When adding or editing frozen benchmark files, run `npm run bench:manifest` to print the deterministic SHA-256 manifest JSON for review or redirection into `benchmarks/MANIFEST.json`. The command does not modify repository files by itself.

Run it with configured live providers:

```bash
claimlatch-bench --dataset benchmarks/independent.jsonl
# or
npm run bench
```

Run one frozen split with the same manifest verification:

```bash
claimlatch-bench --split train
claimlatch-bench --split dev
claimlatch-bench --split test
```

`--split` accepts `train`, `dev`, or `test` and cannot be combined with `--dataset`. The default is the 200-case `independent.jsonl` aggregate.

Use `claimlatch-bench --help` for the complete option list without configuring provider credentials.

For an explicit integrity check, pass the manifest alongside the dataset:

```bash
claimlatch-bench --dataset benchmarks/independent.jsonl --manifest benchmarks/MANIFEST.json
```

Run an individual frozen split when tuning or validating a configuration:

```bash
claimlatch-bench --dataset benchmarks/train.jsonl
claimlatch-bench --dataset benchmarks/dev.jsonl
claimlatch-bench --dataset benchmarks/test.jsonl
```

The benchmark CLI defaults to human-readable text. Use `--format json`, `--format junit`, or `--format sarif` for CI and automation. The legacy `--json` flag remains supported.

```bash
claimlatch-bench --dataset benchmarks/independent.jsonl --format junit > claimlatch-benchmark.xml
claimlatch-bench --dataset benchmarks/independent.jsonl --format sarif > claimlatch-benchmark.sarif
```

JUnit includes every benchmark case and marks incorrect decisions as failures. SARIF emits incorrect decisions as `FALSE_PASS` or `FALSE_BLOCK` results with deterministic benchmark-line locations. These formats serialize the observed run; they do not create or infer benchmark results.

JSON benchmark reports preserve each case's optional `labelSourceUrls` and `note` metadata. SARIF includes the same provenance fields in result properties for incorrect cases, so downstream automation can retain the independent label context.

Reported metrics:

- decision accuracy against the dataset labels
- **false-pass rate**: the fraction of deliberately incorrect answers that pass the gate
- false-block rate: the fraction of correctly labeled answers that the gate rejects

This is a frozen regression dataset, not a publication-quality benchmark. Do not tune prompts against the test split and then describe the result as an independent evaluation.

## Confidence semantics and offline calibration

A badge such as `87% trustworthy` would reproduce the problem ClaimLatch is meant to address. ClaimLatch's optional confidence value is narrower: it estimates status correctness for a calibrated verification pipeline, not global truth, completeness, source authority, or answer safety. The deterministic policy gate remains the only release decision.

Generate a profile offline with separate JSONL datasets for calibration and evaluation. Each observation contains a predicted status, an independently labelled expected status, a raw scorer output, source case/claim identifiers, and label source URLs.

```bash
claimlatch-calibrate \
  --calibration ./calibration.jsonl \
  --evaluation ./evaluation.jsonl \
  --output ./confidence-profile.json \
  --profile-id verifier-status-v1 \
  --scorer-id my-verifier-v1 \
  --created-at 2026-09-30T00:00:00.000Z
```

The command writes the validated profile only after checking dataset hashes, independent source case/claim pairs, monotonic mapping constraints, and evaluation metrics. It prints deterministic evaluation JSON to stdout and requires no provider credentials. Do not call calibration experiments complete until the independently labelled fixture and generated metrics are committed and reviewed.

Validate calibration and evaluation datasets before fitting a profile, without providing scorer metadata or writing an output file:

```bash
claimlatch-calibrate \
  --validate \
  --calibration ./calibration.jsonl \
  --evaluation ./evaluation.jsonl \
  --json
```

Validation reports the canonical SHA-256 hash and observation count for each dataset, and fails closed when manifests are invalid, datasets are empty, or source case/claim pairs overlap.

The repository includes a committed independent-label fixture under [`benchmarks/`](benchmarks/): `confidence-calibration.jsonl` and `confidence-evaluation.jsonl` contain 12 disjoint observations each, while `confidence-profile.json` and `confidence-evaluation.json` are the profile and deterministic metrics generated from them. The raw scores use the named fixture scorer `claimlatch-fixture-scorer-v1`; these artifacts demonstrate reproducibility and status-correctness semantics, not live provider performance or a production trust guarantee. The fixture regression test regenerates both outputs before accepting them.

## Offline demo

The offline demo shows the gate with deterministic fake providers and makes no network or model calls.

```bash
npm run demo
```

It demonstrates plumbing, not factuality benchmark performance.

## Trust boundary

PASS is not proof of universal truth. Claim extraction, search, source selection, document parsing, and entailment can all fail. Read [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) before using ClaimLatch in high-stakes decisions.

## Project status

`0.3.86` adds credential-free calibration and evaluation dataset validation with canonical hashes, observation counts, disjoint source case/claim checks, and release metadata consistency coverage. The repository also carries a committed independently labelled calibration fixture with reproducible profile and evaluation artifacts.

`0.3.85` adds opt-in calibrated verification-status confidence with offline isotonic fitting, evaluation metrics, CLI profile generation, signed receipt coverage, package-root exports, and fail-closed duplicate CLI/proxy header configuration validation.

`0.3.84` adds deterministic `npm run bench:manifest` generation for frozen benchmark SHA-256 manifests and case counts.

`0.3.83` expands the frozen independent benchmark to 84 balanced cases across 42 paired topics with an IETF RFC 9110-backed HTTP 202 Accepted pair.

`0.3.82` expands the frozen independent benchmark to 82 balanced cases across 41 paired topics with an IETF RFC 9110-backed HTTP 204 No Content pair.

`0.3.81` adds a dependency-light Cloudflare Workers integration example using environment bindings with the Fetch-native guarded answer handler.

`0.3.80` expands the frozen independent benchmark to 80 balanced cases across 40 paired topics with a Google Gemini OpenAI compatibility endpoint pair.

`0.3.79` adds a Google Gemini OpenAI-compatible Chat Completions proxy provider profile with the documented bearer-authenticated endpoint.

`0.3.78` expands the frozen independent benchmark to 78 balanced cases with an IETF RFC 9110-backed HTTP 201 Created pair.

`0.3.77` expands the frozen independent benchmark to 76 balanced cases, adds production dependency auditing and npm caching to CI, and extends DNS/SSRF regression coverage.

`0.3.76` adds a Remix route module example that maps `loader` and `action` to the Fetch-native guarded integration.

`0.3.75` updates the receipt storage example to print the canonical signed payload SHA-256 and remain safe to import without running the demo.

`0.3.74` explicitly selects the Node.js runtime required by the default gate in the Next.js example.

`0.3.73` redacts embedded URL credentials from fallback evidence metadata.

`0.3.72` adds a Next.js App Router route handler example with lazy gate initialization.

`0.3.71` normalizes trailing-dot hostnames when comparing evidence sources for cross-source contradictions.

`0.3.70` rejects OpenRouter attribution URLs containing embedded username or password credentials before they become upstream headers.

`0.3.69` rejects HTTP(S) evidence URLs containing embedded username or password credentials before provenance hydration.

`0.3.68` exposes the canonical signed payload SHA-256 after successful receipt verification in the receipt CLI JSON output.

`0.3.67` rejects empty receipt key IDs during creation as well as verification.

`0.3.66` hardens signed receipt validation so present key IDs cannot be empty or whitespace-only.

`0.3.65` applies the document request timeout to provenance DNS lookup and fails closed when a resolver hangs.

`0.3.64` hardens literal local-host filtering to reject fully qualified localhost and `.local` hostnames with trailing root labels before hydration.

`0.3.63` hardens provenance URL and DNS-result filtering to reject reserved, documentation, multicast, unspecified, and other non-routable IPv4/IPv6 targets before hydration or pinned DNS requests.

`0.3.62` hardens signed receipt key metadata validation so empty signatures, empty public keys, and non-string key IDs fail closed.

`0.3.61` fixes provider-compatible proxy example entrypoint detection across POSIX and Windows paths.

`0.3.60` hardens signed receipt verification to reject malformed claim verification and policy violation entries.

`0.3.59` hardens signed receipt verification so cryptographically valid receipts with malformed verification report shapes fail closed.

`0.3.58` fixes the provider-compatible proxy example so custom model-list paths and provider request headers use the same resolver as the CLI.

`0.3.57` adds verified receipt coverage and claim status counts to `claimlatch-receipt verify --json` while keeping malformed summaries and invalid signatures fail-closed.

`0.3.56` adds verified receipt decision and generation-time metadata to `claimlatch-receipt verify --json` output while keeping invalid signatures fail-closed.

`0.3.55` exposes signed receipt version, algorithm, and key ID metadata in `claimlatch-receipt verify --json` output for audit automation.

`0.3.54` adds bounded OpenAI-compatible model retrieval passthrough for `/v1/models/:id` and `/models/:id` with path-safe model ID encoding.

`0.3.53` adds fail-closed custom route paths for the guarded Node HTTP and Fetch integrations.

`0.3.52` adds bounded OpenAI-compatible model listing passthrough for `/v1/models` and `/models`, including provider-specific paths and fail-closed response limits.

`0.3.51` exposes benchmark aggregate metrics in JUnit suite properties and SARIF run properties.

`0.3.50` adds a DeepInfra-compatible proxy profile for OpenAI-compatible Chat Completions.

`0.3.49` adds a direct OpenAI API-compatible proxy profile while preserving the existing Azure-style default.

`0.3.48` adds a Hugging Face Inference Providers-compatible proxy profile for OpenAI-compatible Chat Completions.

`0.3.47` adds a Fetch-standard guarded answer integration and a route-oriented framework example with fail-closed request handling.

`0.3.46` adds a credential-free benchmark validation script and GitHub Actions workflow for frozen dataset manifest checks.

`0.3.45` adds average evidence coverage to benchmark reports while keeping coverage distinct from decision accuracy and probability calibration.

`0.3.44` adds a credential-free provider-compatible proxy environment variable example covering hosted, Azure-style, OpenRouter, and custom configurations.

`0.3.43` adds an NVIDIA NIM-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

`0.3.42` adds a SambaNova-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

`0.3.41` adds a Cerebras-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

`0.3.40` adds a Perplexity Router API-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

`0.3.39` adds an xAI-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

`0.3.38` expands the frozen independent-label benchmark to 74 balanced cases across 37 paired topics while keeping the test split unchanged.

`0.3.37` consolidates static proxy provider profile definitions into a single immutable map while preserving resolver behavior.

`0.3.36` clarifies conditional upstream base URL requirements in proxy CLI help and adds hosted profile resolver coverage.

`0.3.35` adds a Fireworks-compatible provider profile for the proxy's Chat Completions path.

`0.3.34` adds a Together AI-compatible provider profile for the proxy's Chat Completions path.

`0.3.33` adds a DeepSeek-compatible provider profile for the proxy's Chat Completions path.

`0.3.32` centralizes supported proxy provider profile names so the CLI, SDK types, and runtime validation stay consistent.

`0.3.31` adds a Cohere Compatibility API provider profile for the proxy's Chat Completions path.

`0.3.30` adds a Mistral-compatible provider profile for the proxy's Chat Completions path.

`0.3.29` adds a Groq-compatible provider profile for the proxy's Chat Completions path.

`0.3.28` connects provider compatibility profiles to the proxy CLI with explicit override support.

`0.3.27` adds an OpenRouter-compatible provider profile to the proxy example with fail-closed attribution metadata validation.

`0.3.26` preserves benchmark label source URLs and notes in JUnit output for incorrect cases, in addition to JSON and SARIF results for downstream provenance tracking. `0.3.25` preserves benchmark label source URLs and notes in JSON and SARIF results for downstream provenance tracking. `0.3.24` adds strict validation for benchmark label source URLs so malformed provenance metadata fails closed. `0.3.23` adds fail-closed validation for unknown `claimlatch-receipt` CLI options. `0.3.22` shares upstream request header parsing between the proxy CLI and provider-compatible proxy example with regression coverage. `0.3.21` extends the provider-compatible proxy example with fixed upstream request header configuration. `0.3.20` adds fixed upstream request header injection for provider tenant, version, and routing compatibility through the SDK and CLI. `0.3.19` expands the frozen independent benchmark to 62 balanced cases across 31 paired topics and updates the train/dev/test splits. `0.3.18` adds optional trusted `--public-key-file` input to `claimlatch-receipt verify` for external receipt-signing key validation. `0.3.17` adds credential-free `claimlatch-receipt verify` CLI support with fail-closed exit codes for signed receipt automation. `0.3.16` adds credential-free `claimlatch-bench --validate` dataset and manifest verification output for local and CI checks. `0.3.15` adds credential-free `claimlatch-proxy --help` output documenting setup, routes, compatibility settings, and fail-closed behavior. `0.3.14` adds a reusable fail-closed HTTP integration with a runnable guarded-answer service example. `0.3.13` adds explicit provider response-header name and prefix configuration for the SDK, proxy CLI, and compatibility example while keeping response framing, cookie, and hop-by-hop headers blocked. `0.3.12` added credential-free `claimlatch-bench --help` output for discovering dataset, split, manifest, and format options. `0.3.11` added fail-closed `claimlatch-bench --split train|dev|test` selection for the frozen benchmark partitions. The release also preserves additional provider diagnostic `X-Goog-*`, `X-Amzn-*`, and `Anthropic-*` response headers through the compatible proxy, includes the custom provider compatibility profile regression test and configuration example, the frozen independent benchmark with 62 balanced cases across 31 paired topics using public primary-source labels, fail-closed benchmark manifest verification before live provider calls, SDK helpers and custom `--manifest` support, a SHA-256 integrity manifest for the frozen benchmark files and cross-platform line-ending-independent verification, hardened provenance, core provider invariant enforcement, an OpenAI-compatible proxy, an independent benchmark runner, signed verification receipts, multi-choice and structured-output proxy verification, provider-specific credential header and completion path compatibility, fail-closed upstream URL validation, and guarded application integration examples. Before `1.0`, public APIs and provider behavior may change.

## License

Apache-2.0
