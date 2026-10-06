import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const uiSourcePath = join(process.cwd(), "user-ui", "src", "components", "UI.tsx");
const iconSourcePath = join(process.cwd(), "user-ui", "src", "components", "Icon.tsx");
const worldStateSourcePath = join(process.cwd(), "user-ui", "src", "domain", "worldState.ts");

test("shared data-state components use semantic icons instead of unicode symbols", async () => {
  const [ui, icon, worldState] = await Promise.all([
    readFile(uiSourcePath, "utf8"),
    readFile(iconSourcePath, "utf8"),
    readFile(worldStateSourcePath, "utf8"),
  ]);

  for (const name of ["rotate", "check", "alertTriangle", "clock", "help", "lock"] as const) {
    assert.match(icon, new RegExp(`['"]${name}['"]`), `IconName is missing ${name}`);
  }
  assert.match(ui, /import \{ Icon(?:, type IconName)? \} from ['"]\.\/Icon['"];/);
  assert.match(ui, /StatusBadge/);
  assert.match(ui, /<Icon name=\{s\.icon\}/);
  assert.match(ui, /MissionItem/);
  assert.match(ui, /StatCard/);
  assert.match(ui, /icon: IconName/);
  assert.match(ui, /<Icon name=\{icon\}/);
  assert.doesNotMatch(ui, /[⟳✓✕🔒👥✨]/);
  assert.match(worldState, /icon: ['"]bolt['"]/);
  assert.match(worldState, /icon: ['"]book['"]/);
  assert.match(worldState, /icon: ['"]rotate['"]/);
});
