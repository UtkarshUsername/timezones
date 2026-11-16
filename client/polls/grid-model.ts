import { localParts, zonedTimestamp } from "../../shared/time";
import { SLOT_MINUTES, parseDates, parseSlots, slotsPerDay } from "../../shared/polls";
import type { PollSchedule } from "../../shared/polls";

type Slot = { index: number; ts: number };
type TimeRow = { key: string; hour: number; minute: number; occurrence: number };
export type GridModel = {
  zone: string;
  days: { date: string; first: number; byTime: Map<string, Slot> }[];
  times: TimeRow[];
  slotCount: number;
};

export function buildGrid(poll: PollSchedule, zone: string): GridModel {
  const perDay = slotsPerDay(poll);
  const dates = parseDates(poll.dates);
  const slots = dates.flatMap((date, column) => Array.from({ length: perDay }, (_, row) => ({
    index: column * perDay + row,
    ts: zonedTimestamp(date, poll.startHour * 60 + row * SLOT_MINUTES, poll.zone),
  })));
  const byDate = new Map<string, Slot[]>();
  for (const slot of slots) {
    const date = localParts(slot.ts, zone).slice(0, 10);
    const items = byDate.get(date) || [];
    items.push(slot);
    byDate.set(date, items);
  }
  const rows = new Map<string, TimeRow>();
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const occurrences = new Map<string, number>();
    const byTime = new Map<string, Slot>();
    for (const slot of items.sort((a, b) => a.ts - b.ts)) {
      const time = localParts(slot.ts, zone).slice(11);
      const occurrence = occurrences.get(time) || 0;
      occurrences.set(time, occurrence + 1);
      const key = `${time}:${occurrence}`;
      const [hour, minute] = time.split(":").map(Number);
      rows.set(key, { key, hour, minute, occurrence });
      byTime.set(key, slot);
    }
    return { date, first: items[0].ts, byTime };
  });
  const times = [...rows.values()].sort((a, b) => a.hour - b.hour || a.minute - b.minute || a.occurrence - b.occurrence);
  return { zone, days, times, slotCount: slots.length };
}

export function groupAvailability(responses: { name: string; slots: string }[], slotCount: number) {
  const people = responses.map(response => ({ name: response.name, chosen: new Set(parseSlots(response.slots)) }))
    .filter(person => person.chosen.size > 0);
  const counts = Array<number>(slotCount).fill(0);
  for (const person of people) for (const index of person.chosen) if (index < slotCount) counts[index]++;
  return { people, counts, peak: Math.max(0, ...counts) };
}

export type GroupAvailability = ReturnType<typeof groupAvailability>;
