# WestfieldBuzz

Community-curated directory of Westfield, NJ's most trusted local businesses and events. Built with Next.js App Router, Firebase Auth (Facebook login), and Firestore.

## Architecture

- **Framework**: Next.js 16 (App Router) with React 19
- **Styling**: Tailwind CSS v4 with CSS custom properties (`--ink`, `--accent`, `--paper`, etc.)
- **Fonts**: Instrument Serif (display, `--font-display`) + DM Sans (body, `--font-main`)
- **Auth**: Firebase Auth with Facebook OAuth provider
- **Database**: Firestore (named databases: `westfieldbuzz-dev` / `westfieldbuzz-prod`)
- **Hosting**: Vercel
- **Search**: Fuse.js for client-side fuzzy search

## Vercel Deployment

- **Scope**: `ajay-suries-projects` (personal account — NOT opareto)
- **Project name**: `westfieldbuzz`
- **Project ID**: `prj_IqC1U3VO8L3GH5n8daFuf6qui7lr`
- **Team ID**: `team_wtDZo4ecAFDxKLdALPMCGZT2`
- **Root directory**: `app` (set via Vercel API/dashboard — NOT in vercel.json)
- **Output directory**: leave empty (Next.js default `.next`)
- **Framework**: `nextjs`
- **Domain**: `westfieldbuzz.com` / `www.westfieldbuzz.com`

### CRITICAL: Vercel project settings

- Root directory MUST be `app` (the Next.js app lives in `app/`, not repo root)
- Output directory MUST be null/empty (not `public` — that makes Vercel serve static files only)
- Build command: `npm run build` (set via API to prevent regression)
- NEVER deploy with `--scope opareto` — this is a personal project
- NEVER add a `vercel.json` to the repo root — it overrides project settings and previously broke the deploy by setting `buildCommand: ""` and `outputDirectory: "public"`
- Git pushes to main auto-deploy. CLI deploys must run from repo root (not `app/`)

### Environment Variables (set via `vercel env add` or dashboard)

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_FACEBOOK_APP_ID
NEXT_PUBLIC_FIRESTORE_DB=westfieldbuzz-dev    (Preview)
NEXT_PUBLIC_FIRESTORE_DB=westfieldbuzz-prod   (Production)
```

### Deploy Commands

```bash
# Git push (preferred — auto-deploys with correct settings)
git push origin main

# CLI deploy (must run from REPO ROOT, not app/)
cd /path/to/westfieldbuzz && vercel --prod --scope ajay-suries-projects
```

## Key Directories

```
app/
├── src/
│   ├── app/           # Next.js pages (directory, events, privacy, data-deletion)
│   ├── components/    # React components (Nav, ServiceCard, EventCard, etc.)
│   ├── lib/           # Firebase config, Firestore helpers, auth context, event categories
│   └── data/          # scraped-businesses.json (282 businesses)
├── scripts/           # Seeding scripts (seed.ts, seed-events.ts, cleanup-businesses.ts)
└── public/            # Static assets, logos, concepts HTML files
```

## Firebase / Firestore

- Named databases: pass DB name as second arg to `getFirestore(app, "db-name")`
- Env var `NEXT_PUBLIC_FIRESTORE_DB` controls which DB is used
- Collections: `services` (businesses), `events`, `users`, `config`
- Admin allowlist: `config/admin` document with `allowlist` array of emails

## Seeding

```bash
# Dev (default)
npx tsx scripts/seed.ts
npx tsx scripts/seed-events.ts
npx tsx scripts/seed-events-newsletter.ts

# Production
npx tsx scripts/seed.ts --prod
npx tsx scripts/seed-events.ts --prod
npx tsx scripts/seed-events-newsletter.ts --prod
```

## Facebook OAuth

- Auth domain: `westfieldbuzz.firebaseapp.com`
- Redirect URI (must be whitelisted in Facebook Developer Console):
  `https://westfieldbuzz.firebaseapp.com/__/auth/handler`
- Facebook app must be in **Live** mode with **email** permission enabled
- Privacy Policy URL: `https://westfieldbuzz.com/privacy`
- Data Deletion URL: `https://westfieldbuzz.com/data-deletion`

### Mobile Auth: popup vs redirect

- `signInWithPopup` fails on mobile Safari/Chrome — aggressive popup blockers silently prevent the window from opening
- `signInWithRedirect` is the correct mobile approach, but requires `getRedirectResult()` on page load to capture the returning auth session
- **Trap**: calling `getRedirectResult()` alongside `signInWithPopup()` causes `auth/cancelled-popup-request` — the redirect listener cancels the popup flow. The two methods conflict at runtime
- **Solution**: detect mobile via user agent at module level and branch: `signInWithRedirect` on mobile, `signInWithPopup` on desktop. Keep `getRedirectResult()` in a separate `useEffect` — it's a no-op on desktop but required for mobile return flow
- **Auth domain proxy was unnecessary**: tried proxying `/__/auth/*` through our domain to avoid third-party storage blocking, but the simpler popup/redirect split solved it without proxy complexity
- See `app/src/lib/auth.tsx` for the working implementation

## Learnings

- **Firebase mobile auth needs popup/redirect split, not one-size-fits-all**: Mobile browsers block `signInWithPopup` silently. Use `signInWithRedirect` on mobile + `getRedirectResult()` on load, and `signInWithPopup` on desktop. Never mix both flows — `getRedirectResult()` cancels pending popup requests (`auth/cancelled-popup-request`). Detect mobile via user agent at module scope, not per-call. Resist the urge to proxy Firebase auth through your own domain — the popup/redirect split is simpler and sufficient.
- **Approval flows must carry forward implicit actions**: When a user suggests a business, they're implicitly recommending it (the form asks "Why do you recommend them?"). The approval function must create the recommendation subcollection entry and set `recommendations: 1` — not start at 0. Any "submit + admin approve" pattern should audit what the submitter's action implies beyond the explicit data fields.
- **Always add tests for any code change**: Every new function, bug fix, or behavioral change must include corresponding tests. The `approveSuggestion` bug (recommendations dropped) had no test asserting recommendation count, so it shipped silently broken. No code is committed without test coverage.
