# Variant Options

## What Are Variant Dimensions?

A variant dimension is one axis of the SKU matrix. A Smartphone has two dimensions — color (axis 1) and storage_capacity (axis 2) — producing a grid:

```
                  64GB    128GB   256GB   512GB
Midnight Black    SKU1    SKU2    SKU3    SKU4
Silver            SKU5    SKU6    SKU7    SKU8
Gold              SKU9    SKU10   SKU11   SKU12
```

Each cell is one potential SKU. The merchant enables/disables individual cells.

---

## Where Variant Dimensions Come From

Variant dimensions are defined on `ProductType.variantDimensions[]`. Each entry points to a MasterAttribute by `attributeCode`. The MasterAttribute's `options[]` provides the available values for that axis.

```
ProductType "Smartphone"
  variantDimensions: [
    { attributeCode: "color",            order: 1, required: true },
    { attributeCode: "storage_capacity", order: 2, required: true }
  ]

MasterAttribute "color" (fieldType: SELECT)
  options: [Black, Silver, Gold]

MasterAttribute "storage_capacity" (fieldType: SELECT)
  options: [64GB, 128GB, 256GB, 512GB]
```

---

## variantScope vs variantDimensions — Two Levels

| Level | What it says |
|-------|-------------|
| `MasterAttribute.variantScope: "variant_only"` | This attribute CAN be a variant axis |
| `ProductType.variantDimensions[]` | These specific attributes ARE the matrix axes for this type, in this order |

Both are needed. `variantScope` is a capability flag on the attribute. `variantDimensions` is the ProductType-level configuration that says which capabilities are active and in what order.

---

## Three-Step Resolution Chain

```
Step 1: Get productTypeId from form schema metadata
  POST /form-schema/refresh → metadata.productTypeId = "6623a1b2..."
  (null → no category selected → VariantConfigurator shows hint)

Step 2: Get variantDimensions from ProductType
  GET /admin/product-types/6623a1b2...
  → variantDimensions: [{ attributeCode: "color", order: 1 }, { attributeCode: "storage_capacity", order: 2 }]
  (empty → "no dimensions configured" warning)

Step 3: Get options for each dimension attribute
  GET /admin/master-attributes?productTypeId=6623a1b2...
  Filter client-side: fieldType IN [SELECT, MULTI_SELECT]
  → dimensionOptions Map: "color" → ["Black", "Silver", "Gold"]
  (empty → "no selectable options found" warning)
```

---

## Resolution Chain Diagram

```
metadata.productTypeId = "6623a1b2..."
            │
            ▼
useProductTypeVariants("6623a1b2...")
            │
            ├── Parallel fetch A:
            │   GET /admin/product-types/6623a1b2...
            │   → variantDimensions: [color (order 1), storage_capacity (order 2)]
            │
            └── Parallel fetch B:
                GET /admin/master-attributes?productTypeId=6623a1b2...
                Filter: fieldType IN [SELECT, MULTI_SELECT]
                → color: options [Black, Silver, Gold]
                → storage_capacity: options [64GB, 128GB, 256GB, 512GB]
                          │
                          ▼
            dimensionOptions Map:
              "color"            → ["Midnight Black", "Silver", "Gold"]
              "storage_capacity" → ["64GB", "128GB", "256GB", "512GB"]
                          │
                          ▼
            VariantConfigurator renders:
              Axis 1 — Color:   [✓ Black] [✓ Silver] [✓ Gold]
              Axis 2 — Storage: [✓ 64GB] [✓ 128GB] [✓ 256GB] [✓ 512GB]

              SKU matrix:
                         64GB   128GB  256GB  512GB
              Black        ●      ●      ●      ●
              Silver        ●      ○      ●      ●   ← ○ = merchant disabled
              Gold      (not selected)
```

---

## VariantConfigurator — Four States

| State | Condition | Message |
|-------|-----------|---------|
| Loading | `isLoadingVariantOptions = true` | Spinner: "Loading variant options…" |
| No type | `!isTypeDriven` (productTypeId null) | "Select a product category to configure variants" |
| Type but no dimensions | `isTypeDriven && dimensions.length === 0` | Amber: "No variant dimensions configured for this Product Type" |
| Dimensions but no options | `isTypeDriven && all dimensionOptions empty` | Amber: "Variant dimensions found but no selectable options" |
| Ready | All resolved | Renders axis selectors + SKU matrix |

