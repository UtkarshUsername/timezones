import { DAY, dateKey, isDate, dateRange } from "./time";

export const MAX_DATES = 14;
export const SLOT_MINUTES = 15;
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
export const MAX_PARTICIPANTS = 100;
export const TITLE_LENGTH = 100;
export const NAME_LENGTH = 50;
export const DATE_HORIZON_DAYS = 366;
const MAX_SLOTS = MAX_DATES * 24 * SLOTS_PER_HOUR;

export type PollSchedule = { dates: string; zone: string; startHour: number; endHour: number };
export type CreatePollInput = PollSchedule & { title: string };

export function parseDates(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DATES || !value.every(isDate)) {
    throw new Error(`Choose 1 to ${MAX_DATES} valid dates`);
  }
  return [...new Set(value as string[])].sort();
}

export function parseSlots(raw: string): number[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > MAX_SLOTS || !value.every(v => Number.isSafeInteger(v) && v >= 0 && v < MAX_SLOTS)) {
    throw new Error("Invalid availability");
  }
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

export function slotsPerDay(poll: Pick<PollSchedule, "startHour" | "endHour">) {
  return (poll.endHour - poll.startHour) * SLOTS_PER_HOUR;
}

export function pollDateBounds(now: number) {
  return { first: dateKey(now), last: dateKey(now + DATE_HORIZON_DAYS * DAY) };
}

export function selectDates(original: string[], anchor: string, date: string, add: boolean) {
  const span = dateRange(anchor, date);
  if (span.length > MAX_DATES) return original;
  const next = add ? [...new Set([...original, ...span])] : original.filter(d => !span.includes(d));
  return next.length <= MAX_DATES ? next.sort() : original;
}

export function validatePoll(input: CreatePollInput, now: number) {
  const title = input.title.trim().slice(0, TITLE_LENGTH);
  const dates = parseDates(input.dates);
  if (!title || typeof input.zone !== "string" || input.zone.length > 80) throw new Error("Invalid poll");
  try { new Intl.DateTimeFormat("en", { timeZone: input.zone }); }
  catch { throw new Error("Invalid time zone"); }
  if (!Number.isInteger(input.startHour) || !Number.isInteger(input.endHour) || input.startHour < 0 || input.endHour > 24 || input.endHour <= input.startHour) {
    throw new Error("Invalid time range");
  }
  const { first, last } = pollDateBounds(now);
  if (dates.some(date => date < first || date > last)) {
    throw new Error("Dates must be within the next year");
  }
  return { title, dates: JSON.stringify(dates), zone: input.zone, startHour: input.startHour, endHour: input.endHour };
}

export function mergeAvailability(account: string, guest: string) {
  return JSON.stringify([...new Set([...parseSlots(account), ...parseSlots(guest)])].sort((a, b) => a - b));
}
