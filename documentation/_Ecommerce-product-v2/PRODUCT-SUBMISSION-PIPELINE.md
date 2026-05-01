# Product Submission Pipeline

## Overview

When the user clicks "Create Product", the following pipeline runs:

```
handleSubmit(e)
      │
      ▼
validateProductCategory(formData.category, assignedCategories, orgDefault)
      │ → alert + return on category access violation
      │
      ▼
generateMasterProduct({ formData, schema, organizationId, userId })
      │ → transforms form data to MasterProduct object
      │
      ▼
useProductSubmit.submitProduct(product)
      │
      ├── Step 1: createBackendContext(...)
      │     → builds the request context envelope
      │
      ├── Step 2: ProductApiService.validateProductEnhanced(product, context)
      │     POST /api/v1/ecommerce/dynamic-products/validate
      │     → if !valid → show ValidationSummary, stop
      │
      └── Step 3: ProductApiService.createProduct(product, context)
            POST /api/v1/ecommerce/dynamic-products/create
            → returns MasterProduct
            → onProductCreated(product, targetChannels)
```

---

## generateMasterProduct — Form Data to MasterProduct

**File:** `utils/product-mapper.ts`

Transforms the flat `formData` dictionary into a typed `MasterProduct` object using the
schema's field definitions to guide mapping.

### Input

```ts
interface ProductGenerationOptions {
  formData: Record<string, any>;    // flat key-value store from useFormState
  schema: DynamicFormSchema;        // current schema (needed for field metadata)
  organizationId: string;
  userId: string;
}
```

### Output

A `MasterProduct` object with these guaranteed fields set:
- `id`: `prod_{timestamp}` (temporary, may be replaced by backend)
- `sku`: `formData.sku || 'SKU_{timestamp}'`
- `name`: `formData.name || ''`
- `price`: `Number(formData.price) || 0`
- `createdAt` / `updatedAt`: current ISO timestamp
- `customAttributes._organizationId`: organizationId
- `customAttributes._createdBy`: userId

### Mapping Algorithm

The function walks `schema.fields` and maps each field's value from `formData` to the
correct location on the product object:

```
For each field in schema.fields:
  value = formData[field.fieldName || field.name]
  if value is null/undefined/'' → skip

  if isDimensionField(fieldName):        (length, width, height, dimensionUnit)
    → collect into dimensionFields buffer

  elif fieldName === 'variantConfigurator':
    → parse JSON, set product.variants

  elif fieldName === 'images':
    → set product.images as array

  elif fieldName === 'channelSettings':
    → set product.channelSettings

  elif field.backendFieldPath exists:
    → map to nested path (e.g. 'seo.metaTitle' → product.seo.metaTitle)

  else:
    → set product[fieldName] = convertValueByType(value, fieldType)
    (converts strings to numbers, booleans, arrays as appropriate)

After all fields:
  if dimensionFields collected:
    product.dimensions = {
      length: dimensionFields.length || 0,
      width: dimensionFields.width || 0,
      height: dimensionFields.height || 0,
      unit: dimensionFields.dimensionUnit || 'in'
    }

Unmapped form fields (not in schema.fields):
  → added to product.customAttributes[key] = value
  (skips keys starting with '_' and 'hasVariants')
```

### Nested Path Mapping

When a field has `backendFieldPath` like `"shipping.weight"` or `"seo.metaTitle"`:

```ts
const pathParts = backendFieldPath.split('.');
let current = product;
for (let i = 0; i < pathParts.length - 1; i++) {
  if (!current[pathParts[i]]) current[pathParts[i]] = {};
  current = current[pathParts[i]];
}
current[pathParts[pathParts.length - 1]] = convertValueByType(value, fieldType);
```

Example: `backendFieldPath = 'seo.metaTitle'` → `product.seo = { metaTitle: 'value' }`

### convertValueByType

```ts
switch (fieldType) {
  case 'number' | 'currency':  return parseFloat(value);
  case 'integer':              return parseInt(value, 10);
  case 'boolean' | 'checkbox': return Boolean(value);
  case 'array' | 'multi-select': return Array.isArray(value) ? value : [value];
  default:                     return value;
}
```

