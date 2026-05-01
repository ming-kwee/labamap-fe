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
| Shopify | ✅ Import wizard |
| WooCommerce | ✅ Import wizard |
| Etsy | ✅ Import wizard |

Direction: **Channel → import → Platform** (one-time onboarding)
Then: **Platform → push → Channel** (ongoing, platform is master)

### Type 2: Fixed-taxonomy (channel-owned, read-only)
| Channel | What can be done |
|---------|-----------------|
| Amazon | Map platform → Browse Node only |
| TikTok Shop | Map platform → TikTok category only |
| eBay | Map platform → eBay category only |

Never import Type 2 channels as platform categories — Amazon Browse Node IDs are
meaningless outside Amazon, change without notice, and the tree has 10+ levels.

---

## The Three Sync Operations

### ① IMPORT (Channel → Platform, one-time)
```
1. Platform fetches channel collections via backend proxy
2. Merchant reviews preview, selects/deselects collections
3. Platform creates product_categories + channel_category_mappings (PENDING_IMPORT)
4. Merchant confirms → status transitions to MAPPED
5. Platform auto-suggests ProductType (NLP matching)
```

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

Amazon, TikTok, eBay: push-out is a no-op (fixed taxonomy). The stored `externalId`
pre-fills product listing forms when publishing.

### ③ DRIFT DETECT (Channel → Platform, reactive)
```
Shopify: webhook fires (collections/update) → compare new title vs externalName snapshot
WooCommerce: no webhooks → scheduled daily polling job

On name mismatch:
  → syncStatus = DRIFTED
  → driftReason = "Renamed from 'X' to 'Y' on Shopify"
  → Merchant alerted in admin UI
```

---

## syncStatus State Machine

```
UNMAPPED → (import wizard or manual map) → PENDING_IMPORT
PENDING_IMPORT → (merchant confirms) → MAPPED
MAPPED → (channel renames externally) → DRIFTED
MAPPED → (channel deletes externally) → UNMAPPED
MAPPED → (push-out API fails) → PUSH_FAILED
DRIFTED → (merchant resolves) → MAPPED
PUSH_FAILED → (retry succeeds) → MAPPED
```

---

## Drift Resolution — Three Options

| Option | What happens |
|--------|-------------|
| `RENAME_PLATFORM` | Platform category renamed to match channel; triggers push to all other channels |
| `RENAME_CHANNEL` | Platform calls channel API to revert the rename back |
| `KEEP_BOTH` | Dismiss alert; names diverge permanently; sync still works (uses externalId, not name) |

---

## Second-Channel Mapping

When connecting WooCommerce after Shopify, the platform already has a full category tree.
WooCommerce categories need to be **linked** to existing platform categories, not imported.

```
Backend fetches WooCommerce categories
Runs fuzzy name match against existing platform categories:
  "Phones & Tablets" → 87% match → "Smartphones"
  "Computers"        → 91% match → "Laptops"

Merchant reviews suggestions → confirms
POST /second-channel → creates MAPPED documents
No new product_categories created — links to existing ones
```

---

## Why Platform Becomes Master After Import

If the channel remained master:
- Shopify renames "Smartphones" → platform forced to rename → breaks Amazon/TikTok mappings

With platform as master:
- Shopify renames → platform detects drift (DRIFTED status)
- Amazon, TikTok, WooCommerce: completely unaffected
- Product sync continues normally (uses externalId, not name)

---

## Why a Separate Collection (Not Embedded Array)

Three reasons not to embed channelMappings inside product_categories:

1. **Write contention**: Shopify webhook + WooCommerce polling + TikTok job all updating
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

### Service
`src/app/omni-admin/channel-category-mapping/_services/channel-mapping.service.ts`
```typescript
ChannelMappingService.listAll(orgId)
ChannelMappingService.previewImport(storeId, orgId)
ChannelMappingService.startImport(request)
ChannelMappingService.confirmImport(request)
ChannelMappingService.previewSecondChannel(storeId, orgId)
ChannelMappingService.mapSecondChannel(request)
ChannelMappingService.resolveDrift(mappingId, { resolution })
ChannelMappingService.syncAll(orgId)
ChannelMappingService.deleteMapping(mappingId)
```

### Modals
- `ImportWizardModal.tsx` — steps: pick-store → review → confirming → done
- `DriftResolutionModal.tsx` — shows name diff, 3 radio options, calls `resolveDrift`

### TypeScript Types
`src/app/omni-admin/channel-category-mapping/_types/channel-mapping.ts`
```typescript
export type SyncStatus = "MAPPED" | "DRIFTED" | "UNMAPPED" | "PENDING_IMPORT" | "PUSH_FAILED";
export type DriftResolution = "RENAME_PLATFORM" | "RENAME_CHANNEL" | "KEEP_BOTH";
export const IMPORT_CAPABLE_CHANNELS = ["shopify", "woocommerce", "etsy"] as const;
```
