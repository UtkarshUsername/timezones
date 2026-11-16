import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { openSession } from "./lakebed-session.mjs";

test("real Lakebed sessions isolate ownership and deliver shared live poll updates", { timeout: 30_000 }, async () => {
  const run = randomUUID();
  const alice = await openSession(`alice-${run}`);
  const bob = await openSession(`bob-${run}`);
  const otherDevice = await openSession(`alice-${run}`);
  try {
    assert.deepEqual(await alice.query("myPolls"), []);
    assert.deepEqual(await bob.query("myPolls"), []);
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const input = { title: "  Live poll  ", dates: JSON.stringify([date]), zone: "Etc/UTC", startHour: 9, endHour: 10 };
    const id = await alice.mutate("createPoll", { ...input, ignoredField: "not stored" });
    assert.equal((await alice.query("myPolls"))[0].title, "Live poll");
    assert.deepEqual(await bob.query("myPolls"), []);
    const bobView = await bob.subscribe("poll", id);
    const deviceView = await otherDevice.subscribe("poll", id);
    assert.equal(bobView.value.poll.title, "Live poll");
    assert.equal(bobView.value.responses.length, 0);

    await alice.mutate("saveResponse", id, "  Alice  ", "[0,1,1]");
    await bobView.waitFor(data => data.responses.some(response => response.name === "Alice"));
    await deviceView.waitFor(data => data.responses.some(response => response.isMine && response.slots === "[0,1]"));
    assert.equal(bobView.value.responses[0].isMine, false);
    await bob.mutate("saveResponse", id, "Bob", "[2]");
    await bob.mutate("saveResponse", id, "Bob updated", "[3]");
    await deviceView.waitFor(data => data.responses.some(response => response.name === "Bob updated"));
    const shared = await alice.query("poll", id);
    assert.equal(shared.responses.length, 2);
    assert.equal(shared.responses.find(response => response.isMine).slots, "[0,1]");
    assert.equal(shared.responses.find(response => !response.isMine).slots, "[3]");

    await assert.rejects(bob.mutate("saveResponse", id, "Bob", "[4]"), /Invalid availability/);
    await assert.rejects(bob.mutate("saveResponse", id, " ", "[]"), /Enter your name/);
    await assert.rejects(alice.mutate("createPoll", { ...input, dates: '["2026-02-30"]' }), /valid dates/);
    await assert.rejects(alice.mutate("createPoll", { ...input, startHour: 10, endHour: 9 }), /Invalid time range/);
    await assert.rejects(bob.mutate("saveResponse", "missing-poll", "Bob", "[]"), /Poll not found/);
    assert.equal((await bob.query("poll", id)).responses.find(response => response.isMine).slots, "[3]");
    await bobView.close();
    await deviceView.close();
  } finally { alice.close(); bob.close(); otherDevice.close(); }
});
