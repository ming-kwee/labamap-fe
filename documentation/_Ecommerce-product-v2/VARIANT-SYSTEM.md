# Variant System — How It Works

## Overview

The variant system lets users create multiple versions of a product (different colors,
sizes, materials, etc.) without manually entering each combination. The frontend:

1. **Detects** variant dimensions automatically from the schema
2. **Lets the user select** which option values to include (checkboxes per dimension)
3. **Generates** all cartesian product combinations as variant rows
4. **Renders** a table where each row can have its own price, stock, SKU, images, etc.

Everything is automatic and driven by the backend schema. The frontend never hardcodes
field names like "color" or "size" — it discovers them from the schema at runtime.

---

## Architecture: Two Components

```
VariantsSection                          VariantConfigurator
───────────────────────                  ──────────────────────────────────────
hasVariants toggle                       Dimension pickers (option checkboxes)
Dual-scope value migration               Variant table (one row per combination)
Schema existence check                   Auto-SKU generation
Shows/hides based on schema              JSON serialization → onChange(jsonString)
```

`VariantsSection` is the **section card** that renders in the form.
`VariantConfigurator` is the **core logic component** inside it.

---

## Step 1: Detecting Variant Dimensions from Schema

Inside `VariantConfigurator`, the `variantDimensions` list is computed from
`schema.fields` using `useMemo`:

```ts
const dimensionFields = schema.fields.filter((field) => {
  const hasOptions =
    (field.fieldType === 'SELECT' || field.fieldType === 'select') &&
    field.options?.length > 0;

  if (!hasOptions) return false;

  // Explicitly marked as variant_only
  if (field.variantScope === 'variant_only') return true;

  // Name-based detection (common variant fields)
  const name = (field.fieldName || field.name || '').toLowerCase();
  const isCommonVariantField =
    name.includes('color') ||
    name.includes('size') ||
    name.includes('material') ||
    name.includes('style') ||
    name.includes('pattern') ||
    name.includes('finish') ||
    name.includes('texture') ||
    name.includes('fabric') ||
    name.includes('type') ||
    name.includes('variant');

  // Explicitly marked via business metadata
  const isExplicitVariantDimension =
    field.validationRules?.isVariantDimension ||
    field.businessContext?.variantDimension ||
    field.metadata?.variantDimension;

  return (isCommonVariantField || isExplicitVariantDimension) &&
         isFieldVisible(field, formData);   // respects conditionalVisibility
});
```

A SELECT field becomes a dimension if it meets **any** of these criteria:
- `variantScope === 'variant_only'`
- Field name contains a recognized variant keyword
- Has `isVariantDimension: true` in its validation rules or business context

Dimensions are also filtered by conditional visibility — if a color field only shows
for certain categories, it only becomes a dimension when that category is selected.

**Example result for Electronics + Variants enabled:**
```ts
variantDimensions = [
  { name: 'color',   label: 'Color',   options: ['Black', 'White', 'Silver'] },
  { name: 'storage', label: 'Storage', options: ['64GB', '128GB', '256GB'] },
]
```

---

## Step 2: Variant Table Column Configuration

After detecting dimensions, `VariantConfigurator` builds the `variantConfig` — the list
of columns that appear in the variant table.

### Priority 1: Explicit Config in Schema

```ts
const variantField = schema.fields.find(f =>
  f.fieldName === 'variantConfigurator' || f.name === 'variantConfigurator'
);
if (variantField?.validationRules?.variantFields) {
  return variantField.validationRules.variantFields;
}
```

If the schema defines explicit variant fields on the `variantConfigurator` field itself,
those are used as-is.

### Priority 2: Dual-scope fields from schema

```ts
const dualFields = schema.fields.filter(f => f.variantScope === 'dual');
if (dualFields.length > 0) {
  return [
    ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
    { name: 'variantImages', label: 'Images', type: 'images' },
    ...dualFields.map(f => ({
      name: f.fieldName || f.name,
      label: f.label,
      type: f.fieldType === 'NUMBER' ? 'number' : 'text'
    })),
  ];
}
```

If `dual` fields exist in the schema, the columns are: dimensions + images + all dual fields.

### Priority 3: Default columns (fallback)

