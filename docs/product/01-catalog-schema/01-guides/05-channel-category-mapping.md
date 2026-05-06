# Channel Category Mapping

## What Is Channel Category Mapping?

Each platform ProductCategory can be **linked** to corresponding categories on one or
more sales channels. Each link is an independent document in `channel_category_mappings`.

One platform category → N mapping documents (one per connected store).

A LINK is persistent data. A SYNC is an operation that uses a link.
Deleting a link does NOT delete the platform category.

---

## Two Fundamentally Different Channel Types

### Type 1: Import-capable (merchant-created collections)
| Channel | Import support |
|---------|---------------|
| WooCommerce | ✅ Import wizard |
| Etsy | ✅ Import wizard |

Direction: **Channel → import → Platform** (one-time onboarding)
Then: **Platform → push → Channel** (ongoing, platform is master)

### Type 2: Fixed-taxonomy (channel-owned, read-only)
| Channel | What can be done |
|---------|-----------------|
| Shopify | Map platform → Taxonomy category only |
| Amazon | Map platform → Browse Node only |
| TikTok Shop | Map platform → TikTok category only |
| eBay | Map platform → eBay category only |

Never import Type 2 channels as platform categories. Their taxonomy IDs are meaningless
outside the channel and the trees are fully owned by the channel — merchants cannot
create, rename, or reorganize them.

