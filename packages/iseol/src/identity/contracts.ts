export type UserRecord = {
  version: 1;
  id: string;
  timezone: string;
  preferences: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  version: 1;
  id: string;
  userId: string;
  roles: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type Principal = {
  userId: string;
  sessionId: string;
  roles: string[];
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function assertIdentityId(value: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(`Invalid identity id: ${value}`);
}

export function assertTimestamp(value: string, label: string): void {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label}`);
}
