# API Reference — Master Products (Phase 2)

> **Context:** Phase 2 of the product management UX roadmap introduces the My Products
> list page (`/products`). This document defines all backend contracts the frontend
> requires for that page — and for Phase 3 (Product Detail) which depends on the same
> base resource.
>
> Frontend service: `src/app/(admin)/products/_services/master-product.service.ts`  
> Frontend types: `src/app/(admin)/products/_types/master-product.ts`

Base path: `/labamap/api/v1/admin/master-products`

---

## 1. List master products ⚠️ pending

```
GET /admin/master-products
```

### Query parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `organizationId` | string | ✅ | Scopes the query to the merchant's org |
| `page` | int | — | 0-indexed page number. Default: `0` |
| `size` | int | — | Page size. Default: `10` |
| `q` | string | — | Full-text search on `name` and `sku`. Omit to return all. |
| `channelType` | string | — | Filter by channel type (e.g. `shopify`, `wix`). Omit for all. |
| `channelStatus` | string | — | Filter by worst-case sync status: `SYNCED`, `WARNING`, `FAILED`, `DRAFT`, `SYNCING`. Omit for all. |
| `status` | string | — | Filter by master product status: `ACTIVE`, `DRAFT`, `ARCHIVED`. Omit for all. |
| `categoryId` | string | — | Filter by category slug or tag. **Deprecated** — use `tags[]` instead. Still accepted during transition period; matched against both `categoryId` field and `tags[]`. |

### Response — `200 OK`

Standard Spring Page wrapper:

```json
{
  "content": [
    {
      "id":             "6632a1f...",
      "organizationId": "org_123",
      "name":           "Wireless Earbuds",
      "sku":            "WE-001",
      "productTypeId":  "6623a1b2c3d4e5f6a7b8c9e1",
      "tags":           ["electronics", "wireless"],
      "basePrice":      299000,
      "currency":       "IDR",
      "imageUrl":       "https://cdn.example.com/img/we-001.jpg",
      "variantCount":   3,
      "channelSummary": [
        {
          "storeId":     "store-abc",
          "storeName":   "Main Shopify Store",
          "channelType": "shopify",
          "syncStatus":  "SYNCED",
          "lastSyncedAt": "2026-05-29T10:00:00Z",
          "errorMessage": null
        },
        {
          "storeId":     "store-def",
          "storeName":   "My Wix Store",
          "channelType": "wix",
          "syncStatus":  "WARNING",
          "lastSyncedAt": "2026-05-29T09:00:00Z",
          "errorMessage": "1 variant missing category mapping"
        }
      ],
      "status":    "ACTIVE",
      "createdAt": "2026-05-01T08:00:00Z",
      "updatedAt": "2026-05-29T10:00:00Z"
    }
  ],
  "totalElements": 142,
  "totalPages":    15,
  "number":        0,
  "size":          10
}
```

> **Deprecated fields:** `categoryId` and `categoryName` are deprecated and scheduled for removal in Sprint 4 after `CategoryToTagsMigration` (@Order 220) verifies all rows have been converted. These fields are no longer included in the list response. Use `productTypeId` and `tags[]` instead.

**Field notes:**

| Field | Notes |
|---|---|
| `id` | MongoDB ObjectId as string. Used as the URL segment for `/products/{id}`. |
| `channelSummary` | One entry per connected store that has a mapping for this product. Empty array if product has no channel links. |
| `channelSummary[].syncStatus` | Enum: `SYNCED` \| `WARNING` \| `FAILED` \| `DRAFT` \| `SYNCING` |
| `channelSummary[].errorMessage` | `null` when status is `SYNCED`. Populated for `FAILED` and `WARNING`. |
| `imageUrl` | First image in the product's media gallery. `null` if none uploaded. |
| `variantCount` | Total number of variant combinations (not option dimensions). |
| `number` | Spring's 0-indexed current page. The frontend mapper reads `raw.number ?? raw.page`. |

### Frontend `channelStatus` filter semantics

The frontend sends `channelStatus=FAILED` to request products where the worst-case
across all `channelSummary` entries is `FAILED`. The backend should implement this as:

```
FAILED  → any channelSummary entry has syncStatus = FAILED
WARNING → no FAILED, but at least one has syncStatus = WARNING
SYNCED  → all entries have syncStatus = SYNCED
DRAFT   → all entries have syncStatus = DRAFT
SYNCING → at least one has syncStatus = SYNCING (and no FAILED/WARNING)
```

This matches the frontend `overallSyncStatus()` function in `_types/master-product.ts`.

---

## 2. Get a single master product ⚠️ pending (Phase 3)

```
GET /admin/master-products/{productId}?organizationId={orgId}
```

Returns the full product detail for the Product Detail page (Phase 3).

**Response shape:** same as a single item from the list endpoint `content[]` array.
No additional fields are needed for Phase 3's current design — the list payload is sufficient.

