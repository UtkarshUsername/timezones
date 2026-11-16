import { DAY, HOUR, MINUTE, canonZone, dateInput, dateKey, isDate, isZone, timeInput, zonedTimestamp } from "../../shared/time";

export const TIMELINE_HOURS = 48;

export type Range = { start: number; end: number };
export type PlannerState = { zones: string[]; sourceZone: string; range: Range };

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isRange(value: unknown): value is Range {
  if (!value || typeof value !== "object") return false;
  const { start, end } = value as Range;
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    && Math.abs(start) <= 8.64e15 && Math.abs(end) <= 8.64e15;
}

export function wallRange(date: string, startTime: string, endTime: string, zone: string): Range {
  const startMinute = minutes(startTime);
  const endMinute = minutes(endTime);
  const start = zonedTimestamp(date, startMinute, zone);
  let end = zonedTimestamp(date, endMinute, zone);
  if (end <= start) {
    end = endMinute > startMinute
      ? start + (endMinute - startMinute) * MINUTE
      : zonedTimestamp(dateKey(Date.parse(date) + DAY), endMinute, zone);
  }
  return { start, end };
}

export function initialState(now: number, detectedZone: string): PlannerState {
  const sourceZone = canonZone(detectedZone);
  const defaults = ["Asia/Kolkata", "Etc/GMT-2", "America/New_York", "America/Los_Angeles"];
  return {
    zones: [sourceZone, ...defaults.filter(zone => zone !== sourceZone)].slice(0, 4),
    sourceZone,
    range: wallRange(dateInput(now, sourceZone), "09:00", "10:00", sourceZone),
  };
}

export function restoreState(value: unknown, fallback: PlannerState): PlannerState {
  if (!value || typeof value !== "object") return fallback;
  const saved = value as Record<string, unknown>;
  if (!Array.isArray(saved.zones) || !saved.zones.length || !saved.zones.every(isZone) || !isZone(saved.sourceZone)) return fallback;
  const sourceZone = canonZone(saved.sourceZone);
  const zones = [...new Set(saved.zones.map(canonZone))];
  if (!zones.includes(sourceZone)) zones.unshift(sourceZone);
  let range: Range;
  if (isRange(saved.range)) range = saved.range;
  else if (isRange({ start: saved.startTs, end: saved.endTs })) range = { start: saved.startTs as number, end: saved.endTs as number };
  else {
    if (!isDate(saved.date) || !isTime(saved.start) || (saved.end !== undefined && !isTime(saved.end))) return fallback;
    range = wallRange(saved.date, saved.start, saved.end as string ?? saved.start, sourceZone);
  }
  return { zones, sourceZone, range };
}

export function changeDate(state: PlannerState, date: string): PlannerState {
  if (!isDate(date)) return state;
  return { ...state, range: wallRange(date, timeInput(state.range.start, state.sourceZone), timeInput(state.range.end, state.sourceZone), state.sourceZone) };
}

export function removeZone(state: PlannerState, zone: string): PlannerState {
  if (state.zones.length === 1) return state;
  const zones = state.zones.filter(value => value !== zone);
  return { ...state, zones, sourceZone: state.sourceZone === zone ? zones[0] : state.sourceZone };
}

export function anchorFor(ts: number) { return Math.floor((ts - 18 * HOUR) / HOUR) * HOUR; }
export function snap15(ts: number) { return Math.round(ts / (15 * MINUTE)) * 15 * MINUTE; }
