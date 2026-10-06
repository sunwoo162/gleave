import path from "node:path";
import type {
  StructuredAction,
  StructuredCheck,
  StructuredVerificationResult,
} from "./contracts.js";

const blockedTools = new Set([
  "delete_file",
  "delete_directory",
  "send_message",
  "external_request",
  "publish",
  "deploy",
  "git_push",
]);

export function verifyStructuredAction(input: {
  action: StructuredAction;
  workspaceRoot: string;
  allowedTools: string[];
}): StructuredVerificationResult {
  const checks: StructuredCheck[] = [];
  const blockingReasons: string[] = [];
  const { action, workspaceRoot, allowedTools } = input;

  if (!allowedTools.includes(action.tool)) {
    const reason = "Tool is not allowlisted: " + action.tool;
    checks.push({ name: "tool-allowlist", status: "BLOCK", reason });
    blockingReasons.push(reason);
  } else {
    checks.push({
      name: "tool-allowlist",
      status: "PASS",
      reason: "Tool is explicitly allowlisted",
    });
  }

  if (blockedTools.has(action.tool)) {
    const reason = "Tool requires an explicit external-action approval: " + action.tool;
    checks.push({ name: "external-action-policy", status: "BLOCK", reason });
    blockingReasons.push(reason);
  } else {
    checks.push({
      name: "external-action-policy",
      status: "PASS",
      reason: "Tool is not in the unconditional external-action blocklist",
    });
  }

  if (action.path) {
    const root = path.resolve(workspaceRoot);
    const target = path.resolve(root, action.path);
    const relative = path.relative(root, target);
    const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    if (!inside) {
      const reason = "Action path escapes the approved workspace";
      checks.push({ name: "workspace-boundary", status: "BLOCK", reason });
      blockingReasons.push(reason);
    } else {
      checks.push({
        name: "workspace-boundary",
        status: "PASS",
        reason: "Action path remains inside the approved workspace",
      });
    }
  }

  return {
    decision: blockingReasons.length > 0 ? "BLOCK" : "PASS",
    checks,
    blockingReasons,
  };
}
