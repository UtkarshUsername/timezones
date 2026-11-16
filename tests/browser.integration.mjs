import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import test, { after, before } from "node:test";
import { baseURL, openSession } from "./lakebed-session.mjs";

const moduleName = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright-core";
const { chromium } = await import(moduleName);
let browser;
before(async () => {
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
    ? { headless: true, executablePath: process.env.BROWSER_EXECUTABLE }
    : { headless: true, channel: "chrome" });
});
after(async () => { await browser?.close(); });

async function contextFor(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Etc/UTC", ...options });
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], "Browser runtime errors"); });
  return context;
}

async function plannerState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("timezones-planner-v1")));
}

async function drag(page, from, to) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  assert.ok(a && b, "Drag targets must be visible");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

test("planner migrates saved ranges, persists preferences and keeps last-hour selection in view", { timeout: 45_000 }, async t => {
  const context = await contextFor(t, { timezoneId: "Asia/Kolkata" });
  await context.addInitScript(() => {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("timezones-planner-v1", JSON.stringify({
      zones: ["America/New_York", "Etc/UTC"], sourceZone: "America/New_York", date: "2026-11-01", start: "01:30", end: "02:30",
      startTs: Date.parse("2026-11-01T06:30Z"), endTs: Date.parse("2026-11-01T07:30Z"),
    }));
    sessionStorage.setItem("seeded", "1");
  });
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("timezones-planner-v1"))?.range);
  assert.deepEqual((await plannerState(page)).range, { start: Date.parse("2026-11-01T06:30Z"), end: Date.parse("2026-11-01T07:30Z") });
  await page.getByRole("button", { name: "24h", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem("timezones-theme-v1") === "dark");
  await page.reload();
  await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]')?.textContent === "24h");
  assert.equal(await page.getByRole("button", { name: "Dark", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByLabel("Date", { exact: true }).fill("2026-12-31");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("timezones-planner-v1"))?.range.start === Date.parse("2026-12-31T06:30Z"));
  const range = (await plannerState(page)).range;
  await page.getByRole("button", { name: "Remove America/New_York", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("timezones-planner-v1"))?.sourceZone === "Etc/UTC");
  assert.deepEqual((await plannerState(page)).range, range);
  const search = page.getByPlaceholder("Add a city or time zone");
  await search.fill("Kolkata");
  await page.getByRole("button", { name: /IST.*Kolkata/ }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("timezones-planner-v1"))?.zones.includes("Asia/Kolkata"));
  await search.fill("Tokyo");
  await search.press("Escape");
  assert.equal(await page.getByRole("button", { name: /JST.*Tokyo/ }).count(), 0);

  const utcCells = page.getByRole("button", { name: / in UTC$/ });
  const firstLabel = await utcCells.first().getAttribute("aria-label");
  const lastLabel = await utcCells.last().getAttribute("aria-label");
  const lastStart = Date.parse(`${lastLabel.slice(0, 10)}T${lastLabel.slice(11, 16)}Z`);
  await utcCells.last().press("Enter");
  await page.waitForFunction(start => JSON.parse(localStorage.getItem("timezones-planner-v1")).range.start === start, lastStart);
  assert.equal(await utcCells.first().getAttribute("aria-label"), firstLabel);
  await utcCells.nth(43).press("Enter");
  await utcCells.nth(45).press("Shift+Enter");
  await page.waitForFunction(() => {
    const range = JSON.parse(localStorage.getItem("timezones-planner-v1")).range;
    return range.end - range.start === 3 * 3_600_000;
  });
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.waitForFunction(() => Math.abs(JSON.parse(localStorage.getItem("timezones-planner-v1")).range.start - Date.now()) < 900_000);
  await drag(page, utcCells.nth(18), utcCells.nth(20));
  await page.waitForFunction(() => {
    const range = JSON.parse(localStorage.getItem("timezones-planner-v1")).range;
    return range.end - range.start === 2 * 3_600_000;
  });
});

