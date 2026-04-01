# Category Selection — Bug Analysis Report

**Date**: 2026-03-31
**Module**: `src/modules/ecommerce-product-v2/step1-create/`
**Trigger**: Analysis of what happens when a user selects a product category in the creation form
**Status**: IDENTIFIED — not yet fixed

---

## How Category Selection Works (Normal Flow)

Before diving into bugs, here is the intended flow so each bug can be understood in context.

```
User changes the category field
        │
        ▼
FieldRenderer.onChange(fieldName, value)
        │
        ▼
ProductCreateForm.handleFieldChange(fieldName, value)
        │
        ▼
useFieldHandler.handleFieldChange()
  ├── normalizes: String(value).toLowerCase().trim()
  ├── setFormData(prev => ({ ...prev, category: newCategory }))
  ├── stores in userSelectedCategory ref
  └── calls onCategoryChange(newCategory)
        │
        ▼
ProductCreateForm.handleCategoryChange(category)
  ├── loadCategoryFieldsSmooth(category)   ← API call
  └── promoteToStandard()                  ← viewLevel: essential → standard
        │
        ▼
useFormSchema.loadCategoryFieldsSmooth(category)
  ├── check cache → hit? return cached schema
  ├── check in-flight → duplicate? reuse promise
  ├── setIsAddingCategoryFields(true)
  ├── POST /api/v1/ecommerce/form-schema/refresh  { context: { productCategory: category } }
  ├── setSchema(response)                  ← FULL schema replacement
  └── setFormStage('category-specific')
        │
        ▼
ProductCreateForm.sortedSections (recomputed)
  viewLevel = 'standard' now shows essential + basic + category-specific fields
```

---

## Bug 1 — In-flight error never retries (logic error)

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts`
**Lines**: 133–141
**Severity**: HIGH
**Type**: Logic / Control Flow

### The code

```ts
if (inflightRequests.current.has(cacheKey)) {
  try {
    const result = await inflightRequests.current.get(cacheKey)!;
    setSchema(result);
    setFormStage('category-specific');
  } catch {
    // fall through to new request
  }
  return;   // ← line 141
}
```

### Why it is wrong

The `return` on line 141 is **after** the try-catch block, not inside the `try`. This means
the `return` executes unconditionally — whether the awaited promise resolved or rejected.

The comment `// fall through to new request` is written inside the `catch`, implying the
developer's intention was that a failed in-flight request should not return early but instead
continue down to make a fresh API call. The `return` placement defeats that intention entirely.

### Execution paths

| Scenario | What happens |
|----------|-------------|
| In-flight resolves successfully | `setSchema` called, `setFormStage` called, `return` executes → correct |
| In-flight rejects (network error, 500) | `catch` runs (does nothing), `return` executes → **silent failure, no retry, no error shown** |

### Consequence

1. Request for category `'electronics'` fires.
2. Before it completes, user changes selection and comes back to `'electronics'`.
3. The second call hits the in-flight check, awaits the same promise.
4. That promise rejects (e.g. backend is down).
5. The catch block runs, does nothing. Then `return` exits the function.
6. No schema is loaded. No error is set in state. The user sees the loading spinner disappear
   (because `isAddingCategoryFields` was never set to `true` in this path — it is only set
   inside the `try { setIsAddingCategoryFields(true) }` block below, which was never reached).
7. The form appears to have loaded but shows only essential fields. The user has no idea
   something went wrong.

### What the correct code should look like

```ts
if (inflightRequests.current.has(cacheKey)) {
  try {
    const result = await inflightRequests.current.get(cacheKey)!;
    setSchema(result);
    setFormStage('category-specific');
    return;   // ← move return INSIDE try block
  } catch {
    inflightRequests.current.delete(cacheKey);   // clean up failed entry
    // fall through to new request — no return here
  }
}
```

---

