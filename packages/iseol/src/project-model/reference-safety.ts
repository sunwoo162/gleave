import { assertCheckHttpUrl, isSensitiveHttpCredentialKey } from "../desktop-agent/contracts.js";

const OPAQUE_REFERENCE_SCHEMES = new Set([
  "build", "calendar", "desktop-job", "discord", "discord-binding", "figma",
  "github", "history", "notion", "pull-request", "reasoning-turn",
]);

const BEARER_CREDENTIAL = /\bBearer\s+[^\s,;}]+/i;
const NESTED_URI_SCHEME = /(?:https?|javascript|file|data|blob|ftp|ws|wss|mailto|vbscript):/i;

function decodedRepresentations(value: string): string[] | undefined {
  const representations = [value];
  let current = value;
  for (let index = 0; index < 2 && current.includes("%"); index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      representations.push(decoded);
      current = decoded;
    } catch {
      return undefined;
    }
  }
  if (current.includes("%")) return undefined;
  return representations;
}

function containsCredentialLikeContent(value: string): boolean {
  const queryOrFragment = /[?#]([\s\S]*)/.exec(value)?.[1];
  if (queryOrFragment === undefined) return BEARER_CREDENTIAL.test(value);
  for (const parameter of queryOrFragment.split(/[&#?]/)) {
    const rawKey = parameter.trim().split(/[=:]/, 1)[0];
    if (rawKey && isSensitiveHttpCredentialKey(rawKey)) return true;
  }
  if (BEARER_CREDENTIAL.test(value)) return true;
  return false;
}

function assertSafeReferenceRepresentation(value: string): void {
  const scheme = /^[A-Za-z][A-Za-z\d+.-]*:/.exec(value)?.[0]?.slice(0, -1).toLowerCase();
  if (scheme && /^https?:\/\//i.test(value)) {
    assertCheckHttpUrl(value);
  } else if (scheme && !OPAQUE_REFERENCE_SCHEMES.has(scheme)) {
    throw new Error("unsupported project evidence reference scheme");
  }
  if (containsCredentialLikeContent(value)) throw new Error("credential-shaped project evidence reference");
  if (!scheme || /^https?:\/\//i.test(value)) return;
  const payload = value.slice(scheme.length + 1);
  if (scheme === "github" && /^issue:/i.test(payload)) {
    const issueUrl = payload.slice("issue:".length);
    if (!/^https?:\/\/\S+$/i.test(issueUrl)) throw new Error("github issue reference must contain one HTTP URL");
    const authorityEnd = issueUrl.indexOf("://") + 3;
    if (NESTED_URI_SCHEME.test(issueUrl.slice(authorityEnd))) throw new Error("github issue reference contains an extra URI");
    assertCheckHttpUrl(issueUrl);
    return;
  }
  if (NESTED_URI_SCHEME.test(payload)) throw new Error("opaque reference contains a nested URI");
}

export function sanitizeProjectEvidenceReference(value: string): string | undefined {
  const candidate = value.trim();
  if (candidate !== value || /[\u0000-\u001f\u007f]/.test(value) || candidate.startsWith("//") || /%(?![0-9a-f]{2})/i.test(candidate)) return undefined;
  const representations = decodedRepresentations(candidate);
  if (!representations) return undefined;
  try {
    for (const representation of representations) {
      if (representation !== representation.trim() || /[\u0000-\u001f\u007f]/.test(representation) || representation.startsWith("//")) {
        throw new Error("unsafe decoded project evidence reference");
      }
      assertSafeReferenceRepresentation(representation);
    }
  } catch {
    return undefined;
  }
  return value;
}
