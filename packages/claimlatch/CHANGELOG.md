# Changelog

## Unreleased

- Added the credential-free `npm run verify` release check for build, full tests, and independent benchmark manifest validation.
- Updated `prepublishOnly` to run the complete credential-free release verification before publishing.
- Updated the main CI matrix to run the same complete credential-free release verification on every pull request.
- Added DNS resolution, public-IP validation, and per-request IP pinning to the built-in OpenAI-compatible proxy transport, including streaming response support and fail-closed private-target handling.
- Made Hyperbolic model-list and individual model-retrieval routes fail closed because the documented serverless inference endpoints are retired.
- Hardened the Nscale provider profile with fail-closed handling for its undocumented per-model retrieval route.
- Added Novita's documented `/models` and `/models/{model_id}` routes with bearer-authenticated wire-contract coverage.
- Added Featherless's documented `/models/{model_id}` route with encoded model-ID wire-contract coverage.
- Hardened the IONOS AI Model Hub profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Scaleway Generative APIs profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Lamini profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the AI/ML API profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Inference.net profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Baidu Qianfan v2 profile with fail-closed handling for its non-OpenAI model-details route.
- Hardened the Poe provider profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Requesty provider profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Upstage provider profile with fail-closed handling for undocumented model-list and per-model retrieval routes.
- Added MiniMax's documented `/models` and `/models/{model_id}` routes with bearer-authenticated wire-contract coverage.
- Hardened the Nebius Token Factory profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the SiliconFlow provider profile with fail-closed handling for its undocumented per-model retrieval route.
- Added StepFun's documented `/models` and `/models/{model}` routes with bearer-authenticated wire-contract coverage.
- Hardened the Tencent Hunyuan provider profile with fail-closed handling for undocumented model-list and per-model retrieval routes.
- Deprecated the retired Tencent Hunyuan provider profile and directed new deployments to the TokenHub profile.
- Hardened the Tencent Cloud TokenHub profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the Chutes profile with fail-closed handling for its undocumented per-model retrieval route.
- Hardened the AI21 provider profile with fail-closed handling for undocumented model-list and per-model retrieval routes.
- Added documented Gemini OpenAI-compatibility model-list and per-model retrieval routes.
- Added documented Hugging Face Inference Providers model-list and per-model retrieval routes, including encoded repository-style model IDs.
- Added DeepInfra's documented OpenAI-compatible model-list route with fail-closed handling for undocumented per-model retrieval.
- Added Cerebras model-list and per-model retrieval coverage from its documented OpenAI-compatible API.
- Added SambaNova model-list and per-model retrieval coverage from its documented OpenAI-compatible API.
- Added Perplexity Router model-list coverage with fail-closed handling for undocumented per-model retrieval.
- Added Together AI model-list coverage with fail-closed handling for undocumented per-model retrieval.
- Added FriendliAI serverless model-list coverage with fail-closed handling for undocumented per-model retrieval.
- Hardened the Fireworks provider profile with fail-closed handling for account-scoped model-management routes that are not part of its OpenAI-compatible inference endpoint.
- Added NVIDIA hosted model-list coverage with fail-closed handling for the undocumented per-model retrieval route.
- Hardened the Cohere compatibility profile with fail-closed handling for undocumented model-list and model-retrieval routes.
- Added DeepSeek model-list proxy coverage with fail-closed handling for its undocumented per-model retrieval route.
- Added xAI model-list and model-retrieval proxy contract coverage using the documented `/v1/models` API routes.
- Added OpenAI model-list and model-retrieval proxy contract coverage using the official `/v1/models` API routes.
- Added Groq model-list and model-retrieval proxy contract coverage using its documented OpenAI-compatible model routes.
- Hardened the Moonshot provider profile with its documented `/models` route and fail-closed handling for undocumented per-model retrieval.
- Added a dependency-light Hapi route adapter example with parsed-payload and response-toolkit coverage.
- Added a Microsoft Foundry Models OpenAI v1 proxy provider profile with explicit resource base URL configuration, `api-key` authentication, and Chat Completions/model-list/retrieval wire-contract coverage.
- Added Mistral model-list and model-retrieval proxy contract coverage using its documented `/v1/models` and `/v1/models/{model_id}` routes.
- Added a Databricks Model Serving AI Gateway OpenAI-compatible proxy provider profile with explicit workspace base URL configuration, bearer-authenticated Chat Completions coverage, and fail-closed model routes.
- Added a dependency-light Bun `Bun.serve` integration example with lazy environment-based gate initialization and Fetch-native handler coverage.
- Added a dependency-light Deno `deno serve` integration example with lazy environment-based gate initialization and Fetch-native handler coverage.
- Added a KoboldCpp self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list coverage, fail-closed handling for its undocumented model-retrieval route, and wire-contract tests.
- Added an LMDeploy self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list coverage, fail-closed handling for its undocumented model-retrieval route, and wire-contract tests.
- Added a Xinference self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list/model-retrieval coverage, and wire-contract tests.
- Added a text-generation-webui self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration and Chat Completions/model-list/model-retrieval wire-contract coverage.
- Added an MLC LLM self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, Chat Completions/model-list coverage, and fail-closed handling for its undocumented model-retrieval route.
- Added an Aphrodite Engine self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list coverage, fail-closed handling for its undocumented model-retrieval route, and wire-contract tests.
- Added a TensorRT-LLM `trtllm-serve` self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list coverage, fail-closed handling for its undocumented model-retrieval route, and wire-contract tests.
- Added an OpenLLM self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list coverage, fail-closed handling for its undocumented model-retrieval route, and wire-contract tests.
- Added a FastChat self-hosted OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions/model-list coverage, fail-closed handling for its undocumented model-retrieval route, and wire-contract tests.
- Added an MLX-LM OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added an Nscale Serverless Inference OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list coverage and wire-contract tests.
- Added a LiteLLM self-hosted gateway OpenAI-compatible proxy provider profile with explicit base URL configuration, bearer-authenticated versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added an Ollama OpenAI-compatible proxy provider profile with explicit local/cloud base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added a llama.cpp server OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added a vLLM OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added an LM Studio OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added a Jan local OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added a LocalAI OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added an SGLang OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, model-list coverage, and wire-contract tests.
- Added a self-hosted TGI OpenAI-compatible proxy provider profile with explicit base URL configuration, versioned Chat Completions, and fail-closed handling for its undocumented model-list route.
- Added a Cerebrium deployment endpoint OpenAI-compatible proxy provider profile with explicit endpoint URL configuration, bearer-authenticated Chat Completions coverage, and fail-closed model-route handling.
- Added a Modal Endpoints OpenAI-compatible proxy provider profile with explicit endpoint URL configuration, bearer-authenticated Chat Completions coverage, and fail-closed model-route handling.
- Added a Clarifai OpenAI-compatible proxy provider profile with documented `Authorization: Key` authentication, Chat Completions coverage, and fail-closed model-route handling.
- Added a Baseten Model APIs OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added configurable upstream API key authentication prefixes for provider compatibility, while preserving Bearer as the Authorization default and raw values for custom credential headers.
- Added a Xiaomi MiMo OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list coverage.
- Added a Cloudflare Workers AI OpenAI-compatible proxy provider profile with account-scoped base URL configuration, documented bearer-authenticated Chat Completions coverage, and fail-closed model-route handling.
- Added a Baichuan OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions coverage and fail-closed model-route handling.
- Added an OVHcloud AI Endpoints OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions coverage and fail-closed model-route handling.
- Added a Lamini OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a Scaleway Generative APIs OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added an Inference.net OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added an AI/ML API OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list paths and wire-contract coverage.
- Added a Hyperbolic OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Added an IONOS Cloud AI Model Hub OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a Featherless AI OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a Requesty OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added an Upstage OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Added a Poe OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a FriendliAI serverless OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and profile coverage.
- Added an Alibaba Cloud DashScope OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a Baidu Qianfan v2 OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a Z.AI OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults, wire-contract coverage, and fail-closed model routes.
- Added a Volcengine Ark OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Hardened the Volcengine Ark provider profile with fail-closed handling for undocumented model-list and per-model retrieval routes.
- Added a MiniMax OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Added a Tencent Hunyuan OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Added a Tencent Cloud TokenHub OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a StepFun OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Added an AI21 OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and wire-contract coverage.
- Added a Novita AI OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Added a Chutes OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions and model-list defaults and wire-contract coverage.
- Expanded the frozen independent benchmark to 200 balanced cases across 100 paired topics with IETF RFC 7725-backed HTTP 451 Unavailable For Legal Reasons and BIPM-backed SI mole pairs.
- Added a Nebius Token Factory OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and profile coverage.
- Added a SiliconFlow OpenAI-compatible proxy provider profile with documented bearer-authenticated Chat Completions defaults and profile coverage.
- Preserved Azure's documented `apim-request-id` response header through the compatible proxy with regression coverage.
- Added the Azure proxy profile's documented `/openai/models?api-version=2024-10-21` model-list/retrieval route with wire-contract coverage and environment override support.
- Added fail-closed regression coverage for calibration dataset validation, including empty datasets, malformed manifests, and overlapping source case/claim pairs.
- Expanded the frozen independent benchmark to 90 balanced cases across 45 paired topics with an IETF RFC 9110-backed HTTP 206 Partial Content pair.
- Expanded the frozen independent benchmark to 92 balanced cases across 46 paired topics with an IETF RFC 9110-backed HTTP 300 Multiple Choices pair.
- Expanded the frozen independent benchmark to 94 balanced cases across 47 paired topics with an IETF RFC 9110-backed HTTP 304 Not Modified pair.
- Expanded the frozen independent benchmark to 96 balanced cases across 48 paired topics with an IETF RFC 9110-backed HTTP 303 See Other pair.
- Expanded the frozen independent benchmark to 98 balanced cases across 49 paired topics with an IETF RFC 9110-backed HTTP 307 Temporary Redirect pair.
- Expanded the frozen independent benchmark to 100 balanced cases across 50 paired topics with an IETF RFC 9110-backed HTTP 308 Permanent Redirect pair.
- Expanded the frozen independent benchmark to 102 balanced cases across 51 paired topics with an IETF RFC 9110-backed HTTP 302 Found pair.
- Expanded the frozen independent benchmark to 106 balanced cases across 53 paired topics with IETF RFC 9110-backed HTTP 305 Use Proxy and HTTP 306 Unused pairs.
- Expanded the frozen independent benchmark to 110 balanced cases across 55 paired topics with IETF RFC 9110-backed HTTP 400 Bad Request and HTTP 401 Unauthorized pairs.
- Expanded the frozen independent benchmark to 114 balanced cases across 57 paired topics with IETF RFC 9110-backed HTTP 403 Forbidden and HTTP 405 Method Not Allowed pairs.
- Expanded the frozen independent benchmark to 118 balanced cases across 59 paired topics with IETF RFC 9110-backed HTTP 406 Not Acceptable and HTTP 407 Proxy Authentication Required pairs.
- Expanded the frozen independent benchmark to 122 balanced cases across 61 paired topics with IETF RFC 9110-backed HTTP 408 Request Timeout and HTTP 409 Conflict pairs.
- Expanded the frozen independent benchmark to 126 balanced cases across 63 paired topics with IETF RFC 9110-backed HTTP 410 Gone and HTTP 411 Length Required pairs.
- Expanded the frozen independent benchmark to 130 balanced cases across 65 paired topics with IETF RFC 9110-backed HTTP 412 Precondition Failed and HTTP 413 Content Too Large pairs.
- Expanded the frozen independent benchmark to 134 balanced cases across 67 paired topics with IETF RFC 9110-backed HTTP 414 URI Too Long and HTTP 415 Unsupported Media Type pairs.
- Expanded the frozen independent benchmark to 138 balanced cases across 69 paired topics with IETF RFC 9110-backed HTTP 416 Range Not Satisfiable and HTTP 417 Expectation Failed pairs.
- Expanded the frozen independent benchmark to 142 balanced cases across 71 paired topics with IETF RFC 9110-backed HTTP 421 Misdirected Request and HTTP 422 Unprocessable Content pairs.
- Expanded the frozen independent benchmark to 144 balanced cases across 72 paired topics with an IETF RFC 9110-backed HTTP 426 Upgrade Required pair.
- Expanded the frozen independent benchmark to 148 balanced cases across 74 paired topics with an IETF RFC 6585-backed HTTP 429 Too Many Requests and HTTP 431 Request Header Fields Too Large pairs.
- Expanded the frozen independent benchmark to 152 balanced cases across 76 paired topics with IETF RFC 6585-backed HTTP 428 Precondition Required and HTTP 511 Network Authentication Required pairs.
- Expanded the frozen independent benchmark to 156 balanced cases across 78 paired topics with IETF RFC 9110-backed HTTP 402 Payment Required and HTTP 500 Internal Server Error pairs.
- Expanded the frozen independent benchmark to 160 balanced cases across 80 paired topics with IETF RFC 9110-backed HTTP 501 Not Implemented and HTTP 502 Bad Gateway pairs.
- Expanded the frozen independent benchmark to 164 balanced cases across 82 paired topics with IETF RFC 9110-backed HTTP 503 Service Unavailable and HTTP 504 Gateway Timeout pairs.
- Expanded the frozen independent benchmark to 168 balanced cases across 84 paired topics with IETF RFC 9110-backed HTTP 418 (Unused) and HTTP 505 HTTP Version Not Supported pairs.
- Expanded the frozen independent benchmark to 172 balanced cases across 86 paired topics with WebDAV IETF RFC 4918/RFC 5842-backed HTTP 207 Multi-Status and HTTP 208 Already Reported pairs.
- Expanded the frozen independent benchmark to 176 balanced cases across 88 paired topics with WebDAV IETF RFC 4918/RFC 5842-backed HTTP 507 Insufficient Storage and HTTP 508 Loop Detected pairs.
- Expanded the frozen independent benchmark to 180 balanced cases across 90 paired topics with WebDAV IETF RFC 4918-backed HTTP 423 Locked and HTTP 424 Failed Dependency pairs.
- Expanded the frozen independent benchmark to 184 balanced cases across 92 paired topics with IETF RFC 8297-backed HTTP 103 Early Hints and RFC 3229-backed HTTP 226 IM Used pairs.
- Expanded the frozen independent benchmark to 188 balanced cases across 94 paired topics with IETF RFC 9110-backed HTTP 100 Continue and HTTP 101 Switching Protocols pairs.
- Expanded the frozen independent benchmark to 192 balanced cases across 96 paired topics with IETF RFC 8470-backed HTTP 425 Too Early and RFC 2295-backed HTTP 506 Variant Also Negotiates pairs.
- Expanded the frozen independent benchmark to 196 balanced cases across 98 paired topics with WebDAV RFC 2518-backed HTTP 102 Processing and Experimental RFC 2774-backed HTTP 510 Not Extended pairs; the documentation records RFC 4918's removal note for HTTP 102.
- Added a dependency-light Fastify route adapter example using the Fetch-native guarded answer handler.
- Added a dependency-light Hono route adapter example using the Fetch-native guarded answer handler.
- Added a dependency-light SvelteKit route adapter example using the Fetch-native guarded answer handler.
- Added a dependency-light AWS Lambda HTTP API payload v2 adapter example using the Fetch-native guarded answer handler.
- Added a Moonshot OpenAI-compatible proxy provider profile using the documented bearer-authenticated Chat Completions endpoint.
- Added a dependency-light Koa route adapter example using the Fetch-native guarded answer handler.
- Synced the roadmap with the implemented credential-free calibration dataset validation mode.

