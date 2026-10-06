import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const navigationSource = resolve(process.cwd(), "user-ui/src/components/Navigation.tsx");
const iconSource = resolve(process.cwd(), "user-ui/src/components/Icon.tsx");

test("navigation uses a shared semantic icon set instead of emoji menu icons", async () => {
  const [navigation, icon] = await Promise.all([
    readFile(navigationSource, "utf8"),
    readFile(iconSource, "utf8"),
  ]);

  assert.match(icon, /export type IconName/);
  assert.match(icon, /aria-hidden="true"/);
  assert.match(navigation, /import \{ Icon, type IconName \} from '\.\/Icon'/);
  assert.match(navigation, /icon: 'home'/);
  assert.match(navigation, /<Icon name=\{item\.icon\}/);
  assert.match(navigation, /<Icon name="bell"/);
  assert.match(navigation, /<Icon name="plug"/);
  assert.doesNotMatch(navigation, /icon: '[🏠💡⚡✨🧠📚👥🌐💬📊🎨⚙️🧑‍💻👤]'/);
});
