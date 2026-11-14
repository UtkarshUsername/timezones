export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatter(zone: string, options: Intl.DateTimeFormatOptions, locale = "en-GB") {
  const key = JSON.stringify([locale, zone, options]);
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
    formatters.set(key, result);
  }
  return result;
}

export function formatInZone(ts: number, zone: string, options: Intl.DateTimeFormatOptions, locale = "en-GB") {
  return formatter(zone, options, locale).format(ts);
}

export function dateKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && dateKey(ts) === value;
}

export function dateInput(ts: number, zone: string) {
  const parts = formatter(zone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ts);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function timeInput(ts: number, zone: string) {
  return formatInZone(ts, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function localParts(ts: number, zone: string) {
  return `${dateInput(ts, zone)}T${timeInput(ts, zone)}`;
}

export function offsetMinutes(ts: number, zone: string) {
  const parts = formatter(zone, { timeZoneName: "longOffset" }).formatToParts(ts);
  const offset = parts.find(part => part.type === "timeZoneName")!.value;
  const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "+" ? minutes : -minutes;
}

// Choose the earlier instant in an overlap and move forward through a DST gap.
export function zonedTimestamp(date: string, minute: number, zone: string) {
  const wall = Date.parse(date) + minute * MINUTE;
  const target = new Date(wall).toISOString().slice(0, 16);
  const offsets = new Set([wall - 36 * HOUR, wall, wall + 36 * HOUR].map(ts => offsetMinutes(ts, zone)));
  const candidates = [...offsets].map(offset => wall - offset * MINUTE).sort((a, b) => a - b);
  return candidates.find(ts => localParts(ts, zone) === target)
    ?? candidates.find(ts => localParts(ts, zone) > target)
    ?? candidates[candidates.length - 1];
}

export function dateRange(a: string, b: string) {
  const start = Math.min(Date.parse(a), Date.parse(b));
  const end = Math.max(Date.parse(a), Date.parse(b));
  return Array.from({ length: (end - start) / DAY + 1 }, (_, i) => dateKey(start + i * DAY));
}
