export { createDefaultClaimLatch } from "./default-gate.js";
export type { DefaultClaimLatchOptions } from "./default-gate.js";
export {
  createBenchmarkManifest,
  parseBenchmarkJsonl,
  parseBenchmarkManifest,
  runBenchmark,
  verifyBenchmarkManifestEntry,
} from "./benchmark.js";
export type {
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkManifestSource,
  BenchmarkManifest,
  BenchmarkManifestEntry,
  BenchmarkReport,
} from "./benchmark.js";
export { formatBenchmarkReport, renderBenchmarkText, resolveBenchmarkOutputFormat } from "./benchmark-formatters.js";
export type { BenchmarkFormatOptions, BenchmarkOutputFormat } from "./benchmark-formatters.js";
export { createOpenAIProxy } from "./proxy.js";
export {
  PROXY_PROVIDER_PROFILE_NAMES,
  formatProxyProviderProfileNames,
  resolveProxyProviderProfile,
} from "./proxy-profiles.js";
export type {
  OpenAIProxyOptions,
  OpenAIProxyServer,
  OpenAIProxyStructuredOutputVerifier,
} from "./proxy.js";
export type {
  ProxyProviderProfile,
  ProxyProviderProfileName,
  ProxyProviderProfileOptions,
} from "./proxy-profiles.js";
export { ProvenanceEvidenceProvider, isSafePublicHttpUrl } from "./providers/provenance.js";
export type { OutboundAllowlist } from "./providers/provenance.js";
export { extractPdfPages } from "./providers/pdf.js";
export type { PdfPageText, PdfTextParser } from "./providers/pdf.js";
export { ClaimLatch } from "./gate.js";
export { DEFAULT_POLICY, calculateCoverage, evaluatePolicy, mergePolicy } from "./policy.js";
export {
  ConfidenceEvaluationError,
  applyConfidenceCalibrationProfile,
  createClaimConfidence,
  validateConfidenceCalibrationProfile,
} from "./confidence.js";
export {
  createConfidenceCalibrationProfile,
  evaluateCalibration,
  hashCalibrationDataset,
  parseCalibrationJsonl,
  validateCalibrationDatasets,
} from "./calibration.js";
export { LlmClaimExtractor, LlmClaimVerifier, OpenAICompatibleClient } from "./providers/openai-compatible.js";
export { StaticEvidenceProvider } from "./providers/static.js";
export { TavilyEvidenceProvider } from "./providers/tavily.js";
export type { DomainPolicy, OfficialDomainResolver } from "./providers/tavily.js";
export {
  ClaimLatchBlockedError,
  createGuardedAnswerFetchHandler,
  createGuardedAnswerServer,
  verifyBeforeRelease,
} from "./integrations.js";
export type {
  GuardedAnswerFetchHandler,
  GuardedAnswerFetchHandlerOptions,
  GuardedAnswerServer,
  GuardedAnswerServerOptions,
  VerifiedAnswer,
} from "./integrations.js";
export {
  createSignedVerificationReceipt,
  FileVerificationReceiptStore,
  hashVerificationReceiptPayload,
  serializeVerificationReceiptPayload,
  verifySignedVerificationReceipt,
} from "./receipt.js";
export type {
  FileVerificationReceiptStoreOptions,
  ReceiptKeyResolver,
  ReceiptVerificationOptions,
  SignedVerificationReceiptOptions,
  VerificationReceiptStore,
} from "./receipt.js";
export type * from "./types.js";
