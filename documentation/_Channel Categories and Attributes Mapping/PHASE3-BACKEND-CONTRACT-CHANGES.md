# Phase 3 — Channel Category Sync: Backend Contract Changes

> **Context:** Phase 3 introduces a `channel_category_mappings` collection that tracks which
> platform (master) categories are linked to which channel-side categories, and whether those
> links have drifted. The frontend implementation lives in
> `src/app/omni-admin/channel-category-mapping/`.

---

## ⚠️ Current Status — 404 on Page Load

The Channel Category Mapping page (`/omni-admin/channel-category-mapping`) is deployed and
operational, but immediately throws a 404 error on open because the backend controller
does not exist yet.

**Failing call:** `GET /labamap/api/v1/admin/channel-category-mappings?organizationId=org_123`

**Frontend workaround applied:** The frontend now treats a 404 from `listAll` as an empty
result (`[]`) so the page renders without crashing. Once the backend endpoint exists, real
data will flow automatically — no further frontend change is needed.

**Unblocking priority: implement §2.1 first.**

---

## ⚠️ Path Corrections vs. Earlier Draft

Four endpoint paths in the earlier version of this document did not match what the frontend
service actually calls. The frontend is deployed and its paths are authoritative.
**Backend must implement the paths in this document, not the old draft.**

| Section | Old (wrong) path | Correct path (frontend calls this) |
|---------|-----------------|-----------------------------------|
| §2.4 | `POST /import/start` | `POST /import` |
| §2.7 | `POST /second-channel/map` | `POST /second-channel` |
| §2.8 | `PATCH /{mappingId}/resolve-drift` | `PATCH /{mappingId}/drift/resolve` |
| §2.9 | `POST /sync` | `POST /sync-all` |
| §2.9 | response `{ synced, drifted }` | response `{ syncedCount }` |

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
{ categoryId: 1, storeId: 1 }                // unique mapping lookup (unique index)
{ syncStatus: 1, organizationId: 1 }         // drift dashboard query
```

---

## 2. New Endpoints — `ChannelCategoryMappingAdminController`

Base path: `/labamap/api/v1/admin/channel-category-mappings`

---

### 2.1 List all mappings for an org  ← **implement this first — fixes the 404**

```
GET /?organizationId={orgId}
```

Returns all mapping documents for the org. The frontend uses this on page load to build the
category × store status grid. An empty array `[]` is a valid response when no imports have
happened yet.

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

Response: `ChannelCategoryMappingDto[]` (all store mappings for this one category)

---

### 2.3 Preview importable collections from a store

```
GET /import/preview?storeId={storeId}&organizationId={orgId}
```

Calls the channel's API to fetch collections / categories the merchant owns (TYPE 1 channels only:
Shopify, WooCommerce, Etsy). Returns them **without** persisting anything. Used in step 1 of the
import wizard so the merchant can review and select which to bring in.

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
POST /import
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

Response: `{ importedCount: number, categoryIds: string[] }`

```json
{
  "importedCount": 2,
  "categoryIds": ["<categoryId1>", "<categoryId2>"]
}
```

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
Also recomputes `channelSyncSummary.totalMapped` on each affected `ProductCategory`.

Response: `204 No Content`

---

### 2.6 Preview second-channel fuzzy matches

```
GET /second-channel/preview?storeId={storeId}&organizationId={orgId}
```

Fetches the new channel's categories and fuzzy-matches them against existing platform categories
(by name similarity — Levenshtein distance or TF-IDF). Used when the merchant connects their
2nd+ channel so they can link channel categories to already-existing platform categories.

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

`matchConfidence`: 0–100. Frontend shows an "Accept" shortcut for matches ≥ 70.
`suggestedCategoryId`: null when no platform category matched.

---

### 2.7 Confirm second-channel mapping

```
POST /second-channel
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

Response: `204 No Content`

---

### 2.8 Resolve drift

