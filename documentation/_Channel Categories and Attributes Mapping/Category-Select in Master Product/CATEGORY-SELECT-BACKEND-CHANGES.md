# Category-Select — Backend Changes Required

**Status:** Pending  
**Affects:** `DataDrivenSchemaGenerationService` (form-schema generation)  
**No breaking changes** to any save/refresh/resolve endpoints.

---

## What to change

### `DataDrivenSchemaGenerationService` — change `category` field `fieldType`

Currently the service builds the `category` field as a `select` and populates `options[]` with a
hardcoded list. Replace this with `fieldType: "category-select"` and **remove the `options[]`
entirely**. The frontend will fetch categories live from `GET /admin/product-categories/slugs`.

**Before:**

```java
FormFieldDto categoryField = FormFieldDto.builder()
    .fieldName("category")
    .fieldType("select")
    .label("Product Category")
    .required(true)
    .options(List.of(
        new FieldOptionDto("electronics",  "Electronics"),
        new FieldOptionDto("smartphones",  "Smartphones"),
        new FieldOptionDto("apparel",      "Apparel"),
        // ... hardcoded list
    ))
    .build();
```

**After:**

```java
FormFieldDto categoryField = FormFieldDto.builder()
    .fieldName("category")
    .fieldType("category-select")          // ← only change
    .label("Product Category")
    .required(true)
    .helpText("Determines which attribute set and variant dimensions apply to this product.")
    // DO NOT set options — frontend fetches live from /admin/product-categories/slugs
    .build();
```

That is the **only backend change required**. No new endpoints. No migration scripts.

---

## Why no `options[]`

`GET /admin/product-categories/slugs` is already implemented and returns every field the
frontend needs:

```json
[
  { "id": "...", "name": "Electronics",  "slug": "electronics",  "path": "electronics",                    "level": 0 },
  { "id": "...", "name": "Mobile",       "slug": "mobile",       "path": "electronics/mobile",             "level": 1 },
  { "id": "...", "name": "Smartphones",  "slug": "smartphones",  "path": "electronics/mobile/smartphones", "level": 2 }
]
```

Embedding a snapshot of this inside the form-schema response would:

1. Grow the schema payload by the number of active categories (could be hundreds).
2. Produce a stale copy that diverges from the live catalogue when categories are added/renamed.
3. Require cache invalidation of all form schemas whenever any category changes.

The frontend fetches from `/slugs` once on mount with a short-lived in-memory cache, so there
is no extra round-trip cost in practice.

---

## `GET /admin/product-categories/slugs` — confirm response shape

The frontend `CategorySelectField` component expects each item to have these four fields:

| Field | Type | Description |
|-------|------|-------------|
| `slug` | `string` | Used as the stored value on the product (`formData.category`) |
| `name` | `string` | Human-readable label shown in the dropdown |
| `path` | `string` | Materialized path e.g. `"electronics/mobile/smartphones"` — used for sort order |
| `level` | `number` | Depth in the tree (0 = root) — used for indentation |

The endpoint already returns these. No changes needed.

---

## Compatibility note

`POST /ecommerce/form-schema/refresh` continues to receive `productCategory` as a plain slug
string (e.g. `"smartphones"`). `FormSchemaService.resolveCategory()` continues to look it up in
`product_categories` by slug. **Nothing changes in the save/refresh flow.**

The `fieldType` change is purely cosmetic from the backend's perspective — it controls which
input widget the frontend renders, not how the value is processed.

---

## Verification

After deploying, open the product create form at `/products/v2/create` and confirm:

- [ ] The category dropdown shows a hierarchically indented list sourced from live `product_categories`
- [ ] Parent categories appear without indentation; children are indented 3 spaces per level
- [ ] Selecting "Smartphones" triggers a schema refresh and loads Smartphone-specific fields
- [ ] The header subtitle updates to "Fields shown for: Smartphone"
- [ ] No `options[]` array is present on the `category` field in the raw schema response
