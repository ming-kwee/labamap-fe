# Phase 3 — Channel Category Sync: Backend Contract Changes

> **Context:** Phase 3 introduces a `channel_category_mappings` collection that tracks which
> platform (master) categories are linked to which channel-side categories, and whether those
> links have drifted. The frontend implementation lives in
> `src/app/omni-admin/channel-category-mapping/`.

---

## 1. New Collection — `channel_category_mappings`

One document per *(ProductCategory × ChannelStoreConnection)* pair.

```js
{
  _id:              ObjectId,           // mapping id
  organizationId:   String,             // tenant scope
  categoryId:       ObjectId,           // → product_categories._id
  categoryName:     String,             // denormalized; update on category rename
  storeId:          ObjectId,           // → channel_stores._id
  channelType:      String,             // "shopify" | "woocommerce" | "etsy" | …
  externalId:       String,             // channel's own category / collection id
  externalSlug:     String | null,      // channel's slug (Shopify handle, etc.)
  externalName:     String,             // name snapshot at last sync (drift reference)
  syncStatus:       String,             // UNMAPPED | PENDING_IMPORT | MAPPED | DRIFTED | PUSH_FAILED
  importedFrom:     Boolean,            // true = platform category was created by this import
  lastSyncedAt:     ISODate | null,
  lastDriftAt:      ISODate | null,
  driftReason:      String | null,      // human-readable e.g. "Name changed from 'Tops' to 'T-Shirts'"
  createdAt:        ISODate,
  updatedAt:        ISODate,
}
```

### Indexes

```js
{ organizationId: 1, categoryId: 1 }         // list by category
{ organizationId: 1, storeId: 1 }            // list by store
{ categoryId: 1, storeId: 1 }                // unique mapping lookup (consider unique index)
{ syncStatus: 1, organizationId: 1 }         // drift dashboard query
```

---

## 2. New Endpoints — `ChannelCategoryMappingAdminController`

Base path: `/labamap/api/v1/admin/channel-category-mappings`

### 2.1 List all mappings for an org

```
GET /?organizationId={orgId}
```

Response: `ChannelCategoryMappingDto[]`

```json
[
  {
    "id": "...",
    "categoryId": "...",
    "categoryName": "Electronics",
    "storeId": "...",
    "channelType": "shopify",
    "externalId": "gid://shopify/Collection/123",
    "externalSlug": "electronics",
    "externalName": "Electronics",
    "syncStatus": "MAPPED",
    "importedFrom": true,
    "lastSyncedAt": "2026-04-01T12:00:00Z",
    "lastDriftAt": null,
    "driftReason": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

---

### 2.2 List mappings for a single category

```
GET /{categoryId}?organizationId={orgId}
```

Response: `ChannelCategoryMappingDto[]` (all store mappings for this category)

---

### 2.3 Preview importable collections from a store

```
GET /import/preview?storeId={storeId}&organizationId={orgId}
```

Calls the channel's API to fetch collections / categories the merchant owns (TYPE 1 channels only:
Shopify, WooCommerce, Etsy). Returns them **without** persisting anything.

Response: `ImportableCollectionDto[]`

```json
[
  {
    "externalId": "gid://shopify/Collection/123",
    "externalName": "T-Shirts",
    "externalSlug": "t-shirts",
    "collectionType": "manual",
    "productCount": 42
  }
]
```

`collectionType`: `"manual"` | `"smart"` | `"unknown"`  
Smart collections (Shopify rule-based) should be flagged — the wizard shows them but recommends skipping.

---

### 2.4 Start import — create platform categories from channel collections

```
POST /import/start
```

Body:
```json
{
  "storeId": "...",
  "organizationId": "...",
  "selectedExternalIds": ["gid://shopify/Collection/123", "gid://shopify/Collection/456"]
}
```

Actions (per selected collection):
1. Create a new `ProductCategory` (name from `externalName`; slug auto-derived; parentId = null → root).
2. Create a `ChannelCategoryMapping` with `syncStatus = PENDING_IMPORT`, `importedFrom = true`.

Response: `ChannelCategoryMappingDto[]` — the newly created PENDING_IMPORT mappings.

---

### 2.5 Confirm import — promote PENDING_IMPORT → MAPPED

```
POST /import/confirm
```

Body:
```json
{
  "storeId": "...",
  "organizationId": "...",
  "categoryIds": ["<categoryId1>", "<categoryId2>"]
}
```

Promotes the listed category mappings from `PENDING_IMPORT` to `MAPPED`.  
Also updates `channelSyncSummary.totalMapped` on each affected `ProductCategory`.

Response: `ChannelCategoryMappingDto[]` — confirmed mappings.

---

### 2.6 Preview second-channel fuzzy matches

```
GET /second-channel/preview?storeId={storeId}&organizationId={orgId}
```

Fetches the new channel's categories and fuzzy-matches them against existing platform categories
(by name similarity, TF-IDF, or Levenshtein distance ≤ threshold).

Response: `FuzzyMatchSuggestionDto[]`

```json
[
  {
    "externalId": "...",
    "externalName": "Mobile Phones",
    "externalSlug": null,
    "suggestedCategoryId": "<categoryId>",
    "suggestedCategoryName": "Smartphones",
    "matchConfidence": 72
  }
]
```

`matchConfidence`: 0–100. Frontend shows "Accept" shortcut at ≥ 70.

---

### 2.7 Confirm second-channel mapping

```
POST /second-channel/map
```

Body:
```json
{
  "storeId": "...",
  "organizationId": "...",
  "mappings": [
    {
      "externalId": "...",
      "externalName": "Mobile Phones",
      "externalSlug": null,
      "categoryId": "<platform categoryId>"
    }
  ]
}
```

Creates `ChannelCategoryMapping` documents with `syncStatus = MAPPED`, `importedFrom = false`.

Response: `ChannelCategoryMappingDto[]`

---

### 2.8 Resolve drift

```
PATCH /{mappingId}/resolve-drift
```

Body:
```json
{
  "resolution": "RENAME_PLATFORM"
}
```

Valid values: `RENAME_PLATFORM` | `RENAME_CHANNEL` | `KEEP_BOTH`

| Value | Action |
|---|---|
| `RENAME_PLATFORM` | Update `ProductCategory.name` to `externalName`; set `syncStatus = MAPPED`. |
| `RENAME_CHANNEL` | Push the platform name to the channel API; set `syncStatus = MAPPED`. |
| `KEEP_BOTH` | Clear `syncStatus` back to `MAPPED`; record `driftReason = "acknowledged"`. |

Response: `ChannelCategoryMappingDto` (updated)

---

### 2.9 Trigger manual sync for all mappings in an org

```
POST /sync?organizationId={orgId}
```

Re-fetches each channel's categories and compares against stored `externalName` snapshots.
Sets `syncStatus = DRIFTED` + `driftReason` + `lastDriftAt` for any that changed.
Sets `lastSyncedAt` on all mappings in the org.

Response: `{ synced: number, drifted: number }`

---

### 2.10 Delete a mapping

```
DELETE /{mappingId}
```

Hard delete. Does NOT delete the linked `ProductCategory`.  
If `importedFrom = true`, return a 409 with a warning body — the frontend should confirm.

Response: `204 No Content`

---

## 3. Changes to Existing Endpoints

### 3.1 `product_categories` — add `channelSyncSummary` embedded field

Add to the `ProductCategoryDocument` MongoDB document:

```java
@Field("channelSyncSummary")
private ChannelSyncSummary channelSyncSummary;

