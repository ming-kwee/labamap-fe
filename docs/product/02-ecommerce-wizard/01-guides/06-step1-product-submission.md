# Step 1 — Product Submission Pipeline

## Overview

When the seller clicks "Create Product", a four-stage pipeline runs:

```
handleSubmit(e)
      │
      ▼
1. validateProductCategory(formData.category, assignedCategories, orgDefault)
      │ → alert + stop on access violation
      │
      ▼
2. generateMasterProduct({ formData, schema, organizationId, userId })
      │ → transforms flat formData to typed MasterProduct object
      │
      ▼
3. ProductApiService.validateProductEnhanced(product, context)
      │ POST /ecommerce/dynamic-products/validate
      │ → if !canSubmit → show ValidationSummary, stop
      │
      ▼
4. ProductApiService.createProduct(product, context)
      POST /ecommerce/dynamic-products/create
      → returns MasterProduct with backend-assigned id
      → onProductCreated(product, targetChannels) → navigate to Step 2
```

---

## Stage 2: generateMasterProduct

**File:** `utils/product-mapper.ts`

Transforms the flat `formData` dictionary into a typed `MasterProduct`:

```typescript
interface ProductGenerationOptions {
  formData: Record<string, any>;   // flat key-value store from useFormState
  schema: DynamicFormSchema;       // current schema (field metadata for mapping)
  organizationId: string;
  userId: string;
}
```

**Guaranteed output fields:**
- `id`: `"prod_{timestamp}"` (temporary — replaced by backend)
- `sku`: `formData.sku || "SKU_{timestamp}"`
- `name`, `price`, `createdAt`, `updatedAt`
- `customAttributes._organizationId`, `customAttributes._createdBy`

**Mapping algorithm** — walks `schema.fields` and maps each to the correct location:

| Input pattern | Output location |
|---|---|
| `variantConfigurator` (JSON string) | `product.variants = parsed.variants` |
| `images` | `product.images` as array |
| `channelSettings` | `product.channelSettings` |
| `field.backendFieldPath = "seo.metaTitle"` | `product.seo.metaTitle` (nested) |
| `length / width / height / dimensionUnit` | collected → `product.dimensions = { length, width, height, unit }` |
| Any other field | `product[fieldName] = convertValueByType(value, fieldType)` |
| Form fields not in schema | `product.customAttributes[key] = value` (keys starting `_` skipped) |

**Type coercion:**
```typescript
// number/currency → parseFloat; integer → parseInt; boolean/checkbox → Boolean
// array/multi-select → ensure Array; default → string
```

---

## Stage 3: BackendContext

Before every API call, `createBackendContext()` builds the context envelope:

```typescript
// services/schema-api.service.ts
const context: BackendContext = {
  userId,
  organizationId,
  userRole,         // "BUSINESS_USER" | "ADMIN" | "DEVELOPER"
  targetChannels,   // e.g. ["shopify", "wix"]
  productCategory,  // current formData.category
  permissions,      // e.g. ["CREATE_PRODUCT"]
  requestId: `req_${Date.now()}`,
  timestamp: Date.now(),
  environment: "development"
};
```

---

## Stage 3: Enhanced Validation

```
POST /api/v1/ecommerce/dynamic-products/validate
{
  "productData": { ...MasterProduct },
  "context": { ...BackendContext }
}
```

The backend may return several response formats. `validateProductEnhanced` normalizes all of them to `EnhancedValidationResult`:

| Format | How handled |
|---|---|
| Full enhanced result `{ valid, violations, warnings, validationScore, canSubmit }` | Returned as-is |
| Nested `{ validation: { valid, errors[], warnings[] } }` | Errors → violations `severity: ERROR`; warnings → `ValidationWarning[]` |
| Empty `{}` | Treated as valid (`validationScore: 100`, `canSubmit: true`) |
| Network / 5xx error | Synthetic result: `valid: false`, error message as single `SCHEMA_VALIDATION` violation |

