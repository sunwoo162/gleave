import assert from "node:assert/strict";
import test from "node:test";
import { calendarDateForTimeZone, formatWorldDate, formatWorldDateTime, formatWorldTime } from "../user-ui/src/domain/worldState.js";

test("world mission calendar dates follow the account timezone across a UTC date boundary", () => {
  const instant = "2026-09-28T00:30:00.000Z";
  assert.equal(calendarDateForTimeZone("America/Los_Angeles", instant), "2026-09-27");
  assert.equal(calendarDateForTimeZone("Asia/Seoul", instant), "2026-09-28");
});

test("world mission calendar dates remain local across a daylight-saving transition", () => {
  assert.equal(calendarDateForTimeZone("America/New_York", "2026-03-08T04:30:00.000Z"), "2026-03-07");
  assert.equal(calendarDateForTimeZone("America/New_York", "2026-03-09T03:30:00.000Z"), "2026-03-08");
});

test("world mission calendar dates reject invalid instants instead of creating a misleading identity", () => {
  assert.throws(() => calendarDateForTimeZone("Asia/Seoul", "not-a-timestamp"), /timestamp/i);
});

test("world activity labels use the account timezone at a UTC date boundary", () => {
  const instant = "2026-09-28T00:30:00.000Z";
  assert.equal(formatWorldDate("America/Los_Angeles", instant), "Sep 27, 2026");
  assert.equal(formatWorldDateTime("America/Los_Angeles", instant), "Sep 27, 2026, 5:30 PM");
  assert.equal(formatWorldDate("Asia/Seoul", instant), "Sep 28, 2026");
  assert.equal(formatWorldDateTime("Asia/Seoul", instant), "Sep 28, 2026, 9:30 AM");
});

test("world activity labels fall back safely for an invalid timestamp or timezone", () => {
  assert.equal(formatWorldDate("not/a-timezone", "2026-09-28T00:30:00.000Z"), "Sep 28, 2026");
  assert.equal(formatWorldDateTime("Asia/Seoul", "not-a-timestamp"), "날짜 확인 불가");
});

test("world chat time labels use the account timezone across a UTC date boundary", () => {
  const instant = "2026-09-28T00:30:00.000Z";
  assert.equal(formatWorldTime("America/Los_Angeles", instant), "5:30 PM");
  assert.equal(formatWorldTime("Asia/Seoul", instant), "9:30 AM");
});
