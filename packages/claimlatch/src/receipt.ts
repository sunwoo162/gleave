import { createHash, sign, verify } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SignedVerificationReceipt,
  VerificationReceiptPayload,
  VerificationCounts,
  VerificationReport,
} from "./types.js";

export interface SignedVerificationReceiptOptions {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId?: string;
}

export interface ReceiptVerificationOptions {
  publicKeyPem?: string;
  keyResolver?: ReceiptKeyResolver;
}

export type ReceiptKeyResolver = (keyId: string | undefined) => string | undefined;

export interface VerificationReceiptStore {
  save(id: string, receipt: SignedVerificationReceipt): Promise<void>;
  load(id: string): Promise<SignedVerificationReceipt | undefined>;
}

export interface FileVerificationReceiptStoreOptions {
  directory: string;
}

export class FileVerificationReceiptStore implements VerificationReceiptStore {
  readonly #directory: string;

  constructor(options: FileVerificationReceiptStoreOptions) {
    if (!options.directory.trim()) throw new TypeError("Receipt store directory is required.");
    this.#directory = options.directory;
  }

  async save(id: string, receipt: SignedVerificationReceipt): Promise<void> {
    const path = this.#pathFor(id);
    if (!isSignedVerificationReceipt(receipt)) throw new TypeError("Invalid signed verification receipt.");

    await mkdir(this.#directory, { recursive: true });
    const temporaryPath = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    try {
      await rename(temporaryPath, path);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // Preserve the original write/rename error.
      }
      throw error;
    }
  }

  async load(id: string): Promise<SignedVerificationReceipt | undefined> {
    const path = this.#pathFor(id);
    let serialized: string;
    try {
      serialized = await readFile(path, "utf8");
    } catch (error) {
      if (isFileNotFound(error)) return undefined;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Stored receipt ${id} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isSignedVerificationReceipt(parsed)) throw new Error(`Stored receipt ${id} has an invalid shape.`);
    return parsed;
  }

  #pathFor(id: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id)) {
      throw new TypeError("Receipt ID must contain only letters, numbers, dots, underscores, or hyphens.");
    }
    return join(this.#directory, `${id}.json`);
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Receipt payload contains a non-finite number");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${entries.join(",")}}`;
  }

  throw new TypeError("Receipt payload contains an unsupported value");
}

export function serializeVerificationReceiptPayload(payload: VerificationReceiptPayload): string {
  return canonicalize(payload);
}

