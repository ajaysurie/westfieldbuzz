# Westfield Buzz feature map

Baseline for `verify-westfieldbuzz`. Read with `SKILL.md`. Paths are from repo root.

## Baseline preconditions

- Next.js app is `app/`. Do not add a repo-root `vercel.json`.
- Dependencies: `cd app && npm ci`. Chromium: `cd app && npx playwright install chromium`.
- Local data path: `app/.env.local` with `NEXT_PUBLIC_FIREBASE_*` (and usually `NEXT_PUBLIC_FIRESTORE_DB=westfieldbuzz-dev`). README's `.env.example` is **not in the tree** (`.env*` gitignored).
- If Firebase public env is missing, doctor will say so. Drive data-dependent features with `VERIFY_BASE_URL=https://westfieldbuzz.com` (read-only). Prefer local when env exists.
- Launch via `node .cursor/skills/verify-westfieldbuzz/helpers/launch.mjs` or skip launch for production-only. Never attach to a pre-existing `:3000` that we did not lock.
- Ingest flags stay off. No `scripts/seed.ts --prod`. No cron bearer.
- `npm run verify` / `npm run verify:pr` are unit/lint/build, not a substitute for driving the UI.

## Driving conventions

1. Doctor the target. `ok: false` → do not drive.
2. Prefer `app/e2e/smoke.spec.ts` when the claim is "this deployment renders public routes." Set `E2E_BASE_URL`.
3. Prefer `helpers/drive.mjs --feature <id>` when the claim is a mapped user feature and you need screenshots/traces.
4. Locators live in `helpers/selectors.mjs`. Copy them; do not invent CSS from memory.
5. Production is shared. GET and browse only. No Friday form submit, no login, no `/api/subscriptions` POST, no `/suggest` submit.
6. Two browsers against production read-only is allowed. Two Playwright runs against the **same local** lock instance is not — finish or cleanup first (`helpers/launch.mjs` refuses a second lock on the same port).

## Proof / skip reporting

Record in the artifact `drive.json` and in the PR/agent report:

- **Target URL** and whether it was verify-owned local or production-readonly.
- **Feature id** (filename without `.md`).
- **Action** (goto, click named control, fill named field).
- **Resulting state** using classify language: `populated` | `empty` | `error` | `filtered-empty` | `parser-fallback` | `no-matches` | `results`.
- **Evidence paths** that still exist after cleanup.
- **Skip** only when doctor forbids the target, or the feature requires a session (`/admin`, `/suggest`, `/account`) and you have no test user. Write `skipped: <reason>`. Do not skip an empty agenda — report `empty`.

A load error (`We couldn't check the calendar` / `The calendar did not load`) is a failed drive, not an empty feed.

## Feature list

| File | User-facing surface |
| --- | --- |
| [homepage-this-week.md](./homepage-this-week.md) | `/` this-week agenda, home search, Friday strip |
| [events-calendar.md](./events-calendar.md) | `/events` agenda + calendar view |
| [event-search.md](./event-search.md) | `/search` sentence → chips + results |
| [friday-subscribe.md](./friday-subscribe.md) | `#friday-list` email signup + confirm/unsubscribe routes |
| [events-feed.md](./events-feed.md) | Empty vs populated inventory; cron default-off probes |

Secondary, not mapped as primary files: `/directory`, `/login`, `/admin` gate (covered by `app/e2e/smoke.spec.ts` for `/directory` and `/admin`).
