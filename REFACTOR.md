# Untangle decision log

Scope: the whole capsule, including comment and test cleanup. Preserve intended
behavior and stored records. Do not deploy. Work on `refactor/untangle-codebase`.
The pre-existing copy-link removal was discarded at the user's request.

## Inventory before implementation

All tracked app files, ignored historical check scripts, and feature history were
read before edits. Baseline: `npx lakebed build --json` and the existing guest API
check pass (the latter needed its expired hard-coded date replaced at runtime).
There are no tracked tests. History repeatedly couples time conversion, saved
ranges, grid presentation, response ownership, and response synchronization.

## Decisions and the problems they solve

- Put time conversion and calendar primitives in `shared/time.ts`, with one
  cached formatter boundary and one explicit DST resolution policy.
  - Hidden link: `client/index.tsx:43` and `client/polls.tsx:34` independently
    resolve wall-clock time using the same three-offset algorithm, with different
    fallback choices.
  - Hidden link: date keys, local parts, formatter caches, offsets, and time
    formatting are scattered across both components and `client/zones.ts`.
  - Special cases: nonexistent and repeated local times need a deliberate policy;
    normalized date rollover must also handle minutes outside a calendar day.
  - Surplus: repeated formatter construction and redundant day-key formatting.
- Define poll constraints, stored-value codecs, slot indexing, and calendar
  selection together in `shared/polls.ts`. Keep authorization and persistence
  in the Lakebed server definition.
  - Hidden link: 14 dates, 15-minute slots, four slots per hour, 100 participants,
    name/title limits, and the date horizon recur in unrelated UI/server code.
  - Hidden link: client `Poll`/`Response` declarations and raw JSON parsing know
    the database encoding independently of server validation.
  - Special case: calendar pointer selection enforces 14 dates, while keyboard
    selection bypasses that rule (`client/polls.tsx:167`).
  - Special case: date validation accepts rolled-over calendar dates because it
    checks parseability rather than a canonical date.
  - Surplus: `shared/todo.ts` is an unused starter artifact. `duration` is written
    but never read; retain its schema for stored-record compatibility and derive
    its value from the slot duration rule.
- Give planner range/state normalization one owner in `client/planner/`, and
  keep persistence at the browser boundary.
  - Hidden link: date/start/end/sourceZone/startTs/endTs must all agree, but
    goToday, selection, removal, date changes and loading update them separately.
  - Special cases: legacy saved data without end/timestamps, spring-gap range
    fallback, and repeated catch-and-ignore around invalid state.
  - Needless link: routing, storage migration, pointer gestures and timeline
    rendering all live in `client/index.tsx`.
  - Surplus: duplicate midnight/ordinary hour button shells and keyboard handlers.
  - Special case: a disabled exhaustive-deps comment conceals intentional scroll
    behavior. Express the centering trigger separately from selection updates.
- Colocate poll pages, session layout, calendar, grid model and editor by feature
  under `client/polls/`; leave `client/index.tsx` as route composition.
  - Needless link: every poll change reads the same 430-line module, including
    authentication, creation, viewing, calendar and persistence behavior.
  - Needless link: `children: any` loses the component contract.
  - Hidden link: the grid takes both `poll.dates` and decoded `dates` but memoizes
    from only one, and both rendered grids independently build identical slots.
  - Needless link: Grid has a collection of optional editing and aggregation
    parameters permitting inconsistent mode combinations.
  - Hidden link: group counts, participants, and peak shading must agree but are
    passed independently. Make one derived group summary own them.
  - Hidden link: scroll refs, active mobile view and remembered scroll position
    cooperate through conventions; encapsulate synchronized-grid behavior.
  - Hidden link (independent audit): document-wide drag hit tests and tooltip
    dismissal accept cells from other grids. Scope them to the gesture root.
- Give poll response editing one hook with a revision-aware serialized save path
  used by both joining and autosaving.
  - Hidden link: name edits and painting must increment editRevision and mark
    dirty independently, while reconciliation must know busy and joined state.
  - Hidden link: queued autosaves and direct join saves bypass each other's
    ordering; stale completion/status must not overwrite a newer edit.
  - Special cases: 600ms debounce is a deliberate autosave policy, not a readiness
    workaround. Keep it. No arbitrary sleeps or automatic retries are required.
  - Special case: live updates may replace clean drafts but must preserve pending
    local edits. Identity changes remount the editor to isolate accounts.
- Keep real compatibility and interaction requirements explicit.
  - Preserve Calcutta/Kolkata normalization, IST display, and reversed IANA
    `Etc/GMT` signs. These reflect external timezone names/display requirements.
  - Preserve fallbacks for unavailable browser storage, guard invalid persisted
    input at load, and report actual save/auth failures.
  - Preserve pointer versus keyboard activation, touch tap versus horizontal
    scrolling, secondary mouse-button guards, pinned/hover tooltips, missing
    cells after timezone conversion, and duplicate local-time occurrence keys.
  - Preserve public-by-link poll reads, private owner-filtered poll lists and
    response writes, guest reference transfer, and duplicate-response merge.
  - Preserve responsive mobile/desktop layout and scroll continuity.
- Clean comments and tests after structural work.
  - Surplus: JSX section labels and comments restating implementation.
  - Historical ignored checks depend on source-text slicing, a removed debug
    query, specific ports, hard-coded past dates and duplicated WS harnesses.
    Replace their useful regression coverage with maintained behavioral tests;
    leave ignored personal artifacts untouched.

## Verification and review

Pending: cohesive implementation commits, current build, pure domain behavior
tests, real Lakebed guest isolation and reactive response checks, browser behavior
checks, and independent subagent reviews of the final dependency graph and cases.
Any new worthwhile review finding is recorded here before its fix.