// ChannelSyncSummary value object:
public record ChannelSyncSummary(
    int totalMapped,
    int totalDrifted,
    int totalUnmapped,
    Instant lastSyncedAt
) {}
```

**Updated by:** any operation that changes a mapping's `syncStatus` (import, drift resolution,
sync job). Keep it denormalized — avoids a join on every category tree load.

**Exposed by:** `GET /product-categories/tree` and `GET /product-categories/{id}` — include
`channelSyncSummary` in the response DTO.

---

### 3.2 Java DTO additions

```java
// ProductCategoryDto.java
@JsonInclude(JsonInclude.Include.NON_NULL)
private ChannelSyncSummaryDto channelSyncSummary;

// ChannelSyncSummaryDto.java
public record ChannelSyncSummaryDto(
    int totalMapped,
    int totalDrifted,
    int totalUnmapped,
    String lastSyncedAt   // ISO-8601
) {}
```

---

## 4. Drift Detection — Webhook & Polling

### 4.1 Shopify — real-time webhook

Register `categories/update` webhook on store connect:

```
POST /webhooks/shopify/category-update
```

Payload from Shopify: contains collection id + updated title.  
Handler: look up mapping by `storeId` + `externalId`; if `externalName` differs → set
`syncStatus = DRIFTED`, write `driftReason`, update `channelSyncSummary` on the linked
`ProductCategory`.

---

### 4.2 WooCommerce / Etsy — scheduled polling

Daily job: `CategoryDriftPollingJob`

For each org × store (non-Shopify), fetch current category names from the channel API and
compare against all `MAPPED` mappings' `externalName`. Write drift where detected.

Recommended schedule: `0 2 * * *` (2 AM UTC daily).

---

## 5. MongoDB Indexes Summary

```js
// channel_category_mappings
db.channel_category_mappings.createIndex({ organizationId: 1, categoryId: 1 })
db.channel_category_mappings.createIndex({ organizationId: 1, storeId: 1 })
db.channel_category_mappings.createIndex({ categoryId: 1, storeId: 1 }, { unique: true })
db.channel_category_mappings.createIndex({ syncStatus: 1, organizationId: 1 })

// product_categories — supports fast channelSyncSummary refresh query
db.product_categories.createIndex({ "channelSyncSummary.totalDrifted": 1 })
```

---

## 6. Summary of New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/channel-category-mappings/` | List all mappings for org |
| GET | `/channel-category-mappings/{categoryId}` | Mappings for one category |
| GET | `/channel-category-mappings/import/preview` | Preview importable collections |
| POST | `/channel-category-mappings/import/start` | Create platform categories + PENDING_IMPORT mappings |
| POST | `/channel-category-mappings/import/confirm` | Promote PENDING_IMPORT → MAPPED |
| GET | `/channel-category-mappings/second-channel/preview` | Fuzzy match second channel collections |
| POST | `/channel-category-mappings/second-channel/map` | Create MAPPED links for second channel |
| PATCH | `/channel-category-mappings/{mappingId}/resolve-drift` | Resolve DRIFTED mapping |
| POST | `/channel-category-mappings/sync` | Trigger full sync for org |
| DELETE | `/channel-category-mappings/{mappingId}` | Delete mapping |
| POST | `/webhooks/shopify/category-update` | Real-time Shopify drift detection |
