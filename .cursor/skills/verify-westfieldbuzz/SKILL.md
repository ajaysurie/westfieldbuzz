---
name: verify-westfieldbuzz
description: Verify Westfield Buzz (westfieldbuzz.com) public UI — homepage this-week agenda, /events calendar, /search, Friday list signup, and empty-vs-populated event feed. Use when checking a local Next.js app/ server, Playwright smoke, or a live/preview URL. Not for ingest-pipeline or homepage-copy product fixes.
---

# Verify Westfield Buzz

You are verifying **Westfield Buzz**, an events-first Next.js 16 App Router site. The Next.js app lives in `app/` (Vercel root). Repo root must never gain a `vercel.json`. Do not deploy. Do not enable `WESTFIELDBUZZ_ENABLE_*`. Do not send `CRON_SECRET`. Do not POST subscriptions, suggestions, or auth against production.

Read this file cold. Invoke the helpers by path. Do not invent a second browser stack.

## Surface

Primary (what a visitor actually uses without an account):

- `/` this-week agenda, `#home-search`, `#friday-list` signup
- `/events` agenda (default) and `/events?view=calendar`
- `/events/[id]` event detail
- `/search` sentence search (`#event-search`)
- `/privacy`, `/data-deletion`

Rest (reachable, not primary nav — `Nav.tsx` is This week / Calendar / Get the list only):

- `/directory` leftover business directory (`PageHeader` title "All Providers")
- `/login` Google + email-link (`Save your Westfield Buzz`)
- `/account`, `/admin`, `/admin/events`, `/admin/sources`, `/admin/suggestions` (gated)
- `/suggest` (AuthGate → `/login`)
- `/subscribe/confirm`, `/subscribe/confirmed`, `/unsubscribe` (token email flows)
- Cron HTTP: `/api/cron/ingest?group=…`, `/api/cron/discover`, `/api/cron/freshness-watchdog`, `/api/cron/friday-digest` (not a user page; user-visible effect is empty vs populated agenda)

## Run

Cwd for the app is **`app/`**, not repo root. `app/README.md`:

```bash
cd app && npm run dev
```

Ready: `http://localhost:3000` serves HTML. `app/package.json` `dev` is `next dev` (port 3000 unless `VERIFY_PORT` / `-p`).

Also in `app/package.json`:

- `npm test` — Vitest
- `npm run verify` — lint + vitest + `tsc --noEmit` + `git diff --check`
- `npm run verify:pr` — `verify` + `next build`
- `npm run test:rules` — Firestore emulator (needs JDK)

Env: README lists `CRON_SECRET`, `EMAIL_TOKEN_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_FIRESTORE_DB`, Firebase Admin, Resend, `OPENAI_API_KEY`, `GEMINI_API_KEY`. Client Firestore (`app/src/lib/firebase.ts`) needs `NEXT_PUBLIC_FIREBASE_*`. Default DB name is `westfieldbuzz-dev` in development. Homepage/events load **published** events in the browser via `getPublicEvents` (`publicationStatus == "published"`).

`app/README.md` cites `.env.example`. **That file is not in git.** `app/.gitignore` ignores `.env*`, so local secrets live in untracked `app/.env.local`. If those keys are missing, local UI shell can still boot; agenda/search data will not.

Seed (dev Firestore only, never `--prod` during verify):

```bash
cd app && npx tsx scripts/seed.ts
cd app && npx tsx scripts/seed-events.ts
```

Auth: optional. Public browse does not need a session. `/admin` without a session must land on sign-in (`AdminGate` → `/login`). Facebook is implemented in `auth.tsx` but `/login` promotes Google + email link only.

Cron: default-off. `authorizeCron` + `cronFeatureEnabled` in `app/src/lib/server/ingestion/cron-auth.ts`. Missing `CRON_SECRET` → JSON **503**. Bad/missing bearer → **401**. Flag not `true` → JSON **503** and no Firebase/provider work (`app/README.md`). Scheduled paths are in `app/vercel.json` only.

Isolation: two Next instances **can** run on different ports. They share whatever Firestore the env points at. **Refuse to drive a server this run did not start.** Helpers lock a pid+port. If port 3000 is already taken by a foreign process, set `VERIFY_PORT` to a free port or stop — do not attach Playwright to the stranger, and never `pkill -f next`.

Production `https://westfieldbuzz.com` is a **shared** instance. Read-only GET + Playwright on public routes is allowed. No writes.

## Launch

From **repo root**:

```bash
cd app && npm ci
cd app && npx playwright install chromium
node .cursor/skills/verify-westfieldbuzz/helpers/launch.mjs
```

Ready: helper prints JSON `ok: true` with `baseUrl` and `pid`. HTTP to that origin returns a document (compile on first request can take up to 90s, `VERIFY_READY_MS`). Log: `.cursor/skills/verify-westfieldbuzz/.run/next-dev-<port>.log`. Lock: `.cursor/skills/verify-westfieldbuzz/.run/verify.lock.json`.

If `firebasePublic` is `false`, do not pretend local agenda is production data. Set `VERIFY_BASE_URL=https://westfieldbuzz.com` for data-dependent drives.

Without `NEXT_PUBLIC_FIREBASE_API_KEY`, `next dev` still binds the port, but `GET /` is **500**: `firebase.ts` calls `getAuth(app)` at import time (`auth/invalid-api-key`). That is missing env, not a broken checkout. Doctor local will be `ok: false`. Do not stub Firebase in the app to make doctor green.

