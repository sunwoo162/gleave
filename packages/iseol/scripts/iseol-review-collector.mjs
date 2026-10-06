#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const severityMap = (value) => {
  const normalized = String(value ?? "").toLowerCase();
  if (["critical", "error", "high"].includes(normalized)) return normalized === "critical" ? "critical" : "major";
  return "minor";
};

const rel = (filePath, cwd = process.cwd()) => {
  if (!filePath) return "unknown";
  const normalized = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return normalized.replaceAll("\\", "/").replace(/^\.\//, "") || path.basename(filePath);
};

const finding = (tool, filePath, line, severity, category, confidence, explanation, ruleId, suggestion) => ({
  tool,
  filePath: rel(filePath),
  line: Math.max(1, Number(line) || 1),
  severity,
  category,
  confidence,
  explanation: String(explanation || "문제를 확인해주세요.").slice(0, 1200),
  ...(ruleId ? { ruleId: String(ruleId).slice(0, 300) } : {}),
  ...(suggestion ? { suggestion: String(suggestion).slice(0, 2000) } : {}),
});

export function parseEslintJson(text, cwd = process.cwd()) {
  try {
    const reports = JSON.parse(text || "[]");
    return reports.flatMap((report) => (report.messages ?? [])
      .filter((message) => message.line)
      .map((message) => finding(
        "eslint", rel(report.filePath, cwd), message.line,
        message.severity >= 2 ? "major" : "minor",
        /security|unsafe|xss|injection/i.test(message.ruleId ?? "") ? "security" : "correctness",
        message.severity >= 2 ? 0.9 : 0.82,
        message.message, message.ruleId,
      )));
  } catch { return []; }
}

export function parseTscText(text) {
  const results = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const match = /^(.+?)\((\d+),(\d+)\):\s+(?:error|warning)\s+(TS\d+):\s+(.+)$/.exec(raw.trim());
    if (!match) continue;
    results.push(finding("typescript", match[1], Number(match[2]), "major", "correctness", 0.94, match[5], match[4]));
  }
  return results;
}

export function parseNpmAuditJson(text) {
  try {
    const data = JSON.parse(text || "{}");
    return Object.entries(data.vulnerabilities ?? {}).map(([name, vulnerability]) => {
      const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
      const detail = via.find((item) => item && typeof item === "object")?.title ?? `취약한 의존성 ${name}`;
      const severity = String(vulnerability.severity ?? "moderate").toLowerCase();
      return finding("npm-audit", "package.json", 1, severity === "critical" ? "critical" : severity === "high" ? "major" : "minor", "security", 0.93, `${name}: ${detail}`, `npm-audit:${name}`);
    });
  } catch { return []; }
}

export function parseKnipText(text) {
  const results = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const match = /^(.+?):(\d+)(?::\d+)?\s+(.+)$/.exec(raw.trim());
    if (!match) continue;
    results.push(finding("knip", match[1], Number(match[2]), "minor", "maintainability", 0.84, match[3], "knip"));
  }
  return results;
}

export function parseDependencyCruiserJson(text) {
  try {
    const data = JSON.parse(text || "{}");
    return (data.output ?? data.violations ?? []).filter((item) => item?.from).map((item) => finding(
      "dependency-cruiser", item.from, item.fromLine ?? 1,
      /circular|forbidden|error/i.test(item.rule?.name ?? item.rule?.severity ?? "") ? "major" : "minor",
      "maintainability", 0.88,
      item.cycle?.length ? `순환 의존성: ${item.cycle.join(" -> ")}` : `${item.from} -> ${item.to ?? "?"} 의존성 규칙 위반`,
      item.rule?.name ?? "dependency-rule",
    ));
  } catch { return []; }
}

export function parseSemgrepJson(text) {
  try {
    const data = JSON.parse(text || "{}");
    return (data.results ?? []).map((item) => finding(
      "semgrep", item.path, item.start?.line ?? 1,
      severityMap(item.extra?.severity),
      /security|owasp|cwe/i.test(`${item.extra?.metadata?.category ?? ""} ${item.check_id ?? ""}`) ? "security" : "correctness",
      item.extra?.severity === "ERROR" ? 0.94 : 0.86,
      item.extra?.message ?? item.check_id, item.check_id,
    ));
  } catch { return []; }
}

export function parseGitleaksJson(text) {
  try {
    const data = JSON.parse(text || "[]");
    return (Array.isArray(data) ? data : []).map((item) => finding(
      "gitleaks", item.File ?? item.file, item.StartLine ?? item.startLine ?? 1,
      "critical", "security", 0.99,
      item.Description ?? item.description ?? "민감정보가 소스에 포함된 것으로 보입니다.", item.RuleID ?? item.ruleId ?? "secret",
    ));
  } catch { return []; }
}

export function parseTrivyJson(text) {
  try {
    const data = JSON.parse(text || "{}");
    const results = [];
    for (const result of data.Results ?? []) {
      for (const item of result.Misconfigurations ?? []) {
        results.push(finding("trivy", result.Target ?? "unknown", item.CauseMetadata?.StartLine ?? 1, severityMap(item.Severity), "security", 0.93, item.Message ?? item.Title ?? item.ID, item.ID));
      }
      for (const item of result.Secrets ?? []) {
        results.push(finding("trivy", result.Target ?? "unknown", item.StartLine ?? 1, "critical", "security", 0.98, item.Title ?? "Secret detected", item.RuleID ?? "trivy-secret"));
      }
      for (const item of result.Vulnerabilities ?? []) {
        results.push(finding("trivy", result.Target ?? "package-lock.json", 1, severityMap(item.Severity), "security", 0.9, `${item.PkgName ?? "dependency"}: ${item.Title ?? item.VulnerabilityID}`, item.VulnerabilityID));
      }
    }
    return results;
  } catch { return []; }
}

