import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL('../user-ui/src/components/Navigation.tsx', import.meta.url);
const browserRunnerPath = new URL('../scripts/iseol-user-ui-e2e.ts', import.meta.url);

test('mobile navigation exposes an accessible modal menu with keyboard dismissal and focus return', async () => {
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /aria-controls=["']mobile-navigation-menu["']/);
  assert.match(source, /role=["']dialog["']/);
  assert.match(source, /aria-modal=["']true["']/);
  assert.match(source, /aria-labelledby=["']mobile-navigation-title["']/);
  assert.match(source, /onKeyDown=/);
  assert.match(source, /event\.key === ['"]Escape['"]/);
  assert.match(source, /menuCloseButtonRef/);
  assert.match(source, /menuTriggerRef/);
  assert.match(source, /\.focus\(\)/);
});

test('browser regression exercises the mobile navigation keyboard flow and reports it explicitly', async () => {
  const browserRunner = await readFile(browserRunnerPath, 'utf8');
  const navigation = await readFile(sourcePath, 'utf8');

  assert.match(browserRunner, /verifyMobileNavigationAccessibilityUi/);
  assert.match(browserRunner, /mobile-navigation-accessibility/);
  assert.match(browserRunner, /mobileNavigationAccessibilityUi: "passed"/);
  assert.match(browserRunner, /verifyPersonalSpaceNavigationUi\(pageA, baseUrl\)/);
  assert.match(navigation, /ISEOL 전체 메뉴/);
});
