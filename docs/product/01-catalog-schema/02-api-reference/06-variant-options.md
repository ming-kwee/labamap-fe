# API Reference — Variant Options

Variant options are composed from two existing endpoints. No dedicated variant-options endpoint exists — the frontend fetches ProductType dimensions and MasterAttribute options in parallel.

---

## Step 1: GET `/admin/product-types/{productTypeId}`

Returns the ProductType with its `variantDimensions` array.

**Response (relevant section):**
```json
{
  "id":   "6623a1b2c3d4e5f6a7b8c9e1",
  "name": "Smartphone",
  "variantDimensions": [
    { "attributeCode": "color",            "order": 1, "required": true },
    { "attributeCode": "storage_capacity", "order": 2, "required": true }
  ],
  "active": true
}
```

`attributeCode` references a MasterAttribute's `fieldName`. `order` determines which is the row axis (1) and which is the column axis (2, 3, ...).

---

## Step 2: GET `/admin/master-attributes?productTypeId={productTypeId}`

Returns all MasterAttributes for this ProductType. The frontend filters client-side to `fieldType IN [SELECT, MULTI_SELECT]` to find attributes with `options[]`.

**Response (variant-relevant attributes):**
```json
[
  {
    "fieldName":    "color",
    "fieldType":    "SELECT",
    "label":        "Color",
    "variantScope": "variant_only",
    "options": [
      { "value": "black",  "label": "Midnight Black" },
      { "value": "silver", "label": "Silver" },
      { "value": "gold",   "label": "Gold" }
    ]
  },
  {
    "fieldName":    "storage_capacity",
    "fieldType":    "SELECT",
    "label":        "Storage",
    "variantScope": "variant_only",
    "options": [
      { "value": "64gb",  "label": "64GB"  },
      { "value": "128gb", "label": "128GB" },
      { "value": "256gb", "label": "256GB" },
      { "value": "512gb", "label": "512GB" }
    ]
  },
  {
    "fieldName":    "brand",
    "fieldType":    "TEXT",
    "variantScope": "product_only"
    // no options[] — filtered out by frontend
  }
]
```

---

## How the Frontend Builds dimensionOptions

```typescript
// src/modules/ecommerce-product-v2/step1-create/hooks/useProductTypeVariants.ts
const selectableAttributes = attributes.filter(a =>
  a.fieldType === 'SELECT' || a.fieldType === 'MULTI_SELECT'
);

const dimensionOptions = new Map<string, string[]>();
for (const dim of productType.variantDimensions) {
  const attr = selectableAttributes.find(a => a.fieldName === dim.attributeCode);
  if (attr?.options?.length) {
    dimensionOptions.set(dim.attributeCode, attr.options.map(o => o.label));
  }
}

const productTypeDimensions = productType.variantDimensions
  .sort((a, b) => a.order - b.order)
  .map(d => d.attributeCode);
// → ["color", "storage_capacity"]
```

---

## Seeded Attribute Options (VariantDimensionOptionsDataLoader)

`@Order(206)` — runs at startup if the attribute exists AND its `options[]` is empty.
Does NOT overwrite custom options the engineer has configured.

| attributeCode | fieldType | Seeded option labels |
|--------------|-----------|---------------------|
| `color` | SELECT | Midnight Black, Silver, Gold, Space Grey, Starlight, Product Red, Sierra Blue, Alpine Green, Starlight Yellow, White |
| `size` | SELECT | XS, S, M, L, XL, XXL, 3XL |
| `material` | SELECT | Aluminum, Stainless Steel, Polycarbonate, Tempered Glass, Carbon Fiber, Titanium |
| `flavor` | SELECT | Original, Chocolate, Vanilla, Strawberry, Mint, Mango, Mixed Berry |
| `storage_capacity` | SELECT | 64GB, 128GB, 256GB, 512GB, 1TB, 2TB |
| `screen_size` | SELECT | 5.4″, 6.1″, 6.7″, 13.3″, 14.0″, 15.6″, 27.0″, 32.0″ |

To add or change options: `PUT /admin/master-attributes/{id}` with the full `options[]` array.

---

## useProductTypeVariants Return Shape

```typescript
interface ProductTypeVariantsResult {
  isLoading:             boolean;
  error:                 string | null;
  isTypeDriven:          boolean;       // true when productTypeId is non-null
  productTypeDimensions: string[];      // ordered by `order`: ["color", "storage_capacity"]
  dimensionOptions:      Map<string, string[]>; // "color" → ["Midnight Black", "Silver", "Gold"]
}
```

---

## Per-Variant Fields in the Submission Payload

When the merchant submits a product with variants, the `variantConfigurator` field in
the request body carries both the dimension values and the per-SKU data:

```json
{
  "variantConfigurator": "{\"variants\":[{\"id\":\"midnight-black-128gb\",\"color\":\"Midnight Black\",\"storage_capacity\":\"128GB\",\"sku\":\"SKU-MIDNIGHT-BLACK-128GB\",\"price\":999,\"comparePrice\":1099,\"inventory\":50,\"barcode\":\"0123456789\",\"weight\":0.2,\"variantImages\":[]}]}"
}
```

The `variantConfigurator` value is a **JSON string** (serialized by the frontend before
submission). The backend treats it as a system field and passes it through without master
attribute pattern validation.

`MasterAttributeSchemaService.addBaseVariantAttributes()` seeds these fields when
generating variant combinations on the backend:

| Field | Type | Notes |
|-------|------|-------|
| `sku` | string | Required per variant; pattern `^[A-Za-z0-9_-]+$` applies only to the root-level `sku` field, **not** per-variant SKUs |
| `price` | number | |
| `comparePrice` | number | Crossed-out display price |
| `inventory` | number | **Not** `stock` — use `inventory` to match the backend field name |
| `barcode` | string | |
| `weight` | number | |

**Key constraint:** When `hasVariants = true`, the root-level `sku` field in the form is
excluded from both required-field and pattern-validation checks on the backend, because
each variant has its own SKU. The root-level `sku` can be empty or absent for variant products.

---

## POST `/admin/product-types/match-by-options` (Phase 5)

Auto-suggests ProductTypes for channel categories during second-channel onboarding.

**Request:**
```json
{ "categoryNames": ["Phones & Tablets", "Wearables", "Footwear"] }
```

**Response:**
```json
[
  {
    "categoryName":    "Phones & Tablets",
    "suggestedTypeId": "6623a1b2c3d4e5f6a7b8c9e1",
    "suggestedName":   "Smartphone",
    "matchConfidence": 87
  },
  {
    "categoryName":    "Footwear",
    "suggestedTypeId": "6623a1b2c3d4e5f6a7b8c9e5",
    "suggestedName":   "Shoe",
    "matchConfidence": 91
  }
]
```

Suggestions ≥ 60 confidence are pre-accepted in the UI. Below 60, merchant must manually select.
