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

export function canonZone(zone: string) { return zone === "Asia/Calcutta" ? "Asia/Kolkata" : zone; }

export function zoneCode(ts: number, zone: string) {
  if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return "IST";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(ts).find((i) => i.type === "timeZoneName")?.value || "GMT";
  } catch { return "GMT"; }
}

export function offsetMinutes(ts: number, zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(ts).find((i) => i.type === "timeZoneName")?.value || "GMT";
    const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    const mins = Number(m[2]) * 60 + Number(m[3] || 0);
    return m[1] === "+" ? mins : -mins;
  } catch { return 0; }
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
  try {
    const long = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" }).formatToParts(ts).find((i) => i.type === "timeZoneName")?.value;
    if (long && long !== zone) return long;
  } catch { /* ignore */ }
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
