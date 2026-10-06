import assert from "node:assert/strict";
import test from "node:test";
import {
  PROXY_PROVIDER_PROFILE_NAMES,
  formatProxyProviderProfileNames,
  resolveProxyProviderProfile,
} from "../src/proxy-profiles.js";

test("proxy profile names are centralized for CLI and SDK consumers", () => {
  assert.deepEqual(PROXY_PROVIDER_PROFILE_NAMES, [
    "ai21",
    "aimlapi",
    "aphrodite",
    "azure",
    "baichuan",
    "baseten",
    "cerebras",
    "cerebrium",
    "chutes",
    "clarifai",
    "cloudflare",
    "cohere",
    "databricks",
    "dashscope",
    "deepinfra",
    "deepseek",
    "featherless",
    "fastchat",
    "fireworks",
    "friendli",
    "foundry",
    "gemini",
    "groq",
    "huggingface",
    "hyperbolic",
    "inferencenet",
    "ionos",
    "jan",
    "koboldcpp",
    "lamini",
    "litellm",
    "llamacpp",
    "lmdeploy",
    "lmstudio",
    "localai",
    "mlc",
    "mlx",
    "hunyuan",
    "minimax",
    "mimo",
    "mistral",
    "modal",
    "moonshot",
    "nebius",
    "nscale",
    "novita",
    "nvidia",
    "ollama",
    "openllm",
    "openai",
    "openrouter",
    "ovhcloud",
    "perplexity",
    "poe",
    "qianfan",
    "requesty",
    "sambanova",
    "scaleway",
    "sglang",
    "siliconflow",
    "stepfun",
    "textgen",
    "tgi",
    "tensorrtllm",
    "together",
    "tokenhub",
    "upstage",
    "vllm",
    "volcengine",
    "xinference",
    "xai",
    "zai",
  ]);
  assert.equal(
    formatProxyProviderProfileNames(),
    "ai21, aimlapi, aphrodite, azure, baichuan, baseten, cerebras, cerebrium, chutes, clarifai, cloudflare, cohere, databricks, dashscope, deepinfra, deepseek, featherless, fastchat, fireworks, friendli, foundry, gemini, groq, huggingface, hyperbolic, inferencenet, ionos, jan, koboldcpp, lamini, litellm, llamacpp, lmdeploy, lmstudio, localai, mlc, mlx, hunyuan, minimax, mimo, mistral, modal, moonshot, nebius, nscale, novita, nvidia, ollama, openllm, openai, openrouter, ovhcloud, perplexity, poe, qianfan, requesty, sambanova, scaleway, sglang, siliconflow, stepfun, textgen, tgi, tensorrtllm, together, tokenhub, upstage, vllm, volcengine, xinference, xai, or zai",
  );
});

test("proxy profiles provide Azure-compatible defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("azure"), {
    upstreamApiKeyHeader: "api-key",
    upstreamChatCompletionsPath: "/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21",
    upstreamModelsPath: "/openai/models?api-version=2024-10-21",
  });
});

test("proxy profiles provide Aphrodite-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("aphrodite"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Baichuan-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("baichuan"), {
    upstreamBaseUrl: "https://api.baichuan-ai.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide Baseten Model APIs Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("baseten"), {
    upstreamBaseUrl: "https://inference.baseten.co/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
  });
});

test("proxy profiles provide Cerebrium endpoint-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("cerebrium"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide Nscale Inference-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("nscale"), {
    upstreamBaseUrl: "https://inference.api.nscale.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Ollama-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("ollama"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide OpenLLM-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("openllm"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide TensorRT-LLM-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("tensorrtllm"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Clarifai OpenAI-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("clarifai"), {
    upstreamBaseUrl: "https://api.clarifai.com/v2/ext/openai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamApiKeyPrefix: "Key",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide Modal endpoint-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("modal"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide AI/ML API Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("aimlapi"), {
    upstreamBaseUrl: "https://api.aimlapi.com",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide AI21-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("ai21"), {
    upstreamBaseUrl: "https://api.ai21.com/studio/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Cerebras-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("cerebras"), {
    upstreamBaseUrl: "https://api.cerebras.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide Chutes-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("chutes"), {
    upstreamBaseUrl: "https://llm.chutes.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Cloudflare Workers AI Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("cloudflare"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide Poe-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("poe"), {
    upstreamBaseUrl: "https://api.poe.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Upstage-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("upstage"), {
    upstreamBaseUrl: "https://api.upstage.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Requesty-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("requesty"), {
    upstreamBaseUrl: "https://router.requesty.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Featherless-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("featherless"), {
    upstreamBaseUrl: "https://api.featherless.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide IONOS AI Model Hub-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("ionos"), {
    upstreamBaseUrl: "https://openai.inference.de-txl.ionos.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Jan-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("jan"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide LocalAI-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("localai"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide MLX-LM-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("mlx"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide FastChat-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("fastchat"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide KoboldCpp-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("koboldcpp"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide LMDeploy-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("lmdeploy"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Xinference-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("xinference"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: "/v1/models",
  });
});

