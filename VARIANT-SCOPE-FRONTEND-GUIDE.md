# Frontend Implementation Guide: Variant Scope Field Scoping

**Date:** 2026-02-17
**Status:** Backend Complete, Frontend Implementation Needed
**Breaking Changes:** None (additive only)
**Priority:** High — eliminates duplicate data entry for variant products

---

## Problem

When a product has variants (`hasVariants === true`), fields like `price`, `sku`, `inventory`, and `barcode` should move from the product-level form into each variant row. Currently the form renders these fields at both levels, forcing users to enter values twice.

## What Changed in the Backend

Three new fields were added to the form schema response. **No existing fields were modified or removed.**

### 1. `variantScope` on each FormField

| Value | Meaning | Example Fields |
|-------|---------|----------------|
| `null` | Product-only — always render at product level | `name`, `description`, `category`, `brand` |
| `"dual"` | Product-level when no variants; variant-level when `hasVariants === true` | `sku`, `price`, `comparePrice`, `costPrice`, `weight`, `inventory`, `barcode` |
| `"variant_only"` | Always variant-level — only render inside variant configurator | `size`, `color`, `material` |

### 2. `variantScopedFields` in FormMetadata

Pre-computed list of field names with `variantScope: "dual"`. Use this for quick lookups without iterating all fields.

### 3. `variantDimensions` in FormMetadata

Pre-computed list of field names with `variantScope: "variant_only"`. These are the variant option axes (size, color, material).

---

## Response Shape (Relevant Parts)

```json
{
  "formSchema": {
    "fields": [
      {
        "fieldName": "name",
        "fieldType": "TEXT",
        "label": "Name",
        "required": true,
        "variantScope": null,
        "displayLevel": "ESSENTIAL",
        "order": 1
      },
      {
        "fieldName": "price",
        "fieldType": "NUMBER",
        "label": "Price",
        "required": true,
        "variantScope": "dual",
        "displayLevel": "ESSENTIAL",
        "order": 4
      },
      {
        "fieldName": "size",
        "fieldType": "SELECT",
        "label": "Size",
        "required": false,
        "variantScope": "variant_only",
        "displayLevel": "ENHANCED",
        "order": 34
      }
    ],
    "metadata": {
      "fieldCount": 36,
      "requiredFieldCount": 8,
      "variantScopedFields": ["sku", "price", "comparePrice", "costPrice", "weight", "inventory", "barcode"],
      "variantDimensions": ["size", "color", "material"],
      "isInitialLoad": false,
      "selectedCategory": "clothing"
    }
  }
}
```

> **Note:** `variantScopedFields` and `variantDimensions` are `null` (not empty array) when no fields match that scope. Always null-check before using.

---

## Implementation Steps

### Step 1: Update TypeScript Types

Add the new fields to your existing form schema types:

```typescript
// types/dynamicForm.ts

interface FormField {
  fieldName: string;
  fieldType: FormFieldType;
  label: string;
  required: boolean;
  // ... existing fields ...

  /** NEW: Variant scope annotation */
  variantScope: 'dual' | 'variant_only' | null;
}

interface FormMetadata {
  fieldCount: number;
  requiredFieldCount: number;
  // ... existing fields ...

  /** NEW: Fields that move to variant-level when hasVariants=true */
  variantScopedFields: string[] | null;
  /** NEW: Fields that are always variant-level (option axes) */
  variantDimensions: string[] | null;
}
```

### Step 2: Create a Scope Classification Utility

```typescript
// utils/variantScope.ts

export function classifyFieldsByScope(
  fields: FormField[],
  hasVariants: boolean
): {
  productFields: FormField[];
  variantFields: FormField[];
} {
  const productFields: FormField[] = [];
  const variantFields: FormField[] = [];

  for (const field of fields) {
    switch (field.variantScope) {
      case 'variant_only':
        // Always variant-level — handled by variant configurator
        variantFields.push(field);
        break;

      case 'dual':
        if (hasVariants) {
          // Move to variant rows
          variantFields.push(field);
        } else {
          // Keep at product level
          productFields.push(field);
        }
        break;

      default:
        // null = always product-level
        productFields.push(field);
        break;
    }
  }

  return { productFields, variantFields };
}
```

### Step 3: Create a Quick Lookup Set (Optional Performance Optimization)

```typescript
// hooks/useVariantScope.ts

import { useMemo } from 'react';

export function useVariantScopeSets(metadata: FormMetadata) {
  return useMemo(() => ({
    dualFields: new Set(metadata.variantScopedFields ?? []),
    variantOnlyFields: new Set(metadata.variantDimensions ?? []),
  }), [metadata.variantScopedFields, metadata.variantDimensions]);
}
```

