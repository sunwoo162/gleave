import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("landing footer links use real local information routes", async () => {
  const source = await readFile(resolve(process.cwd(), "user-ui/src/pages/Landing.tsx"), "utf8");

  assert.doesNotMatch(source, /href="#"/);
  assert.match(source, /to="\/terms"/);
  assert.match(source, /to="\/privacy"/);
  assert.match(source, /to="\/help"/);
});

test("information routes expose truthful product boundaries", async () => {
  const [routes, page] = await Promise.all([
    readFile(resolve(process.cwd(), "user-ui/src/app/routes.ts"), "utf8"),
    readFile(resolve(process.cwd(), "user-ui/src/pages/Information.tsx"), "utf8"),
  ]);

  assert.match(routes, /path: '\/terms'/);
  assert.match(routes, /path: '\/privacy'/);
  assert.match(routes, /path: '\/help'/);
  assert.match(page, /AI 방송실/);
  assert.match(page, /외부 연동/);
  assert.match(page, /Runtime/);
});
