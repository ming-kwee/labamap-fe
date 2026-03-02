# Services and Types Reference

All services live under `services/` and all types under `types/`. Services make real HTTP
calls to the Spring Boot backend at `http://localhost:8888/labamap/api/v1`. There is no
mock data or fallback — every call hits the real API.

---

## Service Overview

| Service | File | Responsibility |
|---|---|---|
| `ProductApiService` | `services/product-api.service.ts` | Product creation, validation |
| Schema API | `services/schema-api.service.ts` | Form schema generation, `BackendContext` factory |
| `MediaUploadService` | `services/media-upload.service.ts` | Image upload to GCP via backend |
| Pattern Matching | `services/pattern-matching.service.ts` | Channel field mapping, publishing, JOLT preview |

---

## ProductApiService

**File:** `services/product-api.service.ts`

A static class. All methods are `static async`.

Base URL: `http://localhost:8888/labamap/api/v1/ecommerce`

---

### getAllMasterAttributes

```ts
static async getAllMasterAttributes(): Promise<any>
```

**Endpoint:** `GET /api/v1/ecommerce/master-attributes/all`

Returns the full list of master attributes defined in the backend attribute registry.
Used for administrative views and attribute management — not called during the
standard product creation flow.

**Throws** if the response is not `2xx`.

---

### createProduct

```ts
static async createProduct(
  productData: DynamicFormData,
  context: BackendContext
): Promise<MasterProduct>
```

**Endpoint:** `POST /api/v1/ecommerce/dynamic-products/create`

**Request body:**
```json
{
  "productData": { ...MasterProduct fields },
  "context": { ...BackendContext }
}
```

**Response normalization:**

The backend response shape differs from `MasterProduct`. The service normalizes it:

```ts
const transformedProduct: MasterProduct = {
  id:          backendResponse.productId || backendResponse.masterProduct?.id,
  sku:         backendResponse.productData?.sku || '',
  name:        backendResponse.productData?.name || '',
  description: backendResponse.productData?.description,
  price:       parseFloat(backendResponse.productData?.price) || 0,
  category:    backendResponse.productData?.category,
  quantity:    parseFloat(backendResponse.productData?.inventory) || undefined,
  ...backendResponse.productData    // spread remaining fields
};
```

Key normalization rules:
- `id` is extracted from either `productId` or `masterProduct.id` at the top level
- `quantity` maps from `productData.inventory` (backend naming difference)
- `price` is always coerced to `number` (handles string responses)
- All remaining `productData` fields are spread onto the product object

**Throws** `Error('Failed to create product: ...')` on non-2xx response.

---

### validateProductEnhanced

```ts
static async validateProductEnhanced(
  productData: DynamicFormData,
  context: BackendContext
): Promise<EnhancedValidationResult>
```

**Endpoint:** `POST /api/v1/ecommerce/dynamic-products/validate`

**Request body:**
```json
{
  "productData": { ...MasterProduct fields },
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

**Response normalization (4 formats handled):**

The backend can return several different shapes. All are normalized to
`EnhancedValidationResult`:

**Format 1 — Full enhanced result** (preferred):
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
→ Returned as-is (the happy path).

**Format 2 — Nested `.validation` object:**
```json
{
  "validation": {
    "valid": false,
    "errors": ["Price must be greater than 0"],
    "warnings": ["Consider adding a description"],
    "metadata": { "fieldsValidated": 8 }
  }
}
```
→ `errors` → `violations[]` with `severity: 'ERROR'`, `violationType: 'SCHEMA_VALIDATION'`
→ `warnings` → `ValidationWarning[]`
→ `rulesExecuted` = `metadata.fieldsValidated || 0`

**Format 3 — Empty object `{}`** or empty response body:
→ Returns synthetic result:
```ts
{ valid: true, validationScore: 100, canSubmit: true, violations: [], warnings: [] }
```

**Format 4 — Non-2xx response:**
→ Throws `Error('Enhanced validation failed: ...')` with the parsed error message.

Note: The service reads the response as text first, then parses it, to handle the empty-body
case correctly (which `response.json()` would throw on).

---

## Schema API Service

**File:** `services/schema-api.service.ts`

Exports standalone functions (not a class). All are `async`.

Base URL: `http://localhost:8888/labamap/api/v1/ecommerce`

