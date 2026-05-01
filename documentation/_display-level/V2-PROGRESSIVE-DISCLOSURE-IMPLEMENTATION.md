# ecommerce-product-v2 — Progressive Disclosure: Implementation Plan

**Date**: 2026-03-30
**Module**: `src/modules/ecommerce-product-v2/step1-create/`
**Status**: PLANNED — implements 5 targeted fixes

---

## Design Goal

Show the **minimum viable set of fields** on first render and reveal more on demand.
The backend already controls what is "essential" via `displayLevel` in `ecommerce_master_attributes`.
The frontend needs to trust and enforce it.

---

## View Level Model (3 tiers, strictly enforced)

```
essential  →  standard  →  full
```

| Tier | Fields shown | Triggered by |
|------|-------------|--------------|
| `essential` | `displayLevel === "essential"` only | Initial load (always) |
| `standard` | `essential` + `basic` | Category selected OR user clicks "Show more fields" |
| `full` | All levels | User clicks "Show all fields" |

Fields with no `displayLevel` in the response are treated as `"basic"` (not essential),
so they stay hidden on initial load instead of leaking through.

---

## Fix 1 — Repair the display-level filter

**File**: `ProductCreateForm.tsx`
**Replace**: lines 244–266 (`filteredFields` computation)

### Before (broken — admits everything)
```ts
const filteredFields = visibleFields.filter((field: any) => {
  const displayLevel = (field.displayLevel || '').toLowerCase();
  if (formStage === 'essential') {
    return (
      displayLevel === 'essential' ||
      displayLevel === 'basic' ||
      displayLevel === 'enhanced' ||
      displayLevel === 'advanced' ||
      displayLevel === 'optional' ||
      displayLevel === ''
    );
  }
  return (
    displayLevel === 'essential' ||
    displayLevel === 'basic' ||
    displayLevel === 'enhanced' ||
    displayLevel === 'advanced' ||
    displayLevel === 'optional' ||
    displayLevel === 'category-specific' ||
    displayLevel === '' ||
    field.conditionalVisibility !== null
  );
});
```

### After (strict tier-based filter)
```ts
// viewLevel comes from useFormState (new state: 'essential' | 'standard' | 'full')
// formStage comes from useFormSchema ('essential' | 'category-specific')

const filteredFields = visibleFields.filter((field: any) => {
  // Treat missing displayLevel as 'basic' — never leak into essential view
  const level = (field.displayLevel || 'basic').toLowerCase();

  switch (viewLevel) {
    case 'essential':
      return level === 'essential';
    case 'standard':
      return level === 'essential' || level === 'basic' ||
             (formStage === 'category-specific' && level === 'category-specific');
    case 'full':
    default:
      return true;
  }
});
```

### Why this works
- `essential` stage: only 4–8 fields. Clean first impression.
- `standard` stage (after category): adds `basic` + `category-specific`. Covers 80% of use cases.
- `full` stage: shows everything including `advanced` and `optional`. Power-user mode.
- `'enhanced'` dead-code level is simply dropped — it never appears in real data.

---

## Fix 2 — Respect `field.hidden` in useFieldVisibility

**File**: `useFieldVisibility.ts`
**Add at the top of `isFieldVisible()`**, before any other checks.

```ts
export function useFieldVisibility(): UseFieldVisibilityReturn {
  const isFieldVisible = useCallback((field: FormField, formData: Record<string, any>): boolean => {
    // Respect hidden flag — backend can mark internal/computed/legacy fields hidden
    if (field.hidden === true) return false;

    if (field.variantScope === 'variant_only') return false;
    if (field.variantScope === 'dual' && formData['hasVariants']) return false;
    // ... rest unchanged
  }, []);
}
```

### Why this matters
The `FormField` type defines `hidden: boolean`. If the backend marks a field hidden (e.g.
internal reference fields, computed fields, deprecated fields), the frontend must respect it.
Without this check, these fields render as empty unusable inputs.

