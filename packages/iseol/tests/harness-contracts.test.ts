import assert from "node:assert/strict";
import test from "node:test";
import {
  ISEOL_HARNESS_CONTRACT_VERSION,
  assertHarnessContractVersion,
} from "../src/harness/contracts.js";

test("harness contract version is strict", () => {
  assert.equal(ISEOL_HARNESS_CONTRACT_VERSION, 1);
  assert.doesNotThrow(() => assertHarnessContractVersion(1));
  assert.throws(
    () => assertHarnessContractVersion(2),
    /Unsupported Iseol Harness contract version/,
  );
});
