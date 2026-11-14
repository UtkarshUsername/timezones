import { useEffect, useState } from "preact/hooks";
import { HOUR } from "../../shared/time";
import { TIMELINE_HOURS, anchorFor, changeDate, initialState, removeZone, restoreState, snap15 } from "./model";
import type { PlannerState } from "./model";

type Theme = "light" | "dark";
const STORAGE_KEY = "timezones-planner-v1";
const THEME_KEY = "timezones-theme-v1";
const HOUR12_KEY = "timezones-hour12-v1";

function read(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch { return; }
}

export function usePlanner() {
  const [planner, setPlanner] = useState(() => initialState(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [hour12, setHour12] = useState(true);
  const [now, setNow] = useState(Date.now);
  const [windowStart, setWindowStart] = useState(() => anchorFor(Date.now()));
  const [scrollRequest, setScrollRequest] = useState({ index: 18 });

  useEffect(() => {
    let saved = planner;
    try { saved = restoreState(JSON.parse(read(STORAGE_KEY) || "null"), planner); }
    catch { saved = planner; }
    setPlanner(saved);
    setWindowStart(anchorFor(saved.range.start));
    setScrollRequest({ index: (saved.range.start - anchorFor(saved.range.start)) / HOUR });
    const theme = read(THEME_KEY);
    if (theme === "dark" || theme === "light") setTheme(theme);
    if (read(HOUR12_KEY) === "0") setHour12(false);
    setReady(true);
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { if (ready) write(STORAGE_KEY, JSON.stringify(planner)); }, [ready, planner]);
  useEffect(() => { if (ready) write(THEME_KEY, theme); }, [ready, theme]);
  useEffect(() => { if (ready) write(HOUR12_KEY, hour12 ? "1" : "0"); }, [ready, hour12]);

  function update(value: Partial<PlannerState>) {
    setPlanner(current => ({ ...current, ...value }));
    if (value.zones && value.zones.length !== planner.zones.length) requestScroll();
  }
  function requestScroll() { setScrollRequest({ index: (planner.range.start - windowStart) / HOUR }); }
  function center(ts: number) {
    setWindowStart(anchorFor(ts));
    setScrollRequest({ index: (ts - anchorFor(ts)) / HOUR });
  }
  function selectHour(ts: number, zone: string) {
    const start = snap15(ts);
    if (start < windowStart || start >= windowStart + TIMELINE_HOURS * HOUR) center(start);
    update({ sourceZone: zone, range: { start, end: start + HOUR } });
  }
  function selectRange(from: number, to: number, zone: string) {
    const start = snap15(Math.min(from, to));
    const snappedEnd = snap15(Math.max(from, to));
    const end = snappedEnd > start ? snappedEnd : start + HOUR;
    if (start < windowStart || end >= windowStart + TIMELINE_HOURS * HOUR) center(start);
    update({ sourceZone: zone, range: { start, end } });
  }
  function setDate(date: string) {
    const next = changeDate(planner, date);
    if (next === planner) return;
    setPlanner(next);
    center(next.range.start);
  }
  function today() {
    const start = snap15(now);
    update({ range: { start, end: start + HOUR } });
    center(start);
  }
  function remove(zone: string) {
    setPlanner(current => removeZone(current, zone));
    requestScroll();
  }
  return { planner, update, theme, setTheme, hour12, setHour12, now, windowStart, scrollRequest, selectHour, selectRange, setDate, today, remove };
}
