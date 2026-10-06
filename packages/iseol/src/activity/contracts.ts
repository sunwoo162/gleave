import type { Principal } from "../identity/contracts.js";

export type ActivityActorType = "user" | "ai" | "system";
export type ActivityVerificationStatus = "verified" | "unverified" | "unknown";
export type ActivityStatus = "active" | "retracted";
export type ActivityPayload = Record<string, string | number | boolean | null>;

export type ActivityEvent = {
  version: 1;
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventVersion: number;
  actorType: ActivityActorType;
  verificationStatus: ActivityVerificationStatus;
  status: ActivityStatus;
  payload: ActivityPayload;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  retractedAt?: string;
};

export type ActivityEventInput = {
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventVersion: number;
  actorType: ActivityActorType;
  verificationStatus: ActivityVerificationStatus;
  payload?: ActivityPayload;
  occurredAt?: string;
};

export type ActivityService = {
  recordActivityEvent(principal: Principal, input: ActivityEventInput): Promise<ActivityEvent>;
  listActivityEvents(principal: Principal): Promise<ActivityEvent[]>;
  getActivityEvent(principal: Principal, eventId: string): Promise<ActivityEvent | null>;
  retractActivityEvent(principal: Principal, eventId: string, at?: string): Promise<ActivityEvent>;
};
