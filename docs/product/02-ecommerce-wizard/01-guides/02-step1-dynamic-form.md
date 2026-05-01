# Step 1 — Dynamic Form Generation

## Core Principle

The product creation form is **not hardcoded**. Every field — its label, type, options, validation rules, visibility conditions, section, and order — comes from the backend via a form schema API. The frontend is a rendering engine that interprets schema and produces the correct UI.

This means:
- Adding a new field requires a backend change only (no frontend deploy)
- Category-specific fields appear automatically when a category is selected
- New field types can be handled by adding a case in `FieldRenderer.tsx`

---

## Schema Lifecycle

```
Component mounts
      │
      ▼
useFormSchema.loadSchema()          ← called once from useEffect([])
  POST /ecommerce/form-schema/generate { context: { category: "" } }
  formStage = "essential"
  schema = { fields: [name, sku, price, category, ...essential only] }
      │
      ▼
User selects category "electronics"
      │
useFieldHandler → onCategoryChange("electronics")
      │
      ▼
loadCategoryFieldsSmooth("electronics")
  setIsAddingCategoryFields(true)    ← no blank flash
  POST /ecommerce/form-schema/generate { context: { category: "electronics" } }
  formStage = "category-specific"
  schema += Smartphone-specific fields (brand, os, color, storage, ...)
  setIsAddingCategoryFields(false)
      │
      ▼
User picks "electronics" again later
  cache["electronics"] → HIT → instant schema swap, no API call
```

---

## Six Hooks — Responsibility Split

All six hooks live under `step1-create/hooks/` and are wired together by `ProductCreateForm`:

```
ProductCreateForm
      │
      ├── useFormSchema        ← schema, formStage, loading, loadSchema(), loadCategoryFieldsSmooth()
      ├── useFormState         ← formData, viewLevel, expandedSections
      ├── useFieldHandler      ← handleFieldChange — detects category/hasVariants special cases
      ├── useFieldVisibility   ← getVisibleFields (applies hidden + variantScope + conditions)
      ├── useFieldValidation   ← fieldErrors, handleFieldBlur (client-side on-blur validation)
      └── useProductSubmit     ← isSubmitting, submitProduct, validationResult
```

### useFormSchema

Manages schema fetching and caching.

```typescript
// src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts
const { schema, isLoadingSchema, formStage, isAddingCategoryFields,
        loadSchema, loadCategoryFieldsSmooth } = useFormSchema({
  userId, organizationId, userRole, targetChannels, permissions
});
```

Internal helpers:
- `flattenSections(schemaData)` — if backend returns `sections[]` instead of `fields[]`, merges all section fields into a single flat `fields[]` array with `field.section` stamped.
- `unwrapSchema(rawResponse)` — unwraps `{ formSchema: {...} }` envelope if present, then calls `flattenSections`.

**Cache key:** category slug (lowercased + trimmed), or `"essential"` for the initial load.

**In-flight deduplication:** If `loadCategoryFieldsSmooth("electronics")` is called while an existing call for the same key is in flight, the second call awaits the existing `Promise` rather than launching a new one.

### useFormState

Manages all form data and UI state.

```typescript
const { formData, updateFormField, setFormData, resetForm,
        viewLevel, setViewLevel, promoteToStandard,
        expandedSections, toggleSection } = useFormState({
  initialData, organizationDefaultCategory
});
```

`formData` is a **flat** `Record<string, any>`. All field values live at the top level:
```typescript
formData = {
  name: "Wireless Earbuds",
  price: 29.99,
  category: "electronics",
  hasVariants: true,
  variantConfigurator: '{"variants":[...],"options":{...}}',  // JSON string
  mainImage: "https://...",
}
```

Initial expanded sections: `new Set(['product-info'])` — only the first section open.

### useFieldHandler

Routes all field changes, fires side effects.

**Special cases:**
- `fieldName === "category"` → stores in a ref + calls `onCategoryChange` → triggers schema reload
- `fieldName === "hasVariants"` → updates formData + side effect triggers schema reload with variant context

```typescript
// Side effect: when hasVariants becomes true with a category already selected,
// reload the schema — backend may return different fields for variant products
useEffect(() => {
  if (formData.hasVariants && formData.category && onCategoryChange) {
    onCategoryChange(formData.category);
  }
}, [formData.hasVariants, formData.category, onCategoryChange]);
```

