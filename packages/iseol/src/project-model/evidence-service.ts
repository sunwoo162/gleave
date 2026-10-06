import type { HarnessEvidenceRecord } from "../harness/contracts.js";
import { sanitizeProjectEvidenceReference } from "./reference-safety.js";

function sanitizeProjectEvidence(item: HarnessEvidenceRecord): HarnessEvidenceRecord {
  const reference = item.reference;
  if (reference === undefined) return item;
  const sanitizedReference = sanitizeProjectEvidenceReference(reference);
  if (sanitizedReference === reference) return item;
  const { reference: _unsafeReference, ...sanitized } = item;
  return sanitized;
}

export function selectProjectEvidence(input: {
  projectId: string;
  runId: string;
  evidence: readonly HarnessEvidenceRecord[];
}): HarnessEvidenceRecord[] {
  // Both durable identities are required. A single matching field is not
  // enough to prove that an evidence record belongs to this user project.
  return input.evidence
    .filter((item) => item.projectId === input.projectId && item.runId === input.runId)
    .map(sanitizeProjectEvidence);
}
