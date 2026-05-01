# Category Selection — Fix Log

**Module**: `src/modules/ecommerce-product-v2/step1-create/`
**Source**: Bugs identified in `CATEGORY-SELECTION-BUGS.md`

---

## FE-1 — In-flight error never retries (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts`
**Lines changed**: 133–142
**Status**: ✅ FIXED

---

### What was wrong

Inside `loadCategoryFieldsSmooth`, when a duplicate category request arrives while an
existing one is already in-flight, the code reuses the existing promise to avoid a double
API call. That logic looked like this:

```ts
// BEFORE — broken
if (inflightRequests.current.has(cacheKey)) {
  try {
    const result = await inflightRequests.current.get(cacheKey)!;
    setSchema(result);
    setFormStage('category-specific');
  } catch {
    // fall through to new request
  }
  return;   // ← Bug: this line is AFTER the try-catch block
}
```

The `return` statement on the last line is **outside** the `try` block. In JavaScript,
after a `try-catch` completes — whether it ended normally or via a caught exception — the
code continues to the next statement. That next statement here is `return`.

This means both execution paths (success and failure) hit the `return`:

| What the in-flight promise does | Expected behaviour | Actual behaviour |
|---------------------------------|-------------------|-----------------|
| Resolves successfully | Set schema, return | Set schema, return ✓ |
| Rejects (error) | Clean up, retry with a new request | Catch runs, **return executes**, function exits with no schema and no error ✗ |

The comment `// fall through to new request` inside the `catch` block described the
developer's intent correctly — but the `return` after the block made that fall-through
impossible.

### Why this is serious

The failure scenario unfolds like this:

1. User selects category `'electronics'`. Request A fires and is registered in `inflightRequests`.
2. Before request A resolves, user quickly deselects and reselects `'electronics'`.
3. The second call sees the in-flight entry and awaits request A's promise.
4. Request A fails (backend error, network timeout, etc.).
5. The `catch` block runs — does nothing.
6. `return` executes — function exits silently.
7. `isAddingCategoryFields` was never set to `true` in this code path (that only happens in
   the `try { setIsAddingCategoryFields(true) }` block further down, which was never reached).
   So there is no loading spinner and no error shown.
8. The failed in-flight entry remains in `inflightRequests` because `delete` was never called.
9. Every future call for `'electronics'` in this session hits the same dead in-flight entry,
   awaits the same already-rejected promise, catches it, and silently returns.

**The result**: After one failed category request, that category is permanently broken for
the lifetime of the component. The user sees no error and cannot recover without a full
page reload.

---

### The fix

Move `return` inside the `try` block so it only executes on success. In the `catch` block,
delete the stale in-flight entry so the code falls through to the main `try` block and
makes a fresh request.

```ts
// AFTER — fixed
if (inflightRequests.current.has(cacheKey)) {
  try {
    const result = await inflightRequests.current.get(cacheKey)!;
    setSchema(result);
    setFormStage('category-specific');
    return;  // success — no need to make a new request
  } catch {
    // in-flight request failed — clean up and fall through to make a fresh request
    inflightRequests.current.delete(cacheKey);
  }
}
```

### Execution paths after the fix

| What the in-flight promise does | Behaviour after fix |
|---------------------------------|-------------------|
| Resolves successfully | Set schema, `return` inside `try` → exits ✓ |
| Rejects (error) | `catch` deletes stale entry, falls through to the main `try` block → makes a fresh API request, shows loading spinner, shows error if it fails again ✓ |

### What changes precisely

**One block changed, no other logic touched.**

| | Before | After |
|--|--------|-------|
| `return` position | After the try-catch (line 141) | Inside the `try` block (line 138) |
| `catch` body | Empty comment | Deletes the stale in-flight entry |
| Unconditional `return` | Present | Removed |

---

### All three execution paths in `loadCategoryFieldsSmooth` after the fix

```
loadCategoryFieldsSmooth('electronics')
        │
        ├── 1. Cache hit
        │       schemaCache.has(cacheKey) → true
        │       setSchema(cached), setFormStage, return   ← unchanged
        │
        ├── 2. In-flight hit — success
        │       inflightRequests.has(cacheKey) → true
        │       await existing promise → resolves
        │       setSchema(result), setFormStage, return   ← fixed: return now inside try
        │
        ├── 3. In-flight hit — failure  (THIS PATH WAS BROKEN)
        │       inflightRequests.has(cacheKey) → true
        │       await existing promise → rejects
        │       catch: inflightRequests.delete(cacheKey)  ← new: cleans up dead entry
        │       falls through ↓
        │
        └── 4. New request (no cache, no in-flight)
                setIsAddingCategoryFields(true)
                fire refreshFormSchema API call
                on success: setSchema, setFormStage, return
                on failure: setSchemaError (user sees error message)
                finally: setIsAddingCategoryFields(false)
```

Path 3 now correctly converges into Path 4 instead of silently exiting.

---

---

## FE-3 — Stale category values persist in formData after category change (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
**Lines added**: after line 163 (after the initial `loadSchema` effect)
**Status**: ✅ FIXED

---

### What was wrong

