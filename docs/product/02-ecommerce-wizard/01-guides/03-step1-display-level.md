# Step 1 — Display Level & Progressive Disclosure

## The Problem

A product creation form for an omnichannel platform can have 40+ fields. Showing all of them at once overwhelms sellers — most products only need a handful of fields to get started.

**Solution:** `displayLevel` on each `FormField` controls which tier of the UI reveals that field. The frontend enforces it through a `ViewLevel` state with three tiers: essential → standard → full.

---

## Two Separate Concepts — Don't Confuse Them

This system has two related but distinct things:

| Concept        | What it is                                                  | Where it lives                                 |
|----------------|-------------------------------------------------------------|------------------------------------------------|
| `displayLevel` | A **property on each field** — which tier it belongs to     | Backend schema (`ecommerce_master_attributes`) |
| `ViewLevel`    | The **current UI mode** — which tiers are visible right now | Frontend state (`useFormState.ts`)             |

`displayLevel` is set once per field by the backend. `ViewLevel` changes as the user interacts with the form.

---

## The Five Display Levels

Set by the backend on each field in `ecommerce_master_attributes`:

| `displayLevel`      | Shown when                                    | Real-world meaning                                   |
|---------------------|-----------------------------------------------|------------------------------------------------------|
| `essential`         | Always — initial load                         | Minimum to save a draft: name, category, price       |
| `basic`             | Standard + Full tiers                         | Standard fields any complete product should have     |
| `category-specific` | Standard + Full, only after category selected | Fields only meaningful for the chosen category       |
| `advanced`          | Full tier only                                | Technical details — customs codes, advanced shipping |
| `optional`          | Full tier only                                | Nice-to-have extras, not needed for most products    |

**Default:** Fields with no `displayLevel` are treated as `"basic"` — safe fallback that keeps new fields out of the initial form automatically.

`"enhanced"` is NOT a valid level — it was a dead-code artefact that has been removed.

---

## Why Does `basic` Exist If There's Already `essential`?

This is the most common point of confusion. The names suggest `basic` is simpler than `essential` — but they serve completely different purposes:

| Level       | The question it answers                       | Example fields                       | Field count |
|-------------|-----------------------------------------------|--------------------------------------|-------------|
| `essential` | *What do I need just to create a draft?*      | name, category, price                | 4–8         |
| `basic`     | *What does a complete product normally have?* | SKU, description, weight, dimensions | +10–15 more |

**`essential`** is about lowering the barrier to getting started. A new merchant sees only 4–8 fields on first load, feels achievable, and saves their first product quickly. Confidence builds.

**`basic`** is about completeness. Once the seller has committed — by selecting a category or clicking "Show recommended fields" — the form expands to reveal everything a typical product listing needs.

The gap between them is where progressive disclosure does its most important work.

### Why the naming feels confusing

`basic` sounds like it means *simpler* but it actually means *standard-complete*. A more intuitive name would be `standard` or `normal` — but `standard` was already taken by the **ViewLevel** tier name. The displayLevel `basic` maps to ViewLevel `standard`, which is the source of the mental model mismatch.

**Read it as:** `essential` = minimum to save; `basic` = minimum to be a real product listing.

---

## The Three View Tiers

```typescript
// src/modules/ecommerce-product-v2/step1-create/hooks/useFormState.ts
export type ViewLevel = 'essential' | 'standard' | 'full';
```

| ViewLevel                  | Shown displayLevels                         | Approx field count | What the seller is doing                 |
|----------------------------|---------------------------------------------|--------------------|------------------------------------------|
| `essential`                | `essential` only                            | 4–8                | Just getting started, creating a draft   |
| `standard` (no category)   | `essential` + `basic`                       | 15–25              | Clicked "Show recommended fields"        |
| `standard` (with category) | `essential` + `basic` + `category-specific` | 20–35              | Selected a category — ready to go deeper |
| `full`                     | All levels                                  | All fields         | Power user, wants full control           |

---

## ViewLevel Transitions

```
Initial load
      │
      viewLevel = "essential"  ←── resetForm()
      │
      ├── User selects a category
      │       → promoteToStandard()  →  viewLevel = "standard"
      │         (reveals basic + category-specific fields together)
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

**Why category selection promotes to `standard` automatically:**
When the user picks a category, they are signalling "I know what I'm selling." The system responds by revealing `basic` and `category-specific` fields together in one step — not two. This is intentional: both levels become relevant at the same moment.

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

| Property       | Purpose                         | Values                       | Owner                                          |
|----------------|---------------------------------|------------------------------|------------------------------------------------|
| `group`        | Backend data structure grouping | `"attribute"` \| `"variant"` | Backend                                        |
| `displayLevel` | UI progressive disclosure tier  | `"essential"` … `"optional"` | Set by backend in schema, consumed by frontend |

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

**Guidance for backend schema designers:** When adding a new field and unsure which level to use, default to `"basic"`. This keeps it out of the initial essential load without needing to think deeply about placement. Only use `"essential"` for fields a seller truly cannot skip to create any product at all.

---

## Section Expansion

- Initial expanded sections: `new Set(["product-info"])` — only the first section open on load.
- `resetForm()` returns `viewLevel` to `"essential"` and collapses all sections except `"product-info"`.
- Users can manually open/close any section at any time.
- The system does **not** auto-expand all sections that have required fields — intentionally minimalist.

---

## Codebase

| File                                            | What it handles                                                                  |
|-------------------------------------------------|----------------------------------------------------------------------------------|
| `step1-create/hooks/useFormState.ts`            | `ViewLevel` type, `viewLevel` state, `promoteToStandard()`, `setViewLevel()`     |
| `step1-create/components/ProductCreateForm.tsx` | `filteredFields` useMemo — applies `viewLevel` filter after `useFieldVisibility` |
| `step1-create/hooks/useFieldVisibility.ts`      | `isFieldVisible()` — hidden flag + variantScope + conditionalVisibility          |
| `types/form-schema.ts`                          | `FieldDisplayLevel` type definition                                              |
