import { useEffect, useMemo, useState } from "preact/hooks";

type SavedState = { zones: string[]; sourceZone: string; date: string; start: string; end: string };

const STORAGE_KEY = "timezones-planner-v1";
const zoneOptions = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Helsinki", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Australia/Perth", "Australia/Sydney", "Pacific/Auckland"
];

function localDate() { return new Date().toLocaleDateString("en-CA"); }
function initialState(): SavedState {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return { zones: [detected], sourceZone: detected, date: localDate(), start: "09:00", end: "10:00" };
}
function loadState(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "") as Partial<SavedState>;
    if (Array.isArray(saved.zones) && saved.zones.length && saved.sourceZone && saved.date && saved.start && saved.end) return saved as SavedState;
  } catch { /* Invalid local data should not stop the planner. */ }
  return initialState();
}
function displayZone(zone: string) { return zone.replaceAll("_", " ").replaceAll("/", " · "); }
function shortZone(zone: string) { return zone.split("/").at(-1)?.replaceAll("_", " ") || zone; }
function formatInZone(timestamp: number, zone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...options }).format(timestamp);
}
function offsetMinutes(timestamp: number, zone: string) {
  const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(timestamp).find((item) => item.type === "timeZoneName")?.value || "GMT";
  const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "+" ? minutes : -minutes;
}
function zonedTimestamp(date: string, time: string, zone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hours, minutes);
  let timestamp = wallTime - offsetMinutes(wallTime, zone) * 60_000;
  timestamp = wallTime - offsetMinutes(timestamp, zone) * 60_000;
  return timestamp;
}
function rangeEnd(start: number, end: number) { return end > start ? end : end + 86_400_000; }
function hourLabel(value: number) { return String(value).padStart(2, "0"); }

function Timeline({ zone, date, selectedStart, selectedEnd }: { zone: string; date: string; selectedStart: number; selectedEnd: number }) {
  const cells = Array.from({ length: 24 }, (_, hour) => {
    const cellStart = zonedTimestamp(date, `${hourLabel(hour)}:00`, zone);
    const cellEnd = zonedTimestamp(date, `${hourLabel((hour + 1) % 24)}:00`, zone) + (hour === 23 ? 86_400_000 : 0);
    return { hour, active: cellStart < selectedEnd && cellEnd > selectedStart };
  });
  return <div className="relative"><div className="grid grid-cols-24 overflow-hidden rounded-sm border border-stone-300 bg-stone-100">{cells.map(({ hour, active }) => <div aria-label={`${hourLabel(hour)}:00${active ? ", selected" : ""}`} className={`h-12 border-r border-stone-300 last:border-r-0 ${active ? "bg-orange-500" : hour < 7 || hour > 20 ? "bg-slate-800" : "bg-stone-100"}`} key={hour} />)}</div><div className="grid grid-cols-6 pt-1 text-[10px] font-semibold tracking-[0.12em] text-slate-500">{["00", "04", "08", "12", "16", "20"].map((hour) => <span key={hour}>{hour}</span>)}</div></div>;
}

