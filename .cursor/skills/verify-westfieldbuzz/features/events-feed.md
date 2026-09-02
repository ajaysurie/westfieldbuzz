# Events feed (empty vs populated)

Users never see cron. They see whether this week and `/events` have published, in-window events. Empty agenda with healthy HTTP means inventory/freshness, not a crashed Next process. `app/e2e/smoke.spec.ts` treats "at least one Verified" as a canary that ingest has not gone dark.

## Sub-features

- Homepage empty: `This week is still taking shape` + `Browse the calendar`.
- Events empty: `No published events yet` (no filters). Filter/day empty is a different panel.
- Populated: `article.event-card` and footer `Verified {Mon D}` when `lastVerifiedAt` exists.
- Cron HTTP (operator, not UX): `app/vercel.json` paths `/api/cron/ingest?group=core-libraries|core-town-school|nearby-venues`, `/api/cron/discover`, `/api/cron/freshness-watchdog`, `/api/cron/friday-digest`. Unauthenticated GET must not run work.

## How to get to it (user POV)

Open `/` or `/events` and wait until loading copy disappears. The feed is the agenda lists. No settings toggle.

## Driving it with Playwright

Use `helpers/drive.mjs --feature homepage-this-week` and `--feature events-calendar`. Classify with `helpers/classify.mjs` states `populated` | `empty` | `error`. Doctor already probes `GET /api/cron/ingest?group=core-libraries` **without** a bearer and expects 401/403/503.

Smoke canary (deployments you believe should have inventory):

```bash
cd app && E2E_BASE_URL="$VERIFY_BASE_URL" npx playwright test e2e/smoke.spec.ts -g "agenda shows at least one verified event"
```

If that fails and `drive.mjs` says `empty`, report empty feed. Do not enable `WESTFIELDBUZZ_ENABLE_INGEST` or call ingest with `CRON_SECRET` to "make the test pass."

## Gotchas

- `publicationStatus == "published"` is required (`getPublicEvents`). Drafts from ingest never appear.
- Local missing Firebase env looks like error or empty after client failure — doctor `firebasePublic: false` first.
- 503 on cron with body `Event ingestion is disabled` or `CRON_SECRET is not configured` is **correct** default-off (`cron-auth.ts`, README). 200 without a bearer is a failed doctor.
- Freshness watchdog records alerts; it does not fill the homepage.
- Do not fix empty-events product bugs in a verification-skill change.