### Step 4: Update the Product Form Component

The core rendering change. When `hasVariants` is toggled, dual fields should disappear from the product form and appear in the variant table.

```tsx
// components/ProductForm.tsx

function ProductForm({ schema }: { schema: DynamicFormSchema }) {
  const [hasVariants, setHasVariants] = useState(false);
  const { productFields, variantFields } = useMemo(
    () => classifyFieldsByScope(schema.fields, hasVariants),
    [schema.fields, hasVariants]
  );

  return (
    <form>
      {/* Product-level fields */}
      {productFields.map(field => (
        <FormFieldRenderer key={field.fieldName} field={field} />
      ))}

      {/* Variant toggle (hasVariants checkbox) */}
      <VariantToggle
        checked={hasVariants}
        onChange={setHasVariants}
      />

      {/* Variant section — only when hasVariants */}
      {hasVariants && (
        <VariantConfigurator
          variantFields={variantFields}
          dimensions={schema.metadata.variantDimensions ?? []}
          dualFields={schema.metadata.variantScopedFields ?? []}
        />
      )}
    </form>
  );
}
```

### Step 5: Update the Variant Configurator / Variant Table

Each variant row should now include inputs for dual fields (price, sku, inventory, etc.) alongside the dimension selectors.

```tsx
// components/VariantConfigurator.tsx

interface VariantRow {
  // Dimension values (variant_only)
  color?: string;
  size?: string;
  material?: string;
  // Dual field values (per-variant)
  sku: string;
  price: number;
  comparePrice?: number;
  costPrice?: number;
  weight?: number;
  inventory: number;
  barcode?: string;
}

function VariantConfigurator({
  variantFields,
  dimensions,
  dualFields,
}: {
  variantFields: FormField[];
  dimensions: string[];
  dualFields: string[];
}) {
  // Separate dimension fields from dual fields for column ordering
  const dimensionColumns = variantFields.filter(f => dimensions.includes(f.fieldName));
  const dualColumns = variantFields.filter(f => dualFields.includes(f.fieldName));

  return (
    <table>
      <thead>
        <tr>
          {/* Dimension columns first (Color, Size) */}
          {dimensionColumns.map(f => (
            <th key={f.fieldName}>{f.label}</th>
          ))}
          {/* Then dual columns (SKU, Price, Inventory...) */}
          {dualColumns.map(f => (
            <th key={f.fieldName}>
              {f.label} {f.required && <span className="required">*</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {variants.map((variant, idx) => (
          <tr key={idx}>
            {dimensionColumns.map(f => (
              <td key={f.fieldName}>
                <FieldInput field={f} value={variant[f.fieldName]} onChange={...} />
              </td>
            ))}
            {dualColumns.map(f => (
              <td key={f.fieldName}>
                <FieldInput field={f} value={variant[f.fieldName]} onChange={...} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Step 6: Handle the Toggle Transition (Data Migration)

When the user toggles `hasVariants` from `false` to `true`, copy the product-level dual field values as defaults for the first variant. When toggling back, optionally restore them.

```typescript
// utils/variantToggleTransition.ts

export function onVariantsEnabled(
  productFormValues: Record<string, any>,
  dualFields: string[]
): VariantRow {
  // Create the default first variant using product-level values
  const defaultVariant: Record<string, any> = {};
  for (const fieldName of dualFields) {
    if (productFormValues[fieldName] != null) {
      defaultVariant[fieldName] = productFormValues[fieldName];
    }
  }
  return defaultVariant as VariantRow;
}

export function onVariantsDisabled(
  variants: VariantRow[],
  dualFields: string[]
): Record<string, any> {
  // Restore product-level values from the first variant
  if (variants.length === 0) return {};
  const restored: Record<string, any> = {};
  for (const fieldName of dualFields) {
    if (variants[0][fieldName] != null) {
      restored[fieldName] = variants[0][fieldName];
    }
  }
  return restored;
}
```

---

## Rendering Decision Tree

```
For each field in schema.fields:
│
├─ variantScope === null
│   └─ ALWAYS render at product level
│       (name, description, category, brand, tags, status, images, SEO...)
│
├─ variantScope === "dual"
│   ├─ hasVariants === false
│   │   └─ Render at PRODUCT level (normal input)
│   └─ hasVariants === true
│       ├─ HIDE from product form
│       └─ Render as COLUMN in variant table (per-variant input)
│
└─ variantScope === "variant_only"
    ├─ hasVariants === false
    │   └─ HIDE entirely (or show as read-only info)
    └─ hasVariants === true
        └─ Render as DIMENSION SELECTOR in variant configurator
            (these are the option axes: size, color, material)
