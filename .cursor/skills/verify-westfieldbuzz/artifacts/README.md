# Verification artifacts

This directory stores evidence from `helpers/drive.mjs`. Contents are gitignored except this README and `.gitignore`.

Each run writes `artifacts/<VERIFY_RUN_ID>-<feature>/`:

- `drive.json` — target URL, classification, pass/fail
- screenshot PNG (`homepage.png`, `events-agenda.png`, `events-calendar.png`, or `search.png`)
- `trace.zip` — Playwright trace (`npx playwright show-trace trace.zip`)
- `network.har`
- `console.log`

Cleanup (`helpers/cleanup.mjs`) must not delete these files. If the directory is empty aside from this README, no drive has been kept in-tree (local runs still leave files on disk when not committed).
