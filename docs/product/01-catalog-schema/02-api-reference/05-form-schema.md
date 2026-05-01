# API Reference — Form Schema

Base path: `/labamap/api/v1/ecommerce/form-schema`

---

## POST `/ecommerce/form-schema/generate`

Initial form load — no category selected. Returns global fields only (attributes with empty `productTypeIds` AND empty `applicableCategories`).

**Request body:**
```json
{
  "context": {
    "userId":         "user_456",
    "organizationId": "org_123",
    "userRole":       "BUSINESS_USER",
    "targetChannels": [],
    "permissions":    ["CREATE_PRODUCT"]
  }
}
```

**Response:** `FormSchemaResponse`
```json
{
  "success": true,
  "formSchema": {
    "title":       "Create Product",
    "version":     "1.0",
    "generatedAt": "2026-04-29T10:00:00Z",
    "fields": [
      { "fieldName": "name",        "fieldType": "text",            "required": true  },
      { "fieldName": "description", "fieldType": "textarea",        "required": false },
      { "fieldName": "sku",         "fieldType": "text",            "required": false },
      { "fieldName": "price",       "fieldType": "number",          "required": true  },
      { "fieldName": "images",      "fieldType": "media",           "required": false },
      { "fieldName": "category",    "fieldType": "CATEGORY_SELECT", "required": true  }
    ],
    "metadata": {
      "isInitialLoad":      true,
      "isCategorySpecific": false,
      "productTypeId":      null,
      "productTypeName":    null
    }
  },
  "metadata": {
    "generatedAt":    "2026-04-29T10:00:00Z",
    "schemaVersion":  "1.0",
    "productTypeId":  null,
    "productTypeName": null
  }
}
```

---

## POST `/ecommerce/form-schema/refresh`

Called when merchant selects a category. Returns global + category-specific fields.
Backend resolves `productTypeId` from the category (or walks ancestor chain if needed).

**Request body:**
```json
{
  "context": {
    "userId":          "user_456",
    "organizationId":  "org_123",
    "userRole":        "BUSINESS_USER",
    "productCategory": "smartphones",
    "targetChannels":  [],
    "permissions":     ["CREATE_PRODUCT"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "formSchema": {
    "fields": [
      { "fieldName": "name",             "fieldType": "text",            "required": true },
      { "fieldName": "category",         "fieldType": "CATEGORY_SELECT", "required": true },
      { "fieldName": "brand",            "fieldType": "text",            "required": true },
      { "fieldName": "os",               "fieldType": "SELECT",          "required": true,
        "options": [{ "value": "android", "label": "Android" }, { "value": "ios", "label": "iOS" }] },
      { "fieldName": "color",            "fieldType": "SELECT",          "required": false,
        "variantScope": "variant_only",
        "options": [{ "value": "black", "label": "Midnight Black" }] },
      { "fieldName": "storage_capacity", "fieldType": "SELECT",          "required": false,
        "variantScope": "variant_only",
        "options": [{ "value": "64gb", "label": "64GB" }] }
    ],
    "metadata": {
      "isInitialLoad":      false,
      "isCategorySpecific": true,
      "selectedCategory":   "smartphones",
      "productTypeId":      "6623a1b2c3d4e5f6a7b8c9e1",
      "productTypeName":    "Smartphone",
      "variantDimensions":  ["color", "storage_capacity"]
    }
  },
  "metadata": {
    "generatedAt":    "2026-04-29T10:00:05Z",
    "schemaVersion":  "1.0",
    "productTypeId":  "6623a1b2c3d4e5f6a7b8c9e1",
    "productTypeName": "Smartphone"
  }
}
```

`productTypeId` appears in BOTH `response.metadata` and `response.formSchema.metadata`. The frontend `unwrapSchema()` handles both locations — outer takes precedence.

---

## DELETE `/ecommerce/form-schema/cache/product-type/{productTypeId}`

Invalidates all cached form schemas for a given ProductType.

Call this whenever a MasterAttribute's `productTypeIds` is modified (attribute added or removed from a type). The backend should call this automatically as a side effect of `PUT /admin/master-attributes/{id}`.

**Path param:** `productTypeId` — the ObjectId string

**Response:** `204 No Content`

---

## Cache Behaviour (Phase 5)

| Before Phase 5 | After Phase 5 |
|---------------|---------------|
| Cache key: category slug | Cache key: productTypeId |
| "budget-smartphones" → miss even if same schema as "smartphones" | Both map to same Smartphone typeId → HIT |
| Invalidation: flush all schemas when any attribute changes | Invalidation: targeted by typeId |

---

## FormSchemaRequest Shape

```typescript
// src/modules/ecommerce-product-v2/types/form-schema.ts
interface FormSchemaRequest {
  context: {
    userId?:          string;
    organizationId?:  string;
    userRole?:        string;
    targetChannels?:  string[];
    productCategory?: string;   // slug — triggers Phase 4 filter + productTypeId resolution
    permissions?:     string[];
  };
}
```

---

## FormSchemaResponse Shape

```typescript
interface FormSchemaResponse {
  success:    boolean;
  formSchema: DynamicFormSchema;
  metadata: {
    generatedAt:      string;
    schemaVersion:    string;
    productTypeId?:   string | null;   // Phase 5: resolved ObjectId
    productTypeName?: string | null;
  };
  error?:   string;
  details?: string;
}
```

---

## DynamicFormSchema Shape

```typescript
interface DynamicFormSchema {
  title:        string;
  description:  string;
  version:      string;
  generatedAt:  string;
  fields?:      FormField[];      // flat list — used when backend doesn't use sections
  sections?:    FormSection[];    // grouped — flattenSections() merges into fields[]

  metadata?: {
    complexity:           'SIMPLE' | 'MODERATE' | 'COMPLEX';
    fieldCount:           number;
    requiredFieldCount:   number;
    isInitialLoad?:       boolean;
    isCategorySpecific?:  boolean;
    selectedCategory?:    string | null;
    productTypeId?:       string | null;   // Phase 5
    productTypeName?:     string | null;   // Phase 5
    variantDimensions?:   string[] | null;
  };
}
```

---

## FormField Shape

```typescript
interface FormField {
  fieldName:    string;
  name?:        string;           // alias — frontend uses fieldName ?? name
  fieldType:    FormFieldType;    // enum from backend (uppercase+underscore)
  label:        string;
  description?: string;
  placeholder?: string;
  helpText?:    string;
  defaultValue?: any;
  required:     boolean;
  readOnly:     boolean;
  hidden:       boolean;
  displayLevel?: FieldDisplayLevel;
  variantScope?: 'dual' | 'variant_only' | null;
  options?:     FormFieldOption[];
  validationRules: FormFieldValidationRules;
  section?:     string;
  order?:       number;
}

type FieldDisplayLevel =
  | 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific';
```