If JSON `isolation: refuse-shared-instance` or `refuse-double-drive`: stop. Doctor/drive that URL is forbidden.

Teardown: `node .cursor/skills/verify-westfieldbuzz/helpers/cleanup.mjs` (see Cleanup). Run cleanup after every failed iteration that launched.

Skip launch when you are only driving production: `VERIFY_BASE_URL=https://westfieldbuzz.com`. Do not start Next just to ignore it.

## Doctor

One read-only check:

```bash
node .cursor/skills/verify-westfieldbuzz/helpers/doctor.mjs
```

With production:

```bash
VERIFY_BASE_URL=https://westfieldbuzz.com node .cursor/skills/verify-westfieldbuzz/helpers/doctor.mjs
```

Pass (`ok: true`) means: target HTTP shell contains Westfield Buzz + primary copy; cron unauthenticated GET is 401/403/503 not 200; local mode also requires a live lock pid and no `WESTFIELDBUZZ_ENABLE_*=true`. Fail means do not drive that target.

Port ownership: `ss -lptn`, then `lsof -t -iTCP:$PORT -sTCP:LISTEN`, then `netstat -lptn`. This cloud image has `netstat` and `lsof`, not `ss`. The lock pid is `npm exec next`; the LISTEN pid is often child `next-server`. That is still ours if the lock pid is alive. A LISTEN pid with **no** lock is a foreign instance — refuse.

Doctor does **not** classify client-rendered agenda state. That is Playwright (`helpers/drive.mjs`).

## Drive

**Existing harness first.** From `app/`:

```bash
# Post-deploy smoke (app/e2e/smoke.spec.ts). Skips unless E2E_BASE_URL is set.
# Covers /, /events, /search, /directory, /privacy, /data-deletion, agenda "Verified",
# search sentence, cron ingest unauthenticated, /admin sign-in gate.
cd app && E2E_BASE_URL="$VERIFY_BASE_URL" npx playwright test
```

Config: `app/playwright.config.ts` (`testDir: ./e2e`, viewport 1280×900, 90s timeout, 2 workers). Optional `E2E_SHARE_URL` for Vercel SSO on protected previews only — **not** for westfieldbuzz.com.

**Mapped-feature driver** (this skill; captures artifacts):

```bash
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature homepage-this-week
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature events-calendar
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature event-search
```

Real selectors (see `helpers/selectors.mjs` and feature files):

| Control | Locator |
| --- | --- |
| Primary nav | `nav[aria-label="Primary navigation"]` |
| This week | `a[href="/"]` in that nav |
| Calendar | `a[href="/events"]` in that nav |
| Get the list | `a[href="/#friday-list"]` |
| Home search | `#home-search` in `form.event-search-form` |
| Week heading | `#week-heading` |
| Event card | `article.event-card` |
| Agenda / Calendar toggle | `getByRole('button', { name: 'Agenda' })` / `{ name: 'Calendar' }` inside `[aria-label="Calendar controls"]` |
| Month grid | `section.event-calendar[aria-label="Month calendar"]` |
| Sentence search | `#event-search` then `getByRole('button', { name: 'Search' })` |
| Friday email | `#friday-email` in `form[aria-label="Friday email signup"]` |
| Interpreted chips | `[aria-label="Interpreted search filters"]` |
| Provenance | `.search-provenance` (`events checked`) |

Do not submit `#friday-email` on production. Do not click Continue with Google on production. Empty agenda (`This week is still taking shape` / `No published events yet`) is an **observation**, not a prompt to change ingest or copy.

## Evidence

Directory: `.cursor/skills/verify-westfieldbuzz/artifacts/<run-id>-<feature>/` (gitignored except `artifacts/README.md`). Each drive writes `drive.json`, screenshot PNG, `trace.zip`, `network.har`, `console.log`.

Proof standard:

- Real user path (nav or typed URL a visitor uses).
- Action + resulting state (click Calendar → `?view=calendar` and month grid; search → chips or fallback notice or no-matches — all three are states).
- Side effects: none on production. Local writes only if you explicitly own `westfieldbuzz-dev` and say so in `drive.json`.
- Mocks only at real production boundaries (do not stub Firestore in Playwright). Unit tests in `app/` already mock; this skill does not.

Keep evidence after cleanup. Quote `outDir` in the report.

## Cleanup

```bash
node .cursor/skills/verify-westfieldbuzz/helpers/cleanup.mjs
```

Kills **only** the lockfile pid / process group, then deletes the lock. Does not delete `artifacts/`. Does not `pkill` by name. Foreign processes on port 3000 are not yours — do not kill them.

After cleanup, confirm `drive.json` and the PNG still exist at the printed `outDir`.

## Helpers

All executable. Tests: `node --test .cursor/skills/verify-westfieldbuzz/helpers/*.test.mjs`

| Script | Role |
| --- | --- |
| `helpers/launch.mjs` | Own a Next dev server + lockfile |
| `helpers/doctor.mjs` | Read-only process/HTTP/cron/env check |
| `helpers/drive.mjs` | Playwright one feature + artifacts |
| `helpers/cleanup.mjs` | Kill lock pid only |

Env: `VERIFY_PORT` (default 3000), `VERIFY_LOCK`, `VERIFY_BASE_URL`, `VERIFY_ARTIFACTS_DIR`, `VERIFY_RUN_ID`, `VERIFY_READY_MS`.

## Features

Index: `features/README.md`. Drive the named file for the change under test. If the change is not mapped, use the generic Playwright recipe in that README, then add a feature file.
