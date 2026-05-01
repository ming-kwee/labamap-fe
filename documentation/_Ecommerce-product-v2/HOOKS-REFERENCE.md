# Hooks Reference

All 6 hooks live under `step1-create/hooks/`. They are orchestrated by `ProductCreateForm`
and should not be called individually from pages — use `ProductCreatePage` instead.

---

## Hook Interaction Map

```
ProductCreateForm
      │
      ├── useFormSchema        ← schema, formStage, loading states, loadSchema()
      │       │
      │       └─ calls schema-api.service (generateFormSchema, refreshFormSchema)
      │
      ├── useFormState         ← formData, expandedSections, showJsonPreview
      │
      ├── useFieldHandler      ← handleFieldChange, handleVariantConfiguratorChange
      │       │
      │       └─ calls useFormState.setFormData
      │       └─ calls useFormSchema.loadCategoryFieldsSmooth (via onCategoryChange)
      │
      ├── useFieldVisibility   ← getVisibleFields (filters schema fields)
      │
      ├── useFieldValidation   ← fieldErrors, handleFieldBlur (validates on blur)
      │
      └── useProductSubmit     ← isSubmitting, submitProduct, validationResult
              │
              └─ calls product-api.service (validateProductEnhanced, createProduct)
```

---

## useFormSchema

**File:** `step1-create/hooks/useFormSchema.ts`

Manages loading and caching of the dynamic form schema from the backend.
Contains two important internal helpers:
- `flattenSections(schemaData)` — if backend returned a `sections` array instead of `fields`, flattens to a single `fields` array
- `unwrapSchema(rawResponse)` — unwraps `{ formSchema: {...} }` envelope if present, then calls `flattenSections`

### Options

```ts
interface UseFormSchemaOptions {
  userId: string;
  organizationId: string;
  userRole: string;             // mapped role string: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER'
  targetChannels: string[];     // e.g. ['shopify', 'wix']
  permissions?: string[];       // e.g. ['CREATE_PRODUCT'] (default: [])
}
```

### Return

```ts
interface UseFormSchemaReturn {
  schema: DynamicFormSchema | null;      // null while loading or on error
  isLoadingSchema: boolean;              // true during initial load
  schemaError: string | null;            // error message, null on success
  formStage: 'essential' | 'category-specific';
  isAddingCategoryFields: boolean;       // true during category schema refresh
  loadSchema: (category?: string) => Promise<void>;
  loadCategoryFieldsSmooth: (category: string) => Promise<void>;
  clearSchemaCache: () => void;
}
```

### Methods

#### `loadSchema(category?)`

Loads the form schema. Call once on component mount via `useEffect([], [])`.

- If `category` is provided: loads category-specific schema and sets `formStage = 'category-specific'`
- If `category` is omitted: loads essential schema and sets `formStage = 'essential'`
- Caches result in `Map` keyed by `category || 'essential'`
- Does not call backend again if cache hit
- Deduplicates concurrent calls for the same key

#### `loadCategoryFieldsSmooth(category)`

Called whenever the user changes the category field. Adds category-specific fields without
a full loading spinner — shows `isAddingCategoryFields = true` instead.

- Uses `refreshFormSchema()` API (same endpoint, different semantics)
- Caches result keyed by `category.toLowerCase().trim()`
- Instant if category was previously selected (cache hit)

#### `clearSchemaCache()`

Clears both the schema cache Map and the in-flight requests Map. Call when the user
navigates away and you want the next visit to fetch fresh schema.

### Caching Behavior

```
Cache key: category string (lowercased+trimmed) or 'essential'

First visit (no category):
  loadSchema()  →  cache miss  →  fetch  →  cache['essential'] = schema

User picks 'electronics':
  loadCategoryFieldsSmooth('electronics')  →  miss  →  fetch  →  cache['electronics'] = schema

User picks 'clothing':
  loadCategoryFieldsSmooth('clothing')  →  miss  →  fetch  →  cache['clothing'] = schema

User picks 'electronics' again:
  loadCategoryFieldsSmooth('electronics')  →  HIT  →  instant schema swap, no fetch
```

---

## useFormState

**File:** `step1-create/hooks/useFormState.ts`

Manages all form data and UI state (expanded sections, JSON preview toggle).

### Options

```ts
interface UseFormStateOptions {
  initialData?: Record<string, any>;       // Pre-populate form fields (e.g. from draft)
  organizationDefaultCategory?: string;    // Stamped into formData.category if not in initialData
}
```

### Return

