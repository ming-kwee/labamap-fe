# Phase 4 — Attribute Filtering via ProductType: Frontend Integration Guide

> **Implemented:** 2026-04-27  
> **Backend PR:** `bff-v2`  
> **Audience:** Frontend engineers maintaining the Omni Admin catalog UI

---

## What changed and why

Until now, master attributes were scoped to product categories directly via the
`applicableProductCategories` field (a list of category ObjectIds).

**The problem:** Renaming, splitting, or reorganizing a ProductCategory breaks the
attribute assignment because the ObjectId changes.

**The fix (Phase 4):** Attributes are now scoped through the stable `ProductType` entity:

```
Before:  Attribute ──[applicableProductCategories]──▶ ProductCategory (fragile)

After:   Attribute ──[productTypeIds]──▶ ProductType ◀──[productTypeId]── ProductCategory
                                                                         (stable)
```

Renaming or restructuring categories never touches the ProductType — so attribute
assignments survive any catalog reorganization.

Both fields coexist; unassigned attributes continue working via the legacy path.

---

## API Changes

### 1. `GET /api/v1/admin/master-attributes`

#### New query param: `?productTypeId=<ObjectId>`

Filters attributes that have this ProductType in their `productTypeIds` array.
Use this for the sidebar when the user is browsing by ProductType.

```
GET /api/v1/admin/master-attributes?productTypeId=64f3a1b2c3d4e5f6a7b8c9d0
```

#### Upgraded `?categoryId=` behaviour

When the selected category has a `productTypeId` assigned, the response now includes:
- **Phase 4 attributes** — those whose `productTypeIds` contains the category's ProductType
- **Legacy attributes** — those with no `productTypeIds` set, whose `applicableProductCategories`
  covers the selected category or its subtree

No change needed in your API call — the backend resolves this automatically.
You may notice more attributes returned for categories that now have a ProductType assigned.

#### New field in each attribute response: `productTypeIds`

```json
{
  "id": "...",
  "fieldName": "color",
  "applicableProductCategories": ["64f3..."],
  "productTypeIds": ["64aa..."],
  ...
}
```

---

### 2. `GET /api/v1/admin/master-attributes/category-counts`

The badge count now reflects Phase 4 (ProductType-based) attrs plus legacy attrs.
Each entry gains an optional `productTypeId` field:

```json
[
  {
    "categoryId":   "64f3...",
    "categoryName": "Smartphones",
    "categoryPath": "electronics/smartphones",
    "productTypeId": "64aa...",
    "count": 14
  },
  {
    "categoryId":   "64f4...",
    "categoryName": "Fashion",
    "categoryPath": "fashion",
    "count": 5
  }
]
```

`productTypeId` is present only when the category has a ProductType assigned.
No breaking change — the shape is backwards-compatible.

---

## UI Changes Required

### A. Master Attributes form — add ProductType multi-selector

In the attribute create/edit modal, add a **Product Types** multi-select field alongside
(or replacing) the existing Category selector:

```
Product Types *
┌─────────────────────────────────────────────────────────────┐
│  ✓ Smartphone                                               │
│  ○ Television                                               │
│  ○ Laptop                                                   │
│  ○ Apparel                                                  │
└─────────────────────────────────────────────────────────────┘
  Fetch from: GET /api/v1/admin/product-types?active=true
  Save as: productTypeIds: ["<id1>", "<id2>"]
```

**Keep the category selector visible but label it "Legacy Category Scope (deprecated)"** — it
still works for attributes that haven't been migrated to ProductTypes. New attributes should
use `productTypeIds` only.

### B. Master Attributes sidebar — add ProductType filter tab/section

Add a **Product Types** section to the left sidebar (parallel to the existing Category tree):

```
FILTER BY
  ○ Category (tree, legacy)
  ○ Product Type              ← NEW
    ○ Smartphone  (14 attrs)
    ○ Television  (9 attrs)
    ○ Laptop      (11 attrs)
    ○ Apparel     (18 attrs)
```

