const CREDENTIAL_ASSIGNMENT = /\b(token|cookie|secret|password)\s*[:=]\s*["']?([^\s,;}"']+)/i;
const BEARER_CREDENTIAL = /\bBearer\s+[^\s,;}]+/i;

function credentialShaped(value: string): boolean {
  return CREDENTIAL_ASSIGNMENT.test(value) || BEARER_CREDENTIAL.test(value);
}

function visit(value: unknown): boolean {
  if (typeof value === "string") return credentialShaped(value);
  if (Array.isArray(value)) return value.some(visit);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(visit);
}

export function assertNoCredentialShapedWebData(value: unknown): void {
  if (visit(value)) {
    throw new Error("ChatGPT Web result contains credential-shaped data");
  }
}
