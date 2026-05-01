# Phase 5 — Variant Options: Backend Implementation

**Feature:** Product create form displays checkable variant options (Color, Size, etc.) driven by
the category's ProductType. Selecting them generates the SKU matrix.

**Status:** DEPLOYED — all three requirements below are implemented as of 2026-04-28.

---

## Resolution chain (now working)

```
POST /form-schema/refresh   → metadata.productTypeId   ✅ now included
  → GET /admin/product-types/{productTypeId}        → variantDimensions[]   ✅ always populated
  → GET /admin/master-attributes?productTypeId={id} → SELECT attrs with options[]   ✅ options seeded
```

---

## What was implemented

### 1. `metadata.productTypeId` in schema responses ✅

All three form-schema endpoints now include `productTypeId` and `productTypeName` in the outer
`metadata` object:

- `POST /api/v1/ecommerce/form-schema/generate`
- `GET /api/v1/ecommerce/form-schema/generate`
- `POST /api/v1/ecommerce/form-schema/refresh`

**Response shape:**

```json
{
  "success": true,
  "formSchema": { "fields": [ ... ] },
  "metadata": {
    "generatedAt": "2026-04-28T10:00:00",
    "generatedFor": { ... },
    "schemaVersion": "1.0.0",
    "productTypeId": "6623a1b2c3d4e5f6a7b8c9d0",
    "productTypeName": "Smartphone"
  }
}
```

- `productTypeId` — MongoDB ObjectId of the ProductType resolved from `productCategory` slug.
  `null` when no category was passed or the category has no ProductType assigned yet.
- `productTypeName` — Human-readable label (e.g. `"Smartphone"`, `"Apparel"`). `null` when `productTypeId` is `null`.

The resolution happens in `FormSchemaService.resolveCategory()` before the cache check, so it
adds zero extra latency on cache hits (the resolved values are stored in the cache document).

**How it works internally:**

```
FormSchemaService.generateFormSchema(request)
  → resolveCategory(request)            // slug → categoryId + productTypeId + productTypeName
  → FormSchemaCacheService.getCachedFormSchema(resolvedRequest)   // key now uses productTypeId
  → DataDrivenSchemaGenerationService   // reads pre-resolved values, skips DB round-trip
```

---

### 2. `GET /admin/master-attributes?productTypeId=` — options array populated ✅

The endpoint filter was already correct. The gap was that the `options[]` array on `color`, `size`,
and `material` was only populated when the manual migration API was called.

**Fix:** New `VariantDimensionOptionsDataLoader` (`@Order(206)`) runs on every startup and
idempotently ensures all 6 variant dimension attributes have:
- `options[]` array populated (only when currently null/empty — never overwrites admin edits)
- `productTypeIds[]` set to the correct ProductType ObjectIds (same idempotent guard)
- `fieldType` = `"select"`

| Dimension | Options seeded | ProductTypes assigned |
|-----------|---------------|----------------------|
| `color` | 14 colors (black, white, red … multicolor) | 15 types (apparel, footwear, smartphone, etc.) |
| `size` | 7 sizes (xs, s, m, l, xl, xxl, one_size) | 7 types (apparel, footwear, wearable, etc.) |
| `material` | 13 materials (cotton, polyester, leather …) | 7 types (apparel, footwear, bag, etc.) |
| `flavor` | 11 flavors (original, chocolate, vanilla …) | 2 types (food-product, pet-product) |
| `storage-capacity` | 8 capacities (32gb … 4tb) | 3 types (laptop, smartphone, computer-peripheral) |
| `screen-size` | 13 sizes (5-inch … 75-inch) | 4 types (laptop, tv-display, smartphone, computer-peripheral) |

**Response example for `GET /api/v1/admin/master-attributes?productTypeId=<smartphone-id>`:**

```json
[
  {
    "fieldName": "color",
    "fieldType": "select",
    "variantScope": "variant_only",
    "productTypeIds": ["<smartphone-id>", ...],
    "options": [
      { "value": "black",  "label": "Black" },
      { "value": "white",  "label": "White" },
      { "value": "red",    "label": "Red" }
    ]
  }
]
```

> Note: the JSON field is `fieldType` (not `type`). The document returns `fieldType: "select"`.

---

### 3. Missing variant dimension documents created on startup ✅

`flavor`, `storage-capacity`, and `screen-size` were missing from the JSON seed file
(`master-attributes-ecommerce.json`) so they never existed as master attribute documents.
The `ProductTypeMasterAttributeMigration` logged them as `missing` and skipped them.

**Fix (two-part):**
1. Added all three to `master-attributes-ecommerce.json` (total attributes: 48 → 51).
2. `VariantDimensionOptionsDataLoader` creates them in MongoDB on first startup when not found.

`GET /api/v1/admin/product-types/{productTypeId}` returns `variantDimensions` correctly
(seeded by `ProductTypeDataLoader` @Order 202). Example for `smartphone`:

```json
{
  "id": "6623a1b2c3d4e5f6a7b8c9d0",
  "name": "Smartphone",
  "variantDimensions": [
    { "attributeCode": "color",   "attributeName": "Color",   "order": 1, "required": true }
  ]
}
```

---

## Startup migration order

```
@Order(200) ProductCategoryDataLoader      — seeds product_categories
@Order(202) ProductTypeDataLoader          — seeds product_types with variantDimensions
@Order(203) ProductTypeCategoryMappingMigration — assigns productTypeId to categories
@Order(204) ProductTypeMasterAttributeMigration — sets productTypeIds on existing attrs
@Order(206) VariantDimensionOptionsDataLoader   — NEW: ensures options[] and productTypeIds on all 6 dims
```

Order 206 runs after 204 so it only sets `productTypeIds` on attributes that 204 missed (newly
created documents). Admin-edited `options[]` are never overwritten.

---

## New endpoint: type-scoped cache invalidation

`DELETE /api/v1/ecommerce/form-schema/cache/product-type/{productTypeId}`

Deletes all cached form schemas for a ProductType. Call after changing which attributes belong to
a type. See `PHASE5-FORM-SCHEMA-PRODUCT-TYPE-CACHE-CHANGES.md` for full details.

---

## Verification checklist

Open the product create form at `/products/v2/create`, select a category (e.g. `electronics`),
and confirm:

- [ ] Header subtitle changes to *"Fields shown for: Smartphone"* (confirms `productTypeName` received)
- [ ] Amber warning banner is gone (confirms `productTypeId` is non-null)
- [ ] Blue banner appears inside the Variants section: *"Variant axes driven by Smartphone — Color × Storage"*
- [ ] Color and Storage option checkboxes appear with their full option lists
- [ ] "Confirm Variants" button generates SKUs when options are selected

---

## Related documentation

| Document | What it covers |
|----------|----------------|
| `PHASE5-BACKEND-CONTRACT-CHANGES.md` | Full Phase 5 scope: MasterProductSnapshot, channel adapters, import wizard |
| `PHASE5-FORM-SCHEMA-PRODUCT-TYPE-CACHE-CHANGES.md` | Cache key change from slug → productTypeId, new invalidation endpoint |
| `PHASE4-BACKEND-CONTRACT-CHANGES.md` | ProductType entity, product_types collection, `productTypeId` on categories |