```
PATCH /{mappingId}/drift/resolve
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
| `RENAME_PLATFORM` | Update `ProductCategory.name` to `externalName`; set `syncStatus = MAPPED`; clear `driftReason`. |
| `RENAME_CHANNEL` | Push the platform category name to the channel API; update `externalName` snapshot; set `syncStatus = MAPPED`. |
| `KEEP_BOTH` | Set `syncStatus = MAPPED`; set `driftReason = "acknowledged"`; do not rename either side. |

In all three cases: update `channelSyncSummary` on the linked `ProductCategory`.

Response: `ChannelCategoryMappingDto` (the updated mapping document)

---

### 2.9 Trigger manual sync for all mappings in an org

```
POST /sync-all?organizationId={orgId}
```

Re-fetches each channel's category names (via the channel's API) and compares against the
stored `externalName` snapshot on each `MAPPED` document.

- Name changed → set `syncStatus = DRIFTED`, write `driftReason`, set `lastDriftAt`
- Name unchanged → update `lastSyncedAt`
- Also recomputes `channelSyncSummary` on every affected `ProductCategory`

Response:
```json
{
  "syncedCount": 14
}
```

---

### 2.10 Delete a mapping (link-only)

```
DELETE /{mappingId}
```

Hard-deletes the mapping document and decrements `channelSyncSummary` on the linked
`ProductCategory` — **does not delete the platform category itself**.

> ⚠️ **Behaviour change (2026-05-29):** An earlier version of this spec required a 409
> Conflict when `importedFrom = true`. That constraint has been **removed**. The frontend
> now shows a choice modal for every unmap action (regardless of `importedFrom`), so the
> backend should delete unconditionally. Do **not** implement the 409 gate.

Response: `204 No Content`

---

### 2.11 Delete category + cascade mapping cleanup  ← **NEW**

When the merchant chooses **"Remove link + delete category"** from the unmap modal, the
frontend calls the existing product-categories endpoint first:

```
DELETE /labamap/api/v1/admin/product-categories/{categoryId}?organizationId={orgId}
```

**Backend must cascade-delete all `channel_category_mappings` documents whose
`categoryId` matches the deleted category.** Without the cascade, stale mapping records
accumulate in the collection and re-appear in the grid after page refresh.

The frontend then calls `DELETE /channel-category-mappings/{mappingId}` as a second step
to clean up state. If the backend has already cascade-deleted the mapping, return
`404 Not Found` — **the frontend ignores 404 on this second call** (it is treated as
already deleted).

**Summary of the two-call flow:**

```
1. DELETE /admin/product-categories/{categoryId}          ← deletes category + cascades mappings
   Response: 204 No Content  |  409 if active children exist

2. DELETE /admin/channel-category-mappings/{mappingId}    ← frontend cleanup call (may 404 if cascaded)
   Response: 204 No Content  |  404 No Content (both are acceptable, frontend ignores 404)
```

**Cascade implementation (Spring Boot / MongoDB):**

```java
// In ProductCategoryAdminController or service layer, after category deletion:
channelCategoryMappingRepository
    .deleteAllByCategoryId(deletedCategoryId)
    .subscribe();  // reactive; fire-and-forget is acceptable here
