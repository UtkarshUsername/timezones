import { canonZone, formatter, offsetMinutes } from "../shared/time";

export const zoneOptions = [
  "Pacific/Midway", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles",
  "America/Denver", "America/Chicago", "America/New_York", "America/Halifax",
  "America/Sao_Paulo", "Atlantic/Azores", "Etc/UTC", "Etc/GMT-2", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Helsinki", "Africa/Cairo", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
].sort((a, b) => shortZone(a).localeCompare(shortZone(b)));

export function shortZone(zone: string) {
  const etc = zone.match(/^Etc\/GMT([+-])(\d+)$/);
  if (etc) return `GMT${etc[1] === "+" ? "-" : "+"}${Number(etc[2])}`;
  return zone.split("/").at(-1)?.replaceAll("_", " ") || zone;
}

export function zoneCode(ts: number, zone: string) {
  if (canonZone(zone) === "Asia/Kolkata") return "IST";
  return formatter(zone, { timeZoneName: "short" }, "en-US").formatToParts(ts).find(i => i.type === "timeZoneName")!.value;
}

export function gmtLabel(ts: number, zone: string) {
  const mins = offsetMinutes(ts, zone);
  const sign = mins < 0 ? "-" : "+";
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const r = a % 60;
  if (h === 0 && r === 0) return "GMT";
  return `GMT${sign}${h}${r ? ":" + String(r).padStart(2, "0") : ""}`;
}

export function fullName(zone: string, ts: number) {
  const long = formatter(zone, { timeZoneName: "long" }, "en-US").formatToParts(ts).find(i => i.type === "timeZoneName")?.value;
  if (long && long !== zone) return long;
  return zone.replaceAll("_", " ");
}

export function matchingZones(query: string, now: number) {
  const q = query.trim().toLowerCase();
  return q ? zoneOptions.filter(z =>
    z.toLowerCase().includes(q)
    || shortZone(z).toLowerCase().includes(q)
    || zoneCode(now, z).toLowerCase().includes(q)
    || fullName(z, now).toLowerCase().includes(q)
    || gmtLabel(now, z).toLowerCase().includes(q)).slice(0, 8) : zoneOptions.slice(0, 8);
}
