# Event search

`/search` (`SearchExperience` + `SearchForm`) turns a sentence into structured intent via `POST /api/event-search`, then ranks stored events. The model does not invent events. Home search (`#home-search`) only hands off the sentence through `sessionStorage` key `westfieldbuzz:search-handoff`.

## Sub-features

- Form: `#event-search` (sr-only label `Describe the event you want`), submit button **Search** / **Searching…**.
- After success: `[aria-label="Interpreted search filters"]` chips (`aria-label="Remove {label} filter"`), `.search-provenance` (`✓ {n} events checked · verified today`).
- Results: `.search-kicker` **Top picks**, `a.search-card` (`aria-label="View {title}"`), or **No exact matches yet**.
- Fallback notice (status): `the language parser was unavailable` when `fallbackUsed` (`SearchNotice.tsx`).
- Examples on empty start: `Free live music Friday night`, `Indoors Saturday morning for a 5-year-old`, `Not sports, within 15 minutes`.
- **Save this search** (`aria-pressed`) requires auth; anonymous click goes to `/login`. Do not follow that on production.

## How to get to it (user POV)

Type a sentence in `#home-search` on `/` and submit, click a starter chip, follow **Describe it in a sentence.** on `/events`, or open `/search` (optional `?q=`).

## Driving it with Playwright

```bash
VERIFY_BASE_URL="$VERIFY_BASE_URL" node .cursor/skills/verify-westfieldbuzz/helpers/drive.mjs --feature event-search
```

Smoke (`app/e2e/smoke.spec.ts` "a sentence returns parsed chips…"): fill `input#event-search, input[type='search'], input[type='text']` with `something fun for kids this weekend`, Enter, wait up to 20s, body must not contain `parser was unavailable`, must match `/events checked/i`. That smoke is strict (fails on parser fallback or empty inventory without provenance). `drive.mjs` records `parser-fallback` / `no-matches` / `results` instead of forcing a product fix.

Local without `OPENAI_API_KEY`: expect the controlled unavailable/fallback path, not a hang.

## Gotchas

- `#event-search` has **no** `type="search"` (plain text input). `#home-search` does. Smoke already ORs both.
- Parser fallback and AI copy quality are product bugs; verification reports them. Do not patch prompts here.
- Search can take ~20s (route + model). Use the existing timeout, do not shorten it.
- Saving searches writes Firestore as the signed-in user. Skip unless you have a disposable `westfieldbuzz-dev` account.
