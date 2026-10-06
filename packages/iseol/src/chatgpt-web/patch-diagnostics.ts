import { createHash } from "node:crypto";

export type PatchRejectionClass =
  | "frame-missing" | "malformed-frame" | "extra-transport-text" | "empty-patch"
  | "malformed-unified-diff" | "malformed-hunk" | "truncated-diff" | "invalid-path"
  | "workspace-escape" | "unsupported-patch-shape" | "contract-mismatch" | "unknown-safe-class";

function lengthBucket(text: string): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes < 256) return "short";
  if (bytes < 4096) return "medium";
  if (bytes < 65536) return "long";
  return "oversized";
}

export function patchRejectionDiagnostic(
  response: string,
  rejectionClass: PatchRejectionClass,
  extra: Record<string, string | boolean> = {},
): Record<string, string | boolean> {
  const normalized = response.replaceAll("\r\n", "\n");
  const firstLine = normalized.slice(0, normalized.indexOf("\n"));
  const payload = normalized.includes("\n") ? normalized.slice(normalized.indexOf("\n") + 1) : "";
  const trimmedPayload = payload.trim();
  const firstLineClass = firstLine === "ISEOL_PATCH_V1" ? "patch-frame-header"
    : firstLine === "" ? "empty"
      : /^```/.test(firstLine) ? "markdown-fence"
        : firstLine.startsWith("{") ? "json-object"
          : firstLine.startsWith("[") ? "json-array"
            : /^---\s/.test(firstLine) ? "unified-diff"
              : firstLine === "ISEOL_IMPLEMENT_DONE" ? "completion-signal"
                : /(token|secret|password|cookie|authorization|bearer)/i.test(firstLine) ? "secret-or-prose" : "prose-or-text";
  return {
    rejectionClass,
    responseLengthBucket: lengthBucket(response),
    responseSha256: createHash("sha256").update(response, "utf8").digest("hex"),
    frameDetected: firstLine === "ISEOL_PATCH_V1",
    responsePresent: response.length > 0,
    firstLineClass,
    jsonEnvelopeDetected: firstLine.startsWith("{") || firstLine.startsWith("["),
    unifiedDiffMarkerDetected: /^---\s/.test(firstLine) || /^diff --git\s/.test(trimmedPayload),
    completionSignalPresent: normalized.includes("ISEOL_IMPLEMENT_DONE"),
    diffFenceDetected: /^```diff[ \t]*\n[\s\S]*\n```$/i.test(payload.trim()),
    prefixTextPresent: firstLine !== "ISEOL_PATCH_V1",
    suffixTextPresent: payload.trimEnd().endsWith("```") && !/^```diff[ \t]*\n[\s\S]*\n```$/i.test(payload.trim()),
    payloadEmpty: payload.trim().length === 0,
    ...extra,
  };
}
