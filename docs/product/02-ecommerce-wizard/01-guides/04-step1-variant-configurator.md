# Step 1 — Variant Configurator

## Overview

The variant system lets sellers create multiple SKUs (different colors, sizes, materials) without manually entering each combination. The frontend:

1. **Detects** variant dimensions automatically from the schema
2. **Lets the seller select** which option values to include (checkboxes per dimension)
3. **Generates** all cartesian product combinations as variant rows
4. **Renders** a table where each row has its own price, stock, SKU, and images

Everything is driven by the backend schema. The frontend never hardcodes field names like "color" or "size" — it discovers them at runtime.

---

## Two Components

```
VariantsSection                          VariantConfigurator
──────────────────────                   ──────────────────────────────────
hasVariants toggle                       Dimension pickers (option checkboxes)
Dual-scope value migration               Variant table (one row per combination)
Schema existence check                   Auto-SKU generation
                                         JSON serialization → onChange(jsonString)
```

`VariantsSection` is the section card in the form. `VariantConfigurator` is the core logic component inside it.

---

## Step 1: Detecting Variant Dimensions from Schema

`VariantConfigurator` filters `schema.fields` for dimension candidates:

```typescript
const dimensionFields = schema.fields.filter((field) => {
  // Must be SELECT with options
  const hasOptions = field.fieldType === 'SELECT' && field.options?.length > 0;
  if (!hasOptions) return false;

  // Any of these makes it a dimension:
  if (field.variantScope === 'variant_only') return true;
  if (field.validationRules?.isVariantDimension) return true;
  if (field.businessContext?.variantDimension) return true;

  // Name-based detection (no hardcoding — just a hint)
  const name = (field.fieldName || '').toLowerCase();
  return ['color','size','material','style','pattern','finish','texture','fabric','variant'].some(k => name.includes(k));
});
```

Note: as of Phase 5, if a `productTypeId` is resolved from the category, `useProductTypeVariants` also feeds dimensions via `ProductType.variantDimensions`. The schema-based detection above is the fallback when no ProductType is set.

---

## Step 2: Variant Table Column Configuration

Three priority levels for determining table columns:

**Priority 1 — Explicit schema config** (if `variantConfigurator` field has `validationRules.variantFields`)

**Priority 2 — Dual-scope fields from schema:**
```typescript
columns = [
  ...dimensions.map(d => ({ name: d.name, label: d.label, type: 'select' })),
  { name: 'variantImages', label: 'Images',  type: 'images' },
  ...dualFields.map(f => ({ name: f.fieldName, label: f.label, type: ... })),
]
```

**Priority 3 — Default columns (fallback):**
```
Dimension columns + Images + price + cost + comparePrice + stock + sku + weight + barcode
```

---

## Step 3: Generating the SKU Matrix

When the seller clicks "Generate Variants":

```typescript
const generateCombinations = (dims, current = {}) => {
  if (dims.length === 0) return [current];
  const [first, ...rest] = dims;
  return (selectedOptions[first.name] || []).flatMap(val =>
    generateCombinations(rest, { ...current, [first.name]: val })
  );
};
```

**Example:**
```
selectedOptions = { color: ["Black","Silver"], storage: ["64GB","128GB"] }

→ combinations:
  { color: "Black",  storage: "64GB"  }
  { color: "Black",  storage: "128GB" }
  { color: "Silver", storage: "64GB"  }
  { color: "Silver", storage: "128GB" }

→ auto-SKU: "SKU-BLACK-64GB", "SKU-BLACK-128GB", ...
```

**Preserving existing data:** When re-generating after adding more options, existing variant data is preserved by matching on `id`. Only new rows are added.

**Category change resets:** When the category changes, `selectedOptions` and `variants` are cleared — the new category may have different dimension fields.

---

## Variant Table Rendering

