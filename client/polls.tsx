import { useMemo, useRef, useState } from "preact/hooks";
import { canAccessApp, createClient, Link, retryAuth, SignInWithGoogle, useAuth, useParams } from "lakebed/client";
import type app from "../server/index";

const client = createClient<typeof app>();
const zones = ["Asia/Kolkata", "Etc/UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
const fmt = (ts: number, zone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: zone, ...options }).format(ts);
function parts(ts: number, zone: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ts);
  const get = (key: string) => p.find(x => x.type === key)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function timestamp(date: string, minute: number, zone: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minute);
  const target = `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const offsets = [wall - 36 * 3600000, wall, wall + 36 * 3600000].map(t => {
    const s = parts(t, zone);
    return Date.parse(`${s}Z`) - t;
  });
  const matches = [...new Set(offsets)].map(o => wall - o).sort((a, b) => a - b);
  return matches.find(t => parts(t, zone) === target) ?? matches.find(t => parts(t, zone) > target) ?? matches[0];
}
function slotsFor(poll: { dates: string; zone: string; startHour: number; endHour: number }) {
  const dates = JSON.parse(poll.dates) as string[];
  return dates.map(date => Array.from({ length: (poll.endHour - poll.startHour) * 4 }, (_, i) => timestamp(date, poll.startHour * 60 + i * 15, poll.zone)));
}
function Gate({ children }: { children: any }) {
  const auth = useAuth();
  if (auth.isLoading) return <main className="p-8">Checking session…</main>;
  if (!canAccessApp()) return <main className="mx-auto max-w-xl p-8"><p role="alert">{auth.error || "Sign in to continue"}</p><button className="mr-3 underline" onClick={() => void retryAuth()}>Retry</button><SignInWithGoogle /></main>;
  return children;
}
function Shell({ children }: { children: any }) {
  return <main className="min-h-screen bg-[#f6f4ef] px-4 py-6 text-[#172b35] sm:px-8" style={{ fontFamily: "Georgia, serif" }}><div className="mx-auto max-w-6xl"><header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[#c9d2ce] pb-5"><Link to="/" className="text-2xl font-bold tracking-tight">Timezones<span className="text-[#d66b41]">.</span></Link><nav className="flex gap-5 text-sm font-bold"><Link to="/">Time planner</Link><Link to="/polls">Group polls</Link></nav></header>{children}</div></main>;
}
export function PollsHome() {
  return <Gate><PollsHomeContent /></Gate>;
}
function PollsHomeContent() {
  const polls = client.useQuery("myPolls");
  return <Shell><div className="mb-12 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bd6040]">Find a shared hour</p><h1 className="text-4xl font-bold sm:text-5xl">Group availability</h1><p className="mt-3 max-w-lg text-[#52616a]">Choose possible dates, share one link, and see when everyone can meet.</p></div><Link to="/polls/new" className="rounded bg-[#173b46] px-6 py-3 font-bold text-white hover:bg-[#245765]">Create a poll →</Link></div><h2 className="mb-4 border-b border-[#c9d2ce] pb-3 text-xl font-bold">Your polls</h2>{polls === undefined ? <p>Loading…</p> : polls.length ? <div className="grid gap-3 sm:grid-cols-2">{polls.map(p => <Link key={p.id} to={`/polls/${p.id}`} className="rounded border border-[#d3dad6] bg-white p-5 shadow-sm hover:border-[#3b807b]"><strong className="block text-lg">{p.title}</strong><span className="mt-2 block text-sm text-[#65747a]">{(JSON.parse(p.dates) as string[]).length} dates · {p.zone}</span></Link>)}</div> : <p className="rounded border border-dashed border-[#b8c8c2] p-8 text-[#65747a]">No polls yet. Create one to start finding a time together.</p>}</Shell>;
}
export function PollCreate() { return <Gate><PollCreateContent /></Gate>; }
function PollCreateContent() {
  const create = client.useMutation("createPoll");
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC");
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [duration, setDuration] = useState(60);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: Event) {
    e.preventDefault(); setError(""); setBusy(true);
    try { const id = await create({ title, dates: JSON.stringify(dates), zone, startHour, endHour, duration }); window.location.assign(`/polls/${id}`); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not create poll"); setBusy(false); }
  }
  const input = "w-full rounded border border-[#b9c9c5] bg-white px-3 py-2 text-base outline-none focus:border-[#327c79]";
  return <Shell><div className="max-w-2xl"><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bd6040]">New group poll</p><h1 className="mb-8 text-4xl font-bold">Which days could work?</h1><form onSubmit={e => void submit(e)} className="space-y-6 rounded border border-[#d4dcd7] bg-white p-5 shadow-sm sm:p-8"><label className="block font-bold">Event name<input className={`${input} mt-2`} value={title} maxLength={100} placeholder="Team catch-up" onInput={e => setTitle(e.currentTarget.value)} required /></label><div><label className="block font-bold" for="poll-date">Candidate dates</label><div className="mt-2 flex gap-2"><input id="poll-date" type="date" className={input} value={date} onInput={e => setDate(e.currentTarget.value)} /><button type="button" className="shrink-0 rounded bg-[#dcebe4] px-4 font-bold" onClick={() => { if (date && !dates.includes(date) && dates.length < 14) setDates([...dates, date].sort()); }}>Add date</button></div><div className="mt-3 flex flex-wrap gap-2">{dates.map(d => <button key={d} type="button" className="rounded bg-[#173b46] px-3 py-1.5 text-sm text-white" onClick={() => setDates(dates.filter(x => x !== d))}>{d} ×</button>)}</div><p className="mt-2 text-xs text-[#65747a]">Choose up to 14 dates within the next year.</p></div><label className="block font-bold">Poll time zone<select className={`${input} mt-2`} value={zone} onChange={e => setZone(e.currentTarget.value)}>{[...new Set([zone, ...zones])].map(z => <option value={z}>{z}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="font-bold">From<select className={`${input} mt-2`} value={startHour} onChange={e => setStartHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i}>{String(i).padStart(2,"0")}:00</option>)}</select></label><label className="font-bold">Until<select className={`${input} mt-2`} value={endHour} onChange={e => setEndHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i+1}>{String(i+1).padStart(2,"0")}:00</option>)}</select></label></div><label className="block font-bold">Meeting length<select className={`${input} mt-2`} value={duration} onChange={e => setDuration(Number(e.currentTarget.value))}>{[15,30,60,90,120].map(n => <option value={n}>{n} minutes</option>)}</select></label>{error && <p role="alert" className="text-[#aa4932]">{error}</p>}<button disabled={busy || !title.trim() || !dates.length || endHour <= startHour} className="rounded bg-[#d66b41] px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Creating…" : "Create and share →"}</button></form></div></Shell>;
}
export function PollPage() { return <Gate><PollPageContent /></Gate>; }
function PollPageContent() {
  const { id } = useParams<{ id: string }>();
  const data = client.useQuery("poll", id);
  if (data === undefined) return <Shell><p>Loading poll…</p></Shell>;
  if (!data) return <Shell><h1 className="text-3xl">Poll not found</h1><Link to="/polls" className="underline">Back to polls</Link></Shell>;
  return <PollDetail key={id} data={data} id={id} />;
}
function PollDetail({ data, id }: { data: any; id: string }) {
  const { poll, responses } = data;
  const save = client.useMutation("saveResponse");
  const mine = responses.find(r => r.isMine);
  const [name, setName] = useState(mine?.name || "");
  const [selected, setSelected] = useState<number[]>(() => mine ? JSON.parse(mine.slots) : []);
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || poll.zone);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const drag = useRef<{ add: boolean; touched: Set<number> } | null>(null);
  const days = useMemo(() => slotsFor(poll), [poll.dates, poll.zone, poll.startHour, poll.endHour]);
  const perDay = (poll.endHour - poll.startHour) * 4;
  const responseSlots = responses.map(r => ({ ...r, chosen: new Set(JSON.parse(r.slots) as number[]) }));
  const counts = Array.from({ length: days.length * perDay }, (_, i) => responseSlots.reduce((n, r) => n + (r.chosen.has(i) ? 1 : 0), 0));
  const selectedSet = new Set(selected);
  const dates = JSON.parse(poll.dates) as string[];
  const durationSlots = poll.duration / 15;
  const suggestions = days.flatMap((day, di) => day.map((ts, si) => ({ ts, index: di * perDay + si, count: Math.min(...counts.slice(di * perDay + si, di * perDay + si + durationSlots)) })).filter((window, si) => si + durationSlots <= perDay && day.slice(si, si + durationSlots).every((t, n) => t === window.ts + n * 900000))).sort((a,b) => b.count - a.count || a.ts - b.ts).slice(0, 5);
  function paint(index: number, add: boolean) { setSelected(old => add ? old.includes(index) ? old : [...old, index] : old.filter(x => x !== index)); setStatus(""); }
  function cellAt(e: PointerEvent) { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-slot]"); return el ? Number((el as HTMLElement).dataset.slot) : null; }
  function move(e: PointerEvent) { const d = drag.current; if (!d) return; const index = cellAt(e); if (index !== null && !d.touched.has(index)) { d.touched.add(index); paint(index, d.add); } }
  async function submit(e: Event) { e.preventDefault(); setBusy(true); setStatus(""); try { await save(id, name, JSON.stringify(selected)); setStatus("Availability saved"); } catch (err) { setStatus(err instanceof Error ? err.message : "Could not save"); } finally { setBusy(false); } }
  async function copy() { try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`); setStatus("Link copied"); } catch { setStatus("Copy the page URL to share this poll"); } }
  return <Shell><div className="mb-7 flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bd6040]">Shared availability</p><h1 className="text-4xl font-bold">{poll.title}</h1><p className="mt-2 text-sm text-[#65747a]">{dates.length} dates · {responses.length} participants · {poll.duration} minute meeting</p></div><button className="rounded border border-[#9bb9ad] bg-white px-4 py-2 font-bold" onClick={() => void copy()}>Copy invite link</button></div><div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_280px]"><section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Your availability</h2><p className="text-sm text-[#65747a]">Tap or drag to mark times you can attend.</p></div><label className="text-sm">View in <select className="ml-1 rounded border border-[#b9c9c5] bg-white p-2" value={zone} onChange={e => setZone(e.currentTarget.value)}>{[...new Set([zone, poll.zone, ...zones])].map(z => <option value={z}>{z}</option>)}</select></label></div><div className="overflow-x-auto rounded border border-[#cbd5cf] bg-white"><div className="flex min-w-max select-none" onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>{days.map((day, di) => <div key={dates[di]} className="w-36 border-r border-[#dbe2dd] last:border-r-0"><div className="sticky top-0 border-b border-[#dbe2dd] bg-[#e8f0e9] p-2 text-center text-sm font-bold">{fmt(day[0], poll.zone, { weekday: "short", month: "short", day: "numeric" })}</div>{day.map((ts, si) => { const index = di * perDay + si; const count = counts[index]; const active = selectedSet.has(index); return <button key={index} data-slot={index} type="button" aria-label={`${fmt(ts, zone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}, ${count} available${active ? ", selected" : ""}`} aria-pressed={active} className={`flex h-7 w-full items-center justify-between border-b border-[#edf0ec] px-2 text-left text-xs touch-none ${active ? "bg-[#257b74] font-bold text-white" : count ? "bg-[#e3f0dc] hover:bg-[#c7e5c2]" : "hover:bg-[#f0f2ed]"}`} onPointerDown={e => { if (e.pointerType === "mouse" && e.button !== 0) return; const add = !active; drag.current = { add, touched: new Set([index]) }; (e.currentTarget.parentElement?.parentElement as HTMLElement)?.setPointerCapture(e.pointerId); paint(index, add); }} onClick={e => { if (e.detail === 0) paint(index, !active); }}><span>{fmt(ts, zone, { hour: "numeric", minute: "2-digit" })}</span><span>{count || ""}</span></button>; })}</div>)}</div></div><p className="mt-2 text-xs text-[#65747a]">Darker cells are yours. Numbers show how many participants are free. Dates follow {poll.zone}; labels display in {zone}.</p><form onSubmit={e => void submit(e)} className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm font-bold">Your name<input className="mt-1 w-full rounded border border-[#b9c9c5] bg-white px-3 py-2" value={name} maxLength={50} onInput={e => setName(e.currentTarget.value)} required /></label><button disabled={busy} className="rounded bg-[#d66b41] px-5 py-2.5 font-bold text-white disabled:opacity-50">{busy ? "Saving…" : mine ? "Update availability" : "Save availability"}</button></form>{status && <p role="status" className="mt-3 text-sm font-bold">{status}</p>}</section><aside className="space-y-5"><div className="rounded border border-[#cbd5cf] bg-white p-5"><h2 className="mb-3 text-lg font-bold">Best windows</h2>{suggestions.length ? suggestions.map((s, i) => <button key={i} type="button" onClick={() => setFocusIndex(s.index)} className={`block w-full border-t border-[#e3e9e3] py-2 text-left text-sm ${focusIndex === s.index ? "text-[#b65130]" : ""}`}><strong className="block">{fmt(s.ts, zone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong><span className="text-[#65747a]">{s.count} of {responses.length} free for {poll.duration} min</span></button>) : <p className="text-sm text-[#65747a]">No windows yet.</p>}{focusIndex !== null && <div className="mt-3 border-t border-[#d9e3dd] pt-3 text-sm"><strong>Available for this window</strong><p className="mt-1 text-[#65747a]">{responseSlots.filter(r => Array.from({ length: durationSlots }, (_, i) => focusIndex + i).every(i => r.chosen.has(i))).map(r => r.name).join(", ") || "No one yet"}</p></div>}</div><div className="rounded border border-[#cbd5cf] bg-white p-5"><h2 className="mb-3 text-lg font-bold">Participants</h2>{responses.length ? <ul className="space-y-2 text-sm">{responses.map(r => <li key={r.id} className="flex justify-between gap-2"><span>{r.name}{r.isMine ? " (you)" : ""}</span><span className="text-[#65747a]">{(JSON.parse(r.slots) as number[]).length} slots</span></li>)}</ul> : <p className="text-sm text-[#65747a]">Share the link to invite people.</p>}</div></aside></div></Shell>;
}



