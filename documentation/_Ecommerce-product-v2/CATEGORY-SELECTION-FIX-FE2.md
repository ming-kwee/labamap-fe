# FE-2 Fix — useEffect Double-Fire and Mount-Time Race in useFieldHandler

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts`
**Status**: ✅ FIXED

---

## Background: What This Effect Is Supposed To Do

`useFieldHandler` contains a `useEffect` whose sole purpose is:

> When the user **enables variants** (`hasVariants` changes from `false` to `true`) while a
> category is already selected, reload the category schema — because variant-aware category
> fields may differ from the non-variant version of the same schema.

This is a legitimate need. The backend `/form-schema/refresh` response can return different
fields depending on whether the product has variants (e.g. a variant product may not need a
standalone `size` field because size is captured as a variant dimension instead).

The effect calls `onCategoryChange(category)` to trigger `loadCategoryFieldsSmooth` in
`ProductCreateForm`.

---

## The Bug

### Original code

```ts
React.useEffect(() => {
  const category = formData.category;
  if (formData.hasVariants && category && onCategoryChange) {
    onCategoryChange(category);
  }
}, [formData.hasVariants, formData.category, onCategoryChange]);
```

The condition `formData.hasVariants && category && onCategoryChange` fires whenever any of
the three dependencies change **and** `hasVariants` happens to be truthy at that moment.
It does not check whether `hasVariants` actually changed, or whether it changed in the
specific direction that matters (false → true).

This causes two distinct problems.

---

### Problem A — Mount-time race condition

React runs all `useEffect` callbacks after the first render. On mount, this effect fires
with the initial values of its dependencies.

If `formData` is initialized with both `hasVariants: true` AND a category set (from
`initialData` passed to the form — e.g. editing an existing product):

```ts
// ProductCreateForm.tsx
useFormState({ initialData: { hasVariants: true, category: 'electronics' }, ... })
```

Then on mount:
- `formData.hasVariants = true` → condition passes
- `formData.category = 'electronics'` → condition passes
- `onCategoryChange` is defined → condition passes
- **`onCategoryChange('electronics')` fires immediately**

At the same moment, `ProductCreateForm` also fires its mount effect:

```ts
useEffect(() => {
  loadSchema();   // POST /form-schema/generate with no category
}, []);
```

Both effects are scheduled in the same React commit. React runs them in definition order,
but both trigger async API calls:

```
Mount
  ├── loadSchema() fires          → POST /form-schema/generate  (Request A)
  └── onCategoryChange() fires   → POST /form-schema/refresh    (Request B)

Both requests are in-flight simultaneously.
The one that resolves last wins → setSchema(lastResponse)

If Request B resolves first:  schema = category-specific, then overwritten by A → essential only ✗
If Request A resolves first:  schema = essential, then overwritten by B → category-specific ✓ (but by accident)
```

The final schema state is determined by network timing, not by program logic. This is a
genuine race condition.

---

### Problem B — Spurious re-fires when `onCategoryChange` is recreated

`onCategoryChange` is the `handleCategoryChange` callback from `ProductCreateForm`:

```ts
const handleCategoryChange = useCallback(
  (category: string) => {
    loadCategoryFieldsSmooth(category);
    promoteToStandard();
  },
  [loadCategoryFieldsSmooth, promoteToStandard]
);
```

`loadCategoryFieldsSmooth` and `promoteToStandard` are themselves `useCallback` functions.
When their own dependencies change (e.g. after a schema loads and `useFormSchema`
re-renders), a new `handleCategoryChange` function is created — a new object reference.

`onCategoryChange` changing is a dependency of the effect. So the effect fires again.
At that point `formData.hasVariants` may already be `true` (user enabled variants earlier).
The condition passes. `onCategoryChange(category)` fires again with the same category.

```
User enables variants → effect fires → onCategoryChange called → loadCategoryFieldsSmooth fires
  └── schema loads → useFormSchema re-renders → loadCategoryFieldsSmooth recreated
        └── handleCategoryChange recreated → onCategoryChange recreated
              └── effect fires AGAIN (onCategoryChange dep changed, hasVariants still true)
                    └── onCategoryChange called AGAIN → loadCategoryFieldsSmooth fires AGAIN
                          └── cache hit → setSchema(cached) → unnecessary re-render of entire form
