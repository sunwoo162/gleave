import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCalibrationCliArguments,
  renderCalibrationHelp,
} from "../src/calibration-cli-options.js";

test("calibration CLI help documents status-correctness semantics", () => {
  const help = renderCalibrationHelp();

  assert.match(help, /Usage:\s+claimlatch-calibrate/);
  assert.match(help, /--calibration <path>/);
  assert.match(help, /--evaluation <path>/);
  assert.match(help, /--output <path>/);
  assert.match(help, /--profile-id <id>/);
  assert.match(help, /--scorer-id <id>/);
  assert.match(help, /--created-at <ISO-8601>/);
  assert.match(help, /--validate/);
  assert.match(help, /--json.*compatibility/);
  assert.match(help, /always prints deterministic evaluation JSON/);
  assert.match(help, /not factual truth probability/);
});

test("calibration CLI parser preserves required arguments", () => {
  assert.deepEqual(parseCalibrationCliArguments([
    "--calibration", "calibration.jsonl",
    "--evaluation", "evaluation.jsonl",
    "--output", "profile.json",
    "--profile-id", "profile-v1",
    "--scorer-id", "scorer-v1",
    "--created-at", "2026-09-30T00:00:00.000Z",
    "--json",
  ]), {
    calibrationPath: "calibration.jsonl",
    evaluationPath: "evaluation.jsonl",
    outputPath: "profile.json",
    profileId: "profile-v1",
    scorerId: "scorer-v1",
    createdAt: "2026-09-30T00:00:00.000Z",
    validate: false,
    json: true,
  });
});

test("calibration CLI parser supports credential-free dataset validation", () => {
  assert.deepEqual(parseCalibrationCliArguments([
    "--validate",
    "--calibration", "calibration.jsonl",
    "--evaluation", "evaluation.jsonl",
  ]), {
    calibrationPath: "calibration.jsonl",
    evaluationPath: "evaluation.jsonl",
    validate: true,
    json: false,
  });

  assert.throws(
    () => parseCalibrationCliArguments([
      "--validate",
      "--calibration", "calibration.jsonl",
      "--evaluation", "evaluation.jsonl",
      "--output", "profile.json",
    ]),
    /--validate cannot be combined with --output/,
  );
});

test("calibration CLI parser rejects missing or unknown arguments", () => {
  assert.throws(
    () => parseCalibrationCliArguments(["--calibration", "calibration.jsonl"]),
    /--evaluation is required/,
  );
  assert.throws(
    () => parseCalibrationCliArguments([
      "--calibration", "calibration.jsonl",
      "--evaluation", "evaluation.jsonl",
      "--output", "profile.json",
      "--profile-id", "profile-v1",
      "--scorer-id", "scorer-v1",
      "--created-at", "2026-09-30T00:00:00.000Z",
      "--unexpected",
    ]),
    /Unknown calibration CLI option/,
  );
});

test("calibration CLI rejects duplicate value options", () => {
  assert.throws(
    () => parseCalibrationCliArguments([
      "--calibration", "first.jsonl",
      "--calibration", "second.jsonl",
      "--evaluation", "evaluation.jsonl",
      "--output", "profile.json",
      "--profile-id", "profile-v1",
      "--scorer-id", "scorer-v1",
      "--created-at", "2026-09-30T00:00:00.000Z",
    ]),
    /--calibration may only be specified once/,
  );
});

test("calibration CLI rejects non-ISO created-at values", () => {
  const createArguments = (createdAt: string): string[] => [
      "--calibration", "calibration.jsonl",
      "--evaluation", "evaluation.jsonl",
      "--output", "profile.json",
      "--profile-id", "profile-v1",
      "--scorer-id", "scorer-v1",
      "--created-at", createdAt,
    ];

  assert.throws(
    () => parseCalibrationCliArguments(createArguments("not-a-date")),
    /--created-at must be a valid ISO-8601 timestamp/,
  );
  assert.throws(
    () => parseCalibrationCliArguments(createArguments("2026-02-30T00:00:00.000Z")),
    /--created-at must be a valid ISO-8601 timestamp/,
  );
});