When a user switched from one product category to another, `loadCategoryFieldsSmooth` called
`setSchema(actualSchema)` to replace the entire schema with the new category's fields. This
is correct — the schema is the single source of truth for which fields exist.

However, `formData` was never cleaned to match. React's `setSchema` triggered a re-render
and the form stopped rendering the old category's fields (they were no longer in the schema),
but the **values the user had typed into those fields stayed in the `formData` object**.

They were invisible — no inputs existed for them — but they were still present in memory
and were included in every `generateMasterProduct()` call at submit time.

### Concrete example of corrupted data

```
1. User selects category: "Electronics"
   → schema loads with fields: warranty, power_requirements, screen_size
   → formData: { category: 'electronics' }

2. User fills in:
   warranty            = "2 years"
   power_requirements  = "220V / 50Hz"
   screen_size         = "15.6 inch"
   → formData: {
       category: 'electronics',
       warranty: '2 years',
       power_requirements: '220V / 50Hz',
       screen_size: '15.6 inch'
     }

3. User changes category to: "Clothing"
   → setSchema(clothingSchema) — schema now has: size, color, material
   → formData NOT cleaned ← bug

4. User fills in the clothing fields:
   size  = "M"
   color = "Blue"
   → formData: {
       category: 'clothing',
       size: 'M',
       color: 'Blue',
       warranty: '2 years',           ← stale — no field in schema for this
       power_requirements: '220V',    ← stale
       screen_size: '15.6 inch'       ← stale
     }

5. User submits.
   generateMasterProduct() maps ALL formData keys → product JSON sent to backend:
   {
     "category": "clothing",
     "size": "M",
     "color": "Blue",
     "warranty": "2 years",           ← incorrect attribute on a clothing product
     "power_requirements": "220V",    ← incorrect
     "screen_size": "15.6 inch"       ← incorrect
   }
```

The backend receives and stores attributes that have no meaning for the product's category.
This corrupts the product data in the database and can affect channel publishing, category
filtering, and attribute validation — all silently, with no error shown to the user.

### Why the existing default-value effect did not fix this

The effect at line 198 (`Apply schema default values`) only writes to fields that are
**empty** (`undefined`, `null`, or `''`). It never deletes fields that existed in the
previous schema but are absent from the new one. Stale values are non-empty so the effect
skips them.

### The fix

Two additions to `ProductCreateForm.tsx`:

**1. A ref to track the previous schema's field names:**

```ts
// Near the other useRef declarations (line ~97)
const prevSchemaFieldNamesRef = useRef<Set<string>>(new Set());
```

Initialized as an empty `Set`. Updated to the current schema's field names at the end of
every schema-change effect run. This gives the next run a complete picture of what fields
existed before.

**2. A cleanup effect that runs before the default-value effect:**

```ts
useEffect(() => {
  if (!schema?.fields) return;

  const newFieldNames = new Set<string>(
    schema.fields.map((f: any) => f.name || f.fieldName)
  );

  // These keys are managed outside the schema and must never be cleared automatically
  const systemFields = new Set(['category', 'hasVariants', 'variantConfigurator', 'id']);

  const staleFieldNames: string[] = [];
  for (const fieldName of prevSchemaFieldNamesRef.current) {
    if (!newFieldNames.has(fieldName) && !systemFields.has(fieldName)) {
      staleFieldNames.push(fieldName);
    }
  }

  if (staleFieldNames.length > 0) {
    setFormData((prev) => {
      const updated = { ...prev };
      for (const fieldName of staleFieldNames) {
        delete updated[fieldName];
      }
      return updated;
    });
  }

  // Always update the ref so the next schema change can diff against the current one
  prevSchemaFieldNamesRef.current = newFieldNames;
}, [schema, setFormData]);
```

### How it works step by step

```
Schema changes (e.g. category Electronics → Clothing)
        │
        ▼
Effect runs with new schema
        │
        ├── Build newFieldNames = Set { size, color, material, name, sku, ... }
        │
        ├── Read prevSchemaFieldNamesRef = Set { warranty, power_requirements, screen_size, name, sku, ... }
        │
        ├── Compute stale = prevFieldNames − newFieldNames − systemFields
        │     = { warranty, power_requirements, screen_size }
        │
        ├── staleFieldNames.length > 0 → setFormData:
        │     delete formData.warranty
        │     delete formData.power_requirements
        │     delete formData.screen_size
        │
        └── prevSchemaFieldNamesRef.current = newFieldNames  ← ready for next change
```

### Effect ordering — why cleanup runs before defaults

Both the cleanup effect and the default-value effect have `[schema, setFormData]` as their
dependency array. React runs effects in definition order. The cleanup effect is defined
first (line 167), so it runs before the default-value effect (line 199).

The result is a correct two-step sequence on every schema change:

```
Step 1 — cleanup effect:   remove stale keys from formData
Step 2 — defaults effect:  apply defaultValue to any empty fields in the new schema
```

Since both use the functional update form `prev =>`, React 18 batches them correctly —
step 2 sees the already-cleaned formData from step 1.

### What is protected from cleanup

The `systemFields` set prevents the following keys from ever being deleted, regardless of
whether they appear in the schema:

