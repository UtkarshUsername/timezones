# Timezones

Compare a time range across cities, or create a group availability poll.

Use it here: https://timezones.lakebed.app

## Group polls

Open **Group polls** to create an event. Click or drag across the calendar to choose up to 14 dates, set a daily time range, then share the poll URL. Participants join with a name and paint 15-minute availability slots. Changes save automatically. The group grid uses a green gradient to show how many people are free, and hovering a slot shows who can attend.

Poll links are accessible to anyone who has the URL; guest sessions protect each person's edits.

Use **Sign in with Google** on any poll page to keep your polls and availability across devices. No OAuth configuration is needed. Guest participation stays available, and signing in transfers your guest polls and responses to your account. If both sessions have answered the same poll, their availability is combined into one response using the guest's current name. Signing out starts a separate guest session.

## Development

```sh
npx lakebed dev
```

The local database resets when the dev server restarts. Use `?lakebed_guest=alice` and `?lakebed_guest=bob` to test separate participants locally.

## Code map

- `client/index.tsx` composes routes. Planner state, saved-state migration, and timeline UI live in `client/planner/`.
- `client/polls/` contains poll pages, session layout, calendar selection, grid projection, and response editing. The editor serializes writes and keeps pending local edits ahead of live query updates.
- `shared/time.ts` owns calendar/timezone conversion. Repeated wall times choose the earlier instant; nonexistent wall times move forward through the DST gap.
- `shared/polls.ts` owns poll validation, limits, stored JSON codecs, and date selection. `server/index.ts` owns Lakebed schema, authorization, queries, writes, and guest upgrade merging.

## Checks

Use Node 22.18 or newer. Pure behavior tests require no dependencies:

```sh
node --import ./tests/register.mjs --test tests/*.test.mjs
```

With `npx lakebed dev` running in another terminal, run the server checks:

```sh
node --test tests/server.integration.mjs
```

The browser checks use Chrome and an existing `playwright-core` installation (1.48 or newer). They test the real local app, including keyboard/pointer input, mobile views, cross-device updates, and overlapping saves:

```sh
node --test tests/browser.integration.mjs
```

If the test tooling is installed outside this directory, set `PLAYWRIGHT_MODULE` to its absolute `playwright-core/index.mjs` path. Set `BROWSER_EXECUTABLE` to use a different Chromium executable. Do not install app dependencies.

Integration checks use `http://localhost:3000` by default; set `LAKEBED_URL` if the dev server uses another address. Test identities and dates are generated per run, so a populated local database does not require a reset. The tests do not complete Google's OAuth flow; guest response merging is covered by the shared availability-union checks.

Before shipping, also run:

```sh
npx lakebed build --json
git diff --check
```