For Shopify specifically: what looks like a "category" in the storefront is actually a
**Collection** (merchant-created merchandising group), which is a different concept from
the Shopify Product Taxonomy. See [Shopify: Collections vs Taxonomy](#shopify-collections-vs-taxonomy) below.

---

## Shopify: Collections vs Taxonomy

Shopify has two completely separate concepts that are easily confused:

| Concept | Owner | What it is | Used for |
|---------|-------|-----------|----------|
| **Collections** | Merchant | Freely-created storefront groupings ("New Arrivals", "Sale Items") | Storefront display and navigation |
| **Product Taxonomy** | Shopify | Standardized global category tree (~10,000 nodes) | Product classification, Google Shopping sync, Meta integration |

**`channel_category_mappings` uses Product Taxonomy exclusively.**

Collections are a publishing concern — when a product is published to Shopify, the
merchant selects which collections it should appear in (Step 3: publish). That is entirely
separate from category classification and is not stored in `channel_category_mappings`.

The Shopify Product Taxonomy is:
- Fixed and versioned by Shopify (updated quarterly, not per-merchant)
- Read-only — merchants cannot create, rename, or reorganize it
- The same taxonomy is shared by every Shopify store
- Queried via GraphQL Admin API only (no REST equivalent):

```graphql
# Paginate until hasNextPage = false — full tree is ~40 pages of 250 nodes
query TaxonomyCategories($cursor: String) {
  taxonomy {
    categories(first: 250, after: $cursor) {
      pageInfo { hasNextPage  endCursor }
      nodes {
        id          # "gid://shopify/TaxonomyCategory/aa-1-1-1"
        name        # "Smartphones"
        fullName    # "Electronics > Phones > Smartphones"
        level       # 0 = root
        isLeaf
        isRoot
        childrenIds
        ancestorIds
      }
    }
  }
}
```

The backend fetches and caches in `channel_taxonomy_cache` (TTL 7 days, shared across all
taxonomy channels), then serves level-by-level via `/taxonomy/shopify/children`.

**Important:** `taxonomy.categories` returns only the 26 root-level nodes with
`hasNextPage: false`. It does NOT return the full tree in one paginated stream. After
the initial fetch, `ChannelTaxonomyService` runs a BFS traversal: it collects all
`childrenIds` not yet in the cache and batch-fetches them using Shopify's global
`nodes(ids: $ids)` query with an inline `... on TaxonomyCategory { }` fragment (250 IDs
per batch) until no missing IDs remain. The full tree (~10,000 nodes for Shopify) is
accumulated this way.

`externalId` for Shopify mappings stores a taxonomy GID:
`"gid://shopify/TaxonomyCategory/aa-1-1-1"` — NOT a Collection GID.

---

## The Three Sync Operations

### ① IMPORT (Channel → Platform, one-time)

**Applies to: WooCommerce, Etsy only.**

```
1. Platform fetches channel collections via backend proxy
2. Merchant reviews preview, selects/deselects collections
3. Platform creates product_categories + channel_category_mappings (PENDING_IMPORT)
4. Merchant confirms → status transitions to MAPPED
5. Platform auto-suggests ProductType (NLP matching)
```

Shopify does NOT use this flow. Its taxonomy is global and fixed — there is nothing to
import as platform categories. Shopify uses the second-channel mapping flow (see below),
which browses the taxonomy tree and links existing platform categories to taxonomy nodes.

### ② PUSH OUT (Platform → All channels, ongoing)

```
Merchant saves any change to a category:
  Create / Rename / Reparent / Toggle active

Platform:
  → find({ categoryId, syncStatus: "MAPPED" }) on mapping collection
  → For each mapping: call channel adapter with store credentials
  → Success: update lastSyncedAt
  → Failure: set PUSH_FAILED, retry with exponential backoff (3×)
```

**Shopify, Amazon, TikTok, eBay: push-out is a no-op.** Their taxonomy is read-only.
The `ChannelAdapter.isImportCapable()` method returns `false` for these channels and
`sync-all` skips them entirely. The stored `externalId` pre-fills product listing forms
when publishing — no API call is needed.

### ③ DRIFT DETECT (Channel → Platform, reactive)

**Applies to: WooCommerce, Etsy only.**

```
WooCommerce: no webhooks → scheduled daily polling job

On name mismatch:
  → syncStatus = DRIFTED
  → driftReason = "Renamed from 'X' to 'Y' on WooCommerce"
  → Merchant alerted in admin UI
```

Shopify taxonomy is owned by Shopify and versioned globally — individual categories do not
rename without a published taxonomy release. Amazon, TikTok, eBay are similarly stable.
Drift detection is disabled for all Type 2 channels: `ChannelAdapter.supportsDriftDetection()`
returns `false` and the drift scheduler excludes them.

---

## syncStatus State Machine

```
UNMAPPED → (import wizard)             → PENDING_IMPORT   [Type 1 only]
PENDING_IMPORT → (merchant confirms)   → MAPPED           [Type 1 only]
UNMAPPED → (taxonomy mapper confirms)  → MAPPED           [Type 2: direct, no PENDING_IMPORT]
MAPPED → (channel renames externally)  → DRIFTED          [Type 1 only]
MAPPED → (channel deletes externally)  → UNMAPPED         [Type 1 only]
MAPPED → (push-out API fails)          → PUSH_FAILED      [Type 1 only]
DRIFTED → (merchant resolves)          → MAPPED           [Type 1 only]
PUSH_FAILED → (retry succeeds)         → MAPPED           [Type 1 only]
```

For Shopify, Amazon, TikTok, eBay: once mapped, the status stays `MAPPED` permanently.
No drift, no push-out failures, no `PENDING_IMPORT` intermediate step.

---

## Drift Resolution — Three Options

Applies to Type 1 channels (WooCommerce, Etsy) only.

| Option | What happens |
|--------|-------------|
| `RENAME_PLATFORM` | Platform category renamed to match channel; triggers push to all other Type 1 channels |
| `RENAME_CHANNEL` | Platform calls channel API to revert the rename |
| `KEEP_BOTH` | Dismiss alert; names diverge permanently; sync still works (uses externalId, not name) |

---

## Second-Channel Mapping

This is the primary flow for all Type 2 channels (Shopify, Amazon, TikTok, eBay) and
for any Type 1 channel connected after the first import has already established the
platform category tree.

The merchant already has a full platform category tree. They need to **link** each
platform category to the corresponding node in the channel's taxonomy.

```
Backend fetches channel taxonomy:
  Type 2 (Shopify/Amazon/TikTok/eBay): queries fixed taxonomy tree from cache
  Type 1 second-channel (WooCommerce/Etsy): fetches merchant's channel collections

Runs fuzzy name match against existing platform categories:
  "Phones & Tablets" → 87% match → "Smartphones"
  "Computers"        → 91% match → "Laptops"

Merchant reviews suggestions in tree picker UI → confirms
POST /second-channel → creates MAPPED documents
No new product_categories created — links to existing ones
```

For Shopify specifically, the merchant browses the Shopify Product Taxonomy tree
level-by-level (via `/taxonomy/shopify/children`) and accepts or overrides the fuzzy-match
suggestions before confirming. The UX is identical to the `CategoryTreePicker` component
built for Step 2 Phase 3 (`src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/CategoryTreePicker.tsx`).

---

## Why Platform Becomes Master After Import

If the channel remained master:
- WooCommerce renames "Smartphones" → platform forced to rename → breaks Amazon/TikTok/Shopify mappings

With platform as master:
- WooCommerce renames → platform detects drift (DRIFTED status)
- Amazon, TikTok, Shopify taxonomy, eBay: completely unaffected
- Product sync continues normally (uses externalId, not name)

For Shopify taxonomy specifically: the platform never pushes category renames to Shopify
(read-only taxonomy). The mapping is a pure lookup — "what taxonomy node ID do I set on
`product.category` when publishing to this Shopify store?"

---

## Why a Separate Collection (Not Embedded Array)

Three reasons not to embed channelMappings inside product_categories:

1. **Write contention**: WooCommerce polling + TikTok job + Amazon sync all updating
   the same product_categories document → serialize on MongoDB's document lock.
   Separate collection → different documents → no contention.

2. **Compound index limitation**: Finding by `(storeId, externalId)` inside an embedded
   array requires `$elemMatch` and complex `arrayFilters`. Separate collection →
   plain `findOne({ storeId, externalId })` with a compound index.

3. **Drift poll efficiency**: "Find all DRIFTED mappings for store X" scans entire
   collection when embedded. Separate collection → `find({ storeId, syncStatus: "DRIFTED" })`.

**Tradeoff solved by:** denormalized `channelSyncSummary` embedded on product_categories
(recomputed on every mapping status change) — so list page shows badges without a join.

---

## Frontend Codebase

### Page
`src/app/omni-admin/channel-category-mapping/_components/ChannelCategoryMappingPage.tsx`
- Loads tree + stores + mappings in parallel
- Builds `Map<"categoryId-storeId", ChannelCategoryMapping>` for O(1) cell lookup
- Renders matrix table: rows = platform categories, columns = connected stores
- Modal routing: `store.taxonomyEnabled` → `TaxonomyMapperModal`; `store.importCapable` → `ImportWizardModal`

### Service
`src/app/omni-admin/channel-category-mapping/_services/channel-mapping.service.ts`
```typescript
ChannelMappingService.listAll(orgId)
ChannelMappingService.previewImport(storeId, orgId)          // WooCommerce/Etsy only
ChannelMappingService.startImport(request)                   // WooCommerce/Etsy only
ChannelMappingService.confirmImport(request)                 // WooCommerce/Etsy only
ChannelMappingService.browseTaxonomy(channelType, storeId, orgId, parentId?)  // Type 2 channels
ChannelMappingService.previewSecondChannel(storeId, orgId)
ChannelMappingService.mapSecondChannel(request)
ChannelMappingService.resolveDrift(mappingId, { resolution })
ChannelMappingService.syncAll(orgId)
ChannelMappingService.deleteMapping(mappingId)
```

`browseTaxonomy` throws on HTTP 404 with a descriptive message. A 404 from the backend
means the channel is not taxonomy-enabled or the `/taxonomy/{channelType}/children` endpoint
is not yet deployed. It does NOT silently return an empty array.

### Modals
- `ImportWizardModal.tsx` — steps: pick-store → review → confirming → done. Gated by
  `store.importCapable === true`, shown only for WooCommerce and Etsy stores.
- `TaxonomyMapperModal.tsx` — tree picker for Shopify/Amazon/TikTok/eBay. Batch design:
  opens with all unmapped categories for the store, scrolls to the one the merchant clicked
  (`initialCategoryId`). Calls `previewSecondChannel` for fuzzy suggestions, then
  `mapSecondChannel` on confirm. Shows a descriptive error if taxonomy browsing fails.
- `DriftResolutionModal.tsx` — shows name diff, 3 radio options, calls `resolveDrift`.
  Only reachable for Type 1 channel mappings.

### TypeScript Types
`src/app/omni-admin/channel-category-mapping/_types/channel-mapping.ts`
```typescript
export type SyncStatus = "MAPPED" | "DRIFTED" | "UNMAPPED" | "PENDING_IMPORT" | "PUSH_FAILED";
export type DriftResolution = "RENAME_PLATFORM" | "RENAME_CHANNEL" | "KEEP_BOTH";

// Type 1: merchant-owned collections — import wizard creates platform categories
export const IMPORT_CAPABLE_CHANNELS = ["woocommerce", "etsy"] as const;
export type ImportCapableChannel = typeof IMPORT_CAPABLE_CHANNELS[number];

// There is NO TAXONOMY_CHANNELS hardcoded constant.
// Taxonomy capability is determined per-store from store.taxonomyEnabled
// (derived from ChannelConfiguration.taxonomyConfig.enabled on the backend).
// Do not add a TAXONOMY_CHANNELS list — it would go out of sync silently.
export function isImportCapable(channelType: string): boolean { … }
```
