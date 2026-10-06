import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("release metadata uses one current package version across package and docs", async () => {
  const root = decodeURIComponent(new URL("../../", import.meta.url).pathname)
    .replace(/^\/(\w:)/u, "$1");
  const [packageJsonText, lockfileText, changelog, readme] = await Promise.all([
    readFile(join(root, "package.json"), "utf8"),
    readFile(join(root, "package-lock.json"), "utf8"),
    readFile(join(root, "CHANGELOG.md"), "utf8"),
    readFile(join(root, "README.md"), "utf8"),
  ]);

  const packageJson = JSON.parse(packageJsonText) as { version?: unknown };
  const lockfile = JSON.parse(lockfileText) as {
    version?: unknown;
    packages?: { "": { version?: unknown } };
  };
  assert.match(String(packageJson.version), /^\d+\.\d+\.\d+$/u);
  const version = String(packageJson.version);
  assert.equal(lockfile.version, version);
  assert.equal(lockfile.packages?.[""].version, version);

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  assert.match(changelog, new RegExp(`^## ${escapedVersion} - \\d{4}-\\d{2}-\\d{2}$`, "mu"));
  assert.match(readme, new RegExp(`^\\x60${escapedVersion}\\x60\\s`, "mu"));
});