## 0.3.86 - 2026-09-30

- Added a release metadata consistency test covering package versions and current documentation headings.
- Added credential-free `claimlatch-calibrate --validate` dataset checks for hashes, observation counts, and disjoint source case/claim pairs.

## 0.3.85 - 2026-09-30

- Added opt-in calibrated verification-status confidence with offline isotonic fitting, evaluation metrics, CLI profile generation, signed receipt coverage, and package-root exports.
- Hardened calibration, receipt, main, and benchmark CLI parsers to reject duplicate value options fail closed.
- Hardened proxy request and response header configuration to reject case-insensitive duplicate names and prefixes, with shared CLI/example parsing.

## 0.3.84 - 2026-09-30

- Added deterministic `npm run bench:manifest` generation for frozen benchmark SHA-256 manifests and case counts.

## 0.3.83 - 2026-09-30

- Expanded the frozen independent benchmark to 84 balanced cases across 42 paired topics with an IETF RFC 9110-backed HTTP 202 Accepted pair.

## 0.3.82 - 2026-09-30

- Expanded the frozen independent benchmark to 82 balanced cases across 41 paired topics with an IETF RFC 9110-backed HTTP 204 No Content pair.

## 0.3.81 - 2026-09-30

- Added a dependency-light Cloudflare Workers integration example using the Fetch-native guarded answer handler and environment bindings.

