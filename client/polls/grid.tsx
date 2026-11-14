import { useEffect, useRef, useState } from "preact/hooks";
import { formatInZone } from "../../shared/time";
import { SLOT_MINUTES } from "../../shared/polls";
import type { GridModel, GroupAvailability } from "./grid-model";

type GridMode = { kind: "edit"; selected: Set<number>; enabled: boolean; onPaint: (index: number, add: boolean) => void }
  | { kind: "group"; availability: GroupAvailability };
export function Grid({ model, zone, mode, scrollRef, onScroll }: {
  model: GridModel;
  zone: string;
  mode: GridMode;
  scrollRef: { current: HTMLDivElement | null };
  onScroll: (left: number) => void;
}) {
  const { days, times } = model;
  const group = mode.kind === "group" ? mode.availability : undefined;
  const counts = group?.counts;
  const people = group?.people;
  const peakAvailability = group?.peak || 0;
  const editable = mode.kind === "edit" && mode.enabled;
  const selected = mode.kind === "edit" ? mode.selected : undefined;
  const onPaint = mode.kind === "edit" ? mode.onPaint : undefined;
  const root = useRef<HTMLDivElement>(null);
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
      if (!root.current?.contains(e.target as Node) || !(e.target as Element).closest("[data-slot]")) setTooltip(null);
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
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-slot]");
    if (target && root.current?.contains(target)) touch(Number(target.dataset.slot));
  }
  const columns = "46px repeat(" + days.length + ", minmax(44px, 1fr))";
  return <div ref={scrollRef} onScroll={e => onScroll?.(e.currentTarget.scrollLeft)} className="min-w-0 overflow-x-auto rounded border border-[#d3d3d3] bg-white shadow-sm">
    <div ref={root} data-grid className="min-w-max select-none" style={{ minWidth: 46 + days.length * 44 }} onPointerMove={move} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>
      <div className="grid border-b border-[#c5d4e6] bg-[#f7f9fc]" style={{ gridTemplateColumns: columns }}>
        <span className="border-r border-[#d3d3d3]" />
        {days.map(day => <div key={day.date} className="flex h-10 flex-col items-center justify-center border-r border-[#d3d3d3] text-center leading-tight"><span className="text-[10px]">{formatInZone(day.first, zone, { month: "short", day: "numeric" }, "en-US")}</span><span className="text-sm">{formatInZone(day.first, zone, { weekday: "short" }, "en-US")}</span></div>)}
      </div>
      {times.map((time, row) => {
        const [hour, minute, occurrence] = time.split(":").map(Number);
        const previous = times[row - 1]?.split(":").map(Number);
        const gap = previous ? hour * 60 + minute - (previous[0] * 60 + previous[1]) : 0;
        const showTime = row === 0 || minute === 0 || occurrence > 0 || gap > SLOT_MINUTES;
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
              aria-label={formatInZone(slot.ts, zone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "en-US") + ", " + (counts ? count + " of " + max + " available" : active ? "available" : "unavailable")}
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
export function AvailabilityLegend({ total, peak }: { total: number; peak: number }) {
  return <div className="flex min-w-0 max-w-56 flex-1 items-center gap-1 text-xs text-slate-500"><span className="shrink-0">0/{total}</span><span className="h-3 min-w-0 flex-1 rounded" style={{ background: "linear-gradient(to right, #f3f5f7, #c6e8af, #398f17)" }} /><span className="shrink-0">{peak}/{total}</span></div>;
}
