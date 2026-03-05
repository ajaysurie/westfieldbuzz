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

### How This Works — Multi-Agent Orchestration

I (Claude Opus) act as **orchestrator**. For each block, I spawn specialized subagents that work in parallel on independent tasks. I verify their output, run tests, and only move to the next block when everything passes.

```
┌─────────────────────────────────────────────────┐
│  ORCHESTRATOR (Claude Opus — main session)      │
│  - Reads plan, decides what to build next       │
│  - Spawns subagents for parallel work           │
│  - Reviews output, runs tests, resolves issues  │
│  - Commits + deploys after each block           │
└──────────┬──────────┬──────────┬────────────────┘
           │          │          │
     ┌─────▼──┐ ┌─────▼──┐ ┌────▼───┐
     │Agent A │ │Agent B │ │Agent C │
     │(UI)    │ │(Data)  │ │(Tests) │
     └────────┘ └────────┘ └────────┘
```

**Agent types used:**
- **Build agents** — write components, pages, utilities (run in worktrees for isolation)
- **Review agents** — code quality, pattern consistency, security audit
- **Test agents** — write and run tests after each block
- **Research agents** — look up Next.js/Firebase docs, check patterns
- **Scrape agent** — Facebook group data extraction (Block 7)

**Per-block flow:**
1. Orchestrator plans the block's tasks
2. Independent tasks → parallel subagents (e.g., UI component + data layer simultaneously)
3. Dependent tasks → sequential (e.g., component must exist before test)
4. Orchestrator merges agent output, resolves conflicts
5. Run `npm run build` + `npm test`
6. Commit, deploy to Vercel preview
7. Report to you with summary + preview URL

**Parallelism map:**

| Block | Parallel agents | Sequential |
|-------|----------------|------------|
| 1 Scaffold | Firebase setup ∥ Layout/Nav/Footer | Init first, then parallel |
| 2 Auth | Auth context ∥ Login page ∥ Admin utility | Middleware depends on context |
| 3 Directory | Seed script ∥ Directory page ∥ Detail page | Search depends on directory |
| 4 Recs | Recommend button ∥ Avatars component | Firestore logic first |
| 5 Suggest | Form UI ∥ Admin page | Both depend on Firestore schema |
| 6 Events | Events page ∥ Admin events ∥ Landing widget | Independent UIs |
| 7 Scrape | Runs in parallel with Blocks 4-6 | Scrape → clean → review |
| 8 Polish | SEO ∥ Responsive ∥ Loading states | All independent |

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

**Agent plan**:
1. *Orchestrator*: Init Next.js 15 + Tailwind (must be first)
2. *Agent A (parallel)*: Firebase client SDK setup (`lib/firebase.ts`) + Firestore rules
3. *Agent B (parallel)*: Root layout with nav + footer + landing page skeleton
4. *Orchestrator*: Merge, build, deploy to Vercel

**Tests**:
- `npm run build` passes
- Landing page renders at `/`
- Firebase client initializes without errors
- Deployed URL loads correctly

---

### Block 2: Auth System

**Goal**: Facebook + Google login, gated access, admin allowlist

**Agent plan**:
1. *Agent A (parallel)*: Auth context provider (`lib/auth.tsx`) + admin check utility
2. *Agent B (parallel)*: Login page UI (`/login`) — Facebook + Google buttons
3. *Agent C (parallel)*: Account page (`/account`) — display name, photo, logout
4. *Orchestrator*: Wire auth middleware (depends on Agent A), user profile creation on first login
5. *Review agent*: Security audit on auth flow

**Tests**:
- Login flow works with Facebook OAuth (manual test with your account)
- Login flow works with Google OAuth
- Unauthenticated users get redirected to `/login`
- User doc created in Firestore on first login
- Admin check returns true for allowlisted emails

---

### Block 3: Directory Core

**Goal**: Browse, search, and filter service providers

**Agent plan**:
1. *Agent A (parallel)*: Seed script + sample JSON data file (20-30 businesses)
2. *Agent B (parallel)*: ServiceCard component + Directory page (`/directory`) with category filter
3. *Agent C (parallel)*: Service detail page (`/directory/[id]`) — SSR
4. *Orchestrator*: Wire Fuse.js search, CategoryGrid on landing page (depends on B)
5. *Test agent*: Write tests for search, filtering, SSR rendering

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

**Agent plan**:
1. *Agent A (parallel)*: RecommendButton component + Firestore write/toggle logic
2. *Agent B (parallel)*: Recommender avatars component (fetch from `public_profiles`)
3. *Orchestrator*: Wire into ServiceCard + detail page, add recs list to `/account`
4. *Test agent*: Write tests for recommend/un-recommend, count integrity

**Tests**:
- Recommend button adds recommendation to Firestore
- Count increments/decrements correctly
- Recommender avatars display on service cards
- User can see their recommendations on account page
- Can't recommend same service twice

---

### Block 5: Suggest a Business

**Goal**: Community members can submit new businesses for admin approval

