# Events calendar

`/events` (`app/src/app/events/page.tsx`) is the full local agenda. Default view is chronological agenda. `?view=calendar` shows `EventCalendar`. Query params also carry `date`, `month`, `category`. Event cards link to `/events/[id]`.

## Sub-features

- View switch `div.view-switch[role="group"][aria-label="Event view"]`: buttons **Agenda** and **Calendar** (`aria-pressed`).
- Date nav in `section[aria-label="Calendar controls"]`: previous/next (`aria-label` Previous day / Previous month or day), **Today**.
- `section[aria-label="Next seven days"]` day buttons (`aria-pressed`, counts like `3 events` or `Open`).
- Category filters `section[aria-label="Filter by category"]`: **All events** plus `EVENT_CATEGORIES` buttons.
- Month widget `section.event-calendar[aria-label="Month calendar"]`: **Previous month** / **Next month**, day cells `aria-label` like `March 2, has events, today`.
- Results `section[aria-labelledby="events-results-heading"]`. Loading / error / `No published events yet` / filter empty / `article.event-card` groups.
- Source note link to `/search` (`Describe it in a sentence.`).

## How to get to it (user POV)

Click **Calendar** in primary nav (`a[href="/events"]`). From home, **Open the full calendar**. Direct URL `/events` or `/events?view=calendar`.

## Driving it with Playwright

```bash
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature events-calendar
```

Smoke: `npx playwright test e2e/smoke.spec.ts -g "/events renders"` and `-g "agenda shows at least one verified event"` (the latter **fails** on a legitimately empty inventory — use `drive.mjs` to record `empty` without treating it as a harness bug).

Recipe: `goto /events` → heading `/Plan what's next/i` → `getByRole('button', { name: 'Agenda' })` pressed → wait until loading copy is gone → classify → click **Calendar** → URL matches `view=calendar` → `section[aria-label="Month calendar"]` visible. Optional: `getByRole('button', { name: 'Today' })`, category **All events**. Open one `a.event-card__title` to `/events/<id>` and expect either the title `h1` or `This event is not available`.

## Gotchas

- `Suspense` fallback is `Loading calendar controls…` — wait past it.
- Calendar day `aria-label`s are English month name + day, not ISO. ISO lives in the `date=` query (`YYYY-MM-DD`).
- Filter empty (`Nothing matches this view`) is not global empty (`No published events yet`).
- Workers=2 in Playwright config is fine against production; do not point two local drive processes at one lock.
