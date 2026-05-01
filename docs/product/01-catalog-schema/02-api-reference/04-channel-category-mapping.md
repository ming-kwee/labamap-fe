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
  "externalId":   "gid://shopify/Collection/987654321",
  "externalSlug": "smartphones",
  "externalName": "Smartphones",
  "syncStatus":   "MAPPED",
  "importedFrom": true,
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
| `externalId` | string | Channel's own category ID — always stored as string |
| `externalSlug` | string? | URL handle on the channel. Null for Amazon/eBay (no slug concept) |
| `externalName` | string | Snapshot of channel's category name at last sync — used for drift detection |
| `syncStatus` | enum | See state machine below |
| `importedFrom` | boolean | `true` = platform category was created by importing this channel collection |
| `lastSyncedAt` | DateTime? | Last successful push-out or pull-confirm |
| `lastDriftAt` | DateTime? | When drift was first detected |
| `driftReason` | string? | Human-readable explanation shown in admin UI |

**Critical backend note:** When looking up a store by `storeId`, use `storeRepository.findByStoreId(storeId)` — NOT `storeRepository.findById(storeId)`. `findById` looks up MongoDB `_id` (ObjectId); `storeId` is a custom application field with a different value.

---

## syncStatus State Machine

```
UNMAPPED → (import wizard or manual map) → PENDING_IMPORT
PENDING_IMPORT → (merchant confirms)     → MAPPED
MAPPED → (channel renames externally)    → DRIFTED
MAPPED → (channel deletes externally)    → UNMAPPED
MAPPED → (push-out API fails)            → PUSH_FAILED
DRIFTED → (merchant resolves)            → MAPPED
PUSH_FAILED → (retry succeeds)           → MAPPED
```

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

export const IMPORT_CAPABLE_CHANNELS = ["shopify", "woocommerce", "etsy"] as const;
```

---

## Endpoints

### GET `/admin/channel-category-mappings?organizationId=`

Returns all mapping documents for the organization.
Also accepts `?categoryId=` to filter to one category.

**Response:** `ChannelCategoryMapping[]`

---

### GET `/admin/channel-category-mappings/import/preview`

Fetches importable collections from the channel via backend proxy.

**Query params:** `storeId`, `organizationId`

**Response:** `ImportableCollection[]`
```json
[
  {
    "externalId":     "gid://shopify/Collection/987654321",
    "externalName":   "Smartphones",
    "externalSlug":   "smartphones",
    "collectionType": "manual",
    "productCount":   89
  },
  {
    "externalId":     "gid://shopify/Collection/111111111",
    "externalName":   "New Arrivals",
    "externalSlug":   "new-arrivals",
    "collectionType": "smart",
    "productCount":   34
  }
]
```

`collectionType: "smart"` = Shopify auto-rule collection; recommend merchant skip these.

---

### POST `/admin/channel-category-mappings/import`

Creates `product_categories` + `channel_category_mappings` with `PENDING_IMPORT` status.

**Request:**
```json
{
  "storeId":             "store-ObjectId",
  "organizationId":      "org_123",
  "selectedExternalIds": ["gid://shopify/Collection/987654321"]
}
```

**Response:**
```json
{ "importedCount": 7, "categoryIds": ["ObjectId1", "ObjectId2"] }
```

---

### POST `/admin/channel-category-mappings/import/confirm`

Promotes `PENDING_IMPORT` → `MAPPED`. Returns `204 No Content`.

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

Returns channel categories with fuzzy match suggestions against existing platform categories. Used when connecting a second channel after the first import has been done.

**Query params:** `storeId`, `organizationId`

**Response:** `FuzzyMatchSuggestion[]`
```json
[
  {
    "externalId":            "42",
    "externalName":          "Phones & Tablets",
    "externalSlug":          "phones-tablets",
    "suggestedCategoryId":   "ObjectId_Smartphones",
    "suggestedCategoryName": "Smartphones",
    "matchConfidence":        87
  }
]
```

---

### POST `/admin/channel-category-mappings/second-channel`

Creates `MAPPED` documents for confirmed pairs. Does NOT create new `product_categories`. Returns `204 No Content`.

**Request:**
```json
{
  "storeId":        "store-ObjectId",
  "organizationId": "org_123",
  "mappings": [
    {
      "externalId":   "42",
      "externalName": "Phones & Tablets",
      "externalSlug": "phones-tablets",
      "categoryId":   "ObjectId_Smartphones"
    }
  ]
}
```

---

### PATCH `/admin/channel-category-mappings/{mappingId}/drift/resolve`

**Request:**
```json
{ "resolution": "KEEP_BOTH" }
```

| Resolution | Behaviour |
|-----------|-----------|
| `RENAME_PLATFORM` | Platform category renamed to match channel name; triggers push to all other channels |
| `RENAME_CHANNEL` | Platform calls channel API to revert the rename |
| `KEEP_BOTH` | Dismiss alert; names diverge permanently; sync still works via `externalId` |

**Response:** Updated `ChannelCategoryMapping` document.

---

### POST `/admin/channel-category-mappings/sync-all?organizationId=`

Pushes all `MAPPED` platform categories to all connected channel stores.

**Response:**
```json
{ "syncedCount": 24 }
```

---

### DELETE `/admin/channel-category-mappings/{mappingId}`

Removes the mapping link. Does NOT delete the platform category. Returns `204 No Content`.
