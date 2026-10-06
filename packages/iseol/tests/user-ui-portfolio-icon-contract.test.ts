import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("active portfolio surfaces use semantic icons for verification markers", async () => {
  const [portfolio, publicPortfolio] = await Promise.all([
    readFile(resolve(process.cwd(), "user-ui/src/pages/PortfolioScreen.tsx"), "utf8"),
    readFile(resolve(process.cwd(), "user-ui/src/pages/PublicPortfolio.tsx"), "utf8"),
  ]);

  assert.match(portfolio, /import \{ Icon \} from '..\/components\/Icon';/);
  assert.match(portfolio, /<Icon name="check"/);
  assert.doesNotMatch(portfolio, /✓ 검증됨/);
  assert.doesNotMatch(portfolio, /<li key=\{id\}>✓/);

  assert.match(publicPortfolio, /import \{ Icon \} from '..\/components\/Icon';/);
  assert.match(publicPortfolio, /<Icon name="check"/);
  assert.doesNotMatch(publicPortfolio, /<li key=\{item\.id\}>✓/);
});
