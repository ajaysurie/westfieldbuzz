# Homepage this week

The home route `/` (`app/src/app/page.tsx`) is the events-first landing: a week dateline, watercolor hero, sentence search (`HomeSearch`), chronological "This week, in order" groups of `EventCard`, and the Friday email strip. Directory is not in this layout.

`page.tsx` is an **async server component** (`export const dynamic = "force-dynamic"`) that awaits `getPublicEvents` for a window of today → today+8 days (limit 80) and passes serialized events to `HomeContent`. Agenda markup — populated or empty — is in the SSR HTML; `curl` already shows the settled state and there is no client loading or error copy to wait out.

## Sub-features

- Hero copy and `#home-search` (`form.event-search-form`, submit `aria-label="Search local events"`, `minLength={2} required`). Starter chips under `[aria-label="Suggested searches"]` (`Rainy-day ideas for kids`, `Free this weekend`, `A low-key date night`) store a sessionStorage handoff and go to `/search`.
- Week preview `#week-heading` inside `section[aria-labelledby="week-heading"]`. Two states only: populated (`article.event-card` with `a.event-card__title` and footer `Verified …` or `Source verification pending`, capped at 4 day-groups) or empty (`No events listed this week` + `See the full calendar for events later this month.` + link `Browse the calendar` → `/events`, inside `div.state-panel`).
- Link `Open the full calendar` → `/events`.
- Friday strip `#friday-list` / `#friday-heading` with `FridaySignup`.

## How to get to it (user POV)

Open `/`. Or click **This week** in `nav[aria-label="Primary navigation"]` (`a[href="/"]`). Brand logo `a.site-nav__brand` also goes home. Footer **This week** does the same.

## Driving it with Playwright

```bash
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature homepage-this-week
```

Or from `app/` smoke: `E2E_BASE_URL=$VERIFY_BASE_URL npx playwright test e2e/smoke.spec.ts -g "renders without an error state"` (the describe name prefixes every test title, so a `^/ renders` anchor matches nothing).

Manual locators: `getByRole('heading', { level: 1, name: /What's on around Westfield/i })`, `#week-heading`, `article.event-card`, `#home-search`. Screenshot the settled week section. Home search submit is allowed (navigates to `/search`, no write). Do not submit `#friday-email` on production.

## Gotchas

- Agenda is **server-rendered** (`force-dynamic`, `getPublicEvents` awaited in `page.tsx`). A Firestore failure throws to the Next error page, not an in-page error panel — `classify.mjs` treats only `FATAL_MARKERS` copy as `error`.
- The window is today + 8 days, not a calendar week, and at most 4 day-groups render.
- Empty week ≠ load error. Do not "fix" ingest or rewrite hero copy in a verify-only change.
- Smoke `text=Verified` is the card footer `Verified {date}` from `lastVerifiedAt`, not `EventStatusBadge` (that says Scheduled/Cancelled/…). Pending cards say `Source verification pending`.
- `signInWithPopup` vs redirect is irrelevant here; home is public.