| Key | Reason |
|-----|--------|
| `category` | The field that just triggered the schema change — must not be cleared |
| `hasVariants` | Variant toggle state managed separately from schema fields |
| `variantConfigurator` | Variant configuration object managed separately |
| `id` | Product ID set before schema loads, used for image uploads |

Any field name not in `systemFields` and not in the new schema will be removed.

### On first load — no cleanup

When the very first schema loads, `prevSchemaFieldNamesRef.current` is an empty `Set`.
The for-loop finds no stale fields. `setFormData` is not called. The ref is then updated
to the initial schema's field names.

This is correct — there is nothing to clean up on first load and `initialData` values
(passed via props) are preserved.

### Before and after the fix

| Scenario | Before | After |
|----------|--------|-------|
| Switch Electronics → Clothing | warranty, power_requirements stay in formData | warranty, power_requirements deleted from formData |
| Submit after category switch | Backend receives stale attributes from old category | Backend receives only attributes relevant to current category |
| First schema load | No effect (correct) | No effect (correct) |
| Shared fields (name, sku in both categories) | Preserved (not affected by bug) | Preserved (not in staleFieldNames) |
| System fields (category, hasVariants) | Always preserved | Always preserved (explicit guard) |

---

---

## FE-4 — Submit not blocked while category schema is loading (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
**Lines changed**: submit button (~line 477)
**Status**: ✅ FIXED

---

### What was wrong

The submit button had a single disabled condition:

```tsx
// BEFORE — only blocked during submission
<Button type="submit" variant="primary" disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Creating Product...
    </>
  ) : (
    'Create Product'
  )}
</Button>
```

`isAddingCategoryFields` — the flag set to `true` while `loadCategoryFieldsSmooth` waits
for the `/form-schema/refresh` API response — was destructured from `useFormSchema` and
already used to render a loading alert above the form sections. But it was never wired to
the submit button's `disabled` prop.

### Why this is a problem

Category schema loading is an async operation that can take 500 ms – 3 s depending on
backend response time. During that window the form is in a transitional state:

- The old schema (essential fields only) is still active
- The new category-specific required fields have not yet appeared in the form
- The user cannot see, fill, or validate those required fields because they do not exist yet

If the user clicks Submit during this window:

1. `handleSubmit` fires with the current schema — which is the pre-category schema
2. `generateMasterProduct({ formData, schema, ... })` maps against the old schema
3. Category-specific required fields are absent from the schema — they are not included in
   the generated product object at all
4. The product is sent to the backend with `category: 'electronics'` but without any of
   the fields that electronics requires (warranty, power requirements, etc.)
5. The backend either stores an incomplete product or returns a validation error that
   references fields the user has never seen

The alert banner (`Loading category-specific fields...`) was informational only — it gave
no indication that submission was blocked or dangerous. A fast user would not even read it
before clicking Submit.

### The fix

Two changes to the submit button:

**1. Add `isAddingCategoryFields` to the `disabled` condition:**

```tsx
disabled={isSubmitting || isAddingCategoryFields}
```

This hard-blocks form submission for the entire duration of the category schema request.
The browser prevents the form's `onSubmit` from firing. The `handleSubmit` function is
never called.

**2. Show a distinct label and spinner while category fields are loading:**

```tsx
// AFTER
<Button type="submit" variant="primary" disabled={isSubmitting || isAddingCategoryFields}>
  {isSubmitting ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Creating Product...
    </>
  ) : isAddingCategoryFields ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Loading category fields...
    </>
  ) : (
    'Create Product'
  )}
</Button>
```

The label `Loading category fields...` with the spinner directly on the submit button
communicates to the user what is happening and why the button is unresponsive. This is
more visible than the alert banner above the sections which could scroll out of view.

### All button states after the fix

| State | `disabled` | Label shown |
|-------|-----------|------------|
| Idle, no category schema loading | `false` | `Create Product` |
| Category schema loading (`isAddingCategoryFields = true`) | `true` | `Loading category fields... ⟳` |
| Form submitting (`isSubmitting = true`) | `true` | `Creating Product... ⟳` |
| Both simultaneously (edge case) | `true` | `Creating Product... ⟳` (`isSubmitting` takes priority in the ternary) |

### What did not change

- The alert banner (`Loading category-specific fields...`) above the form sections is
  unchanged — it still renders while `isAddingCategoryFields` is true. The button state
  and the banner now both communicate the same loading condition from two locations in the
  UI, reinforcing the message.
- `handleSubmit` logic is unchanged — the guard is purely at the UI layer via `disabled`.
- No new state or refs introduced.

---

---

## FE-5 — Category-specific sections not auto-expanded after category change (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
**Lines added**: new `useEffect` after the initial auto-expand effect (~line 321)
**Also changed**: added `normalizeSectionKey` to the `form-utils` import
**Status**: ✅ FIXED

---

### What was wrong

When a user selects a category:

1. `loadCategoryFieldsSmooth` fires, awaits the API, sets the new schema
2. `promoteToStandard()` sets `viewLevel = 'standard'`
3. `formStage` becomes `'category-specific'`
4. `sortedSections` recomputes — now includes sections that contain `category-specific` fields
5. Those sections render in the DOM **but are collapsed**

