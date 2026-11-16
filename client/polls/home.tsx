import { Link } from "lakebed/client";
import { parseDates } from "../../shared/polls";
import { client } from "./api";
import { Gate, Shell } from "./session";
import { primary } from "./controls";
export function PollsHome() { return <Gate><PollsHomeContent /></Gate>; }

function PollsHomeContent() {
  const polls = client.useQuery("myPolls");
  return <Shell showAllPolls={false}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">Group polls</h1><Link to="/polls/new" className={primary}>Create a poll</Link></div>
    <h2 className="mb-3 border-b border-[#ddd] pb-2 text-sm font-bold">Your polls</h2>
    {polls === undefined ? <p className="text-sm text-gray-500">Loading…</p> : polls.length ? <div className="grid gap-2 sm:grid-cols-2">{polls.map(p => <Link key={p.id} to={`/polls/${p.id}`} className="rounded border border-[#ddd] bg-[#f7f9fc] p-4 hover:border-[#1498e0]"><strong className="block text-base">{p.title}</strong><span className="mt-1 block text-xs text-gray-500">{parseDates(p.dates).length} dates · {p.zone}</span></Link>)}</div> : <p className="rounded border border-dashed border-[#ddd] p-6 text-sm text-gray-500">No polls yet. Create one to start.</p>}
  </Shell>;
}