## 0.3.80 - 2026-09-30

- Expanded the frozen independent benchmark to 80 balanced cases across 40 paired topics with a Google Gemini OpenAI compatibility endpoint pair.

## 0.3.79 - 2026-09-30

- Added a Google Gemini OpenAI-compatible Chat Completions proxy provider profile with documented bearer authentication.

## 0.3.78 - 2026-09-30

- Expanded the frozen independent benchmark to 78 balanced cases with an IETF RFC 9110-backed HTTP 201 Created pair.

## 0.3.77 - 2026-09-30

- Expanded the frozen independent benchmark to 76 balanced cases with an NIST-backed SI candela/lumen pair.
- Added lockfile-pinned CI installation, npm dependency caching, and production dependency auditing.
- Added IPv6 DNS pinning and noncanonical private-IP regression coverage for provenance SSRF protections.

## 0.3.76 - 2026-09-30

- Added a dependency-light Remix route module example using `loader` and `action` with the Fetch-native guarded handler.

## 0.3.75 - 2026-09-30

- Updated the receipt storage example to print the canonical signed payload SHA-256 for audit logs.

## 0.3.74 - 2026-09-30

- Explicitly selects the Node.js runtime in the Next.js route handler example.

## 0.3.73 - 2026-09-30

- Redacts embedded username and password credentials from evidence URL metadata in fallback provenance.

