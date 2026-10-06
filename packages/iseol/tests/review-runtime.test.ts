import assert from "node:assert/strict";
import test from "node:test";
import { reviewRuntimeMessages } from "../src/services/review/review-runtime.js";

test("ci review runtime is enabled without an AI key", () => {
  const messages = reviewRuntimeMessages(false);
  assert.ok(messages.some((message) => message.includes("PR CI 코드리뷰")));
  assert.ok(messages.some((message) => message.includes("Google OAuth 미설정")));
  assert.equal(messages.some((message) => /GEMINI|OPENAI|GROQ|AI_API|AI key/i.test(message)), false);
});
