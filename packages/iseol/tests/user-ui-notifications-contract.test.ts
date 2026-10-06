import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("approved user shell renders durable notification data without a replacement dashboard", async () => {
  const [api, navigation] = await Promise.all([
    readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../user-ui/src/components/Navigation.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /listUserNotifications/);
  assert.match(api, /markUserNotificationRead/);
  assert.match(api, /openUserNotificationStream/);
  assert.match(api, /\/api\/user\/notifications\/stream/);
  assert.match(api, /\/api\/user\/notifications/);
  assert.match(navigation, /data-testid="notification-bell"/);
  assert.match(navigation, /openUserNotificationStream/);
  assert.match(navigation, /aria-label="알림"/);
  assert.match(navigation, /새 알림이 없습니다/);
  assert.match(navigation, /navigate\('\/teams'\)/);
  assert.match(navigation, /notification.source.type === 'team-invite'/);
  assert.match(navigation, /notification.source.type === 'achievement'/);
  assert.match(navigation, /navigate\('\/character'\)/);
  assert.match(navigation, /navigate\('\/ai-chat'\)/);
  assert.match(navigation, /navigate\('\/world'\)/);
});

test("community comment notifications return to the Community surface", async () => {
  const [api, navigation] = await Promise.all([
    readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../user-ui/src/components/Navigation.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /type: 'community-comment'/);
  assert.match(navigation, /notification\.source\.type === 'community-comment'/);
  assert.match(navigation, /navigate\('\/community'\)/);
});

test("notification stream reconnect carries the last received event cursor", async () => {
  const api = await readFile(new URL("../user-ui/src/api/userApi.ts", import.meta.url), "utf8");
  assert.match(api, /let lastEventId: string \| undefined/);
  assert.match(api, /headers\['last-event-id'\] = lastEventId/);
  assert.match(api, /lastEventId = event\.id/);
});
