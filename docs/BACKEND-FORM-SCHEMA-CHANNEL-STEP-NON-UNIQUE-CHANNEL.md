# Backend Bug Report — `form-schema/channel-step` 500 "channelId returned non unique result"

**Date:** 2026-07-04
**Author:** Frontend Team
**Status:** ✅ FIXED (backend, 2026-07-04) — query hardened across all 4 request-path callers; needs rebuild+restart to go live. See §8.
**Severity:** High — blocks Step 2 (Channel Fields) for any product **once it has a Product Type**, whenever the org has a duplicated channel record. Surfaces right after the `PRODUCT_TYPE_MISSING` fix (see the sibling report — that one is resolved).
**Endpoint:** `POST /api/v1/ecommerce/form-schema/channel-step`

---

## 1. Summary

With a **valid** `productTypeId` on the product, the endpoint returns **500**:

```json
{
  "status": 500,
  "error": "Internal Server Error",
  "message": "Failed to generate channel step schema: Query { \"$java\" : Query: { \"channelId\" : \"shopify\"}, Fields: {}, Sort: {} } returned non unique result"
}
```

This is a Spring Data Mongo **`IncorrectResultSizeDataAccessException`**: a `findOne`-style query
`{ channelId: "shopify" }` matched **more than one** document where exactly one was expected.

---

## 2. How it surfaces / ordering

The endpoint has two gates:
1. `productTypeId` null/blank → **422 PRODUCT_TYPE_MISSING** (already fixed — sibling report).
2. `productTypeId` present → builds schema → queries channel config by `channelId` → **500 non-unique**.

So the two bugs are sequential: fixing #1 (product type now persists) uncovers #2. A merchant who
finally sets a Product Type still can't reach Step 2 for the affected channel — they now see a raw
"Failed to generate channel step schema … returned non unique result" instead of the form.

---

## 3. Root cause (backend)

Some collection queried during schema generation has **≥2 documents with `channelId: "shopify"`**,
and the code uses a single-result query (`findOne` / `Optional<T>` / `mongoTemplate.findOne`) that
throws when it finds multiple. Candidates: `channel_configuration`, `channel_category_api_schemas`,
or whatever the schema builder reads per channel.

**Not the product's stores.** Verified live: the product's `channel_product_data` has exactly one
`shopify` store (`shopify-shopify-01`). The duplicate is in a **global/org-level channel collection**,
not product-scoped — so it affects every product in the org for that channel.

---

## 4. Reproduction (verified live 2026-07-04)

```bash
ORG="org-e7dac9f8-6353-4168-b9a1-6a7791d71b02"
PID="ccf4bce7-4e5f-4a0a-b88a-e5d216daa8c0"   # product "test 1", productTypeId set to a valid type

curl -i -X POST "http://localhost:8888/labamap/api/v1/ecommerce/form-schema/channel-step" \
  -H "Content-Type: application/json" \
  -d "{\"masterProductId\":\"$PID\",\"organizationId\":\"$ORG\"}"
# → HTTP 500, message: "... Query { channelId: shopify } returned non unique result"
```

---

## 5. Requested fix (backend)

1. **Find the duplicate:** identify which collection has ≥2 `channelId: "shopify"` docs for this org
   and **de-duplicate** (or add the missing unique index that should have prevented it).
2. **Harden the query:** the schema builder should not assume a single result — either enforce a
   **unique index** on `channelId` (per org) so duplicates can't exist, or make the read tolerate
   multiples deterministically (e.g. pick the active/latest) instead of throwing 500.
3. Ideally, wrap unexpected failures in this endpoint as a typed 5xx with a stable code (like the
   `PRODUCT_TYPE_MISSING` treatment) so the frontend can message it cleanly.

---

## 6. Frontend status

No workaround — this is a genuine server error. The Step 2 wizard shows its generic
"Failed to load channel schema" state with the backend message + Retry. We will not special-case a
data-integrity 500. Once the duplicate is removed / query hardened, Step 2 should build normally.

Related: product-type persistence was a **separate frontend bug** (the selected `productTypeId` was
never sent in `productData`) — fixed 2026-07-04. That fix is what exposes this one.

## 7. Quick reference

| | Value |
|---|---|
| Endpoint | `POST /api/v1/ecommerce/form-schema/channel-step` |
| Trigger | product **with** a valid `productTypeId`, org has duplicate `channelId` docs |
| Actual | `500` — `IncorrectResultSizeDataAccessException` on `{ channelId: "shopify" }` |
| Expected | schema built, or a hardened query / unique index preventing the duplicate |
| Scope | org-level (affects all products for the duplicated channel), not product-scoped |

---

## 8. Backend fix applied (2026-07-04)

**Confirmed root cause (live):** `GET /api/v1/channels` (active-only) shows **one** `shopify`, yet
`channel-step` 500s on `{channelId:"shopify"} non unique`. Reason: the schema builder used
`ChannelService.getChannelById` → `ChannelConfigurationRepository.findByChannelId` — a **single-result**
query with **no `isActive` filter** → it returns the active config **plus** the leftover deactivated
duplicate(s) → `IncorrectResultSizeDataAccessException` → 500.

Why a deactivated duplicate exists: `ChannelConfigurationDedupMigration` (@Order 1) is **non-destructive**
— it keeps the newest as active and **deactivates** the rest (audit-safe, does not delete). So there is
exactly ≤1 *active* config, but ≥1 *inactive* duplicate can linger — which the non-active-filtered
`findByChannelId` trips over.

**Fix (query hardening, per request §5.2 — tolerate multiples deterministically):**
- New `ChannelConfigurationRepository.findAllByChannelId(channelId)` → `Flux` (all matches).
- New `ChannelService.resolveChannelConfig(channelId)` → reads all, sorts **active-first**, takes
  `.next()` → a single deterministic result that **never throws on duplicates** (picks the active one).
- Swapped **all 4 request-path callers** off `getChannelById` → `resolveChannelConfig`:
  `ChannelStepSchemaService` (the reported one), `ChannelProductDataService` (save Step 2 values),
  `ChannelStoreConnectionService` (connect store), `MerchantDataController` (merchant options) —
  the same latent 500 lived in all four for any duplicated channel.

**Data note:** the inactive duplicate is left in place (harmless now the query tolerates it); the
existing DedupMigration continues to guarantee ≤1 active. No unique index was added because `channelId`
is intentionally non-unique across org-specific vs system-default configs.

**New contract:** `channel-step` returns **200** with the schema even when a duplicate channel row
exists. (Typed 4xx from the sibling fix — 404 unknown product / 422 PRODUCT_TYPE_MISSING — unchanged.)

**Verification:** compile-clean; full Spring context loads (`AdaptivePatternBeanTest`). Live root cause
confirmed on the old build (`channel-step` for `test 1` with its now-valid productType → 500 non-unique,
while `/channels` shows a single active shopify). Live re-test of the 200 result pending rebuild+restart.