## 0.3.72 - 2026-09-30

- Added a Next.js App Router route handler example with lazy gate initialization.

## 0.3.71 - 2026-09-30

- Normalizes trailing-dot hostnames when comparing evidence sources for cross-source contradictions.

## 0.3.70 - 2026-09-30

- Rejects OpenRouter attribution URLs containing embedded username or password credentials.

## 0.3.69 - 2026-09-30

- Rejects HTTP(S) evidence URLs containing embedded username or password credentials before hydration.

## 0.3.68 - 2026-09-30

- Added canonical SHA-256 payload metadata to valid `claimlatch-receipt verify --json` output.

## 0.3.67 - 2026-09-30

- Rejects empty signed receipt `keyId` values during receipt creation as well as verification and storage.

## 0.3.66 - 2026-09-30

- Hardened signed receipt key metadata validation so present `keyId` values must be non-empty strings.

## 0.3.65 - 2026-09-30

- Made provenance DNS lookup honor the document request timeout and fail closed when a resolver hangs.

## 0.3.64 - 2026-09-30

- Hardened literal local-host filtering to reject fully qualified localhost and `.local` hostnames with trailing root labels.

## 0.3.63 - 2026-09-30

- Hardened provenance URL and DNS-result filtering to reject reserved, documentation, multicast, unspecified, and other non-routable IPv4/IPv6 targets.

