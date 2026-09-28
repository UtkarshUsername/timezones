import { capsule, id, mutation, number, query, string, table, userId } from "lakebed/server";

const MAX_SLOTS = 14 * 24 * 4;
function parseSlots(raw: string): number[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > MAX_SLOTS || !value.every((v) => Number.isSafeInteger(v) && v >= 0 && v < MAX_SLOTS)) throw new Error("Invalid availability");
  return [...new Set(value as number[])].sort((a, b) => a - b);
}
function parseDates(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length < 1 || value.length > 14 || !value.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))) throw new Error("Choose 1 to 14 valid dates");
  return [...new Set(value as string[])].sort();
}
export default capsule({
  name: "timezones",
  auth: { requireSignIn: false },
  schema: {
    polls: table({ title: string(), dates: string(), zone: string(), startHour: number(), endHour: number(), duration: number(), ownerId: userId() }).index("by_owner", ["ownerId"]),
    responses: table({ pollId: id("polls"), ownerId: userId(), name: string(), slots: string() }).index("by_poll", ["pollId"]).index("by_owner_poll", ["ownerId", "pollId"])
  },
  queries: {
    myPolls: query(async (ctx) => {
      const { userId } = ctx.auth.requireIdentity();
      return ctx.db.polls.withIndex("by_owner", q => q.eq("ownerId", userId)).order("desc").take(30);
    }),
    poll: query(async (ctx, pollId: string) => {
      const { userId } = ctx.auth.requireIdentity();
      const poll = await ctx.db.polls.get(pollId);
      if (!poll) return null;
      const responses = await ctx.db.responses.withIndex("by_poll", q => q.eq("pollId", pollId)).take(100);
      return { poll, responses: responses.map(r => ({ id: r.id, name: r.name, slots: r.slots, isMine: r.ownerId === userId })) };
    })
  },
  mutations: {
    createPoll: mutation(async (ctx, input: { title: string; dates: string; zone: string; startHour: number; endHour: number }) => {
      const { userId } = ctx.auth.requireIdentity();
      const title = input.title.trim().slice(0, 100);
      const dates = parseDates(input.dates);
      if (!title || typeof input.zone !== "string" || input.zone.length > 80) throw new Error("Invalid poll");
      try { new Intl.DateTimeFormat("en", { timeZone: input.zone }); } catch { throw new Error("Invalid time zone"); }
      if (!Number.isInteger(input.startHour) || !Number.isInteger(input.endHour) || input.startHour < 0 || input.endHour > 24 || input.endHour <= input.startHour) throw new Error("Invalid time range");
      if (dates.some(d => Date.parse(d) < Date.now() - 86_400_000 || Date.parse(d) > Date.now() + 366 * 86_400_000)) throw new Error("Dates must be within the next year");
      const poll = await ctx.db.polls.insert({ title, dates: JSON.stringify(dates), zone: input.zone, startHour: input.startHour, endHour: input.endHour, duration: 15, ownerId: userId });
      return poll.id;
    }),
    saveResponse: mutation(async (ctx, pollId: string, name: string, rawSlots: string) => {
      const { userId } = ctx.auth.requireIdentity();
      const poll = await ctx.db.polls.get(pollId);
      if (!poll) throw new Error("Poll not found");
      const cleanName = name.trim().slice(0, 50);
      if (!cleanName) throw new Error("Enter your name");
      const dates = parseDates(poll.dates);
      const slotsPerDay = (poll.endHour - poll.startHour) * 4;
      const slots = parseSlots(rawSlots);
      if (slots.some(s => s >= dates.length * slotsPerDay)) throw new Error("Invalid availability");
      const existing = await ctx.db.responses.withIndex("by_owner_poll", q => q.eq("ownerId", userId).eq("pollId", pollId)).first();
      if (existing) await ctx.db.responses.update(existing.id, { name: cleanName, slots: JSON.stringify(slots) });
      else {
        const count = await ctx.db.responses.withIndex("by_poll", q => q.eq("pollId", pollId)).count();
        if (count >= 100) throw new Error("This poll has reached 100 participants");
        await ctx.db.responses.insert({ pollId, ownerId: userId, name: cleanName, slots: JSON.stringify(slots) });
      }
    })
  }
});

