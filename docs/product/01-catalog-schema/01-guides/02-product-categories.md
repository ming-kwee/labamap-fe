# Product Categories

## Two-Layer Model

The category system uses two distinct layers:

| Layer                 | Collection                    | Owner          | Purpose                                                           |
|-----------------------|-------------------------------|----------------|-------------------------------------------------------------------|
| **Platform template** | `platform_category_templates` | Platform admin | Canonical taxonomy seeded at startup; never org-specific          |
| **Merchant tree**     | `product_categories`          | Organisation   | Each org gets its own copy; fully customisable after provisioning |

When a new organisation is provisioned, all documents from `platform_category_templates`
are copied into `product_categories` with that org's `organizationId`. After that point
the two datasets are independent — changes to the template do not propagate to existing orgs.

---

## What Is a ProductCategory?

A **merchant-owned** node in a hierarchical tree, scoped to a single organisation, that
organises their product catalog. It serves three purposes:

1. **Storefront navigation** — the menu and browsing structure customers see.
2. **SEO** — each node has a materialized path slug that forms the URL hierarchy.
3. **Channel mapping target** — each node links to corresponding categories on Shopify,
   WooCommerce, Amazon, TikTok, eBay, etc.

ProductCategories are NOT product schema definitions. A "Smartphones" category does not
define what attributes a smartphone needs — that is the job of ProductType.

---

## Organisation Scoping

Every `product_categories` document carries an `organizationId`. All queries are implicitly
filtered by the calling org — merchants from org A can never read or write org B's categories.

The `slug` uniqueness constraint is **per-organisation**, not global:

```
Org A:  slug="electronics"  organizationId="orgA"  ← valid
Org B:  slug="electronics"  organizationId="orgB"  ← also valid (different org)
```

The compound index `{ organizationId, slug }` enforces this.

When a product or attribute rule references a category by `slug`, that reference is always
resolved within the same org scope. A slug stored in `MasterProductData.productAttributes["category"]`
is only meaningful when queried against `product_categories` with the same `organizationId`.

---

## Tree Structure and Materialized Paths

Categories are stored as a **flat collection** with a `path` field representing the full
ancestry as a slash-separated string.

```
name: "Electronics"       path: "electronics"                    level: 0
name: "Phones"            path: "electronics/phones"             level: 1
name: "Smartphones"       path: "electronics/phones/smartphones" level: 2
name: "Budget Phones"     path: "electronics/phones/smartphones/budget" level: 3
name: "Laptops"           path: "electronics/laptops"            level: 1
```

Finding all descendants of "Phones" is a single index-backed query — no recursive traversal:
```
db.product_categories.find({ organizationId: "orgA", path: /^electronics\/phones/ })
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

## Platform Templates — First-Time Provisioning

The platform ships with a curated taxonomy in `platform_category_templates` covering 13
root verticals aligned with Shopify, Amazon, eBay, TikTok Shop, Lazada, Shopee, Tokopedia,
Walmart, and WIX:

1. Electronics
2. Fashion & Apparel
3. Home & Living
4. Beauty & Health
5. Sports & Outdoors
6. Food & Grocery
7. Toys & Games
8. Books & Media
9. Automotive
10. Baby & Kids
11. Pet Supplies
12. Office & Stationery
13. Tools & Hardware

**Provisioning flow:**

```
New org created
       │
       ▼
OrganisationService.provisionCategories(orgId)
       │
       ▼
platform_category_templates.find({})
       │
       ▼
For each template document:
  Insert into product_categories with { organizationId: orgId }
       │
       ▼
