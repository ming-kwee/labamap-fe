# 12 — Integration Verification (Post-Fix Round 2)

> **Date:** 2026-02-25
> **Context:** Second integration review after backend applied all fixes from `11-backend-fixes-required.md`

---

## Backend Fix Verification

All five issues raised in document 11 have been verified from the frontend side:

| # | Issue | Backend fix | Frontend verification |
|---|-------|-------------|----------------------|
| 1 | `isActive` serialised as `"active"` | `@JsonProperty("isActive")` added | `mapStore()` reads `r.isActive ?? r.active` — works with both old and new output ✅ |
| 2 | `Instant` serialised as epoch seconds | `write-dates-as-timestamps: false` | `formatDate()` handles ISO strings; epoch-seconds fallback still present ✅ |
| 3 | Error body format | Already correct | `parseErrorMessage()` reads `body.message ?? body.error` ✅ |
| 4 | `storeUrl` not normalised server-side | `normalizeUrl()` added before save | `normalizeStoreUrl()` on frontend is belt-and-suspenders; both layers now normalise ✅ |
| 5 | Silent deactivation error | No backend change needed | `deactivateError` state renders inline in `StoreCard` ✅ |

---

## Frontend Fixes Applied in Round 2

Two frontend-only issues were found during re-analysis. No backend action required for either.

### Fix A — `completeOAuth` response now goes through `mapStore()`

`channelOAuthService.completeOAuth()` previously cast the response directly to
`ChannelStoreConnection` without normalisation. It now uses the same `mapStore()`
function as all other store-returning endpoints, making the codebase consistent and
protected against any future `isActive`/`active` regression.

### Fix B — Shopify "Connect with Shopify" button background visible in disabled state

The button previously set `backgroundColor: undefined` when disabled, making it
visually invisible (transparent with white text on a white modal). Now the green
`#96BF48` background is always set; the disabled state is communicated by
`disabled:opacity-50` Tailwind class only.

---

## One Note for Backend — OAuth Callback Extra Params

When Shopify redirects back to the OAuth callback URL, it appends several query
parameters beyond `code`, `hmac`, `shop`, and `state`. Current Shopify documentation
lists these additional params on the callback:

- `host` — base64-encoded host string (Shopify App Bridge)
- `timestamp` — Unix timestamp of the redirect

The frontend callback page collects **all** query params that are not `code`,
`state`, or `channelType` and forwards them in the POST body to
`POST /api/v1/oauth/{channelType}/callback`:

```json
{
  "code": "abc123",
  "state": "nonce_xyz",
  "shop": "mystore.myshopify.com",
  "hmac": "def456",
  "host": "bXlzdG9yZS5teXNob3BpZnkuY29tL2FkbWlu",
  "timestamp": "1735000000"
}
```

**Required backend behaviour:** The callback endpoint must accept (and silently
ignore) any unknown fields in the request body. It should only read and validate
`code`, `shop`, `hmac`, and `state`. The `host` and `timestamp` fields can be
discarded.

If the backend uses `@RequestBody @Valid CallbackRequest request` with a strict
DTO that does not have `host` and `timestamp` fields, verify that Jackson is
configured to ignore unknown properties:

```java
// Option A: on the DTO class
@JsonIgnoreProperties(ignoreUnknown = true)
public class CallbackRequest { ... }

// Option B: globally in application.yml
spring:
  jackson:
    deserialization:
      fail-on-unknown-properties: false
```

Spring Boot sets `fail-on-unknown-properties: false` by default since version 2.3,
so this is likely already fine. Confirm this is not overridden anywhere in the
backend configuration.

---

## Current Integration Status

All store-connect flows are verified correct end-to-end:

| Flow | Status |
|------|--------|
| Load stores on page mount | ✅ |
| Empty state when no stores | ✅ |
| Error + retry when API fails | ✅ |
| Connect store (manual — all 10 channels) | ✅ |
| Shopify OAuth initiate → redirect | ✅ |
| OAuth callback → `completeOAuth` → success redirect | ✅ |
| OAuth callback → error state with message | ✅ |
| Deactivate store with confirm dialog | ✅ |
| Deactivation error shown inline | ✅ |
| Optimistic update after connect (sorted by `displayOrder`) | ✅ |
| Store card: `isActive` status badge | ✅ |
| Store card: `connectedAt` / `lastSyncedAt` dates | ✅ |
| Store card: `channelType` badge (all 10 types) | ✅ |
| `storeUrl` duplicate prevention (both layers) | ✅ |