---

## The Six Seeded Dimensions

At server startup, `VariantDimensionOptionsDataLoader` (`@Order(206)`) seeds `options[]` on six MasterAttribute documents **only if the attribute exists and its options array is currently empty**:

| attributeCode | Seeded option labels |
|--------------|---------------------|
| `color` | Midnight Black, Silver, Gold, Space Grey, Starlight, Product Red, Sierra Blue, Alpine Green, Starlight Yellow, White |
| `size` | XS, S, M, L, XL, XXL, 3XL |
| `material` | Aluminum, Stainless Steel, Polycarbonate, Tempered Glass, Carbon Fiber, Titanium |
| `flavor` | Original, Chocolate, Vanilla, Strawberry, Mint, Mango, Mixed Berry |
| `storage_capacity` | 64GB, 128GB, 256GB, 512GB, 1TB, 2TB |
| `screen_size` | 5.4″, 6.1″, 6.7″, 13.3″, 14.0″, 15.6″, 27.0″, 32.0″ |

The seeder does NOT overwrite custom options already configured by engineers.

---

## Startup Sequence

```
@Order(100) CategoryDataLoader           → seeds product_categories
@Order(150) ProductTypeDataLoader        → seeds product_types
@Order(200) MasterAttributeDataLoader    → seeds master_attributes (no options)
@Order(206) VariantDimensionOptionsDataLoader → seeds options[] on 6 attributes
```

---

## Per-Variant Data Fields

Each generated SKU row in the table has editable fields in addition to the dimension
values (color, size, etc.). These are the fields the merchant fills in per variant:

| Field | Key in payload | Type | Notes |
|-------|---------------|------|-------|
| SKU | `sku` | text | Auto-generated as `SKU-{OPTION1}-{OPTION2}`, editable |
| Price | `price` | number (0.01 step) | |
| Compare Price | `comparePrice` | number (0.01 step) | Crossed-out price shown to buyer |
| Inventory | `inventory` | number (integer) | Units in stock |
| Barcode | `barcode` | text | EAN / UPC |
| Weight | `weight` | number | Shipping weight |

These fields are seeded with zero/empty defaults by `VariantConfigurator.generateVariants()`
and stored inside `variantConfigurator.variants[]` in the form submission:

```json
{
  "variantConfigurator": {
    "variants": [
      {
        "id": "midnight-black-128gb",
        "color": "Midnight Black",
        "storage_capacity": "128GB",
        "sku": "SKU-MIDNIGHT-BLACK-128GB",
        "price": 0,
        "comparePrice": 0,
        "inventory": 0,
        "barcode": "",
        "weight": 0,
        "variantImages": []
      }
    ]
  }
}
```

The backend seeds the same set of fields via `MasterAttributeSchemaService.addBaseVariantAttributes()`
when generating variant combinations. The field names must match exactly:

- Use `inventory` — **not** `stock`. The backend stores and validates against `inventory`.
- `cost` is not a backend-seeded field and is not included in the table.

The `variantConfigurator` field itself is treated as a system field by the backend
validator — its contents are passed through without pattern or required-field validation
(individual variant fields are not validated by the master attribute schema).

---

## Codebase

| File | Purpose |
|------|---------|
| `src/modules/ecommerce-product-v2/step1-create/hooks/useProductTypeVariants.ts` | Two parallel fetches → builds `dimensionOptions` Map |
| `src/modules/ecommerce-product-v2/step1-create/components/VariantConfigurator.tsx` | Renders axis selectors + SKU matrix table with editable per-variant fields |
| `src/modules/ecommerce-product-v2/step1-create/components/SkuMatrixPreview.tsx` | Read-only grid visualization; computes cartesian product of selected values |
| `src/modules/ecommerce-product-v2/step1-create/components/sections/VariantsSection.tsx` | Section wrapper that passes `topMeta.productTypeId` into `useProductTypeVariants` |
