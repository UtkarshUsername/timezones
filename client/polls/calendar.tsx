import { useRef, useState } from "preact/hooks";
import { DAY, dateKey } from "../../shared/time";
import { MAX_DATES, pollDateBounds, selectDates } from "../../shared/polls";
export function Calendar({ dates, onChange }: { dates: string[]; onChange: (dates: string[]) => void }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ anchor: string; add: boolean; original: string[] } | null>(null);
  const { first: today, last } = pollDateBounds(Date.now());
  const start = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const first = Date.UTC(month.getFullYear(), month.getMonth(), 1 - start);
  const cellCount = Math.ceil((start + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => dateKey(first + i * DAY));
  function select(date: string, state: NonNullable<typeof drag.current>) {
    onChange(selectDates(state.original, state.anchor, date, state.add));
  }
  function begin(e: PointerEvent, date: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { anchor: date, add: !dates.includes(date), original: dates };
    root.current?.setPointerCapture(e.pointerId);
    select(date, drag.current);
  }
  function move(e: PointerEvent) {
    if (!drag.current) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-date]");
    const date = target?.dataset.date;
    if (target && root.current?.contains(target) && date && date >= today && date <= last) select(date, drag.current);
  }
  return <div className="rounded-lg border border-[#d9e2ec] bg-[#f7f9fc] p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" className="h-9 w-9 rounded-lg border border-[#d9e2ec] inline-flex items-center justify-center bg-white text-slate-600 hover:border-[#1498e0] hover:text-[#0879bc]" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg></button><strong className="text-[15px]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" className="h-9 w-9 rounded-lg border border-[#d9e2ec] inline-flex items-center justify-center bg-white text-slate-600 hover:border-[#1498e0] hover:text-[#0879bc]" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg></button></div>
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">{"SMTWTFS".split("").map((d, i) => <span key={i}>{d}</span>)}</div>
    <div ref={root} className="mt-2 grid grid-cols-7 gap-1 touch-pan-y" onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>
      {cells.map(date => { const active = dates.includes(date); const outside = new Date(`${date}T12:00:00Z`).getUTCMonth() !== month.getMonth(); const disabled = date < today || date > last; return <button key={date} data-date={date} type="button" disabled={disabled} aria-label={date} aria-pressed={active} className={`h-9 rounded-md border text-xs font-bold touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1498e0] ${active ? "border-[#0879bc] bg-[#1498e0] text-white" : outside ? "border-transparent bg-white text-gray-400" : "border-[#d4dce7] bg-[#e8f0f9] text-slate-800 hover:border-[#1498e0] hover:bg-[#dbe8f8]"} disabled:opacity-30`} onPointerDown={e => begin(e, date)} onClick={e => { if (e.detail === 0) onChange(selectDates(dates, date, date, !active)); }}>{Number(date.slice(-2))}</button>; })}
    </div>
    <p className="mt-3 text-sm text-slate-600"><span className="font-bold text-slate-700">{dates.length} of {MAX_DATES} dates selected</span></p>
  </div>;
}
