# API Reference — Channel Category Mapping

Base path: `/labamap/api/v1/admin/channel-category-mappings`
Controller: `ChannelCategoryMappingAdminController`

---

## MongoDB Collection: `channel_category_mappings`

One document per (ProductCategory × ChannelStoreConnection) pair.

```json
{
  "_id":          "ObjectId",
  "categoryId":   "ObjectId",
  "categoryName": "Smartphones",
  "storeId":      "ObjectId",
  "channelType":  "shopify",
  "externalId":   "gid://shopify/TaxonomyCategory/aa-1-1-1",
  "externalSlug": null,
  "externalName": "Smartphones",
  "syncStatus":   "MAPPED",
  "importedFrom": false,
  "lastSyncedAt": "2026-04-01T09:00:00Z",
  "lastDriftAt":  null,
  "driftReason":  null,
  "createdAt":    "2026-01-15T08:00:00Z",
  "updatedAt":    "2026-04-01T09:00:00Z"
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `categoryId` | ObjectId | FK → `product_categories._id` |
| `categoryName` | string | Denormalized for display only |
| `storeId` | ObjectId | FK → custom `storeId` field on channel stores document — **NOT the MongoDB `_id`** |
| `channelType` | string | `"shopify"` \| `"woocommerce"` \| `"amazon"` \| `"tiktok"` \| `"ebay"` \| etc. |
| `externalId` | string | Channel's own category ID, always stored as string. Shopify: `"gid://shopify/TaxonomyCategory/aa-1-1-1"` (taxonomy GID — **not** a Collection GID). WooCommerce/Etsy: numeric collection ID as string. Amazon: Browse Node ID. |
| `externalSlug` | string? | URL handle on the channel. `null` for Shopify taxonomy (taxonomy nodes have no slug), Amazon, eBay, TikTok. |
| `externalName` | string | Channel's category name at time of mapping. For Type 2 channels this is display-only and never drifts. |
| `syncStatus` | enum | See state machine below |
| `importedFrom` | boolean | `true` = platform category was created by importing this channel collection. Always `false` for Shopify/Amazon/TikTok/eBay (Type 2 channels never create platform categories). |
| `lastSyncedAt` | DateTime? | Last successful push-out or pull-confirm. For Type 2 channels, set when the mapping is first confirmed. |
| `lastDriftAt` | DateTime? | When drift was first detected. Always `null` for Type 2 channels. |
| `driftReason` | string? | Human-readable explanation shown in admin UI. Always `null` for Type 2 channels. |

**Critical backend note:** When looking up a store by `storeId`, use `storeRepository.findByStoreId(storeId)` — NOT `storeRepository.findById(storeId)`. `findById` looks up MongoDB `_id` (ObjectId); `storeId` is a custom application field with a different value.

---

## MongoDB Collection: `channel_taxonomy_cache`

Shared cache for all channels with a fixed, channel-owned taxonomy (Shopify Product
Taxonomy, Amazon Browse Tree, etc.). Global — one collection for all channels and all
merchants. The taxonomy is channel-owned and identical regardless of which store's token
is used to fetch it.

```json
{
  "_id":          "shopify:gid://shopify/TaxonomyCategory/aa-1-1-1",
  "channelType":  "shopify",
  "nodeId":       "gid://shopify/TaxonomyCategory/aa-1-1-1",
  "name":         "Smartphones",
  "fullName":     "Electronics > Phones > Smartphones",
  "level":        3,
  "isLeaf":       true,
  "isRoot":       false,
  "childrenIds":  [],
  "ancestorIds":  [
    "gid://shopify/TaxonomyCategory/aa-1",
    "gid://shopify/TaxonomyCategory/aa-1-1"
  ],
  "cachedAt":     "2026-05-04T00:00:00Z"
}
```

`_id` is a composite `"{channelType}:{nodeId}"` — prevents cross-channel ID collisions.
`nodeId` is the channel's own identifier; it is the value returned as `id` in API
responses and stored as `externalId` in `channel_category_mappings`.

TTL index on `cachedAt`: 7 days. On cache miss, `ChannelTaxonomyService.fetchAndCacheAll()`
fetches all pages and bulk-upserts. Indexes are ensured at startup by `ChannelTaxonomyIndexMigration` (Order 150).

```javascript
db.channel_taxonomy_cache.createIndex({ "cachedAt": 1 }, { expireAfterSeconds: 604800, name: "idx_cachedAt_ttl" })
db.channel_taxonomy_cache.createIndex({ "channelType": 1 }, { name: "idx_channelType" })
db.channel_taxonomy_cache.createIndex({ "nodeId": 1 }, { name: "idx_nodeId" })
db.channel_taxonomy_cache.createIndex({ "level": 1 }, { name: "idx_level" })
db.channel_taxonomy_cache.createIndex({ "isRoot": 1 }, { name: "idx_isRoot" })
db.channel_taxonomy_cache.createIndex({ "isLeaf": 1 }, { name: "idx_isLeaf" })
// Compound for child lookup: findByChannelTypeAndNodeIdIn
db.channel_taxonomy_cache.createIndex({ "channelType": 1, "nodeId": 1 }, { name: "idx_channelType_nodeId" })
```

All indexes are created at startup by `ChannelTaxonomyIndexMigration` (Order 150).

---

## syncStatus State Machine

```
UNMAPPED → (import wizard)              → PENDING_IMPORT   [Type 1: WooCommerce, Etsy]
PENDING_IMPORT → (merchant confirms)    → MAPPED           [Type 1 only]
UNMAPPED → (taxonomy mapper confirms)   → MAPPED           [Type 2: direct, no PENDING_IMPORT]
MAPPED → (channel renames externally)   → DRIFTED          [Type 1 only]
MAPPED → (channel deletes externally)   → UNMAPPED         [Type 1 only]
MAPPED → (push-out API fails)           → PUSH_FAILED      [Type 1 only]
DRIFTED → (merchant resolves)           → MAPPED           [Type 1 only]
PUSH_FAILED → (retry succeeds)          → MAPPED           [Type 1 only]
```

Shopify, Amazon, TikTok, eBay: transition is `UNMAPPED → MAPPED` on confirmation.
No `PENDING_IMPORT` step, no drift transitions, no push-out failures ever.

---

## Indexes

```javascript
db.channel_category_mappings.createIndex({ storeId: 1, externalId: 1 }, { unique: true })
db.channel_category_mappings.createIndex({ storeId: 1, syncStatus: 1 })
db.channel_category_mappings.createIndex({ categoryId: 1 })
db.channel_category_mappings.createIndex({ categoryId: 1, syncStatus: 1 })
```

---

## TypeScript Types

```typescript
// src/app/omni-admin/channel-category-mapping/_types/channel-mapping.ts

