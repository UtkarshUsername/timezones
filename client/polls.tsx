import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { canAccessApp, createClient, Link, retryAuth, SignInWithGoogle, useAuth, useParams } from "lakebed/client";
import type app from "../server/index";
import { canonZone, gmtLabel, matchingZones, shortZone, zoneCode, zoneOptions } from "./zones";

const client = createClient<typeof app>();
const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
const displayFormatters = new Map<string, Intl.DateTimeFormat>();

type Poll = { title: string; dates: string; zone: string; startHour: number; endHour: number };
type Response = { id: string; name: string; slots: string; isMine: boolean };
type PollData = { poll: Poll; responses: Response[] };

function format(ts: number, zone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${zone}:${JSON.stringify(options)}`;
  let formatter = displayFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, ...options });
    displayFormatters.set(key, formatter);
  }
  return formatter.format(ts);
}
function localParts(ts: number, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(ts);
  const get = (key: string) => parts.find(p => p.type === key)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function timestamp(date: string, minute: number, zone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, 0, minute);
  const target = `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const offsets = [wall - 36 * 3_600_000, wall, wall + 36 * 3_600_000].map(t => Date.parse(`${localParts(t, zone)}Z`) - t);
  const candidates = [...new Set(offsets)].map(offset => wall - offset).sort((a, b) => a - b);
  return candidates.find(t => localParts(t, zone) === target)
    ?? candidates.find(t => localParts(t, zone) > target)
    ?? candidates[0];
}
function dateKey(ts: number) { return new Date(ts).toISOString().slice(0, 10); }
function dateRange(a: string, b: string) {
  const start = Math.min(Date.parse(a), Date.parse(b));
  const end = Math.max(Date.parse(a), Date.parse(b));
  return Array.from({ length: Math.floor((end - start) / DAY) + 1 }, (_, i) => dateKey(start + i * DAY));
}
const control = "rounded border border-[#d3d3d3] bg-white px-3 py-2 text-sm focus:border-[#1498e0] focus:outline-none";
const primary = "rounded border border-[#b9cfe8] bg-[#1498e0] px-4 py-2 text-sm font-bold text-white hover:bg-[#0879bc] disabled:opacity-50";