`expandedSections` was still `new Set(['product-info'])`. The initial auto-expand effect
(`hasAutoExpandedRef`) ran only once on first schema load and is permanently skipped
afterward (`hasAutoExpandedRef.current = true`). There was no mechanism to expand sections
introduced by a subsequent category schema change.

### What the user experienced

```
Before category selected:
  [product-info ▼] — name, sku, price, category
  [pricing ►]
  [media ►]

User selects "Electronics":
  → loading spinner appears briefly
  → spinner disappears
  → form looks IDENTICAL to before ← bug
  → [specifications ►] section is now in the DOM but collapsed
  → user has no idea new fields appeared inside it
```

The user had no signal that anything changed. Category-specific required fields (warranty,
power requirements, etc.) were sitting inside a collapsed section, invisible and unfilled.
The user would submit without ever knowing those fields existed.

This compounds Bug FE-4 (premature submission) — even after the submit button guard was
added, a user who waits for the schema to load and then submits immediately would still
miss the new fields because they never saw them.

### Why the initial auto-expand did not help

```ts
// Existing effect — runs once only
useEffect(() => {
  if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;
  hasAutoExpandedRef.current = true;              // ← set to true on first run
  setExpandedSections(new Set(['product-info']));
}, [sortedSections, setExpandedSections]);
```

`hasAutoExpandedRef.current` is set to `true` on the first run and never reset.
Every subsequent call (e.g. after category schema loads and `sortedSections` changes)
hits the early `return` immediately. This effect is intentionally one-shot — it must
not be changed to run repeatedly because that would override manual section collapses.

### The fix

A separate, dedicated `useEffect` that watches only `schema` and `formStage`. It runs
every time the schema changes while the form is in `'category-specific'` stage — which
covers both the first category selection and every subsequent category switch.

```ts
useEffect(() => {
  if (formStage !== 'category-specific' || !schema?.fields) return;

  const sectionsWithCategoryFields = new Set<string>();
  for (const field of schema.fields) {
    const level = (field.displayLevel || 'basic').toLowerCase();
    if (level === 'category-specific') {
      const sectionKey = normalizeSectionKey(field.section || 'product-info');
      sectionsWithCategoryFields.add(sectionKey);
    }
  }

  if (sectionsWithCategoryFields.size > 0) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      sectionsWithCategoryFields.forEach((k) => next.add(k));
      return next;
    });
  }
}, [schema, formStage, setExpandedSections]);
```

### How it works step by step

```
Category selected → schema changes → formStage = 'category-specific'
        │
        ▼
Effect runs
        │
        ├── formStage !== 'category-specific'?  No → continue
        │
        ├── Scan schema.fields for displayLevel === 'category-specific'
        │     e.g. warranty (section: 'specifications')
        │         power_requirements (section: 'specifications')
        │         battery_type (section: 'specifications')
        │
        ├── normalizeSectionKey each field's section
        │     'specifications' → 'specifications'
        │     (no-op for already-normalized keys)
        │
        ├── sectionsWithCategoryFields = Set { 'specifications' }
        │
        └── setExpandedSections(prev => new Set([...prev, 'specifications']))
              expandedSections: { 'product-info', 'specifications' }
```

The user now sees:

```
After category "Electronics" selected:
  [product-info ▼] — name, sku, price, category (essential)
                      description, brand, images  (basic — now visible in standard view)
  [specifications ▼] — warranty *, power_requirements *, battery_type  ← auto-opened
  [pricing ►]
  [media ►]
```

### Why `normalizeSectionKey` is needed

`field.section` comes from the backend response as-is. It may be snake_case
(`'product_info'`), camelCase (`'productInfo'`), or already kebab-case (`'product-info'`).
`normalizeSectionKey` (from `form-utils.ts`) converts all of these to kebab-case and
applies canonical aliases. Without it, the section key from the field would not match the
key already stored in `expandedSections`, and the expand would target a non-existent key.

`normalizeSectionKey` was not previously imported in `ProductCreateForm.tsx` — it is added
to the existing `form-utils` import in this fix.

### Important behaviours

**Additive expansion** — `setExpandedSections` uses the functional update form
`prev => new Set([...prev, ...new])`. Sections already open stay open. No user-collapsed
section is forced open.

**Category switch** — when the user changes from Electronics to Clothing, `schema` changes
and `formStage` is still `'category-specific'`. The effect runs again, finds the new
category's sections, and expands them. The old category's sections remain in whatever state
the user left them (they may no longer contain visible fields but they stay open/closed as
the user set them — this is harmless).

**`'full'` viewLevel** — the effect runs regardless of `viewLevel`. When `viewLevel` is
`'full'`, all category-specific fields are already visible. Expanding their section is
still correct — it ensures the section container itself is open so the fields are
reachable by scrolling.

**No category-specific fields in schema** — if the backend returns a schema with no
`displayLevel: 'category-specific'` fields (valid for a generic category), the Set remains
empty and `setExpandedSections` is never called. No unnecessary re-render.

### What did not change

- The initial auto-expand effect (`hasAutoExpandedRef`) is unchanged and still one-shot
- `expandedSections` initial state (`new Set(['product-info'])`) is unchanged
- No new state, no new refs
- `normalizeSectionKey` was already exported from `form-utils.ts` — no changes to that file

---

---