export function parseOsvJson(text) {
  try {
    const data = JSON.parse(text || "{}");
    const findings = [];
    for (const result of data.results ?? data.Results ?? []) {
      const filePath = result.source?.path ?? result.Source?.Path ?? "package-lock.json";
      for (const pkg of result.packages ?? []) {
        for (const vulnerability of pkg.vulnerabilities ?? []) {
          findings.push(finding("osv-scanner", filePath, 1, "major", "security", 0.94, `${pkg.package?.name ?? "dependency"}: ${vulnerability.summary ?? vulnerability.id}`, vulnerability.id));
        }
      }
    }
    return findings;
  } catch { return []; }
}

export function parseActionlintText(text) {
  const results = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const match = /^(.+?):(\d+):(\d+):\s+(.+?)(?:\s+\[([^\]]+)\])?$/.exec(raw.trim());
    if (!match) continue;
    results.push(finding("actionlint", match[1], Number(match[2]), "major", "correctness", 0.9, match[4], match[5] ?? "actionlint"));
  }
  return results;
}

function commandExists(command) {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024, ...options });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function check(name, result, findings = []) {
  return {
    check: { name, status: result === null ? "skipped" : result.status === 0 ? "passed" : "failed", ...(result && result.status !== 0 ? { detail: `${result.stderr || result.stdout}`.trim().slice(0, 1000) } : {}) },
    findings,
  };
}

function runOptional(name, command, args, parser) {
  if (!commandExists(command)) return check(name, null, []);
  const result = run(command, args);
  return check(name, result, parser(`${result.stdout}\n${result.stderr}`));
}

function loadPackage() {
  if (!existsSync("package.json")) return null;
  try { return JSON.parse(readFileSync("package.json", "utf8")); } catch { return null; }
}

function localBin(name) {
  const candidate = path.join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
  return existsSync(candidate) ? candidate : null;
}

export function collectReview() {
  const checks = [];
  const findings = [];
  const add = (value) => { checks.push(value.check); findings.push(...value.findings); };
  const pkg = loadPackage();

  if (pkg) {
    if (existsSync("package-lock.json")) add(check("install", run("npm", ["ci"]), []));
    else add(check("install", null, []));

    for (const script of ["lint", "typecheck", "test", "build"]) {
      if (pkg.scripts?.[script]) add(check(script, run("npm", ["run", script]), []));
      else add(check(script, null, []));
    }

    const eslint = localBin("eslint");
    if (eslint) {
      const result = run(eslint, [".", "-f", "json"]);
      add(check("eslint", result, parseEslintJson(result.stdout)));
    } else add(check("eslint", null, []));

    const tsc = localBin("tsc");
    if (tsc && existsSync("tsconfig.json")) {
      const result = run(tsc, ["--noEmit", "--pretty", "false"]);
      add(check("typescript", result, parseTscText(`${result.stdout}\n${result.stderr}`)));
    } else add(check("typescript", null, []));

    if (existsSync("package-lock.json")) {
      const result = run("npm", ["audit", "--json"]);
      add(check("npm-audit", result, parseNpmAuditJson(result.stdout)));
    }

    const knip = localBin("knip");
    if (knip) {
      const result = run(knip, ["--no-progress"]);
      add(check("knip", result, parseKnipText(`${result.stdout}\n${result.stderr}`)));
    } else add(check("knip", null, []));

    const depcruise = localBin("depcruise") ?? localBin("dependency-cruise");
    if (depcruise && existsSync("src")) {
      const result = run(depcruise, ["src", "--output-type", "json"]);
      add(check("dependency-cruiser", result, parseDependencyCruiserJson(result.stdout)));
    } else add(check("dependency-cruiser", null, []));
  }

  add(runOptional("semgrep", "semgrep", ["scan", "--config", "auto", "--json", "."], parseSemgrepJson));

  if (commandExists("gitleaks")) {
    const report = path.join(process.cwd(), ".iseol-gitleaks.json");
    const result = run("gitleaks", ["detect", "--source", ".", "--report-format", "json", "--report-path", report, "--no-banner", "--exit-code", "0"]);
    const text = existsSync(report) ? readFileSync(report, "utf8") : "[]";
    add(check("gitleaks", result, parseGitleaksJson(text)));
  } else add(check("gitleaks", null, []));

  add(runOptional("trivy", "trivy", ["fs", "--format", "json", "--scanners", "vuln,secret,misconfig", "."], parseTrivyJson));
  add(runOptional("osv-scanner", "osv-scanner", ["scan", "source", "--format", "json", "."], parseOsvJson));
  add(runOptional("actionlint", "actionlint", [], parseActionlintText));

  const artifact = {
    schemaVersion: 1,
    repository: process.env.GITHUB_REPOSITORY || "unknown/unknown",
    pullNumber: Math.max(1, Number(process.env.ISEOL_PR_NUMBER) || 1),
    headSha: process.env.ISEOL_HEAD_SHA || process.env.GITHUB_SHA || "unknown",
    generatedAt: new Date().toISOString(),
    checks,
    findings,
  };
  mkdirSync(path.join(".iseol", "review"), { recursive: true });
  writeFileSync(path.join(".iseol", "review", "iseol-review.json"), JSON.stringify(artifact, null, 2), "utf8");
  return artifact;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  const artifact = collectReview();
  const failed = artifact.checks.filter((item) => item.status === "failed").length;
  console.log(`Iseol review artifact: ${artifact.findings.length} findings, ${failed} failed checks`);
}
