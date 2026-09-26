import { useEffect, useMemo, useRef, useState } from "preact/hooks";

type SavedState = { zones: string[]; sourceZone: string; date: string; start: string; end: string };
type Theme = "light" | "dark";

const STORAGE_KEY = "timezones-planner-v1";
const THEME_KEY = "timezones-theme-v1";
const HOUR12_KEY = "timezones-hour12-v1";
const CELL_W = 62;
const CELL_GAP = 3;
const HOURS = 48;
const INFO_W = 248;
const STRIP_W = HOURS * (CELL_W + CELL_GAP);
const NOW_COLOR = "#52b306";
const SEL_COLOR = "#1498e0";

const zoneOptions = [
  "Pacific/Midway", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles",
  "America/Denver", "America/Chicago", "America/New_York", "America/Halifax",
  "America/Sao_Paulo", "Atlantic/Azores", "Etc/GMT-2", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Helsinki", "Africa/Cairo", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
].sort((a, b) => shortZone(a).localeCompare(shortZone(b)));

function shortZone(zone: string) {
  const etc = zone.match(/^Etc\/GMT([+-])(\d+)$/);
  if (etc) return `GMT${etc[1] === "+" ? "-" : "+"}${Number(etc[2])}`;
  return zone.split("/").at(-1)?.replaceAll("_", " ") || zone;
}
function localDate() { return new Date().toLocaleDateString("en-CA"); }
function canonZone(zone: string) { return zone === "Asia/Calcutta" ? "Asia/Kolkata" : zone; }
function initialState(): SavedState {
  const detected = canonZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  return {
    zones: ["Asia/Kolkata", "Etc/GMT-2", "America/New_York", "America/Los_Angeles"].filter((z) => z !== detected),
    sourceZone: detected, date: localDate(), start: "09:00", end: "10:00",
  };
}
function loadState(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "") as Partial<SavedState>;
    if (Array.isArray(saved.zones) && saved.zones.length && saved.sourceZone && saved.date && saved.start) {
      const zones = [...new Set(saved.zones.map(canonZone))];
      return { end: saved.start, ...saved, zones, sourceZone: canonZone(saved.sourceZone) } as SavedState;
    }
  } catch { /* ignore */ }
  const init = initialState();
  const detected = canonZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  if (!init.zones.includes(detected)) init.zones = [detected, ...init.zones].slice(0, 4);
  return init;
}
function formatInZone(ts: number, zone: string, o: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...o }).format(ts);
}
function zoneCode(ts: number, zone: string) {
  if (zone === "Asia/Kolkata" || zone === "Asia/Calcutta") return "IST";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(ts).find((i) => i.type === "timeZoneName")?.value || "GMT";
  } catch { return "GMT"; }
}
function offsetMinutes(ts: number, zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(ts).find((i) => i.type === "timeZoneName")?.value || "GMT";
    const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    const mins = Number(m[2]) * 60 + Number(m[3] || 0);
    return m[1] === "+" ? mins : -mins;
  } catch { return 0; }
}
function zonedTimestamp(date: string, time: string, zone: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  const offsets = new Set([
    offsetMinutes(wall - 36 * 3600_000, zone),
    offsetMinutes(wall, zone),
    offsetMinutes(wall + 36 * 3600_000, zone),
  ]);
  const candidates = [...offsets].map((offset) => wall - offset * 60_000).sort((a, b) => a - b);
  const requested = `${date}T${time}`;
  const local = (ts: number) => `${dateInput(ts, zone)}T${timeInput(ts, zone)}`;
  return candidates.find((ts) => local(ts) === requested)
    ?? candidates.find((ts) => local(ts) > requested)
    ?? candidates[candidates.length - 1];
}
function gmtLabel(ts: number, zone: string) {
  const mins = offsetMinutes(ts, zone);
  const sign = mins < 0 ? "-" : "+";
  const a = Math.abs(mins);
  const h = Math.floor(a / 60);
  const r = a % 60;
  if (h === 0 && r === 0) return "GMT";
  return `GMT${sign}${h}${r ? ":" + String(r).padStart(2, "0") : ""}`;
}
function fullName(zone: string, ts: number) {
  try {
    const long = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" }).formatToParts(ts).find((i) => i.type === "timeZoneName")?.value;
    if (long && long !== zone) return long;
  } catch { /* ignore */ }
  return zone.replaceAll("_", " ");
}
function cellTone(hour: number): "day" | "mid" | "night" {
  if (hour >= 8 && hour <= 21) return "day";
  if (hour === 6 || hour === 7 || hour === 22 || hour === 23) return "mid";
  return "night";
}
function snap15(ts: number) { return Math.round(ts / 900_000) * 900_000; }
function timeInput(ts: number, zone: string) {
  return formatInZone(ts, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function fmtTime(ts: number, zone: string, hour12: boolean) {
  return hour12
    ? formatInZone(ts, zone, { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
    : formatInZone(ts, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function dateInput(ts: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ts);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
const dayFmtCache = new Map<string, Intl.DateTimeFormat>();
function dayKey(ts: number, zone: string) {
  let f = dayFmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFmtCache.set(zone, f);
  }
  return f.format(ts);
}
function anchorFor(ts: number) {
  return Math.floor((ts - 18 * 3600_000) / 3600_000) * 3600_000;
}

export function App() {
  const [planner, setPlanner] = useState<SavedState>(initialState);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [hour12, setHour12] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [windowStart, setWindowStart] = useState(() => anchorFor(Date.now()));
  const outerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ zone: string; anchor: number; x0: number } | null>(null);
  const tap = useRef<{ x: number; y: number; ts: number; zone: string } | null>(null);

  useEffect(() => {
    const saved = loadState();
    setPlanner(saved);
    try { setWindowStart(anchorFor(zonedTimestamp(saved.date, saved.start, saved.sourceZone))); } catch { /* keep default */ }
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "light") setTheme(t);
    if (localStorage.getItem(HOUR12_KEY) === "0") setHour12(false);
    setReady(true);
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(planner)); }, [planner, ready]);
  useEffect(() => { if (ready) localStorage.setItem(THEME_KEY, theme); }, [ready, theme]);
  useEffect(() => { if (ready) localStorage.setItem(HOUR12_KEY, hour12 ? "1" : "0"); }, [ready, hour12]);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!(e.target as HTMLElement).closest?.("[data-search]")) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedRange = useMemo(() => {
    const s = zonedTimestamp(planner.date, planner.start, planner.sourceZone);
    let e: number;
    try { e = zonedTimestamp(planner.date, planner.end, planner.sourceZone); } catch { e = s + 3600_000; }
    if (e <= s) e += 86_400_000;
    return { start: s, end: e };
  }, [planner.date, planner.end, planner.sourceZone, planner.start]);

  const hours = useMemo(() => Array.from({ length: HOURS }, (_, i) => windowStart + i * 3600_000), [windowStart]);

  function update(v: Partial<SavedState>) { setPlanner((c) => ({ ...c, ...v })); }
  function goToday() {
    const t = snap15(now);
    setWindowStart(anchorFor(t));
    update({ date: dateInput(t, planner.sourceZone), start: timeInput(t, planner.sourceZone), end: timeInput(t + 3600_000, planner.sourceZone) });
  }
  function changeDate(d: string) {
    if (!d) return;
    update({ date: d });
    try { setWindowStart(anchorFor(zonedTimestamp(d, planner.start, planner.sourceZone))); } catch { /* ignore */ }
  }
  function addZone(z: string) {
    if (!zoneOptions.includes(z) || planner.zones.includes(z)) return;
    update({ zones: [...planner.zones, z] });
    setQuery(""); setOpen(false);
  }
  function removeZone(z: string) {
    if (planner.zones.length === 1) return;
    const zones = planner.zones.filter((x) => x !== z);
    update({ zones, sourceZone: planner.sourceZone === z ? zones[0] : planner.sourceZone });
  }
  function moveZone(z: string, dir: -1 | 1) {
    const i = planner.zones.indexOf(z);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= planner.zones.length) return;
    const zones = [...planner.zones];
    [zones[i], zones[j]] = [zones[j], zones[i]];
    update({ zones });
  }
  function selectHour(ts: number, zone: string) {
    const t = snap15(ts);
    if (t < windowStart || t >= windowStart + HOURS * 3600_000) setWindowStart(anchorFor(t));
    update({ sourceZone: zone, date: dateInput(t, zone), start: timeInput(t, zone), end: timeInput(t + 3600_000, zone) });
  }
  function selectRange(from: number, to: number, zone: string) {
    const s = snap15(Math.min(from, to));
    let e = snap15(Math.max(from, to));
    if (e <= s) e = s + 3600_000;
    if (s < windowStart || e >= windowStart + HOURS * 3600_000) setWindowStart(anchorFor(s));
    update({ sourceZone: zone, date: dateInput(s, zone), start: timeInput(s, zone), end: timeInput(e, zone) });
  }
  function tsAt(clientX: number, el: HTMLDivElement) {
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    return windowStart + (x / (CELL_W + CELL_GAP)) * 3600_000;
  }
  function idxAt(clientX: number, el: HTMLDivElement) {
    return Math.floor((tsAt(clientX, el) - windowStart) / 3600_000);
  }
  function stripDown(e: PointerEvent, zone: string) {
    const el = e.currentTarget as HTMLDivElement;
    const ts = tsAt(e.clientX, el);
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
      drag.current = { zone, anchor: ts, x0: e.clientX };
      selectHour(ts, zone);
    } else {
      tap.current = { x: e.clientX, y: e.clientY, ts, zone };
    }
  }
  function stripMove(e: PointerEvent, zone: string) {
    const el = e.currentTarget as HTMLDivElement;
    const ts = tsAt(e.clientX, el);
    setHoverIdx(idxAt(e.clientX, el));
    const d = drag.current;
    if (d && d.zone === zone && e.buttons === 1 && Math.abs(e.clientX - d.x0) > 6) {
      selectRange(d.anchor, ts, zone);
    }
  }
  function stripUp(e: PointerEvent, zone: string) {
    drag.current = null;
    const t = tap.current;
    tap.current = null;
    if (t && t.zone === zone && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8) selectHour(t.ts, zone);
  }
  function stripCancel() {
    drag.current = null;
    tap.current = null;
  }

  const dark = theme === "dark";
  const q = query.trim().toLowerCase();
  const matches = q
    ? zoneOptions.filter((z) =>
        z.toLowerCase().includes(q)
        || shortZone(z).toLowerCase().includes(q)
        || zoneCode(now, z).toLowerCase().includes(q)
        || fullName(z, now).toLowerCase().includes(q)
        || gmtLabel(now, z).toLowerCase().includes(q)).slice(0, 8)
    : zoneOptions.filter((z) => !planner.zones.includes(z)).slice(0, 8);

  const inRange = (i: number | null): i is number => i !== null && i >= 0 && i < HOURS;
  const nowIdx = Math.floor((now - windowStart) / 3600_000);
  const selIdx = Math.floor((selectedRange.start - windowStart) / 3600_000);
  const showHover = inRange(hoverIdx) && hoverIdx !== selIdx ? hoverIdx : null;

  useEffect(() => {
    const el = outerRef.current;
    if (el) el.scrollLeft = Math.max(0, selIdx * (CELL_W + CELL_GAP) - 220);
  }, [windowStart, planner.zones.length, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const selLabel = fmtTime(selectedRange.start, planner.sourceZone, hour12);
  const selDate = formatInZone(selectedRange.start, planner.sourceZone, { weekday: "short", day: "numeric", month: "short" });

  function spanRange(s: number, e: number, color: string, key: string) {
    const pitch = CELL_W + CELL_GAP;
    const total = HOURS * pitch;
    const x0 = ((s - windowStart) / 3600_000) * pitch;
    const x1 = ((e - windowStart) / 3600_000) * pitch;
    const l = Math.max(0, x0);
    const r = Math.min(total, x1);
    if (r - l < 4) return null;
    return (
      <div
        key={key}
        className="pointer-events-none absolute bottom-0 top-0 z-10 rounded"
        style={{ left: INFO_W + l, width: Math.max(r - l, 10), border: `3px solid ${color}`, background: "rgba(20, 152, 224, 0.10)" }}
      />
    );
  }

  function spanMarker(idx: number, color: string, key: string) {
    return (
      <div
        key={key}
        className="pointer-events-none absolute bottom-0 top-0 z-10 rounded"
        style={{ left: INFO_W + idx * (CELL_W + CELL_GAP), width: CELL_W, border: `3px solid ${color}` }}
      />
    );
  }

  return (
    <main className={`min-h-screen ${dark ? "bg-zinc-950 text-slate-100" : "bg-white text-slate-900"}`} style={{ fontFamily: "Verdana, Arial, Helvetica, sans-serif" }}>
      <div className="mx-auto max-w-[980px] px-3 py-4">
        {/* search */}
        <div className="relative mb-4 flex max-w-[430px] items-stretch" data-search>
          <button
            aria-label="Add zone"
            className="grid w-11 shrink-0 place-items-center rounded-l border border-r-0 border-[#ddd] bg-[#f5c04e] text-2xl font-bold leading-none text-black"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >+</button>
          <input
            className={`w-full rounded-r border border-[#ddd] px-3 py-2.5 text-[15px] outline-none ${dark ? "bg-zinc-900 text-slate-100" : "bg-white text-slate-800"}`}
            onFocus={() => setOpen(true)}
            onInput={(e) => { setQuery(e.currentTarget.value); setOpen(true); }}
            placeholder="Search by Location or Timezone name"
            value={query}
          />
          {open ? (
            <div className={`absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded border shadow-lg ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#ddd] bg-white"}`}>
              {matches.map((z) => {
                const added = planner.zones.includes(z);
                return (
                  <button key={z} className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] ${added ? "cursor-default opacity-50" : "hover:bg-[#dbe8f8] hover:text-black"}`} disabled={added} onClick={() => addZone(z)} type="button">
                    <span><b>{zoneCode(now, z)}</b> · {shortZone(z)} <span className="text-gray-500">{z}</span></span>
                    <span className="text-gray-400">{added ? "added" : gmtLabel(now, z)}</span>
                  </button>
                );
              })}
              {matches.length === 0 ? <p className="px-3 py-2 text-[13px] text-gray-500">No matches</p> : null}
            </div>
          ) : null}
        </div>

        {/* pre-actions */}
        <div id="pre-actions" className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
          <input aria-label="Date" className={`rounded border border-[#ddd] px-2 py-1.5 text-[13px] ${dark ? "bg-zinc-900 [color-scheme:dark]" : "bg-white"}`} type="date" value={planner.date} onInput={(e) => changeDate(e.currentTarget.value)} />
          <button className={`rounded border px-2 py-1.5 font-bold ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#ddd] bg-[#f7f9fc] hover:bg-[#dbe8f8]"}`} onClick={goToday} type="button">Today</button>
          <span className={`rounded border px-2 py-1.5 ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#ddd] bg-[#f7f9fc]"}`}>
            Selected: <b>{selLabel}</b> · {shortZone(planner.sourceZone)} · {selDate}
          </span>
          <span className="text-gray-400">Click an hour box, or drag across boxes to select a period. Green is now, blue is selected.</span>
          <span className="ml-auto flex overflow-hidden rounded border border-[#ddd] text-[12px] font-bold">
            <button className={`px-2.5 py-1.5 ${hour12 ? "bg-[#f5c04e] text-black" : "text-gray-500"}`} onClick={() => setHour12(true)} type="button">12h</button>
            <button className={`px-2.5 py-1.5 ${!hour12 ? "bg-[#f5c04e] text-black" : "text-gray-500"}`} onClick={() => setHour12(false)} type="button">24h</button>
          </span>
          <span className="flex overflow-hidden rounded border border-[#ddd] text-[12px] font-bold">
            <button className={`px-2.5 py-1.5 ${theme === "light" ? "bg-[#f5c04e] text-black" : "text-gray-500"}`} onClick={() => setTheme("light")} type="button">Light</button>
            <button className={`px-2.5 py-1.5 ${theme === "dark" ? "bg-[#2e4a5a] text-white" : "text-gray-500"}`} onClick={() => setTheme("dark")} type="button">Dark</button>
          </span>
        </div>

        {/* card: one shared horizontal scrollbar for all rows */}
        <div className={`tzwrap relative overflow-hidden rounded border ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#d3d3d3] bg-white"}`} style={{ boxShadow: "0 0 5px #d5d5d5" }}>
          <div ref={outerRef} className="overflow-x-auto">
            <div className="relative" style={{ minWidth: INFO_W + STRIP_W }}>
              {planner.zones.map((zone, zi) => {
                const code = zoneCode(now, zone);
                const off = gmtLabel(now, zone);
                const name = fullName(zone, now);
                const exact = fmtTime(now, zone, hour12);
                const dateStr = formatInZone(now, zone, { weekday: "short", day: "numeric", month: "short" });
                return (
                  <div key={zone} className={`grid${zi > 0 ? ` border-t ${dark ? "border-zinc-700" : "border-[#eee]"}` : ""}`} style={{ gridTemplateColumns: `${INFO_W}px ${STRIP_W}px` }}>
                    <div className={`sticky left-0 z-20 border-r border-[#eee] px-3 py-2.5 ${dark ? "border-zinc-700 bg-zinc-900" : "bg-white"}`}>
                      <p className={`text-[15px] font-bold ${dark ? "text-slate-100" : "text-black"}`}>
                        <span className={dark ? "text-slate-100" : "text-black"}>{code}</span>{" "}
                        <span className="ml-1 rounded border border-[#ddd] bg-[#f4f4f4] px-1 py-px align-middle text-[10px] font-normal text-gray-500">{off}</span>
                      </p>
                      <p className={`text-[12.5px] leading-tight ${dark ? "text-slate-300" : "text-black"}`}>{name}</p>
                      <p className="mt-2 flex items-start gap-3">
                        <span>
                          <span className={`block text-[17px] leading-none ${dark ? "text-slate-100" : "text-black"}`}>{exact}</span>
                          <span className={`block pt-0.5 text-[12.5px] ${dark ? "text-slate-300" : "text-black"}`}>{dateStr}</span>
                        </span>
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-gray-400">
                          <button aria-label={`Move ${code} up`} className="rounded border border-[#ddd] px-1.5 py-0.5 hover:text-black" onClick={() => moveZone(zone, -1)} type="button">↑</button>
                          <button aria-label={`Move ${code} down`} className="rounded border border-[#ddd] px-1.5 py-0.5 hover:text-black" onClick={() => moveZone(zone, 1)} type="button">↓</button>
                          {planner.zones.length > 1 ? <button aria-label={`Remove ${zone}`} className="rounded border border-[#ddd] px-1.5 py-0.5 hover:text-red-600" onClick={() => removeZone(zone)} type="button">✕</button> : null}
                        </span>
                      </p>
                    </div>
                    <div
                      className="relative min-w-0 cursor-crosshair select-none py-2 pr-2"
                      onPointerDown={(e) => stripDown(e, zone)}
                      onPointerMove={(e) => stripMove(e, zone)}
                      onPointerUp={(e) => stripUp(e, zone)}
                      onPointerCancel={stripCancel}
                      onPointerLeave={() => setHoverIdx(null)}
                    >
                      <div className="relative flex" style={{ gap: CELL_GAP, width: STRIP_W }}>
                        {hours.map((ts) => {
                          const h = Number(formatInZone(ts, zone, { hour: "numeric", hourCycle: "h23" }));
                          const tone = cellTone(h);
                          const parts12 = formatInZone(ts, zone, { hour: "numeric", hour12: true });
                          const digits = parts12.replace(/[^0-9]/g, "");
                          const ampm = parts12.toUpperCase().includes("AM") ? "am" : "pm";
                          const cellHour = hour12 ? digits : formatInZone(ts, zone, { hour: "2-digit", hourCycle: "h23" });
                          const cellMins = formatInZone(ts, zone, { minute: "2-digit" }).padStart(2, "0");
                          const spansMidnight = dayKey(ts - 1, zone) !== dayKey(ts + 3599_999, zone);
                          const bg = tone === "day" ? "bg-[#dbe8f8] text-black" : tone === "mid" ? "bg-[#8fb0c7] text-black" : "bg-[#2e4a5a] text-white";
                          const border = tone === "day" ? "border-[#b9cfe8]" : tone === "mid" ? "border-[#7ba0b8]" : "border-[#22394a]";
                          if (spansMidnight) {
                            const wd = formatInZone(ts + 3599_999, zone, { weekday: "short" }).toUpperCase();
                            const dm = formatInZone(ts + 3599_999, zone, { day: "numeric", month: "short" }).toUpperCase();
                            return (
                              <div key={ts} className={`flex shrink-0 flex-col items-center justify-center rounded border ${border} bg-[#2e4a5a] text-white`} style={{ width: CELL_W, height: 64 }}>
                                <span className="text-[15px] font-bold">{wd}</span>
                                <span className="text-[9px]">{dm}</span>
                              </div>
                            );
                          }
                          return (
                            <div key={ts} className={`flex shrink-0 flex-col items-center justify-center rounded border ${border} ${bg}`} style={{ width: CELL_W, height: 64 }}>
                              <span className="text-[17px] leading-none">{cellHour}{cellMins !== "00" ? <span className="ml-0.5 align-top text-[10px]">{cellMins}</span> : null}</span>
                              {hour12 ? <span className="pt-0.5 text-[11px] lowercase">{ampm}</span> : null}
                            </div>
                          );
                        })}
                        {/* full-height overlays render below, spanning all rows */}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* full-height markers spanning all rows, like the reference */}
              {showHover !== null ? spanMarker(showHover, `${SEL_COLOR}80`, "hov") : null}
              {spanRange(selectedRange.start, selectedRange.end, SEL_COLOR, "sel")}
              {inRange(nowIdx) ? spanMarker(nowIdx, NOW_COLOR, "now") : null}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm bg-white" style={{ border: `2px solid ${NOW_COLOR}` }} />Now</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm" style={{ border: `2px solid ${SEL_COLOR}`, background: "rgba(20, 152, 224, 0.10)" }} />Selected</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm border border-[#b9cfe8] bg-[#dbe8f8]" />Daytime</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm border border-[#7ba0b8] bg-[#8fb0c7]" />Morning / evening</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm border border-[#22394a] bg-[#2e4a5a]" />Night</span>
          <span className="flex items-center gap-1.5"><span className="flex h-4 items-center rounded-sm border border-[#22394a] bg-[#2e4a5a] px-1 text-[9px] font-bold leading-none text-white">SUN</span>Midnight</span>
        </div>
        <p className="mt-3 text-[12px] text-gray-500">
          {fmtTime(selectedRange.start, planner.sourceZone, hour12)}–{fmtTime(selectedRange.end, planner.sourceZone, hour12)} in {shortZone(planner.sourceZone)} is{" "}
          {planner.zones.map((z) => `${fmtTime(selectedRange.start, z, hour12)} ${shortZone(z)}`).join(" · ")}
        </p>
      </div>
    </main>
  );
}
