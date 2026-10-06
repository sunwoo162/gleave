import assert from "node:assert/strict";
import test from "node:test";
import {
  parseActionlintText,
  parseDependencyCruiserJson,
  parseEslintJson,
  parseGitleaksJson,
  parseKnipText,
  parseNpmAuditJson,
  parseOsvJson,
  parseSemgrepJson,
  parseTrivyJson,
  parseTscText,
} from "../scripts/iseol-review-collector.mjs";

test("collector parses eslint and typescript diagnostics", () => {
  const eslint = parseEslintJson(JSON.stringify([{ filePath: "/work/src/a.ts", messages: [{ line: 3, severity: 2, ruleId: "no-undef", message: "x is not defined" }] }]), "/work");
  assert.equal(eslint[0]?.filePath, "src/a.ts");
  assert.equal(eslint[0]?.line, 3);
  const tsc = parseTscText("src/a.ts(4,2): error TS2322: Type 'string' is not assignable to type 'number'.");
  assert.equal(tsc[0]?.ruleId, "TS2322");
  assert.equal(tsc[0]?.line, 4);
});

test("collector parses npm audit, knip and dependency-cruiser output", () => {
  const audit = parseNpmAuditJson(JSON.stringify({ vulnerabilities: { lodash: { severity: "high", via: [{ title: "Prototype Pollution" }] } } }));
  assert.equal(audit[0]?.category, "security");
  const knip = parseKnipText("src/dead.ts:7:1  unused export: legacy");
  assert.equal(knip[0]?.line, 7);
  const dep = parseDependencyCruiserJson(JSON.stringify({ output: [{ from: "src/a.ts", to: "src/b.ts", rule: { name: "no-circular" }, cycle: ["src/a.ts", "src/b.ts"] }] }));
  assert.equal(dep[0]?.ruleId, "no-circular");
});

test("collector parses semgrep and gitleaks output with source lines", () => {
  const semgrep = parseSemgrepJson(JSON.stringify({ results: [{ check_id: "js.eval", path: "src/a.ts", start: { line: 9 }, extra: { message: "Avoid eval", severity: "ERROR", metadata: { category: "security" } } }] }));
  assert.equal(semgrep[0]?.line, 9);
  assert.equal(semgrep[0]?.category, "security");
  const leaks = parseGitleaksJson(JSON.stringify([{ File: "src/key.ts", StartLine: 12, Description: "Generic API Key", RuleID: "generic-api-key" }]));
  assert.equal(leaks[0]?.severity, "critical");
  assert.equal(leaks[0]?.line, 12);
});

test("collector parses trivy, osv and actionlint output", () => {
  const trivy = parseTrivyJson(JSON.stringify({ Results: [{ Target: "Dockerfile", Misconfigurations: [{ ID: "DS001", Title: "Run as non-root", Severity: "HIGH", CauseMetadata: { StartLine: 5 } }] }] }));
  assert.equal(trivy[0]?.line, 5);
  const osv = parseOsvJson(JSON.stringify({ results: [{ source: { path: "package-lock.json" }, packages: [{ package: { name: "foo" }, vulnerabilities: [{ id: "GHSA-test", summary: "bad dependency" }] }] }] }));
  assert.equal(osv[0]?.filePath, "package-lock.json");
  const actionlint = parseActionlintText(".github/workflows/ci.yml:6:3: shellcheck reported issue [shellcheck]");
  assert.equal(actionlint[0]?.ruleId, "shellcheck");
  assert.equal(actionlint[0]?.line, 6);
});