---

### BackendContext

Defined and owned here. Re-exported by `product-api.service.ts`.

```ts
interface BackendContext {
  userId: string;
  organizationId: string;
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER';
  targetChannels: string[];
  productCategory: string;
  permissions: string[];
  requestId?: string;      // auto-generated: 'req_{timestamp}'
  timestamp?: number;      // Date.now()
  environment?: string;    // 'development' | 'production'
  metadata?: Record<string, any>;
}
```

`BackendContext` is the authorization + audit envelope attached to every backend call.
The backend uses it for:
- Authorization (userId + userRole + permissions)
- Audit logging (requestId + timestamp)
- Feature gating (targetChannels + productCategory)
- Environment-specific behavior (environment)

---

### createBackendContext

```ts
function createBackendContext(
  userId: string,
  organizationId: string,
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
  targetChannels: string[],
  productCategory: string,
  permissions: string[]
): BackendContext
```

Factory function. Auto-populates:
- `requestId`: `'req_' + Date.now()`
- `timestamp`: `Date.now()`
- `environment`: `process.env.NODE_ENV || 'development'`

**Example output:**
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

### generateFormSchema

```ts
async function generateFormSchema(context: BackendContext): Promise<DynamicFormSchema>
```

**Endpoint:** `POST /api/v1/ecommerce/form-schema/generate`

**Request body:**
```json
{ "context": { ...BackendContext } }
```

Called on initial page load. If `productCategory` is empty, returns essential+basic fields
only. If `productCategory` is set, returns the full category-specific schema.

**Error handling:** On non-2xx, attempts to parse the JSON error body and extract
`message` or `error` field. Falls back to `statusText`.

---

### refreshFormSchema

```ts
async function refreshFormSchema(context: BackendContext): Promise<DynamicFormSchema>
```

**Endpoint:** `POST /api/v1/ecommerce/form-schema/refresh`

Same request body shape as `generateFormSchema`. Used by `useFormSchema.loadCategoryFieldsSmooth()`
when a category is selected. The "refresh" endpoint signals to the backend that this
is a category-change, not an initial load — the backend may apply different caching or
optimization strategies.

---

### getCategoryConfig

```ts
async function getCategoryConfig(category: string): Promise<any>
```

**Endpoint:** `GET /api/v1/ecommerce/master-attributes/category-config?category={category}`

Returns category-specific configuration metadata — not the form schema, but the underlying
attribute configuration (allowed fields, category rules, etc.). Used for administrative
purposes; not called during the standard product creation flow.

---

## MediaUploadService

**File:** `services/media-upload.service.ts`

A static class. Uploads images to the backend, which proxies to GCP Cloud Storage.

Base URL: `http://localhost:8888/labamap/api/v1`

---

### Supporting Types

```ts
interface ImageUploadResponse {
  publicUrl: string;        // Full GCP public URL of the uploaded image
  thumbnailUrl: string;     // URL of auto-generated thumbnail
  filename: string;         // Stored filename (may differ from original)
  size: number;             // File size in bytes
  mimeType: string;         // e.g. 'image/jpeg'
  uploadedAt: string;       // ISO timestamp
  organizationId: string;   // Echoed from request
  productId: string;        // Echoed from request
  imageType: string;        // 'main' | 'gallery' | variant path segment
}

interface UploadProgress {
  filename: string;
  progress: number;   // 0-100
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}
```

---

### uploadImage

```ts
static async uploadImage(
  file: File,
  organizationId: string,
  productId: string,
  imageType: 'main' | 'gallery' = 'main',
  onProgress?: (progress: number) => void
): Promise<ImageUploadResponse>
```

**Endpoint:** `POST /api/v1/media/upload` (multipart/form-data)

Uses `XMLHttpRequest` (not `fetch`) to enable `upload.progress` events.

**FormData fields sent:**
- `file` — the File object
- `organizationId` — org identifier (determines GCP bucket path)
- `productId` — product identifier (determines GCP object path)
- `imageType` — `'main'` or `'gallery'`