## Bug 2 — `useEffect` in useFieldHandler causes double schema fetch and mount-time race

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts`
**Lines**: 63–68
**Severity**: HIGH
**Type**: Race Condition / Unintended Side Effect

### The code

```ts
React.useEffect(() => {
  const category = formData.category;
  if (formData.hasVariants && category && onCategoryChange) {
    onCategoryChange(category);
  }
}, [formData.hasVariants, formData.category, onCategoryChange]);
```

### Stated intention

When a user enables variants (`hasVariants = true`) and a category is already selected, the
schema should reload so that variant-relevant category fields are included. This is a valid
need.

### Problem A — Fires on component mount when `initialData` has both fields set

`useEffect` runs after every render where any dependency changes. On the **first render** after
mount, React runs all effects. If `formData.category` is already set (from `initialData` or
`organizationDefaultCategory`) and `formData.hasVariants` is already `true` (from `initialData`),
this effect fires immediately — calling `onCategoryChange` **before** the initial `loadSchema()`
has even received a response.

```
mount
  ├── loadSchema() fires (from ProductCreateForm useEffect)          ← async, not done yet
  └── useFieldHandler useEffect fires (category is set, hasVariants: true)
        └── onCategoryChange(category) → loadCategoryFieldsSmooth()  ← second API call
              └── refreshFormSchema fires immediately
                      ↓
              Both responses arrive in unknown order.
              Whichever arrives last wins and sets the schema.
              The form may show the category-specific schema
              even before essential fields were properly established.
```

This is a genuine race condition. The two API calls (`/generate` and `/refresh`) may resolve
in any order. The later one overwrites the earlier one via `setSchema()`.

### Problem B — `onCategoryChange` identity changes more than expected

`onCategoryChange` is the `handleCategoryChange` callback from `ProductCreateForm`, which is
wrapped in `useCallback` with `[loadCategoryFieldsSmooth, promoteToStandard]` as deps. Both
of those are themselves `useCallback`s with their own deps. Any time those functions are
recreated, `handleCategoryChange` is recreated, `onCategoryChange` changes, and this effect
fires again — calling `loadCategoryFieldsSmooth` a second time even though nothing about the
category or variant state actually changed.

The cache in `loadCategoryFieldsSmooth` will catch this and return early (cache hit), but it
still calls `setSchema(cached)` and `setFormStage('category-specific')` unnecessarily,
triggering a re-render of the entire form.

### Consequence

- On a form loaded with `initialData: { category: 'electronics', hasVariants: true }`:
  the form makes 2 API calls on mount, one to `/generate`, one to `/refresh`. The last
  response wins and the schema may be wrong.
- On every `onCategoryChange` function recreation: a cache-hit call to `setSchema` triggers
  a full form re-render for no reason.

---

## Bug 3 — Stale category-specific values persist in `formData` after category change

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts:167`
         and `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx:163–182`
**Severity**: HIGH
**Type**: Data Integrity / Incorrect Submission Payload

### What happens

When the schema is replaced on category change (`setSchema(actualSchema)`), the form's
`formData` state is NOT cleaned of category-specific values from the previous category.
Only new fields with `defaultValue` get applied to empty slots (lines 163–182 in
`ProductCreateForm.tsx`). Nothing removes old values.

### Step-by-step scenario

```
1. User selects category: "Electronics"
   → schema loads with fields: warranty, power_requirements, screen_size
   → formData = {}

2. User fills in:
   warranty = "2 years"
   power_requirements = "220V"
   screen_size = "15 inch"
   → formData = { category: "electronics", warranty: "2 years", power_requirements: "220V", screen_size: "15 inch" }

3. User changes category to: "Clothing"
   → loadCategoryFieldsSmooth("clothing") fires
   → setSchema(clothingSchema)            ← schema now has: size, color, material
   → formData NOT cleared

4. formData is now:
   {
     category: "clothing",
     warranty: "2 years",          ← stale, no field exists for this in clothing schema
     power_requirements: "220V",   ← stale
     screen_size: "15 inch",       ← stale
     size: undefined,              ← new clothing field, not filled yet
     color: undefined,
     material: undefined
   }

5. User submits.
   generateMasterProduct({ formData, schema }) maps ALL formData keys.
   The submitted product JSON contains warranty, power_requirements, screen_size
   even though the active category is "Clothing" and those fields are meaningless.
```