```ts
return [
  ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
  { name: 'variantImages', label: 'Images',        type: 'images'  },
  { name: 'price',         label: 'Price',         type: 'number'  },
  { name: 'cost',          label: 'Cost',          type: 'number'  },
  { name: 'comparePrice',  label: 'Compare Price', type: 'number'  },
  { name: 'stock',         label: 'Stock',         type: 'number'  },
  { name: 'sku',           label: 'SKU',           type: 'text'    },
  { name: 'weight',        label: 'Weight',        type: 'number'  },
  { name: 'barcode',       label: 'Barcode',       type: 'text'    },
];
```

---

## Step 3: User Selects Options (Checkboxes)

For each dimension, the UI renders its options as checkboxes:

```
Color (3 available)
  [x] Black    [ ] White    [ ] Silver
  Selected: 1 of 3

Storage (3 available)
  [x] 64GB    [x] 128GB    [ ] 256GB
  Selected: 2 of 3
```

State: `selectedOptions: Record<string, string[]>`
```ts
selectedOptions = {
  color:   ['Black'],
  storage: ['64GB', '128GB'],
}
```

The Generate button shows the preview count:
```
Generate Variants (1 × 2 = 2)
```

The button is disabled until at least one option per dimension is selected
(i.e., `totalCombinations > 1`).

---

## Step 4: Generating Cartesian Product

When the user clicks "Generate Variants":

```ts
const generateCombinations = (
  dims: VariantDimension[],
  current: Record<string, string> = {}
): Record<string, string>[] => {
  if (dims.length === 0) return [current];
  const [first, ...rest] = dims;
  const selected = selectedOptions[first.name] || [];
  return selected.flatMap(val =>
    generateCombinations(rest, { ...current, [first.name]: val })
  );
};

const allCombinations = generateCombinations(activeDimensions);
```

**Example:**
```
activeDimensions = [color=['Black'], storage=['64GB','128GB']]

Combinations = [
  { color: 'Black', storage: '64GB' },
  { color: 'Black', storage: '128GB' },
]
```

### Building Variant Rows

Each combination becomes a `VariantOption` object:

```ts
const variant = {
  id: 'black-64gb',                              // lowercase, spaces → dashes
  color: 'Black',
  storage: '64GB',
  variantImages: existing?.variantImages || [],
  price: existing?.price || 0,
  cost: existing?.cost || 0,
  comparePrice: existing?.comparePrice || 0,
  stock: existing?.stock || 0,
  weight: existing?.weight || 0,
  sku: existing?.sku || 'SKU-BLACK-64GB',        // auto-generated from combo
  barcode: existing?.barcode || '',
  // + any additional variantConfig fields
};
```

**Important:** If regenerating (user added more options), existing variant data is
**preserved** by matching on `id`. The cartesian product only adds new rows — it does
not overwrite data already entered in existing rows.

---

## Step 5: Variant Table Rendering

Each row in the variant table renders columns from `variantConfig`:

| Column type | Rendered as |
|---|---|
| `select` (dimension column) | Read-only `<span>` — the dimension value |
| `images` | `<VariantMultiImageUpload>` — compact image grid in cell |
| `number` | `<input type="number">` with `step="0.01"` for price/cost, `step="1"` for others |
| `text` | `<input type="text">` |

Special rendering: if a column name includes 'color' and its value is a string, a color
swatch square is shown alongside the text value:

```tsx
<div className="flex items-center">
  <div className="w-6 h-6 rounded border" style={{ backgroundColor: variant[field.name] }} />
  {variant[field.name]}
</div>
```

Each row also has a "Remove" button (last column) to delete that specific variant.

---

## State Management and Persistence

### Internal state (VariantConfigurator)

```ts
const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
const [variants, setVariants] = useState<VariantOption[]>([]);
const [lastCategory, setLastCategory] = useState<string | undefined>(formData?.category);
```

### Persisting to parent

Every change calls `updateParent(variants, selectedOptions)` which serializes to JSON:

```ts
const config = {
  variants: newVariants,
  options: selectedOptions,
  totalVariants: newVariants.length,
  dimensions: variantDimensions.map(dim => ({
    name: dim.name,
    label: dim.label,
    selectedCount: selections[dim.name]?.length || 0,
    totalOptions: dim.options.length
  }))
};
onChange(JSON.stringify(config, null, 2));
```