test("proxy profiles provide text-generation-webui-compatible Chat Completions and model routes", () => {
  assert.deepEqual(resolveProxyProviderProfile("textgen"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: "/v1/models",
  });
});

test("proxy profiles provide MLC LLM-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("mlc"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Databricks-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("databricks"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Microsoft Foundry OpenAI v1 defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("foundry"), {
    upstreamApiKeyHeader: "api-key",
    upstreamChatCompletionsPath: "/openai/v1/chat/completions",
    upstreamModelsPath: "/openai/v1/models",
    upstreamModelRetrievalPath: "/openai/v1/models",
  });
});

test("proxy profiles provide Hyperbolic-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("hyperbolic"), {
    upstreamBaseUrl: "https://api.hyperbolic.xyz/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Inference.net-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("inferencenet"), {
    upstreamBaseUrl: "https://api.inference.net/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Scaleway-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("scaleway"), {
    upstreamBaseUrl: "https://api.scaleway.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide SGLang-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("sglang"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide TGI-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("tgi"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide Lamini-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("lamini"), {
    upstreamBaseUrl: "https://api.lamini.ai/inf",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide LiteLLM-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("litellm"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide llama.cpp-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("llamacpp"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide vLLM-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("vllm"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide LM Studio-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("lmstudio"), {
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/v1/chat/completions",
    upstreamModelsPath: "/v1/models",
  });
});

test("proxy profiles provide OVHcloud-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("ovhcloud"), {
    upstreamBaseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
  });
});

test("proxy profiles provide Alibaba DashScope-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("dashscope"), {
    upstreamBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
  });
});

test("proxy profiles provide OpenRouter-compatible defaults and headers", () => {
  assert.deepEqual(resolveProxyProviderProfile("openrouter", {
    siteUrl: "https://claimlatch.example",
    appName: "ClaimLatch",
  }), {
    upstreamBaseUrl: "https://openrouter.ai/api/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamRequestHeaders: {
      "HTTP-Referer": "https://claimlatch.example",
      "X-Title": "ClaimLatch",
    },
  });
});

test("proxy profiles provide Groq-compatible API defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("groq"), {
    upstreamBaseUrl: "https://api.groq.com/openai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide Gemini OpenAI-compatible Chat Completions and model-route defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("gemini"), {
    upstreamBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide Mistral-compatible API defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("mistral"), {
    upstreamBaseUrl: "https://api.mistral.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide MiniMax-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("minimax"), {
    upstreamBaseUrl: "https://api.minimax.io/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide Xiaomi MiMo-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("mimo"), {
    upstreamBaseUrl: "https://api.xiaomimimo.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
  });
});