### Why the default-value effect does not fix this

`ProductCreateForm.tsx:163–182` only applies defaults to empty fields:

```ts
if (
  field.defaultValue !== undefined &&
  (updated[fieldName] === undefined || updated[fieldName] === null || updated[fieldName] === '')
) {
  updated[fieldName] = field.defaultValue;
}
```

This adds values to new fields if they have defaults. It never removes values for fields
that no longer exist in the schema.

### Consequence

Products submitted after a category switch will have incorrect attributes in the database.
This corrupts product data silently — the form doesn't show the stale fields, so the user
cannot see or correct them.

---

## Bug 4 — Submit button not disabled while category schema is loading

**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
**Lines**: ~459 (submit button)
**Severity**: MEDIUM
**Type**: UX / Premature Submission

### The code

```tsx
<Button type="submit" variant="primary" disabled={isSubmitting}>
  {isSubmitting ? 'Creating Product...' : 'Create Product'}
</Button>
```

`isAddingCategoryFields` is available in the component (destructured from `useFormSchema`)
but is **not used** to disable the submit button.

### Consequence

1. User selects a category.
2. Backend takes 1–2 seconds to return the category-specific schema.
3. During this window, `isAddingCategoryFields === true` but the submit button is enabled.
4. User clicks Submit.
5. The form submits with the schema from **before** the category was selected — missing all
   category-specific required fields and their validation.
6. The backend receives an incomplete product with no category-specific attributes.

The loading alert is shown (`Loading category-specific fields...`) but it is informational
only — it does not block any user action.

---

## Bug 5 — Category-specific sections not auto-expanded after category change

**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
         and `src/modules/ecommerce-product-v2/step1-create/hooks/useFormState.ts`
**Severity**: MEDIUM
**Type**: UX / Discovery

### What happens

After `loadCategoryFieldsSmooth` completes and `promoteToStandard()` runs:

1. `viewLevel` becomes `'standard'`
2. `formStage` becomes `'category-specific'`
3. The `filteredFields` filter now passes `category-specific` level fields
4. `groupFieldsBySection` places them into their sections (e.g. `specifications`, `taxonomy`)
5. Those sections appear in `sortedSections`

But `expandedSections` is still `new Set(['product-info'])`. The auto-expand `useEffect` in
`ProductCreateForm.tsx` has `hasAutoExpandedRef.current = true` already set from the initial
schema load — so it never runs again:

```ts
useEffect(() => {
  if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;  // ← skipped
  hasAutoExpandedRef.current = true;
  setExpandedSections(new Set(['product-info']));
}, [sortedSections, setExpandedSections]);
```

The new sections containing category-specific fields are collapsed. The user sees the
loading spinner disappear but the form looks identical to before — nothing visibly changed.
The user does not know new fields appeared unless they manually expand every section.

### Consequence

Category-specific required fields exist in the schema, the form has them, but they are
invisible inside a collapsed section. The user never sees them, never fills them, and
submits an incomplete product.

---

## Bug 6 — Cache key normalization is inconsistent between the two load functions

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts`
**Lines**: 66 vs 125
**Severity**: LOW
**Type**: Cache / Consistency

### The code

```ts
// loadSchema (line 66) — NO normalization
const cacheKey = category || 'essential';