**Agent plan**:
1. *Agent A (parallel)*: Suggest form (`/suggest`) + Firestore write
2. *Agent B (parallel)*: Admin suggestions page (`/admin/suggestions`) — list, approve, reject
3. *Orchestrator*: Wire approve action (copy to `services/`), success UI

**Tests**:
- Form submission creates doc in `suggested_services/`
- Admin sees pending suggestions
- Approve creates new service doc
- Reject updates status
- Non-admin can't access admin page

---

### Block 6: Events

**Goal**: Events listing with filtering, admin entry, landing page widget

**Agent plan**:
1. *Agent A (parallel)*: EventCard component + Events page (`/events`) with filters
2. *Agent B (parallel)*: Admin events page (`/admin/events`) — CRUD
3. *Agent C (parallel)*: Landing page events widget — next 3 upcoming
4. *Orchestrator*: Newsletter parser utility (if sample provided)

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

## Autonomous Verification Plan

Every block goes through this pipeline **before I involve you**:

### Automated (runs after every block, no human needed)

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│ Build Check  │───▶│ Unit Tests   │───▶│ Lint + Types  │───▶│ Review Agent │
│ npm run build│    │ npm test     │    │ tsc --noEmit  │    │ Code quality │
└─────────────┘    └──────────────┘    └───────────────┘    └──────────────┘
       │                  │                    │                     │
       ▼                  ▼                    ▼                     ▼
   FAIL → fix         FAIL → fix          FAIL → fix          Issues → fix
   and retry          and retry            and retry            and retry
                                                                    │
                                                                    ▼
                                                        ┌──────────────────┐
                                                        │ Deploy to Vercel │
                                                        │ preview branch   │
                                                        └──────────────────┘
```

**Step 1: Build** — `npm run build` must pass. If it fails, fix and retry (up to 3 attempts).

**Step 2: Tests** — `npm test` must pass. Test agent writes tests for each block's features. Tests cover:
- Component rendering (React Testing Library)
- Firestore read/write logic (mocked)
- Search results accuracy
- Auth state transitions
- Admin access control

**Step 3: Type check** — `tsc --noEmit` must pass. No type errors allowed.

**Step 4: Code review agent** — Automated review checking:
- No hardcoded secrets or API keys
- No `console.log` in production code
- Components follow established patterns
- Firestore security rules match data access patterns
- No unused imports or dead code

**Step 5: Deploy** — Push to preview branch, deploy to Vercel, verify URL loads.

### After All Blocks Complete (still autonomous)

**Integration verification** — I run a full walkthrough simulating a user:
1. Visit landing page → verify hero, categories, events render
2. Click category → verify filtered directory loads
3. Search "plumber" → verify results appear
4. Click service → verify detail page with SSR
5. Login → verify auth flow
6. Recommend a service → verify count updates
7. Submit a suggestion → verify it appears in admin
8. Visit events → verify listing with filters
9. Check mobile viewport → verify responsive layout
10. Check `view-source` → verify SSR content + meta tags

**Security audit agent** — Runs after Block 2 and Block 8:
- Firestore rules: no unauthorized read/write paths
- No API keys exposed in client bundle
- Auth redirects work (can't access gated pages without login)
- Admin pages inaccessible to non-admin users

### What I Hand Off to You

After autonomous verification passes, I give you:
1. Preview URL on Vercel
2. Summary of what was built + what changed
3. Any issues I couldn't resolve autonomously
4. Screenshot comparisons (if design agent is available)

**You only need to:**
- Test Facebook OAuth with your real account (I can't do this)
- Eyeball the design against your preferred concept
- Approve the Vercel production deploy

---

## What I Need From You (Blocking Items)

### Before I Can Start

| Item | Why | How |
|------|-----|-----|
| Firebase project created | Can't write auth or data code without it | console.firebase.google.com → new project |
| Firebase web app config | Needed for `lib/firebase.ts` | Project Settings → Web App → copy config |
| Facebook Developer App | Can't build login without it | developers.facebook.com → Create App |
| Facebook App ID + Secret | Firebase Auth needs these | App Settings → Basic |
| `.env.local` file | All secrets go here | I'll give you the template, you fill in values |
| Design choice (V1 or V2) | Determines all UI work | Pick one, or tell me to start with V1 placeholder |

### During Build (Non-Blocking, But Helpful)

| Item | When Needed | Why |
|------|-------------|-----|
| Sample weekly newsletter | Block 6 (Events) | To build the events parser |
| Your email for admin allowlist | Block 2 (Auth) | So you're the first admin |
| Facebook group names/URLs | Block 7 (Scrape) | Which groups to scrape |
| Seed business list (if you have one) | Block 3 (Directory) | Jump-starts the directory |

### After Build (Your Testing)

| Item | Why |
|------|-----|
| Test Facebook login with your account | I can't authenticate as you |
| Review design on your phone | Real device testing |
| Share preview URL with 2-3 friends | Early feedback |
| Submit Facebook App Review | Required before non-devs can log in |

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
