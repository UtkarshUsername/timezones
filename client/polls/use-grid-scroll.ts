import { useEffect, useRef, useState } from "preact/hooks";

export function useGridScroll() {
  const [view, setView] = useState<"your" | "group">("your");
  const your = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const position = useRef(0);
  useEffect(() => {
    const active = view === "your" ? your.current : group.current;
    if (active) active.scrollLeft = position.current;
  }, [view]);

  function sync(left: number, target: HTMLDivElement | null) {
    position.current = left;
    if (target?.getClientRects().length && target.scrollLeft !== left) target.scrollLeft = left;
  }
  return {
    view, setView,
    your: { scrollRef: your, onScroll: (left: number) => sync(left, group.current) },
    group: { scrollRef: group, onScroll: (left: number) => sync(left, your.current) },
  };
}
