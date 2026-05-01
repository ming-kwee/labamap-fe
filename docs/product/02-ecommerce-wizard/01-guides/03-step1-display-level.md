# Step 1 — Display Level & Progressive Disclosure

## The Problem

A product creation form for an omnichannel platform can have 40+ fields. Showing all of them at once overwhelms sellers — most products only need a handful of fields to get started.

**Solution:** `displayLevel` on each `FormField` controls which tier of the UI reveals that field. The frontend enforces it through a `ViewLevel` state with three tiers: essential → standard → full.

---

## The Five Display Levels

Set by the backend on each field in `ecommerce_master_attributes`:

| `displayLevel` | When shown | Purpose |
|---|---|---|
| `essential` | Always (initial load) | Minimum viable set — 4–8 fields to create a product |
| `basic` | Standard + Full tiers | Standard fields expected for most products |
| `category-specific` | Standard + Full, only after category selected | Fields meaningful only for the chosen category |
| `advanced` | Full tier only | Technical details — customs codes, advanced shipping |
| `optional` | Full tier only | Nice-to-have, not needed for most products |

Fields with no `displayLevel` are treated as `"basic"`.

`"enhanced"` is NOT a valid level — it was a dead-code artefact that has been removed.

---

## The Three View Tiers

```typescript
// src/modules/ecommerce-product-v2/step1-create/hooks/useFormState.ts
export type ViewLevel = 'essential' | 'standard' | 'full';
```

| ViewLevel | Shown displayLevels | Field count (approx) |
|---|---|---|
| `essential` | `essential` only | 4–8 |
| `standard` (no category) | `essential` + `basic` | 15–25 |
| `standard` (with category) | `essential` + `basic` + `category-specific` | 20–35 |
| `full` | All | All fields from backend |

---

## ViewLevel Transitions

```
Initial load
      │
      viewLevel = "essential"  ←── resetForm()
      │
      ├── User selects a category
      │       → promoteToStandard()  →  viewLevel = "standard"
      │
      ├── User clicks "+ Show recommended fields"
      │       → setViewLevel("standard")
      │
      └── User clicks "+ Show all fields"
              → setViewLevel("full")
                    │
                    └── User clicks "Show less"
                            → setViewLevel("essential")
```

`promoteToStandard()` is idempotent — calling it when already at `standard` or `full` has no effect.

---

## Filter Implementation

```typescript
// src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx
const filteredFields = visibleFields.filter((field) => {
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

`visibleFields` is the output of `useFieldVisibility.getVisibleFields()` — it already handles `hidden`, `variantScope`, and `conditionalVisibility` before this filter runs.

---

## Visibility Evaluation Order

`useFieldVisibility.isFieldVisible(field, formData)` evaluates in this order:

1. `field.hidden === true` → always hide (regardless of viewLevel)
2. `field.variantScope === "variant_only"` → always hide at product level
3. `field.variantScope === "dual" && formData.hasVariants` → hide when variants are enabled
4. No `conditionalVisibility` set → show
5. `conditionalVisibility.showWhen` (JS expression or operator object) → show only when truthy
6. `conditionalVisibility.hideWhen` → show only when falsy
7. Evaluation error → show (fail-open for `showWhen`; hide-fail for `hideWhen`)

---

## displayLevel vs group — Two Different Things

These two properties on `FormField` are independent and serve different purposes:

| Property | Purpose | Values | Owner |
|---|---|---|---|
| `group` | Backend data structure grouping | `"attribute"` \| `"variant"` | Backend |
| `displayLevel` | UI progressive disclosure tier | `"essential"` … `"optional"` | Set by backend in schema, consumed by frontend |

A variant dimension field can be `displayLevel: "essential"` and `group: "variant"` simultaneously.

---

## Backend Schema Examples

```json
{ "fieldName": "name",           "displayLevel": "essential", "order": 1, "required": true  }
{ "fieldName": "category",       "displayLevel": "essential", "order": 2, "required": true  }
{ "fieldName": "price",          "displayLevel": "essential", "order": 3, "required": true  }
{ "fieldName": "sku",            "displayLevel": "basic",     "order": 4, "required": false }
{ "fieldName": "brand",          "displayLevel": "category-specific" }
{ "fieldName": "customs_code",   "displayLevel": "advanced",  "required": false }
{ "fieldName": "_internal_ref",  "displayLevel": "basic",     "hidden": true  }
```

The last example — `hidden: true` — will never render even if `viewLevel` is `"full"`.

---

## Section Expansion

- Initial expanded sections: `new Set(["product-info"])` — only the first section open on load.
- `resetForm()` returns `viewLevel` to `"essential"` and collapses all sections except `"product-info"`.
- Users can manually open/close any section at any time.
- The system does **not** auto-expand all sections that have required fields — intentionally minimalist.

---

## Codebase

| File | What it handles |
|------|----------------|
| `step1-create/hooks/useFormState.ts` | `ViewLevel` type, `viewLevel` state, `promoteToStandard()`, `setViewLevel()` |
| `step1-create/components/ProductCreateForm.tsx` | `filteredFields` useMemo — applies `viewLevel` filter after `useFieldVisibility` |
| `step1-create/hooks/useFieldVisibility.ts` | `isFieldVisible()` — hidden flag + variantScope + conditionalVisibility |
| `types/form-schema.ts` | `FieldDisplayLevel` type definition |