export function App() {
  const [planner, setPlanner] = useState<SavedState>(initialState);
  const [ready, setReady] = useState(false);
  const [zoneInput, setZoneInput] = useState("");
  useEffect(() => { setPlanner(loadState()); setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(planner)); }, [planner, ready]);
  const selectedRange = useMemo(() => {
    const start = zonedTimestamp(planner.date, planner.start, planner.sourceZone);
    return { start, end: rangeEnd(start, zonedTimestamp(planner.date, planner.end, planner.sourceZone)) };
  }, [planner.date, planner.end, planner.sourceZone, planner.start]);
  function update(values: Partial<SavedState>) { setPlanner((current) => ({ ...current, ...values })); }
  function addZone(event: SubmitEvent) {
    event.preventDefault(); const zone = zoneInput.trim();
    if (!zoneOptions.includes(zone) || planner.zones.includes(zone)) return;
    update({ zones: [...planner.zones, zone] }); setZoneInput("");
  }
  function removeZone(zone: string) {
    if (planner.zones.length === 1) return;
    const zones = planner.zones.filter((item) => item !== zone);
    update({ zones, sourceZone: planner.sourceZone === zone ? zones[0] : planner.sourceZone });
  }
  const sourceDate = formatInZone(selectedRange.start, planner.sourceZone, { weekday: "long", day: "numeric", month: "short" });
  return <main className="min-h-screen overflow-x-hidden bg-[#f3efe6] px-4 py-6 text-slate-950 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <header className="mb-10 flex flex-col justify-between gap-6 border-b-2 border-slate-950 pb-6 sm:flex-row sm:items-end"><div><p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-orange-700">Local time collaborator</p><h1 className="font-serif text-5xl leading-none tracking-tight sm:text-7xl">Across the<br /><i>hours.</i></h1></div><p className="max-w-xs text-sm leading-6 text-slate-600">Pick a moment in one city. See where it lands for everyone else.</p></header>
    <section className="mb-8 grid gap-px overflow-hidden border border-slate-950 bg-slate-950 sm:grid-cols-[1.2fr_0.8fr]"><div className="bg-[#f9f7f1] p-5 sm:p-7"><p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Your reference</p><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Timezone<select className="mt-2 block w-full border-b-2 border-slate-950 bg-transparent py-2 font-mono text-base outline-none" value={planner.sourceZone} onChange={(event) => update({ sourceZone: event.currentTarget.value })}>{planner.zones.map((zone) => <option key={zone} value={zone}>{displayZone(zone)}</option>)}</select></label><label className="text-sm font-semibold">Date<input className="mt-2 block w-full border-b-2 border-slate-950 bg-transparent py-2 font-mono text-base outline-none" type="date" value={planner.date} onInput={(event) => update({ date: event.currentTarget.value })} /></label><label className="text-sm font-semibold">From<input className="mt-2 block w-full border-b-2 border-slate-950 bg-transparent py-2 font-mono text-base outline-none" type="time" step="900" value={planner.start} onInput={(event) => update({ start: event.currentTarget.value })} /></label><label className="text-sm font-semibold">Until<input className="mt-2 block w-full border-b-2 border-slate-950 bg-transparent py-2 font-mono text-base outline-none" type="time" step="900" value={planner.end} onInput={(event) => update({ end: event.currentTarget.value })} /></label></div></div><aside className="bg-orange-500 p-5 sm:p-7"><p className="mb-7 text-xs font-bold uppercase tracking-[0.16em] text-orange-950">Selected window</p><p className="font-mono text-3xl font-bold tracking-tight">{planner.start}–{planner.end}</p><p className="mt-2 text-sm font-semibold text-orange-950">{sourceDate}<br />{shortZone(planner.sourceZone)}</p><p className="mt-7 border-t border-orange-800 pt-3 text-xs leading-5 text-orange-950">Orange marks the same real-world range in every timezone. Dark blocks are local night.</p></aside></section>
    <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Time map</p><h2 className="mt-1 font-serif text-3xl">All 24 hours</h2></div><form className="flex gap-2" onSubmit={addZone}><input className="min-w-0 border-b-2 border-slate-950 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-500" list="timezones" placeholder="Add a timezone" value={zoneInput} onInput={(event) => setZoneInput(event.currentTarget.value)} /><datalist id="timezones">{zoneOptions.map((zone) => <option key={zone} value={zone}>{displayZone(zone)}</option>)}</datalist><button className="bg-slate-950 px-4 py-2 text-sm font-bold text-[#f9f7f1] transition hover:bg-orange-700" type="submit">Add</button></form></section>
    <section className="space-y-4">{planner.zones.map((zone) => <article className="grid gap-4 border-t border-slate-400 py-5 sm:grid-cols-[180px_1fr] sm:gap-7" key={zone}><div className="flex justify-between gap-3 sm:block"><div><p className="font-serif text-2xl leading-none">{shortZone(zone)}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{zone}</p><p className="mt-4 font-mono text-sm font-bold">{formatInZone(selectedRange.start, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} <span className="font-normal text-slate-500">at start</span></p></div>{planner.zones.length > 1 ? <button aria-label={`Remove ${zone}`} className="h-fit text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-orange-700" onClick={() => removeZone(zone)} type="button">Remove</button> : null}</div><Timeline date={planner.date} selectedEnd={selectedRange.end} selectedStart={selectedRange.start} zone={zone} /></article>)}</section>
  </div></main>;
}
