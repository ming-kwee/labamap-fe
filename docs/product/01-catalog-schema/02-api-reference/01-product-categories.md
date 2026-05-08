# API Reference — Product Categories

Base path: `/labamap/api/v1/admin/product-categories`

All endpoints are implicitly scoped to the calling organisation. The `organizationId` is
resolved from the `Authorization` JWT — it is never passed as a query or body parameter.

---

## MongoDB Collection: `product_categories`

```json
{
  "_id":             "ObjectId",
  "organizationId":  "org_abc123",
  "name":            "Smartphones",
  "slug":            "smartphones",
  "path":            "electronics/phones/smartphones",
  "level":           2,
  "parentId":        "ObjectId | null",
  "active":          true,
  "productTypeId":   "ObjectId | null",
  "productTypeName": "Smartphone",
  "sortOrder":       1,
  "description":     "Android and iOS smartphones",
  "imageUrl":        null,
  "channelSyncSummary": {
    "totalMapped":   3,
    "totalDrifted":  0,
    "totalUnmapped": 1,
    "lastSyncedAt":  "2026-04-05T14:30:00Z"
  },
  "createdAt": "2026-01-15T08:00:00Z",
  "updatedAt": "2026-04-05T14:30:00Z",
  "createdBy": "user_xyz",
  "updatedBy": "user_xyz"
}
```

`channelSyncSummary` is denormalized display data — recomputed from `channel_category_mappings`
whenever any mapping status changes. Authoritative data lives in `channel_category_mappings`.

### Breaking change from previous design

`organizationId` is a new required field. The previous design had a globally unique `slug`
index. That is replaced by a per-org compound index. See Indexes below.

---

## Indexes

```javascript
// Tenant filter — applied to every query
db.product_categories.createIndex({ organizationId: 1 })

// Slug uniqueness is per-org (not global)
db.product_categories.createIndex(
  { organizationId: 1, slug: 1 },
  { unique: true }
)

// Subtree traversal: all descendants of a path prefix, within one org
db.product_categories.createIndex({ organizationId: 1, path: 1 })

// ProductType → category lookups (cascade name changes, deletion guard)
db.product_categories.createIndex({ organizationId: 1, productTypeId: 1 })

// Admin badge filter: show categories with drift across one org
db.product_categories.createIndex({ organizationId: 1, "channelSyncSummary.totalDrifted": 1 })
```

**Removed index:**
```javascript
// REMOVED — slug is no longer globally unique
db.product_categories.createIndex({ slug: 1 }, { unique: true })
```

---

## GET `/admin/product-categories`

Returns the full category tree as nested nodes for the calling org.

**Response:**
```json
[
  {
    "id": "64f3a1b2c3d4e5f6a7b8c9d0",
    "name": "Electronics",
    "slug": "electronics",
    "path": "electronics",
    "level": 0,
    "parentId": null,
    "active": true,
    "productTypeId": null,
    "channelSyncSummary": { "totalMapped": 5, "totalDrifted": 0, "totalUnmapped": 1, "lastSyncedAt": "..." },
    "children": [
      {
        "id": "...",
        "name": "Smartphones",
        "slug": "smartphones",
        "path": "electronics/smartphones",
        "level": 1,
        "parentId": "64f3a1b2c3d4e5f6a7b8c9d0",
        "active": true,
        "productTypeId": "6623a1b2c3d4e5f6a7b8c9e1",
        "channelSyncSummary": { ... },
        "children": []
      }
    ]
  }
]
```

---

## GET `/admin/product-categories/slugs`

Returns a flat list with `path` and `level` for use in pickers and dropdowns.
Used by `CategorySelectField` to build the hierarchical combobox.
Returns only **active** categories for the calling org.

**Response:**
```json
[
  { "id": "...", "name": "Electronics",  "slug": "electronics",   "path": "electronics",                    "level": 0 },
  { "id": "...", "name": "Smartphones",  "slug": "smartphones",   "path": "electronics/smartphones",        "level": 1 },
  { "id": "...", "name": "Budget",       "slug": "budget-phones", "path": "electronics/smartphones/budget", "level": 2 }
]
```

Return sorted by `path` lexicographically — this gives parent-before-child order automatically.

**TypeScript type:**
```typescript
// src/app/omni-admin/product-categories/_types/category.ts
interface CategorySlugItem {
  id: string;
  name: string;
  slug: string;
  path: string;   // "electronics/phones/smartphones"
  level: number;  // 0 = root
}
```

---

## GET `/admin/product-categories/{id}`

Returns a single category node with `children` populated one level deep.
Returns `404` if the category does not belong to the calling org.

---

## POST `/admin/product-categories`

**Request body:**
```json
{
  "name":          "Gaming Laptops",
  "slug":          "gaming-laptops",
  "parentId":      "64f3a1b2c3d4e5f6a7b8c9d5",
  "productTypeId": "6623a1c3c3d4e5f6a7b8c9e2",
  "sortOrder":     1,
  "description":   "High-performance gaming laptops"
}
```

The `organizationId` is injected server-side from the auth token. Do not pass it in the body.

**Backend side effects:**
- Computes `path` from parent: `"electronics/laptops/gaming-laptops"`
- Sets `level = parent.level + 1`
- Validates `slug` uniqueness within this org (returns `409` if slug already exists in org)
- Triggers push-out to all MAPPED channel stores of the parent category

**Error responses:**
- `409 Conflict` — slug already exists in this organisation
- `404 Not Found` — `parentId` does not exist in this organisation

---

## PUT `/admin/product-categories/{id}`

All fields optional. Returns `404` if category does not belong to calling org.

**Side effects on name change:**
- Updates all descendants' `path` fields (prefix replacement, scoped to this org)
- Triggers push-out to all MAPPED channel stores

**Side effects on `slug` change:**
- Cascades path update to all descendants (same as reparent)
- Updates `MasterProductData.productAttributes["category"]` for all products using the old slug within this org
- Validates new slug uniqueness within this org

**Side effects on `productTypeId` change:**
- Triggers `attributeCount` recomputation on the old and new ProductType

---

## DELETE `/admin/product-categories/{id}`

Returns `409 Conflict` if the category has children or products assigned.
Returns `404` if category does not belong to calling org.
On success: removes all `channel_category_mappings` documents for this category (scoped to this org).

---

## TypeScript Types

```typescript
// src/app/omni-admin/product-categories/_types/category.ts
interface ProductCategoryTree {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  parentId: string | null;
  active: boolean;
  productTypeId?: string;
  productTypeName?: string;
  channelSyncSummary?: ChannelSyncSummary;
  children: ProductCategoryTree[];
}

interface ChannelSyncSummary {
  totalMapped: number;
  totalDrifted: number;
  totalUnmapped: number;
  lastSyncedAt: string | null;
}

function flattenTree(tree: ProductCategoryTree[]): ProductCategoryTree[]
```

---

## Platform Category Templates

See `08-platform-category-templates.md` for the `platform_category_templates` collection
and the org-provisioning endpoint
`POST /api/v1/platform-admin/category-templates/provision/{orgId}`.

The template collection has no `organizationId` — it is platform-admin-managed and is the
source used when seeding a new org's `product_categories` on first provisioning.
