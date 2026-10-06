import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { hashCalibrationDataset } from "../src/calibration.js";

const cliPath = new URL("../src/calibration-cli.js", import.meta.url);
const cliFilePath = decodeURIComponent(cliPath.pathname).replace(/^\/([A-Za-z]:)/u, "$1");

function observation(
  id: string,
  sourceCaseId: string,
  sourceClaimId: string,
): string {
  return JSON.stringify({
    id,
    predictedStatus: "SUPPORTED",
    expectedStatus: "SUPPORTED",
    rawScore: 0.75,
    sourceCaseId,
    sourceClaimId,
    labelSourceUrls: ["https://example.test/label"],
  });
}

function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.argv[0] ?? "node", [cliFilePath, ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const append = (chunk: Uint8Array | string): string => typeof chunk === "string"
      ? chunk
      : new TextDecoder().decode(chunk);
    child.stdout.on("data", (chunk) => { stdout += append(chunk); });
    child.stderr.on("data", (chunk) => { stderr += append(chunk); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? -1, stdout, stderr }));
  });
}

test("calibration CLI writes a profile and deterministic evaluation JSON without provider credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-calibration-"));
  try {
    const calibrationPath = join(directory, "calibration.jsonl");
    const evaluationPath = join(directory, "evaluation.jsonl");
    const outputPath = join(directory, "profile.json");
    await writeFile(calibrationPath, `${observation("calibration-1", "case-cal", "claim-cal")}\n`, "utf8");
    await writeFile(evaluationPath, `${observation("evaluation-1", "case-eval", "claim-eval")}\n`, "utf8");

    const result = await runCli([
      "--calibration", calibrationPath,
      "--evaluation", evaluationPath,
      "--output", outputPath,
      "--profile-id", "fixture-profile-v1",
      "--scorer-id", "fixture-scorer-v1",
      "--created-at", "2026-09-30T00:00:00.000Z",
      "--json",
    ]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const summary = JSON.parse(result.stdout) as { observationCount?: number; brierScore?: number };
    assert.equal(summary.observationCount, 1);
    assert.equal(summary.brierScore, 0);
    const generated = JSON.parse(await readFile(outputPath, "utf8")) as {
      id?: string;
      target?: string;
      validation?: { observationCount?: number };
    };
    assert.equal(generated.id, "fixture-profile-v1");
    assert.equal(generated.target, "verification-status-correctness");
    assert.equal(generated.validation?.observationCount, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("calibration CLI validates datasets without profile metadata or output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-calibration-validate-"));
  try {
    const calibrationPath = join(directory, "calibration.jsonl");
    const evaluationPath = join(directory, "evaluation.jsonl");
    const calibrationContent = `${observation("calibration-1", "case-cal", "claim-cal")}\n`;
    const evaluationContent = `${observation("evaluation-1", "case-eval", "claim-eval")}\n`;
    await writeFile(calibrationPath, calibrationContent, "utf8");
    await writeFile(evaluationPath, evaluationContent, "utf8");

    const result = await runCli([
      "--validate",
      "--calibration", calibrationPath,
      "--evaluation", evaluationPath,
      "--json",
    ]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      valid: true,
      calibration: {
        observationCount: 1,
        manifestSha256: hashCalibrationDataset(calibrationContent),
      },
      evaluation: {
        observationCount: 1,
        manifestSha256: hashCalibrationDataset(evaluationContent),
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("calibration CLI validation fails closed for overlapping source case and claim pairs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-calibration-validate-overlap-"));
  try {
    const calibrationPath = join(directory, "calibration.jsonl");
    const evaluationPath = join(directory, "evaluation.jsonl");
    const sharedPair = observation("calibration-1", "shared-case", "shared-claim");
    await writeFile(calibrationPath, `${sharedPair}\n`, "utf8");
    await writeFile(evaluationPath, `${observation("evaluation-1", "shared-case", "shared-claim")}\n`, "utf8");

    const result = await runCli([
      "--validate",
      "--calibration", calibrationPath,
      "--evaluation", evaluationPath,
    ]);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /source case\/claim pair/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("calibration CLI validation fails closed for empty datasets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-calibration-validate-empty-"));
  try {
    const calibrationPath = join(directory, "calibration.jsonl");
    const evaluationPath = join(directory, "evaluation.jsonl");
    await writeFile(calibrationPath, "\n# intentionally empty\n", "utf8");
    await writeFile(evaluationPath, `${observation("evaluation-1", "case-eval", "claim-eval")}\n`, "utf8");

    const result = await runCli([
      "--validate",
      "--calibration", calibrationPath,
      "--evaluation", evaluationPath,
    ]);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /contains no observations/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("calibration CLI does not write a profile when datasets overlap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimlatch-calibration-error-"));
  try {
    const calibrationPath = join(directory, "calibration.jsonl");
    const evaluationPath = join(directory, "evaluation.jsonl");
    const outputPath = join(directory, "profile.json");
    const sharedPair = observation("calibration-1", "shared-case", "shared-claim");
    await writeFile(calibrationPath, `${sharedPair}\n`, "utf8");
    await writeFile(evaluationPath, `${observation("evaluation-1", "shared-case", "shared-claim")}\n`, "utf8");

    const result = await runCli([
      "--calibration", calibrationPath,
      "--evaluation", evaluationPath,
      "--output", outputPath,
      "--profile-id", "fixture-profile-v1",
      "--scorer-id", "fixture-scorer-v1",
      "--created-at", "2026-09-30T00:00:00.000Z",
    ]);

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /^claimlatch-calibrate:/u);
    await assert.rejects(readFile(outputPath, "utf8"), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
