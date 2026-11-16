import { capsule, id, mutation, number, query, string, table, userId } from "lakebed/server";
import { MAX_PARTICIPANTS, NAME_LENGTH, SLOT_MINUTES, mergeAvailability, parseDates, parseSlots, slotsPerDay, validatePoll } from "../shared/polls";
import type { CreatePollInput } from "../shared/polls";
export default capsule({
  name: "timezones",
  auth: {
    requireSignIn: false,
    onGuestUpgrade: async (ctx, { guestUserId, userId }) => {
      const guestResponses = await ctx.db.responses.withIndex("by_owner_poll", q => q.eq("ownerId", guestUserId)).collect();
      if (!guestResponses.length) return;
      const accountResponses = await ctx.db.responses.withIndex("by_owner_poll", q => q.eq("ownerId", userId)).collect();
      const accountByPoll = new Map(accountResponses.map(response => [response.pollId, response]));
      for (const guest of guestResponses) {
        const account = accountByPoll.get(guest.pollId);
        if (!account) continue;
        await ctx.db.responses.update(account.id, { name: guest.name, slots: mergeAvailability(account.slots, guest.slots) });
        await ctx.db.responses.delete(guest.id);
      }
    }
  },
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
      const responses = await ctx.db.responses.withIndex("by_poll", q => q.eq("pollId", pollId)).take(MAX_PARTICIPANTS);
      return { poll, responses: responses.map(r => ({ id: r.id, name: r.name, slots: r.slots, isMine: r.ownerId === userId })) };
    })
  },
  mutations: {
    createPoll: mutation(async (ctx, input: CreatePollInput) => {
      const { userId } = ctx.auth.requireIdentity();
      const poll = await ctx.db.polls.insert({ ...validatePoll(input, Date.now()), duration: SLOT_MINUTES, ownerId: userId });
      return poll.id;
    }),
    saveResponse: mutation(async (ctx, pollId: string, name: string, rawSlots: string) => {
      const { userId } = ctx.auth.requireIdentity();
      const poll = await ctx.db.polls.get(pollId);
      if (!poll) throw new Error("Poll not found");
      const cleanName = name.trim().slice(0, NAME_LENGTH);
      if (!cleanName) throw new Error("Enter your name");
      const dates = parseDates(poll.dates);
      const slots = parseSlots(rawSlots);
      if (slots.some(s => s >= dates.length * slotsPerDay(poll))) throw new Error("Invalid availability");
      const existing = await ctx.db.responses.withIndex("by_owner_poll", q => q.eq("ownerId", userId).eq("pollId", pollId)).first();
      if (existing) await ctx.db.responses.update(existing.id, { name: cleanName, slots: JSON.stringify(slots) });
      else {
        const count = await ctx.db.responses.withIndex("by_poll", q => q.eq("pollId", pollId)).count();
        if (count >= MAX_PARTICIPANTS) throw new Error(`This poll has reached ${MAX_PARTICIPANTS} participants`);
        await ctx.db.responses.insert({ pollId, ownerId: userId, name: cleanName, slots: JSON.stringify(slots) });
      }
    })
  }
});