test("planner stays usable when saved state or browser storage is unavailable", { timeout: 30_000 }, async t => {
  const corrupt = await contextFor(t);
  await corrupt.addInitScript(() => {
    if (location.protocol === "http:" || location.protocol === "https:") localStorage.setItem("timezones-planner-v1", '{"zones":["invalid"]}');
  });
  const page = await corrupt.newPage();
  await page.goto(baseURL);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("timezones-planner-v1"))?.range);
  assert.equal((await plannerState(page)).zones.length, 4);
  const blocked = await contextFor(t);
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage unavailable", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage unavailable", "SecurityError"); };
  });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(baseURL);
  await blockedPage.getByRole("button", { name: "Today", exact: true }).click();
  await blockedPage.getByRole("button", { name: "24h", exact: true }).click();
  assert.equal(await blockedPage.getByRole("button", { name: "24h", exact: true }).getAttribute("aria-pressed"), "true");
});

test("poll creation, calendar limits, painting, live edits, mobile views and tooltips work together", { timeout: 60_000 }, async t => {
  const alice = await contextFor(t);
  const page = await alice.newPage();
  await page.goto(new URL("/polls/new", baseURL).href);
  const title = `Browser poll ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Event name").fill(title);
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  const dates = page.locator("button[data-date]:not([disabled])");
  for (let i = 0; i < 14; i++) await dates.nth(i).press("Enter");
  await dates.nth(14).press("Enter");
  assert.equal(await page.locator('button[data-date][aria-pressed="true"]').count(), 14);
  await dates.nth(14).click();
  assert.equal(await page.locator('button[data-date][aria-pressed="true"]').count(), 14);
  await drag(page, dates.nth(0), dates.nth(1));
  assert.equal(await page.locator('button[data-date][aria-pressed="true"]').count(), 12);
  await dates.nth(0).press("Enter");
  await dates.nth(14).click();
  await page.getByLabel("No later than").selectOption("10");
  await page.getByRole("textbox", { name: "Time zone", exact: true }).fill("Etc/UTC");
  await page.getByRole("option").filter({ hasText: "Etc/UTC" }).click();
  await page.getByRole("button", { name: "Create poll", exact: true }).click();
  await page.waitForURL(/\/polls\/(?!new$)[^/?]+$/);
  await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Copy invite link", exact: true }).count(), 1);
  await page.getByLabel("Your name").fill("Alice");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  const cell = index => page.locator(`#your-availability [data-slot="${index}"]`);
  await page.waitForFunction(() => document.querySelector('#your-availability [data-slot="0"]')?.disabled === false);
  await drag(page, cell(0), cell(2));
  await page.waitForFunction(() => document.querySelector('#group-availability [data-slot="1"]')?.getAttribute("aria-label")?.includes("1 of 1 available"));
  assert.equal(await cell(0).getAttribute("aria-pressed"), "true");
  assert.equal(await cell(2).getAttribute("aria-pressed"), "true");

  const otherDevice = await contextFor(t, { storageState: await alice.storageState() });
  const remotePage = await otherDevice.newPage();
  await remotePage.goto(page.url());
  await remotePage.waitForFunction(() => document.querySelector('#your-availability [data-slot="0"]')?.getAttribute("aria-pressed") === "true");
  await remotePage.getByLabel("Your name").fill("Alice updated");
  await page.waitForFunction(() => document.querySelector('form input[maxlength="50"]')?.value === "Alice updated");
  await cell(3).press("Enter");
  await remotePage.waitForFunction(() => document.querySelector('#your-availability [data-slot="3"]')?.getAttribute("aria-pressed") === "true");

  const bob = await contextFor(t);
  const bobPage = await bob.newPage();
  await bobPage.goto(page.url());
  await bobPage.getByLabel("Your name").fill("Bob");
  await bobPage.getByRole("button", { name: "Join", exact: true }).click();
  const bobSlot = bobPage.locator('#your-availability [data-slot="0"]');
  await bobPage.waitForFunction(() => document.querySelector('#your-availability [data-slot="0"]')?.disabled === false);
  await bobSlot.press("Enter");
  await page.waitForFunction(() => document.querySelector('#group-availability [data-slot="0"]')?.getAttribute("aria-label")?.includes("2 of 2 available"));
  const groupCell = page.locator('#group-availability [data-slot="0"]');
  await groupCell.hover();
  assert.match(await page.getByRole("tooltip").textContent(), /Alice updated.*Bob/);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  assert.equal(await page.locator("#your-availability").isVisible(), false);
  assert.equal(await page.locator("#group-availability").isVisible(), true);
  await groupCell.click();
  assert.match(await page.getByRole("tooltip").textContent(), /2 of 2 free/);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("tooltip").count(), 0);
  await page.locator("#group-availability [data-grid]").evaluate(root => { root.parentElement.scrollLeft = 100; });
  await page.getByRole("button", { name: "Your", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#your-availability [data-grid]")?.parentElement.scrollLeft === 100);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#your-availability [data-slot="3"]')?.getAttribute("aria-pressed") === "true");
  assert.equal(await page.getByLabel("Your name").inputValue(), "Alice updated");
});

test("autosave serializes writes and keeps edits made before an older write completes", { timeout: 30_000 }, async t => {
  const guest = `queue-${randomUUID()}`;
  const session = await openSession(guest);
  t.after(() => session.close());
  const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const id = await session.mutate("createPoll", { title: "Save ordering", dates: JSON.stringify([date]), zone: "Etc/UTC", startHour: 9, endHour: 10 });
  await session.mutate("saveResponse", id, "Alice", "[0]");
  const updates = await session.subscribe("poll", id);
  const context = await contextFor(t);
  let holdNext = true;
  let releaseFirst;
  let released = false;
  let concurrent = false;
  const writes = [];
  const held = Promise.withResolvers();
  await context.routeWebSocket(url => url.pathname === "/__lakebed/ws", route => {
    const server = route.connectToServer();
    route.onMessage(message => {
      const frame = JSON.parse(String(message));
      if (frame.op === "mutation.run" && frame.name === "saveResponse") {
        writes.push(frame.args);
        if (holdNext) {
          holdNext = false;
          releaseFirst = () => { released = true; server.send(message); };
          held.resolve();
          return;
        }
        if (!released) concurrent = true;
      }
      server.send(message);
    });
  });
  const page = await context.newPage();
  const url = new URL(`/polls/${id}`, baseURL);
  url.searchParams.set("lakebed_guest", guest);
  await page.goto(url.href);
  await page.waitForFunction(() => document.querySelector('#your-availability [data-slot="0"]')?.getAttribute("aria-pressed") === "true");
  await page.locator('#your-availability [data-slot="1"]').press("Enter");
  const abortHeld = () => held.reject(t.signal.reason);
  t.signal.addEventListener("abort", abortHeld, { once: true });
  try { await held.promise; }
  finally { t.signal.removeEventListener("abort", abortHeld); }
  await page.getByLabel("Your name").fill("Alice latest");
  await page.locator('#your-availability [data-slot="2"]').press("Enter");
  await page.getByRole("status").filter({ hasText: /^Saving…$/ }).waitFor();
  assert.equal(writes.length, 1, "Second save must remain queued until the first completes");
  releaseFirst();
  await updates.waitFor(data => data.responses.some(response => response.name === "Alice latest" && response.slots === "[0,1,2]"));
  await page.getByRole("status").filter({ hasText: /^Saved$/ }).waitFor();
  assert.equal(concurrent, false);
  assert.deepEqual(writes.map(args => [args[1], JSON.parse(args[2])]), [["Alice", [0, 1]], ["Alice latest", [0, 1, 2]]]);
  assert.equal(await page.getByLabel("Your name").inputValue(), "Alice latest");
  await updates.close();
});