```ts
interface UseFormStateReturn {
  formData: Record<string, any>;              // All current form field values
  setFormData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  expandedSections: Set<string>;             // Section keys that are currently expanded
  toggleSection: (sectionKey: string) => void;
  expandAllSections: () => void;
  collapseAllSections: () => void;
  updateFormField: (fieldName: string, value: any) => void;
  resetForm: () => void;
  showJsonPreview: boolean;
  setShowJsonPreview: React.Dispatch<React.SetStateAction<boolean>>;
}
```

### Initial State

- `formData`: `{ ...initialData }` merged with `{ category: organizationDefaultCategory }` if not present
- `expandedSections`: `new Set(['basic-info', 'pricing'])` — these two sections open on first render
- `showJsonPreview`: `false`

### Key Behavior

`formData` is a flat `Record<string, any>`. Field names are the keys. The form does not
nest fields — everything is at the top level:

```ts
formData = {
  name: 'Wireless Earbuds',
  price: 29.99,
  category: 'electronics',
  hasVariants: true,
  variantConfigurator: '{"variants":[...], "options":{...}}', // JSON string
  mainImage: 'https://...',
  weight: 0.3,
}
```

---

## useFieldHandler

**File:** `step1-create/hooks/useFieldHandler.ts`

Handles all field value changes. Routes changes to `setFormData` and fires side effects
(category change → schema reload, hasVariants → state update).

### Options

```ts
interface UseFieldHandlerOptions {
  formData: Record<string, any>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onCategoryChange?: (category: string) => void;
  onVariantConfigChange?: (config: any) => void;
}
```

### Return

```ts
interface UseFieldHandlerReturn {
  handleFieldChange: (fieldName: string, value: any) => void;
  handleVariantConfiguratorChange: (config: any) => void;
  getUserSelectedCategory: () => string | null;
}
```

### Special Field Handling

#### `category` field

```ts
if (fieldName === 'category') {
  const newCategory = String(value).toLowerCase().trim();
  setFormData(prev => ({ ...prev, category: newCategory }));
  userSelectedCategory.current = newCategory;   // persisted in ref
  if (onCategoryChange && newCategory) {
    onCategoryChange(newCategory);              // → triggers schema reload
  }
  return;
}
```

#### `hasVariants` field

```ts
if (fieldName === 'hasVariants') {
  setFormData(prev => {
    const updated = { ...prev, hasVariants: value };
    if (value && prev.variantConfigurator) {
      updated.variantConfigurator = prev.variantConfigurator;  // preserve existing config
    }
    return updated;
  });
  return;
}
```

#### `handleVariantConfiguratorChange`

Called when VariantConfigurator emits its JSON string. Stores it and ensures
`hasVariants = true`:

```ts
setFormData(prev => ({
  ...prev,
  variantConfigurator: config,
  hasVariants: true
}));
```

#### Side effect — re-trigger category when `hasVariants` changes

```ts
useEffect(() => {
  const category = formData.category;
  if (formData.hasVariants && category && onCategoryChange) {
    onCategoryChange(category);   // reload schema so variant-only fields become visible
  }
}, [formData.hasVariants, formData.category, onCategoryChange]);
```

This ensures that enabling variants while a category is already selected causes the
schema to reload with `hasVariants` context, which may affect which SELECT fields
are classified as variant dimensions.

---

## useFieldVisibility

**File:** `step1-create/hooks/useFieldVisibility.ts`

Evaluates which fields should be visible given the current form data.

### Return

```ts
interface UseFieldVisibilityReturn {
  isFieldVisible: (field: FormField, formData: Record<string, any>) => boolean;
  getVisibleFields: (fields: FormField[], formData: Record<string, any>) => FormField[];
}
```

### Visibility Evaluation Order

`isFieldVisible(field, formData)` evaluates in this order:

1. **Always hidden flag:** If `field.hidden === true`, return `false`

2. **variantScope exclusion:**
   - `variant_only` → always return `false` (never shown at product level)
   - `dual` + `formData.hasVariants === true` → return `false` (hidden at product level when variants are on)

3. **conditionalVisibility.hideWhen:** If condition is true, return `false`

4. **conditionalVisibility.showWhen:** If condition is false, return `false`

5. Default: return `true`

### Operator Evaluation

For object-format conditions `{ field, operator, value }`:

```ts
const fieldValue = formData[condition.field];

switch (condition.operator) {
  case 'equals':           return fieldValue === condition.value;
  case 'not_equals':       return fieldValue !== condition.value;
  case 'greater_than':     return Number(fieldValue) > Number(condition.value);
  case 'contains':         return String(fieldValue).includes(String(condition.value));
  case 'in':               return condition.value.includes(fieldValue);
  case 'is_empty':         return !fieldValue || fieldValue === '' || fieldValue === false;
  case 'is_not_empty':     return !!fieldValue && fieldValue !== '' && fieldValue !== false;
  // ... all operators
}
```

### Expression Evaluation

