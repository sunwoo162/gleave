import type { PrototypeCandidate } from "../project-model/contracts.js";
import { updatePrototypeCandidate } from "../project-model/prototype-store.js";

export async function archivePrototypeCandidate(
  modelRoot: string,
  prototypeId: string,
  at: string,
): Promise<PrototypeCandidate> {
  const updated = await updatePrototypeCandidate(modelRoot, prototypeId, {
    status: "archived",
    updatedAt: at,
  }, {
    rejectPromoted: true,
    promotedError: `Promoted prototype cannot be archived: ${prototypeId}`,
    returnIfStatus: "archived",
  });
  if (!updated) throw new Error(`Prototype not found: ${prototypeId}`);
  return updated;
}
