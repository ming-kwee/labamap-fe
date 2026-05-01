# Initial Fields Loading — Analysis & Resolution

**Last updated**: 2026-03-31
**Status**: RESOLVED in ecommerce-product-v2
**Module**: `src/modules/ecommerce-product-v2/step1-create/`

---

## History

### Old system (pre-v2) — REMOVED

`src/components/products/DynamicProductCreationFormClean.tsx` used a hardcoded array to
decide which fields to show on first load:

```typescript
// ❌ Old approach — hardcoded, not schema-driven
const isBasicField = [
  'name', 'description', 'price', 'category', 'sku', 'brand', 'inventory', 'status'
].includes(fieldName);
```

This file no longer exists. The entire product creation flow was replaced by
`ecommerce-product-v2`.

---

## Current System (v2) — Schema-Driven

The v2 module reads `displayLevel` from the backend schema response and uses a strict
3-tier `ViewLevel` state to control which fields appear.

### ViewLevel tiers

| Tier | Fields shown | Default |
|------|-------------|---------|
| `'essential'` | `displayLevel === 'essential'` only | Yes — initial load |
| `'standard'` | `essential` + `basic` + `category-specific` (if category chosen) | Auto on category select |
| `'full'` | All fields | Manual via UI toggle |

Fields with no `displayLevel` in the backend response are treated as `'basic'` — they do
**not** leak into the `essential` initial view.

### Filter implementation

**File**: `step1-create/components/ProductCreateForm.tsx`

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

### ViewLevel state

**File**: `step1-create/hooks/useFormState.ts`

```typescript
export type ViewLevel = 'essential' | 'standard' | 'full';

const [viewLevel, setViewLevel] = useState<ViewLevel>('essential');

// Auto-promote to 'standard' when user selects a category
const promoteToStandard = useCallback(() => {
  setViewLevel((prev) => (prev === 'essential' ? 'standard' : prev));
}, []);
```

`promoteToStandard` is called inside `handleCategoryChange` in `ProductCreateForm.tsx`,
so the transition from essential → standard happens automatically.

### Progressive disclosure UI

A small text bar above the form sections shows the current level and lets the user step
forward or back without changing anything else in the form:

```
Showing essential fields only    [+ Show recommended fields]
Showing recommended fields       [+ Show all fields]
Showing all fields               [Show less]
```

---

## Backend requirements

For this to work correctly the backend `ecommerce_master_attributes` collection must set
`displayLevel` on every field document. Recommended distribution:

| displayLevel | Expected count | Examples |
|---|---|---|
| `essential` | 4–8 | name, sku, category, base price, status |
| `basic` | 10–20 | description, brand, weight, inventory, images |
| `advanced` | varies | customs code, tax class, country of origin |
| `optional` | varies | SEO title, meta description, promo text |
| `category-specific` | per category | warranty (electronics), size (clothing) |

Fields with no `displayLevel` are treated as `'basic'` by the frontend — acceptable during
migration, but should be explicitly set in the database long-term.

---

## Key files

| File | Role |
|------|------|
| `step1-create/hooks/useFormState.ts` | `ViewLevel` state, `promoteToStandard` |
| `step1-create/components/ProductCreateForm.tsx` | `filteredFields` switch, disclosure UI |
| `step1-create/hooks/useFieldVisibility.ts` | `hidden` flag, `showWhen/hideWhen` |
| `types/form-schema.ts` | `FieldDisplayLevel` type definition |