**Validation (run before upload):**
- Max file size: 10 MB
- Allowed MIME types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif`
- File must not be empty (size > 0)

Any validation failure throws immediately before the XHR is opened.

**Progress:** `onProgress(percent)` is called on every `xhr.upload.progress` event.
Percent is computed as `(loaded / total) * 100`.

**Error states:**
- HTTP status ≠ 200 → `Error('Upload failed with status {status}: {responseText}')`
- Network error → `Error('Upload failed - network error')`
- User abort → `Error('Upload cancelled')`

---

### uploadMultipleImages

```ts
static async uploadMultipleImages(
  files: File[],
  organizationId: string,
  productId: string,
  onProgress?: (progress: UploadProgress[]) => void
): Promise<ImageUploadResponse[]>
```

Uploads multiple files **sequentially** (not in parallel) to avoid overloading the server.
Returns an array of `ImageUploadResponse` for each successfully uploaded file.

**Progress tracking:**
- Maintains a `Map<filename, UploadProgress>` for all files
- Emits the full progress array on every update
- Failed files are marked `status: 'error'` and included in the progress array
- Failed files do NOT throw — errors are reported via the progress callback
- Returns only the successfully uploaded files in the result array

**Example progress callback sequence:**
```
[{ file1: uploading 0% }, { file2: uploading 0% }]
[{ file1: uploading 45% }, { file2: uploading 0% }]
[{ file1: completed 100% }, { file2: uploading 0% }]
[{ file1: completed 100% }, { file2: uploading 78% }]
[{ file1: completed 100% }, { file2: completed 100% }]
```

---

### deleteImage

```ts
static async deleteImage(imageUrl: string): Promise<boolean>
```

**Endpoint:** `DELETE /api/v1/media/delete?imageUrl={encodedUrl}`

Returns `true` on success, `false` on any error (network failure, 4xx, 5xx).
Never throws — errors are swallowed and return `false`.

---

## Pattern Matching Service

**File:** `services/pattern-matching.service.ts`

Exports standalone functions. Implements the 5-tier Adaptive Pattern Matching system
for mapping master product fields to channel-specific fields.

Base URL: `http://localhost:8888/labamap/api/v1`

---

### analyzePatternMatching

```ts
async function analyzePatternMatching(
  request: AdaptivePatternMatchingRequest
): Promise<AdaptivePatternMatchingResponse>
```

**Endpoint:** `POST /api/v1/adaptive-pattern-matching/analyze`

