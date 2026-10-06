import type { Principal } from "../identity/contracts.js";
import type { AccessAction, Scope } from "../access/authorization.js";

export type PlatformUserRecord = {
  version: 1;
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSession = {
  id: string;
  token: string;
  userId: string;
  roles: string[];
  createdAt: string;
  expiresAt: string;
};

export type PlatformUserInput = {
  id?: string;
  email: string;
  displayName: string;
  timezone: string;
  password?: string;
};

export type PlatformUserService = {
  createUser(input: PlatformUserInput): Promise<PlatformUserRecord>;
  getUser(userId: string): Promise<PlatformUserRecord | null>;
  listUsers(): Promise<PlatformUserRecord[]>;
  findUserByEmail(email: string): Promise<PlatformUserRecord | null>;
  authenticateUser(email: string, password: string): Promise<PlatformUserRecord | null>;
  changePassword(principal: Principal, currentPassword: string, newPassword: string): Promise<void>;
  createSession(input: { userId: string; roles: string[]; expiresAt: string }): Promise<PlatformSession>;
  revokeSession(sessionId: string, at?: string): Promise<void>;
  resolveAuthenticatedPrincipal(token: string, at?: string): Promise<Principal | null>;
  assertScopeAccess(principal: Principal, scope: Scope, action: AccessAction, memberUserIds?: string[]): void;
};
