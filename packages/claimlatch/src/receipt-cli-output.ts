export interface ReceiptVerificationJsonInput {
  valid: boolean;
  filePath: string;
  publicKeyPath?: string;
  payloadSha256?: string;
  receipt: unknown;
}

export function renderReceiptVerificationJson(input: ReceiptVerificationJsonInput): string {
  const receipt = asRecord(input.receipt);
  const payload = asRecord(receipt?.payload);
  const report = asRecord(payload?.report);
  const passed = input.valid && typeof report?.passed === "boolean" ? report.passed : undefined;
  const generatedAt =
    input.valid && typeof report?.generatedAt === "string" && report.generatedAt.length > 0
      ? report.generatedAt
      : undefined;
  const coverage =
    input.valid
      && typeof report?.coverage === "number"
      && Number.isFinite(report.coverage)
      && report.coverage >= 0
      && report.coverage <= 1
      ? report.coverage
      : undefined;
  const counts = input.valid ? asVerificationCounts(report?.counts) : undefined;
  return JSON.stringify({
    valid: input.valid,
    file: input.filePath,
    ...(receipt?.version === 1 ? { version: 1 } : {}),
    ...(receipt?.algorithm === "Ed25519" ? { algorithm: "Ed25519" } : {}),
    ...(typeof payload?.keyId === "string" ? { keyId: payload.keyId } : {}),
    ...(input.publicKeyPath ? { publicKeyFile: input.publicKeyPath } : {}),
    ...(input.valid && typeof input.payloadSha256 === "string" && /^[0-9a-f]{64}$/u.test(input.payloadSha256)
      ? { payloadSha256: input.payloadSha256 }
      : {}),
    ...(passed !== undefined ? { decision: passed ? "PASS" : "BLOCK" } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
    ...(coverage !== undefined ? { coverage } : {}),
    ...(counts ? { counts } : {}),
  });
}

function asVerificationCounts(value: unknown): VerificationCountsJson | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const keys: Array<keyof VerificationCountsJson> = [
    "total",
    "supported",
    "contradicted",
    "unsupported",
    "unverifiable",
  ];
  if (keys.some((key) => !Number.isInteger(record[key]) || (record[key] as number) < 0)) {
    return undefined;
  }

  return {
    total: record.total as number,
    supported: record.supported as number,
    contradicted: record.contradicted as number,
    unsupported: record.unsupported as number,
    unverifiable: record.unverifiable as number,
  };
}

interface VerificationCountsJson {
  total: number;
  supported: number;
  contradicted: number;
  unsupported: number;
  unverifiable: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
