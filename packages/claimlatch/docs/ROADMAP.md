# Roadmap

## V0.1 — initial gate

- Atomic claim extraction
- Evidence-provider interface
- Tavily search adapter
- Evidence-bound verification
- Deterministic policy gate
- CLI and TypeScript SDK
- Unit/contract tests

## V0.2 — provenance and integration

- Best-effort HTML/text source retrieval
- Quote-level provenance with normalized-content SHA-256
- Literal private-target and redirect SSRF guards
- Core invariant enforcement for custom extractors/verifiers
- OpenAI-compatible non-streaming Chat Completions reverse proxy
- Frozen human-authored independent-label benchmark with train/dev/test splits
- False-pass / false-block metrics
- Ed25519-signed verification receipt API
- Runnable guarded-application integration example

## V0.3 — hardened delivery and operations (implemented)

- DNS resolution and public-IP pinning before outbound document requests
- DNS resolution and public-IP pinning before outbound proxy requests
- Cross-source contradiction detection
- Page-level PDF provenance with page-local quote offsets
- Signed receipt persistence, verification CLI, and key rotation support
- Buffered multi-choice, streaming, structured-output, and multimodal proxy verification
- Provider compatibility profiles for hosted OpenAI-compatible endpoints
- Expanded 200-case independent benchmark with balanced train/dev/test splits
- Credential-free release verification command wired into publish and CI checks
- Credential-free benchmark manifest validation in local scripts and CI
- Opt-in calibrated verification-status confidence with offline isotonic fitting, evaluation metrics, and CLI profile generation
- Credential-free calibration and evaluation dataset validation before profile fitting
- Signed receipt validation and package-root exports for confidence/calibration provenance
- Independently labelled confidence calibration fixture with committed generated evaluation metrics
- Credential-free Azure-style, hosted Gemini, and OpenRouter proxy wire-contract tests
- Next.js App Router Fetch-native route handler example with explicit Node.js runtime
- Remix loader/action route module example using the Fetch-native guarded handler
- Cloudflare Worker Fetch-native integration example
- Deno `deno serve` Fetch-native integration example
- Bun `Bun.serve` Fetch-native integration example
- Databricks Model Serving AI Gateway OpenAI-compatible proxy provider profile with explicit workspace base URL, Chat Completions contract coverage, and fail-closed model routes
- Microsoft Foundry Models OpenAI v1 proxy provider profile with explicit resource base URL, `api-key` authentication, and Chat Completions/model-list/retrieval contract coverage
- Mistral OpenAI-compatible proxy profile with explicit Chat Completions/model-list/model-retrieval contract coverage
- Hapi route adapter example without a core framework dependency
- Express route adapter example without a core framework dependency
- Fastify route adapter example without a core framework dependency
- Hono route adapter example without a core framework dependency
- SvelteKit route adapter example without a core framework dependency
- AWS Lambda HTTP API payload v2 adapter example without an AWS SDK dependency
- Moonshot OpenAI-compatible proxy provider profile with documented model-list coverage and fail-closed model retrieval
- Groq OpenAI-compatible proxy provider profile with Chat Completions/model-list/model-retrieval contract coverage
- OpenAI provider profile with official model-list/model-retrieval contract coverage
- xAI provider profile with documented model-list/model-retrieval contract coverage
- DeepSeek provider profile with documented model-list and fail-closed retrieval coverage
- Cohere compatibility profile with fail-closed model-route handling
- NVIDIA hosted provider profile with documented model-list and fail-closed retrieval coverage
- Fireworks provider profile with fail-closed model-route handling for its inference endpoint
- FriendliAI serverless provider profile with documented model-list and fail-closed retrieval coverage
- Together AI provider profile with documented model-list and fail-closed retrieval coverage
- Perplexity Router API provider profile with documented model-list and fail-closed retrieval coverage
- SambaNova provider profile with documented model-list and model-retrieval contract coverage
- Cerebras provider profile with documented model-list and model-retrieval contract coverage
- Upstage provider profile with fail-closed handling for undocumented model routes
- Koa route adapter example without a core framework dependency
- Baidu Qianfan v2 OpenAI-compatible proxy provider profile with model-list and fail-closed retrieval coverage
- Alibaba Cloud DashScope OpenAI-compatible proxy provider profile with model-list contract coverage
- Z.AI OpenAI-compatible proxy provider profile with documented Chat Completions coverage and fail-closed model routes
- Volcengine Ark OpenAI-compatible proxy provider profile with documented Chat Completions coverage and fail-closed model routes
- MiniMax OpenAI-compatible proxy provider profile with Chat Completions, model-list, and model-retrieval contract coverage
- Nebius Token Factory OpenAI-compatible proxy provider profile with documented model-list coverage and fail-closed model retrieval
- SiliconFlow OpenAI-compatible proxy provider profile with documented model-list coverage and fail-closed model retrieval
- Retired Tencent Hunyuan provider profile documented as legacy-only with migration guidance to TokenHub
- Tencent Cloud TokenHub OpenAI-compatible proxy provider profile with model-list and fail-closed retrieval coverage
- StepFun OpenAI-compatible proxy provider profile with Chat Completions, model-list, and model-retrieval contract coverage
- AI21 OpenAI-compatible proxy provider profile with Chat Completions contract coverage
- Novita AI OpenAI-compatible proxy provider profile with Chat Completions and model-list contract coverage
- Chutes OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- Poe OpenAI-compatible proxy provider profile with Chat Completions and model-list contract coverage
- Upstage OpenAI-compatible proxy provider profile with Chat Completions contract coverage
- AI21 OpenAI-compatible proxy provider profile with fail-closed handling for undocumented model routes
- Gemini OpenAI-compatible proxy provider profile with Chat Completions, model-list, and per-model retrieval contract coverage
- Hugging Face Inference Providers proxy provider profile with Chat Completions, model-list, and encoded per-model retrieval contract coverage
- DeepInfra OpenAI-compatible proxy provider profile with model-list coverage and fail-closed per-model retrieval
- Featherless AI OpenAI-compatible proxy provider profile with Chat Completions, model-list, and encoded model-retrieval contract coverage
- IONOS Cloud AI Model Hub OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- Hyperbolic OpenAI-compatible proxy provider profile with Chat Completions and fail-closed retired model-route coverage
- Nscale model-list coverage with fail-closed individual model retrieval
- Novita AI OpenAI-compatible proxy provider profile with Chat Completions, model-list, and model-retrieval contract coverage
- Poe model-list coverage with fail-closed individual model retrieval
- Requesty OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- AI/ML API OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- Inference.net OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- Scaleway Generative APIs OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- Lamini OpenAI-compatible proxy provider profile with Chat Completions, model-list, and fail-closed retrieval coverage
- OVHcloud AI Endpoints OpenAI-compatible proxy provider profile with Chat Completions contract coverage and explicit fail-closed handling for its separate model catalog API
- Baichuan OpenAI-compatible proxy provider profile with Chat Completions contract coverage and explicit fail-closed handling when no model-list route is documented
- Xiaomi MiMo OpenAI-compatible proxy provider profile with Chat Completions and model-list contract coverage
- Cloudflare Workers AI OpenAI-compatible proxy provider profile with account-scoped Chat Completions contract coverage and explicit fail-closed handling when no model-list route is configured
- Configurable upstream API key authentication prefixes for non-Bearer provider contracts
- Baseten Model APIs OpenAI-compatible proxy provider profile with Chat Completions and model-list contract coverage
- Clarifai OpenAI-compatible proxy provider profile with Key-authenticated Chat Completions coverage and explicit fail-closed model-route handling
- Modal Endpoints OpenAI-compatible proxy provider profile with explicit endpoint URL configuration and fail-closed model-route handling
- Cerebrium deployment endpoint OpenAI-compatible proxy provider profile with explicit endpoint URL configuration and fail-closed model-route handling
- Nscale Serverless Inference OpenAI-compatible proxy provider profile with Chat Completions and model-list contract coverage
- LiteLLM self-hosted gateway OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- Ollama OpenAI-compatible proxy provider profile with explicit local/cloud base URL configuration and versioned Chat Completions/model-list contract coverage
- llama.cpp server OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- vLLM OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- LM Studio OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- Jan local OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- LocalAI OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- SGLang OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- Self-hosted TGI OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions coverage, and fail-closed handling for its undocumented model-list route
- TensorRT-LLM `trtllm-serve` self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list contract coverage, and fail-closed handling for its undocumented model-retrieval route
- Aphrodite Engine self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list contract coverage, and fail-closed handling for its undocumented model-retrieval route
- KoboldCpp self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list contract coverage, and fail-closed handling for its undocumented model-retrieval route
- LMDeploy self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list contract coverage, and fail-closed handling for its undocumented model-retrieval route
- Xinference self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list/model-retrieval contract coverage
- text-generation-webui self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration and Chat Completions/model-list/model-retrieval contract coverage
- MLC LLM self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list contract coverage, and fail-closed handling for its undocumented model-retrieval route
- MLX-LM OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage
- OpenLLM self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list contract coverage, and fail-closed handling for its undocumented model-retrieval route
- FastChat self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration and versioned Chat Completions/model-list contract coverage

## Next

- Continue adding provider-specific proxy compatibility tests and examples as remaining upstream contracts are verified
- Continue adding framework-oriented integration examples while keeping the core package dependency-light
- Expand the benchmark only with independently sourced labels, provenance, and manifest updates

## Explicitly not promised

- A universal "87% trustworthy" score
- A claim that one LLM judge solves hallucination
- Hidden chain-of-thought based judgments
- Universal OpenAI API compatibility
