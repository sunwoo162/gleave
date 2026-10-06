import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiSource = resolve(process.cwd(), "user-ui/src/api/userApi.ts");
const pageSource = resolve(process.cwd(), "user-ui/src/pages/MemoryVault.tsx");
const routesSource = resolve(process.cwd(), "user-ui/src/app/routes.ts");
const navigationSource = resolve(process.cwd(), "user-ui/src/components/Navigation.tsx");

test("memory vault exposes durable list, edit, and delete actions without placeholder data", async () => {
  const [api, page, routes, navigation] = await Promise.all([
    readFile(apiSource, "utf8"),
    readFile(pageSource, "utf8"),
    readFile(routesSource, "utf8"),
    readFile(navigationSource, "utf8"),
  ]);

  assert.match(api, /export async function listMemories\(/);
  assert.match(api, /export async function appendMemory\(/);
  assert.match(api, /export async function updateMemory\(/);
  assert.match(api, /export async function deleteMemory\(/);
  assert.match(api, /export async function updateMemorySharing\(/);
  assert.match(api, /export async function listSharedMemories\(/);
  assert.match(page, /listMemories/);
  assert.match(page, /appendMemory/);
  assert.match(page, /updateMemory/);
  assert.match(page, /deleteMemory/);
  assert.match(page, /updateMemorySharing/);
  assert.match(page, /listTeams/);
  assert.match(page, /공유 범위 저장/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /PRIVATE MEMORY/);
  assert.doesNotMatch(page, /todo-app|fake/i);
  assert.match(routes, /path: '\/memory', Component: MemoryVault/);
  assert.match(navigation, /\/memory/);
});
