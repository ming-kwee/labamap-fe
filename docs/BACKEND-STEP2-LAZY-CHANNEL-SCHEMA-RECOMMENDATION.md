# Backend Recommendation — Step 2 lazy per-store channel schema (scale to many stores)

**Date:** 2026-07-04
**Author:** Frontend Team
**Status:** ✅ **DONE (2026-07-05)** — both endpoints shipped & verified live; frontend lazy-load + cache implemented in `ChannelFieldsWizard`.
**Priority:** Medium-High — Step 2 load time grows **linearly** with connected stores. Fine at 3, sluggish at 10–20.
**Endpoint(s):** `POST /api/v1/ecommerce/form-schema/channel-step` (extend) + one new lightweight list endpoint.

---

## 1. Problem (measured live, 3 stores)

Step 2 (`ChannelFieldsWizard`) loads the **full field schema for ALL connected stores in one call**, even
though the merchant edits **one store tab at a time**.

| Call | Time | Size | Scales with #stores? |
|------|------|------|----------------------|
| `POST form-schema/channel-step` (all stores) | 0.57–1.15s (cold) | **53 KB** (~17 KB/store) | **Yes, linear** |
| `GET channel-product-data/{id}` | 0.03–0.60s | 2.6 KB | mild |

Calls run **sequentially** on the frontend, and there is **no cross-navigation cache** (re-fetched on every
Step 2 entry — the common Step 2 → 3 → back flow re-pays the full cost).

**Projection (linear):** 10 stores ≈ 175 KB / ~2–3s; **20 stores ≈ 350 KB / ~3–5s cold**. The backend also does a
per-store channel-config lookup (cf. the `findByChannelId` non-unique bug), so its work is ~O(N) too.

**Root cause:** eager "load everything upfront" for a UI that shows one tab at a time. Reference omnichannel
tools (Ginee, ChannelAdvisor, Linnworks) lazy-load per channel; they never build all channel forms at once.

---

## 2. What the frontend already does well (so scope is backend-side)

- **Tab-based render** — only the *active* store's fields mount (`<ChannelStoreTab schema={activeChannel}>`).
  Rendering does **not** scale with store count.
- **2–3 API calls total**, not N+1 per store.
- CATEGORY_TREE + MERCHANT_API options are already lazy.

So the fix is **not** more frontend rendering work — it's letting the frontend fetch **per store, on demand**.

---

## 3. Proposed backend changes (additive, non-breaking)

### 3.1 New — lightweight store list (drives the tab bar, O(1))

```
GET /api/v1/ecommerce/form-schema/channel-step/stores
      ?masterProductId={id}&organizationId={org}
```

Returns the store list **without the heavy `sections`** — just enough to render tabs + completion badges:

```jsonc
{
  "masterProductId": "…",
  "productTypeId": "…",           // so the frontend can pre-fetch ProductType defaults in parallel
  "stores": [
    {
      "storeId": "shopify-shopify-01",
      "channelType": "shopify",
      "storeName": "My Shop",
      "storeUrl": "my-shop.myshopify.com",
      "displayOrder": 0,
      "completionStatus": "DRAFT",
      "completionPercentage": 40,
      "completionStats": { "requiredTotal": 5, "requiredFilled": 2, "optionalTotal": 8, "optionalFilled": 1 }
    }
    // … one small object per store
  ]
}
```

This is small and cheap regardless of store count → initial tab bar renders **instantly** even at 20 stores.
Completion numbers are **live here** (they change on save), so the frontend reads them from this list, not the
cached schema (see §4).

### 3.2 Extend — per-store schema via optional `storeId`

`POST /api/v1/ecommerce/form-schema/channel-step` — accept an optional `storeId` in the body:

```jsonc
{ "masterProductId": "…", "organizationId": "…", "storeId": "shopify-shopify-01" }
```

- **With `storeId`** → return the **same `ChannelStepSchemaResponse` shape** but with `channels` containing
  **only that one store** (`channels: [ ChannelSchemaPerStore ]`) + `masterProduct`. Build only that store's schema.
- **Without `storeId`** → unchanged (all stores) — **fully backward compatible**.

No new response type needed; the frontend already renders `ChannelSchemaPerStore`.

### 3.3 (Optional) caching headers
Per-store schema is stable between edits; a short `Cache-Control`/`ETag` would let the browser skip refetches.
Not required — the frontend will cache in-session (§4).

---

## 4. How the frontend consumes it (✅ implemented 2026-07-05)

1. On Step 2 open → `GET …/stores` → render the tab bar instantly (O(1)).
2. Fetch the **active** store's schema via `POST …/channel-step {storeId}` (small spinner in the tab body).
3. On tab switch → fetch that store's schema once, then **cache** it in-memory/session keyed by `(masterProductId, storeId)`.
4. **Invalidate** a store's cached schema when that store is saved; refresh its completion from the `/stores` list.
5. Keep the current all-stores call only as a fallback if `/stores` is unavailable.

Result: **initial load O(1)** — 20 stores load as fast as 1; each tab pays one small call once; back-navigation is instant.

---

## 5. Impact

| | Today (eager) | With lazy per-store |
|---|---|---|
| Initial Step 2 load | O(N) — ~3–5s @ 20 stores | **O(1)** — ~one store's schema |
| Tab switch | instant (already loaded) | one small call, then cached |
| Step 2 → 3 → back | full refetch | served from cache |
| Payload @ 20 stores | ~350 KB up front | ~17 KB per viewed tab |

---

## 6. Requested from backend

1. Add `GET /ecommerce/form-schema/channel-step/stores` (lightweight list, §3.1).
2. Accept optional `storeId` on `POST /ecommerce/form-schema/channel-step` → single-store schema (§3.2).
3. Both additive / backward compatible. Frontend ships the lazy-load + cache once these are live.

Contract references (current types the frontend already renders):
`ChannelStepSchemaResponse`, `ChannelSchemaPerStore`, `CompletionStats`
(`src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts`).
