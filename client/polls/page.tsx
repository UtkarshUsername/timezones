import { useMemo, useState } from "preact/hooks";
import { Link, useAuth, useParams } from "lakebed/client";
import { NAME_LENGTH } from "../../shared/polls";
import { canonZone } from "../zones";
import { client } from "./api";
import type { PollData } from "./api";
import { Gate, Shell } from "./session";
import { control, primary } from "./controls";
import { ZonePicker } from "./zone-picker";
import { Grid, AvailabilityLegend } from "./grid";
import { buildGrid, groupAvailability } from "./grid-model";
import { useGridScroll } from "./use-grid-scroll";
import { useResponseEditor } from "./use-response-editor";
export function PollPage() { return <Gate><PollPageContent /></Gate>; }
function PollPageContent() {
  const auth = useAuth();
  const { id } = useParams<{ id: string }>();
  const data = client.useQuery("poll", id);
  if (data === undefined) return <Shell><p className="text-sm">Loading poll…</p></Shell>;
  if (!data) return <Shell><h1 className="text-xl font-bold">Poll not found</h1><Link to="/polls" className="text-blue-600 underline">Back to polls</Link></Shell>;
  return <PollDetail key={`${id}:${auth.userId}`} data={data} id={id} />;
}
function PollDetail({ data, id }: { data: PollData; id: string }) {
  const auth = useAuth();
  const { poll, responses } = data;
  const mine = responses.find(r => r.isMine);
  const defaultName = auth.isSignedIn ? auth.displayName.trim().slice(0, NAME_LENGTH) : "";
  const { name, selected, joined, status, busy, rename, paint, join } = useResponseEditor(id, mine, defaultName);
  const [zone, setZone] = useState(() => canonZone(Intl.DateTimeFormat().resolvedOptions().timeZone || poll.zone));
  const grids = useGridScroll();
  const { view: mobileView, setView: setMobileView } = grids;
  const model = useMemo(() => buildGrid(poll, zone), [poll.dates, poll.zone, poll.startHour, poll.endHour, zone]);
  const availability = useMemo(() => groupAvailability(responses, model.slotCount), [responses, model.slotCount]);
  const { people, peak: peakAvailability } = availability;
  const [shareStatus, setShareStatus] = useState("");
  async function copy() { try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`); setShareStatus("Link copied"); } catch { setShareStatus("Copy the page URL to share this poll"); } }
  return <Shell>
    <div className="mx-auto max-w-[1100px] pb-12 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0"><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{poll.title}</h1><p className="mt-2 text-sm text-slate-500">{people.length} {people.length === 1 ? "person has" : "people have"} responded</p></div>
        <button type="button" className={`${primary} shrink-0`} onClick={() => void copy()}>Copy invite link</button>
      </div>
      <div className="mt-5 border-b border-slate-200 pb-5">
        <div className="grid gap-3 min-[430px]:grid-cols-2 min-[430px]:items-end">
          <form onSubmit={e => void join(e)} className="min-w-0"><label className="block text-xs font-bold text-slate-600">{auth.isSignedIn ? "Display Name" : "Your name"}<div className="mt-1.5 flex gap-2"><input className={`${control} min-w-0 flex-1`} value={name} maxLength={NAME_LENGTH} onInput={e => { setShareStatus(""); rename(e.currentTarget.value); }} required />{!joined && <button className="shrink-0 rounded border border-[#d0a33b] bg-[#f5c04e] px-3 text-sm font-bold disabled:opacity-50" disabled={busy || !name.trim()}>{busy ? "Joining…" : "Join"}</button>}</div></label></form>
          <ZonePicker value={zone} onChange={setZone} label="Show times in" />
        </div>
        {(status || shareStatus || joined) && <p role="status" className="mt-2 text-xs text-slate-600">{shareStatus || status || "Changes save automatically"}</p>}
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
            <Grid model={model} zone={zone} mode={{ kind: "edit", selected: new Set(selected), enabled: joined, onPaint: (index, add) => { setShareStatus(""); paint(index, add); } }} {...grids.your} />
          </section>
          <section id="group-availability" className={(mobileView === "group" ? "" : "hidden ") + "min-w-0 sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-y-0"}>
            <div className="hidden items-center justify-between gap-1.5 sm:flex">
              <h2 className="whitespace-nowrap text-sm font-bold sm:text-base lg:text-lg">Group availability</h2>
              <AvailabilityLegend total={people.length} peak={peakAvailability} />
            </div>
            <p className="mb-3 mt-1 hidden text-sm text-slate-600 sm:block">Hover over a time to see who's free.</p>
            <div className="mb-3 mt-1 flex items-center justify-between gap-2 sm:hidden"><span className="shrink-0 text-xs text-slate-600">Tap for names</span><AvailabilityLegend total={people.length} peak={peakAvailability} /></div>
            <Grid model={model} zone={zone} mode={{ kind: "group", availability }} {...grids.group} />
          </section>
        </div>
      </div>
    </div>
  </Shell>;
}