function ZonePicker({ value, onChange, label }: { value: string; onChange: (zone: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const now = Date.now();
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const matches = query.trim()
    ? matchingZones(query, now)
    : [value, ...zoneOptions.filter(z => z !== value)].slice(0, 8);
  function choose(zone: string) { onChange(zone); setOpen(false); setQuery(""); }
  return <div ref={root} className="relative min-w-0">
    <label className="block text-xs font-bold text-slate-600">{label}
      <input
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        autoComplete="off"
        className={`${control} mt-1.5 block w-full`}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onInput={e => { setQuery(e.currentTarget.value); setOpen(true); }}
        value={open ? query : `${zoneCode(now, value)} · ${shortZone(value)}`}
      />
    </label>
    {open && <div role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded border border-[#ddd] bg-white shadow-lg">
      {matches.map(z => <button key={z} type="button" role="option" data-zone={z} aria-selected={z === value} className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-[#dbe8f8] focus:bg-[#dbe8f8] focus:outline-none" onPointerDown={e => e.preventDefault()} onClick={e => choose(e.currentTarget.dataset.zone!)}>
        <span className="flex justify-between gap-2"><span><b>{zoneCode(now, z)}</b> · {shortZone(z)}</span><span className="shrink-0 text-slate-500">{gmtLabel(now, z)}</span></span>
        <span className="block truncate text-slate-500">{z}</span>
      </button>)}
      {matches.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No matches</p>}
    </div>}
  </div>;
}

function Gate({ children }: { children: any }) {
  const auth = useAuth();
  if (auth.isLoading) return <main className="p-6">Checking session…</main>;
  if (!canAccessApp()) return <main className="mx-auto max-w-xl p-6"><p role="alert">{auth.error || "Sign in to continue"}</p><button className="mr-3 underline" onClick={() => void retryAuth()}>Retry</button><SignInWithGoogle /></main>;
  return children;
}
function Shell({ children, showAllPolls = true }: { children: any; showAllPolls?: boolean }) {
  return <main className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "Verdana, Arial, Helvetica, sans-serif" }}>
    <div className="mx-auto max-w-[1100px] px-3 py-4">
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-sm">
        <Link to="/" className="text-lg font-bold tracking-tight text-black">Timezones</Link>
        {showAllPolls && <Link to="/polls" className="py-2 text-slate-600 underline-offset-4 hover:text-[#0879bc] hover:underline">All polls</Link>}
      </nav>
      {children}
    </div>
  </main>;
}

export function PollsHome() { return <Gate><PollsHomeContent /></Gate>; }
function PollsHomeContent() {
  const polls = client.useQuery("myPolls");
  return <Shell showAllPolls={false}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">Group polls</h1><Link to="/polls/new" className={primary}>Create a poll</Link></div>
    <h2 className="mb-3 border-b border-[#ddd] pb-2 text-sm font-bold">Your polls</h2>
    {polls === undefined ? <p className="text-sm text-gray-500">Loading…</p> : polls.length ? <div className="grid gap-2 sm:grid-cols-2">{polls.map(p => <Link key={p.id} to={`/polls/${p.id}`} className="rounded border border-[#ddd] bg-[#f7f9fc] p-4 hover:border-[#1498e0]"><strong className="block text-base">{p.title}</strong><span className="mt-1 block text-xs text-gray-500">{(JSON.parse(p.dates) as string[]).length} dates · {p.zone}</span></Link>)}</div> : <p className="rounded border border-dashed border-[#ddd] p-6 text-sm text-gray-500">No polls yet. Create one to start.</p>}
  </Shell>;
}

function Calendar({ dates, onChange }: { dates: string[]; onChange: (dates: string[]) => void }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const drag = useRef<{ anchor: string; add: boolean; original: string[] } | null>(null);
  const today = dateKey(Date.now());
  const last = dateKey(Date.now() + 366 * DAY);
  const start = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const first = Date.UTC(month.getFullYear(), month.getMonth(), 1 - start);
  const cellCount = Math.ceil((start + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => dateKey(first + i * DAY));
  function select(date: string, state: NonNullable<typeof drag.current>) {
    const span = dateRange(state.anchor, date);
    if (span.length > 14) return;
    const next = state.add ? [...new Set([...state.original, ...span])] : state.original.filter(d => !span.includes(d));
    if (next.length <= 14) onChange(next.sort());
  }
  function begin(e: PointerEvent, date: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { anchor: date, add: !dates.includes(date), original: dates };
    (e.currentTarget as HTMLElement).parentElement?.setPointerCapture(e.pointerId);
    select(date, drag.current);
  }
  function move(e: PointerEvent) {
    if (!drag.current) return;
    const date = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-date]") as HTMLElement | null)?.dataset.date;
    if (date && date >= today && date <= last) select(date, drag.current);
  }
  return <div className="rounded-lg border border-[#d9e2ec] bg-[#f7f9fc] p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" className="h-9 w-9 rounded-lg border border-[#d9e2ec] inline-flex items-center justify-center bg-white text-slate-600 hover:border-[#1498e0] hover:text-[#0879bc]" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg></button><strong className="text-[15px]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" className="h-9 w-9 rounded-lg border border-[#d9e2ec] inline-flex items-center justify-center bg-white text-slate-600 hover:border-[#1498e0] hover:text-[#0879bc]" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg></button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">{"SMTWTFS".split("").map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="mt-2 grid grid-cols-7 gap-1 touch-pan-y" onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>
      {cells.map(date => { const active = dates.includes(date); const outside = new Date(`${date}T12:00:00Z`).getUTCMonth() !== month.getMonth(); const disabled = date < today || date > last; return <button key={date} data-date={date} type="button" disabled={disabled} aria-label={date} aria-pressed={active} className={`h-9 rounded-md border text-xs font-bold touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1498e0] ${active ? "border-[#0879bc] bg-[#1498e0] text-white" : outside ? "border-transparent bg-white text-gray-400" : "border-[#d4dce7] bg-[#e8f0f9] text-slate-800 hover:border-[#1498e0] hover:bg-[#dbe8f8]"} disabled:opacity-30`} onPointerDown={e => begin(e, date)} onClick={e => { if (e.detail === 0) onChange(active ? dates.filter(d => d !== date) : [...dates, date].sort()); }}>{Number(date.slice(-2))}</button>; })}
    </div>
    <p className="mt-3 text-sm text-slate-600"><span className="font-bold text-slate-700">{dates.length} of 14 dates selected</span></p>
  </div>;
}

export function PollCreate() { return <Gate><PollCreateContent /></Gate>; }
function PollCreateContent() {
  const create = client.useMutation("createPoll");
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [zone, setZone] = useState(() => canonZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC"));
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: Event) {
    e.preventDefault(); setBusy(true); setError("");
    try { const id = await create({ title, dates: JSON.stringify(dates), zone, startHour, endHour }); window.location.assign(`/polls/${id}`); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not create poll"); setBusy(false); }
  }
  return <Shell>
    <div className="mx-auto max-w-[470px] pb-12 pt-2">
      <h1 className="text-2xl font-bold tracking-tight">Create a group poll</h1>
      <p className="mt-1 text-sm text-slate-500">Pick possible dates and times, then share the link.</p>
      <form onSubmit={e => void submit(e)} className="mt-7 space-y-6">
        <label className="block text-sm font-bold">Event name<input className={`${control} mt-2 w-full py-3`} value={title} maxLength={100} placeholder="Team catch-up" onInput={e => setTitle(e.currentTarget.value)} required /></label>
        <section><h2 className="mb-2 text-sm font-bold">What dates might work?</h2><Calendar dates={dates} onChange={setDates} /></section>
        <section><h2 className="mb-3 text-sm font-bold">What times might work?</h2><div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs font-bold">No earlier than<select className={`${control} mt-2 w-full`} value={startHour} onChange={e => setStartHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label><label className="min-w-0 text-xs font-bold">No later than<select className={`${control} mt-2 w-full`} value={endHour} onChange={e => setEndHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i + 1}>{String(i + 1).padStart(2, "0")}:00</option>)}</select></label></div><div className="mt-4"><ZonePicker value={zone} onChange={setZone} label="Time zone" /></div>{endHour <= startHour && <p className="mt-2 text-xs text-red-700">Choose an end time after the start time.</p>}</section>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || !title.trim() || !dates.length || endHour <= startHour} className={`${primary} w-full py-3`}>{busy ? "Creating…" : "Create poll"}</button>
      </form>
    </div>
  </Shell>;
}

function Grid({ poll, dates, zone, selected, counts, peakAvailability = 0, people, editable, onPaint, scrollRef, onScroll }: { poll: Poll; dates: string[]; zone: string; selected?: Set<number>; counts?: number[]; peakAvailability?: number; people?: { name: string; chosen: Set<number> }[]; editable?: boolean; onPaint?: (index: number, add: boolean) => void; scrollRef?: { current: HTMLDivElement | null }; onScroll?: (left: number) => void }) {
  const perDay = (poll.endHour - poll.startHour) * 4;
  const slots = useMemo(() => dates.flatMap((date, col) =>
    Array.from({ length: perDay }, (_, row) => ({
      index: col * perDay + row,
      ts: timestamp(date, poll.startHour * 60 + row * 15, poll.zone),
    }))
  ), [poll.dates, poll.zone, poll.startHour, poll.endHour]);
  const days = useMemo(() => {
    const byDate = new Map<string, typeof slots>();
    for (const slot of slots) {
      const date = localParts(slot.ts, zone).slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(slot);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
      const occurrences = new Map<string, number>();
      const byTime = new Map<string, (typeof slots)[number]>();
      for (const slot of items.sort((a, b) => a.ts - b.ts)) {
        const time = localParts(slot.ts, zone).slice(11);
        const occurrence = occurrences.get(time) || 0;
        occurrences.set(time, occurrence + 1);
        byTime.set(time + ":" + occurrence, slot);
      }
      return { date, first: items[0].ts, byTime };
    });
  }, [slots, zone]);
  const times = useMemo(() => [...new Set(days.flatMap(day => [...day.byTime.keys()]))].sort(), [days]);
  const drag = useRef<{ add: boolean; touched: Set<number> } | null>(null);
  const [tooltip, setTooltip] = useState<{ index: number; left: number; top: number; pinned: boolean } | null>(null);
  const max = people?.length || 0;
  function showTooltip(target: HTMLElement, index: number, pinned: boolean) {
    const rect = target.getBoundingClientRect();
    setTooltip({
      index,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 228)),
      top: rect.bottom + 136 > window.innerHeight ? Math.max(8, rect.top - 136) : rect.bottom + 6,
      pinned,
    });
  }
  useEffect(() => {
    if (!tooltip?.pinned) return;
    function dismiss(e: PointerEvent) {
      if (!(e.target as HTMLElement).closest("[data-slot]")) setTooltip(null);
    }
    function dismissOnEscape(e: KeyboardEvent) { if (e.key === "Escape") setTooltip(null); }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [tooltip?.pinned]);
  function touch(index: number) {
    if (!drag.current || !onPaint || drag.current.touched.has(index)) return;
    drag.current.touched.add(index);
    onPaint(index, drag.current.add);
  }
  function move(e: PointerEvent) {
    if (!drag.current) return;
    const index = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-slot]") as HTMLElement | null)?.dataset.slot;
    if (index !== undefined) touch(Number(index));
  }
  const columns = "46px repeat(" + days.length + ", minmax(44px, 1fr))";
  return <div ref={scrollRef} onScroll={e => onScroll?.(e.currentTarget.scrollLeft)} className="min-w-0 overflow-x-auto rounded border border-[#d3d3d3] bg-white shadow-sm">
    <div data-grid className="min-w-max select-none" style={{ minWidth: 46 + days.length * 44 }} onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>
      <div className="grid border-b border-[#c5d4e6] bg-[#f7f9fc]" style={{ gridTemplateColumns: columns }}>
        <span className="border-r border-[#d3d3d3]" />
        {days.map(day => <div key={day.date} className="flex h-10 flex-col items-center justify-center border-r border-[#d3d3d3] text-center leading-tight"><span className="text-[10px]">{format(day.first, zone, { month: "short", day: "numeric" })}</span><span className="text-sm">{format(day.first, zone, { weekday: "short" })}</span></div>)}
      </div>
      {times.map((time, row) => {
        const [hour, minute, occurrence] = time.split(":").map(Number);
        const previous = times[row - 1]?.split(":").map(Number);
        const gap = previous ? hour * 60 + minute - (previous[0] * 60 + previous[1]) : 0;
        const showTime = row === 0 || minute === 0 || occurrence > 0 || gap > 15;
        const label = `${hour % 12 || 12} ${hour < 12 ? "am" : "pm"}`;
        return <div key={time} className="grid" style={{ gridTemplateColumns: columns }}>
          <span className={"h-6 border-t border-r border-[#d3d3d3] pr-1 text-right text-[11px] leading-6 text-slate-600 sm:h-[15px] sm:leading-[15px] " + (showTime ? "border-t-[#aab9c9]" : "border-t-[#e3e9f0]")}>{showTime ? label : ""}</span>
          {days.map(day => {
          const slot = day.byTime.get(time);
          if (!slot) return <span key={day.date} className="h-6 border-t border-r border-[#e3e9f0] bg-[#f7f9fc] sm:h-[15px]" />;
          const index = slot.index;
          const count = counts?.[index] || 0;
          const active = selected?.has(index) || false;
          const bg = counts ? count ? "hsl(103 62% " + (92 - 46 * count / Math.max(peakAvailability, 1)) + "%)" : "#f3f5f7" : active ? "#1498e0" : "#dbe8f8";
          const topBorder = counts
            ? showTime ? "border-t-[#aab9c9]" : "border-t-[#e3e9f0]"
            : showTime ? "border-t-[#879eb6]" : "border-t-[#b2c5d9]";
          return <button key={day.date} data-slot={index} type="button" disabled={!editable && !counts}
              aria-label={format(slot.ts, zone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ", " + (counts ? count + " of " + max + " available" : active ? "available" : "unavailable")}
              aria-describedby={counts && tooltip?.index === index ? "availability-tooltip" : undefined}
              aria-pressed={editable ? active : undefined}
              className={"h-6 border-t border-r border-[#cad6e0] focus-visible:shadow-[inset_0_0_0_2px_#f5c04e] sm:h-[15px] " + topBorder + " " + (editable ? "cursor-crosshair hover:shadow-[inset_0_0_0_2px_#f5c04e] touch-none" : "cursor-default")}
              style={{ backgroundColor: bg }}
              onPointerDown={e => { if (!editable || !onPaint || (e.pointerType === "mouse" && e.button !== 0)) return; drag.current = { add: !active, touched: new Set() }; (e.currentTarget.closest("[data-grid]") as HTMLElement)?.setPointerCapture(e.pointerId); touch(index); }}
              onClick={e => { if (editable && onPaint && e.detail === 0) onPaint(index, !active); if (counts) showTooltip(e.currentTarget, index, true); }}
              onPointerEnter={e => { if (counts && e.pointerType !== "touch") showTooltip(e.currentTarget, index, false); }}
              onPointerLeave={e => { if (counts && e.pointerType !== "touch") setTooltip(current => current?.pinned ? current : null); }}
              onFocus={e => { if (counts) showTooltip(e.currentTarget, index, false); }}
              onBlur={() => { if (counts) setTooltip(null); }} />;
        })}
        </div>;
      })}
    </div>
    {counts && tooltip && <div id="availability-tooltip" role="tooltip" className="pointer-events-none fixed z-50 max-h-32 w-[220px] overflow-y-auto rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 shadow-lg" style={{ left: tooltip.left, top: tooltip.top }}>
      <strong className="block">{counts[tooltip.index]} of {max} free</strong>
      <span>{people?.filter(p => p.chosen.has(tooltip.index)).map(p => p.name).join(", ") || "No one yet"}</span>
    </div>}
  </div>;
}
function AvailabilityLegend({ total, peak }: { total: number; peak: number }) {
  return <div className="flex min-w-0 max-w-56 flex-1 items-center gap-1 text-xs text-slate-500"><span className="shrink-0">0/{total}</span><span className="h-3 min-w-0 flex-1 rounded" style={{ background: "linear-gradient(to right, #f3f5f7, #c6e8af, #398f17)" }} /><span className="shrink-0">{peak}/{total}</span></div>;
}
export function PollPage() { return <Gate><PollPageContent /></Gate>; }
function PollPageContent() {
  const { id } = useParams<{ id: string }>();
  const data = client.useQuery("poll", id);
  if (data === undefined) return <Shell><p className="text-sm">Loading poll…</p></Shell>;
  if (!data) return <Shell><h1 className="text-xl font-bold">Poll not found</h1><Link to="/polls" className="text-blue-600 underline">Back to polls</Link></Shell>;
  return <PollDetail key={id} data={data} id={id} />;
}
function PollDetail({ data, id }: { data: PollData; id: string }) {
  const { poll, responses } = data;
  const save = client.useMutation("saveResponse");
  const mine = responses.find(r => r.isMine);
  const [name, setName] = useState(mine?.name || "");
  const [joined, setJoined] = useState(Boolean(mine));
  const [selected, setSelected] = useState<number[]>(() => mine ? JSON.parse(mine.slots) : []);
  const [zone, setZone] = useState(() => canonZone(Intl.DateTimeFormat().resolvedOptions().timeZone || poll.zone));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileView, setMobileView] = useState<"your" | "group">("your");
  const editRevision = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const yourGridScroll = useRef<HTMLDivElement>(null);
  const groupGridScroll = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const dates = JSON.parse(poll.dates) as string[];
  const perDay = (poll.endHour - poll.startHour) * 4;
  const people = useMemo(() => responses.map(r => ({ name: r.name, chosen: new Set(JSON.parse(r.slots) as number[]) })).filter(person => person.chosen.size > 0), [responses]);
  const counts = Array.from({ length: dates.length * perDay }, (_, i) => people.reduce((count, person) => count + (person.chosen.has(i) ? 1 : 0), 0));
  const peakAvailability = counts.reduce((highest, count) => Math.max(highest, count), 0);
  useEffect(() => {
    const activeGrid = mobileView === "your" ? yourGridScroll.current : groupGridScroll.current;
    if (activeGrid) activeGrid.scrollLeft = scrollPosition.current;
  }, [mobileView]);
  useEffect(() => {
    if (!joined || !dirty || !name.trim()) return;
    const revision = editRevision.current;
    const timer = setTimeout(() => {
      setStatus("Saving…");
      saveQueue.current = saveQueue.current.then(() => save(id, name, JSON.stringify(selected))).then(() => {
        if (editRevision.current === revision) {
          setDirty(false);
          setStatus("Saved");
        }
      }).catch(err => setStatus(err instanceof Error ? err.message : "Could not save"));
    }, 600);
    return () => clearTimeout(timer);
  }, [joined, dirty, name, selected.join(","), id]);
  async function join(e: Event) { e.preventDefault(); setBusy(true); setStatus(""); try { await save(id, name, JSON.stringify(selected)); setJoined(true); setStatus("Saved. Paint the grid to add your availability."); } catch (err) { setStatus(err instanceof Error ? err.message : "Could not join"); } finally { setBusy(false); } }
  function paint(index: number, add: boolean) { editRevision.current++; setSelected(old => add ? old.includes(index) ? old : [...old, index] : old.filter(i => i !== index)); setDirty(true); setStatus("Unsaved changes"); }
  function syncScroll(left: number, target: { current: HTMLDivElement | null }) {
    scrollPosition.current = left;
    if (target.current?.getClientRects().length) target.current.scrollLeft = left;
  }
  async function copy() { try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`); setStatus("Link copied"); } catch { setStatus("Copy the page URL to share this poll"); } }
  return <Shell>
    <div className="mx-auto max-w-[1100px] pb-12 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0"><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{poll.title}</h1><p className="mt-2 text-sm text-slate-500">{people.length} {people.length === 1 ? "person has" : "people have"} responded</p></div>
        <button type="button" className={`${primary} shrink-0`} onClick={() => void copy()}>Copy invite link</button>
      </div>
      <div className="mt-5 border-b border-slate-200 pb-5">
        <div className="grid gap-3 min-[430px]:grid-cols-2 min-[430px]:items-end">
          <form onSubmit={e => void join(e)} className="min-w-0"><label className="block text-xs font-bold text-slate-600">Your name<div className="mt-1.5 flex gap-2"><input className={`${control} min-w-0 flex-1`} value={name} maxLength={50} onInput={e => { editRevision.current++; setName(e.currentTarget.value); if (joined) setDirty(true); }} required />{!joined && <button className="shrink-0 rounded border border-[#d0a33b] bg-[#f5c04e] px-3 text-sm font-bold disabled:opacity-50" disabled={busy || !name.trim()}>{busy ? "Joining…" : "Join"}</button>}</div></label></form>
          <ZonePicker value={zone} onChange={setZone} label="Show times in" />
        </div>
        {(status || joined) && <p role="status" className="mt-2 text-xs text-slate-600">{status || "Changes save automatically"}</p>}
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
          <h2 className="text-sm font-bold">{mobileView === "your" ? "Your availability" : "Group availability"}</h2>
          <div className="flex shrink-0 rounded-full bg-slate-100 p-0.5" role="group" aria-label="Availability view">
            <button type="button" aria-pressed={mobileView === "your"} aria-controls="your-availability" className={"rounded-full px-2.5 py-1 text-xs font-bold " + (mobileView === "your" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")} onClick={() => setMobileView("your")}>Your</button>
            <button type="button" aria-pressed={mobileView === "group"} aria-controls="group-availability" className={"rounded-full px-2.5 py-1 text-xs font-bold " + (mobileView === "group" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")} onClick={() => setMobileView("group")}>Group</button>
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-8 sm:grid-cols-2 sm:grid-rows-[auto_auto_auto] sm:gap-x-6 sm:gap-y-0">
          <section id="your-availability" className={(mobileView === "your" ? "" : "hidden ") + "min-w-0 sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-y-0"}>
            <h2 className="hidden text-sm font-bold sm:block sm:text-base lg:text-lg">Your availability</h2>
            <p className="mb-3 mt-1 text-sm text-slate-600">{joined ? "Select or drag to mark your times." : "Join the poll above to mark your times."}</p>
            <Grid poll={poll} dates={dates} zone={zone} selected={new Set(selected)} editable={joined} onPaint={paint} scrollRef={yourGridScroll} onScroll={left => syncScroll(left, groupGridScroll)} />
          </section>
          <section id="group-availability" className={(mobileView === "group" ? "" : "hidden ") + "min-w-0 sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-y-0"}>
            <div className="hidden items-center justify-between gap-1.5 sm:flex">
              <h2 className="whitespace-nowrap text-sm font-bold sm:text-base lg:text-lg">Group availability</h2>
              <AvailabilityLegend total={people.length} peak={peakAvailability} />
            </div>
            <p className="mb-3 mt-1 hidden text-sm text-slate-600 sm:block">Hover over a time to see who's free.</p>
            <div className="mb-3 mt-1 flex items-center justify-between gap-2 sm:hidden"><span className="shrink-0 text-xs text-slate-600">Tap for names</span><AvailabilityLegend total={people.length} peak={peakAvailability} /></div>
            <Grid poll={poll} dates={dates} zone={zone} counts={counts} peakAvailability={peakAvailability} people={people} scrollRef={groupGridScroll} onScroll={left => syncScroll(left, yourGridScroll)} />
          </section>
        </div>
      </div>
    </div>
  </Shell>;
}
