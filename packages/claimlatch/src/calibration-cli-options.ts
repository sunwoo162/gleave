import { isIso8601Timestamp } from "./iso8601.js";

export interface CalibrationCliArguments {
  calibrationPath: string;
  evaluationPath: string;
  outputPath?: string;
  profileId?: string;
  scorerId?: string;
  createdAt?: string;
  validate: boolean;
  json: boolean;
}

const VALUE_OPTIONS = new Set([
  "--calibration",
  "--evaluation",
  "--output",
  "--profile-id",
  "--scorer-id",
  "--created-at",
]);

export function parseCalibrationCliArguments(argv: readonly string[]): CalibrationCliArguments {
  const values = new Map<string, string>();
  const validate = argv.includes("--validate");
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--json") {
      json = true;
      continue;
    }
    if (option === "--validate") continue;
    if (!VALUE_OPTIONS.has(option ?? "")) {
      throw new Error(`Unknown calibration CLI option: ${option ?? ""}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) throw new Error(`${option} requires a value.`);
    if (values.has(option!)) throw new Error(`${option} may only be specified once.`);
    values.set(option!, value);
    index += 1;
  }

  if (validate) {
    for (const option of ["--output", "--profile-id", "--scorer-id", "--created-at"]) {
      if (values.has(option)) throw new Error(`--validate cannot be combined with ${option}.`);
    }
    const calibrationPath = values.get("--calibration");
    const evaluationPath = values.get("--evaluation");
    if (!calibrationPath) throw new Error("--calibration is required.");
    if (!evaluationPath) throw new Error("--evaluation is required.");
    return { calibrationPath, evaluationPath, validate, json };
  }

  for (const option of VALUE_OPTIONS) {
    if (!values.has(option)) throw new Error(`${option} is required.`);
  }

  const createdAt = values.get("--created-at")!;
  if (!isIso8601Timestamp(createdAt)) {
    throw new Error("--created-at must be a valid ISO-8601 timestamp.");
  }

  return {
    calibrationPath: values.get("--calibration")!,
    evaluationPath: values.get("--evaluation")!,
    outputPath: values.get("--output")!,
    profileId: values.get("--profile-id")!,
    scorerId: values.get("--scorer-id")!,
    createdAt,
    validate,
    json,
  };
}

export function renderCalibrationHelp(): string {
  return [
    "ClaimLatch confidence calibration",
    "",
    "Usage:",
    "  claimlatch-calibrate [options]",
    "",
    "Options:",
    "  --calibration <path>            Claim-level calibration JSONL dataset",
    "  --evaluation <path>             Independent evaluation JSONL dataset",
    "  --output <path>                 Write the validated profile JSON",
    "  --profile-id <id>               Calibration profile identifier",
    "  --scorer-id <id>                Raw score provider identifier",
    "  --created-at <ISO-8601>         Reproducible profile creation timestamp",
    "  --validate                      Validate both datasets without fitting or writing a profile",
    "  --json                          Accepted for compatibility; output is always JSON",
    "  -h, --help                      Show this help",
    "",
    "Output: the CLI always prints deterministic evaluation JSON to stdout.",
    "Confidence is verification-status-correctness probability, not factual truth probability.",
    "Calibration is offline-only and requires independent labelled evaluation data.",
    "",
  ].join("\n");
}
