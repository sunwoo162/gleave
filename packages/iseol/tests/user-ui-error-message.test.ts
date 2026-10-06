import assert from "node:assert/strict";
import test from "node:test";
import { UserApiError } from "../user-ui/src/api/userApi.js";
import { userFacingError } from "../user-ui/src/errorMessage.js";

test("user UI exposes server-safe API errors", () => {
  const result = userFacingError(new UserApiError("token=[redacted]", 400), "fallback");
  assert.match(result, /token=\[redacted\]/);
  assert.doesNotMatch(result, /secret/);
});

test("user UI does not expose generic exception text", () => {
  assert.equal(userFacingError(new Error("token=browser-secret"), "요청을 처리하지 못했습니다."), "요청을 처리하지 못했습니다.");
  assert.equal(userFacingError({ message: "token=object-secret" }, "fallback"), "fallback");
});
