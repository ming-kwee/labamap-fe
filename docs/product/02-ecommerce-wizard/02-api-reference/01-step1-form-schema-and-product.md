# API Reference — Step 1: Form Schema and Product

Base path: `/labamap/api/v1/ecommerce`

---

## Request Envelope

All form-schema and dynamic-product endpoints read input from a **`{ "context": {...} }` wrapper** at the request body root. Any keys placed outside `context` are ignored by the backend.

```json
{
  "context": {
    "userId":          "user_abc",
    "organizationId":  "org_123",
    "userRole":        "BUSINESS_USER",
    "targetChannels":  ["shopify", "wix"],
    "productCategory": "electronics",
    "productTypeId":   "6623a1b2c3d4e5f6a7b8c9e1",
    "permissions":     ["CREATE_PRODUCT"]
  }
}
```

> **Note:** Send `productTypeId` directly when known (Sprint 3+). `productCategory` slug is still accepted for backward compatibility. When `productTypeId` is present, the backend skips the `product_categories` lookup and queries `ProductTypeRepository` directly.

`requestId` and `timestamp` are generated server-side and do not need to be sent.

---

## POST `/ecommerce/form-schema/generate`

Generates the product creation form schema. Called on initial load (empty category) and on every category change.

**Request body:**
```json
{
  "context": {
    "userId":          "user_abc",
    "organizationId":  "org_123",
    "userRole":        "BUSINESS_USER",
    "targetChannels":  ["shopify", "wix"],
    "productCategory": "",
    "productTypeId":   "6623a1b2c3d4e5f6a7b8c9e1",
    "permissions":     ["CREATE_PRODUCT"]
  }
}
```

Set `productCategory` to `""` for initial load (returns essential + basic fields). Set to a category slug (e.g. `"electronics"`) for category-specific load. Alternatively, send `productTypeId` directly when known (Sprint 3+) — preferred over `productCategory`.

**Response:**
```json
{
  "success": true,
  "formSchema": {
    "title":       "Create Product",
    "version":     "1.0",
    "generatedAt": "2026-04-29T10:00:00Z",
    "fields": [
      { "fieldName": "name",     "fieldType": "TEXT",            "displayLevel": "essential", "required": true  },
      { "fieldName": "sku",      "fieldType": "TEXT",            "displayLevel": "basic",     "required": false },
      { "fieldName": "price",    "fieldType": "NUMBER",          "displayLevel": "essential", "required": true  },
      { "fieldName": "category", "fieldType": "CATEGORY_SELECT", "displayLevel": "essential", "required": true  },
      { "fieldName": "brand",    "fieldType": "TEXT",            "displayLevel": "category-specific", "variantScope": "product_only" }
    ],
    "metadata": {
      "formStage":           "category-specific",
      "fieldCount":          15,
      "requiredFieldCount":  4,
      "productTypeId":       "6623a1b2c3d4e5f6a7b8c9e1",
      "productTypeName":     "Smartphone",
      "variantDimensions":   ["color", "storage_capacity"],
      "variantScopedFields":     ["comparePrice", "costPrice", "inventory", "barcode"],
      "productAndVariantFields": ["sku", "price", "weight"]
    }
  },
  "metadata": {
    "generatedAt":      "2026-04-29T10:00:00Z",
    "schemaVersion":    "1.0.0",
    "productTypeId":    "6623a1b2c3d4e5f6a7b8c9e1",
    "productTypeName":  "Smartphone"
  }
}
```

The backend can return fields in a flat `fields[]` array or a nested `sections[]` array. The frontend's `flattenSections()` handles both.

---

## GET `/ecommerce/form-schema/generate`

Query-string variant of the generate endpoint for simple/debug use cases.

**Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `userId` | `"anonymous"` | |
| `organizationId` | `"default"` | |
| `userRole` | `"BUSINESS_USER"` | `BUSINESS_USER` \| `ADMIN_USER` \| `DEVELOPER` \| `VIEW_ONLY` |
| `category` | — | Category slug, e.g. `electronics` |
| `productTypeId` | — | ProductType ObjectId. Preferred over `category` when known (Sprint 3+). Skips `product_categories` lookup. |
| `channels` | — | Comma-separated, e.g. `shopify,amazon` |

**Example:** `GET /ecommerce/form-schema/generate?userId=u1&organizationId=org_123&category=electronics`

**Response:** Same shape as POST `/generate`.

---

## POST `/ecommerce/form-schema/refresh`

Refreshes the schema when the product category changes. Requires either `productCategory` or `productTypeId` to be set in context. Functionally equivalent to `POST /generate` with a category, but adds `changeType: "CATEGORY_BASED_REFRESH"` to the metadata.

**Request body:** Same shape as `POST /generate` — `{ "context": { ..., "productCategory": "electronics" } }` or `{ "context": { ..., "productTypeId": "6623a1b2c3d4e5f6a7b8c9e1" } }`. Sending `productTypeId` is preferred when known (Sprint 3+).

