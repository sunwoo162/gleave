import type { Principal } from "../identity/contracts.js";

export const INTEGRATION_PROVIDERS = ["calendar", "github", "discord"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationDeliveryState = "queued" | "delivered" | "unknown" | "not-configured" | "blocked";
export type IntegrationPayload = Record<string, string | number | boolean | null>;

export type IntegrationDelivery = {
  version: 1;
  id: string;
  userId: string;
  provider: IntegrationProvider;
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventVersion: number;
  payload: IntegrationPayload;
  state: IntegrationDeliveryState;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  externalRef?: string;
  reason?: "user-opt-in-required" | "provider-adapter-unconfigured" | "provider-error";
};

export type IntegrationDeliveryInput = {
  provider: IntegrationProvider;
  sourceType: string;
  sourceId: string;
  eventType: string;
  eventVersion: number;
  payload?: IntegrationPayload;
};

export type IntegrationAdapter = {
  deliver(delivery: IntegrationDelivery): Promise<{ externalRef: string } | { state: "unknown"; reason?: string }>;
};

export type IntegrationService = {
  enqueueDelivery(principal: Principal, input: IntegrationDeliveryInput): Promise<IntegrationDelivery>;
  dispatchDelivery(principal: Principal, deliveryId: string): Promise<IntegrationDelivery>;
  listDeliveries(principal: Principal): Promise<IntegrationDelivery[]>;
};
