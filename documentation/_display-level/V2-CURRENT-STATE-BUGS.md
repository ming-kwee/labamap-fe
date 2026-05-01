# ecommerce-product-v2 — Current State: Display Level Bugs

**Date**: 2026-03-30
**Module**: `src/modules/ecommerce-product-v2/step1-create/`
**Status**: BUGGY — initial load shows all fields regardless of displayLevel

---

## Problem Statement

The `ecommerce_master_attributes` MongoDB collection uses `displayLevel = "essential"` to mark
the small set of fields that should appear on initial form load. The frontend is supposed to
show only those fields first, then progressively reveal more as the user fills in category,
or explicitly requests more fields.

In practice the form shows **every field from every display level on the very first render**,
defeating the purpose of progressive disclosure and overwhelming the user.

---

## Root Cause 1 — The display-level filter is a no-op

**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
**Lines**: 244–266

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
      displayLevel === ''          // catches fields with no displayLevel
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
    field.conditionalVisibility !== null  // shows ALL conditional fields
  );
});
```

### Why this is broken

The condition accepts every named level **plus** the empty string fallback. In the `essential`
stage the condition is:

```
displayLevel ∈ { essential, basic, enhanced, advanced, optional, '' }
```

This is true for **every possible field the backend sends**. The filter admits the entire
schema unchanged. Zero fields are ever removed at this step.

The `formStage` variable switches between `'essential'` and `'category-specific'` but neither
branch actually restricts anything — both branches accept all values.

### Additional problem: `'enhanced'` is not in the type

`FieldDisplayLevel` in `types/form-schema.ts` defines:
```ts
'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific'
```

`'enhanced'` is not part of the type. It is checked in the filter but never returned by the
backend. This is dead code that adds confusion.

---

## Root Cause 2 — `hidden: true` flag is never checked

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldVisibility.ts`

`FormField` defines `hidden: boolean` at `types/form-schema.ts:122`. The backend can mark a
field `hidden: true` to indicate it should never be rendered (internal fields, computed fields,
legacy fields).

`useFieldVisibility.isFieldVisible()` never reads `field.hidden`. Result: every field marked
`hidden: true` in the schema still renders on screen.

---

## Root Cause 3 — Conditional visibility always returns `true` (unimplemented TODO)

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldVisibility.ts`
**Lines**: 24–29

```ts
if (typeof condition === 'object' && condition !== null) {
  const bc = condition as any;
  if ('showWhen' in bc || 'hideWhen' in bc || 'requiredWhen' in bc) {
    if (!bc.showWhen && !bc.hideWhen && !bc.requiredWhen) return true;
    return true; // TODO: full backend conditional logic
  }
}
```

`ConditionalVisibility` (defined in `types/form-schema.ts:68`) stores visibility rules as
JavaScript expression strings:

```ts
export interface ConditionalVisibility {
  showWhen?: string;   // e.g. "formData.productType === 'DIGITAL'"
  hideWhen?: string;   // e.g. "formData.hasVariants === true"
  requiredWhen?: string;
  disabledWhen?: string;
}
```

The check on line 27 is `if (!bc.showWhen && ...)` — but `bc.showWhen` is a non-empty string
expression, so it is truthy, so the early-return is skipped. Execution then hits the
`return true; // TODO` on line 28 for **every** field that has a non-empty `showWhen` or
`hideWhen` expression.

These fields should only be visible when their condition is satisfied. Instead they are
always visible. The TODO comment confirms this was never implemented.

### String-expression branch (already exists but unreachable)

The hook at lines 32–35 does implement string-expression evaluation:

```ts
if (typeof condition === 'string') {
  const evalFunc = new Function('formData', `try { return ${condition}; } catch(e) { return true; }`);
  return Boolean(evalFunc(formData));
}
```

But `ConditionalVisibility` is an **object** (not a string), so this branch is never reached
when the backend sends `{ showWhen: "..." }`. The object branch (lines 24–29) catches it first
and returns `true` before reaching the string branch.

---

## Root Cause 4 — Auto-expand opens every section that has any required field

**File**: `ProductCreateForm.tsx`
**Lines**: 280–294

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

All sections that contain at least one required field are automatically expanded when the
schema first loads. In practice `product-info`, `pricing`, and often `shipping` all have
required fields, so all three sections blast open at once — exposing every field inside each
section simultaneously.

Initial expanded sections in `useFormState.ts` are already `['basic-info', 'pricing']`,
meaning two sections are open before the auto-expand even runs. Combined with auto-expand,
the user immediately sees 20–40 fields.

---

## Combined Effect

| Root Cause | Consequence |
|-----------|-------------|
| Filter accepts all displayLevels | 100% of fields pass the essential-stage filter |
| `hidden: true` never checked | Internal/legacy fields render |
| `showWhen/hideWhen` always true | Conditional fields show regardless of conditions |
| All sections with required fields auto-expand | Everything visible at once |

The result: on first render, a user sees every single field the backend returned, spread across
multiple open sections — typically 30–60 fields before any category is even selected.

---

## What the Correct Behaviour Should Be

**Initial load** (`formStage === 'essential'`, no category chosen):
- Only fields where `displayLevel === 'essential'`
- Only `product-info` section expanded
- Typical result: 4–8 fields (name, sku, category, price, status)

**After category selected** (`formStage === 'category-specific'`):
- `essential` + `basic` fields always visible
- `category-specific` fields injected into relevant sections
- User can click "Show advanced fields" to reveal `advanced` / `optional`

---

## Files Involved

| File | Problem |
|------|---------|
| `step1-create/components/ProductCreateForm.tsx:244–266` | Filter no-op — accepts all displayLevels |
| `step1-create/components/ProductCreateForm.tsx:280–294` | Auto-expands all sections with required fields |
| `step1-create/hooks/useFieldVisibility.ts:24–29` | `showWhen/hideWhen` always returns `true` |
| `step1-create/hooks/useFieldVisibility.ts` | `field.hidden` never checked |
| `types/form-schema.ts:91–96` | `'enhanced'` missing from `FieldDisplayLevel` type |