## FE-6 — Cache key normalization inconsistent between load functions (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts`
**Line changed**: 66 (one line)
**Status**: ✅ FIXED

---

### What was wrong

`useFormSchema` has two functions that both cache schemas in the same `schemaCache` ref:

| Function | Cache key formula (before fix) |
|----------|-------------------------------|
| `loadSchema(category?)` | `category \|\| 'essential'` — **no normalization** |
| `loadCategoryFieldsSmooth(category)` | `category.toLowerCase().trim()` — normalized |

Both functions read from and write to `schemaCache.current` (a `Map<string, any>`). Because
JavaScript `Map` uses strict equality for keys, two keys that differ only in case or
whitespace are treated as entirely different entries.

### Concrete collision scenario

The mismatch matters when `loadSchema` is called with a non-empty category — for example,
if `initialData.category` is pre-populated with a mixed-case value such as `'Electronics'`:

```
1. ProductCreateForm mounts with initialData = { category: 'Electronics' }

2. loadSchema('Electronics') is called (from the mount effect)
   → cacheKey = 'Electronics'            ← uppercase E, no .trim()
   → fetches from backend
   → stores under key 'Electronics'

3. useFieldHandler.handleFieldChange fires for the category field
   → normalizes: 'Electronics'.toLowerCase().trim() = 'electronics'
   → calls onCategoryChange('electronics')
   → loadCategoryFieldsSmooth('electronics') is called
   → cacheKey = 'electronics'            ← lowercase
   → schemaCache.has('electronics') → false  ← CACHE MISS
   → fires a second API call to /form-schema/refresh
   → stores under key 'electronics'

schemaCache now holds TWO entries for the same category:
  'Electronics' → schema A   (from loadSchema)
  'electronics' → schema B   (from loadCategoryFieldsSmooth)
```

The second API call was completely unnecessary — schema A was already in the cache, but
the inconsistent key format made it invisible to `loadCategoryFieldsSmooth`.

### Why severity is LOW

In normal usage `loadSchema()` is called on mount with **no category** (the optional
`category` parameter is omitted), so `cacheKey = undefined || 'essential' = 'essential'`.
`loadCategoryFieldsSmooth` only accepts a real category string and always produces a
non-`'essential'` key. The two functions target different cache entries in the common case
and the collision only surfaces when `loadSchema` is called with an explicit category value.

That said, the inconsistency is a latent bug — any future caller that passes a category to
`loadSchema` (e.g. when editing an existing product with a pre-set category) would trigger
the wasted round-trip.

### The fix

One character change on line 66 — apply the same normalization pattern:

```ts
// BEFORE
const cacheKey = category || 'essential';

// AFTER
const cacheKey = category ? category.toLowerCase().trim() : 'essential';
```

The no-category sentinel `'essential'` is preserved unchanged. It is a hardcoded internal
key that is never sent to the backend and never conflicts with a real category value in
`loadCategoryFieldsSmooth` (which always receives a non-empty string from
`useFieldHandler`, which itself already lowercases and trims the value before calling the
callback).

### Cache key consistency after the fix

| Scenario | `loadSchema` key | `loadCategoryFieldsSmooth` key | Match? |
|----------|-----------------|-------------------------------|--------|
| No category (initial load) | `'essential'` | _(never called)_ | n/a |
| `'electronics'` | `'electronics'` | `'electronics'` | ✅ |
| `'Electronics'` | `'electronics'` | `'electronics'` | ✅ |
| `'  Electronics  '` | `'electronics'` | `'electronics'` | ✅ |

Any schema fetched by `loadSchema` with a category is now findable by
`loadCategoryFieldsSmooth` for the same category, and vice versa.

---

---

## FE-7 — Unused `formData.category` dependency causes unnecessary re-renders (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts`
**Line changed**: 49 (one word removed from dependency array)
**Status**: ✅ FIXED

---

### What was wrong

`handleFieldChange` was wrapped in `useCallback` with this dependency array:

```ts
// BEFORE
const handleFieldChange = useCallback((fieldName: string, value: any) => {
  if (fieldName === 'category') {
    const newCategory = String(value).toLowerCase().trim();
    setFormData(prev => ({ ...prev, category: newCategory }));  // functional update
    userSelectedCategory.current = newCategory;
    if (onCategoryChange && newCategory) {
      onCategoryChange(newCategory);
    }
    return;
  }
  // ...
  setFormData(prev => ({ ...prev, [fieldName]: value }));       // functional update
}, [formData.category, setFormData, onCategoryChange]);
//  ^^^^^^^^^^^^^^^^
//  listed but never read inside the function body
```

`formData.category` appears in the dependency array but is **never accessed inside the
callback**. Every state update inside the function uses the functional update form
(`prev => ...`), which receives the latest state as its argument at call time — it does
not need to capture any value from the closure.

### What `useCallback` does with a changing dependency

`useCallback` returns a **memoized function reference**. It only creates a new function
reference when one of its listed dependencies changes. Listing `formData.category` means:

> "Every time `formData.category` changes, throw away the old function and create a new one."

`formData.category` changes every time the user selects a category. So the sequence is:

```
1. User opens the category dropdown and selects "Electronics"
2. handleFieldChange fires → setFormData updates formData.category = 'electronics'
3. formData.category changed → useCallback dependency changed
4. handleFieldChange is recreated with a new function reference
5. ProductCreateForm.handleFieldChange (which wraps it) is also recreated
6. Every section component receives a new onChange prop reference
7. React re-renders every section component (BasicInfoSection, PricingSection, etc.)
8. Every FieldRenderer inside each section re-renders
```

A form with 5 sections and 40 fields re-renders all 40 fields on every category change —
not because any of those fields' data changed, but because the `onChange` callback
reference changed unnecessarily.

### Why the dependency was harmless to the correctness of the function

The callback never reads `formData.category` for any decision. It only writes to it:

```ts
setFormData(prev => ({ ...prev, category: newCategory }));
```

`newCategory` is derived from the incoming `value` argument (via `String(value).toLowerCase().trim()`),
not from the closure. `prev` is supplied by React's state mechanism at the moment
`setFormData` executes — it is always the latest state, regardless of when the callback
was created. No stale closure issue exists here, with or without `formData.category` in
the deps.

The dependency was either added out of habit or as a mistaken precaution — it produced
no correctness benefit while creating a real performance cost.

### The fix

Remove `formData.category` from the dependency array:

```ts
// AFTER
}, [setFormData, onCategoryChange]);
```

`setFormData` is a stable reference from React's `useState` (never changes).
`onCategoryChange` is the only dependency that can legitimately change (it's the callback
from `ProductCreateForm`). `handleFieldChange` now only recreates when `onCategoryChange`
changes — which happens at most when the component's `loadCategoryFieldsSmooth` or
`promoteToStandard` references change, not on every category value update.

### Re-render cascade comparison

| Event | Before fix | After fix |
|-------|-----------|-----------|
| User selects a category | `handleFieldChange` recreated → all 5 sections + all fields re-render | `handleFieldChange` stable → no unnecessary re-renders |
| User types in a non-category field | No change (correct) | No change (correct) |
| `onCategoryChange` reference changes | `handleFieldChange` recreated (correct) | `handleFieldChange` recreated (correct) |

### ESLint `react-hooks/exhaustive-deps` note

Removing a dependency that is **not used** inside the callback is always safe and does
not violate the exhaustive-deps rule. The rule requires that every value **read from the
closure** is listed — it does not require listing values that are merely related by name.
`formData.category` was not read, so removing it is the correct fix, not a suppression.

---

---

## FE-8 — `refreshFormSchema` discards response body on error (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/services/schema-api.service.ts`
**Lines changed**: 53–55 (error block inside `refreshFormSchema`)
**Status**: ✅ FIXED

---

### What was wrong

`schema-api.service.ts` exports two fetch functions for the two schema endpoints.
Their error handling was asymmetric:

```ts
// generateFormSchema — reads response body ✓
if (!response.ok) {
  let errorMessage = response.statusText;
  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
  } catch {
    // use statusText
  }
  throw new Error(`Failed to generate form schema: ${errorMessage}`);
}

// refreshFormSchema — ignores response body ✗
if (!response.ok) {
  throw new Error(`Failed to refresh form schema: ${response.statusText}`);
}
```

`refreshFormSchema` only used `response.statusText` for the error message. This is
almost always an empty string.

### Why `response.statusText` is empty in practice

The Fetch API specification allows browsers to set `statusText` to an empty string for
any response. In practice:

- **CORS responses** (cross-origin fetches, which this is — the backend is on port 8888,
  the frontend on a different port): `statusText` is `""` in all major browsers
- **HTTP/2 responses**: the HTTP/2 protocol does not transmit a reason phrase at all;
  browsers set `statusText` to `""` for all HTTP/2 responses
- **HTTP/1.1 responses from Spring Boot**: the default Tomcat/Netty server does send
  reason phrases (`"Bad Request"`, `"Internal Server Error"`), but only a subset of the
  actual error detail

