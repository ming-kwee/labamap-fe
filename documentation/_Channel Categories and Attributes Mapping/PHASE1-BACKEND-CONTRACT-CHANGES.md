# Phase 1 Backend API Contract Changes

> **Phase:** 1 — Category Ownership, Pragmatic Implementation  
> **Source:** `CATEGORY-OWNERSHIP-AND-PRODUCT-TYPE-ARCHITECTURE.md` §11  
> **Status:** Frontend complete. Backend changes listed below are **required** for filtering to work correctly.

---

## The Core Requirement

Phase 1 mandates that `MasterAttribute.applicableCategories` stores **MongoDB ObjectIds** of
documents in the `product_categories` collection — not arbitrary strings like `"electronics"`.

The frontend category sidebar fetches real ObjectIds from `GET /admin/product-categories/slugs`
and passes them as `categoryIds` when saving an attribute. For the filter
`attribute.categoryIds.includes(selectedCategoryId)` to work, the backend must round-trip
the same ObjectId strings.

---

## Required Backend Changes

### 1. `MasterAttributeDocument.applicableCategories` — field type change

**Before (current):**
```java
@Field("applicableCategories")
private List<String> applicableCategories;   // stores arbitrary strings like "electronics"
```

**After (Phase 1):**
```java
@Field("applicableCategories")
private List<ObjectId> applicableCategories;  // MongoDB ObjectIds of product_categories._id
```

**Serialization:** Spring Boot / Jackson must serialize each ObjectId as its 24-char hex string
so the frontend receives `["64f3a1b2c3d4e5f6a7b8c9d0", ...]`.

**Migration:** Existing documents that store legacy strings (e.g. `"electronics"`) will no longer
match any ProductCategory after this change. Options:
- Accept the breakage and have admins reassign categories through the UI (recommended for Phase 1).
- Write a one-time migration script that looks up ProductCategory by name/slug and replaces the
  string with the correct ObjectId.

---

### 2. `GET /admin/master-attributes` — response field

The existing endpoint already returns `applicableCategories` in the response. No URL or method
change is needed. The only change is that the values inside the array change from arbitrary
strings to 24-char hex ObjectId strings.

**Before:**
```json
{
  "id": "...",
  "fieldName": "color",
  "applicableCategories": ["electronics", "fashion"]
}
```

**After:**
```json
{
  "id": "...",
  "fieldName": "color",
  "applicableCategories": ["64f3a1b2c3d4e5f6a7b8c9d0", "64f3a1b2c3d4e5f6a7b8c9d1"]
}
```

---

### 3. `POST /admin/master-attributes` and `PUT /admin/master-attributes/{id}` — request body

The frontend sends `applicableCategories` as an array of hex ObjectId strings. The backend must
accept and persist them as `ObjectId` references.

**Request body (no change to structure, only semantics of values):**
```json
{
  "fieldName": "color",
  "applicableCategories": ["64f3a1b2c3d4e5f6a7b8c9d0"],
  ...
}
```

**Validation (recommended):** Validate that each ID in `applicableCategories` references an
existing `product_categories` document. Return `400` with a descriptive error if any ID is invalid.

---

### 4. Deprecate `GET /ecommerce/master-attributes/categories`

**Current endpoint:** `GET /labamap/api/v1/ecommerce/master-attributes/categories`  
Returns: `string[]` — e.g. `["electronics", "fashion", "home"]`

**Action:** Deprecate this endpoint. The frontend no longer calls it. The category sidebar is
now driven by `GET /admin/product-categories/slugs` which returns real category documents with
MongoDB ObjectIds.

**Timeline:** Can be removed once no consumer calls it. Recommend keeping it for one sprint
to avoid breaking any other integrations before they are confirmed clear.

---

### 5. `GET /admin/product-categories/slugs` — no change needed

This endpoint already exists and is used by the frontend category sidebar. It must continue
returning the following shape:

```json
[
  { "id": "64f3a1b2c3d4e5f6a7b8c9d0", "name": "Electronics",  "slug": "electronics",  "path": "electronics",            "level": 0 },
  { "id": "64f3a1b2c3d4e5f6a7b8c9d1", "name": "Smartphones",  "slug": "smartphones",  "path": "electronics/smartphones", "level": 1 },
  { "id": "64f3a1b2c3d4e5f6a7b8c9d2", "name": "Laptops",      "slug": "laptops",      "path": "electronics/laptops",     "level": 1 }
]
```

The `id` field **must** be the MongoDB ObjectId of the `product_categories` document. This is
what the attribute's `applicableCategories` references.

---

## Index Recommendation

Add a MongoDB index to support filtering attributes by category:

```javascript
db.master_attributes.createIndex({ "applicableCategories": 1 })
```

This makes `{ applicableCategories: { $in: [ObjectId("...")] } }` queries efficient when the
backend implements server-side category filtering in the future (Phase 2 — path inheritance).

---

## What Does NOT Change in Phase 1

- `ProductCategory` document schema — no new fields (`productTypeId`, `channelSyncSummary` are Phase 3/4).
- The sidebar UI — already shows the hierarchical category tree with correct ObjectIds.
- The filter logic — already uses exact ID match on the frontend.
- Channel category mapping — deferred to Phase 3.
- ProductType entity — deferred to Phase 4.

---

## Summary Table

| Change | Where | Priority |
|--------|-------|----------|
| `applicableCategories` stores `ObjectId[]` not `String[]` | `MasterAttributeDocument.java` | **Required** |
| Accept ObjectId hex strings in POST/PUT body | `MasterAttributeAdminController.java` | **Required** |
| Validate ObjectIds reference real categories | `MasterAttributeService.java` | Recommended |
| Add index on `applicableCategories` | MongoDB | Recommended |
| Deprecate `/ecommerce/master-attributes/categories` | Router config | Low priority |
| One-time migration of legacy string values | Migration script | Required if existing data |