### Handling variantConfigurator

```ts
if (fieldName === 'variantConfigurator') {
  const variantConfig = typeof value === 'string' ? JSON.parse(value) : value;
  if (variantConfig?.variants) {
    product.variants = variantConfig.variants;
  }
}
```

The `variantConfigurator` field stores a JSON string in `formData`. The mapper parses
it and extracts the `variants` array, which becomes `product.variants` — an array of
`ProductVariant` objects.

---

## BackendContext

Before making any API call, `createBackendContext()` builds the context envelope that
the backend needs for authorization, audit logging, and feature gating.

### createBackendContext

**File:** `services/schema-api.service.ts`

```ts
function createBackendContext(
  userId: string,
  organizationId: string,
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
  targetChannels: string[],
  productCategory: string,
  permissions: string[] = []
): BackendContext

interface BackendContext {
  userId: string;
  organizationId: string;
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER';
  targetChannels: string[];
  productCategory: string;
  permissions: string[];
  requestId: string;      // generated: 'req_{timestamp}'
  timestamp: number;      // Date.now()
  environment: string;    // 'development' | 'production'
  metadata?: Record<string, any>;
}
```

### Example BackendContext

```json
{
  "userId": "user_abc",
  "organizationId": "org_123",
  "userRole": "BUSINESS_USER",
  "targetChannels": ["shopify", "wix"],
  "productCategory": "electronics",
  "permissions": ["CREATE_PRODUCT"],
  "requestId": "req_1706123456789",
  "timestamp": 1706123456789,
  "environment": "development"
}
```

---

## Enhanced Validation

### API Call

```
POST /api/v1/ecommerce/dynamic-products/validate
Content-Type: application/json

{
  "productData": { ...MasterProduct },
  "context": {
    ...BackendContext,
    "metadata": {
      "targetChannels": ["shopify", "wix"],
      "apiVersion": "v1",
      "validationType": "enhanced"
    }
  }
}
```

### Response Handling

The backend may return several response formats. `ProductApiService.validateProductEnhanced`
normalizes all of them to `EnhancedValidationResult`:

**Format 1 — Full enhanced result:**
```json
{
  "valid": false,
  "message": "3 validation errors found",
  "violations": [...],
  "warnings": [...],
  "rulesExecuted": 18,
  "executionTimeMs": 12,
  "validationScore": 62.5,
  "canSubmit": false
}
```
→ Returned as-is.

**Format 2 — Nested `.validation` object:**
```json
{
  "validation": {
    "valid": false,
    "errors": ["Price must be greater than 0", "Name is required"],
    "warnings": ["Consider adding a description"],
    "metadata": { "fieldsValidated": 8 }
  }
}
```
→ Transformed: errors → violations with `severity: 'ERROR'`, warnings → `ValidationWarning[]`.

**Format 3 — Empty response:**
```json
{}
```
→ Treated as valid (`validationScore: 100, canSubmit: true`).

**Format 4 — Network or 5xx error:**
→ Returns synthetic `EnhancedValidationResult` with `valid: false` and the error message
  as a single `SCHEMA_VALIDATION` violation.

### canSubmit vs valid

| | valid | canSubmit |
|---|---|---|
| No violations, no warnings | true | true |
| Warnings only | true | true |
| ERROR violations | false | false |
| WARNING violations only (INFO/WARNING severity) | true | true |

`canSubmit = false` only when there are violations with `severity: 'ERROR'`.
The form blocks creation and shows `ValidationSummary` in this case.

---

## Product Creation

### API Call

```
POST /api/v1/ecommerce/dynamic-products/create
Content-Type: application/json

{
  "productData": { ...MasterProduct },
  "context": { ...BackendContext }
}
```

### Response Transformation

The backend response may be shaped differently from the `MasterProduct` interface.
`ProductApiService.createProduct` normalizes it:

