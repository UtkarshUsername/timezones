import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Link } from "lakebed/client";
import { fullName, gmtLabel, matchingZones, shortZone, zoneCode, zoneOptions } from "../zones";

import { dateInput, formatInZone, timeInput } from "../../shared/time";

import { usePlanner } from "./use-planner";

const CELL_W = 62;
const CELL_GAP = 3;
const HOURS = 48;
const STRIP_W = HOURS * (CELL_W + CELL_GAP);
const NOW_COLOR = "#52b306";
const SEL_COLOR = "#1498e0";

function cellTone(hour: number): "day" | "mid" | "night" {
  if (hour >= 8 && hour <= 21) return "day";
  if (hour === 6 || hour === 7 || hour === 22 || hour === 23) return "mid";
  return "night";
}
function fmtTime(ts: number, zone: string, hour12: boolean) {
  return hour12
    ? formatInZone(ts, zone, { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
    : formatInZone(ts, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
export function PlannerApp() {
  const { planner, update, theme, setTheme, hour12, setHour12, now, windowStart, scrollRequest, select, setDate: changeDate, today: goToday, remove: removeZone } = usePlanner();
  const selectedRange = planner.range;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ zone: string; anchor: number; x0: number } | null>(null);
  const tap = useRef<{ x: number; y: number; ts: number; zone: string } | null>(null);

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

  const hours = useMemo(() => Array.from({ length: HOURS }, (_, i) => windowStart + i * 3600_000), [windowStart]);

  function addZone(z: string) {
    if (!zoneOptions.includes(z) || planner.zones.includes(z)) return;
    update({ zones: [...planner.zones, z] });
    setQuery(""); setOpen(false);
  }
  function moveZone(z: string, dir: -1 | 1) {
    const i = planner.zones.indexOf(z);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= planner.zones.length) return;
    const zones = [...planner.zones];
    [zones[i], zones[j]] = [zones[j], zones[i]];
    update({ zones });
  }
  function selectHour(ts: number, zone: string) { select(ts, ts + 3600_000, zone, HOURS); }
  function selectRange(from: number, to: number, zone: string) { select(from, to, zone, HOURS); }
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
      el.setPointerCapture(e.pointerId);
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
  const matches = query.trim()
    ? matchingZones(query, now)
    : zoneOptions.filter((z) => !planner.zones.includes(z)).slice(0, 8);

  const inRange = (i: number | null): i is number => i !== null && i >= 0 && i < HOURS;
  const nowIdx = Math.floor((now - windowStart) / 3600_000);
  const selIdx = Math.floor((selectedRange.start - windowStart) / 3600_000);
  const showHover = inRange(hoverIdx) && hoverIdx !== selIdx ? hoverIdx : null;

  useEffect(() => {
    const el = outerRef.current;
    if (el) el.scrollLeft = Math.max(0, scrollRequest.index * (CELL_W + CELL_GAP) - 220);
  }, [scrollRequest]);

  const selLabel = fmtTime(selectedRange.start, planner.sourceZone, hour12);
  const selDate = formatInZone(selectedRange.start, planner.sourceZone, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

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
        style={{ left: `calc(var(--zone-width) + ${l}px)`, width: Math.max(r - l, 10), border: `3px solid ${color}`, background: "rgba(20, 152, 224, 0.10)" }}
      />
    );
  }

  function spanMarker(idx: number, color: string, key: string) {
    return (
      <div
        key={key}
        className="pointer-events-none absolute bottom-0 top-0 z-10 rounded"
        style={{ left: `calc(var(--zone-width) + ${idx * (CELL_W + CELL_GAP)}px)`, width: CELL_W, border: `3px solid ${color}` }}
      />
    );
  }

  return (
    <main className={`min-h-screen ${dark ? "bg-zinc-950 text-slate-100" : "bg-white text-slate-900"}`} style={{ fontFamily: "Verdana, Arial, Helvetica, sans-serif" }}>
      <div className="mx-auto max-w-[980px] px-3 py-4">
        <nav className={`mb-5 flex items-center justify-between border-b pb-3 text-sm ${dark ? "border-zinc-700" : "border-slate-200"}`}><strong className="text-lg tracking-tight">Timezones</strong><Link to="/polls" className="rounded bg-[#1498e0] px-4 py-2 font-bold text-white">Group polls</Link></nav>
        <div className="relative mb-4 flex max-w-[430px] items-stretch" data-search>
          <button
            aria-label="Add zone"
            className="grid w-11 shrink-0 place-items-center rounded-l border border-r-0 border-[#ddd] bg-[#f5c04e] text-2xl font-bold leading-none text-black"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >+</button>
          <input
            className={`w-full rounded-r border border-[#ddd] px-3 py-2.5 text-[15px] outline-none ${dark ? "bg-zinc-900 text-slate-100 placeholder:text-slate-400" : "bg-white text-slate-800 placeholder:text-slate-500"}`}
            onFocus={() => setOpen(true)}
            onInput={(e) => { setQuery(e.currentTarget.value); setOpen(true); }}
            placeholder="Add a city or time zone"
            value={query}
          />
          {open ? (
            <div className={`absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded border shadow-lg ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#ddd] bg-white"}`}>
              {matches.map((z) => {
                const added = planner.zones.includes(z);
                return (
                  <button key={z} className={`block w-full border-b px-3 py-2 text-left text-xs ${dark ? "border-zinc-800" : "border-slate-100"} ${added ? "cursor-default opacity-50" : "hover:bg-[#dbe8f8] hover:text-black focus:bg-[#dbe8f8] focus:outline-none"}`} disabled={added} onClick={() => addZone(z)} type="button">
                    <span className="flex justify-between gap-2"><span><b>{zoneCode(now, z)}</b> · {shortZone(z)}</span><span className="shrink-0 text-slate-500">{added ? "added" : gmtLabel(now, z)}</span></span>
                    <span className="block truncate text-slate-500">{z}</span>
                  </button>
                );
              })}
              {matches.length === 0 ? <p className="px-3 py-2 text-xs text-slate-500">No matches</p> : null}
            </div>
          ) : null}
        </div>
        <div id="pre-actions" className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
          <input aria-label="Date" className={`rounded border border-[#ddd] px-2 py-1.5 text-[13px] ${dark ? "bg-zinc-900 [color-scheme:dark]" : "bg-white"}`} type="date" value={dateInput(selectedRange.start, planner.sourceZone)} onInput={(e) => changeDate(e.currentTarget.value)} />
          <button className={`rounded border px-2 py-1.5 font-bold ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#ddd] bg-[#f7f9fc] hover:bg-[#dbe8f8]"}`} onClick={goToday} type="button">Today</button>
          <span className={`rounded border px-2 py-1.5 ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#ddd] bg-[#f7f9fc]"}`}>
            Selected: <b>{selLabel}–{fmtTime(selectedRange.end, planner.sourceZone, hour12)}</b> · {shortZone(planner.sourceZone)} · {selDate}
          </span>
          <span className={`basis-full ${dark ? "text-slate-300" : "text-slate-600"}`}>Select an hour or drag to choose a range.<span className="sr-only"> With a keyboard, press Enter to select an hour or Shift+Enter to extend the range.</span></span>
          <span role="group" aria-label="Time format" className="ml-auto flex overflow-hidden rounded border border-[#ddd] text-[12px] font-bold">
            <button aria-pressed={hour12} className={`px-2.5 py-1.5 ${hour12 ? "bg-[#f5c04e] text-black" : dark ? "text-slate-300" : "text-slate-600"}`} onClick={() => setHour12(true)} type="button">12h</button>
            <button aria-pressed={!hour12} className={`px-2.5 py-1.5 ${!hour12 ? "bg-[#f5c04e] text-black" : dark ? "text-slate-300" : "text-slate-600"}`} onClick={() => setHour12(false)} type="button">24h</button>
          </span>
          <span role="group" aria-label="Color theme" className="flex overflow-hidden rounded border border-[#ddd] text-[12px] font-bold">
            <button aria-pressed={theme === "light"} className={`px-2.5 py-1.5 ${theme === "light" ? "bg-[#f5c04e] text-black" : dark ? "text-slate-300" : "text-slate-600"}`} onClick={() => setTheme("light")} type="button">Light</button>
            <button aria-pressed={theme === "dark"} className={`px-2.5 py-1.5 ${theme === "dark" ? "bg-[#2e4a5a] text-white" : "text-slate-600"}`} onClick={() => setTheme("dark")} type="button">Dark</button>
          </span>
        </div>
        <div className={`tzwrap relative overflow-hidden rounded border [--zone-width:148px] sm:[--zone-width:248px] ${dark ? "border-zinc-700 bg-zinc-900" : "border-[#d3d3d3] bg-white"}`} style={{ boxShadow: dark ? "none" : "0 0 5px #d5d5d5" }}>
          <div ref={outerRef} className="overflow-x-auto">
            <div className="relative" style={{ minWidth: `calc(var(--zone-width) + ${STRIP_W}px)` }}>
              {planner.zones.map((zone, zi) => {
                const code = zoneCode(now, zone);
                const off = gmtLabel(now, zone);
                const name = fullName(zone, now);
                const exact = fmtTime(now, zone, hour12);
                const dateStr = formatInZone(now, zone, { weekday: "short", day: "numeric", month: "short" });
                return (
                  <div key={zone} className={`grid${zi > 0 ? ` border-t ${dark ? "border-zinc-700" : "border-[#eee]"}` : ""}`} style={{ gridTemplateColumns: `var(--zone-width) ${STRIP_W}px` }}>
                    <div className={`sticky left-0 z-20 border-r border-[#eee] px-2 py-2.5 sm:px-3 ${dark ? "border-zinc-700 bg-zinc-900" : "bg-white"}`}>
                      <p className={`text-[15px] font-bold ${dark ? "text-slate-100" : "text-black"}`}>
                        <span className={dark ? "text-slate-100" : "text-black"}>{shortZone(zone)}</span>{" "}
                        <span className="hidden sm:inline">{code}</span>
                        <span className="ml-1 hidden rounded border border-[#ddd] bg-[#f4f4f4] px-1 py-px align-middle text-[10px] font-normal text-gray-500 sm:inline">{off}</span>
                      </p>
                      <p className={`hidden text-[12.5px] leading-tight sm:block ${dark ? "text-slate-300" : "text-black"}`}>{name}</p>
                      <p className="mt-2 flex flex-wrap items-start gap-2 sm:flex-nowrap sm:gap-3">
                        <span>
                          <span className={`block text-[15px] leading-none sm:text-[17px] ${dark ? "text-slate-100" : "text-black"}`}><span className={`mr-1 text-[11px] font-bold uppercase ${dark ? "text-slate-300" : "text-slate-600"}`}>Now</span>{exact}</span>
                          <span className={`block pt-0.5 text-[12.5px] ${dark ? "text-slate-300" : "text-black"}`}>{dateStr}</span>
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 sm:ml-auto">
                          <button aria-label={`Move ${shortZone(zone)} up`} disabled={zi === 0} className="rounded border border-[#ddd] px-2 py-1.5 hover:text-black disabled:opacity-40" onClick={() => moveZone(zone, -1)} type="button">↑</button>
                          <button aria-label={`Move ${shortZone(zone)} down`} disabled={zi === planner.zones.length - 1} className="rounded border border-[#ddd] px-2 py-1.5 hover:text-black disabled:opacity-40" onClick={() => moveZone(zone, 1)} type="button">↓</button>
                          {planner.zones.length > 1 ? <button aria-label={`Remove ${zone}`} className="rounded border border-[#ddd] px-2 py-1.5 hover:text-red-600" onClick={() => removeZone(zone)} type="button">✕</button> : null}
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
                          const spansMidnight = dateInput(ts - 1, zone) !== dateInput(ts + 3599_999, zone);
                          const bg = tone === "day" ? "bg-[#dbe8f8] text-black" : tone === "mid" ? "bg-[#8fb0c7] text-black" : "bg-[#2e4a5a] text-white";
                          const border = tone === "day" ? "border-[#b9cfe8]" : tone === "mid" ? "border-[#7ba0b8]" : "border-[#22394a]";
                          const wd = formatInZone(ts + 3599_999, zone, { weekday: "short" }).toUpperCase();
                          const dm = formatInZone(ts + 3599_999, zone, { day: "numeric", month: "short" }).toUpperCase();
                          return (
                            <button key={ts} type="button" aria-label={`${dateInput(ts, zone)} ${timeInput(ts, zone)} ${gmtLabel(ts, zone)} in ${shortZone(zone)}`}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (e.shiftKey) selectRange(selectedRange.start, ts + 3600_000, zone); else selectHour(ts, zone); } }}
                              className={`flex shrink-0 flex-col items-center justify-center rounded border ${border} ${spansMidnight ? "bg-[#2e4a5a] text-white" : bg} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`} style={{ width: CELL_W, height: 64 }}>
                              {spansMidnight ? <><span className="text-[15px] font-bold">{wd}</span><span className="text-[9px]">{dm}</span></> : <><span className="text-[17px] leading-none">{cellHour}{cellMins !== "00" ? <span className="ml-0.5 align-top text-[10px]">{cellMins}</span> : null}</span>
                              {hour12 ? <span className="pt-0.5 text-[11px] lowercase">{ampm}</span> : null}</>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {showHover !== null ? spanMarker(showHover, `${SEL_COLOR}80`, "hov") : null}
              {spanRange(selectedRange.start, selectedRange.end, SEL_COLOR, "sel")}
              {inRange(nowIdx) ? spanMarker(nowIdx, NOW_COLOR, "now") : null}
            </div>
          </div>
        </div>
        <p className={`mt-2 text-sm sm:hidden ${dark ? "text-slate-300" : "text-slate-600"}`}>Scroll the timeline to see more hours →</p>
        <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm bg-white" style={{ border: `2px solid ${NOW_COLOR}` }} />Now</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm" style={{ border: `2px solid ${SEL_COLOR}`, background: "rgba(20, 152, 224, 0.10)" }} />Selected</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm border border-[#b9cfe8] bg-[#dbe8f8]" />Daytime</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm border border-[#7ba0b8] bg-[#8fb0c7]" />Morning / evening</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-sm border border-[#22394a] bg-[#2e4a5a]" />Night</span>
        </div>
        {planner.zones.some((z) => z !== planner.sourceZone) ? <p className={`mt-3 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>
          In other zones: {planner.zones.filter((z) => z !== planner.sourceZone).map((z) => `${fmtTime(selectedRange.start, z, hour12)} ${shortZone(z)}`).join(" · ")}
        </p> : null}
      </div>
    </main>
  );
}
