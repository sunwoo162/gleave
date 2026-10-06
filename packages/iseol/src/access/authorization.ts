import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Principal } from "../identity/contracts.js";
import { assertIdentityId } from "../identity/contracts.js";

export type Scope =
  | { kind: "personal"; ownerUserId: string }
  | { kind: "team"; teamId: string };

export type AccessAction = "read" | "write" | "execute" | "manage";

export type ResourceGrant = {
  scope: Scope;
  memberUserIds?: string[];
  requestedUserId?: string;
};

export function personalScope(ownerUserId: string): Scope {
  assertIdentityId(ownerUserId);
  return { kind: "personal", ownerUserId };
}

export function teamScope(teamId: string): Scope {
  assertIdentityId(teamId);
  return { kind: "team", teamId };
}

export function scopeDirectory(platformRoot: string, scope: Scope): string {
  if (scope.kind === "personal") assertIdentityId(scope.ownerUserId);
  else assertIdentityId(scope.teamId);
  const directory = scope.kind === "personal"
    ? resolve(platformRoot, "users", scope.ownerUserId)
    : resolve(platformRoot, "teams", scope.teamId);
  const relation = relative(resolve(platformRoot), directory);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error("Scope directory escapes platform root");
  return directory;
}

export function authorizeResource(principal: Principal, grant: ResourceGrant): boolean {
  if (grant.requestedUserId !== undefined && grant.requestedUserId !== principal.userId) return false;
  if (grant.scope.kind === "personal") return principal.userId === grant.scope.ownerUserId;
  return grant.memberUserIds?.includes(principal.userId) === true;
}

export function assertScopeAccess(principal: Principal, grant: ResourceGrant, action: AccessAction): void {
  if (!authorizeResource(principal, grant)) throw new Error(`Forbidden ${action} access to ${grant.scope.kind} scope`);
}
