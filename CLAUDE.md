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
- **Project name**: `app`
- **Root directory**: `app/`
- **Framework**: Next.js (auto-detected)
- **Domain**: `westfieldbuzz.com` / `www.westfieldbuzz.com`

### Environment Variables (set in Vercel dashboard)

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_FIRESTORE_DB=westfieldbuzz-dev    (Preview)
NEXT_PUBLIC_FIRESTORE_DB=westfieldbuzz-prod   (Production)
```

### Deploy Commands

```bash
# From app/ directory
vercel --prod --scope ajay-suries-projects
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
