# Phase 2 Backend API Contract Changes

> **Phase:** 2 — Path Inheritance on Sidebar Filter  
> **Source:** `CATEGORY-OWNERSHIP-AND-PRODUCT-TYPE-ARCHITECTURE.md` §11  
> **Status:** Frontend complete (client-side path-prefix matching). Backend changes below are **optional now**, required when server-side pagination is added.

---

## What Phase 2 Does

Clicking "Electronics" in the Master Attributes sidebar now shows attributes assigned to:
- Electronics itself (direct assignment)
- Smartphones (child)
- Laptops (child)
- Gaming Laptops (grandchild)
- …any descendant at any depth

This is implemented via **materialized path prefix matching**: if Electronics has
`path = "electronics"`, any category with `path.startsWith("electronics/")` is a descendant.

---

## Current Frontend Implementation (no backend required)

The frontend holds the full category list (from `GET /admin/product-categories/slugs`) in
memory. For each category it precomputes a `Set<string>` of its own ID plus all descendant IDs.
When the sidebar filter fires, the client uses `categoryIds.some(id => subtreeIds.has(id))` instead
of `categoryIds.includes(selectedId)`.

This is correct and efficient for the current architecture where all filtering is client-side.

---

## Required Backend Change (when server-side pagination is added)

When `GET /admin/master-attributes` grows to support server-side pagination (enhancement
recommendation #7), the backend will need to perform the subtree expansion itself, because the
client will no longer hold all attribute records in memory.

### Option A — `includeDescendants` flag (recommended)

Add a query parameter that tells the backend to expand the selected category into its full subtree:

```
GET /admin/master-attributes?categoryId=64f3a1b2c3d4e5f6a7b8c9d0&includeDescendants=true
```

**Backend behaviour:**
1. Look up `product_categories` by `categoryId` → get `path` (e.g. `"electronics"`)
2. Find all category IDs in that subtree:
   ```java
   List<ObjectId> subtreeIds = productCategoryRepository
       .findByPathOrPathStartingWith(path, path + "/")
       .stream().map(ProductCategory::getId).toList();
   ```
3. Filter attributes: `{ applicableCategories: { $in: subtreeIds } }`

**Response:** Same paginated shape as the base endpoint. No response structure change.

**Default:** `includeDescendants=false` — backward compatible. The sidebar passes `true`
automatically when filtering by category.

---

### Option B — `categoryPath` query param (alternative)

Send the path string directly instead of an ID:

```
GET /admin/master-attributes?categoryPath=electronics
```

Backend does a regex or prefix query against a `categoryPath` field denormalized onto each
attribute. This avoids the extra lookup step but requires adding `categoryPath[]` to the
`MasterAttributeDocument` schema (one entry per assigned category's path).

**Not recommended for Phase 2** — adds schema complexity and a migration. Option A is simpler.

---

## New Index Required (for Option A)

The subtree query hits `product_categories` on every paginated request. Add a compound index:

```javascript
// Find all categories in a path subtree efficiently
db.product_categories.createIndex({ path: 1 })
```

This index likely already exists (recommended in `PHASE1-BACKEND-CONTRACT-CHANGES.md §6`).
Confirm it covers both `path === x` (exact) and `path LIKE 'x/%'` (prefix) queries.

For MongoDB, a prefix regex query `{ path: /^electronics\// }` uses the `{ path: 1 }` index
efficiently as long as the prefix is anchored at the start (`^`).

---

## No Changes Needed Now

| Area | Status |
|------|--------|
| Response shape of `GET /admin/master-attributes` | No change |
| POST/PUT attribute schema | No change |
| `product_categories` document schema | No change |
| `channel_category_mappings` | Not involved in Phase 2 |

---

## Summary

Phase 2 is entirely client-side today. The backend change (`includeDescendants=true`) only
becomes necessary when server-side pagination is introduced and the client can no longer
expand the subtree locally. Track as a dependency of enhancement recommendation #7.
