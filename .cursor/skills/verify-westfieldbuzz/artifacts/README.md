# Verification artifacts

This directory stores evidence from `helpers/drive.mjs`. Contents are gitignored except this README and `.gitignore`.

Each run writes `artifacts/<VERIFY_RUN_ID>-<feature>/`:

- `drive.json` — target URL, classification, pass/fail
- screenshot PNG (`homepage.png`, `events-agenda.png`, `events-calendar.png`, or `search.png`)
- `trace.zip` — Playwright trace (`npx playwright show-trace trace.zip`)
- `network.har`
- `console.log`

Cleanup (`helpers/cleanup.mjs`) must not delete these files. Binaries stay gitignored. Record the `outDir` in the PR/report.

Proven once on this branch (2026-09-02): launch local `:3000` (500 without Firebase env) → doctor production `ok` (cron 401) → `drive.mjs --feature homepage-this-week` against `https://westfieldbuzz.com` → classification `empty` (`This week is still taking shape`) → cleanup killed lock pid, port freed, evidence still at:

`artifacts/2026-09-02T0208Z-homepage-this-week/` (`drive.json`, `doctor.json`, `homepage.png`, `trace.zip`, `network.har`, `console.log`)
