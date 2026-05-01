# Product Types

## What Is a ProductType?

A **platform-owned schema contract** that answers: "What kind of object is this product?"

It is NOT a catalog category. It is a stable template defined once by platform engineers
and shared across all merchants. Examples: Smartphone, Laptop, Television, Apparel, Shoe.

A ProductType defines two things:
1. **Which MasterAttributes apply** — brand, os, ram, storage, 5g_support, ...
2. **Which variant dimensions create the SKU matrix** — color × storage, size × color, ...

---

## Why ProductType Is Necessary

Without ProductType, attributes are assigned directly to categories. Three failures:

### 1. Categories are too broad
"Electronics" contains TVs, headphones, laptops, cables — almost no attribute overlap.
A category cannot define the attribute schema.

### 2. Category renames break attribute assignments
Without ProductType, attributes store category ObjectIds. Renaming a category creates a
new document with a new ObjectId — all assignments break. The platform team must manually
reassign every attribute.

With ProductType:
```
"Smartphones" renamed → ProductType "Smartphone" unchanged → Attributes unchanged ✓
```

### 3. No variant matrix definition
`variantScope: "variant_only"` says color CAN create variants.
It does NOT say: "Smartphone uses color × storage as a 2-axis SKU grid."
Only `ProductType.variantDimensions` answers that.

---

## Variant Dimensions — Defining the SKU Matrix

```
ProductType: Smartphone
  variantDimensions: [
    { attributeCode: "color",            order: 1, required: true },
    { attributeCode: "storage_capacity", order: 2, required: true }
  ]
```

Produces a 2D SKU grid:
```
                  64GB    128GB   256GB   512GB
Midnight Black    SKU1    SKU2    SKU3    SKU4
Silver            SKU5    SKU6    SKU7    SKU8
Gold              SKU9    SKU10   SKU11   SKU12
```

The system knows the grid shape. Channel adapters know how to generate Shopify variants.

---

## Platform Setup vs Merchant Onboarding

**Platform engineer does once:**
```
Create ProductType library:
  + Smartphone   — color × storage
  + Laptop       — ram × storage
  + Television   — no variants
  + Apparel      — size × color
```

**Merchant does during onboarding** (auto-suggested, takes seconds):
```
Category "Smartphones"  →  suggested: [Smartphone ▾]  94% confidence
Category "Laptops"      →  suggested: [Laptop     ▾]  97% confidence
[Accept all suggestions]  ← most merchants click this and are done
```

Engineers define the schema once. Merchants pick from it. Engineers never touch
individual merchant categories.

---

## Resolution Chain — Full Flow

```
User selects category "Smartphones" in Step 1 form
            │
            ▼
POST /ecommerce/form-schema/refresh { context: { productCategory: "smartphones" } }
            │
Backend: DataDrivenSchemaGenerationService
  1. CategoryService.findBySlug("smartphones")
     → ProductCategory { productTypeId: "6623a1b2..." }
  2. If no productTypeId: walk ancestor chain to find nearest parent with one
  3. Response includes: metadata.productTypeId = "6623a1b2..."
            │
            ▼
Frontend: unwrapSchema() → topMeta.productTypeId = "6623a1b2..."
            │
            ▼
useProductTypeVariants("6623a1b2...")
  Parallel fetch A: GET /admin/product-types/6623a1b2...
    → variantDimensions: [{ attributeCode: "color", order: 1 }, { attributeCode: "storage_capacity", order: 2 }]
  Parallel fetch B: GET /admin/master-attributes?productTypeId=6623a1b2...
    → filter: fieldType IN [SELECT, MULTI_SELECT]
    → color: options [Black, Silver, Gold, ...]
    → storage_capacity: options [64GB, 128GB, 256GB, 512GB]
            │
            ▼
VariantConfigurator renders color × storage SKU matrix
```

---

## Category Split — Zero Attribute Reassignment

```
BEFORE: Smartphones [productTypeId: Smartphone]

Catalog team splits into:
  Budget Smartphones  [no productTypeId → inherits Smartphone from parent]
  Premium Smartphones [no productTypeId → inherits Smartphone from parent]

RESULT:
  ProductType "Smartphone" unchanged ✓
  All attributes still flow through the ProductType ✓
  Zero attribute reassignment required ✓
```

---

## Admin Wireframe — Variant Dimension Config

```
┌──────────────────────────────────────────────────────────────────┐
│  Omni Admin › Catalog Setup › Product Types › Smartphone         │
├──────────────────────────────────────────────────────────────────┤
│  Variant Dimensions — defines the SKU matrix                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Axis 1 (rows)     [Color              ▾]  ✓ Required     │   │
│  │ Axis 2 (columns)  [Storage Capacity   ▾]  ✓ Required     │   │
│  │ Axis 3 (depth)    [—  none  —         ▾]  ○ Optional     │   │
│  │                              [+ Add dimension]           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Preview (sample values)                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              64GB     128GB    256GB                     │   │
│  │  Black        ○         ○        ○                       │   │
│  │  Silver       ○         ○        ○                       │   │
│  │  Gold         ○         ○        ○                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Frontend Codebase

### useProductTypeVariants
`src/modules/ecommerce-product-v2/step1-create/hooks/useProductTypeVariants.ts`
```typescript
function useProductTypeVariants(productTypeId: string | null | undefined) {
  // Two parallel fetches → build dimensionOptions Map
  return {
    isLoading:             boolean,
    isTypeDriven:          boolean,           // true when productTypeId is set
    productTypeDimensions: string[],          // ["color", "storage_capacity"]
    dimensionOptions:      Map<string, string[]>, // "color" → ["Black", "Silver", ...]
  }
}
```

### VariantConfigurator 4 states
`src/modules/ecommerce-product-v2/step1-create/components/VariantConfigurator.tsx`

| State | Condition | Message |
|-------|-----------|---------|
| Loading | `isLoadingVariantOptions` | Spinner |
| No category | `!isTypeDriven` | "Select a product category to configure variants" |
| No dimensions | `isTypeDriven && dimensions.length === 0` | Amber: "No variant dimensions configured" |
| No options | `isTypeDriven && dimensions.length > 0 && options empty` | Amber: "No selectable options found" |
| Ready | All resolved | Renders axis selectors + SKU matrix |
