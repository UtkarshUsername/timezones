export const baseURL = process.env.LAKEBED_URL || "http://localhost:3000";

export async function openSession(guest, origin = baseURL) {
  const url = new URL("/__lakebed/ws", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("lakebed_guest", guest);
  const socket = new WebSocket(url);
  const requests = new Map();
  const subscriptions = new Map();
  let nextId = 0;
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const pending = requests.get(message.id ?? message.requestId);
    if (pending) {
      requests.delete(message.id ?? message.requestId);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message);
    }
    if (message.op === "query.result") subscriptions.get(message.subscriptionId)?.update(message.data);
  });
  socket.addEventListener("close", () => {
    for (const pending of requests.values()) { clearTimeout(pending.timer); pending.reject(new Error("Lakebed connection closed")); }
    requests.clear();
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error(`Cannot connect to ${origin}; start npx lakebed dev first`)), { once: true });
  });

  function request(op, payload) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Timed out: ${op} ${payload.name || ""}`)); }, 10_000);
      requests.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, op, ...payload }));
    });
  }

  async function subscribe(name, ...args) {
    const result = await request("query.subscribe", { name, args });
    let value = result.data;
    const waiters = new Set();
    const subscription = {
      get value() { return value; },
      update(next) {
        value = next;
        for (const waiter of waiters) if (waiter.predicate(value)) {
          clearTimeout(waiter.timer);
          waiters.delete(waiter);
          waiter.resolve(value);
        }
      },
      waitFor(predicate) {
        if (predicate(value)) return Promise.resolve(value);
        return new Promise((resolve, reject) => {
          const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.delete(waiter); reject(new Error(`No matching live update for ${name}`)); }, 10_000) };
          waiters.add(waiter);
        });
      },
      async close() {
        subscriptions.delete(result.subscriptionId);
        for (const waiter of waiters) clearTimeout(waiter.timer);
        await request("query.unsubscribe", { subscriptionId: result.subscriptionId });
      },
    };
    subscriptions.set(result.subscriptionId, subscription);
    return subscription;
  }

  return {
    async mutate(name, ...args) { return (await request("mutation.run", { name, args })).result; },
    async query(name, ...args) {
      const subscription = await subscribe(name, ...args);
      const value = subscription.value;
      await subscription.close();
      return value;
    },
    subscribe,
    close() { socket.close(); },
  };
}