The core channel mapping function. Sends a flat source schema (master product fields)
and a target schema (channel's required fields) to the backend's 5-tier matching engine.

**5-tier matching strategies (backend):**

| Tier | Strategy | Description |
|---|---|---|
| 1 | `KNOWLEDGE_BASED` | Exact match from learned/historical mappings |
| 2 | `SEMANTIC_MATCH` | NLP semantic similarity between field names |
| 3 | `SIMILARITY_MATCH` | Edit distance + phonetic similarity |
| 4 | `PATTERN_MATCH` | Regex and structural pattern rules |
| 5 | `SEMANTIC_WITH_BOOST` | Semantic + channel-specific field boost scores |
| — | `EXACT_MATCH` | Literal string equality (fastest path) |

**Request:**
```ts
interface AdaptivePatternMatchingRequest {
  sourceSchema: Record<string, any>;  // Flat product fields (from transformMasterProductToSourceSchema)
  targetSchema: Record<string, any>;  // Channel's field schema
  channelId: string;                  // e.g. 'shopify', 'amazon'
  confidenceThreshold: number;        // 0.0–1.0, mappings below this are excluded
  organizationId?: string;
  userId?: string;
  categoryId?: string;
  persistJolt?: boolean;              // Save JOLT spec to backend for reuse
  persistConfidenceThreshold?: number;
  forceReanalyze?: boolean;           // Bypass cache, run fresh analysis
}
```

**Response:**
```ts
interface AdaptivePatternMatchingResponse {
  fieldMappings: FieldMapping[];        // All mappings above confidenceThreshold
  joltSpec: any[];                      // JOLT transformation spec (JSON array)
  overallConfidence: number;            // Weighted average confidence
  unmappedSourceFields: string[];       // Product fields with no channel match
  unmappedTargetFields: string[];       // Channel required fields not covered
  status?: string;
  message?: string;
  matchingMetadata: {
    knowledgeBasedMatches: number;
    semanticMatches: number;
    similarityMatches: number;
    patternMatches: number;
    totalMatches: number;
    processingTimeMs: number;
    warnings?: string[];
  };
}
```

**Error handling:** Throws if the response is not `2xx` or if `result.status === 'ERROR'`.

---

### publishToChannel

```ts
async function publishToChannel(
  request: ChannelPublishRequest
): Promise<ChannelPublishResponse>
```

**Endpoint:** `POST /api/v1/channels/publish`

Takes the master product data and the field mappings from `analyzePatternMatching`, applies
the JOLT transformation, and publishes the resulting payload to the channel's API.

**Request:**
```ts
interface ChannelPublishRequest {
  masterProductId: string;
  masterProductData: Record<string, any>;
  channelId: string;
  fieldMappings: FieldMapping[];
  joltSpec?: any[];
  skipValidation?: boolean;
  dryRun?: boolean;           // Preview without actually publishing
  categoryId?: string;
  organizationId?: string;
  publishOptions?: {
    skipValidation?: boolean;
    autoPublish?: boolean;
    syncInventory?: boolean;
  };
}
```

**Response:**
```ts
interface ChannelPublishResponse {
  success: boolean;
  publishId?: string;
  channelProductId?: string;      // ID assigned by the channel (e.g. Shopify product ID)
  channelUrl?: string;            // URL of the published product on the channel
  publishedData: Record<string, any>;  // The transformed payload that was sent
  warnings?: string[];
  errors?: string[];
  publishedAt?: string;
  syncStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  transformationApplied?: {
    fieldsTransformed: number;
    fieldsDropped: number;
    fieldsAdded: number;
  };
  isDryRun?: boolean;
  performanceMetrics?: {
    transformationTimeMs: number;
    channelApiCallTimeMs: number;
    totalTimeMs: number;
  };
}
```

---

### previewJoltTransformation

```ts
async function previewJoltTransformation(
  sourceData: Record<string, any>,
  joltSpec: any[]
): Promise<Record<string, any>>
```

**Endpoint:** `POST /api/v1/jolt/preview`

Applies a JOLT specification to `sourceData` on the backend and returns the transformed
result. Used to show the user what their product data will look like after transformation,
before they commit to publishing.

---

### getAvailableChannels

```ts
async function getAvailableChannels(): Promise<ChannelConfiguration[]>
```

**Endpoint:** `GET /api/v1/channels`

Returns the list of active channel configurations. The backend returns `ChannelConfigurationBackend[]`
(the raw database shape), which this function transforms to the simpler `ChannelConfiguration[]`.

**Transformation (`transformChannelConfig`):**
- Maps `backend.channelId` → `config.channelId`
- Maps `backend.metadata.variantSupport` → `config.variantSupport` (default `false`)
- Maps `backend.metadata.maxVariants` → `config.maxVariants`
- Only active channels (`isActive === true`) are included in the result

---

## Types Reference

### types/product.ts

---

#### MasterProduct

The canonical product representation used throughout the system.

```ts
interface MasterProduct {
  // Identity
  id: string;
  sku: string;
  name: string;
  description?: string;
  shortDescription?: string;

  // Pricing
  price: number;
  compareAtPrice?: number;   // Strike-through price for sale display
  costPerItem?: number;      // Cost of goods (for margin calculation)

  // Basic Information
  brand?: string;
  category?: string;
  tags?: string[];
  barcode?: string;          // EAN/UPC
  hsCode?: string;           // Harmonized System code for customs

  // Inventory
  quantity?: number;
  trackQuantity?: boolean;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'low_stock';
  lowStockThreshold?: number;
  allowBackorders?: boolean;

  // Media
  mainImage?: string;        // URL of primary product image
  galleryImages?: string[];  // Array of additional image URLs
  videos?: string[];

  // Physical Properties
  weight?: number;
  weightUnit?: 'kg' | 'lb' | 'g' | 'oz';
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in' | 'm' | 'ft';
  };

  // SEO
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  searchTerms?: string[];

  // Shipping
  shippingClass?: string;
  shippingWeight?: number;
  requiresShipping?: boolean;
  freeShipping?: boolean;

  // Variants
  hasVariants?: boolean;
  variantOptions?: VariantOption[];   // Option dimensions: [{ name: 'color', values: [...] }]
  variants?: ProductVariant[];        // Individual variant rows

  // Custom Attributes
  customAttributes?: { [key: string]: any };  // Overflow bucket for non-standard fields

  // Status
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'public' | 'private' | 'hidden';

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;

  // Channel Information
  channelMappings?: ChannelMapping[];    // Per-channel mapping status
  publishedChannels?: string[];          // Channel IDs where product is live
}
```

---

#### VariantOption

Defines a dimension and its possible values. Used in `MasterProduct.variantOptions`.

```ts
interface VariantOption {
  name: string;      // e.g. 'color', 'size'
  values: string[];  // e.g. ['Black', 'White', 'Silver']
}
```

This is the dimension definition. The actual per-combination rows are in `ProductVariant[]`.

---

#### ProductVariant

One combination of variant dimension values. Each row in the variant table becomes one
`ProductVariant`.

```ts
interface ProductVariant {
  id: string;             // e.g. 'black-64gb' (auto-generated from option values)
  sku: string;            // e.g. 'SKU-BLACK-64GB'
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  barcode?: string;
  image?: string;         // Primary image for this variant
  weight?: number;
  options: { [optionName: string]: string };  // e.g. { color: 'Black', size: 'M' }
  customAttributes?: { [key: string]: any };
}
```

---

#### ChannelMapping

Tracks the mapping status of a product to a specific channel.

```ts
interface ChannelMapping {
  channelId: string;
  channelProductId?: string;   // ID on the channel's platform
  mappedAt: string;            // ISO timestamp of last field mapping run
  lastSyncAt?: string;         // ISO timestamp of last sync
  status: 'mapped' | 'published' | 'error';
  confidence: number;          // Overall mapping confidence (0–1)
  mappedFields: number;        // Number of fields successfully mapped
  totalFields: number;         // Total required fields on target channel
}
```

---

#### CreateMasterProductRequest

The outgoing product shape for product creation — a flat version of `MasterProduct`
without channel-specific fields. Used as the `productData` body in the create API call.

---

#### ProductCreationResponse

```ts
interface ProductCreationResponse {
  success: boolean;
  masterProduct?: MasterProduct;
  availableChannels?: string[];   // Channels the org has configured
  nextStep?: string;              // URL suggestion for the wizard (e.g. '/products/{id}/channel-fields')
  errors?: string[];
}
```

---

#### ValidationResult (simple)

```ts
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  fieldValidations?: FieldValidation[];
}

interface FieldValidation {
  fieldName: string;
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
```

The simple per-field validation result. Distinct from `EnhancedValidationResult` (which
comes from the rules-engine backend endpoint and has violation severity, scores, etc.).

---

### types/form-schema.ts

---

#### FormGenerationContext

The context sent when requesting a form schema. Similar to `BackendContext` but used
specifically for schema generation requests.

```ts
interface FormGenerationContext {
  userId: string;
  organizationId: string;
  userRole: 'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY';
  targetChannels: string[];
  productCategory?: string;
  permissions: string[];
  requestId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

---

#### FormFieldType

The complete set of supported field types:

```ts
type FormFieldType =
  | 'text' | 'number' | 'email' | 'url' | 'tel' | 'password'
  | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'radio'
  | 'date' | 'datetime-local'
  | 'file' | 'image' | 'media'
  | 'color' | 'range'
  | 'variant-configurator'
  | 'channel-settings';
```

`FieldRenderer.tsx` handles `text`, `number`, `email`, `url`, `tel`, `date`,
`datetime-local`, `textarea`, `select`, `checkbox`, `image`, `file`, `media`.
The remaining types (`color`, `range`, `multiselect`, `radio`, `channel-settings`)
fall through to a plain text input as placeholders for future renderers.
`variant-configurator` is excluded from section rendering entirely — handled by
`VariantsSection`.

---

#### FormField

The complete field definition. Every field in the dynamic form schema is a `FormField`.

```ts
interface FormField {
  // Identity
  fieldName: string;         // Primary key — used as formData key
  name?: string;             // Alias — code uses fieldName || name
  fieldType: FormFieldType;
  label: string;
  description?: string;      // Shown as tooltip on info icon
  placeholder?: string;
  helpText?: string;         // Shown below input when no error
  defaultValue?: any;        // Applied on schema load if field is empty

  // Validation
  validationRules: FormFieldValidationRules;

  // Conditional Visibility
  conditionalVisibility?: ConditionalVisibility;
  conditionalLogic?: {
    triggersFieldChanges?: string[];   // Fields that react when this field changes
    affectedByFields?: string[];       // Fields that affect this field
  };

  // Options (for select/multiselect/radio)
  options?: FormFieldOption[];

  // State flags
  readOnly: boolean;
  hidden: boolean;
  required: boolean;

  // Governance
  businessContext: FieldBusinessContext;

  // Layout
  group?: string;
  section?: string;          // 'basic-info', 'pricing', 'media', etc.
  displayLevel?: FieldDisplayLevel;
  order?: number;            // Sort order within section
  width?: 'full' | 'half' | 'third' | 'quarter';
  appearance?: Record<string, any>;

  // Variant Handling
  variantScope?: 'dual' | 'variant_only' | null;
}
```

---

#### FormFieldValidationRules

```ts
interface FormFieldValidationRules {
  required?: boolean;
  min?: number;             // Minimum numeric value
  max?: number;             // Maximum numeric value
  minLength?: number;       // Minimum string length
  maxLength?: number;       // Maximum string length
  pattern?: string;         // Regex string (tested with new RegExp(pattern))
  precision?: number;       // Decimal places for number fields
  enum?: string[];          // Allowed values — for validation messages
  maxItems?: number;        // Max images for 'image'/'media'/'file' fields
  customValidators?: string[];
  isVariantDimension?: boolean;  // Hint: this SELECT field is a variant dimension
  variantFields?: string[];      // Explicit list of column names for variant table
}
```

---

#### ConditionalVisibility

```ts
interface ConditionalVisibility {
  showWhen?: string;      // Operator-object or expression string
  hideWhen?: string;      // Opposite of showWhen
  requiredWhen?: string;  // Make required when condition is true
  disabledWhen?: string;  // Disable (not hide) when condition is true
}
```

Both operator-object format and expression string format are supported.
See [DYNAMIC-FORM-SYSTEM.md](DYNAMIC-FORM-SYSTEM.md) for full evaluation logic.

---

#### FieldDisplayLevel

```ts
type FieldDisplayLevel =
  | 'essential'          // Always shown (even before category selected)
  | 'basic'              // Always shown
  | 'advanced'           // Shown after category selected
  | 'optional'           // Shown after category selected
  | 'category-specific'; // Shown after category selected
```

---

#### FieldBusinessContext

Governance metadata attached to every field. Populated by the backend.

```ts
interface FieldBusinessContext {
  businessOwner: string;          // Team or person responsible for this field
  technicalOwner?: string;
  lastModifiedBy: string;
  modificationReason?: string;
  requiresApproval: boolean;      // Whether changes to this field need approval
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  addedByRule?: string;           // Business rule that injected this field
  categorySpecific?: boolean;
  channelSpecific?: boolean;
  version: number;
  variantDimension?: boolean;     // Same as validationRules.isVariantDimension
}
```

---

#### FormFieldOption

Options for select/multiselect/radio fields.

```ts
interface FormFieldOption {
  value: string;
  label: string;
  description?: string;   // Shown as tooltip on the option
  disabled?: boolean;
  icon?: string;
}
```

---

#### DynamicFormSchema

The top-level object returned by both `generateFormSchema` and `refreshFormSchema`.

```ts
interface DynamicFormSchema {
  title: string;
  description: string;
  version: string;
  generatedAt: string;      // ISO timestamp
  generatedFor: {
    userId: string;
    organizationId: string;
    userRole: string;
    permissions: string[];
  };

  fields?: FormField[];     // Flat format (preferred)
  sections?: FormSection[]; // Nested format — flattened by useFormSchema

  conditionalLogic?: FormLogic;
  governanceInfo?: FormGovernanceInfo;

  metadata?: {
    estimatedCompletionTime?: number;
    complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
    fieldCount: number;
    requiredFieldCount: number;
    conditionalFieldCount: number;
    formStage?: 'essential' | 'category-specific';
    variantScopedFields?: string[] | null;   // Names of all 'dual' fields
    variantDimensions?: string[] | null;     // Names of all variant dimension fields
  };
}
```

`variantScopedFields` and `variantDimensions` in `metadata` are performance hints —
the frontend can use them directly rather than scanning all fields every render.

---

#### FormSection

Used when the backend returns the nested format. Flattened to a fields array by
`useFormSchema.flattenSections()`.

```ts
interface FormSection {
  key: string;          // e.g. 'basic-info'
  label: string;
  description?: string;
  fields: FormField[];  // Fields stamped with section = key after flattening
  order?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}
```

---

#### FormLogic

Cross-field dependency rules, separate from per-field `conditionalVisibility`.

```ts
interface FormLogic {
  fieldDependencies: FieldDependency[];
  validationDependencies: ValidationDependency[];
  globalValidations?: {
    expression: string;
    message: string;
    severity: 'error' | 'warning';
  }[];
}

interface FieldDependency {
  triggerField: string;
  affectedFields: string[];
  logic: Record<string, {
    show?: string[];
    hide?: string[];
    require?: string[];
    recommend?: string[];
    optional?: string[];
  }>;
}
```

Currently parsed and stored on the schema but not actively evaluated by the frontend
(individual `conditionalVisibility` handles most use cases). Reserved for future use.

---

#### FormGovernanceInfo

Audit trail for the form schema itself. Not rendered in the UI.

```ts
interface FormGovernanceInfo {
  formGeneratedBy: string;
  attributesVersion: string;
  lastAttributeUpdate: string;
  businessApprovals: { field: string; approvedBy: string; approvedAt: string; notes?: string; }[];
  pendingApprovals: { field: string; requestedBy: string; requestedAt: string; reason: string; }[];
  changeLog: {
    timestamp: string;
    changedBy: string;
    changeType: 'FIELD_ADDED' | 'FIELD_MODIFIED' | 'FIELD_REMOVED' | 'VALIDATION_CHANGED';
    fieldName: string;
    oldValue?: any;
    newValue?: any;
    reason: string;
  }[];
}
```

---

#### EnhancedValidationResult

The structured result from the backend validation rules engine.

```ts
interface EnhancedValidationResult {
  valid: boolean;               // True if no ERROR violations
  message: string;              // Human-readable summary
  violations: ValidationViolation[];
  warnings: ValidationWarning[];
  rulesExecuted: number;        // Total rules evaluated
  executionTimeMs: number;      // Backend processing time
  validationScore: number;      // 0–100 completeness/quality score
  canSubmit: boolean;           // false only when violations contain severity='ERROR'
}

interface ValidationViolation {
  ruleId: string;               // e.g. 'PRICE_REQUIRED', 'SKU_UNIQUE'
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  affectedFields: string[];     // Form field names involved
  violationType: 'BUSINESS_RULE' | 'FIELD_VALIDATION' | 'SCHEMA_VALIDATION';
  suggestion?: string;          // Actionable fix hint
}

interface ValidationWarning {
  ruleId: string;
  message: string;
  affectedFields: string[];
  suggestion?: string;
}
```

**`canSubmit` vs `valid`:**

| Condition | valid | canSubmit |
|---|---|---|
| No violations, no warnings | true | true |
| Warnings only | true | true |
| ERROR violations | false | false |
| INFO or WARNING violations only | true | true |

`canSubmit = false` only when at least one violation has `severity: 'ERROR'`.
The form blocks submission when `!canSubmit`.

---

### types/channel-mapping.ts

---

#### FieldMapping

One resolved mapping between a source field and a target field.

```ts
interface FieldMapping {
  sourcePath: string;         // Master product field name (flat key)
  targetPath: string;         // Channel's field name
  confidence: number;         // 0.0–1.0 match confidence
  matchStrategy: MatchStrategy;
  usageCount?: number;        // Times this mapping has been used historically
  successRate?: number;       // Historical success rate (0.0–1.0)
  dataTransformation?: string; // JOLT or transformation expression
  channelBoost?: number;      // Channel-specific confidence boost applied
}
```

---

#### MatchStrategy

The strategy that produced a given mapping:

```ts
type MatchStrategy =
  | 'KNOWLEDGE_BASED'        // Historical/learned mapping
  | 'SEMANTIC_MATCH'         // NLP semantic similarity
  | 'SIMILARITY_MATCH'       // Edit distance / phonetic
  | 'PATTERN_MATCH'          // Regex / structural pattern
  | 'SEMANTIC_WITH_BOOST'    // Semantic + channel field boost
  | 'EXACT_MATCH';           // Exact string equality
```

Higher tiers (EXACT_MATCH, KNOWLEDGE_BASED) generally yield higher confidence scores
than lower tiers (PATTERN_MATCH, SIMILARITY_MATCH).

---

#### AdaptivePatternMatchingRequest / Response

Full reference in the [analyzePatternMatching](#analyzepatternmatching) section above.

---

#### ChannelConfiguration

The frontend-friendly channel config shape (after transformation from backend shape):

```ts
interface ChannelConfiguration {
  channelId: string;
  channelName: string;
  description?: string;
  apiEndpoint?: string;
  requiredFields: string[];    // Field names the channel requires
  optionalFields: string[];    // Field names the channel accepts but doesn't require
  fieldConstraints?: Record<string, {
    maxLength?: number;
    minLength?: number;
    required?: boolean;
    type?: string;
    min?: number;
    max?: number;
    pattern?: string;
  }>;
  variantSupport: boolean;
  maxVariants?: number;
  rateLimit?: {
    requestsPerSecond: number;
    requestsPerDay: number;
  };
  isActive?: boolean;
  metadata?: Record<string, any>;
}
```

---

#### ChannelSyncStatus

```ts
interface ChannelSyncStatus {
  masterProductId: string;
  channelId: string;
  channelProductId?: string;
  status: 'NOT_SYNCED' | 'SYNCED' | 'SYNC_FAILED' | 'OUTDATED';
  lastSyncedAt?: string;
  lastSyncError?: string;
  syncAttempts: number;
  fieldMappingsUsed: FieldMapping[];
}
```

Returned by channel sync queries. `OUTDATED` means the product was published but has
since been updated and the channel copy is stale.

---

#### LearnedMapping

A historical mapping record the backend uses to improve future pattern matching.
Created automatically when a user confirms a field mapping.

```ts
interface LearnedMapping {
  id: string;
  channelId: string;
  sourceField: string;
  targetField: string;
  confidence: number;
  successRate: number;
  usageCount: number;
  lastUsed: string;
  createdBy: string;
  validated: boolean;
  organizationId?: string;
}
```

These records feed into the `KNOWLEDGE_BASED` matching tier. The more a mapping is
confirmed and used, the higher its confidence becomes in future analyses.

---

## Backend Base URLs

| Service | Base URL |
|---|---|
| Product + Schema | `http://localhost:8888/labamap/api/v1/ecommerce` |
| Media | `http://localhost:8888/labamap/api/v1` |
| Pattern Matching + Channels | `http://localhost:8888/labamap/api/v1` |

All services call the same backend host. The base URL should be moved to an environment
variable for production (`NEXT_PUBLIC_BACKEND_URL`).

---

## Error Handling Summary

| Service | Method | On non-2xx | On network error |
|---|---|---|---|
| ProductApiService | createProduct | throws Error | throws Error |
| ProductApiService | validateProductEnhanced | throws Error | throws Error |
| ProductApiService | getAllMasterAttributes | throws Error | throws Error |
| SchemaApiService | generateFormSchema | throws Error with parsed message | throws Error |
| SchemaApiService | refreshFormSchema | throws Error | throws Error |
| SchemaApiService | getCategoryConfig | throws Error | throws Error |
| MediaUploadService | uploadImage | throws Error with status | throws 'network error' |
| MediaUploadService | uploadMultipleImages | marks file as error, continues | marks file as error |
| MediaUploadService | deleteImage | returns false | returns false |
| PatternMatchingService | analyzePatternMatching | throws Error | throws Error |
| PatternMatchingService | publishToChannel | throws Error | throws Error |
| PatternMatchingService | previewJoltTransformation | throws Error | throws Error |
| PatternMatchingService | getAvailableChannels | throws Error | throws Error |

`useProductSubmit` catches all errors from `ProductApiService` and converts them to
`submitError` (string) state. `useFormSchema` catches schema errors and converts them
to `schemaError` state. All other callers must handle errors themselves.
