import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiSource = resolve(process.cwd(), "user-ui/src/api/userApi.ts");
const pageSource = resolve(process.cwd(), "user-ui/src/pages/Profile.tsx");
const routesSource = resolve(process.cwd(), "user-ui/src/app/routes.ts");
const settingsSource = resolve(process.cwd(), "user-ui/src/pages/Settings.tsx");
const navigationSource = resolve(process.cwd(), "user-ui/src/components/Navigation.tsx");
const browserJourneySource = resolve(process.cwd(), "scripts/iseol-user-ui-e2e.ts");

test("profile screen exposes durable own-profile editing and read-only public viewing", async () => {
  const [api, page, routes, settings, navigation, browserJourney] = await Promise.all([
    readFile(apiSource, "utf8"),
    readFile(pageSource, "utf8"),
    readFile(routesSource, "utf8"),
    readFile(settingsSource, "utf8"),
    readFile(navigationSource, "utf8"),
    readFile(browserJourneySource, "utf8"),
  ]);

  assert.match(api, /export async function getProfile\(userId\?: string\)/);
  assert.match(api, /export async function updateProfile\(/);
  assert.match(page, /getProfile/);
  assert.match(page, /updateProfile/);
  assert.match(page, /useSearchParams/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /readOnly/);
  assert.match(api, /publicGrowth/);
  assert.match(api, /publicProjects/);
  assert.match(api, /publicLearning/);
  assert.match(api, /publicPortfolio/);
  assert.match(page, /성장 정보/);
  assert.match(page, /공개 프로젝트/);
  assert.match(page, /학습 기록/);
  assert.match(page, /공개 포트폴리오/);
  assert.match(page, /\/portfolio\/public\//);
  assert.match(routes, /path: '\/profile', Component: Profile/);
  assert.match(settings, /to="\/profile"/);
  assert.match(navigation, /to="\/profile"/);
  assert.match(browserJourney, /verifyPublicProfilePrivacyUi/);
  assert.match(browserJourney, /publicProfilePrivacy: "passed"/);
  assert.match(browserJourney, /verifyPublicProfilePortfolioUi/);
  assert.match(browserJourney, /publicProfilePortfolio: "passed"/);
});