When the backend returns a Spring Boot error response with a message in the body:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Category 'xyz' not found in ecommerce_master_attributes",
  "path": "/labamap/api/v1/ecommerce/form-schema/refresh"
}
```

The old code threw:
```
Failed to refresh form schema:
```

An empty string after the colon. The full detail (`"Category 'xyz' not found..."`) was
in the response body but was never read — it was silently discarded when `response.ok`
was false.

### Consequence for developers and users

Every failure mode of the `/refresh` endpoint was indistinguishable:

| Actual backend error | Error shown to user (before fix) |
|----------------------|----------------------------------|
| Category not found in MongoDB | `Failed to refresh form schema:` |
| Invalid `productCategory` value | `Failed to refresh form schema:` |
| Missing required context fields | `Failed to refresh form schema:` |
| Internal server error (500) | `Failed to refresh form schema:` |
| Network timeout | `Failed to refresh form schema:` |

Debugging a failed category selection required opening the browser DevTools Network tab,
finding the request, and manually reading the response body. The error shown to the user
gave no actionable information.

### The fix

Mirror the error-reading pattern already used in `generateFormSchema`:

```ts
// AFTER — refreshFormSchema
if (!response.ok) {
  let errorMessage = response.statusText;
  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
  } catch {
    // response body is not JSON — fall back to statusText
  }
  throw new Error(`Failed to refresh form schema: ${errorMessage}`);
}
```

**Resolution order for `errorMessage`:**

1. `errorData.message` — Spring Boot's standard error message field
2. `errorData.error` — Spring Boot's short error description (`"Bad Request"`)
3. `JSON.stringify(errorData)` — raw body dump if neither field exists
4. `response.statusText` — fallback if the body is not valid JSON at all

### Error messages after the fix

| Actual backend error | Error shown to user (after fix) |
|----------------------|----------------------------------|
| Category not found in MongoDB | `Failed to refresh form schema: Category 'xyz' not found in ecommerce_master_attributes` |
| Invalid context fields | `Failed to refresh form schema: Missing required field: userId` |
| Internal server error (500) | `Failed to refresh form schema: Internal Server Error` |
| Network timeout / no body | `Failed to refresh form schema: ` _(statusText, may still be empty for network errors — unavoidable)_ |

### Why the catch block is needed

`response.json()` throws if the response body is not valid JSON — for example, an HTML
error page returned by a proxy, load balancer, or WAF. Without the `try/catch`, a
non-JSON error body would replace the informative HTTP error with a confusing JSON parse
error. The catch block falls back to `statusText` in that case.

### No behaviour change on the happy path

The `response.ok` block is only entered when the HTTP status is not in the 200–299 range.
For successful responses, execution skips directly to `return response.json()` — unchanged.

---

### All frontend bugs fixed

All 7 pure-frontend bugs from `CATEGORY-SELECTION-BUGS.md` are now resolved:

| ID | Description | Status |
|----|-------------|--------|
| FE-1 | In-flight error never retries | ✅ Fixed |
| FE-3 | Stale category values persist in formData | ✅ Fixed |
| FE-4 | Submit not disabled while schema loading | ✅ Fixed |
| FE-5 | Category sections not auto-expanded | ✅ Fixed |
| FE-6 | Cache key normalization inconsistent | ✅ Fixed |
| FE-7 | Unused dep causes unnecessary re-renders | ✅ Fixed |
| FE-8 | `refreshFormSchema` discards error body | ✅ Fixed |

### Still open (require coordination or careful thought)

| ID | Description | Priority |
|----|-------------|----------|
| FE-2 | `useEffect` in useFieldHandler double-fires — see `CATEGORY-SELECTION-FIX-FE2.md` | ✅ Fixed |
| BE-1 | `/refresh` must return full schema, not delta — verify with backend | HIGH (backend) |
| BE-2 | Category case-insensitive matching in backend MongoDB query | MEDIUM (backend) |

---

---

## FE-9 — `displayLevel` enum format mismatch — Java underscore vs frontend hyphen (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/components/ProductCreateForm.tsx`
**Lines changed**: 287, 329 (both `displayLevel` level reads)
**Status**: ✅ FIXED

---

### What was wrong

The `sortedSections` filter and the Fix 5 auto-expand effect both read `displayLevel` from
the schema field and compared it to a hardcoded hyphenated string:

```ts
const level = (field.displayLevel || 'basic').toLowerCase();
// checked against: 'category-specific', 'essential', 'basic', 'advanced', 'optional'
```

The backend stores `displayLevel` in Java enum format with underscores:

```
MongoDB document:  displayLevel: "CATEGORY_SPECIFIC"
After .toLowerCase():            "category_specific"   ← underscore
Compared to:                     "category-specific"   ← hyphen — NO MATCH
```

The field fell through all explicit cases and hit `default: return true` which only returns
`true` inside the `full` viewLevel branch. At `viewLevel: 'standard'`, the field was
excluded regardless of the `formStage`.

The same mismatch affected any field with `displayLevel: "ADVANCED"` or `"OPTIONAL"` —
they normalized to `"advanced"` and `"optional"` respectively, which happened to match,
but `"CATEGORY_SPECIFIC"` → `"category_specific"` (underscore) did not match
`"category-specific"` (hyphen).

### The fix

Add `.replace(/_/g, '-')` to the level normalization so underscore and hyphen forms both
resolve to the same hyphenated comparison string:

```ts
// BEFORE
const level = (field.displayLevel || 'basic').toLowerCase();

// AFTER
const level = (field.displayLevel || 'basic').toLowerCase().replace(/_/g, '-');
```

Applied to both the `filteredFields` filter (line 287) and the Fix 5 auto-expand loop
(line 329) so both code paths use identical normalization.

### Normalization table after the fix

| Backend value | After fix | Visible at |
|--------------|-----------|-----------|
| `"ESSENTIAL"` | `"essential"` | Always |
| `"BASIC"` | `"basic"` | `standard` + `full` |
| `"CATEGORY_SPECIFIC"` | `"category-specific"` | `standard` when `formStage === 'category-specific'` ✓ |
| `"ADVANCED"` | `"advanced"` | `full` only |
| `"OPTIONAL"` | `"optional"` | `full` only |

---

---

## FE-10 — `conditionalVisibility.showWhen` bare variable names not resolved (FIXED)

**Date**: 2026-03-31
**File**: `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldVisibility.ts`
**Lines changed**: added `buildVarDecls` helper; updated `showWhen`, `hideWhen`, and string condition evaluations
**Status**: ✅ FIXED