```

The cache prevents a second network call but not the unnecessary `setSchema` call and the
resulting full-form re-render.

---

## Root Cause Analysis

The effect was written to detect "hasVariants is true AND category exists" but it should
have been written to detect "hasVariants **just became** true". The original code checked
the current state, not the transition.

The distinction matters because:
- **Current state** (`hasVariants && category`): true on mount, true after every re-render where variants are enabled, true when `onCategoryChange` is recreated
- **Transition** (`hasVariants changed from false to true`): only true in the one specific moment the user clicks the variants toggle

---

## The Fix

### New ref: `prevHasVariantsRef`

```ts
const prevHasVariantsRef = useRef<boolean | undefined>(undefined);
```

Initialized to `undefined` — deliberately **not** `false`. This is the key to the mount
skip: `undefined === false` is `false` in JavaScript, so the "did it transition from
false to true?" check can never be true on the first run, regardless of the initial value
of `hasVariants`.

### Updated effect

```ts
React.useEffect(() => {
  const hasVariants = !!formData.hasVariants;
  const category = formData.category;

  const didEnableVariants =
    prevHasVariantsRef.current === false && hasVariants === true;

  // Always update the ref before any early return so the next run has the correct baseline
  prevHasVariantsRef.current = hasVariants;

  if (didEnableVariants && category && onCategoryChange) {
    onCategoryChange(category);
  }
}, [formData.hasVariants, formData.category, onCategoryChange]);
```

### Why the ref is updated before the condition check

`prevHasVariantsRef.current = hasVariants` is set **before** the `if (didEnableVariants...)`
call. This ensures that if `onCategoryChange` synchronously triggers a re-render (which
would re-run the effect), the ref already reflects the current state and `didEnableVariants`
would be `false` on that next run. Prevents any possible feedback loop.

---

## Scenario Trace

| Scenario | `prevHasVariantsRef` (before) | `hasVariants` | `didEnableVariants` | Result |
|----------|------------------------------|---------------|---------------------|--------|
| Mount — `hasVariants: false` | `undefined` | false | `undefined === false` → **false** | No call ✓ |
| Mount — `hasVariants: true` (initialData race) | `undefined` | true | `undefined === false` → **false** | No call ✓ |
| User enables variants (false → true) | `false` | true | `false === false && true === true` → **true** | Calls `onCategoryChange` ✓ |
| `onCategoryChange` recreated, variants still true | `true` | true | `true === false` → **false** | No call ✓ |
| Category changes while variants true | `true` | true | `true === false` → **false** | No call ✓ (handled by `handleFieldChange`) |
| User disables variants (true → false) | `true` | false | `true === false` → **false** | No call ✓ |
| User re-enables variants (false → true) | `false` | true | `false === false && true === true` → **true** | Calls `onCategoryChange` ✓ |
| `onCategoryChange` recreated again | `true` | true | `true === false` → **false** | No call ✓ |

Every scenario produces the correct result.

---

## What Did Not Change

- The dependency array `[formData.hasVariants, formData.category, onCategoryChange]` is
  unchanged. All three values that the effect reads are still listed — this satisfies the
  `react-hooks/exhaustive-deps` rule.
- `handleFieldChange`, `handleVariantConfiguratorChange`, and `getUserSelectedCategory`
  are unchanged.
- The `formData.category` dep is still correct to list — when category changes, the effect
  runs but `didEnableVariants` will be `false` (because `prevHasVariantsRef` reflects the
  unchanged `hasVariants` value), so no spurious call happens.

---

## Complete Fix Summary

| | Before | After |
|--|--------|-------|
| Code changed | Lines 63–68 (effect body) | Lines 63–88 (effect body + new ref) |
| New ref added | — | `prevHasVariantsRef = useRef<boolean \| undefined>(undefined)` |
| Mount fires `onCategoryChange`? | Yes, if `hasVariants: true` and category set | No — always skipped ✓ |
| `onCategoryChange` recreation fires again? | Yes — spurious call + unnecessary re-render | No — `didEnableVariants` is false ✓ |
| Enabling variants with category set fires? | Yes — correct | Yes — correct ✓ |
| Disabling then re-enabling variants fires? | Yes — correct | Yes — correct ✓ |
| TypeScript errors introduced | 0 | 0 |