## 0.3.62 - 2026-09-30

- Hardened signed receipt key metadata validation so empty signatures, empty public keys, and non-string key IDs fail closed.

## 0.3.61 - 2026-09-30

- Fixed provider-compatible proxy example entrypoint detection for POSIX and Windows paths.

## 0.3.60 - 2026-09-30

- Hardened signed receipt verification to reject malformed claim verification and policy violation entries.

## 0.3.59 - 2026-09-30

- Hardened signed receipt verification so cryptographically valid receipts with malformed verification report shapes fail closed.

## 0.3.58 - 2026-09-30

- Fixed the provider-compatible proxy example so it reuses the CLI provider configuration, including custom model-list paths and provider request headers.

## 0.3.57 - 2026-09-30

- Added verified receipt `coverage` and claim status `counts` metadata to `claimlatch-receipt verify --json`, while omitting malformed or unverified summary fields.

## 0.3.56 - 2026-09-30

- Added verified receipt `decision` (`PASS` or `BLOCK`) and `generatedAt` metadata to `claimlatch-receipt verify --json` output, while omitting decision metadata for invalid signatures.

## 0.3.55 - 2026-09-30

- Added signed receipt `version`, `algorithm`, and `keyId` metadata to `claimlatch-receipt verify --json` output for audit automation.