---

### Discovery

After confirming FE-9 was fixed (displayLevel correctly normalizes), the `warranty` field
for Electronics category was still not rendering. Expanding the MongoDB document revealed:

```json
// ecommerce_form_schemas — fields[n] for Electronics
{
  "fieldName": "warranty",
  "displayLevel": "CATEGORY_SPECIFIC",
  "section": "product_info",
  "conditionalVisibility": {
    "showWhen": "category === 'electronics'",
    "hideWhen": null,
    "requiredWhen": null
  }
}
```

The `showWhen` expression uses a bare identifier `category` — typical of backend-authored
expressions that assume a flat evaluation context.

### What was wrong

`isFieldVisible` in `useFieldVisibility.ts` evaluated `showWhen` via `new Function`:

```ts
if (bc.showWhen) {
  const fn = new Function(
    'formData',
    `try { return !!(${bc.showWhen}); } catch(e) { return false; }`
  );
  return Boolean(fn(formData));
}
```

The generated function body is:

```js
function(formData) {
  try { return !!(category === 'electronics'); } catch(e) { return false; }
}
```

`category` is not declared anywhere in this function. `new Function` creates a fresh
scope — it does not inherit variables from the call site. So `category` is `undefined`.

```
undefined === 'electronics'  →  false
```

`isFieldVisible` returned `false`. The field was removed from `visibleFields` before
the `displayLevel` filter even ran. FE-9 had no effect because the field was already
gone at an earlier stage in the pipeline.

The same bug affected every field whose `conditionalVisibility` used bare field names
(`hasVariants === true`, `price > 0`, etc.) instead of the `formData.` prefix form.

### Why the backend uses bare names

Backend-authored expressions assume the evaluation context exposes field values as
flat variables (common in rule engines, Spring Expression Language, and many JSON
schema condition formats). The frontend's `new Function('formData', ...)` approach
required authors to know they were writing JavaScript with a `formData` parameter —
a leaky implementation detail.

### The fix

Add a `buildVarDecls` helper that injects every `formData` key as a local `var`
declaration at the top of the generated function body:

```ts
// New helper — defined once at module level, outside the hook
function buildVarDecls(formData: Record<string, any>): string {
  return Object.keys(formData)
    .filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k))  // only valid JS identifiers
    .map(k => `var ${k} = formData[${JSON.stringify(k)}];`)
    .join(' ');
}
```

The regex filter `^[a-zA-Z_$][a-zA-Z0-9_$]*$` ensures only valid JS identifier names
become var declarations (field names like `"some-field"` with hyphens are excluded from
bare-name injection but still accessible via `formData["some-field"]`).

Applied to `showWhen`, `hideWhen`, and the legacy string condition evaluator:

```ts
// AFTER — showWhen
const fn = new Function(
  'formData',
  `${buildVarDecls(formData)} try { return !!(${bc.showWhen}); } catch(e) { return false; }`
);

// AFTER — hideWhen
const fn = new Function(
  'formData',
  `${buildVarDecls(formData)} try { return !(${bc.hideWhen}); } catch(e) { return true; }`
);
```

The generated function for `warranty` now looks like:

```js
function(formData) {
  var category = formData["category"];
  var hasVariants = formData["hasVariants"];
  // ... all other formData keys
  try { return !!(category === 'electronics'); } catch(e) { return false; }
}
```

`category` resolves to `formData["category"]` = `"electronics"` → `true` → field is visible ✓

### Backward compatibility

Both forms now work:

| Expression in MongoDB | Works before fix | Works after fix |
|----------------------|-----------------|----------------|
| `"category === 'electronics'"` | ✗ (`category` undefined) | ✓ |
| `"formData.category === 'electronics'"` | ✓ | ✓ |
| `"hasVariants === true"` | ✗ | ✓ |
| `"formData.hasVariants === true"` | ✓ | ✓ |

### What did not change

- The structured object condition evaluator (`{ field, operator, value }`) already uses
  `formData[conditionField]` directly — not affected.
- The dependency array of `isFieldVisible` (`useCallback(fn, [])`) is unchanged.
- No new state or props introduced.

---

## Updated status as of 2026-03-31

| ID | Description | Status |
|----|-------------|--------|
| FE-1 | In-flight error never retries | ✅ Fixed |
| FE-2 | `useEffect` double-fires on mount / function recreation | ✅ Fixed (see FE2 file) |
| FE-3 | Stale category values persist in formData | ✅ Fixed |
| FE-4 | Submit not disabled while schema loading | ✅ Fixed |
| FE-5 | Category sections not auto-expanded | ✅ Fixed |
| FE-6 | Cache key normalization inconsistent | ✅ Fixed |
| FE-7 | Unused dep causes unnecessary re-renders | ✅ Fixed |
| FE-8 | `refreshFormSchema` discards error body | ✅ Fixed |
| FE-9 | `displayLevel` underscore/hyphen format mismatch | ✅ Fixed |
| FE-10 | `conditionalVisibility` bare variable names not resolved | ✅ Fixed |
| BE-1 | `/refresh` must return full schema, not delta | ⏳ Backend |
| BE-2 | Category case-insensitive matching | ⏳ Backend |