// loadCategoryFieldsSmooth (line 125) — normalized
const cacheKey = category.toLowerCase().trim();
```

These two functions share the same `schemaCache` ref but use different key formats.

### Scenario

If `loadSchema('Electronics')` is called (e.g. `initialData.category = 'Electronics'` with
capital E), it stores the schema under key `'Electronics'`. Later,
`loadCategoryFieldsSmooth('electronics')` (after `useFieldHandler` lowercases the value)
stores under key `'electronics'`. These are two different cache entries.

The second call always makes a redundant network request because it never finds the cache
entry written by the first call. The same schema is fetched and stored twice under two
different keys, wasting memory and a round-trip.

---

## Bug 7 — `formData.category` is an unused dependency in `handleFieldChange`

**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts`
**Line**: 49
**Severity**: LOW
**Type**: Performance / Stale Closure

### The code

```ts
const handleFieldChange = useCallback((fieldName: string, value: any) => {
  if (fieldName === 'category') {
    const newCategory = String(value).toLowerCase().trim();
    setFormData(prev => ({ ...prev, category: newCategory }));
    // ... formData.category is NEVER READ inside this function
  }
  // ...
}, [formData.category, setFormData, onCategoryChange]);   // ← formData.category listed here
```

`formData.category` appears in the dependency array but is never accessed inside the
callback body. The function uses `prev => ({ ...prev, category: newCategory })` (the
functional update form) which does not need the current value from the closure.

### Consequence

Every time the user selects a category:
1. `formData.category` changes
2. `handleFieldChange` is recreated with a new reference
3. `ProductCreateForm.handleFieldChange` is recreated (it wraps this)
4. Every section component (`BasicInfoSection`, `PricingSection`, etc.) receives a new
   `onChange` prop reference and re-renders
5. Every field inside every section re-renders

This is a cascade of unnecessary re-renders on every single category change. In a form
with 40+ fields across 5 sections, this is significant.

---

## Bug 8 — `refreshFormSchema` error response body is discarded

**File**: `src/modules/ecommerce-product-v2/services/schema-api.service.ts`
**Lines**: 53–55 vs 32–39
**Severity**: LOW
**Type**: Developer Experience / Debuggability

### The asymmetry

```ts
// generateFormSchema — reads response body for error detail ✓
if (!response.ok) {
  let errorMessage = response.statusText;
  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
  } catch { /* use statusText */ }
  throw new Error(`Failed to generate form schema: ${errorMessage}`);
}

// refreshFormSchema — only uses statusText ✗
if (!response.ok) {
  throw new Error(`Failed to refresh form schema: ${response.statusText}`);
}
```

`response.statusText` is an **empty string** in most modern browsers for cross-origin
requests (Fetch API / CORS). The actual error detail (e.g. `"Category 'xyz' not found in
master attributes"`) is in the response JSON body, which is never read.

### Consequence

When a category schema refresh fails, the user and developer see:

```
Failed to refresh form schema:
```

Empty string after the colon. No indication of what went wrong — wrong category value,
backend validation error, missing MongoDB document, or server crash all look identical.
This makes backend errors essentially undebuggable from the frontend.

---

## Backend Contract Risk 1 — `/form-schema/refresh` must return a complete schema

**Severity**: HIGH
**Type**: API Contract

### The frontend assumption

`loadCategoryFieldsSmooth` calls `setSchema(actualSchema)` — a complete replacement of the
current schema state with whatever `/refresh` returns.

```ts
const actualSchema = await requestPromise;
setSchema(actualSchema);           // line 167 — full replacement, not merge
setFormStage('category-specific');
```

### The risk

If the backend's `/refresh` endpoint is designed to return only the **delta** — the new
category-specific fields that should be added on top of the existing essential+basic fields
— then after category selection, the form loses all essential and basic fields. The user
sees a form with only a handful of category-specific inputs and no name, SKU, price, etc.

The backend **must** return the full combined schema: essential + basic + category-specific
fields all together in one response.

### How to verify

After selecting a category, check the network response from `/form-schema/refresh`. It should
contain the same `name`, `sku`, `price`, `category` fields as the initial `/generate` response,
plus the new category-specific fields.

---

## Backend Contract Risk 2 — Category case sensitivity

**Severity**: MEDIUM
**Type**: API Contract

### The normalization