test("proxy profiles provide Tencent Hunyuan-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("hunyuan"), {
    upstreamBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Tencent TokenHub-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("tokenhub"), {
    upstreamBaseUrl: "https://tokenhub.tencentmaas.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide StepFun-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("stepfun"), {
    upstreamBaseUrl: "https://api.stepfun.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide SiliconFlow model-list defaults with fail-closed retrieval", () => {
  assert.deepEqual(resolveProxyProviderProfile("siliconflow"), {
    upstreamBaseUrl: "https://api.siliconflow.cn/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Moonshot-compatible API defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("moonshot"), {
    upstreamBaseUrl: "https://api.moonshot.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Nebius-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("nebius"), {
    upstreamBaseUrl: "https://api.tokenfactory.nebius.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Novita-compatible Chat Completions and model-list defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("novita"), {
    upstreamBaseUrl: "https://api.novita.ai/openai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide Hugging Face Inference Providers model-route defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("huggingface"), {
    upstreamBaseUrl: "https://router.huggingface.co/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
    upstreamModelIdEncoding: "path",
  });
});

test("proxy profiles provide OpenAI-compatible API defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("openai"), {
    upstreamBaseUrl: "https://api.openai.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide NVIDIA NIM-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("nvidia"), {
    upstreamBaseUrl: "https://integrate.api.nvidia.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Cohere-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("cohere"), {
    upstreamBaseUrl: "https://api.cohere.ai/compatibility/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide DeepSeek-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("deepseek"), {
    upstreamBaseUrl: "https://api.deepseek.com",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide DeepInfra-compatible Chat Completions defaults and fail-closed model routes", () => {
  assert.deepEqual(resolveProxyProviderProfile("deepinfra"), {
    upstreamBaseUrl: "https://api.deepinfra.com/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Fireworks-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("fireworks"), {
    upstreamBaseUrl: "https://api.fireworks.ai/inference/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide FriendliAI-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("friendli"), {
    upstreamBaseUrl: "https://api.friendli.ai/serverless/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Together-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("together"), {
    upstreamBaseUrl: "https://api.together.xyz/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide xAI-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("xai"), {
    upstreamBaseUrl: "https://api.x.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide Z.AI-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("zai"), {
    upstreamBaseUrl: "https://api.z.ai/api/paas/v4",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Volcengine Ark-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("volcengine"), {
    upstreamBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: null,
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Perplexity Router-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("perplexity"), {
    upstreamBaseUrl: "https://api.perplexity.ai/router/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide Qianfan v2-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("qianfan"), {
    upstreamBaseUrl: "https://qianfan.baidubce.com/v2",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("proxy profiles provide SambaNova-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("sambanova"), {
    upstreamBaseUrl: "https://api.sambanova.ai/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: "/models",
  });
});

test("proxy profiles provide SiliconFlow-compatible Chat Completions defaults", () => {
  assert.deepEqual(resolveProxyProviderProfile("siliconflow"), {
    upstreamBaseUrl: "https://api.siliconflow.cn/v1",
    upstreamApiKeyHeader: "authorization",
    upstreamChatCompletionsPath: "/chat/completions",
    upstreamModelsPath: "/models",
    upstreamModelRetrievalPath: null,
  });
});

test("every hosted proxy profile resolves a complete HTTPS Chat Completions contract", () => {
  for (const profile of PROXY_PROVIDER_PROFILE_NAMES) {
    if (profile === "aphrodite" || profile === "azure" || profile === "cerebrium" || profile === "cloudflare" || profile === "databricks" || profile === "fastchat" || profile === "foundry" || profile === "jan" || profile === "koboldcpp" || profile === "litellm" || profile === "llamacpp" || profile === "lmdeploy" || profile === "lmstudio" || profile === "localai" || profile === "mlc" || profile === "mlx" || profile === "modal" || profile === "ollama" || profile === "openllm" || profile === "openrouter" || profile === "sglang" || profile === "tgi" || profile === "tensorrtllm" || profile === "textgen" || profile === "vllm" || profile === "xinference") continue;
    const resolved = resolveProxyProviderProfile(profile);
    assert.match(resolved.upstreamBaseUrl ?? "", /^https:\/\//);
    assert.equal(resolved.upstreamApiKeyHeader, "authorization");
    assert.match(resolved.upstreamChatCompletionsPath, /\/chat\/completions$/);
  }
});

test("proxy profiles fail closed for unknown names and incomplete OpenRouter metadata", () => {
  assert.throws(() => resolveProxyProviderProfile("unknown"), /Unsupported proxy provider profile/);
  assert.throws(() => resolveProxyProviderProfile("openrouter"), /siteUrl and appName/);
  assert.throws(
    () => resolveProxyProviderProfile("openrouter", {
      siteUrl: "https://user:password@example.com",
      appName: "ClaimLatch",
    }),
    /absolute HTTP or HTTPS URL/,
  );
});