```ts
const transformedProduct: MasterProduct = {
  id: backendResponse.productId || backendResponse.masterProduct?.id,
  sku: backendResponse.productData?.sku || '',
  name: backendResponse.productData?.name || '',
  description: backendResponse.productData?.description,
  price: parseFloat(backendResponse.productData?.price) || 0,
  category: backendResponse.productData?.category,
  quantity: backendResponse.productData?.inventory
    ? parseFloat(backendResponse.productData.inventory)
    : undefined,
  ...backendResponse.productData   // spread rest of fields
};
```

The `id` is extracted from either `productId` or `masterProduct.id` in the response.
The calling code in `create/page.tsx` also generates a fallback ID if the backend
response doesn't include one:

```ts
if (!product.id) {
  product.id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

---

## Error States

| Error | Where shown | Recovery |
|---|---|---|
| Validation errors (ERROR violations) | ValidationSummary panel | Fix indicated fields, resubmit |
| Category access violation | `alert()` | Select a permitted category |
| Network error during validation | ValidationSummary (synthetic violation) | Retry |
| Network error during creation | `submitError` → Alert below header | Retry |
| Schema load failure | Full-page Alert with error message | Refresh page |

### submitError vs validationResult

- `submitError` is a string error set when the `createProduct` API call throws
  (network failure, 5xx). It appears as a red Alert near the top of the form.
- `validationResult` is the structured validation response — can be set even on success
  (for warnings). The `ValidationSummary` is only rendered when `showValidation = true`.

---

## Category Validation

Before calling `generateMasterProduct`, the form validates the selected category:

```ts
validateProductCategory(
  formData.category || '',
  assignedCategories,          // from useOrganization().getAssignedCategories()
  organizationDefaultCategory
)
```

```ts
// Returns:
interface CategoryValidationResult {
  category: string;     // the category to use (may be corrected)
  isValid: boolean;
  warning?: string;
}
```

Rules:
- If `formData.category` is empty: uses `organizationDefaultCategory`, no alert
- If category not in `assignedCategories` (and assignedCategories is non-empty): blocks with alert
- If category is not in `KNOWN_CATEGORIES` list: issues a warning toast but allows submission
- Otherwise: valid

---

## transformMasterProductToSourceSchema

**File:** `utils/product-mapper.ts`

Used **after** product creation when the user wants to do adaptive pattern matching
(publish to channels). Converts the `MasterProduct` to a flat key-value schema
that the pattern matching API can analyze.

### Purpose

The pattern matching API compares a **source schema** (your product's fields) against
a **target schema** (the channel's required fields) to find the best field mappings.
The source schema must be flat — no nested objects.

### Transformation Rules

| Input | Output |
|---|---|
| `name: 'Earbuds'` | `{ name: 'Earbuds' }` |
| `tags: ['tech', 'audio']` | `{ tags: 'tech, audio' }` (joined) |
| `galleryImages: [url1, url2]` | `{ galleryImages: 'url1, url2', galleryImages_1: url1, galleryImages_2: url2 }` |
| `dimensions: { length: 10, width: 5 }` | `{ length: 10, width: 5, dimension_unit: 'cm' }` (flattened) |
| `variantOptions: [{ name: 'color', values: ['Black'] }]` | `{ variant_options: 'color', variant_option_1_name: 'color', variant_option_1_values: 'Black' }` |
| `variants: [...]` | `{ variant_count: N, variant_sku: '...', variants: [...] }` |
| `customAttributes: { _key: 'x', myField: 'y' }` | `{ myField: 'y' }` (keys starting with `_` skipped) |
| `id`, `channelMappings`, timestamps | *(skipped)* |

### generateMappingRequest

```ts
async function generateMappingRequest(
  product: MasterProduct,
  channelId: string,
  options: GenerateMappingRequestOptions = {}
): Promise<AdaptivePatternMatchingRequest>
```

1. Calls `transformMasterProductToSourceSchema(product)` to get sourceSchema
2. Fetches target schema: `GET /api/v1/channels/{channelId}/schema/complex?format=nested`
3. Returns `AdaptivePatternMatchingRequest` with both schemas + options

This is consumed by the publish-to-channel flow (outside this module) via the exported
`channelMappingService.analyzePatternMatching()` or `productGenerationService.generateMappingRequest()`.