**Response:** Same shape as generate, with extra metadata:
```json
{
  "success":      true,
  "formSchema":   { "..." : "..." },
  "refreshedFor": "electronics",
  "metadata": {
    "refreshedAt":  "2026-04-29T10:00:00Z",
    "changeType":   "CATEGORY_BASED_REFRESH",
    "productTypeId":"6623a1b2c3d4e5f6a7b8c9e1"
  }
}
```

---

## DELETE `/ecommerce/form-schema/cache`

Clears all MongoDB-cached form schemas plus Caffeine in-memory caches. Forces the next request to rebuild from scratch.

**Response:**
```json
{ "success": true, "message": "All cached form schemas and in-memory caches cleared" }
```

---

## DELETE `/ecommerce/form-schema/cache/product-type/{productTypeId}`

Evicts all cached schemas for a specific ProductType. Call this after updating attributes scoped to that ProductType.

**Response:**
```json
{
  "success":       true,
  "deletedCount":  3,
  "productTypeId": "6623a1b2c3d4e5f6a7b8c9e1",
  "message":       "Cached schemas invalidated for productTypeId: ..."
}
```

---

## FormField — Complete Shape

```typescript
interface FormField {
  fieldName: string;
  name?: string;               // alias — frontend uses fieldName ?? name
  fieldType: string;           // Java enum, serialised uppercase (TEXT, NUMBER, CATEGORY_SELECT, ...)
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: any;
  multiple?: boolean;          // true for multi-image / multi-value fields

  required:  boolean;
  readOnly:  boolean;
  hidden:    boolean;

  displayLevel?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific';
  // 'product_only' → always product-level; 'variant_only' → variant axis (per-SKU only);
  // 'dual' → product-level XOR variant-level (hidden at product level when hasVariants=true);
  // 'both' → product-level AND per-variant simultaneously, independent values (e.g. WIX product.sku
  //          vs variants[*].sku). Do NOT hide 'both' fields at product level. See metadata.productAndVariantFields.
  variantScope?: 'dual' | 'both' | 'variant_only' | 'product_only' | null;
  section?:  string;            // e.g. "basic-info", "pricing"
  order?:    number;

  options?: Array<{ value: string; label: string; disabled?: boolean }>;

  conditionalVisibility?: {
    showWhen?:    string | { field: string; operator: string; value: any };
    hideWhen?:    string | { field: string; operator: string; value: any };
    requiredWhen?: string;
    disabledWhen?: string;
  };

  validationRules: {
    required?:          boolean;
    min?:               number;
    max?:               number;
    minLength?:         number;
    maxLength?:         number;
    pattern?:           string;
    maxItems?:          number;
    maxSizeMB?:         number;
    isVariantDimension?: boolean;
    variantFields?:     string[];
  };

  businessContext: {
    businessOwner:    string;
    riskLevel:        'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    variantDimension?: boolean;
    categorySpecific?: boolean;
    channelSpecific?:  boolean;
  };
}
```

**`fieldType` values and frontend rendering:**

| Backend value | Normalised to | Rendered as |
|---|---|---|
| `TEXT` | `text` | `<input type="text">` |
| `NUMBER` | `number` | `<input type="number">` |
| `TEXTAREA` | `textarea` | `<textarea>` |
| `SELECT` | `select` | `<select>` |
| `CHECKBOX` | `checkbox` | `<input type="checkbox">` |
| `IMAGE` / `FILE` / `MEDIA` | `image` / `file` / `media` | `ImageUploadField` |
| `CATEGORY_SELECT` | `category-select` | `CategorySelectField` |

Normalisation: `.toLowerCase().replace(/_/g, '-')`.

---

## POST `/ecommerce/dynamic-products/validate`

Enhanced pre-submission validation. Called before `create` to surface field errors.

**Request body:**
```json
{
  "context": {
    "userId":          "user_abc",
    "organizationId":  "org_123",
    "userRole":        "BUSINESS_USER",
    "targetChannels":  ["shopify"],
    "productCategory": "electronics",
    "permissions":     ["CREATE_PRODUCT"]
  },
  "productData": {
    "name": "Wireless Earbuds Pro",
    "price": 29.99,
    "sku": "WE-PRO-001"
  }
}
```

**Response (200 — valid / 400 — invalid):**
```json
{
  "validation": {
    "valid":           false,
    "message":         "3 validation errors found",
    "violations": [
      {
        "ruleId":        "REQUIRED_FIELD",
        "severity":      "ERROR",
        "message":       "Product name is required",
        "affectedFields": ["name"],
        "violationType": "FIELD_VALIDATION",
        "suggestion":    "Enter a product name up to 255 characters"
      }
    ],
    "warnings": [
      {
        "ruleId":        "MISSING_DESCRIPTION",
        "message":       "Adding a description improves channel conversion rates",
        "affectedFields": ["description"]
      }
    ],
    "rulesExecuted":    18,
    "executionTimeMs":  12,
    "validationScore":  62.5,
    "canSubmit":        false
  },
  "requestMetadata": {
    "requestId":   "...",
    "processedAt": "2026-04-29T10:00:00Z"
  }
}
```

`canSubmit = false` only when there are violations with `severity: "ERROR"`. Warnings-only → `canSubmit: true`, HTTP 200.

