# Scarsdale Buzz — Codebase Analysis & Feedback

*Analysis of [taylorlehman/scarsdalebuzz](https://github.com/taylorlehman/scarsdalebuzz) by Ajay Surie, March 2026*

---

## What You Built

A community-curated service directory for Scarsdale, NY with an AI scheduling agent. ~3,400 lines of JavaScript total. The core loop — neighbors recommend providers, trust builds through multiple endorsements, users hire with confidence — is well-designed and immediately understandable.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vanilla JS, static HTML, Tailwind CSS (CDN) |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Database | Firestore |
| Auth | Firebase Auth + Facebook OAuth |
| AI | Google Generative AI (Gemini 1.5/2.0) |
| SMS | Twilio |
| Hosting | Firebase Hosting |
| Search | Fuse.js (client-side fuzzy matching) |
| Testing | Jest (unit), Playwright (E2E) |

---

## Architecture

```
scarsdalebuzz/
├── public/                     # Static frontend (Firebase Hosting)
│   ├── index.html              # Landing page
│   ├── login.html              # Facebook OAuth
│   ├── directory/
│   │   ├── index.html          # Main directory (browse + search)
│   │   ├── directory.js        # 1,225 lines — search, filtering, recs
│   │   ├── suggest.html        # Community business submissions
│   │   └── suggest.js
│   ├── sunny/
│   │   ├── index.html          # AI agent chat interface
│   │   └── sunny.js            # 816 lines — Sunny agent UI
│   ├── admin/                  # Admin dashboard
│   └── components/             # Shared header, share modal
├── functions/                  # Cloud Functions backend
│   ├── index.js                # 1,349 lines — all cloud functions
│   ├── prompts.js              # Gemini system prompts
│   ├── tools.js                # Gemini tool definitions
│   └── tests/                  # Jest tests
├── scripts/                    # Deploy, import, test utilities
├── firestore.rules             # Security rules
└── firebase.json               # Firebase config
```

---

## Data Model (Well-Designed)

The Firestore data model is clean and practical:

- **`services/{id}`** — name, category, phone, email, recommendations count, recentRecommenders array
- **`services/{id}/recommendations/{userId}`** — individual upvote records
- **`users/{id}`** — private user data (email, displayName, directoryStatus, sunnyBetaStatus)
- **`public_profiles/{id}`** — public-facing subset (name + photo for recommender avatars)
- **`requests/{id}`** — Sunny AI scheduling requests with full chat history
- **`suggested_services/{id}`** — community submissions pending admin approval
- **`config/categories`** — admin-configurable category list

The `public_profiles` / `users` split is smart — lets you show recommender avatars without exposing private data. The `recentRecommenders` array on each service avoids a join query.

---

## What's Working Well

### 1. The Core Loop
The recommendation system is simple and effective. Users recommend, counts go up, trust builds. No complex rating system — just endorsements from real people you can see. This is the right call for a community directory.

### 2. Sunny AI Agent Architecture
The Gemini tool-use loop for the scheduling agent is well thought out:
- User describes issue in chat
- Gemini classifies, picks a provider, generates a title
- Twilio sends SMS to provider
- Provider replies get routed back through Gemini
- Gemini negotiates time/date between parties
- `confirm_appointment` tool finalizes and shares contact info

The tool definitions (`get_plumber_contact_info`, `confirm_appointment`, `manage_request`, `ask_clarifying_question`, `proceed_to_provider`) give the model clear actions to take.

### 3. Gating & Waitlist
The `directoryStatus` and `sunnyBetaStatus` fields let you control rollout. Smart for early-stage when you want quality over quantity.

### 4. Staging/Prod Separation
Having separate Firebase projects for staging and production with a deploy script that handles both is good ops practice.

---

## Feedback: What to Improve

### 1. Tailwind via CDN — Bundle It
```html
<script src="https://cdn.tailwindcss.com"></script>
```
This fails silently in some regions and isn't recommended for production. Bundle Tailwind via PostCSS or switch to a framework with built-in bundling. The CDN also can't tree-shake unused classes.

### 2. Vanilla JS at Scale is Becoming Painful
The three big JS files (`directory.js` at 1,225 lines, `index.js` at 1,349 lines, `sunny.js` at 816 lines) are doing a lot of manual DOM manipulation. This works but makes iteration harder:
- No component reuse (header is duplicated or loaded via a basic component loader)
- State management is ad-hoc (global variables, DOM as state)
- Adding new features means editing monolithic files

Consider: React/Next.js, or even Astro if you want to keep things lightweight. You wouldn't need to rewrite everything — start with the directory page.

### 3. All Cloud Functions in One File
`functions/index.js` at 1,349 lines handles auth, admin, directory, recommendations, Sunny agent, SMS webhooks, and suggestions. Splitting by domain would help:
```
functions/
├── auth.js          # Login, admin claims
├── directory.js     # Service CRUD, search
├── recommendations.js
├── sunny.js         # AI agent logic
├── sms.js           # Twilio webhooks
└── index.js         # Re-exports
```

### 4. Hardcoded Town References
"Scarsdale" appears in HTML titles, copy, prompts, URLs, and component text. For anyone wanting to fork this for their town (like we're doing for Westfield), a config-driven approach would help:
```js
// config.js
export const TOWN = {
  name: 'Scarsdale',
  tagline: "Your neighbors' most trusted recommendations",
  adminDomain: '@tl-labs.com',
  // ...
}
```

### 5. Security Rules Could Be Tighter
The current rules allow `requests` to be publicly readable. For scheduling requests that contain homeowner addresses and phone numbers, consider restricting read access to the request owner + admin.

### 6. No Events Feature
A community directory naturally extends to local events. Adding an events collection with date/category filtering would increase return visits and engagement. This is what differentiates a "directory" from a "community hub."

### 7. Search Could Be Server-Side
Fuse.js works great for small datasets, but loading all services client-side to search them won't scale past a few hundred. Consider Algolia, Typesense, or Firebase Extensions for full-text search as the directory grows.

### 8. Facebook-Only Auth
Facebook OAuth is the right initial choice (fits community angle), but consider adding Google OAuth as a fallback. Some users won't have or want to use Facebook login.

---

## Sunny Agent: Specific Notes

The agent is the most impressive and differentiating part of the product. A few specific suggestions:

1. **Prompt versioning**: The system prompts in `prompts.js` are critical to Sunny's behavior. Version them (even just with comments) so you can track what changed when behavior shifts.

2. **Error recovery in SMS flow**: If a provider doesn't respond within X hours, consider an automated follow-up or fallback to the next-best provider.

3. **Conversation persistence**: The `chatHistory` array on requests is good but will grow unbounded. Consider summarizing older turns or capping history length for the Gemini context window.

4. **Multi-provider support**: Currently the agent picks one provider. For competitive categories (plumber, electrician), contacting 2-3 providers and letting the homeowner choose the best availability would be more useful.

---

## Summary

The core product works. The data model is solid, the recommendation loop is simple and effective, and the Sunny agent is genuinely novel. The main improvements are infrastructure/scaling concerns (bundling, component architecture, function organization) rather than product direction issues.

For Westfield Buzz, we're rebuilding on Next.js + Tailwind (bundled) + Firebase using your data model as the blueprint. The agent is the collaboration opportunity — we'd love to work together on making Sunny multi-town.
