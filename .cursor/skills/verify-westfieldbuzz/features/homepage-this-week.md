# Homepage this week

The home route `/` (`app/src/app/page.tsx`) is the events-first landing: a week dateline, watercolor hero, sentence search (`HomeSearch`), chronological "This week, in order" groups of `EventCard`, and the Friday email strip. Directory is not in this layout.

## Sub-features

- Hero copy and `#home-search` (`form.event-search-form`, submit `aria-label="Search local events"`). Starter chips under `[aria-label="Suggested searches"]` (`Rainy-day ideas for kids`, `Free this weekend`, `A low-key date night`) store a sessionStorage handoff and go to `/search`.
- Week preview `#week-heading` inside `section[aria-labelledby="week-heading"]`. States: loading (`Checking this week's calendars`, `role="status"`), error (`We couldn't check the calendar`, `role="alert"`, Try again), empty (`This week is still taking shape` + link to `/events`), populated (`article.event-card` with `a.event-card__title` and footer `Verified …` or `Source verification pending`).
- Link `Open the full calendar` → `/events`.
- Friday strip `#friday-list` / `#friday-heading` with `FridaySignup`.

## How to get to it (user POV)

Open `/`. Or click **This week** in `nav[aria-label="Primary navigation"]` (`a[href="/"]`). Brand logo `a.site-nav__brand` also goes home. Footer **This week** does the same.

## Driving it with Playwright

```bash
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature homepage-this-week
```

Or from `app/` smoke: `E2E_BASE_URL=$VERIFY_BASE_URL npx playwright test e2e/smoke.spec.ts -g "^/ renders"`.

Manual locators: `getByRole('heading', { level: 1, name: /What's on around Westfield/i })`, `#week-heading`, `article.event-card`, `#home-search`. Wait out loading copy before classifying. Screenshot the settled week section. Home search submit is allowed (navigates to `/search`, no write). Do not submit `#friday-email` on production.

## Gotchas

- Agenda is **client-fetched** Firestore (`getPublicEvents`). `curl` HTML will look like a shell; Playwright is required for populated/empty.
- Empty week ≠ load error. Do not "fix" ingest or rewrite hero copy in a verify-only change.
- Smoke `text=Verified` is the card footer `Verified {date}` from `lastVerifiedAt`, not `EventStatusBadge` (that says Scheduled/Cancelled/…). Pending cards say `Source verification pending`.
- `signInWithPopup` vs redirect is irrelevant here; home is public.