| Column type | Rendered as |
|---|---|
| `select` (dimension) | Read-only span — the dimension value |
| `images` | `VariantMultiImageUpload` — compact image grid per cell (up to 5 images) |
| `number` | `<input type="number">` with step |
| `text` | `<input type="text">` |

Color swatch: if a column name includes "color" and the value is a string, a colored square is shown alongside the text.

---

## Dual-Scope Fields — Value Migration

`variantScope: "dual"` fields serve double duty:
- **`hasVariants = false`:** appear as normal product-level fields in a section card
- **`hasVariants = true`:** hidden from product level; their values become defaults for the first variant row

### Enabling variants (`hasVariants → true`)

```typescript
// utils/variant-scope.ts
export function onVariantsEnabled(productValues, dualFieldNames) {
  const defaults = {};
  for (const name of dualFieldNames) {
    if (productValues[name] != null) defaults[name] = productValues[name];
  }
  return defaults;  // stored in formData._variantDefaults
}
```

### Disabling variants (`hasVariants → false`)

```typescript
export function onVariantsDisabled(variants, dualFieldNames) {
  if (!variants?.length) return {};
  const first = variants[0];
  const restored = {};
  for (const name of dualFieldNames) {
    if (first[name] != null) restored[name] = first[name];
  }
  return restored;  // values restored to product-level fields
}
```

`dualFieldNames` is resolved from `schema.metadata.variantScopedFields` (explicit backend list) or by scanning fields for `variantScope === "dual"`.

---

## State Persistence

The entire variant configuration is serialized to a JSON string and stored in `formData.variantConfigurator`:

```typescript
const config = {
  variants: currentVariants,
  options: selectedOptions,
  totalVariants: currentVariants.length,
  dimensions: variantDimensions.map(d => ({ name: d.name, label: d.label, selectedCount: ..., totalOptions: ... }))
};
onChange(JSON.stringify(config));
```

On `generateMasterProduct()`, this JSON string is parsed and `variants` is set on the product object for the API call.

On form pre-population (draft product edit), the value is parsed and state restored:

```typescript
useEffect(() => {
  if (value) {
    const parsed = JSON.parse(value);
    if (parsed.variants?.length > 0) {
      setVariants(parsed.variants);
      if (parsed.options) setSelectedOptions(parsed.options);
    }
  }
}, [value]);
```

---

## Complete Variant Flow

```
User enables hasVariants
       │
       ▼
VariantsSection.handleHasVariantsChange(true)
  onVariantsEnabled → copies dual field values to _variantDefaults
  onChange("hasVariants", true)
       │
       ▼
useFieldVisibility: dual fields hidden from section cards
VariantConfigurator renders dimension checkboxes
       │
User selects: color [✓Black, ✓Silver] + storage [✓64GB, ✓128GB]
       │
       ▼
User clicks "Generate Variants (2×2=4)"
  generateCombinations → 4 rows
  auto-SKU: SKU-BLACK-64GB, SKU-BLACK-128GB, SKU-SILVER-64GB, SKU-SILVER-128GB
       │
Variant table renders 4 rows — user edits price, stock, images
       │
       ▼
onChange(JSON.stringify(config)) → formData.variantConfigurator updated
       │
On submit: generateMasterProduct() → product.variants = parsed.variants
```

---

## Codebase

| File | Purpose |
|------|---------|
| `step1-create/components/sections/VariantsSection.tsx` | `hasVariants` toggle + dual-scope migration + renders `VariantConfigurator` |
| `step1-create/components/VariantConfigurator.tsx` | Dimension detection, checkbox pickers, cartesian generation, variant table |
| `step1-create/components/SkuMatrixPreview.tsx` | Visual grid preview — cartesian product of selected values |
| `step1-create/components/VariantMultiImageUpload.tsx` | Per-variant image upload (compact grid, up to 5 images) |
| `utils/variant-scope.ts` | `onVariantsEnabled`, `onVariantsDisabled`, `classifyFieldsByScope` |