export type SyncStatus =
  | "MAPPED" | "DRIFTED" | "UNMAPPED" | "PENDING_IMPORT" | "PUSH_FAILED";

export type DriftResolution =
  | "RENAME_PLATFORM" | "RENAME_CHANNEL" | "KEEP_BOTH";

// Type 1: merchant-owned collections — import wizard creates platform categories from these
export const IMPORT_CAPABLE_CHANNELS = ["woocommerce", "etsy"] as const;
export type ImportCapableChannel = typeof IMPORT_CAPABLE_CHANNELS[number];

// NOTE: There is NO TAXONOMY_CHANNELS constant in the frontend.
// Taxonomy capability is driven by store.taxonomyEnabled from the backend
// (ChannelConfiguration.taxonomyConfig.enabled). Adding a hardcoded list
// here would go out of sync silently when new taxonomy channels are activated.

// One node returned by GET /taxonomy/{channelType}/children
export interface TaxonomyCategory {
  id: string;          // e.g. "gid://shopify/TaxonomyCategory/aa-1-1-1"
  name: string;        // "Smartphones"
  fullName: string;    // "Electronics > Phones > Smartphones"
  level: number;       // 0 = root
  isLeaf: boolean;
  isRoot: boolean;
  childrenIds: string[];
  ancestorIds: string[];
}
```

---

## Endpoints

### GET `/admin/channel-category-mappings?organizationId=`

Returns all mapping documents for the organization.
Also accepts `?categoryId=` to filter to one category.

**Response:** `ChannelCategoryMapping[]`

---

### GET `/admin/channel-category-mappings/taxonomy/{channelType}/children`

**NEW endpoint.** Serves the taxonomy tree picker UI for Type 2 channels.
Returns direct children of a taxonomy node. Omit `parentId` to get root nodes.

**Path param:** `channelType` — `shopify` | `amazon` | `tiktok` | `ebay`

**Query params:** `storeId`, `organizationId`, `parentId` (optional)

**Response:** `TaxonomyCategory[]`
```json
[
  {
    "id":          "gid://shopify/TaxonomyCategory/aa-1-1-1",
    "name":        "Smartphones",
    "fullName":    "Electronics > Phones > Smartphones",
    "level":       3,
    "isLeaf":      true,
    "isRoot":      false,
    "childrenIds": [],
    "ancestorIds": [
      "gid://shopify/TaxonomyCategory/aa-1",
      "gid://shopify/TaxonomyCategory/aa-1-1"
    ]
  }
]
```

**Backend implementation:**
1. The controller calls `ChannelTaxonomyService.isTaxonomyChannel(channelType)`, which
   reads `ChannelConfiguration.taxonomyConfig.enabled` from MongoDB — no hardcoded channel
   names. Returns `404` if the channel does not have a taxonomy configured.
2. `ChannelTaxonomyService.getChildren(channelType, storeId, organizationId, parentId)`:
   - Calls `ensureCache()`, which counts documents. If count < `config.minCacheSize`
     (default 500), deletes any partial cache and calls `fetchAndCacheAll()`.
   - `fetchAndCacheAll()` runs the GraphQL paginated fetch (driven entirely by
     `ChannelConfiguration.TaxonomyConfig`) then runs a BFS traversal: after the initial
     flat-list fetch returns root nodes only, it repeatedly collects all `childrenIds` not
     yet in the accumulated set and batch-fetches them via Shopify's `nodes(ids: $ids)`
     query (250 per batch) until no missing IDs remain. The complete tree (~10,000 nodes)
     is then bulk-upserted.
   - If `parentId` is null: `findByChannelTypeAndIsRootTrue(channelType)`
   - If `parentId` is set: `findByChannelTypeAndNodeId(channelType, parentId)` to load the
     parent, then `findByChannelTypeAndNodeIdIn(channelType, parent.getChildrenIds())` for
     direct children. Lookup is by `nodeId` field (not `_id`) to avoid any format dependency.
3. Returns `TaxonomyCategoryDto[]` where `id` is the channel's own `nodeId`.

`storeId` is required for the initial cache fill (an OAuth token is needed for the API
call). Once the cache is warm it is not used.

**Adding support for a new taxonomy channel** requires only a data change: seed a
`TaxonomyConfig` in `ChannelConfigurationDataLoader` for the new channel — no Java code
changes to `ChannelTaxonomyService` are needed.

---

### GET `/admin/channel-category-mappings/import/preview`

Fetches importable collections from the channel via backend proxy.

**Applies to WooCommerce and Etsy only.** Do not call for Shopify stores — use
`/taxonomy/shopify/children` instead.

**Query params:** `storeId`, `organizationId`

**Response:** `ImportableCollection[]`
```json
[
  {
    "externalId":     "42",
    "externalName":   "Smartphones",
    "externalSlug":   "smartphones",
    "collectionType": "manual",
    "productCount":   89
  },
  {
    "externalId":     "99",
    "externalName":   "New Arrivals",
    "externalSlug":   "new-arrivals",
    "collectionType": "smart",
    "productCount":   34
  }
]
```

`collectionType: "smart"` = auto-rule collection; recommend merchant skip these.

---

### POST `/admin/channel-category-mappings/import`

Creates `product_categories` + `channel_category_mappings` with `PENDING_IMPORT` status.

**Applies to WooCommerce and Etsy only.**

**Request:**
```json
{
  "storeId":             "store-ObjectId",
  "organizationId":      "org_123",
  "selectedExternalIds": ["42", "57"]
}
```

**Response:**
```json
{ "importedCount": 7, "categoryIds": ["ObjectId1", "ObjectId2"] }
```

---

### POST `/admin/channel-category-mappings/import/confirm`

Promotes `PENDING_IMPORT` → `MAPPED`. Returns `204 No Content`.

**Applies to WooCommerce and Etsy only.**

**Request:**
```json
{
  "storeId":        "store-ObjectId",
  "organizationId": "org_123",
  "categoryIds":    ["ObjectId1", "ObjectId2"]
}
```

---

### GET `/admin/channel-category-mappings/second-channel/preview`

Returns channel categories with fuzzy-match suggestions against existing platform categories.
Used both for Type 2 channels (Shopify/Amazon/TikTok/eBay) connecting for the first time,
and for Type 1 channels (WooCommerce/Etsy) connecting after the platform tree already exists.

The response shape is identical regardless of channel type — only the data source differs.

**Query params:** `storeId`, `organizationId`

**Response:** `FuzzyMatchSuggestion[]`

For a Shopify store:
```json
[
  {
    "externalId":            "gid://shopify/TaxonomyCategory/aa-1-1-1",
    "externalName":          "Smartphones",
    "externalSlug":          null,
    "suggestedCategoryId":   "ObjectId_Smartphones",
    "suggestedCategoryName": "Smartphones",
    "matchConfidence":       97
  },
  {
    "externalId":            "gid://shopify/TaxonomyCategory/aa-1-1-2",
    "externalName":          "Feature Phones",
    "externalSlug":          null,
    "suggestedCategoryId":   null,
    "suggestedCategoryName": null,
    "matchConfidence":       0
  }
]
```

**Backend routing by channel type:**
```
if isImportCapable(channelType):
    fetch merchant's channel collections → fuzzy-match against platform categories