`useFieldHandler.ts:28`:
```ts
const newCategory = String(value).toLowerCase().trim();
```

The frontend always sends category as a lowercase trimmed string:
`productCategory: "electronics"`, never `"Electronics"` or `"ELECTRONICS"`.

### The risk

If `ecommerce_master_attributes` stores category values in their original display form
(`"Electronics"`, `"Clothing"`) and the backend query is case-sensitive:

```java
// Spring Boot / MongoDB example
Query query = new Query(Criteria.where("category").is(productCategory));
// "electronics" !== "Electronics" → returns 0 documents
```

The result: `/refresh` returns a schema with zero category-specific fields. The form shows
no extra fields after category selection. No error is thrown — the response is valid JSON
with an empty fields array.

### How to verify

Check whether `ecommerce_master_attributes` documents use lowercase or mixed-case for the
`category` field. The frontend sends lowercase — the backend query must match.

---

## Summary Table

| # | File | Lines | Severity | Type | One-line description |
|---|------|-------|----------|------|----------------------|
| FE-1 | `useFormSchema.ts` | 133–141 | HIGH | Logic | `return` outside `catch` — failed in-flight never retries |
| FE-2 | `useFieldHandler.ts` | 63–68 | HIGH | Race condition | `useEffect` fires `onCategoryChange` on mount and on function recreation |
| FE-3 | `useFormSchema.ts:167` | 167 | HIGH | Data integrity | Stale category-A values remain in `formData` after switching to category B |
| FE-4 | `ProductCreateForm.tsx` | ~459 | MEDIUM | UX | Submit not disabled while `isAddingCategoryFields` is true |
| FE-5 | `ProductCreateForm.tsx` | 280–284 | MEDIUM | UX | New category sections not auto-expanded; user cannot discover new fields |
| FE-6 | `useFormSchema.ts` | 66, 125 | LOW | Cache | Cache key format differs between `loadSchema` and `loadCategoryFieldsSmooth` |
| FE-7 | `useFieldHandler.ts` | 49 | LOW | Performance | Unused `formData.category` dep causes unnecessary re-renders on every category change |
| FE-8 | `schema-api.service.ts` | 53–55 | LOW | DX | `refreshFormSchema` discards response body — errors show as empty string |
| FE-9 | `ProductCreateForm.tsx` | 287, 329 | HIGH | Display | `displayLevel` Java enum underscore (`CATEGORY_SPECIFIC`) never matched hyphen (`category-specific`) — fields always invisible at standard view |
| FE-10 | `useFieldVisibility.ts` | showWhen/hideWhen evaluator | HIGH | Display | `conditionalVisibility` bare variable names (`category === 'electronics'`) resolve to `undefined` inside `new Function` scope — field always hidden |
| BE-1 | Backend `/refresh` endpoint | — | HIGH | Contract | Must return full schema (essential+basic+category-specific), not a delta |
| BE-2 | Backend MongoDB query | — | MEDIUM | Contract | Category lookup must be case-insensitive; frontend always sends lowercase |

---

## Fix Priority Order

### Fix immediately (data corruption / blocking bugs)
1. **FE-3** — Clean stale category fields from `formData` on category change
2. **FE-1** — Move `return` inside `try` block so failed in-flight requests retry
3. **FE-4** — Add `isAddingCategoryFields` to submit button `disabled` condition
4. **BE-1** — Verify `/refresh` returns full schema (coordinate with backend)

### Fix soon (UX / discovery)
5. **FE-5** — Auto-expand sections that contain new category-specific fields
6. **FE-2** — Guard `useEffect` with a mount-skip ref; stabilize `onCategoryChange`

### Fix when convenient (quality / performance)
7. **BE-2** — Verify backend case-insensitive category matching
8. **FE-6** — Normalize cache key in `loadSchema` the same way as `loadCategoryFieldsSmooth`
9. **FE-8** — Add response body reading to `refreshFormSchema` error handler
10. **FE-7** — Remove `formData.category` from `handleFieldChange` dependency array
