# Friday subscribe

Anonymous visitors can join the generic Friday email from the home strip. Confirm and leave flows are token URLs, not nav items. Account-personalized Friday mail is `/account` after login — out of scope unless you have a test user.

## Sub-features

- Home `#friday-list`: `form[aria-label="Friday email signup"]`, `#friday-email`, submit **Get the list** / **Sending…**. Idle helper text: `No account needed. Confirm once by email.` Success `role="status"`: `You're almost on Friday's list.` + `Check your inbox to confirm Friday's list.` Error uses `.friday-signup__error`.
- POST `/api/subscriptions` with `{ email }`. Optional `Authorization: Bearer` ID token if the signed-in verified email matches.
- `/subscribe/confirm?token=` (`ConfirmSubscription`) and `/subscribe/confirmed`.
- `/unsubscribe?token=` (`UnsubscribeForm`).
- Nav **Get the list** is `a[href="/#friday-list"]` (hash on home), not `/subscribe`.

## How to get to it (user POV)

On `/`, scroll to **The good stuff, before the weekend starts.** or tap **Get the list** in primary nav / footer **Get the Friday list**. Confirm/unsubscribe only from email links.

## Driving it with Playwright

There is no `drive.mjs` feature id that submits the form (production-safe). Drive the **visible** strip as part of `homepage-this-week` (form and `#friday-email` must be visible). Smoke does not cover signup.

Local/`westfieldbuzz-dev` only, if doctor is local and you intend a write:

1. `goto /#friday-list`
2. `fill #friday-email` with a mailbox you control
3. `getByRole('button', { name: 'Get the list' })`
4. Expect success status **or** the error `<small>` message
5. Record the network status of `POST /api/subscriptions` in evidence

On `VERIFY_BASE_URL=https://westfieldbuzz.com`: **do not submit**. Assert the form is present; that is the proof. Skip confirm/unsubscribe without a token (`skipped: no mailbox token`).

## Gotchas

- Submitting on production creates a real subscriber candidate. Forbidden in this skill's production mode.
- Success copy is "almost on the list" — confirmation email is the side effect, not an immediate subscribed state.
- `/subscribe` with no suffix is not a landing page (only `confirm` / `confirmed`).