**canSubmit vs valid:**
- `canSubmit = false` only when there are `severity: "ERROR"` violations
- Warnings-only → `valid: true`, `canSubmit: true`
- When `!canSubmit`: `ValidationSummary` renders; form blocks creation

---

## Stage 4: Product Creation

```
POST /api/v1/ecommerce/dynamic-products/create
{
  "productData": { ...MasterProduct },
  "context": { ...BackendContext }
}
```

The response is normalized:
```typescript
const product: MasterProduct = {
  id: res.productId || res.masterProduct?.id,
  sku: res.productData?.sku || "",
  name: res.productData?.name || "",
  price: parseFloat(res.productData?.price) || 0,
  ...res.productData
};

// Fallback id if backend response didn't include one
if (!product.id) {
  product.id = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

On success: `onProductCreated(product, targetChannels)` → calling page navigates to `/products/{id}/channel-fields` and writes `sessionStorage["product_{id}"] = JSON.stringify(product)`.

---

## ValidationSummary Component

Renders the `EnhancedValidationResult` when `showValidation = true`:

```typescript
interface EnhancedValidationResult {
  valid: boolean;
  message: string;
  violations: ValidationViolation[];   // errors blocking submission
  warnings:   ValidationWarning[];     // non-blocking issues
  rulesExecuted: number;
  executionTimeMs: number;
  validationScore: number;             // 0–100
  canSubmit: boolean;
}

interface ValidationViolation {
  ruleId: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  affectedFields: string[];
  violationType: "BUSINESS_RULE" | "FIELD_VALIDATION" | "SCHEMA_VALIDATION";
  suggestion?: string;
}
```

---

## Category Access Validation

Before `generateMasterProduct`, the form checks if the selected category is permitted:

```typescript
validateProductCategory(
  formData.category,
  assignedCategories,          // from useOrganization().getAssignedCategories()
  organizationDefaultCategory
)
```

| Condition | Result |
|---|---|
| `formData.category` empty | Uses `organizationDefaultCategory`, no alert |
| Category not in `assignedCategories` (when assignedCategories non-empty) | Blocks with `alert()` |
| Category not in `KNOWN_CATEGORIES` | Warning toast, but submission allowed |
| Otherwise | Valid |

---

## Error States

| Error | Where shown | Recovery |
|---|---|---|
| Category access violation | `alert()` dialog | Select a permitted category |
| Validation ERROR violations | `ValidationSummary` panel | Fix indicated fields, resubmit |
| Network error during validation | `ValidationSummary` (synthetic violation) | Retry |
| Network error during creation | `submitError` → Alert near form top | Retry |
| Schema load failure | Full-page Alert | Refresh page |

---

## transformMasterProductToSourceSchema

**File:** `utils/product-mapper.ts`

Used by the publish pipeline (Step 3) to flatten the `MasterProduct` into a key-value map that the pattern-matching API can analyze:

| Input | Output |
|---|---|
| `tags: ["tech","audio"]` | `{ tags: "tech, audio" }` (joined) |
| `dimensions: { length: 10, width: 5 }` | `{ length: 10, width: 5, dimension_unit: "cm" }` (flattened) |
| `variants: [...]` | `{ variant_count: N, variant_sku: "...", variants: [...] }` |
| `customAttributes: { _key: "x", myField: "y" }` | `{ myField: "y" }` (keys starting `_` skipped) |
| `id`, `channelMappings`, timestamps | *(skipped)* |

---

## Codebase

| File | Purpose |
|------|---------|
| `step1-create/hooks/useProductSubmit.ts` | `submitProduct()` pipeline, `validateProduct()`, `showValidation` state |
| `step1-create/components/ValidationSummary.tsx` | Renders `EnhancedValidationResult` |
| `utils/product-mapper.ts` | `generateMasterProduct()`, `transformMasterProductToSourceSchema()` |
| `services/schema-api.service.ts` | `createBackendContext()` |
| `services/product-api.service.ts` | `ProductApiService.validateProductEnhanced()`, `.createProduct()` |
