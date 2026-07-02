# E2E Tests — AI Admin Console

Playwright end-to-end tests for the Phase 1 (P0) AI Console screens.

## Run

```bash
npm run test:e2e          # headless, all tests
npm run test:e2e:ui       # interactive UI mode
npm run test:e2e:report   # open last HTML report (CI)
npx playwright test tests/e2e/ai-console.spec.ts:21   # a single test by line
```

The Playwright config (`playwright.config.ts`) auto-starts `npm run dev` and
reuses an already-running dev server locally.

## How it works

- **Auth** — `fixtures.ts` seeds a valid admin session into `localStorage`
  (the keys `TokenManager` reads in `src/shared/contexts/AuthContext.tsx`) and
  mocks `GET /auth/session/validate` → valid, so the `AuthLayout` guard renders
  the admin pages instead of the sign-in form.
- **Backend** — every `/admin/ai/*` endpoint is **mocked** (`installAiMocks`),
  so the suite is deterministic and needs **no live backend at :8888**. Payload
  shapes were captured from the real backend on 2026-07-01.
- **Overrides** — a test may register its own `page.route(...)` before
  navigating to override a single endpoint (degraded state, server-down,
  orphans present, zero results, a pending recommendation). Page routes take
  precedence over the fixture's context routes.

## Coverage (10 tests)

| Screen | Tests |
|--------|-------|
| P0-A Health | providers+coverage+learning render (no page errors) · degraded banner (embedding off) · server-down screen |
| P0-B RAG Index | coverage table · scan → orphans + cleanup CTA · reindex confirm dialog + job result |
| P0-C Search | query runs → scored results · zero-result guidance (threshold vs empty index) |
| P0-D Recommendations | empty-state · pending row → detail drawer (why + analysis + ragEvidence + warnings) + reject validation |

When adding a screen (Phase 2/P1), add a mock in `fixtures.ts` and a `describe`
block here.
