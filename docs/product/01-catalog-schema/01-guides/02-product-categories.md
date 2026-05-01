# Product Categories

## What Is a ProductCategory?

A **merchant-owned** node in a hierarchical tree that organises their product catalog.
It serves three purposes:

1. **Storefront navigation** — the menu and browsing structure customers see.
2. **SEO** — each node has a materialized path slug that forms the URL hierarchy.
3. **Channel mapping target** — each node links to corresponding categories on Shopify,
   WooCommerce, Amazon, TikTok, eBay, etc.

ProductCategories are NOT product schema definitions. A "Smartphones" category does not
define what attributes a smartphone needs — that is the job of ProductType.

---

## Tree Structure and Materialized Paths

Categories are stored as a **flat MongoDB collection** with a `path` field representing
the full ancestry as a slash-separated string.

```
name: "Electronics"       path: "electronics"                    level: 0
name: "Phones"            path: "electronics/phones"             level: 1
name: "Smartphones"       path: "electronics/phones/smartphones" level: 2
name: "Budget Phones"     path: "electronics/phones/smartphones/budget" level: 3
name: "Laptops"           path: "electronics/laptops"            level: 1
```

Finding all descendants of "Phones" is a single index-backed query — no recursive traversal:
```
db.product_categories.find({ path: /^electronics\/phones/ })
```

**Why alphabetic sort on `path` gives correct tree display order:**
```
"electronics"                          → Electronics   (root)
"electronics/laptops"                  → Laptops       (child)
"electronics/laptops/gaming"           → Gaming Laptops (grandchild)
"electronics/phones"                   → Phones        (sibling of Laptops)
"electronics/phones/smartphones"       → Smartphones   (child of Phones)
```
Parent-before-child, siblings adjacent — automatically, with no recursive sort.

---

## ProductType Assignment

Each category optionally has `productTypeId` pointing to a ProductType. This is the
key that unlocks attribute schema and variant dimensions:

```
ProductCategory "Smartphones"
  productTypeId → ProductType "Smartphone"
                    ├── MasterAttributes: brand, os, ram, color, storage, ...
                    └── variantDimensions: [color (axis 1), storage (axis 2)]
```

**ProductType inheritance:** When a child category has no `productTypeId`, the system
walks up the ancestor chain to find the nearest parent with one:

```
Electronics          [no productTypeId — navigation node]
  └── Smartphones    [productTypeId: Smartphone]
        └── Budget   [no productTypeId → inherits Smartphone from parent ✓]
```

---

## channelSyncSummary — Denormalized Display Data

Each category document carries a small embedded summary computed from the
`channel_category_mappings` collection:

```json
"channelSyncSummary": {
  "totalMapped":   3,
  "totalDrifted":  1,
  "totalUnmapped": 0,
  "lastSyncedAt":  "2026-04-05T14:30:00Z"
}
```

This is **display-only**. The authoritative data lives in `channel_category_mappings`.
The summary is recomputed whenever any mapping document for this category changes status.
Purpose: the category list page shows status badges (✓ MAPPED, ⚠ DRIFTED) without a join.

---

## channelSyncSummary Update Flow

```
Any channel_category_mappings document changes syncStatus
            │
            ▼
Aggregate: db.channel_category_mappings.aggregate([
  { $match: { categoryId: categoryId } },
  { $group: {
      totalMapped:   $sum($cond(syncStatus === "MAPPED",   1, 0)),
      totalDrifted:  $sum($cond(syncStatus === "DRIFTED",  1, 0)),
      totalUnmapped: $sum($cond(syncStatus === "UNMAPPED", 1, 0)),
      lastSyncedAt:  $max($lastSyncedAt)
  }}
])
            │
            ▼
product_categories.updateOne({ _id: categoryId },
  { $set: { channelSyncSummary: <computed> } }
)
```

These two writes are NOT atomic — the summary is display convenience, not authoritative.
Eventual consistency is acceptable here.

---

## Frontend Codebase

### CategoryService
`src/app/omni-admin/product-categories/_services/category.service.ts`
```typescript
CategoryService.getTree()    // GET /admin/product-categories → ProductCategoryTree[]
CategoryService.getSlugs()   // GET /admin/product-categories/slugs → CategorySlugItem[]
```

### Types
`src/app/omni-admin/product-categories/_types/category.ts`
```typescript
interface CategorySlugItem {
  id: string;
  name: string;
  slug: string;
  path: string;   // "electronics/phones/smartphones"
  level: number;  // 0 = root
}

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

function flattenTree(tree: ProductCategoryTree[]): ProductCategoryTree[]
```

### How category selection triggers schema refresh
`src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts`
```typescript
// Detects category field change → triggers schema refresh
if (fieldName === 'category') {
  loadCategoryFieldsSmooth(value); // POST /form-schema/refresh
}
```