---

## Fix 3 — Implement `showWhen` / `hideWhen` conditional evaluation

**File**: `useFieldVisibility.ts`
**Replace**: lines 24–29 (the `// TODO: full backend conditional logic` block)

### Before (always returns true, TODO never resolved)
```ts
if ('showWhen' in bc || 'hideWhen' in bc || 'requiredWhen' in bc) {
  if (!bc.showWhen && !bc.hideWhen && !bc.requiredWhen) return true;
  return true; // TODO: full backend conditional logic
}
```

### After (evaluates the expression strings)
```ts
if ('showWhen' in bc || 'hideWhen' in bc || 'requiredWhen' in bc) {
  // All three can be absent (empty object) — default to visible
  if (!bc.showWhen && !bc.hideWhen && !bc.requiredWhen) return true;

  // showWhen: field is visible only when condition is true
  if (bc.showWhen) {
    const fn = new Function(
      'formData',
      `try { return !!(${bc.showWhen}); } catch(e) { return false; }`
    );
    return Boolean(fn(formData));
  }

  // hideWhen: field is visible only when condition is false
  if (bc.hideWhen) {
    const fn = new Function(
      'formData',
      `try { return !(${bc.hideWhen}); } catch(e) { return true; }`
    );
    return Boolean(fn(formData));
  }

  // requiredWhen only affects validation, not visibility — field is still shown
  return true;
}
```

### Expression format (from backend)
The backend sends JS expressions with `formData` as the variable:
```json
{ "showWhen": "formData.productType === 'DIGITAL'" }
{ "hideWhen": "formData.hasVariants === true" }
```

### Error handling strategy
- `showWhen` error → default `false` (hide field — safer than showing it unexpectedly)
- `hideWhen` error → default `true` (show field — safer than hiding it unexpectedly)

---

## Fix 4 — Fix auto-expand: only expand `product-info` on initial load

**File**: `ProductCreateForm.tsx`
**Replace**: lines 280–294 (the auto-expand useEffect)

### Before (expands all sections with any required field)
```ts
useEffect(() => {
  if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;
  hasAutoExpandedRef.current = true;
  const required = new Set<string>();
  for (const [sectionKey, fields] of sortedSections) {
    if ((fields as any[]).some((f: any) => f.required)) required.add(sectionKey);
  }
  if (required.size > 0) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      required.forEach((k) => next.add(k));
      return next;
    });
  }
}, [sortedSections, setExpandedSections]);
```

### After (only expand the first section once)
```ts
useEffect(() => {
  if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;
  hasAutoExpandedRef.current = true;
  // Only open product-info on initial load.
  // Pricing, shipping, etc. start collapsed — user expands on demand.
  setExpandedSections(new Set(['product-info']));
}, [sortedSections, setExpandedSections]);
```

Also update `useFormState.ts` initial state (currently opens `basic-info` and `pricing`):

```ts
// Before
const [expandedSections, setExpandedSections] = useState<Set<string>>(
  new Set(['basic-info', 'pricing'])
);

// After — only product-info open initially
const [expandedSections, setExpandedSections] = useState<Set<string>>(
  new Set(['product-info'])
);
```

### Result
On first render the user sees exactly one open section (`product-info`) containing only
`essential` fields (4–8 inputs). All other sections are collapsed with a summary header.

---

## Fix 5 — Add `viewLevel` state + progressive disclosure UI

### 5a. Add `viewLevel` to `useFormState`

```ts
// useFormState.ts
export type ViewLevel = 'essential' | 'standard' | 'full';

// Inside useFormState:
const [viewLevel, setViewLevel] = useState<ViewLevel>('essential');

// Auto-promote to 'standard' when category is selected
// (called from handleCategoryChange in ProductCreateForm)
const promoteToStandard = useCallback(() => {
  setViewLevel((prev) => prev === 'essential' ? 'standard' : prev);
}, []);
```

