import assert from "node:assert/strict";
import test from "node:test";
import { dateRange } from "../shared/time.ts";
import { mergeAvailability, parseDates, parseSlots, pollDateBounds, selectDates, validatePoll } from "../shared/polls.ts";
import { buildGrid, groupAvailability } from "../client/polls/grid-model.ts";

function slotAt(grid, hour, minute, occurrence = 0) {
  const row = grid.times.find(row => row.hour === hour && row.minute === minute && row.occurrence === occurrence);
  return grid.days[0].byTime.get(row.key);
}

test("calendar selection enforces the same limit for single dates and drag ranges", () => {
  const dates = dateRange("2026-11-01", "2026-11-14");
  assert.deepEqual(selectDates(dates, "2026-11-15", "2026-11-15", true), dates);
  assert.deepEqual(selectDates([], "2026-11-14", "2026-11-01", true), dates);
  assert.deepEqual(selectDates([], "2026-11-01", "2026-11-15", true), []);
  assert.deepEqual(selectDates(dates, "2026-11-05", "2026-11-07", false), dates.filter(date => date < "2026-11-05" || date > "2026-11-07"));
  assert.deepEqual(parseDates('["2026-11-02","2026-11-01","2026-11-01"]'), ["2026-11-01", "2026-11-02"]);
  assert.throws(() => parseDates('["2026-02-30"]'), /valid dates/);
  assert.throws(() => parseDates("[]"), /valid dates/);
});

test("creation accepts calendar boundary dates and only forwards declared fields", () => {
  const now = Date.parse("2026-11-14T23:55Z");
  const bounds = pollDateBounds(now);
  const input = { title: "  Team catch-up  ", dates: JSON.stringify([bounds.first, bounds.last]), zone: "Asia/Kolkata", startHour: 9, endHour: 24 };
  assert.deepEqual(validatePoll({ ...input, id: "unexpected", note: "ignored" }, now), { ...input, title: "Team catch-up" });
  for (const patch of [{ dates: '["2026-11-13"]' }, { dates: '["2027-11-16"]' }, { startHour: 9.5 }, { endHour: 9 }, { zone: "invalid" }, { title: "  " }]) {
    assert.throws(() => validatePoll({ ...input, ...patch }, now));
  }
});

test("availability rejects invalid slots and guest upgrades form a sorted union", () => {
  assert.deepEqual(parseSlots("[3,0,3,1]"), [0, 1, 3]);
  for (const raw of ["[-1]", "[1.5]", '["1"]', "[1344]", "null"]) assert.throws(() => parseSlots(raw), /Invalid availability/);
  assert.equal(mergeAvailability("[0,2]", "[2,3]"), "[0,2,3]");
  assert.equal(mergeAvailability("[]", "[]"), "[]");
});

test("viewer-zone projection changes dates while preserving every slot identity", () => {
  const poll = { dates: '["2026-11-14"]', zone: "Etc/UTC", startHour: 23, endHour: 24 };
  const grid = buildGrid(poll, "Asia/Kolkata");
  assert.equal(grid.zone, "Asia/Kolkata");
  assert.equal(grid.days[0].date, "2026-11-15");
  assert.equal(slotAt(grid, 4, 30).index, 0);
  assert.equal(grid.slotCount, 4);
  const split = buildGrid({ ...poll, startHour: 18, endHour: 20 }, "Asia/Kolkata");
  assert.deepEqual(split.days.map(day => day.date), ["2026-11-14", "2026-11-15"]);
  assert.deepEqual(split.days.flatMap(day => [...day.byTime.values()].map(slot => slot.index)).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("DST projection retains slots when local wall times repeat", () => {
  const spring = buildGrid({ dates: '["2026-03-08"]', zone: "America/New_York", startHour: 2, endHour: 4 }, "America/New_York");
  assert.equal(spring.days[0].byTime.size, 8);
  assert.notEqual(slotAt(spring, 3, 0).index, slotAt(spring, 3, 0, 1).index);
  const fall = buildGrid({ dates: '["2026-11-01"]', zone: "Etc/UTC", startHour: 5, endHour: 7 }, "America/New_York");
  assert.equal(fall.days[0].byTime.size, 8);
  assert.equal(slotAt(fall, 1, 30).ts + 3_600_000, slotAt(fall, 1, 30, 1).ts);
});

test("group totals exclude empty responses and shade relative to the peak", () => {
  const group = groupAvailability([{ name: "Alice", slots: "[0,1]" }, { name: "Bob", slots: "[1]" }, { name: "Empty", slots: "[]" }], 4);
  assert.deepEqual(group.people.map(person => person.name), ["Alice", "Bob"]);
  assert.deepEqual(group.counts, [1, 2, 0, 0]);
  assert.equal(group.peak, 2);
  assert.deepEqual(groupAvailability([], 4).counts, [0, 0, 0, 0]);
  assert.equal(groupAvailability([], 4).peak, 0);
});