else:
    fetch taxonomy nodes from cache (isLeaf: true) → fuzzy-match against platform categories
```

For Shopify: restrict fuzzy-match candidates to `isLeaf: true` taxonomy nodes to avoid
matching intermediate navigation nodes ("Electronics", "Phones") to leaf platform categories
("Smartphones"). A leaf-only match produces accurate, actionable suggestions.

---

### POST `/admin/channel-category-mappings/second-channel`

Creates `MAPPED` documents for confirmed pairs. Does NOT create new `product_categories`.
Returns `204 No Content`.

For Type 2 channels the status is set directly to `MAPPED` — no `PENDING_IMPORT` step.

**Request:**
```json
{
  "storeId":        "store-ObjectId",
  "organizationId": "org_123",
  "mappings": [
    {
      "externalId":   "gid://shopify/TaxonomyCategory/aa-1-1-1",
      "externalName": "Smartphones",
      "externalSlug": null,
      "categoryId":   "ObjectId_Smartphones"
    }
  ]
}
```

---

### PATCH `/admin/channel-category-mappings/{mappingId}/drift/resolve`

**Applies to Type 1 channels (WooCommerce, Etsy) only.** Type 2 channels never enter
`DRIFTED` status — this endpoint should return `400` if called for a Type 2 mapping.

**Request:**
```json
{ "resolution": "KEEP_BOTH" }
```

| Resolution | Behaviour |
|-----------|-----------|
| `RENAME_PLATFORM` | Platform category renamed to match channel name; triggers push to all other Type 1 channels |
| `RENAME_CHANNEL` | Platform calls channel API to revert the rename |
| `KEEP_BOTH` | Dismiss alert; names diverge permanently; sync still works via `externalId` |

**Response:** Updated `ChannelCategoryMapping` document.

---

### POST `/admin/channel-category-mappings/sync-all?organizationId=`

Pushes all `MAPPED` platform categories to all connected channel stores.

**Shopify, Amazon, TikTok, eBay: no-op.** Taxonomy is read-only. The adapter for these
channels returns immediately without making any API call. `syncedCount` in the response
counts only successful Type 1 channel pushes (WooCommerce, Etsy).

**Response:**
```json
{ "syncedCount": 4 }
```

---

### DELETE `/admin/channel-category-mappings/{mappingId}`

Removes the mapping link. Does NOT delete the platform category. Returns `204 No Content`.

---

## Backend Implementation Notes

### `ChannelTaxonomyService` — generic, config-driven

`ChannelTaxonomyService` has no channel-specific code. All fetch behaviour is driven by
`ChannelConfiguration.TaxonomyConfig` stored in MongoDB:

| Field | Purpose |
|-------|---------|
| `enabled` | `true` = channel has a fixed taxonomy; no import wizard |
| `fetchStrategy` | `GRAPHQL` (Shopify) or `REST` (future channels) |
| `graphqlQuery` | Full query string for the initial paginated flat-list fetch |
| `apiVersion` | Substituted into `apiPath` at runtime |
| `apiPath` | URL path template, e.g. `/admin/api/{apiVersion}/graphql.json` |
| `dataPath` | Dot-notation to the paginated container in the response |
| `minCacheSize` | Minimum node count to treat the cache as complete. Default 500. If the stored count is below this threshold, the cache is treated as partial, deleted, and a full re-fetch is triggered. Shopify has ~10,000 nodes so 500 is a safe lower bound. |

Shopify's `TaxonomyConfig` (with `minCacheSize: 500`) is seeded by
`ChannelConfigurationDataLoader` on startup. To add a new taxonomy channel, seed a
`TaxonomyConfig` for it — zero Java code changes.

### `isTaxonomyChannel` — config-driven, not a hardcoded set

```java
// ChannelTaxonomyService
public Mono<Boolean> isTaxonomyChannel(String channelType) {
    return channelService.getActiveChannelById(channelType.toLowerCase())
        .map(config -> config.getTaxonomyConfig() != null
                && Boolean.TRUE.equals(config.getTaxonomyConfig().getEnabled()))
        .defaultIfEmpty(false);
}
```

`ChannelCategoryImportService` delegates to this method for both `previewSecondChannel()`
and `syncStoreForDrift()` — both are fully reactive and branch on this result.

### `sync-all` — Type 2 channels skipped reactively

```java
// ChannelCategoryImportService.syncStoreForDrift()
.flatMap(store -> isTaxonomyChannel(store.getChannelType())
    .flatMap(isTaxonomy -> {
        if (isTaxonomy) return Mono.just(0);   // no drift possible — skip
        return storeConnectionService.getDecryptedCredentials(...)
            .flatMap(creds -> fetchChannelCollections(store, creds))
            ...
    }))
