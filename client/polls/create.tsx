import { useState } from "preact/hooks";
import { canonZone } from "../../shared/time";
import { TITLE_LENGTH } from "../../shared/polls";
import { client } from "./api";
import { Gate, Shell } from "./session";
import { control, primary } from "./controls";
import { ZonePicker } from "./zone-picker";
import { Calendar } from "./calendar";
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
        <label className="block text-sm font-bold">Event name<input className={`${control} mt-2 w-full py-3`} value={title} maxLength={TITLE_LENGTH} placeholder="Team catch-up" onInput={e => setTitle(e.currentTarget.value)} required /></label>
        <section><h2 className="mb-2 text-sm font-bold">What dates might work?</h2><Calendar dates={dates} onChange={setDates} /></section>
        <section><h2 className="mb-3 text-sm font-bold">What times might work?</h2><div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs font-bold">No earlier than<select className={`${control} mt-2 w-full`} value={startHour} onChange={e => setStartHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label><label className="min-w-0 text-xs font-bold">No later than<select className={`${control} mt-2 w-full`} value={endHour} onChange={e => setEndHour(Number(e.currentTarget.value))}>{Array.from({ length: 24 }, (_, i) => <option value={i + 1}>{String(i + 1).padStart(2, "0")}:00</option>)}</select></label></div><div className="mt-4"><ZonePicker value={zone} onChange={setZone} label="Time zone" /></div>{endHour <= startHour && <p className="mt-2 text-xs text-red-700">Choose an end time after the start time.</p>}</section>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || !title.trim() || !dates.length || endHour <= startHour} className={`${primary} w-full py-3`}>{busy ? "Creating…" : "Create poll"}</button>
      </form>
    </div>
  </Shell>;
}