### 5b. Auto-promote on category selection

```ts
// ProductCreateForm.tsx — handleCategoryChange
const handleCategoryChange = useCallback(
  (category: string) => {
    loadCategoryFieldsSmooth(category);
    promoteToStandard();   // elevate from essential → standard
  },
  [loadCategoryFieldsSmooth, promoteToStandard]
);
```

### 5c. Progressive disclosure toggle UI

Add below the form header, above the first section:

```tsx
{/* Progressive disclosure controls */}
<div className="flex items-center gap-3 py-2 text-sm text-gray-500 dark:text-gray-400">
  <span>
    Showing {viewLevel === 'essential' ? 'essential fields only' :
             viewLevel === 'standard' ? 'recommended fields' : 'all fields'}
  </span>
  {viewLevel !== 'full' && (
    <button
      type="button"
      className="text-blue-600 hover:underline"
      onClick={() =>
        setViewLevel(viewLevel === 'essential' ? 'standard' : 'full')
      }
    >
      {viewLevel === 'essential' ? '+ Show recommended fields' : '+ Show all fields'}
    </button>
  )}
  {viewLevel === 'full' && (
    <button
      type="button"
      className="text-gray-400 hover:underline"
      onClick={() => setViewLevel('essential')}
    >
      Show less
    </button>
  )}
</div>
```

### 5d. Section header field count hint

Each section header can show: `"3 fields"` or `"3 required · 5 more hidden"`. This signals
to the user that more fields exist without forcing them to see everything.

This is optional for the initial implementation and can be added as a follow-up.

---

## What Does NOT Change

- `useFormSchema` — schema loading, refresh on category change: unchanged
- `FieldRenderer` — field rendering logic: unchanged
- Section components (`BasicInfoSection`, `PricingSection`, etc.): unchanged
- Backend API contract: unchanged
- `FieldDisplayLevel` type: add `'enhanced'` removal, no other changes needed

---

## Expected Result After All 5 Fixes

### Initial load (formStage = essential, viewLevel = essential)
```
[product-info ▼ expanded]
  • Product Name (required)
  • SKU (required)
  • Category (required)
  • Base Price (required)

[pricing ► collapsed]  ← user opens on demand
[media ► collapsed]
[shipping ► collapsed]
...

[Showing essential fields only]  [+ Show recommended fields]
```

### After category selected (formStage = category-specific, viewLevel = standard)
```
[product-info ▼ expanded]
  • Product Name, SKU, Category, Base Price     ← essential
  • Description, Brand, Inventory, Status       ← basic
  • [Category-specific fields injected here]    ← category-specific

[pricing ► collapsed]
...

[Showing recommended fields]  [+ Show all fields]
```

### User clicks "Show all fields" (viewLevel = full)
```
All sections visible with all display levels including advanced and optional
```

---

## Files to Modify

| File | Change |
|------|--------|
| `step1-create/hooks/useFormState.ts` | Add `viewLevel` state, `promoteToStandard`, update initial `expandedSections` |
| `step1-create/components/ProductCreateForm.tsx` | Fix `filteredFields`, fix auto-expand, add disclosure UI, call `promoteToStandard` |
| `step1-create/hooks/useFieldVisibility.ts` | Add `hidden` check, implement `showWhen/hideWhen` |
| `types/form-schema.ts` | Remove `'enhanced'` (dead level) from `FieldDisplayLevel` — optional cleanup |

Total: 3 files with surgical changes. No new files. No API changes. No type breaking changes.

---

## Backend Coordination (no code change needed now)

The backend already returns `displayLevel` from `ecommerce_master_attributes`. No backend
change is required for these fixes to work.

If the backend team wants to explicitly mark fields as `displayLevel: "essential"` or wants to
add more granularity, that is additive and this frontend will respect it automatically via Fix 1.
