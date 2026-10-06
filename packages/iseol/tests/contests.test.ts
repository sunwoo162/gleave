import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContestCandidateUrl } from "../src/services/contests.js";

const sourceUrl = "https://www.all-con.co.kr";

test("contest candidate URLs preserve the configured source origin", () => {
  assert.equal(
    normalizeContestCandidateUrl("/view/contest/123", sourceUrl),
    "https://www.all-con.co.kr/view/contest/123",
  );
  assert.equal(
    normalizeContestCandidateUrl("https://www.all-con.co.kr/view/contest/123", sourceUrl),
    "https://www.all-con.co.kr/view/contest/123",
  );
});

test("contest candidate URLs reject cross-origin and downgraded authorities", () => {
  for (const value of [
    "https://attacker.example/view/contest/123",
    "https://www.all-con.co.kr.attacker.example/view/contest/123",
    "https://www.all-con.co.kr@attacker.example/view/contest/123",
    "https://www.all-con.co.kr:444/view/contest/123",
    "http://www.all-con.co.kr/view/contest/123",
    "//attacker.example/view/contest/123",
    "javascript:alert(1)",
  ]) {
    assert.equal(normalizeContestCandidateUrl(value, sourceUrl), null, value);
  }
});
