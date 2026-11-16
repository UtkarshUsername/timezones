import assert from "node:assert/strict";
import test from "node:test";
import { changeDate, initialState, removeZone, restoreState, wallRange } from "../client/planner/model.ts";

const fallback = initialState(Date.parse("2026-11-14T12:00Z"), "Asia/Calcutta");
const legacy = { zones: ["America/New_York"], sourceZone: "America/New_York", date: "2026-03-08", start: "02:00", end: "03:00" };

test("initial planner includes its source and canonicalizes the detected alias", () => {
  assert.equal(fallback.sourceZone, "Asia/Kolkata");
  assert.equal(fallback.zones[0], "Asia/Kolkata");
  assert.equal(fallback.zones.length, 4);
  assert.equal(new Date(fallback.range.start).toISOString(), "2026-11-14T03:30:00.000Z");
});

test("migrate wall-clock and exact timestamp saves without losing ranges", () => {
  const migrated = restoreState(legacy, fallback);
  assert.equal(migrated.range.end - migrated.range.start, 3_600_000);
  assert.equal(new Date(migrated.range.start).toISOString(), "2026-03-08T07:00:00.000Z");
  const range = { start: Date.parse("2026-11-01T06:30Z"), end: Date.parse("2026-11-02T08:00Z") };
  assert.deepEqual(restoreState({ ...legacy, startTs: range.start, endTs: range.end }, fallback).range, range);
  assert.deepEqual(restoreState({ ...migrated, range }, fallback).range, range);
  const noEnd = restoreState({ ...legacy, date: "2026-11-14", start: "09:00", end: undefined }, fallback);
  assert.equal(noEnd.range.end - noEnd.range.start, 24 * 3_600_000);
});

test("normalize saved zones once and reject invalid persisted input", () => {
  const normalized = restoreState({ ...legacy, zones: ["Asia/Calcutta", "Asia/Kolkata"] }, fallback);
  assert.deepEqual(normalized.zones, ["America/New_York", "Asia/Kolkata"]);
  for (const value of [null, {}, { ...legacy, zones: [] }, { ...legacy, zones: ["invalid"] }, { ...legacy, date: "2026-02-30" }, { ...legacy, start: "24:30" }]) {
    assert.deepEqual(restoreState(value, fallback), fallback);
  }
});

test("overnight and date changes keep wall times while zone removal keeps exact instants", () => {
  const range = wallRange("2026-11-14", "23:30", "01:15", "Etc/UTC");
  assert.equal(new Date(range.end).toISOString(), "2026-11-15T01:15:00.000Z");
  const state = { zones: ["Etc/UTC", "Asia/Kolkata"], sourceZone: "Etc/UTC", range };
  const next = changeDate(state, "2026-12-31");
  assert.equal(new Date(next.range.start).toISOString(), "2026-12-31T23:30:00.000Z");
  assert.equal(new Date(next.range.end).toISOString(), "2027-01-01T01:15:00.000Z");
  assert.deepEqual(removeZone(state, "Etc/UTC").range, range);
  assert.equal(removeZone(state, "Etc/UTC").sourceZone, "Asia/Kolkata");
  assert.equal(removeZone(fallback, "missing").zones.length, fallback.zones.length);
  assert.equal(removeZone({ ...state, zones: ["Etc/UTC"] }, "Etc/UTC").zones.length, 1);
});
