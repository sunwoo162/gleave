import assert from "node:assert/strict";
import test from "node:test";
import { formatAdministratorResetFailure, formatUserFacingError } from "../src/security/user-error.js";

test("formatUserFacingError redacts credentials and keeps user-facing text on one line", () => {
  const result = formatUserFacingError(new Error("token=super-secret\nnext line"));

  assert.equal(result, "token=[redacted] next line");
  assert.doesNotMatch(result, /super-secret/);
  assert.doesNotMatch(result, /[\r\n]/);
});

test("formatUserFacingError uses and sanitizes the fallback for non-errors", () => {
  assert.equal(formatUserFacingError({ token: "ignored" }, "fallback token=secret"), "fallback token=[redacted]");
});

test("administrator reset failure text redacts the DM detail", () => {
  const result = formatAdministratorResetFailure(new Error("authorization=reset-secret\nprovider failed"));

  assert.equal(result, "❌ 서버 초기화에 실패했습니다.\n`authorization=[redacted] provider failed`");
  assert.doesNotMatch(result, /reset-secret/);
});