```

Or via a `@DBRef` lifecycle event / application event published after the delete
(`ProductCategoryDeletedEvent`) — whichever fits the existing architecture.

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

**When to recompute:** any operation that changes a mapping's `syncStatus`:
- §2.4 start import → increment `totalUnmapped` (PENDING_IMPORT documents)
- §2.5 confirm import → increment `totalMapped`, decrement `totalUnmapped`
- §2.8 resolve drift → decrement `totalDrifted`, increment `totalMapped`
- §2.9 sync-all → recompute from live counts after drift detection
- §2.10 delete mapping → decrement whichever status bucket the deleted mapping was in
- §2.11 delete category → zero out all buckets (all mappings for that category are cascade-deleted)

Keep it denormalized — avoids a join on every category tree load.

**Exposed by:** `GET /product-categories/tree` and `GET /product-categories/{id}` — include
`channelSyncSummary` in the response DTO. The frontend reads it to show drift badge counts
on the category name column without an extra API call.

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

Register `collections/update` webhook when a Shopify store connects:

```
POST /webhooks/shopify/category-update
```

Payload from Shopify: contains collection id + updated title.
Handler: look up mapping by `storeId` + `externalId`; if `externalName` differs → set
`syncStatus = DRIFTED`, write `driftReason` (e.g. `"Name changed from 'Tops' to 'T-Shirts'"`),
set `lastDriftAt`, and recompute `channelSyncSummary` on the linked `ProductCategory`.

---

### 4.2 WooCommerce / Etsy — scheduled polling ✅ Implemented

Daily job: `CategoryDriftPollingJob`
(`channel/category/job/CategoryDriftPollingJob.java`)

Queries all distinct `organizationId` values from `channel_category_mappings`, then calls
`ChannelCategoryImportService.syncAllMappings(orgId)` for each. Marks mappings DRIFTED where
the re-fetched channel name differs from the stored `externalName` snapshot.

Schedule: `0 30 2 * * *` (2:30 AM UTC daily, after `CategorySyncJob` at 2:00 AM).
Configurable via `${channel.category.drift.cron}`.

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

## 6. Implementation Priority

Implement in this order to unblock the frontend incrementally:

| Priority | Endpoint | Unblocks |
|----------|----------|----------|
| 1 | `GET /` (§2.1) | Page loads without 404; mapping grid renders (empty) |
| 2 | `POST /import` (§2.4) + `POST /import/confirm` (§2.5) | Import wizard fully functional |
| 3 | `PATCH /{mappingId}/drift/resolve` (§2.8) | Drift resolution modal works |
| 4 | `POST /sync-all` (§2.9) | Sync All button works |
| 5 | `GET /import/preview` (§2.3) | Import wizard step 1 (channel collection list) |
| 6 | `GET /second-channel/preview` (§2.6) + `POST /second-channel` (§2.7) | Second-channel connect flow |
| 7 | `DELETE /{mappingId}` (§2.10) — **remove old 409 gate** | Unmap button in mapping grid |
| 8 | §3.1 `channelSyncSummary` on ProductCategory | Drift badge counts in category tree |
| 9 | §4.1 Shopify webhook | Real-time drift detection |
| 10 | §4.2 Polling job | WooCommerce/Etsy drift detection |
| **11** | **Cascade delete on `DELETE /product-categories/{id}` (§2.11)** | **"Remove link + delete category" cleans up mapping records** |

> **Status (2026-04-24):** Items 1–10 implemented. ✅
> **Status (2026-05-29):** Item 11 (cascade delete) added — **pending backend implementation**. Item 7 behaviour changed — remove the 409 gate on `importedFrom`. ⚠️

---

## 7. Summary of All New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/channel-category-mappings/` | List all mappings for org — **fixes 404 on page open** |
| GET | `/channel-category-mappings/{categoryId}` | Mappings for one category |
| GET | `/channel-category-mappings/import/preview` | Preview importable collections from channel |
| POST | `/channel-category-mappings/import` | Create platform categories + PENDING_IMPORT mappings |
| POST | `/channel-category-mappings/import/confirm` | Promote PENDING_IMPORT → MAPPED |
| GET | `/channel-category-mappings/second-channel/preview` | Fuzzy-match second-channel categories |
| POST | `/channel-category-mappings/second-channel` | Create MAPPED links for second channel |
| PATCH | `/channel-category-mappings/{mappingId}/drift/resolve` | Resolve DRIFTED mapping |
| POST | `/channel-category-mappings/sync-all` | Trigger full org sync + drift detection |
| DELETE | `/channel-category-mappings/{mappingId}` | Delete mapping — no 409 gate (§2.10) |
| DELETE | `/product-categories/{categoryId}` *(existing — cascade change)* | Delete category + **cascade-delete all its mappings** (§2.11) ⚠️ pending |
| POST | `/webhooks/shopify/category-update` | Real-time Shopify drift webhook |