```

### `second-channel/preview` — Type 2 uses leaf taxonomy nodes

```java
// ChannelCategoryImportService.previewSecondChannel()
.flatMap(store -> isTaxonomyChannel(store.getChannelType())
    .flatMap(isTaxonomy -> {
        if (isTaxonomy) {
            // Leaf-only: avoids matching "Electronics" to platform leaf "Smartphones"
            return channelTaxonomyService
                .getLeafNodes(store.getChannelType(), storeId, organizationId)
                .collectList()
                .flatMap(leafNodes -> categoryRepository.findAll().collectList()
                    .map(platformCats -> buildFuzzyMatchesFromTaxonomy(leafNodes, platformCats)));
        }
        // Type 1: fetch merchant's channel collections and fuzzy-match
        return storeConnectionService.getDecryptedCredentials(organizationId, storeId)
            .flatMap(creds -> fetchChannelCollections(store, creds))
            ...
    }))
```

### Controller endpoint — taxonomy children

```java
// ChannelCategoryMappingAdminController
@GetMapping("/taxonomy/{channelType}/children")
public Mono<ResponseEntity<List<TaxonomyCategoryDto>>> getTaxonomyChildren(
    @PathVariable String channelType,
    @RequestParam String storeId,
    @RequestParam String organizationId,
    @RequestParam(required = false) String parentId) {
    return channelTaxonomyService.isTaxonomyChannel(channelType)
        .flatMap(isTaxonomy -> {
            if (!isTaxonomy) return Mono.just(ResponseEntity.notFound().<List<TaxonomyCategoryDto>>build());
            return channelTaxonomyService
                .getChildren(channelType, storeId, organizationId, parentId)
                .map(ResponseEntity::ok);
        });
}
```

### `ChannelTaxonomyCacheRepository` — query methods

```java
Mono<Long>   countByChannelType(String channelType)
Flux<Doc>    findByChannelTypeAndIsRootTrue(String channelType)
Flux<Doc>    findByChannelTypeAndIsLeafTrue(String channelType)
Mono<Doc>    findByChannelTypeAndNodeId(String channelType, String nodeId)
Flux<Doc>    findByChannelTypeAndNodeIdIn(String channelType, Iterable<String> nodeIds)
Flux<Doc>    findByNodeId(String nodeId)
Mono<Void>   deleteByChannelType(String channelType)
```

**Child lookup uses `nodeId` field, not `_id`.**
The `_id` is the composite `"{channelType}:{nodeId}"`. Children are looked up by
`findByChannelTypeAndNodeIdIn(channelType, parent.getChildrenIds())`, matching the `nodeId`
field directly against the raw Shopify GIDs stored in `childrenIds`. This avoids any
format dependency on the `_id` prefix and is independent of how `ancestorIds` is populated.

`findByChannelTypeAndAncestorIdsContainingAndLevel` is no longer used — it was replaced
by the `childrenIds`-based direct lookup which is simpler and reliable.

### Why `taxonomy.categories` pagination was insufficient

Shopify's `taxonomy.categories(first: 250)` returns the 26 root-level nodes only and
immediately sets `hasNextPage: false`. It does NOT return the full ~10,000-node tree via
pagination. Child nodes are only reachable through `childrenIds` on their parent.

The BFS traversal in `ChannelTaxonomyService.fetchMissingChildrenBFS()` solves this:

```
1. Initial fetch via taxonomy.categories → 26 root nodes
2. Collect all childrenIds not yet in accumulated set → missing IDs
3. Batch-fetch missing IDs via nodes(ids: $ids) with ... on TaxonomyCategory { } (250/batch)
4. Add newly fetched nodes → repeat from step 2 until no missing IDs remain
5. Upsert the full accumulated set (~10,000 nodes)
```

To verify a successful full-tree fetch:
```javascript
db.channel_taxonomy_cache.countDocuments({ channelType: "shopify" })
// Should be several thousand. If still 26, BFS did not run or the nodes(ids) query
// returned errors (check backend logs for "[taxonomy BFS]" lines).
```