```

---

## Validation Considerations

### Product Without Variants
- Validate dual fields at product level (price required, sku required, etc.)
- `variant_only` fields can be ignored

### Product With Variants
- Do NOT validate dual fields at product level (they moved to variant rows)
- Validate dual fields PER VARIANT ROW (each variant needs its own sku, price, inventory)
- Validate dimension fields per variant (each variant must have values for all active dimensions)

```typescript
function validateForm(
  productValues: Record<string, any>,
  variants: VariantRow[],
  fields: FormField[],
  hasVariants: boolean
) {
  const errors: ValidationError[] = [];

  for (const field of fields) {
    if (field.variantScope === 'dual' && hasVariants) {
      // Validate per variant, not at product level
      variants.forEach((variant, idx) => {
        if (field.required && !variant[field.fieldName]) {
          errors.push({
            field: field.fieldName,
            variantIndex: idx,
            message: `${field.label} is required for variant ${idx + 1}`,
          });
        }
      });
    } else if (field.variantScope !== 'variant_only' || !hasVariants) {
      // Validate at product level
      if (field.required && !productValues[field.fieldName]) {
        errors.push({
          field: field.fieldName,
          message: `${field.label} is required`,
        });
      }
    }
  }

  return errors;
}
```

---

## Submission Payload

The submission structure does NOT change. The backend already expects this format from `VARIANTS.md`:

### Without Variants
```json
{
  "name": "Basic T-Shirt",
  "description": "Comfortable cotton t-shirt",
  "category": "clothing",
  "price": 20.00,
  "sku": "TSHIRT-001",
  "inventory": 100,
  "hasVariants": false
}
```

### With Variants
```json
{
  "name": "Basic T-Shirt",
  "description": "Comfortable cotton t-shirt",
  "category": "clothing",
  "hasVariants": true,
  "variantConfigurator": {
    "dimensions": [
      { "name": "color", "values": ["Black", "White"] },
      { "name": "size", "values": ["XS", "S", "M"] }
    ],
    "variants": [
      {
        "color": "Black",
        "size": "XS",
        "sku": "TSHIRT-BLK-XS",
        "price": 20.00,
        "inventory": 10,
        "weight": 0.3
      }
    ]
  }
}
```

> **Key point:** When `hasVariants === true`, the dual fields (`price`, `sku`, `inventory`, etc.) should NOT be sent at product root level. They only exist inside each `variantConfigurator.variants[]` entry.

---

## Testing Checklist

### Functional Tests
- [ ] Simple product (no variants): all dual fields render at product level, form submits correctly
- [ ] Product with variants: dual fields disappear from product form, appear in variant table
- [ ] Toggle hasVariants ON: product-level values for dual fields copy to first variant row
- [ ] Toggle hasVariants OFF: first variant's dual values restore to product level
- [ ] Variant table columns: dimension fields (size, color) appear before dual fields (sku, price)
- [ ] Required field validation works per-variant (each row needs sku, price, inventory)
- [ ] Fields with `variantScope: null` always stay at product level regardless of toggle

### Edge Cases
- [ ] Product with variants but only 1 variant (still show variant table with dual fields)
- [ ] Empty variant rows: required dual fields show validation errors per row
- [ ] Rapid toggling hasVariants on/off preserves data correctly
- [ ] Schema with no `variantScopedFields` in metadata (null) — graceful fallback
- [ ] Category change reloads schema — new variantScope values applied correctly

### API Contract
- [ ] `GET /api/v1/ecommerce/form-schema/generate?category=clothing&channels=shopify,wix,tiktokshop` returns `variantScope` on fields
- [ ] `metadata.variantScopedFields` contains `["sku","price","comparePrice","costPrice","weight","inventory","barcode"]`
- [ ] `metadata.variantDimensions` contains `["size","color","material"]`
- [ ] Fields without scope have `variantScope: null` (not undefined, not missing)

---

## Summary of Work Required

| Task | Scope | Effort |
|------|-------|--------|
| Update TypeScript types | Add 3 new fields | Small |
| Create `classifyFieldsByScope()` utility | New utility function | Small |
| Update ProductForm to split fields by scope | Modify existing component | Medium |
| Update VariantConfigurator to accept dual fields as columns | Modify existing component | Medium |
| Handle hasVariants toggle data transition | New utility + integration | Medium |
| Update form validation for per-variant dual fields | Modify validation logic | Medium |
| Testing (functional + edge cases) | QA | Medium |

**Estimated total effort:** 2-3 days for one frontend developer.

**No backend changes needed.** The API is backward-compatible — unmodified frontends will simply ignore the new fields.
