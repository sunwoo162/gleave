import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("personal record surfaces format timestamps with the authenticated account timezone", async () => {
  const [portfolio, memory] = await Promise.all([
    readFile(resolve(process.cwd(), "user-ui/src/pages/PortfolioScreen.tsx"), "utf8"),
    readFile(resolve(process.cwd(), "user-ui/src/pages/MemoryVault.tsx"), "utf8"),
  ]);

  assert.match(portfolio, /formatWorldDateTime/);
  assert.match(portfolio, /useUser/);
  assert.match(portfolio, /profile\.timezone/);
  assert.doesNotMatch(portfolio, /new Date\(event\.occurredAt\)\.toLocaleString\('ko-KR'\)/);
  assert.doesNotMatch(portfolio, /new Date\(item\.occurredAt\)\.toLocaleString\('ko-KR'\)/);
  assert.match(portfolio, /formatWorldDate\(timezone, entry\.updatedAt\)/);
  assert.doesNotMatch(portfolio, /new Date\(entry\.updatedAt\)\.toLocaleDateString/);
  assert.match(memory, /formatWorldDateTime/);
  assert.match(memory, /useUser/);
  assert.match(memory, /profile\.timezone/);
  assert.doesNotMatch(memory, /new Date\(value\)\.toLocaleString/);
});