## 0.3.54 - 2026-09-30

- Added bounded OpenAI-compatible model retrieval passthrough for `/v1/models/:id` and `/models/:id`, with encoded model IDs and path-traversal protection.

## 0.3.53 - 2026-09-30

- Added configurable `healthPath` and `answerPath` options to the guarded Node HTTP and Fetch integrations for framework-specific route mounting, with fail-closed path validation.

## 0.3.52 - 2026-09-30

- Added bounded OpenAI-compatible model listing passthrough for `/v1/models` and `/models`, with provider-specific paths, authentication, query forwarding, response limits, and timeout protection.

## 0.3.51 - 2026-09-29

- Exposed benchmark aggregate metrics in JUnit suite properties and SARIF run properties.

## 0.3.50 - 2026-09-29

- Added a DeepInfra-compatible proxy profile for OpenAI-compatible Chat Completions.

## 0.3.49 - 2026-09-29

- Added a direct OpenAI API-compatible proxy profile while preserving the existing Azure-style default.

## 0.3.48 - 2026-09-29

- Added a Hugging Face Inference Providers-compatible proxy profile for OpenAI-compatible Chat Completions.

## 0.3.47 - 2026-09-29

- Added a Fetch-standard guarded answer integration and a route-oriented framework example with fail-closed request handling.

## 0.3.46 - 2026-09-29

- Added a credential-free benchmark validation script and GitHub Actions workflow for frozen dataset manifest checks.

## 0.3.45 - 2026-09-29

- Added average evidence coverage to benchmark reports while keeping coverage distinct from decision accuracy and probability calibration.

## 0.3.44 - 2026-09-29

- Added a credential-free provider-compatible proxy environment variable example covering hosted, Azure-style, OpenRouter, and custom configurations.

## 0.3.43 - 2026-09-29

- Added an NVIDIA NIM-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

## 0.3.42 - 2026-09-29

- Added a SambaNova-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

## 0.3.41 - 2026-09-29

- Added a Cerebras-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

## 0.3.40 - 2026-09-29

- Added a Perplexity Router API-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

## 0.3.39 - 2026-09-29

- Added an xAI-compatible provider profile for the proxy's OpenAI-compatible Chat Completions path.

## 0.3.38 - 2026-09-29

- Expanded the frozen independent-label benchmark to 74 balanced cases across 37 paired topics while keeping the test split unchanged.

## 0.3.37 - 2026-09-29

- Consolidated static proxy provider profile definitions into a single immutable map.

## 0.3.36 - 2026-09-29

- Clarified conditional upstream base URL requirements in proxy CLI help and added hosted profile resolver coverage.

## 0.3.35 - 2026-09-29

- Added a Fireworks-compatible provider profile for the proxy's Chat Completions path.

## 0.3.34 - 2026-09-29

- Added a Together AI-compatible provider profile for the proxy's Chat Completions path.

## 0.3.33 - 2026-09-29

- Added a DeepSeek-compatible provider profile for the proxy's Chat Completions path.

## 0.3.32 - 2026-09-29

- Centralized supported proxy provider profile names for consistent CLI and SDK behavior.

## 0.3.31 - 2026-09-29

