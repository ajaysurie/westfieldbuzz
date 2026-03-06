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