**Category double-fire fix (FE-2):** The effect only fires when `hasVariants` transitions from false → true, not on every render where `hasVariants` happens to be truthy. The condition is guarded by a `prevHasVariants` ref.

### useFieldVisibility

Evaluates which fields are visible given current `formData`. Evaluated in order:

1. `field.hidden === true` → always hide
2. `field.variantScope === "variant_only"` → always hide (appears in variant table only)
3. `field.variantScope === "dual" && formData.hasVariants` → hide (field moves into variant editor)
4. `conditionalVisibility.showWhen` → expression must be truthy
5. `conditionalVisibility.hideWhen` → expression must be falsy
6. Default → show

Conditions can be operator-based `{ field, operator, value }` or JS expression strings evaluated with `new Function()`. Errors in expression evaluation default to **show** (fail-open).

### useFieldValidation

Client-side validation on blur. Does **not** validate the whole form — that is done server-side via `useProductSubmit`. Rules applied in order: required, minLength, maxLength, min, max, pattern, email format, URL format.

### useProductSubmit

Runs the two-step submission pipeline. See [06-step1-product-submission.md](06-step1-product-submission.md).

---

## Section Organization

After filtering visible fields, `ProductCreateForm` groups by `field.section`, then sorts sections by metadata `order`:

```typescript
const SECTION_METADATA = {
  'basic-info': { label: 'Basic Information',    order: 1 },
  'pricing':    { label: 'Pricing & Inventory',  order: 2 },
  'media':      { label: 'Images & Media',       order: 3 },
  'content':    { label: 'Product Content',      order: 4 },
  'shipping':   { label: 'Shipping Details',     order: 5 },
  'seo':        { label: 'SEO & Marketing',      order: 6 },
  'taxonomy':   { label: 'Categories & Tags',    order: 7 },
  'variants':   { label: 'Product Variants',     order: 8 },
};
```

`normalizeSectionKey` converts any backend format to kebab-case:
```typescript
normalizeSectionKey("basicInfo")  // → "basic-info"
normalizeSectionKey("BASIC_INFO") // → "basic-info"
```

The `hasVariants` and `variantConfigurator` fields are excluded from regular section rendering — they are handled exclusively by `VariantsSection`.

---

## FieldRenderer — Field Type Dispatch

`FieldRenderer.tsx` normalises `fieldType` before dispatching:

```typescript
const fieldType = (field.fieldType || '').toLowerCase();
// "CATEGORY_SELECT" → "category_select"  → matches "category-select" after replace(/_/g, '-')
// "SELECT" → "select"
// "TEXTAREA" → "textarea"
```

| `fieldType` value             | Rendered as                                         |
|-------------------------------|-----------------------------------------------------|
| `text`, `email`, `url`, `tel` | `<input>` with matching type                        |
| `textarea`                    | `<textarea rows="3">`                               |
| `select`                      | `<select>` with `options[]`                         |
| `checkbox`                    | `<input type="checkbox">`                           |
| `number`                      | `<input type="number">`                             |
| `date`, `datetime-local`      | `<input>` with matching type                        |
| `image`, `file`, `media`      | `ImageUploadField`                                  |
| `category-select`             | `CategorySelectField` (live tree combobox)          |
| `variant-configurator`        | handled by `VariantsSection`, never dispatched here |

---

## Conditional Visibility System

### Operator-based (object format)

```json
{ "conditionalVisibility": { "showWhen": { "field": "hasVariants", "operator": "equals", "value": true } } }
```

Supported operators: `equals`, `not_equals`, `greater_than`, `less_than`, `contains`, `not_contains`, `starts_with`, `ends_with`, `in`, `not_in`, `is_empty`, `is_not_empty`, `matches`, `not_matches`.

### Expression-based (string format)

```json
{ "conditionalVisibility": { "showWhen": "hasVariants === true && category === 'electronics'" } }
```

Evaluated via `new Function('return ' + expression)()` after substituting `formData` values. Errors default to field visible.

---

## Default Values

When schema loads (or changes), `ProductCreateForm` runs a one-time effect that applies `field.defaultValue` to any form field that is currently empty:

