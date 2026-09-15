import { useEffect, useMemo, useState } from "preact/hooks";

type SavedState = { zones: string[]; sourceZone: string; date: string; start: string; end: string };

const STORAGE_KEY = "timezones-planner-v1";
const zoneOptions = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Helsinki", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Australia/Perth", "Australia/Sydney", "Pacific/Auckland"
].sort((first, second) => shortZone(first).localeCompare(shortZone(second)));

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
function zoneCode(timestamp: number, zone: string) {
  if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return "IST";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(timestamp).find((item) => item.type === "timeZoneName")?.value || "GMT";
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
function gmtOffset(timestamp: number, zone: string) {
  const minutes = offsetMinutes(timestamp, zone);
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `GMT${sign}${hours}${remainder ? `:${hourLabel(remainder)}` : ""}`;
}
function zoneMeta(date: string, zone: string) {
  const timestamp = zonedTimestamp(date, "12:00", zone);
  const code = zoneCode(timestamp, zone).replace("-", "−");
  const offset = gmtOffset(timestamp, zone);
  return code === offset ? `(${offset})` : `(${code} / ${offset})`;
}
function rangeEnd(start: number, end: number) { return end > start ? end : end + 86_400_000; }
function hourLabel(value: number) { return String(value).padStart(2, "0"); }
function timeFromMinutes(value: number) {
  const rounded = Math.round(value / 15) * 15;
  const minute = ((rounded % 1440) + 1440) % 1440;
  return `${hourLabel(Math.floor(minute / 60))}:${hourLabel(minute % 60)}`;
}

function Timeline({ zone, date, selectedStart, selectedEnd, onSelect }: { zone: string; date: string; selectedStart: number; selectedEnd: number; onSelect: (zone: string, start: string, end: string) => void }) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const cells = Array.from({ length: 24 }, (_, hour) => {
    const cellStart = zonedTimestamp(date, `${hourLabel(hour)}:00`, zone);
    const cellEnd = zonedTimestamp(date, `${hourLabel((hour + 1) % 24)}:00`, zone) + (hour === 23 ? 86_400_000 : 0);
    return { hour, active: cellStart < selectedEnd && cellEnd > selectedStart };
  });
  function minuteAt(pointerEvent: PointerEvent) {
    const bounds = (pointerEvent.currentTarget as HTMLDivElement).getBoundingClientRect();
    return Math.max(0, Math.min(1439, ((pointerEvent.clientX - bounds.left) / bounds.width) * 1440));
  }
  function updateSelection(pointerEvent: PointerEvent) {
    if (dragStart === null) return;
    const current = minuteAt(pointerEvent);
    const from = Math.min(dragStart, current);
    const to = Math.max(dragStart, current);
    onSelect(zone, timeFromMinutes(from), timeFromMinutes(to - from < 15 ? from + 60 : to));
  }
  function finish(pointerEvent: PointerEvent) {
    updateSelection(pointerEvent);
    setDragStart(null);
  }
  return <div className="relative"><div className="grid grid-cols-24 cursor-crosshair touch-none overflow-hidden rounded-sm border border-stone-300 bg-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-600" onPointerDown={(event) => { const start = minuteAt(event); setDragStart(start); onSelect(zone, timeFromMinutes(start), timeFromMinutes(start + 60)); }} onPointerMove={updateSelection} onPointerUp={finish} onPointerCancel={() => setDragStart(null)} role="slider" aria-label={`Select a time range in ${shortZone(zone)}`} tabIndex={0}>{cells.map(({ hour, active }) => <div aria-hidden="true" className={`h-14 border-r border-stone-300 last:border-r-0 ${active ? "bg-orange-500" : hour < 7 || hour > 20 ? "bg-slate-800" : "bg-stone-100"}`} key={hour} />)}</div><div className="grid grid-cols-6 pt-1 text-[10px] font-semibold tracking-[0.12em] text-slate-500">{["00", "04", "08", "12", "16", "20"].map((hour) => <span key={hour}>{hour}</span>)}</div></div>;
}

