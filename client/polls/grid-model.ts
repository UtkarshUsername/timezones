import { localParts, zonedTimestamp } from "../../shared/time";
import { SLOT_MINUTES, parseDates, parseSlots, slotsPerDay } from "../../shared/polls";
import type { PollSchedule } from "../../shared/polls";

type Slot = { index: number; ts: number };
export type GridModel = {
  days: { date: string; first: number; byTime: Map<string, Slot> }[];
  times: string[];
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
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const occurrences = new Map<string, number>();
    const byTime = new Map<string, Slot>();
    for (const slot of items.sort((a, b) => a.ts - b.ts)) {
      const time = localParts(slot.ts, zone).slice(11);
      const occurrence = occurrences.get(time) || 0;
      occurrences.set(time, occurrence + 1);
      byTime.set(`${time}:${occurrence}`, slot);
    }
    return { date, first: items[0].ts, byTime };
  });
  return { days, times: [...new Set(days.flatMap(day => [...day.byTime.keys()]))].sort(), slotCount: slots.length };
}

export function groupAvailability(responses: { name: string; slots: string }[], slotCount: number) {
  const people = responses.map(response => ({ name: response.name, chosen: new Set(parseSlots(response.slots)) }))
    .filter(person => person.chosen.size > 0);
  const counts = Array<number>(slotCount).fill(0);
  for (const person of people) for (const index of person.chosen) if (index < slotCount) counts[index]++;
  return { people, counts, peak: Math.max(0, ...counts) };
}

export type GroupAvailability = ReturnType<typeof groupAvailability>;
