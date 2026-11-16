import assert from "node:assert/strict";
import test from "node:test";
import { dateInput, isDate, localParts, offsetMinutes, zonedTimestamp } from "../shared/time.ts";
import { fullName, gmtLabel, matchingZones, shortZone, zoneCode } from "../client/zones.ts";

const instant = (date, minute, zone) => new Date(zonedTimestamp(date, minute, zone)).toISOString();

test("resolve nonexistent local times forward and repeated times to the earlier instant", () => {
  assert.equal(instant("2026-03-08", 150, "America/New_York"), "2026-03-08T07:30:00.000Z");
  assert.equal(instant("2026-11-01", 90, "America/New_York"), "2026-11-01T05:30:00.000Z");
  assert.equal(instant("2026-10-04", 135, "Australia/Lord_Howe"), "2026-10-03T15:45:00.000Z");
  assert.equal(instant("2026-04-05", 105, "Australia/Lord_Howe"), "2026-04-04T14:45:00.000Z");
});

test("normalize midnight and date rollover before resolving a timezone", () => {
  assert.equal(instant("2026-12-31", 1440, "Asia/Kolkata"), "2026-12-31T18:30:00.000Z");
  assert.equal(instant("2026-01-01", -15, "Etc/UTC"), "2025-12-31T23:45:00.000Z");
  assert.equal(localParts(Date.parse("2026-12-31T18:30Z"), "Asia/Kolkata"), "2027-01-01T00:00");
  assert.equal(dateInput(Date.parse("2026-01-01T02:00Z"), "America/Los_Angeles"), "2025-12-31");
});

test("reject impossible calendar dates rather than normalizing them", () => {
  for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-1-01", null]) {
    assert.equal(isDate(date), false, String(date));
  }
  assert.equal(isDate("2024-02-29"), true);
});

test("preserve fractional offsets, IANA sign conventions and timezone search", () => {
  const now = Date.parse("2026-11-14T12:00Z");
  assert.equal(offsetMinutes(now, "Asia/Kathmandu"), 345);
  assert.equal(gmtLabel(now, "Asia/Kolkata"), "GMT+5:30");
  assert.equal(shortZone("Etc/GMT-2"), "GMT+2");
  assert.equal(shortZone("Etc/GMT+3"), "GMT-3");
  assert.equal(zoneCode(now, "Asia/Calcutta"), "IST");
  assert.equal(zoneCode(now, "Asia/Kolkata"), "IST");
  assert.ok(matchingZones("IST", now).includes("Asia/Kolkata"));
  assert.ok(matchingZones("GMT+5:30", now).includes("Asia/Kolkata"));
  assert.ok(fullName("America/New_York", now).includes("Eastern"));
});