When a ProductType is selected, call:
```
GET /api/v1/admin/master-attributes?productTypeId=<id>
```

The `attributeCount` field on each ProductType document gives you the badge number:
```
GET /api/v1/admin/product-types?active=true
→ [{ id, name, slug, attributeCount, variantDimensions, ... }]
```

### C. Category edit modal — show resolved ProductType

In `ProductCategoryAdminController`:
- `GET /{id}/effective-product-type` returns the resolved type (including inherited from ancestors)
- Show this in the category edit form so engineers can confirm or override the assignment

```
Product Type
┌──────────────────────────────────────────────────────────┐
│ Smartphone                                          ▾    │
└──────────────────────────────────────────────────────────┘
  ℹ Inherited from parent "Phones"
  [Override]  [Keep inherited]
```

Fetch from: `GET /api/v1/admin/product-categories/{id}/effective-product-type`

### D. Category tree sidebar — ProductType badge

Each category node that has a `productTypeId` can show a chip:

```
└─ Smartphones  [Smartphone]  14 attrs
```

The `productTypeName` field is already included in all `product_categories` responses
(GET /, GET /tree, GET /{id}).

---

## Migration Guidance (admin workflow)

For the transition period, **both scoping systems work simultaneously**. The priority chain:

1. If attribute has `productTypeIds` set → uses ProductType scoping
2. If attribute has only `applicableProductCategories` → uses legacy category scoping
3. If neither → global attribute (shown everywhere)

**Recommended admin steps to migrate an attribute:**

1. Open attribute edit modal
2. In the new **Product Types** selector, pick the relevant types (e.g. "Smartphone")
3. Save — `productTypeIds` is populated
4. Legacy `applicableProductCategories` can optionally be cleared or left in place

The frontend does NOT need to clear `applicableProductCategories` — the backend ignores it
for any attribute that has `productTypeIds` populated.

---

## E. Product creation form (Step 1) — two-phase load

`POST /api/v1/ecommerce/form-schema/generate` and `POST /api/v1/ecommerce/form-schema/refresh`
now apply the Phase 4 filter server-side. The frontend UX must change to match.

### Old behaviour (removed)
All attributes were returned regardless of category. `conditionalVisibility.showWhen` rules
on each attribute were responsible for hiding/showing fields on the client. This caused
merchants to sometimes fill in `isbn` on an electronics product, only for those fields to be
silently dropped at publish.

### New two-phase load

**Phase 1 — initial form (no category yet)**
```
POST /form-schema/generate
{ "context": { "userId": "...", "organizationId": "..." } }
```
Returns only global attributes: `name`, `description`, `price`, `sku`, `images`, `weight`, etc.
Show a prominent **Category** selector at the top.

**Phase 2 — category selected**
```
POST /form-schema/refresh
{ "context": { "productCategory": "smartphones", "userId": "...", "organizationId": "..." } }
```
Returns the correct attribute set for that product type.
Replace the form with the refreshed schema (skeleton loader recommended).

### What to check in the response
```json
{
  "formSchema": {
    "metadata": {
      "isInitialLoad": true,          ← true when no category was in the request
      "isCategorySpecific": false,    ← true when category was resolved
      "selectedCategory": null        ← the category slug used
    }
  }
}
```

### `conditionalVisibility` is still valid for intra-form logic
Fields can still use `conditionalVisibility.showWhen` for rules *within* a product type
(e.g. show `compareAtPrice` only when `price > 0`, show `variantImages` only when
`hasVariants === true`). Do **not** use `conditionalVisibility` to gate fields that belong
to a different product type — those are now excluded server-side.

---

## No-impact areas (nothing to change)

| Area | Why no change |
|---|---|
| Step 2 channel form (`ChannelStepSchemaService`) | Already resolves ProductType from category for variant dims; channel-specific attrs filtered by `supportedChannels`, not category |
| Publish pipeline | Phase 4 filter already applied in `DynamicChannelSchemaService` |
| Channel category mapping admin | Separate concern — manages channel ↔ platform category links |
