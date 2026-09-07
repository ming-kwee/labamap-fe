# TikTok Shop category API → v202309, and the taxonomy-cache decision

Records two related changes/decisions made 2026-08-26 on `bff-v14`.

Context: the TikTok Shop integration (CreateProduct / JOLT / post-processing) is already on Product API
**v202309**, but the **category + attribute fetch** config lagged on the legacy `/api/products/*` endpoints.
This aligns it, and settles whether TikTok categories should use the shared `taxonomyConfig` path (like eBay).

---

## 1. Version bump: legacy `/api/products/*` → v202309 `/product/202309/*`

Seeded in `CategoryApiConfigDataLoader` (tiktokshop block). Verified against the EcomPHP 202309 client
(endpoint paths + `categories/{category_id}/attributes` path-param fixture) and a 202309 field reference —
NOT guessed.

| | Legacy | v202309 |
|---|---|---|
| Get Categories | `GET /api/products/categories?parent_id=X` | `GET /product/{apiVersion}/categories` |
| Tree model | `CHILDREN_PER_REQUEST` + `RECURSIVE` | **`SINGLE_CALL` + `FLAT_WITH_PARENT_ID`** (whole tree in one call) |
| Tree items path | `data.category_list` | `data.categories` |
| Tree node fields | `id`, `local_name`, `is_leaf` | same + `nodeParentIdField: parent_id` |
| Get Attributes | `GET /api/products/attributes?category_id=X` | `GET /product/{apiVersion}/categories/{category_id}/attributes` |
| category_id passing | query param (`categoryIdQueryParam`) | **PATH segment `{category_id}`** |
| Attr required flag | `is_mandatory` | **`is_requried`** (TikTok's real field name — the typo is intentional) |
| apiVersion | (none) | `202309` (templated via `{apiVersion}`, `EndpointVersionTemplate`) |

Runtime change (generic, additive): `GenericCategoryService.executeAttributeRequest` now substitutes a
`{category_id}` PATH placeholder in the attribute URL (previously only a query param was supported). Other
channels are unaffected — they carry no `{category_id}` in their path.

### ⚠ Verify before relying on this live (NOT fixed by the version bump)

1. **HMAC signing.** TikTok Product API requires `sign` + `timestamp` on every call. `authStrategy` is still
   `API_KEY_QUERY` (no signing) — same as the legacy config; the code only signs when
   `authStrategy=HMAC_SHA256`. So TikTok category fetch has a **pre-existing signing gap** this change does
   not address. (TikTok's signing scheme differs from Shopee's HMAC and needs its own wiring.)
2. **`category_version`** (v1/v2) — the 202309 tree is versioned; may need a `fixedQueryParam`. Not set (value
   unverified).
3. **`is_multiple_selection`** — 202309 exposes a per-attribute multi-select flag; the model does not consume
   it yet (it would map to `MULTISELECT` / `multiple`, cf. `choiceListFieldType`, guide 19).

### Operational note

`CategoryApiConfigDataLoader` **overwrites** the config on restart (preserving only admin `enabled`), so this
lands with `DATA_SEED_ON_STARTUP=true`. But the **tree cache changed shape** (children-per-request → flat), so
clear the TikTok tree cache once: `db.channel_category_cache.deleteMany({ channelType: "tiktokshop" })`.

---

## 2. Are TikTok categories a "taxonomy"? Yes — but do NOT enable `taxonomyConfig` like eBay

**Yes, it is a taxonomy.** `/product/202309/categories` returns TikTok's fixed, platform-wide **product
category tree** (shared category IDs), analogous to eBay's category tree / Shopify's taxonomy — NOT
merchant-created collections (the WIX/Shopify `collections` model).

### `permission_statuses` ≠ custom categories

A common misread: per-shop permission means some shops use their own categories. **No.** Every TikTok shop
uses the **same** category taxonomy (identical IDs). `permission_statuses` is only a per-shop **allow/deny
flag** on those shared categories — whether this shop may *list* under a category (some need
qualification/brand authorization/market eligibility). It is a **publish-time validation** concern, not a
tree-structure or "custom category" concern.

### Why eBay-style `taxonomyConfig` is UNSAFE for TikTok here

`channel_taxonomy_cache` is keyed by **`channelType` only** (`findByChannelTypeAndNodeId`; "global per
channelType"). eBay is safe with this because its config pins **one marketplace** (tree 0 = US). **TikTok is
multi-market**: `/product/202309/categories` returns the tree for the *shop's* market, and trees differ by
region (US ≠ ID ≠ UK…). A `channelType`-only shared cache would let the first shop's region populate the
cache and every other-region shop read the **wrong tree** — a silent cross-region bug.

### Decision: keep the per-store cache (region-safe); no `taxonomyConfig`

Without `taxonomyConfig`, TikTok uses `channel_category_cache`, keyed by
**`channelType + storeId + nodeId`** — each store caches its own market's tree, so it is already region-safe.
Trade-off: no sharing (N shops in one region each fetch that region's tree N times). For a multi-market
deployment this is the correct trade — correctness over dedup. **So `taxonomyConfig` is intentionally left
off.**

### If shared-per-region caching is wanted later (proper path, ~2–4d)

Do NOT copy eBay's block. Make the taxonomy layer **region-aware** first:

1. Add `region`/`market` to `ChannelTaxonomyCacheDocument` + compound index `{channelType, region, nodeId}`.
2. Replace `findByChannelTypeAndNodeId` with `findByChannelTypeAndRegionAndNodeId`.
3. `ChannelTaxonomyService` threads region through fetch + cache writes.
4. Resolve a store's region (add a `region` field on `ChannelStoreConnection`, or derive from the TikTok
   market/credential).

Then `taxonomyConfig.enabled=true` becomes safe: shops in the same region share one fetch; regions stay
isolated.

---

## Code pointers

- Seeder (tiktokshop block + the 3 verify flags): `CategoryApiConfigDataLoader` — TikTok section.
- `{category_id}` path substitution: `GenericCategoryService.executeAttributeRequest`.
- apiVersion templating: `EndpointVersionTemplate` (`PLACEHOLDER = "{apiVersion}"`).
- Taxonomy cache keying (channelType-only): `ChannelTaxonomyCacheRepository.findByChannelTypeAndNodeId`.
- Per-store tree cache keying: `ChannelCategoryRepository.findByChannelTypeAndStoreIdAndNodeId`.
- eBay taxonomyConfig (the single-market precedent): `CategoryApiConfigDataLoader` — eBay section.
