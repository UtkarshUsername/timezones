import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { canAccessApp, createClient, Link, retryAuth, SignInWithGoogle, useAuth, useParams } from "lakebed/client";
import type app from "../server/index";

const client = createClient<typeof app>();
const zones = ["Asia/Kolkata", "Etc/UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
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

function Gate({ children }: { children: any }) {
  const auth = useAuth();
  if (auth.isLoading) return <main className="p-6">Checking session…</main>;
  if (!canAccessApp()) return <main className="mx-auto max-w-xl p-6"><p role="alert">{auth.error || "Sign in to continue"}</p><button className="mr-3 underline" onClick={() => void retryAuth()}>Retry</button><SignInWithGoogle /></main>;
  return children;
}
function Shell({ children }: { children: any }) {
  return <main className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "Verdana, Arial, Helvetica, sans-serif" }}>
    <div className="mx-auto max-w-[1100px] px-3 py-4">
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-sm">
        <Link to="/" className="text-lg font-bold tracking-tight text-black">Timezones</Link>
        <div className="flex items-center gap-2"><Link to="/" className="rounded border border-[#ddd] px-3 py-2 font-bold hover:bg-[#dbe8f8]">Time planner</Link><Link to="/polls" className="rounded bg-[#f5c04e] px-3 py-2 font-bold text-black">Group polls</Link></div>
      </nav>
      {children}
    </div>
  </main>;
}

export function PollsHome() { return <Gate><PollsHomeContent /></Gate>; }
function PollsHomeContent() {
  const polls = client.useQuery("myPolls");
  return <Shell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Group polls</h1><p className="mt-1 text-sm text-gray-500">Find a time that works for everyone.</p></div><Link to="/polls/new" className={primary}>Create a poll</Link></div>
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
    <div className="mb-3 flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" className="h-9 w-9 rounded-lg border border-[#d9e2ec] bg-white text-base hover:border-[#1498e0]" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button><strong className="text-[15px]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" className="h-9 w-9 rounded-lg border border-[#d9e2ec] bg-white text-base hover:border-[#1498e0]" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">{"SMTWTFS".split("").map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="mt-2 grid grid-cols-7 gap-1 touch-pan-y" onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>
      {cells.map(date => { const active = dates.includes(date); const outside = new Date(`${date}T12:00:00Z`).getUTCMonth() !== month.getMonth(); const disabled = date < today || date > last; return <button key={date} data-date={date} type="button" disabled={disabled} aria-label={date} aria-pressed={active} className={`h-9 rounded-md border text-xs font-bold touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1498e0] ${active ? "border-[#0879bc] bg-[#1498e0] text-white" : outside ? "border-transparent bg-white text-gray-400" : "border-[#d4dce7] bg-[#e8f0f9] text-slate-800 hover:border-[#1498e0] hover:bg-[#dbe8f8]"} disabled:opacity-30`} onPointerDown={e => begin(e, date)} onClick={e => { if (e.detail === 0) onChange(active ? dates.filter(d => d !== date) : [...dates, date].sort()); }}>{Number(date.slice(-2))}</button>; })}
    </div>
    <p className="mt-3 text-xs text-slate-500">Click or drag to select · <span className="font-bold text-slate-700">{dates.length} of 14 dates</span></p>
  </div>;
}

export function PollCreate() { return <Gate><PollCreateContent /></Gate>; }
function PollCreateContent() {
  const create = client.useMutation("createPoll");
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC");
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
      <Link to="/polls" className="text-xs font-bold text-[#0879bc] hover:underline">← Group polls</Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Create a group poll</h1>
      <p className="mt-1 text-sm text-slate-500">Pick possible dates and times, then share the link.</p>
      <form onSubmit={e => void submit(e)} className="mt-7 space-y-6">
        <label className="block text-sm font-bold">Event name<input className={`${control} mt-2 w-full py-3`} value={title} maxLength={100} placeholder="Team catch-up" onInput={e => setTitle(e.currentTarget.value)} required /></label>
        <section><h2 className="mb-2 text-sm font-bold">What dates might work?</h2><Calendar dates={dates} onChange={setDates} /></section>
        <section><h2 className="mb-3 text-sm font-bold">What times might work?</h2><div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs font-bold">No earlier than<select className={`${control} mt-2 w-full`} value={startHour} onChange={e => setStartHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label><label className="min-w-0 text-xs font-bold">No later than<select className={`${control} mt-2 w-full`} value={endHour} onChange={e => setEndHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i + 1}>{String(i + 1).padStart(2, "0")}:00</option>)}</select></label></div><label className="mt-4 block text-xs font-bold">Time zone<select className={`${control} mt-2 w-full`} value={zone} onChange={e => setZone(e.currentTarget.value)}>{[...new Set([zone, ...zones])].map(z => <option value={z}>{z}</option>)}</select></label>{endHour <= startHour && <p className="mt-2 text-xs text-red-700">Choose an end time after the start time.</p>}</section>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || !title.trim() || !dates.length || endHour <= startHour} className={`${primary} w-full py-3`}>{busy ? "Creating…" : "Create poll →"}</button>
      </form>
    </div>
  </Shell>;
}