- Added a Cohere Compatibility API provider profile for the proxy's Chat Completions path.

## 0.3.30 - 2026-09-29

- Added a Mistral-compatible provider profile for the proxy's Chat Completions path.

## 0.3.29 - 2026-09-29

- Added a Groq-compatible provider profile for the proxy's Chat Completions path.

## 0.3.28 - 2026-09-29

- Connected provider compatibility profiles to the proxy CLI with explicit override support.

## 0.3.27 - 2026-09-29

- Added an OpenRouter-compatible provider profile to the proxy example with fail-closed attribution metadata validation.

## 0.3.26 - 2026-09-29

- Preserved benchmark label source URLs and notes in JUnit output for incorrect cases.

## 0.3.25 - 2026-09-29

- Preserved benchmark label source URLs and notes in JSON and SARIF results for downstream provenance tracking.

## 0.3.24 - 2026-09-29

- Added strict validation for benchmark label source URLs so malformed provenance metadata fails closed.

## 0.3.23 - 2026-09-29

- Added fail-closed validation for unknown `claimlatch-receipt` CLI options.

## 0.3.22 - 2026-09-29

- Shared upstream request header parsing between the proxy CLI and provider-compatible proxy example with regression coverage.

## 0.3.21 - 2026-09-29

- Extended the provider-compatible proxy example with fixed upstream request header configuration.

## 0.3.20 - 2026-09-29

- Added fixed upstream request header injection for provider tenant, version, and routing compatibility with SDK and CLI configuration.

## 0.3.19 - 2026-09-29

- Expanded the frozen independent benchmark to 62 balanced cases across 31 paired topics and updated train/dev/test splits.

## 0.3.18 - 2026-09-29

- Added an optional trusted `--public-key-file` input to `claimlatch-receipt verify` for external receipt-signing key validation.

## 0.3.17 - 2026-09-29

- Added credential-free `claimlatch-receipt verify` CLI support with fail-closed exit codes for signed receipt automation.

## 0.3.16 - 2026-09-29

- Added credential-free `claimlatch-bench --validate` dataset and manifest verification output for local and CI checks.

## 0.3.15 - 2026-09-29

- Added credential-free `claimlatch-proxy --help` output documenting setup, routes, compatibility settings, and fail-closed behavior.

## 0.3.14 - 2026-09-29

- Added a reusable fail-closed HTTP integration with a runnable guarded-answer service example.

## 0.3.13 - 2026-09-29

- Added explicit provider response-header name and prefix configuration for SDK and proxy CLI compatibility, while keeping response framing and hop-by-hop headers blocked.

## 0.3.12 - 2026-09-29

- Added credential-free `claimlatch-bench --help` output documenting dataset, split, manifest, and format options.

## 0.3.11 - 2026-09-29

- Added fail-closed `claimlatch-bench --split train|dev|test` selection for the frozen benchmark partitions.

## 0.3.10 - 2026-09-29

- Preserved additional provider diagnostic response headers with `X-Goog-*`, `X-Amzn-*`, and `Anthropic-*` prefixes.

## 0.3.9 - 2026-09-29

- Added a custom provider compatibility profile regression test and configuration example for provider-specific API key headers and relative completion paths.

## 0.3.8 - 2026-09-29

- Preserved provider diagnostic `X-MS-*` response headers on successful proxy responses.

## 0.3.7 - 2026-09-29

- Expanded the frozen independent benchmark to 54 balanced cases across 27 paired topics using public primary-source labels.

## 0.3.6 - 2026-09-29

- Added fail-closed benchmark manifest verification to the default benchmark CLI and SDK helpers.

## 0.3.5 - 2026-09-29

- Added a SHA-256 integrity manifest for the frozen benchmark files.
- Made benchmark manifest verification line-ending independent across Windows and Linux.

## 0.3.4 - 2026-09-29

- Added fail-closed validation for configured upstream base URLs.

## 0.3.3 - 2026-09-29

- Added configurable provider-specific upstream Chat Completions paths and query parameters.
- Added an SDK proxy example for provider-specific credential headers and deployment paths.

