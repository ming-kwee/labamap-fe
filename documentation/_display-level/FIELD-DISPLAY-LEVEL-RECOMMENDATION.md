# Field Display Level — Reference Guide (v2)

**Last updated**: 2026-03-31
**Status**: DECIDED AND IMPLEMENTED — `displayLevel` is the property name in use
**Module**: `src/modules/ecommerce-product-v2/`

> This was originally a recommendation doc comparing property name options.
> The decision is settled: `displayLevel`. This file is now a reference guide
> for the five level values and their UX behaviour.

---

## The five levels

### `'essential'`

Always visible on initial form load before any category is selected.

- Minimum viable set to create a product
- Shown when `viewLevel === 'essential'` (the default)
- Typically 4–8 fields

**Examples**: product name, SKU, base price, category, status

**Backend schema**:
```json
{ "fieldName": "name", "displayLevel": "essential", "order": 1, "required": true }
```

---

### `'basic'`

Visible when `viewLevel === 'standard'` or `'full'`. Promoted automatically when the user
selects a category (`promoteToStandard()` is called from `handleCategoryChange`).

- Common product fields applicable to most categories
- Not strictly required but highly expected
- Typically 10–20 fields

**Examples**: description, brand, inventory count, images, weight, dimensions

**Backend schema**:
```json
{ "fieldName": "description", "displayLevel": "basic", "order": 6 }
```

---

### `'category-specific'`

Visible in `standard` view **only after a category is selected** (`formStage === 'category-specific'`).
Always visible in `full` view.

- Fields that only make sense for a particular product category
- Injected by the `loadCategoryFieldsSmooth` refresh call
- May be required for that category even though they are not global

**Examples**:
- Electronics: warranty period, power requirements, battery type
- Clothing: size, colour, material, care instructions
- Food: expiry date, ingredients, allergens, nutritional info

**Backend schema**:
```json
{ "fieldName": "warranty", "displayLevel": "category-specific", "order": 11, "category": "electronics" }
```

---

### `'advanced'`

Visible only when `viewLevel === 'full'`. User must explicitly click "Show all fields".

- Compliance, regulatory, customs, and tax fields
- Needed by power users or for specific markets, not everyday product creation

**Examples**: customs/harmonised code, country of origin, tax class, hazmat classification,
regulatory certifications

**Backend schema**:
```json
{ "fieldName": "customs_code", "displayLevel": "advanced", "order": 50 }
```

---

### `'optional'`

Visible only when `viewLevel === 'full'`. Treated the same as `'advanced'` by the filter.

- Nice-to-have fields that improve discoverability or marketing
- SEO and content enhancement fields

**Examples**: SEO title override, meta description, meta keywords, open graph image,
promotional copy

**Backend schema**:
```json
{ "fieldName": "seo_title", "displayLevel": "optional", "order": 60 }
```

---

## Visual flow

```
Initial load
┌─────────────────────────────┐
│ viewLevel = essential        │
│  ─────────────────────────  │
│  [product-info ▼]            │
│    name (essential)          │
│    sku (essential)           │
│    category (essential)      │
│    base price (essential)    │
│                              │
│  [pricing ►]   [media ►]    │
│  [shipping ►]  ...           │
│                              │
│  Showing essential only      │
│  [+ Show recommended fields] │
└─────────────────────────────┘

           ↓ category selected

┌─────────────────────────────┐
│ viewLevel = standard         │
│  ─────────────────────────  │
│  [product-info ▼]            │
│    name, sku, category,      │
│    base price    ← essential │
│    description, brand,       │
│    inventory, images ← basic │
│    warranty (if electronics) │
│              ← category-spec │
│                              │
│  [pricing ►]   [media ►]    │
│                              │
│  Showing recommended fields  │
│  [+ Show all fields]         │
└─────────────────────────────┘

           ↓ "Show all fields"

┌─────────────────────────────┐
│ viewLevel = full             │
│  ─────────────────────────  │
│  All sections, all fields    │
│  including advanced &        │
│  optional levels             │
│                              │
│  Showing all fields          │
│  [Show less]                 │
└─────────────────────────────┘
```

---

## Filter logic (actual implementation)

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

Fields with no `displayLevel` default to `'basic'` (the `|| 'basic'` fallback) — they
show in `standard` and `full` but not `essential`.

---

## What NOT to use

| Avoid | Reason |
|-------|--------|
| `field.group` for display filtering | `group` is `'attribute' \| 'variant'` — backend data structure, not UI tier |
| `field.required` as a proxy for essential | A field can be required but `'advanced'` — required means validation, not visibility |
| `field.order <= 10` as a proxy for essential | `order` is relative within a section, not an indicator of display tier |
| `'enhanced'` as a displayLevel value | Not defined in `FieldDisplayLevel` type, never sent by backend — dead artefact from old code |
