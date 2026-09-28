import assert from "node:assert/strict";
import test from "node:test";
import { formatLocalDateTime, parseTimestamp, replaceIsoDatesWithLocalTime } from "./formatDateTime";

// SQLite's datetime('now') is UTC with no zone marker, so a host outside UTC
// is the only place a zone-less parse goes wrong. Pin one for every case.
process.env.TZ = "America/New_York";

const expectedFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

test("the pinned zone is not UTC", () => {
  assert.notEqual(new Date("2026-09-19T11:01:12").getTimezoneOffset(), 0);
});

test("parseTimestamp reads a SQLite datetime('now') value as UTC", () => {
  assert.equal(parseTimestamp("2026-09-19 11:01:12").toISOString(), "2026-09-19T11:01:12.000Z");
});

test("parseTimestamp reads a zone-less T-separated value with fractional seconds as UTC", () => {
  assert.equal(parseTimestamp("2026-09-19T11:01:12.345").toISOString(), "2026-09-19T11:01:12.345Z");
});

test("parseTimestamp leaves values that carry a zone alone", () => {
  assert.equal(parseTimestamp("2026-09-19T11:01:12.000Z").toISOString(), "2026-09-19T11:01:12.000Z");
  assert.equal(parseTimestamp("2026-09-19T13:01:12+02:00").toISOString(), "2026-09-19T11:01:12.000Z");
});

test("parseTimestamp accepts epoch milliseconds and Date instances", () => {
  const instant = Date.UTC(2026, 8, 19, 11, 1, 12);
  assert.equal(parseTimestamp(instant).getTime(), instant);
  assert.equal(parseTimestamp(new Date(instant)).getTime(), instant);
});

test("formatLocalDateTime renders a stored alert timestamp and its ISO form identically", () => {
  const expected = expectedFormat.format(new Date("2026-09-19T11:01:12Z"));
  assert.equal(formatLocalDateTime("2026-09-19 11:01:12"), expected);
  assert.equal(formatLocalDateTime("2026-09-19T11:01:12.000Z"), expected);
});

test("formatLocalDateTime keeps its placeholder and passthrough behaviour", () => {
  assert.equal(formatLocalDateTime(null), "--");
  assert.equal(formatLocalDateTime(undefined), "--");
  assert.equal(formatLocalDateTime(""), "--");
  assert.equal(formatLocalDateTime("not a date"), "not a date");
});

test("replaceIsoDatesWithLocalTime still rewrites only ISO strings", () => {
  const expected = expectedFormat.format(new Date("2026-09-19T11:01:12Z"));
  assert.equal(
    replaceIsoDatesWithLocalTime("Changed at 2026-09-19T11:01:12.000Z."),
    `Changed at ${expected}.`
  );
  assert.equal(replaceIsoDatesWithLocalTime("Stored 2026-09-19 11:01:12"), "Stored 2026-09-19 11:01:12");
});
