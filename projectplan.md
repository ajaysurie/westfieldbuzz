# Westfield Buzz — Execution Plan

## Status: Ready to Build (Design TBD — V1 or V2)

---

## Decisions Made

| Decision | Choice |
|----------|--------|
| Design | V1 (Premium Navy) or V2 (Light Editorial) — awaiting feedback |
| Auth | Gated launch (login required), open browsing later via config flag |
| Seed data | Scrape Facebook groups (Westfield NJ community groups) |
| Events | Scrape weekly newsletters + manual admin entry |
| Search | Fuse.js client-side MVP, swap to server-side later |
| Admin | Email allowlist in Firestore |
| Auth providers | Facebook OAuth (primary) + Google OAuth (fallback) |
| Firebase | New project |
| Facebook Dev App | Needs setup (instructions in plan) |
| Domain | `westfieldbuzz.com` (bought + connected to Vercel) |
| AI Agent | Phase 4, with Taylor |

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS (bundled via PostCSS) |
| Database | Firebase Firestore |
| Auth | Firebase Auth (Facebook + Google OAuth) |
| Search | Fuse.js (client-side MVP) |
| Hosting | Vercel |

---

## Data Model

### Firestore Collections

```
services/{id}
  - name, category, phone, email, address, website
  - recommendations: number
  - recentRecommenders: array<{uid, timestamp}>
  - lastRecommended: timestamp
  - createdAt: timestamp

services/{id}/recommendations/{userId}
  - uid, timestamp

users/{id}  (PRIVATE)
  - displayName, photoURL, email
  - lastActive, joinedDate

public_profiles/{id}  (PUBLIC)
  - displayName, photoURL

suggested_services/{id}
  - userId, businessName, category, phone, notes
  - status: "pending" | "approved" | "rejected"
  - suggestedAt: timestamp

events/{id}
  - title, description, date, endDate, location, category
  - createdBy, createdAt

config/categories → { list: string[] }
config/admin → { allowlist: string[] }
```

---

## Execution Plan — Multi-Agent Build

### How This Works

I (Claude) orchestrate the build as a series of work blocks. Each block uses parallel subagents where possible. You approve each block before I execute. Tests run after each block.

---

### Pre-Build: Setup (You do these manually)

- [ ] **Facebook Developer App**: developers.facebook.com → Create App → Consumer → Add Facebook Login
  - Valid OAuth Redirect: `https://westfieldbuzz.com/__/auth/handler`
  - Also: `http://localhost:3000/__/auth/handler`
  - Grab App ID + App Secret