## 0.3.2 - 2026-09-29

- Added an explicit non-streaming structured-output verifier hook while keeping tool-call and multimodal output fail-closed by default.
- Extended the structured-output verifier hook to buffered streaming tool-call and multimodal choices without releasing SSE frames before verification.
- Added a runnable structured-output verifier example with application-owned tool allowlist policy.
- Added configurable upstream API key header compatibility for providers that do not use `Authorization`.

## 0.3.1 - 2026-09-29

- Added deterministic JSON, JUnit, and SARIF output formats to the benchmark CLI.
- Preserved the legacy `--json` benchmark flag and added `--format text|json|junit|sarif`.
- Added CI-friendly failure details for false passes and false blocks without fabricating benchmark results.
- Added optional provenance egress host and port allowlists with redirect revalidation.
- Exposed outbound allowlist configuration through `createDefaultClaimLatch`.
- Added fixed and claim-aware official-source domain policies for Tavily search with post-response filtering.
- Added a filesystem verification-receipt store and key-resolver support for rotation-aware verification.
- Expanded the frozen independent benchmark to 48 balanced cases across 24 paired topics with train/dev/test splits.
- Improved proxy compatibility by forwarding safe client metadata and preserving selected upstream request, rate-limit, and retry headers.
- Added a runnable receipt-storage integration example with ephemeral demo keys and key-resolver verification.
- Documented the fail-closed buffered and verified streaming protocol and its implementation boundaries.
- Added buffered, post-verification replay for textual Chat Completions streams with size limits and fail-closed malformed-stream handling.
- Added configurable upstream deadlines and client-disconnect cancellation for buffered proxy requests.
- Made non-streaming proxy responses fail closed for mixed multimodal content and tool-call metadata.

## 0.3.0 - 2026-09-29

- Added supporting and contradicting evidence relations to verifier results.
- Added deterministic cross-source contradiction detection based on normalized source URLs.
- Added a default fail-closed policy violation for unresolved disagreement between distinct sources.
- Added PDF.js-based page-level text extraction with page-local quote offsets and safe fallback on parse failure.
- Added deterministic Ed25519-signed verification receipts with embedded public keys and tamper detection.
- Expanded the independent benchmark seed to 32 balanced, human-authored cases across 16 paired topics.
- Updated the proxy to verify every textual choice in multi-choice completions and fail closed if any choice is blocked.
- Added a `verifyBeforeRelease` integration helper and runnable guarded-application example.

## 0.2.0 - 2026-09-28

- Added best-effort source-document hydration with quote offsets, content type, final URL, retrieval timestamp, and SHA-256 provenance.
- Added strict policy support for requiring fetched-document provenance on decisive verdicts.
- Added common literal private-network/localhost blocking, redirect revalidation, timeouts, and body-size limits for evidence fetching.
- Added DNS resolution validation and public-IP pinning for built-in provenance requests, failing closed on unsafe resolution results.
- Moved decisive evidence-binding enforcement into the ClaimLatch core so custom verifiers cannot bypass it.
- Added duplicate claim-ID rejection and selected-evidence freshness checks.
- Added a non-streaming OpenAI-compatible Chat Completions reverse proxy that returns blocked answers as HTTP 422.
- Added an independent-label benchmark runner with decision accuracy, false-pass rate, and false-block rate.
- Added a small human-authored benchmark seed with public label-source URLs.
- Expanded tests to cover provenance, SSRF guards, proxy behavior, benchmark metrics, and core plugin invariants.

## 0.1.0 - 2026-09-28

Initial V1 implementation.

- Atomic factual claim extraction through an OpenAI-compatible model adapter.
- Tavily evidence search adapter plus provider interfaces for custom sources.
- Evidence-bound `SUPPORTED`, `CONTRADICTED`, `UNSUPPORTED`, and `UNVERIFIABLE` statuses.
- Deterministic policy gate with fail-closed defaults.
- Claim/evidence ID validation and prompt-injection-resistant verifier instructions.
- TypeScript SDK, CLI, offline plumbing demo, tests, benchmark fixture format, and GitHub Actions CI.