**Backend must verify** `product.organizationId == requestingUser.organizationId` before
returning — same RBAC pattern used for product categories.

---

## 3. `channelSummary` — where the data comes from

The `channelSummary[]` array is **denormalized** on the master product document. It is
derived from `channel_category_mappings` and the channel publishing job.

**When to update `channelSummary` on a product:**

| Event | Action |
|---|---|
| Product published to a channel store | Add/update entry: `syncStatus = SYNCED`, set `lastSyncedAt` |
| Publish fails | Add/update entry: `syncStatus = FAILED`, set `errorMessage` |
| Sync check detects drift | Update entry: `syncStatus = WARNING`, set `errorMessage` |
| Product saved but not yet published | Entry: `syncStatus = DRAFT` |
| Publish in progress | Entry: `syncStatus = SYNCING` |
| Channel link removed (unmap) | Remove the entry for that store |

This is the same denormalization pattern already used for `channelSyncSummary` on
`product_categories` (see `docs/product/01-catalog-schema/02-api-reference/04-channel-category-mapping.md` §3.1).

---

## 4. MongoDB collection — `master_products`

Extend the existing master product collection with the new fields:

```js
{
  // existing fields ...
  organizationId: String,          // already present
  name:           String,          // already present
  sku:            String,
  productTypeId:  ObjectId,        // promoted field, indexed
  tags:           [String],        // replaces categoryId/categoryName
  categoryId:     ObjectId,        // @deprecated → tags[] (removed Sprint 4)
  categoryName:   String,          // @deprecated → tags[] (removed Sprint 4)
  basePrice:      Number,
  currency:       String,
  imageUrl:       String,          // first image URL, denormalized
  variantCount:   Number,          // denormalized count of variants
  status:         String,          // ACTIVE | DRAFT | ARCHIVED

  // NEW — denormalized channel sync state
  channelSummary: [
    {
      storeId:      String,
      storeName:    String,
      channelType:  String,
      syncStatus:   String,        // SYNCED | WARNING | FAILED | DRAFT | SYNCING
      lastSyncedAt: ISODate,
      errorMessage: String
    }
  ]
}
```

### Indexes

```js
// Existing (verify these are present)
db.master_products.createIndex({ organizationId: 1, createdAt: -1 })   // list query

// New — supports filter queries
db.master_products.createIndex({ organizationId: 1, status: 1 })
db.master_products.createIndex({ organizationId: 1, "channelSummary.channelType": 1 })
db.master_products.createIndex({ organizationId: 1, "channelSummary.syncStatus": 1 })

// Text index — supports q= search
db.master_products.createIndex({ organizationId: 1, name: "text", sku: "text" })
```

---

## 5. Filter implementation (Spring Data / Reactive Mongo)

The `channelStatus` filter requires a derived query. Suggested implementation using
`Criteria`:

```java
// ChannelStatus filter — worst-case across channelSummary array
if (params.getChannelStatus() != null) {
    switch (params.getChannelStatus()) {
        case FAILED  -> criteria.and("channelSummary.syncStatus").is("FAILED");
        case WARNING -> criteria
                          .and("channelSummary.syncStatus").ne("FAILED")
                          .and("channelSummary.syncStatus").is("WARNING");
        case SYNCED  -> criteria
                          .and("channelSummary").not().elemMatch(
                              Criteria.where("syncStatus").ne("SYNCED"));
        case DRAFT   -> criteria
                          .and("channelSummary").not().elemMatch(
                              Criteria.where("syncStatus").ne("DRAFT"));
        case SYNCING -> criteria
                          .and("channelSummary.syncStatus").nin("FAILED", "WARNING")
                          .and("channelSummary.syncStatus").is("SYNCING");
    }
}
```

---

## 6. Implementation checklist

| # | Task | Status |
|---|------|--------|
| 1 | Add `channelSummary[]`, `imageUrl`, `variantCount`, `status`, `categoryName` to `MasterProductDocument` | ⚠️ Pending |
| 2 | Update publish job to write `channelSummary` entry on success/failure | ⚠️ Pending |
| 3 | `GET /admin/master-products` — list endpoint with all query params | ⚠️ Pending |
| 4 | `channelStatus` filter — worst-case array query (§5) | ⚠️ Pending |
| 5 | Text index on `name` + `sku` for `q=` full-text search | ⚠️ Pending |
| 6 | `GET /admin/master-products/{id}` — single product (Phase 3) | ⚠️ Pending |
| 7 | RBAC: `organizationId` ownership check on all endpoints | ⚠️ Verify |

---

## 7. Frontend graceful degradation

Until the backend endpoint is deployed:

- `GET /admin/master-products` returns `404` → frontend treats as empty list (no error banner)
- The My Products page renders the empty state: *"No products yet — create your first product"*
- All navigation still works (Create Product → wizard → publish)

No frontend changes are required when the backend goes live — the service will
automatically start returning real data and the page will populate.
