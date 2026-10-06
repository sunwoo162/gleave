import { formatProgressNotification, dispatchProgressNotification, type ProgressNotificationAdapter, type ProgressNotificationDispatchResult } from "./progress-notifications.js";
import type { WebProductEventBus, WebProductEvent } from "../web-control-plane/event-bus.js";

export type ProgressEventBridgeOptions = {
  eventBus: WebProductEventBus;
  durableRoot: string;
  adapter: ProgressNotificationAdapter;
  onResult?: (event: WebProductEvent, result: ProgressNotificationDispatchResult) => void;
};

export function connectProgressEventBridge(options: ProgressEventBridgeOptions): () => void {
  let active = true;
  const projectQueues = new Map<string, Promise<void>>();
  const dispatch = (event: WebProductEvent): void => {
    if (!active) return;
    const scope = event.scope ?? {};
    const payload = event.payload ?? {};
    const notification = formatProgressNotification({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(scope.campaignId ? { campaignId: scope.campaignId } : {}),
      ...(scope.runId ? { runId: scope.runId } : {}),
      ...(typeof payload.status === "string" ? { status: payload.status } : {}),
      ...(typeof payload.blocker === "string" ? { summary: payload.blocker } : typeof payload.change === "string" ? { summary: payload.change } : {}),
    });
    if (!notification) return;
    const deliver = async (): Promise<void> => {
      if (!active) return;
      const result = await dispatchProgressNotification(options.durableRoot, notification, options.adapter);
      options.onResult?.(event, result);
    };
    if (!notification.projectId) {
      void deliver().catch(() => undefined);
      return;
    }

    const previous = projectQueues.get(notification.projectId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(deliver);
    projectQueues.set(notification.projectId, current);
    void current
      .catch(() => undefined)
      .finally(() => {
        if (projectQueues.get(notification.projectId!) === current) projectQueues.delete(notification.projectId!);
      });
  };
  const unsubscribe = options.eventBus.subscribe(dispatch);
  void options.eventBus.replayAll()
    .then((events) => {
      if (!active) return;
      for (const event of events) dispatch(event);
    })
    .catch(() => undefined);
  return () => {
    active = false;
    unsubscribe();
  };
}