function Grid({ poll, dates, zone, selected, counts, people, editable, onPaint }: { poll: Poll; dates: string[]; zone: string; selected?: Set<number>; counts?: number[]; people?: { name: string; chosen: Set<number> }[]; editable?: boolean; onPaint?: (index: number, add: boolean) => void }) {
  const perDay = (poll.endHour - poll.startHour) * 4;
  const rows = Array.from({ length: perDay }, (_, i) => i);
  const slots = useMemo(() => dates.map(date => rows.map(row => timestamp(date, poll.startHour * 60 + row * 15, poll.zone))), [poll.dates, poll.zone, poll.startHour, poll.endHour]);
  const drag = useRef<{ anchor: number; add: boolean; touched: Set<number> } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = people?.length || 0;
  function touch(index: number) { const d = drag.current; if (!d || !onPaint) return; const firstCol = Math.floor(d.anchor / perDay); const lastCol = Math.floor(index / perDay); const firstRow = d.anchor % perDay; const lastRow = index % perDay; for (let col = Math.min(firstCol, lastCol); col <= Math.max(firstCol, lastCol); col++) { for (let row = Math.min(firstRow, lastRow); row <= Math.max(firstRow, lastRow); row++) { const candidate = col * perDay + row; if (!d.touched.has(candidate)) { d.touched.add(candidate); onPaint(candidate, d.add); } } } }
  function move(e: PointerEvent) {
    if (!drag.current) return;
    const index = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-slot]") as HTMLElement | null)?.dataset.slot;
    if (index !== undefined) touch(Number(index));
  }
  return <div className="min-w-0 overflow-x-auto rounded border border-[#d3d3d3] bg-white shadow-sm"><div className="min-w-max select-none" style={{ width: "100%", minWidth: 58 + dates.length * 65 }} onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>
    <div className="grid border-b border-[#c5d4e6] bg-[#f7f9fc]" style={{ gridTemplateColumns: `58px repeat(${dates.length}, minmax(65px, 1fr))` }}><span className="border-r border-[#ddd]" />{dates.map(d => <div key={d} className="border-r border-[#ddd] px-1 py-2 text-center text-[11px] font-bold"><span className="block">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short" })}</span>{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>)}</div>
    {rows.map(row => <div key={row} className="grid" style={{ gridTemplateColumns: `58px repeat(${dates.length}, minmax(65px, 1fr))` }}><div className={`h-[15px] border-r border-[#ddd] pr-1 text-right text-[10px] leading-[15px] text-gray-600 ${row % 4 === 0 ? "border-t border-[#aab9c9]" : ""}`}>{row % 4 === 0 ? format(slots[0][row], zone, { hour: "numeric" }) : ""}</div>{dates.map((date, col) => { const index = col * perDay + row; const count = counts?.[index] || 0; const active = selected?.has(index) || false; const ts = slots[col][row]; const bg = counts ? count ? `hsl(103 62% ${92 - 46 * count / Math.max(max, 1)}%)` : "#f3f5f7" : active ? "#1498e0" : "#dbe8f8"; return <button key={date} data-slot={index} type="button" disabled={!editable && !counts} aria-label={`${format(ts, zone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}, ${counts ? `${count} of ${max} available` : active ? "available" : "unavailable"}`} aria-pressed={editable ? active : undefined} className={`h-[15px] border-r border-[#cad6e0] ${row % 4 === 0 ? "border-t border-[#aab9c9]" : "border-t border-[#e3e9f0]"} ${editable ? "cursor-crosshair hover:outline hover:outline-2 hover:outline-[#f5c04e] touch-none" : "cursor-default"}`} style={{ backgroundColor: bg }} onPointerDown={e => { if (!editable || !onPaint || (e.pointerType === "mouse" && e.button !== 0)) return; drag.current = { anchor: index, add: !active, touched: new Set([index]) }; (e.currentTarget.parentElement?.parentElement as HTMLElement)?.setPointerCapture(e.pointerId); onPaint(index, !active); }} onClick={e => { if (editable && onPaint && e.detail === 0) onPaint(index, !active); }} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} />; })}</div>)}
    {counts && hover !== null && <p className="sticky bottom-0 border-t border-[#ddd] bg-white px-2 py-1 text-xs">{counts[hover]} of {max} free · {people?.filter(p => p.chosen.has(hover)).map(p => p.name).join(", ") || "No one yet"}</p>}
  </div></div>;
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
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || poll.zone);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const dates = JSON.parse(poll.dates) as string[];
  const perDay = (poll.endHour - poll.startHour) * 4;
  const people = useMemo(() => responses.map(r => ({ name: r.name, chosen: new Set(JSON.parse(r.slots) as number[]) })), [responses]);
  const counts = Array.from({ length: dates.length * perDay }, (_, i) => people.reduce((count, person) => count + (person.chosen.has(i) ? 1 : 0), 0));
  useEffect(() => {
    if (!joined || !dirty || !name.trim()) return;
    const timer = setTimeout(() => { setStatus("Saving…"); void save(id, name, JSON.stringify(selected)).then(() => { setDirty(false); setStatus("Saved"); }).catch(err => setStatus(err instanceof Error ? err.message : "Could not save")); }, 600);
    return () => clearTimeout(timer);
  }, [joined, dirty, name, selected.join(","), id]);
  async function join(e: Event) { e.preventDefault(); setBusy(true); setStatus(""); try { await save(id, name, JSON.stringify(selected)); setJoined(true); setStatus("Saved. Paint the grid to add your availability."); } catch (err) { setStatus(err instanceof Error ? err.message : "Could not join"); } finally { setBusy(false); } }
  function paint(index: number, add: boolean) { setSelected(old => add ? old.includes(index) ? old : [...old, index] : old.filter(i => i !== index)); setDirty(true); setStatus("Unsaved changes"); }
  async function copy() { try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`); setStatus("Link copied"); } catch { setStatus("Copy the page URL to share this poll"); } }
  return <Shell>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{poll.title}</h1><p className="mt-1 text-xs text-gray-500">{dates.length} dates · {responses.length} participants · {poll.zone}</p></div><button type="button" className={primary} onClick={() => void copy()}>Copy invite link</button></div>
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-[#ddd] bg-[#f7f9fc] p-3"><form onSubmit={e => void join(e)} className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold">Your name<input className={`${control} mt-1 block w-44`} value={name} maxLength={50} onInput={e => { setName(e.currentTarget.value); if (joined) setDirty(true); }} required /></label>{!joined && <button className="rounded border border-[#d0a33b] bg-[#f5c04e] px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={busy || !name.trim()}>{busy ? "Joining…" : "Join poll"}</button>}</form><label className="text-xs font-bold">View time zone<select className={`${control} mt-1 block max-w-[210px]`} value={zone} onChange={e => setZone(e.currentTarget.value)}>{[...new Set([zone, poll.zone, ...zones])].map(z => <option value={z}>{z}</option>)}</select></label><span role="status" className="pb-2 text-xs text-gray-500">{status || (joined ? "Changes save automatically" : "Enter your name to start")}</span></div>
    <div className="grid gap-4 lg:grid-cols-2"><section className="min-w-0"><h2 className="mb-1 text-base font-bold">Your availability</h2><p className="mb-2 text-xs text-gray-500">{joined ? "Click or drag to paint available times. Changes save automatically." : "Join the poll to paint your availability."}</p><Grid poll={poll} dates={dates} zone={zone} selected={new Set(selected)} editable={joined} onPaint={paint} /></section><section className="min-w-0"><h2 className="mb-1 text-base font-bold">Group availability</h2><p className="mb-2 text-xs text-gray-500">Darker green means more people can attend. Hover to see who.</p><Grid poll={poll} dates={dates} zone={zone} counts={counts} people={people} /><div className="mt-2 flex items-center gap-2 text-xs text-gray-500"><span>0/{responses.length}</span><span className="h-3 flex-1 rounded" style={{ background: "linear-gradient(to right, #f3f5f7, #c6e8af, #398f17)" }} /><span>{responses.length}/{responses.length}</span></div></section></div>
    <p className="mt-4 text-xs text-gray-500">Grid dates follow {poll.zone}. Time labels are shown in {zone}. Share the link to collect more responses.</p>
  </Shell>;
}
