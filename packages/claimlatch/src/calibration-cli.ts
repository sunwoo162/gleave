#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  createConfidenceCalibrationProfile,
  hashCalibrationDataset,
  parseCalibrationJsonl,
  validateCalibrationDatasets,
} from "./calibration.js";
import {
  parseCalibrationCliArguments,
  renderCalibrationHelp,
} from "./calibration-cli-options.js";

export async function runCalibrationCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(renderCalibrationHelp());
    return;
  }

  const options = parseCalibrationCliArguments(argv);
  const calibrationContent = await readFile(options.calibrationPath, "utf8");
  const evaluationContent = await readFile(options.evaluationPath, "utf8");
  const calibration = parseCalibrationJsonl(calibrationContent);
  const evaluation = parseCalibrationJsonl(evaluationContent);
  const datasets = {
    calibration: {
      manifestSha256: hashCalibrationDataset(calibrationContent),
      observations: calibration,
    },
    evaluation: {
      manifestSha256: hashCalibrationDataset(evaluationContent),
      observations: evaluation,
    },
  };

  if (options.validate) {
    const validation = validateCalibrationDatasets(datasets);
    process.stdout.write(`${JSON.stringify({
      valid: true,
      calibration: {
        manifestSha256: validation.calibrationManifestSha256,
        observationCount: validation.calibrationObservationCount,
      },
      evaluation: {
        manifestSha256: validation.evaluationManifestSha256,
        observationCount: validation.evaluationObservationCount,
      },
    }, null, 2)}\n`);
    return;
  }

  const result = createConfidenceCalibrationProfile({
    id: options.profileId!,
    scorerId: options.scorerId!,
    calibration: datasets.calibration,
    evaluation: datasets.evaluation,
    createdAt: options.createdAt!,
  });

  await writeFile(options.outputPath!, `${JSON.stringify(result.profile, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result.evaluation, null, 2)}\n`);
}

runCalibrationCli().catch((error: unknown) => {
  process.stderr.write(`claimlatch-calibrate: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