export function App() {
  const [planner, setPlanner] = useState<SavedState>(initialState);
  const [ready, setReady] = useState(false);
  const [zoneInput, setZoneInput] = useState("");
  const [draggedZone, setDraggedZone] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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
  function moveZone(zone: string, target: string) {
    if (zone === target) return;
    const zones = planner.zones.filter((item) => item !== zone);
    const targetIndex = zones.indexOf(target);
    zones.splice(targetIndex, 0, zone);
    update({ zones });
  }
  function selectRange(zone: string, start: string, end: string) { update({ sourceZone: zone, start, end }); }
  const sourceDate = formatInZone(selectedRange.start, planner.sourceZone, { weekday: "long", day: "numeric", month: "short" });
  return <main className="min-h-screen overflow-x-hidden bg-[#f3efe6] px-4 py-6 text-slate-950 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <header className="mb-10 flex flex-col justify-between gap-6 border-b-2 border-slate-950 pb-6 sm:flex-row sm:items-end"><div><p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-orange-700">Local time collaborator</p><h1 className="font-serif text-5xl leading-none tracking-tight sm:text-7xl">Across the<br /><i>hours.</i></h1></div><p className="max-w-xs text-sm leading-6 text-slate-600">Pick a moment in one city. See where it lands for everyone else.</p></header>
    <section className="mb-7 flex flex-col justify-between gap-5 border-y border-slate-400 py-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Time map</p><h2 className="mt-1 font-serif text-3xl">Tap or drag a grid</h2></div><div className="flex flex-wrap items-center gap-5"><label className="text-sm font-semibold">Date<input className="ml-3 border-b-2 border-slate-950 bg-transparent py-1 font-mono text-sm outline-none" type="date" value={planner.date} onInput={(event) => update({ date: event.currentTarget.value })} /></label><p className="border-l-2 border-orange-500 pl-4 font-mono text-sm"><b>{planner.start}–{planner.end}</b> in {shortZone(planner.sourceZone)}<br /><span className="text-xs text-slate-500">{zoneMeta(planner.date, planner.sourceZone)} · {sourceDate}</span></p><form className="flex gap-2" onSubmit={addZone}><select aria-label="Timezone to add" className="min-w-0 border-b-2 border-slate-950 bg-transparent px-1 py-2 text-sm outline-none" value={zoneInput} onChange={(event) => setZoneInput(event.currentTarget.value)}><option value="">Add a timezone</option>{zoneOptions.map((zone) => <option disabled={planner.zones.includes(zone)} key={zone} value={zone}>{shortZone(zone)} · {zoneMeta(planner.date, zone)}</option>)}</select><button className="bg-slate-950 px-4 py-2 text-sm font-bold text-[#f9f7f1] transition hover:bg-orange-700" type="submit">Add</button></form></div></section>
    <section className="space-y-4">{planner.zones.map((zone) => <article className={`grid gap-4 border-t border-slate-400 py-5 sm:grid-cols-[180px_1fr] sm:gap-7 ${dropTarget === zone && draggedZone !== zone ? "border-orange-500 bg-orange-100/60" : ""}`} key={zone} onDragOver={(event) => { event.preventDefault(); setDropTarget(zone); }} onDrop={(event) => { event.preventDefault(); const movedZone = event.dataTransfer?.getData("text/plain") || draggedZone; if (movedZone) moveZone(movedZone, zone); setDraggedZone(null); setDropTarget(null); }}><div className="flex justify-between gap-3 sm:block"><div className="flex items-start gap-2"><button aria-label={`Drag ${zone} to reorder`} className="mt-1 cursor-grab touch-none text-lg leading-none text-slate-400 hover:text-orange-700 active:cursor-grabbing" draggable onDragEnd={() => { setDraggedZone(null); setDropTarget(null); }} onDragStart={(event) => { event.dataTransfer?.setData("text/plain", zone); setDraggedZone(zone); }} type="button">↕</button><div><p className="font-serif text-2xl leading-none">{shortZone(zone)}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{zone} · {zoneMeta(planner.date, zone)}</p><p className="mt-4 font-mono text-sm font-bold">{formatInZone(selectedRange.start, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} <span className="font-normal text-slate-500">at start</span></p></div></div>{planner.zones.length > 1 ? <button aria-label={`Remove ${zone}`} className="h-fit text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-orange-700" onClick={() => removeZone(zone)} type="button">Remove</button> : null}</div><Timeline date={planner.date} onSelect={selectRange} selectedEnd={selectedRange.end} selectedStart={selectedRange.start} zone={zone} /></article>)}</section>
  </div></main>;
}