---

## POST `/ecommerce/dynamic-products/create`

Creates the master product. Call only after validation passes (`canSubmit: true`).

**Request body:** Same shape as validate — `{ "context": {...}, "productData": {...} }`.

**Response (200 OK):**
```json
{
  "success":    true,
  "productId":  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "productData": { "...all validated fields..." },
  "validation": { "valid": true, "..." : "..." },
  "metadata": {
    "createdAt":               "2026-04-29T10:00:00Z",
    "createdBy":               "user_abc",
    "organizationId":          "org_123",
    "category":                "electronics",
    "channels":                ["shopify"],
    "adaptedForMasterProduct": true,
    "validatedFields":         12
  },
  "masterProduct": { "...MasterProductData document..." }
}
```

Frontend extracts `res.productId || res.masterProduct?.productId`.

---

## GET `/ecommerce/dynamic-products/channels`

Returns the list of channel identifiers the system supports.

**Response:** `string[]`
```json
["shopify", "amazon", "walmart", "ebay", "etsy", "magento", "woocommerce"]
```

---

## POST `/ecommerce/dynamic-products/example-structure`

Returns an annotated example `{ context, productData }` payload for the given context. Useful for frontend developers to understand what fields to send.

**Request body:** `{ context }` (any valid context object, same shape as generate).

**Response:**
```json
{
  "success": true,
  "exampleStructure": {
    "context": {
      "userId": "john.doe",
      "organizationId": "org-123",
      "userRole": "BUSINESS_USER",
      "productCategory": "electronics",
      "channels": "shopify,amazon"
    },
    "productData": {
      "name": "Example Product Name",
      "sku": "SKU-EXAMPLE-001",
      "price": 99.99,
      "category": "electronics",
      "weight": 1.5,
      "hasVariants": false
    }
  },
  "notes": {
    "context": "Required — defines schema generation parameters",
    "productData": "Required — the actual product data to validate/create",
    "dynamicFields": "Available fields depend on category, channels, and user permissions"
  }
}
```

---

## MongoDB Collection: `master_product_data`

One document per created master product.

```json
{
  "_id":        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "productId":  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "organizationId": "org_123",
  "userId":     "user_abc",
  "productTypeId": "6623a1b2c3d4e5f6a7b8c9e1",
  "tags":       ["electronics", "smartphone"],
  "categoryId":     "...",        // @deprecated → tags[]
  "categoryName":   "Electronics",// @deprecated → tags[]
  "categoryObjectId": "...",      // @deprecated → tags[]
  "productAttributes": {
    "name":        "Wireless Earbuds Pro",
    "sku":         "WE-PRO-001",
    "price":       29.99,
    "description": "High-quality wireless earbuds",
    "mainImage":   "https://storage.googleapis.com/.../main-xxx.jpg",
    "galleryImages": ["https://..."]
  },
  "variants": [
    { "sku": "WE-PRO-001-BLACK", "price": 29.99, "color": "Black", "variantImages": ["https://..."] }
  ],
  "options": [
    { "name": "Color", "values": ["Black", "White"] }
  ],
  "createdAt": "2026-04-29T10:00:00Z",
  "updatedAt": "2026-04-29T10:00:00Z"
}
```

`productAttributes` is a flat key→value map. `variants` is a list of flat variant maps. `options` is a list of flat option-group maps. `MasterProductDataService.toFlatMap()` reassembles the full map that the JOLT publish pipeline reads as `masterProductData`.

---

## MasterProduct — TypeScript Shape

```typescript
// src/modules/ecommerce-product-v2/types/product.ts
interface MasterProduct {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  cost?: number;
  category?: string;
  quantity?: number;
  images?: string[];
  galleryImages?: string[];
  tags?: string[];
  weight?: number;
  dimensions?: { length: number; width: number; height: number; unit: string };
  seo?: { metaTitle: string; metaDescription: string; keywords: string[] };
  variants?: ProductVariant[];
  customAttributes?: Record<string, any>;
  channelSettings?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

interface ProductVariant {
  id: string;
  sku: string;
  price?: number;
  cost?: number;
  comparePrice?: number;
  stock?: number;
  weight?: number;
  barcode?: string;
  variantImages?: string[];
  [dimensionName: string]: any;   // color, size, storage, etc.
}
```

---

## BackendContext — TypeScript Shape

Built by `createBackendContext()` in `services/schema-api.service.ts`. Sent inside `{ "context": BackendContext }` for all requests.

```typescript
interface BackendContext {
  userId:          string;
  organizationId:  string;
  userRole:        'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY';
  targetChannels:  string[];
  /** @deprecated use productTypeId when known (Sprint 3+) */
  productCategory: string;
  productTypeId?:  string;   // preferred over productCategory when known (Sprint 3+)
  permissions:     string[];
  // Fields below are frontend-generated; backend generates its own and ignores these
  requestId?:      string;   // "req_{Date.now()}"
  timestamp?:      number;   // Date.now()
  environment?:    string;   // "development" | "production"
  metadata?:       Record<string, any>;
}
```
