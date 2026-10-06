import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { assertProjectModelId } from "../project-model/contracts.js";
import { sanitizeCredentialText } from "../security/text-safety.js";
import { withDurableDiscordProgressNotificationLock } from "./progress-notification-lock.js";

export type ProgressNotificationEvent = {
  id: string;
  type: string;
  occurredAt: string;
  projectId?: string;
  campaignId?: string;
  runId?: string;
  summary?: string;
  status?: string;
};

export type DiscordProgressNotification = {
  eventId: string;
  projectId?: string;
  title: string;
  content: string;
  occurredAt: string;
};

export type ProgressNotificationDelivery = {
  accepted: boolean;
  messageId?: string;
};

export type ProgressNotificationAdapter = {
  send: (notification: DiscordProgressNotification) => Promise<ProgressNotificationDelivery>;
};

export type ProgressNotificationDispatchResult = {
  status: "accepted" | "failed" | "unknown" | "duplicate";
  notification: DiscordProgressNotification;
  messageId?: string;
};

function notificationFile(root: string, projectId: string): string {
  assertProjectModelId(projectId);
  return resolve(root, "discord-notifications", projectId, "delivered.jsonl");
}

function safe(value: string | undefined, max = 240): string {
  if (!value) return "";
  return sanitizeCredentialText(value.replace(/[\r\n\t]+/g, " "), max);
}

export function formatProgressNotification(event: ProgressNotificationEvent): DiscordProgressNotification | null {
  const projectId = event.projectId;
  if (!projectId && !event.campaignId) return null;
  const subject = projectId ? `Project ${projectId}` : `Campaign ${event.campaignId}`;
  const status = event.status ? ` · ${safe(event.status, 60)}` : "";
  const summary = safe(event.summary, 220);
  return {
    eventId: event.id,
    ...(projectId ? { projectId } : {}),
    title: `${event.type}${status}`,
    content: `${subject}: ${summary || event.type}`.slice(0, 500),
    occurredAt: event.occurredAt,
  };
}

export async function deliverProgressNotification(root: string, notification: DiscordProgressNotification): Promise<boolean> {
  if (!notification.projectId) return false;
  return withDurableDiscordProgressNotificationLock(
    root,
    notification.projectId,
    notification.eventId,
    async () => {
      const path = notificationFile(root, notification.projectId!);
      await mkdir(dirname(path), { recursive: true });
      let existing: Array<{ eventId?: string }> = [];
      try {
        existing = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { eventId?: string });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (existing.some((item) => item.eventId === notification.eventId)) return false;
      await appendFile(path, `${JSON.stringify(notification)}\n`, "utf8");
      return true;
    },
    { waitForMs: 2_000 },
  );
}

/**
 * Sends a bounded fact through an injected Discord adapter. The durable log is
 * written only after the adapter accepts the message; adapter exceptions are
 * recorded as unknown so a restart cannot blindly duplicate an uncertain send.
 */
export async function dispatchProgressNotification(
  root: string,
  notification: DiscordProgressNotification,
  adapter: ProgressNotificationAdapter,
): Promise<ProgressNotificationDispatchResult> {
  if (!notification.projectId) return { status: "failed", notification };
  const path = notificationFile(root, notification.projectId);
  await mkdir(dirname(path), { recursive: true });
  try {
    return await withDurableDiscordProgressNotificationLock(
      root,
      notification.projectId,
      notification.eventId,
      async () => {
        let records: Array<{ eventId?: string; status?: string; messageId?: string }> = [];
        try {
          records = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { eventId?: string; status?: string; messageId?: string });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        const prior = records.find((record) => record.eventId === notification.eventId);
        if (prior?.status === "accepted" || (!prior?.status && prior)) return { status: "duplicate", notification, ...(prior.messageId ? { messageId: prior.messageId } : {}) };
        if (prior?.status === "unknown") return { status: "unknown", notification };
        try {
          const result = await adapter.send(notification);
          if (!result.accepted) {
            await appendFile(path, `${JSON.stringify({ ...notification, status: "failed" })}\n`, "utf8");
            return { status: "failed", notification };
          }
          await appendFile(path, `${JSON.stringify({ ...notification, status: "accepted", ...(result.messageId ? { messageId: result.messageId } : {}) })}\n`, "utf8");
          return { status: "accepted", notification, ...(result.messageId ? { messageId: result.messageId } : {}) };
        } catch {
          await appendFile(path, `${JSON.stringify({ ...notification, status: "unknown" })}\n`, "utf8");
          return { status: "unknown", notification };
        }
      },
      { waitForMs: 0 },
    );
  } catch (error) {
    if (error instanceof Error && /concurrency conflict/i.test(error.message)) return { status: "unknown", notification };
    throw error;
  }
}
