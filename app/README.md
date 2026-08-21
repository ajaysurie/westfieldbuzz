This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Automation safety

All cron endpoints require `Authorization: Bearer $CRON_SECRET` and are
disabled by default even after authentication. Set each exact production flag
only when its dependencies are configured:

- `WESTFIELDBUZZ_ENABLE_INGEST=true`
- `WESTFIELDBUZZ_ENABLE_DISCOVER=true`
- `WESTFIELDBUZZ_ENABLE_FRIDAY_DIGEST=true`
- `WESTFIELDBUZZ_ENABLE_FRESHNESS_WATCHDOG=true`

Disabled jobs return a JSON `503` response and perform no Firebase or external
provider work. See `.env.example`; flags belong in deployment environment
configuration, never `vercel.json`.

## Release One environment and verification

Required server configuration: `CRON_SECRET`, `EMAIL_TOKEN_SECRET`,
`NEXT_PUBLIC_SITE_URL`, Firebase public settings (`NEXT_PUBLIC_FIREBASE_*` and
`NEXT_PUBLIC_FIRESTORE_DB`), and Firebase Admin credentials (`FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) or application-default credentials.
Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_WEBHOOK_SECRET` before enabling
Friday delivery or webhook processing. Set `OPENAI_API_KEY` only to enable model-backed
natural-language interpretation; the structured search endpoint otherwise returns a
controlled unavailable response. Set `GEMINI_API_KEY` to enable the `llm-extract`
ingestion sources (Patch, TAPinto); without it those sources skip with a clear error
and every feed-based source still runs. `WESTFIELDBUZZ_LLM_MODEL` overrides the
default extraction model (`gemini-3.7-flash`).

The independent freshness watchdog is scheduled separately from ingestion and is
default-off via `WESTFIELDBUZZ_ENABLE_FRESHNESS_WATCHDOG`. It records durable overdue
source and stale-event alerts; it does not send external notifications.

Run `npm run verify` locally and `npm run verify:pr` when all build environment
variables are present. Firestore rules tests use the Firebase Emulator Suite and require
a JDK/JRE on the host (`java -version`); install Java separately before `npm run test:rules`.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
