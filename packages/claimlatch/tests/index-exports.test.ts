import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConfidenceCalibrationProfile,
  createClaimConfidence,
  createConfidenceCalibrationProfile,
  evaluateCalibration,
  hashCalibrationDataset,
  parseCalibrationJsonl,
  validateCalibrationDatasets,
  validateConfidenceCalibrationProfile,
} from "../src/index.js";
import type {
  CalibrationEvaluation,
  CalibrationObservation,
  ClaimConfidence,
  ConfidenceCalibrationProfile,
} from "../src/index.js";

const exportedTypes: [
  CalibrationEvaluation | undefined,
  CalibrationObservation | undefined,
  ClaimConfidence | undefined,
  ConfidenceCalibrationProfile | undefined,
] = [undefined, undefined, undefined, undefined];

test("package exports confidence and calibration helpers", () => {
  assert.equal(typeof applyConfidenceCalibrationProfile, "function");
  assert.equal(typeof createClaimConfidence, "function");
  assert.equal(typeof createConfidenceCalibrationProfile, "function");
  assert.equal(typeof evaluateCalibration, "function");
  assert.equal(typeof hashCalibrationDataset, "function");
  assert.equal(typeof parseCalibrationJsonl, "function");
  assert.equal(typeof validateCalibrationDatasets, "function");
  assert.equal(typeof validateConfidenceCalibrationProfile, "function");
  assert.equal(exportedTypes.length, 4);
});
