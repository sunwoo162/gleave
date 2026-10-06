import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("authenticated user shell redirects unauthenticated sessions to local login", async () => {
  const [source, runner] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "components", "Navigation.tsx"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);

  assert.match(source, /useNavigate/);
  assert.match(source, /profile\.status === 'unauthenticated'/);
  assert.match(source, /navigate\('\/login'/);
  assert.match(source, /로그인이 필요합니다/);
  assert.match(runner, /verifyLogoutAndRelogin/);
  assert.match(runner, /logoutServerRevocationAndRelogin: "passed"/);
});

test("Settings logout revokes the server session before navigating to login", async () => {
  const [settings, api, store] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Settings.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "store", "userStore.ts"), "utf8"),
  ]);
  assert.match(api, /export async function logOut\(\)/);
  assert.match(api, /\/api\/user\/logout/);
  assert.match(store, /await logOut\(\)/);
  assert.match(settings, /signOut\(\)\.finally\(\(\) => navigate\('\/login'\)\)/);
});

test("Settings password change uses the authenticated route and returns the user to login", async () => {
  const [settings, api, runner] = await Promise.all([
    readFile(join(process.cwd(), "user-ui", "src", "pages", "Settings.tsx"), "utf8"),
    readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8"),
    readFile(join(process.cwd(), "scripts", "iseol-user-ui-e2e.ts"), "utf8"),
  ]);
  assert.match(api, /export async function changePassword/);
  assert.match(api, /\/api\/user\/password/);
  assert.match(settings, /await changePassword\(/);
  assert.match(settings, /await signOut\(\)/);
  assert.match(settings, /navigate\('\/login', \{ replace: true \}\)/);
  assert.match(runner, /verifyPasswordChangeUi/);
  assert.match(runner, /passwordChangeUi: "passed"/);
});

test("a stale authenticated 401 cannot clear a newer browser session", async () => {
  const api = await readFile(join(process.cwd(), "user-ui", "src", "api", "userApi.ts"), "utf8");
  assert.match(api, /function clearSessionIfCurrent\(token: string\)/);
  assert.match(api, /clearSessionIfCurrent\(token\)/);
  assert.match(api, /sessionToken\(\) === token/);
});

test("relogin clears the unauthenticated store state before the protected shell mounts", async () => {
  const auth = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Auth.tsx"), "utf8");
  assert.match(auth, /import \{ setProfile \} from '\.\.\/store\/userStore'/);
  assert.match(auth, /setProfile\(\{ status: 'loading'/);
});

test("login form enforces the same eight-character password minimum as the server", async () => {
  const auth = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Auth.tsx"), "utf8");
  assert.match(auth, /else if \(password\.length < 8\)/);
  assert.match(auth, /비밀번호는 8자 이상이어야 합니다/);
  assert.match(auth, /id="login-pw"[\s\S]*minLength=\{8\}/);
});

test("signup surfaces server-side validation instead of reporting only a runtime outage", async () => {
  const auth = await readFile(join(process.cwd(), "user-ui", "src", "pages", "Auth.tsx"), "utf8");
  assert.match(auth, /error\.status === 400/);
  assert.match(auth, /비밀번호는 8자 이상이어야 합니다/);
});