```typescript
useEffect(() => {
  if (!schema?.fields) return;
  setFormData(prev => {
    const updated = { ...prev };
    for (const field of schema.fields) {
      const name = field.fieldName || field.name;
      if (field.defaultValue !== undefined && !updated[name]) {
        updated[name] = field.defaultValue;
      }
    }
    return updated;
  });
}, [schema]);
```

This never overwrites values the user has already entered or values loaded from `initialData`.

---

## Backend Schema Generation Pipeline

All schema API calls share the same request envelope — a `{ "context": {...} }` wrapper. The backend reads `requestBody.get("context")` and ignores any keys at the root level.

```
POST /api/v1/ecommerce/form-schema/generate
Body: { "context": { "userId": "...", "organizationId": "...", "productCategory": "electronics", ... } }
```

**6-step pipeline inside `FormSchemaService.generateFormSchema()`:**

```
1. Read context.productCategory (may be empty for initial load)
       ↓
2. Resolve category slug → ProductType
   ProductTypeRepository.findByCategorySlug("electronics")
   → sets resolvedProductTypeId + resolvedProductTypeName on the request
       ↓
3. Load EcommerceMasterAttributeDocuments
   WHERE productTypeId = resolvedProductTypeId (or generic if no category)
       ↓
4. Filter by: userRole, permissions, targetChannels
   ADMIN_USER sees all fields; BUSINESS_USER sees business-visible only
       ↓
5. Build FormField list — map attribute doc → FormField
   (label, fieldType, displayLevel, section, validationRules, conditionalVisibility, ...)
       ↓
6. Check MongoDB cache (collection: form_schema_cache)
   Cache key = composite of productTypeId + userRole + sorted(targetChannels)
   HIT  → return cached DynamicFormSchema
   MISS → build + cache + return
```

**Cache management:**
- `DELETE /ecommerce/form-schema/cache` — clears all cached schemas (plus Caffeine in-memory caches)
- `DELETE /ecommerce/form-schema/cache/product-type/{productTypeId}` — targeted eviction; call this after updating attributes for a ProductType so the next request rebuilds

**Category-change refresh** — the frontend calls `POST /generate` both on initial load and on category change (with the new category in `context.productCategory`). The backend also exposes `POST /refresh` which is equivalent but adds a `changeType: "CATEGORY_BASED_REFRESH"` metadata flag and requires `productCategory` to be non-empty.

---

## Codebase

| File                                                                | Purpose                                                               |
|---------------------------------------------------------------------|-----------------------------------------------------------------------|
| `step1-create/components/ProductCreatePage.tsx`                     | Auth/org gate; entry point; passes context down                       |
| `step1-create/components/ProductCreateForm.tsx`                     | Orchestrates all 6 hooks; computes sections; drives rendering         |
| `step1-create/components/FieldRenderer.tsx`                         | Dispatches `fieldType` → input element                                |
| `step1-create/hooks/useFormSchema.ts`                               | Schema fetch, cache, `unwrapSchema`, `flattenSections`                |
| `step1-create/hooks/useFormState.ts`                                | `formData`, `viewLevel`, sections state                               |
| `step1-create/hooks/useFieldHandler.ts`                             | `handleFieldChange` + category/variant side effects                   |
| `step1-create/hooks/useFieldVisibility.ts`                          | `getVisibleFields` — hidden + variantScope + conditions               |
| `step1-create/hooks/useFieldValidation.ts`                          | On-blur client validation                                             |
| `step1-create/hooks/useProductSubmit.ts`                            | Submit pipeline                                                       |
| `utils/form-utils.ts`                                               | `normalizeSectionKey`, `groupFieldsBySection`, `getSectionMetadata`   |
| `services/schema-api.service.ts`                                    | `generateFormSchema`, `refreshFormSchema`, `createBackendContext`     |
| `ecommerce/formschema/controller/FormSchemaController.java`         | `/form-schema/*` endpoints — generate, refresh, cache eviction        |
| `ecommerce/dynamicproduct/controller/DynamicProductController.java` | `/dynamic-products/*` endpoints — validate, create, channels, example |
| `ecommerce/masterproduct/model/entity/MasterProductData.java`       | MongoDB document — collection `master_product_data`                   |
