import { useEffect, useRef, useState } from "preact/hooks";
import { gmtLabel, matchingZones, shortZone, zoneCode, zoneOptions } from "../zones";
import { control } from "./controls";
export function ZonePicker({ value, onChange, label }: { value: string; onChange: (zone: string) => void; label: string }) {
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
      {matches.map(z => <button key={z} type="button" role="option" data-zone={z} aria-selected={z === value} className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-[#dbe8f8] focus:bg-[#dbe8f8] focus:outline-none" onPointerDown={e => e.preventDefault()} onClick={() => choose(z)}>
        <span className="flex justify-between gap-2"><span><b>{zoneCode(now, z)}</b> · {shortZone(z)}</span><span className="shrink-0 text-slate-500">{gmtLabel(now, z)}</span></span>
        <span className="block truncate text-slate-500">{z}</span>
      </button>)}
      {matches.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No matches</p>}
    </div>}
  </div>;
}