This JSON string is stored in `formData.variantConfigurator`.
On `generateMasterProduct()`, it is parsed and its `variants` array is set on the product.

### Restoring from parent value

```ts
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

This restores state when the form is pre-populated (e.g. editing a draft product).

### Category change reset

```ts
useEffect(() => {
  const currentCategory = formData?.category;
  if (currentCategory !== lastCategory && variantDimensions.length > 0) {
    setSelectedOptions({});
    setVariants([]);
    setLastCategory(currentCategory);
  }
}, [formData?.category, variantDimensions, lastCategory]);
```

When the category changes, all selected options and generated variants are cleared.
This is necessary because a new category may have different dimension fields with
incompatible option sets.

---

## Dual-Scope Fields — Value Migration

Fields with `variantScope: 'dual'` serve double duty:
- **When hasVariants = false**: appear as normal product-level fields in a section card
- **When hasVariants = true**: hidden from the product level; their values become defaults
  for variant rows

### Enabling Variants (`hasVariants` toggled to `true`)

`VariantsSection.handleHasVariantsChange(true)` calls `onVariantsEnabled`:

```ts
// utils/variant-scope.ts
export function onVariantsEnabled(
  productValues: Record<string, any>,
  dualFieldNames: string[]
): Record<string, any> {
  const variantDefaults: Record<string, any> = {};
  for (const fieldName of dualFieldNames) {
    if (productValues[fieldName] !== undefined && productValues[fieldName] !== null) {
      variantDefaults[fieldName] = productValues[fieldName];
    }
  }
  return variantDefaults;
}
```

The returned defaults are stored in `formData._variantDefaults`. `VariantConfigurator`
can read these to pre-populate the first generated variant row.

### Disabling Variants (`hasVariants` toggled to `false`)

`VariantsSection.handleHasVariantsChange(false)` calls `onVariantsDisabled`:

```ts
export function onVariantsDisabled(
  variants: VariantOption[],
  dualFieldNames: string[]
): Record<string, any> {
  if (!variants || variants.length === 0) return {};
  const firstVariant = variants[0];
  const restored: Record<string, any> = {};
  for (const fieldName of dualFieldNames) {
    if (firstVariant[fieldName] !== undefined && firstVariant[fieldName] !== null) {
      restored[fieldName] = firstVariant[fieldName];
    }
  }
  return restored;
}
```

The first variant's values for dual fields are restored back to the product level.
Each restored field calls `onChange(key, val)` directly.

### How dualFieldNames are discovered

```ts
const dualFieldNames =
  schema?.metadata?.variantScopedFields ||            // explicit list from backend
  schema?.fields
    ?.filter(f => f.variantScope === 'dual')
    .map(f => f.fieldName || f.name) ||
  [];
```

The backend can provide an explicit list in `schema.metadata.variantScopedFields` for
performance, or the frontend discovers them by scanning `schema.fields`.

---

## Complete Variant Flow Diagram

```
User enables hasVariants
       │
       ▼
VariantsSection.handleHasVariantsChange(true)
       │ onVariantsEnabled(formData, dualFieldNames)
       │ → copies product-level dual field values to _variantDefaults
       │ → onChange('hasVariants', true)
       │
       ▼
useFieldVisibility: dual fields → not visible at product level
Schema fields with variantScope=dual disappear from section cards
       │
       ▼
VariantConfigurator receives schema + formData
  detects dimensions from schema
  renders dimension checkboxes
       │
User checks options (e.g. color:Black,White + size:S,M,L)
       │
       ▼
User clicks "Generate Variants (2 × 3 = 6)"
       │
generateCombinations(activeDimensions)
  → 6 combination objects
  → mapped to 6 VariantOption rows
  → auto-SKU: 'SKU-BLACK-S', 'SKU-BLACK-M', ...
  → preserves existing data for matching id
       │
       ▼
Variant table renders 6 rows
User edits price, stock, SKU, images per row
       │
updateParent(variants, selectedOptions)
  → JSON string → onChange() → formData.variantConfigurator updated
       │
       ▼
On submit: generateMasterProduct() parses variantConfigurator
  → product.variants = parsed.variants (array of VariantOption)
  → included in POST /api/v1/ecommerce/dynamic-products/create body
```