For string-format expressions like `"hasVariants === true"`:

```ts
let expression = showWhen;
Object.keys(formData).forEach(key => {
  const val = formData[key];
  const valStr = typeof val === 'string' ? `'${val}'` : val;
  expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), valStr);
});
return new Function(`return ${expression}`)();
```

Errors during evaluation return `true` (field shown, fail-open).

---

## useFieldValidation

**File:** `step1-create/hooks/useFieldValidation.ts`

Client-side field validation triggered on blur. Does not validate the whole form at once —
that is done server-side via `useProductSubmit.validateProduct()`.

### Return

```ts
interface UseFieldValidationReturn {
  fieldErrors: Record<string, string>;            // fieldName → error message
  touchedFields: Record<string, boolean>;         // fieldName → has been blurred
  validateField: (field: FormField, value: any) => string | null;
  handleFieldBlur: (field: FormField, value: any) => void;
  setFieldError: (fieldName: string, error: string) => void;
  clearFieldErrors: () => void;
  clearFieldError: (fieldName: string) => void;
  markFieldTouched: (fieldName: string) => void;
  hasErrors: () => boolean;
}
```

### Validation Rules Applied

`validateField(field, value)` checks rules in this order and returns the first error:

| Rule | Check |
|---|---|
| `required` | `!value || value === '' || value === false` |
| `minLength` | `String(value).length < minLength` |
| `maxLength` | `String(value).length > maxLength` |
| `min` | `Number(value) < min` |
| `max` | `Number(value) > max` |
| `pattern` | `!new RegExp(pattern).test(String(value))` |
| `isEmail` (inferred) | `!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))` |
| `isUrl` (inferred) | `!/^https?:\/\/.+/.test(String(value))` |

Returns `null` if the field is valid.

### handleFieldBlur

```ts
handleFieldBlur(field, value):
  markFieldTouched(field.fieldName)
  const error = validateField(field, value)
  if (error) setFieldError(field.fieldName, error)
  else clearFieldError(field.fieldName)
```

Only fields that have been touched (blurred at least once) show errors. This prevents
the entire form from showing red error states before the user has interacted with it.

---

## useProductSubmit

**File:** `step1-create/hooks/useProductSubmit.ts`

Manages the two-step product submission pipeline: backend validation → product creation.

### Options

```ts
interface UseProductSubmitOptions {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  category: string;           // current formData.category (reactive)
  permissions?: string[];
}
```

### Return

```ts
interface UseProductSubmitReturn {
  isSubmitting: boolean;
  submitError: string | null;
  validationResult: EnhancedValidationResult | null;
  showValidation: boolean;
  submitProduct: (product: MasterProduct) => Promise<MasterProduct | null>;
  validateProduct: (product: MasterProduct) => Promise<EnhancedValidationResult>;
  clearSubmitError: () => void;
  setShowValidation: (show: boolean) => void;
}
```

### submitProduct Pipeline

```ts
async submitProduct(product):
  setIsSubmitting(true)
  setSubmitError(null)
  setValidationResult(null)

  try:
    context = createBackendContext(userId, orgId, role, channels, category)

    // Step 1: validate
    validation = await validateProduct(product)
    if (!validation.valid || !validation.canSubmit):
      setShowValidation(true)    // → ValidationSummary component renders
      setIsSubmitting(false)
      return null

    // Step 2: create
    createdProduct = await ProductApiService.createProduct(product, context)
    return createdProduct

  catch error:
    setSubmitError(error.message)
    return null

  finally:
    setIsSubmitting(false)
```

### validateProduct

Standalone — can be called independently to show a pre-submission validation preview:

```ts
async validateProduct(product):
  context = createBackendContext(...)
  result = await ProductApiService.validateProductEnhanced(product, context)
  setValidationResult(result)
  return result
```

If the backend throws (network error, 5xx), returns a synthetic `EnhancedValidationResult`
with `valid: false` and the error message as a violation.

### EnhancedValidationResult

```ts
interface EnhancedValidationResult {
  valid: boolean;
  message: string;                  // Human-readable summary
  violations: ValidationViolation[]; // Errors blocking submission
  warnings: ValidationWarning[];    // Non-blocking issues
  rulesExecuted: number;            // How many validation rules ran
  executionTimeMs: number;          // Backend processing time
  validationScore: number;          // 0–100, where 100 = perfect
  canSubmit: boolean;               // false if any ERROR violations
}

interface ValidationViolation {
  ruleId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  affectedFields: string[];
  violationType: 'BUSINESS_RULE' | 'FIELD_VALIDATION' | 'SCHEMA_VALIDATION';
  suggestion?: string;
}
```

`ValidationSummary` renders this result with color-coded severity and field references.
