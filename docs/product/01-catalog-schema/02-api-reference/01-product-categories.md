# API Reference — Product Categories

Base path: `/labamap/api/v1/admin/product-categories`

---

## MongoDB Collection: `product_categories`

```json
{
  "_id":             "ObjectId",
  "name":            "Smartphones",
  "slug":            "smartphones",
  "path":            "electronics/phones/smartphones",
  "level":           2,
  "parentId":        "ObjectId | null",
  "active":          true,
  "productTypeId":   "ObjectId | null",
  "sortOrder":       1,
  "metaTitle":       "Buy Smartphones Online",
  "metaDescription": "...",
  "channelSyncSummary": {
    "totalMapped":   3,
    "totalDrifted":  0,
    "totalUnmapped": 1,
    "lastSyncedAt":  "2026-04-05T14:30:00Z"
  },
  "createdAt": "2026-01-15T08:00:00Z",
  "updatedAt": "2026-04-05T14:30:00Z"
}
```

`channelSyncSummary` is denormalized display data — recomputed from `channel_category_mappings` whenever any mapping status changes. Authoritative data lives in `channel_category_mappings`.

---

## Indexes

```javascript
db.product_categories.createIndex({ path: 1 })                                     // descendant lookup
db.product_categories.createIndex({ productTypeId: 1 })                            // form schema resolution
db.product_categories.createIndex({ "channelSyncSummary.totalDrifted": 1 })        // admin badge filter
db.product_categories.createIndex({ slug: 1 }, { unique: true })
```

---

## GET `/admin/product-categories`

Returns the full category tree as nested nodes.

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

---

## POST `/admin/product-categories`

**Request body:**
```json
{
  "name":          "Gaming Laptops",
  "slug":          "gaming-laptops",
  "parentId":      "64f3a1b2c3d4e5f6a7b8c9d5",
  "productTypeId": "6623a1c3c3d4e5f6a7b8c9e2",
  "sortOrder":     1
}
```

**Backend side effects:**
- Computes `path` from parent: `"electronics/laptops/gaming-laptops"`
- Sets `level = parent.level + 1`
- Triggers push-out to all MAPPED channel stores of the parent category

---

## PUT `/admin/product-categories/{id}`

All fields optional.

**Side effects on name change:**
- Updates all descendants' `path` fields (prefix replacement)
- Triggers push-out to all MAPPED channel stores

**Side effects on `productTypeId` change:**
- Triggers `attributeCount` recomputation on the old and new ProductType

---

## DELETE `/admin/product-categories/{id}`

Returns `409 Conflict` if the category has children or products assigned.
On success: removes all `channel_category_mappings` documents for this category.

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