Org now has a full working category tree
```

After provisioning the merchant can:
- **Rename** any node (does not affect the template or other orgs)
- **Deactivate** categories they don't sell in
- **Add** new nodes specific to their business
- **Reparent** nodes to match their storefront structure
- **Delete** leaf nodes that have no products assigned

Templates are **never auto-propagated** to existing orgs after initial provisioning.
A platform admin can trigger re-provisioning explicitly via
`POST /api/v1/platform-admin/category-templates/provision/{orgId}` — but this is destructive
(existing merchant tree is overwritten) and requires explicit confirmation.

---

## ProductType Assignment

Each category optionally has `productTypeId` pointing to a ProductType. This is the
key that unlocks attribute schema and variant dimensions:

```
ProductCategory "Smartphones"  (organizationId: "orgA")
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
Both collections are org-scoped so the summary is also org-specific.

---

## channelSyncSummary Update Flow

```
Any channel_category_mappings document changes syncStatus
            │
            ▼
Aggregate: db.channel_category_mappings.aggregate([
  { $match: { organizationId: orgId, categoryId: categoryId } },
  { $group: {
      totalMapped:   $sum($cond(syncStatus === "MAPPED",   1, 0)),
      totalDrifted:  $sum($cond(syncStatus === "DRIFTED",  1, 0)),
      totalUnmapped: $sum($cond(syncStatus === "UNMAPPED", 1, 0)),
      lastSyncedAt:  $max($lastSyncedAt)
  }}
])
            │
            ▼
product_categories.updateOne(
  { _id: categoryId, organizationId: orgId },
  { $set: { channelSyncSummary: <computed> } }
)
```

These two writes are NOT atomic — the summary is display convenience, not authoritative.
Eventual consistency is acceptable here.

---

## What Merchants Can and Cannot Customise

| Action                       | Allowed  | Notes                                                  |
|------------------------------|----------|--------------------------------------------------------|
| Rename a category            | ✅        | Triggers push-out to MAPPED channel stores             |
| Add a child category         | ✅        | —                                                      |
| Reparent a category          | ✅        | Cascades `path` update to all descendants              |
| Deactivate a category        | ✅        | Hidden from pickers; existing products retain the slug |
| Delete a leaf category       | ✅        | Blocked if products are assigned                       |
| Create a root category       | ✅        | —                                                      |
| See another org's categories | ❌        | Hard-blocked by `organizationId` filter                |
| Edit the platform template   | ❌        | Platform-admin endpoint only                           |

---

## Frontend Codebase

### CategoryService
`src/app/omni-admin/product-categories/_services/category.service.ts`
```typescript
CategoryService.getTree(orgId)   // GET /admin/product-categories → ProductCategoryTree[]
CategoryService.getSlugs(orgId)  // GET /admin/product-categories/slugs → CategorySlugItem[]
```

`orgId` is read from the auth context inside the service — callers do not pass it
explicitly. It is included in the `Authorization` token claims and added to every request
automatically by the HTTP interceptor.

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

### Module-level slug cache — must be org-keyed

The `CategorySelectField` module-level cache is keyed by `orgId` to prevent stale data
when a user switches organisation within the same browser tab:

```typescript
// WRONG — a singleton breaks when org context changes
let slugCache: CategorySlugItem[] | null = null;

// CORRECT — keyed by orgId
const slugCacheByOrg = new Map<string, CategorySlugItem[]>();
const fetchPromiseByOrg = new Map<string, Promise<CategorySlugItem[]>>();

function fetchSlugs(orgId: string): Promise<CategorySlugItem[]> {
  if (slugCacheByOrg.has(orgId)) return Promise.resolve(slugCacheByOrg.get(orgId)!);
  if (fetchPromiseByOrg.has(orgId)) return fetchPromiseByOrg.get(orgId)!;
  const promise = CategoryService.getSlugs(orgId).then(items => {
    slugCacheByOrg.set(orgId, [...items].sort((a, b) => a.path.localeCompare(b.path)));
    fetchPromiseByOrg.delete(orgId);
    return slugCacheByOrg.get(orgId)!;
  });
  fetchPromiseByOrg.set(orgId, promise);
  return promise;
}
```

See `06-category-select-ui.md` for full component detail.