- [ ] **Firebase Project**: console.firebase.google.com → Create Project "westfield-buzz"
  - Enable Firestore (production mode, `nam5`)
  - Enable Authentication → Facebook (paste App ID + Secret)
  - Enable Authentication → Google
  - Download `serviceAccountKey.json` for admin SDK (don't commit this)
  - Grab web app config (apiKey, authDomain, projectId, etc.)
- [ ] **Environment Variables**: Create `.env.local` with Firebase config + Facebook credentials
- [ ] **Forward a sample newsletter** so I can build the events parser

---

### Block 1: Project Scaffold

**Goal**: Next.js project with Tailwind, Firebase SDK, basic layout, deployed to Vercel

**Tasks** (sequential — foundation):
1. Init Next.js 15 app with App Router + Tailwind (bundled)
2. Firebase client SDK setup (`lib/firebase.ts`)
3. Root layout with nav + footer (design TBD — will use V1 aesthetic as placeholder, swap later)
4. Landing page skeleton (hero, category grid, events preview)
5. Firestore security rules + seed script structure
6. Deploy to Vercel, verify `westfieldbuzz.com` works

**Tests**:
- `npm run build` passes
- Landing page renders at `/`
- Firebase client initializes without errors
- Deployed URL loads correctly

---

### Block 2: Auth System

**Goal**: Facebook + Google login, gated access, admin allowlist

**Tasks** (parallel where possible):
1. Auth context provider (`lib/auth.tsx`) — login state, user object, loading
2. Login page (`/login`) — Facebook + Google buttons
3. Auth middleware — redirect unauthenticated users to `/login`
4. User profile creation on first login (write to `users/` + `public_profiles/`)
5. Admin check utility — read `config/admin` allowlist from Firestore
6. Account page (`/account`) — display name, photo, logout

**Tests**:
- Login flow works with Facebook OAuth (manual test with your account)
- Login flow works with Google OAuth
- Unauthenticated users get redirected to `/login`
- User doc created in Firestore on first login
- Admin check returns true for allowlisted emails

---

### Block 3: Directory Core

**Goal**: Browse, search, and filter service providers

**Tasks** (parallel agents for UI + data):
1. Firestore seed script — load 20-30 businesses from JSON file
2. Directory page (`/directory`) — grid of service cards
3. Category filter — URL param `?category=electrician`
4. Search bar with Fuse.js — fuzzy match across name, category
5. Service detail page (`/directory/[id]`) — SSR for SEO
6. Category browsing grid on landing page (links to filtered directory)

**Tests**:
- Seed script populates Firestore with test data
- Directory page renders all services
- Category filter shows only matching services
- Search returns relevant results for "plumber", "electric", etc.
- Service detail page renders with correct data
- SSR works (view-source shows content)

---

### Block 4: Recommendations

**Goal**: Users can recommend services, counts display, recommender avatars show

**Tasks**:
1. Recommend button on service cards + detail page
2. Firestore write: create `recommendations/{userId}` subcollection doc
3. Increment `recommendations` count + update `recentRecommenders` array
4. Un-recommend (toggle) — remove doc, decrement count
5. Recommender avatars on service cards (fetch from `public_profiles`)
6. User's recommendations list on `/account`

**Tests**:
- Recommend button adds recommendation to Firestore
- Count increments/decrements correctly
- Recommender avatars display on service cards
- User can see their recommendations on account page
- Can't recommend same service twice

---

### Block 5: Suggest a Business

**Goal**: Community members can submit new businesses for admin approval

**Tasks**:
1. Suggest form (`/suggest`) — business name, category, phone, notes
2. Write to `suggested_services/` on submit
3. Admin page (`/admin/suggestions`) — list pending, approve/reject
4. On approve: copy to `services/` collection
5. Success/confirmation UI after submission

**Tests**:
- Form submission creates doc in `suggested_services/`
- Admin sees pending suggestions
- Approve creates new service doc
- Reject updates status
- Non-admin can't access admin page

---

### Block 6: Events

**Goal**: Events listing with filtering, admin entry, landing page widget

**Tasks**:
1. Events page (`/events`) — upcoming events with date/category filter
2. Event cards — date badge, title, location, category tag
3. Admin event entry (`/admin/events`) — create/edit/delete
4. Landing page events widget — next 3 upcoming events
5. Newsletter parser utility (once you provide a sample)

**Tests**:
- Events page renders upcoming events
- Filter by category works
- Admin can create/edit/delete events
- Landing page shows next 3 events
- Past events don't show by default

---

### Block 7: Seed Data — Facebook Group Scrape

**Goal**: Extract real business recommendations from Westfield Facebook groups

**Tasks**:
1. Browser automation script (Playwright) — log into Facebook with your account
2. Navigate to target groups, scrape posts mentioning service providers
3. Extract structured data: business name, category, who recommended, post text
4. Claude Opus pass: clean + deduplicate + categorize extracted data
5. Output seed JSON ready for Firestore import
6. Review with you before importing

**Approach**:
- Use Playwright (not computer use — more reliable for Facebook's DOM)
- Slow, human-like pacing (random delays between actions)
- One-time scrape, not continuous
- You stay logged in on your machine, script uses that session
- Target: 30-50 real recommendations

**Tests**:
- Script logs in and navigates to groups
- Extracts at least 20 recommendations
- Output JSON matches our Firestore schema
- No duplicate entries

---

### Block 8: Polish + SEO

**Goal**: Production-ready with proper metadata, responsive, performant

**Tasks**:
1. Meta tags in `layout.tsx` — OG, Twitter, description
2. `robots.ts` + `sitemap.ts` (Next.js typed route files)
3. JSON-LD structured data (Organization + LocalBusiness)
4. `llms.txt` for AI agent discoverability
5. Mobile responsive audit — all pages
6. Loading states + error boundaries
7. Favicon + apple-touch-icon

**Tests**:
- `npm run build` passes with no warnings
- Lighthouse score > 90 on all pages
- OG tags render correctly (check with sharing debugger)
- Mobile layout works on all pages
- Error boundaries catch and display errors gracefully

---

## Verification Plan

### After Each Block
1. `npm run build` — must pass
2. `npm test` — all tests pass
3. Manual smoke test of new features
4. Deploy to Vercel preview, verify on real URL
5. Check Firestore for correct data writes

### Before Launch
1. Full E2E walkthrough: land → login → browse → search → recommend → suggest → events
2. Mobile walkthrough on real phone
3. Test with 2-3 real users (friends/family)
4. Verify Facebook OAuth works for non-developer users (requires App Review)
5. Check `westfieldbuzz.com` loads correctly with SSL
6. Firestore security rules audit — verify no unauthorized access

### Post-Launch Monitoring
- Vercel analytics for traffic
- Firebase console for auth + Firestore usage
- Check for errors in Vercel logs

---

## Page Structure

```
app/
├── page.tsx                    # Landing (hero, categories, events preview)
├── layout.tsx                  # Root layout (nav, footer, fonts, meta)
├── directory/
│   ├── page.tsx                # Directory listing + search + filter
│   └── [id]/
│       └── page.tsx            # Service detail (SSR)
├── events/
│   └── page.tsx                # Events listing + filter
├── login/
│   └── page.tsx                # Facebook + Google auth
├── suggest/
│   └── page.tsx                # Suggest a business form
├── account/
│   └── page.tsx                # Profile + recommendations
└── admin/
    ├── page.tsx                # Dashboard
    ├── suggestions/page.tsx    # Review submissions
    └── events/page.tsx         # Event management

lib/
├── firebase.ts                 # Firebase client config
├── auth.tsx                    # Auth context provider
├── firestore.ts                # Firestore helpers (getServices, etc.)
├── search.ts                   # Fuse.js config
└── admin.ts                    # Admin check utility

components/
├── Nav.tsx
├── Footer.tsx
├── ServiceCard.tsx
├── EventCard.tsx
├── SearchBar.tsx
├── CategoryGrid.tsx
├── RecommendButton.tsx
└── AuthGate.tsx                # Redirect if not logged in
```

---

## Execution Order

```
Pre-Build (you)     → Facebook App + Firebase Project + .env.local
Block 1 (scaffold)  → Next.js + Tailwind + Firebase + deploy
Block 2 (auth)      → Login + gating + admin
Block 3 (directory) → Browse + search + detail pages
Block 4 (recs)      → Recommend system
Block 5 (suggest)   → Community submissions
Block 6 (events)    → Events pages + admin
Block 7 (scrape)    → Facebook group seed data
Block 8 (polish)    → SEO + responsive + production readiness
```

Blocks 1-6 are sequential (each depends on the previous).
Block 7 (scrape) can run in parallel with Blocks 4-6.
Block 8 is a final pass.

---

## Review

*To be filled after implementation.*
