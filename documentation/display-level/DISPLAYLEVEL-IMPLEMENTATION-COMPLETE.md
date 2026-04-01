# displayLevel Implementation — Complete Reference (v2)

**Last updated**: 2026-03-31
**Module**: `src/modules/ecommerce-product-v2/step1-create/`
**Status**: IMPLEMENTED AND WORKING

---

## Overview

The `displayLevel` property on `FormField` controls when a field appears in the product
creation form. The frontend enforces it through a `ViewLevel` state with three tiers.
The backend sets `displayLevel` per field in `ecommerce_master_attributes`.

---

## Type definition

**File**: `src/modules/ecommerce-product-v2/types/form-schema.ts`

```typescript
// UI display categorization — separate from backend's 'group' (attribute | variant)
export type FieldDisplayLevel =
  | 'essential'           // Always visible on initial load
  | 'basic'               // Visible after category selected (standard view)
  | 'advanced'            // Visible only in full view
  | 'optional'            // Visible only in full view
  | 'category-specific';  // Visible in standard/full when category is chosen

export interface FormField {
  // ...
  displayLevel?: FieldDisplayLevel;   // Controls which tier shows this field
  hidden: boolean;                    // If true, never renders regardless of tier
  // ...
}
```

`'enhanced'` is NOT a valid level. It was a dead-code artefact in the old filter and has
been removed.

---

## ViewLevel state

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFormState.ts`

```typescript
export type ViewLevel = 'essential' | 'standard' | 'full';
```

| ViewLevel | Shown displayLevels | When active |
|-----------|---------------------|-------------|
| `essential` | `essential` only | Always — initial load |
| `standard` | `essential` + `basic` + `category-specific`* | After category selected or user clicks "Show recommended" |
| `full` | All levels | User clicks "Show all fields" |

*`category-specific` is only included in `standard` when `formStage === 'category-specific'`
(i.e. the user has selected a category and the category schema has loaded).

Missing `displayLevel` is treated as `'basic'` — visible in `standard` and `full`, not in
`essential`.

---

## Filter implementation

**File**: `step1-create/components/ProductCreateForm.tsx` — inside `sortedSections` useMemo

```typescript
const filteredFields = visibleFields.filter((field: any) => {
  const level = (field.displayLevel || 'basic').toLowerCase();
  switch (viewLevel) {
    case 'essential':
      return level === 'essential';
    case 'standard':
      return (
        level === 'essential' ||
        level === 'basic' ||
        (formStage === 'category-specific' && level === 'category-specific')
      );
    case 'full':
    default:
      return true;
  }
});
```

`visibleFields` is pre-filtered by `useFieldVisibility.getVisibleFields()` which handles
the `hidden` flag and `showWhen/hideWhen` conditions before this filter runs.

---

## Field visibility rules (useFieldVisibility)

**File**: `step1-create/hooks/useFieldVisibility.ts`

Evaluated in order:

1. `field.hidden === true` → always hide
2. `field.variantScope === 'variant_only'` → always hide (appears in variant editor only)
3. `field.variantScope === 'dual' && formData.hasVariants` → hide (field is in variant editor when variants enabled)
4. No `conditionalVisibility` → show
5. `conditionalVisibility.showWhen` (JS expression string) → show only when expression is truthy
6. `conditionalVisibility.hideWhen` (JS expression string) → show only when expression is falsy
7. `conditionalVisibility.requiredWhen` — affects validation only, field is shown
8. Operator-based condition `{ field, operator, value }` → evaluated by switch
9. Any error → show (safe default)

`showWhen` error defaults to `false` (hide — safer than showing unexpected fields).
`hideWhen` error defaults to `true` (show — safer than hiding fields silently).

---

## Section expansion behaviour

**File**: `step1-create/hooks/useFormState.ts` + `ProductCreateForm.tsx`

- Initial expanded sections: `new Set(['product-info'])` — only the first section
- Auto-expand (runs once on schema load): sets `product-info` only — does **not** open
  all sections that have required fields
- User can open/close any section manually at any time
- `resetForm()` returns to `product-info` open, `viewLevel: 'essential'`

---

## ViewLevel transitions

```
initial load
    │
    ▼
viewLevel = 'essential'   ←── resetForm()
    │
    ├── user selects category  ──→  promoteToStandard()  ──→  viewLevel = 'standard'
    │
    └── user clicks "+ Show recommended fields"  ──→  setViewLevel('standard')
                                                           │
                                                           └── user clicks "+ Show all fields"
                                                                   ──→  setViewLevel('full')
                                                                           │
                                                                           └── user clicks "Show less"
                                                                                   ──→  setViewLevel('essential')
```

`promoteToStandard` is idempotent — calling it when already at `standard` or `full` has
no effect.

---

## Property separation: `displayLevel` vs `group`

| Property | Purpose | Values | Owner |
|----------|---------|--------|-------|
| `group` | Backend data structure | `'attribute'` \| `'variant'` | Backend |
| `displayLevel` | UI show/hide tier | `'essential'` \| `'basic'` \| `'advanced'` \| `'optional'` \| `'category-specific'` | Frontend (set by backend in schema) |

They are independent. A variant dimension field can be `displayLevel: 'essential'` and
`group: 'variant'` at the same time.

---

## Backend schema field example

```json
{
  "fieldName": "name",
  "group": "attribute",
  "displayLevel": "essential",
  "order": 1,
  "required": true,
  "hidden": false
}
```

```json
{
  "fieldName": "customs_code",
  "group": "attribute",
  "displayLevel": "advanced",
  "order": 50,
  "required": false,
  "hidden": false
}
```

```json
{
  "fieldName": "_internal_ref",
  "group": "attribute",
  "displayLevel": "basic",
  "hidden": true
}
```

The last example — `hidden: true` — will never render even if `viewLevel` is `'full'`.

---

## Expected field counts per tier

| viewLevel | Approximate visible fields |
|-----------|--------------------------|
| `essential` | 4–8 |
| `standard` (no category) | 15–25 |
| `standard` (with category) | 20–35 |
| `full` | All fields from backend |