export function hashVerificationReceiptPayload(payload: VerificationReceiptPayload): string {
  return createHash("sha256").update(serializeVerificationReceiptPayload(payload)).digest("hex");
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createSignedVerificationReceipt(
  report: VerificationReport,
  options: SignedVerificationReceiptOptions,
): SignedVerificationReceipt {
  if (options.keyId !== undefined && (typeof options.keyId !== "string" || options.keyId.trim().length === 0)) {
    throw new TypeError("keyId must be a non-empty string.");
  }

  const payload: VerificationReceiptPayload = {
    report,
    publicKeyPem: options.publicKeyPem,
  };
  if (options.keyId !== undefined) {
    payload.keyId = options.keyId;
  }

  const serializedPayload = serializeVerificationReceiptPayload(payload);
  const signature = sign(null, new TextEncoder().encode(serializedPayload), options.privateKeyPem);

  return {
    version: 1,
    algorithm: "Ed25519",
    payload,
    signature: encodeBase64Url(signature),
  };
}

export function verifySignedVerificationReceipt(
  receipt: SignedVerificationReceipt,
  options: ReceiptVerificationOptions = {},
): boolean {
  try {
    if (!isSignedVerificationReceipt(receipt)) return false;

    const publicKeyPem = options.publicKeyPem
      ?? (options.keyResolver ? options.keyResolver(receipt.payload.keyId) : receipt.payload.publicKeyPem);
    if (!publicKeyPem) return false;
    const serializedPayload = serializeVerificationReceiptPayload(receipt.payload);
    return verify(
      null,
      new TextEncoder().encode(serializedPayload),
      publicKeyPem,
      decodeBase64Url(receipt.signature),
    );
  } catch {
    return false;
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

function isSignedVerificationReceipt(value: unknown): value is SignedVerificationReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<SignedVerificationReceipt>;
  const payload = receipt.payload;
  return receipt.version === 1
    && receipt.algorithm === "Ed25519"
    && typeof receipt.signature === "string"
    && receipt.signature.trim().length > 0
    && !!payload
    && typeof payload === "object"
    && typeof (payload as { publicKeyPem?: unknown }).publicKeyPem === "string"
    && (payload as { publicKeyPem: string }).publicKeyPem.trim().length > 0
    && ((payload as { keyId?: unknown }).keyId === undefined
      || (typeof (payload as { keyId?: unknown }).keyId === "string"
        && (payload as { keyId: string }).keyId.trim().length > 0))
    && isVerificationReport((payload as { report?: unknown }).report);
}

function isVerificationReport(value: unknown): value is VerificationReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Partial<VerificationReport>;
  return typeof report.passed === "boolean"
    && isCoverage(report.coverage)
    && isVerificationCounts(report.counts)
    && Array.isArray(report.claims)
    && report.claims.every(isClaimVerification)
    && Array.isArray(report.violations)
    && report.violations.every(isPolicyViolation)
    && typeof report.generatedAt === "string"
    && report.generatedAt.length > 0;
}

function isCoverage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isVerificationCounts(value: unknown): value is VerificationCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const counts = value as Partial<VerificationCounts>;
  return [counts.total, counts.supported, counts.contradicted, counts.unsupported, counts.unverifiable]
    .every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0);
}

function isClaimVerification(value: unknown): boolean {
  const record = asRecord(value);
  const claim = asRecord(record?.claim);
  return typeof claim?.id === "string"
    && claim.id.length > 0
    && typeof claim.text === "string"
    && claim.text.length > 0
    && isOneOf(claim.kind, ["fact", "number", "date", "current"])
    && isOneOf(claim.importance, ["critical", "normal", "minor"])
    && isOneOf(record?.status, ["SUPPORTED", "CONTRADICTED", "UNSUPPORTED", "UNVERIFIABLE"])
    && typeof record?.reason === "string"
    && isStringArray(record.evidenceIds)
    && isObjectArray(record.evidence)
    && isOptionalStringArray(record.supportingEvidenceIds)
    && isOptionalStringArray(record.contradictingEvidenceIds)
    && isOptionalClaimConfidence(record.confidence);
}

function isPolicyViolation(value: unknown): boolean {
  const record = asRecord(value);
  return isOneOf(record?.code, [
    "CONTRADICTION",
    "CROSS_SOURCE_CONTRADICTION",
    "UNSUPPORTED_LIMIT",
    "UNVERIFIABLE_LIMIT",
    "COVERAGE_BELOW_MINIMUM",
    "CRITICAL_CLAIM_NOT_SUPPORTED",
    "CURRENT_CLAIM_MISSING_FRESH_EVIDENCE",
    "DECISIVE_CLAIM_MISSING_DOCUMENT_PROVENANCE",
    "NO_CLAIMS_EXTRACTED",
  ])
    && typeof record?.message === "string"
    && record.message.length > 0
    && (record.claimId === undefined || (typeof record.claimId === "string" && record.claimId.length > 0));
}

function isOneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isOptionalClaimConfidence(value: unknown): boolean {
  if (value === undefined) return true;
  const confidence = asRecord(value);
  return isProbability(confidence?.value)
    && confidence?.meaning === "verification-status-correctness"
    && isNonEmptyString(confidence?.scorerId)
    && isNonEmptyString(confidence?.calibrationProfileId);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isObjectArray(value: unknown): boolean {
  return Array.isArray(value)
    && value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
