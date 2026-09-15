# Events calendar

`/events` (`app/src/app/events/page.tsx`) is the full local agenda. Default view is chronological agenda. `?view=calendar` shows `EventCalendar`. Query params also carry `date`, `month`, `category`. Event cards link to `/events/[id]`.

## Sub-features

- View switch `div.view-switch[role="group"][aria-label="Event view"]`: buttons **Agenda** and **Calendar** (`aria-pressed`).
- Date nav in `section[aria-label="Calendar controls"]`: previous/next (`aria-label` Previous day / Next day in agenda view, Previous month or day / Next month or day in calendar view), **Today**.
- `section[aria-label="Next seven days"]` day buttons (`aria-pressed`, counts like `3 events` or `Open`; counts ignore the active category filter).
- Category filters `section[aria-label="Filter by category"]`: **All events** plus `EVENT_CATEGORIES` buttons. Rendered only after loading finishes — asserting it during the load window flakes.
- Month widget `section.event-calendar[aria-label="Month calendar"]`: **Previous month** / **Next month** / a second **Today**, day cells `aria-label` like `March 2, has events, today`.
- Results `section[aria-labelledby="events-results-heading"]` with a `{N} shown` counter. Loading / error (`The calendar did not load` + `Try again`) / `No published events yet` / filter empty / `article.event-card` groups.
- Source note link to `/search` (`Describe it in a sentence.`).

## How to get to it (user POV)

Click **Calendar** in primary nav (`a[href="/events"]`). From home, **Open the full calendar**. Direct URL `/events` or `/events?view=calendar`.

## Driving it with Playwright

```bash
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature events-calendar
```

Smoke: `npx playwright test e2e/smoke.spec.ts -g "/events renders"` and `-g "agenda shows at least one verified event"` (the latter **fails** on a legitimately empty inventory — use `drive.mjs` to record `empty` without treating it as a harness bug).

Recipe: `goto /events` → heading `/Plan what's next/i` → `getByRole('button', { name: 'Agenda' })` pressed → wait until loading copy is gone → classify → click **Calendar** → URL matches `view=calendar` → `section[aria-label="Month calendar"]` visible. Optional: `Today` and category **All events**. Open one `a.event-card__title` to `/events/<id>` and expect the title `h1`, `This event is not available`, or `This event did not load` (+ `Try again`; `Checking this event` is its loading state).

## Gotchas

- `Suspense` fallback is `Loading calendar controls…` — wait past it.
- **Two `Today` buttons exist in calendar view** (toolbar + month widget header). Scope `getByRole('button', { name: 'Today' })` inside `section[aria-label="Calendar controls"]` or strict mode fails.
- Calendar day `aria-label`s are English month name + day, not ISO. ISO lives in the `date=` query (`YYYY-MM-DD`).
- Filter empty is `Nothing matches this view`, or `No events on {Weekday, Month D}` when a `date=` is selected (`Clear filters` button appears) — neither is global empty (`No published events yet`).
- Workers=2 in Playwright config is fine against production; do not point two local drive processes at one lock.
