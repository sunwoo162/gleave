import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const uiRoot = join(process.cwd(), "user-ui", "src");

test("approved user UI keeps dense workspaces usable below the desktop breakpoint", async () => {
  const css = await readFile(join(uiRoot, "index.css"), "utf8");
  const navigation = await readFile(join(uiRoot, "components", "Navigation.tsx"), "utf8");
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /main > \.h-screen\.overflow-hidden/);
  assert.match(css, /main > \.min-h-screen > \.w-56/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 389px\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /@media \(min-width: 1440px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(navigation, /fixed bottom-0 left-0 right-0/);
  assert.match(navigation, /<nav aria-label="주요 메뉴"/);
  assert.match(navigation, /<Link to="\/teams"[^>]*aria-current/);
  assert.match(navigation, /mobileMenuItems = \[\{ path: '\/character'/);
  assert.match(navigation, /\{ path: '\/profile', label: '프로필'/);
});
