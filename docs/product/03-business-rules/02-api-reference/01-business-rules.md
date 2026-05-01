# API Reference — Business Rules

Base path: `/labamap/api/v1/ecommerce`

Frontend proxy: Next.js API routes under `/api/business-rules/` (handles CORS)

---

## MongoDB Collection: `ecommerce_business_rules`

```json
{
  "_id":             "64f3a1b2c3d4e5f6a7b8c9d0",
  "ruleId":          "PRICE_VALIDATION",
  "ruleName":        "Price must be positive",
  "ruleDescription": "Ensures all products have a valid positive price",
  "ruleType":        "BUSINESS_LOGIC",
  "enabled":         true,
  "priority":        10,

  "validationRules": [
    {
      "field":    "price",
      "operator": "GREATER_THAN",
      "value":    0,
      "message":  "Price must be greater than zero",
      "severity": "ERROR"
    }
  ],

  "applicableFields":      ["price"],
  "applicableCategories":  [],
  "supportedChannels":     [],
  "organizationId":        null,
  "tenantSpecific":        false,
  "isCritical":            false,
  "executionTimeoutMs":    5000,

  "executionCount":        1247,
  "successCount":          1230,
  "failureCount":          17,
  "avgExecutionTimeMs":    2.4,
  "lastExecutedAt":        "2026-04-29T09:00:00Z",

  "tags":      ["pricing", "validation"],
  "version":   "1.0",
  "createdAt": "2026-01-15T08:00:00Z",
  "updatedAt": "2026-04-01T12:00:00Z"
}
```

---

## GET `/ecommerce/business-rules`

Returns all **enabled** rules. Disabled rules are not returned.

**Query params (optional):**
```
type=BUSINESS_LOGIC          ← filter by ruleType
enabled=true                 ← redundant (default), no false support yet
```

**Response:** `BusinessRulesResponse`
```json
{
  "success": true,
  "count":   5,
  "rules":   [ ...BusinessRule[] ]
}
```

**Known limitation:** No `?includeDisabled=true` support yet. Disabled rules disappear from the list.

---

## POST `/ecommerce/business-rules`

Creates a new rule.

**Request body:** `CreateRuleRequest`
```json
{
  "ruleId":          "SKU_FORMAT",
  "ruleName":        "SKU must be uppercase alphanumeric",
  "ruleDescription": "Enforces SKU format",
  "ruleType":        "BUSINESS_LOGIC",
  "priority":        20,
  "enabled":         true,
  "validationRules": [
    {
      "field":    "sku",
      "operator": "REGEX",
      "value":    "^[A-Z0-9-]+$",
      "message":  "SKU must contain only uppercase letters, numbers, and hyphens",
      "severity": "ERROR"
    }
  ],
  "applicableFields": ["sku"],
  "isCritical":       false
}
```

**Response:** `BusinessRulesResponse` with `rule` populated.

---

## GET `/ecommerce/business-rules/{ruleId}`

Returns a single rule by `ruleId`.

**Response:** `BusinessRulesResponse` with `rule` populated.

---

## PUT `/ecommerce/business-rules/{ruleId}`

Full update of an existing rule.

**Request body:** `UpdateRuleRequest` — same shape as `CreateRuleRequest`.

**Response:** `BusinessRulesResponse` with updated `rule`.

---

## DELETE `/ecommerce/business-rules/{ruleId}`

Permanently deletes the rule. Returns `204 No Content`.

---

## PATCH `/ecommerce/business-rules/{ruleId}/toggle`

Toggles `enabled` between `true` and `false`.

**Response:**
```json
{
  "success": true,
  "enabled": false
}
```

---

## GET `/ecommerce/business-rules/statistics`

Returns aggregated metrics across all rules.

**Response:** `BusinessRulesResponse` with `statistics` populated.
```json
{
  "success": true,
  "statistics": {
    "totalRules":             5,
    "totalExecutions":        8432,
    "successfulExecutions":   8400,
    "failedExecutions":       32,
    "averageExecutionTimeMs": 3.1
  }
}
```

---

## Rule Configuration Schemas

Sub-path: `/ecommerce/business-rules/schemas`

Schemas describe the `configuration` field structure for each rule, enabling the frontend to build dynamic config forms rather than relying on a raw JSON editor.

### GET `/ecommerce/business-rules/schemas`

Returns all available configuration schemas.

**Response:**
```json
{
  "success": true,
  "count":   3,
  "schemas": [
    {
      "schemaId":   "SKU_GENERATION",
      "schemaName": "SKU Generation",
      "ruleType":   "PRE_PROCESSING",
      "description": "Configuration for auto-generating SKUs",
      "fields": [
        { "name": "pattern",      "type": "string",  "required": true,  "description": "Pattern with {brandCode}, {categoryCode}, {hash} placeholders" },
        { "name": "brandCodeLength", "type": "integer", "required": false, "default": 3 },
        { "name": "hashLength",   "type": "integer",  "required": false, "default": 6 },
        { "name": "condition",    "type": "string",   "required": false, "enum": ["sku_missing", "always", "empty"] },
        { "name": "overwriteExisting", "type": "boolean", "required": false, "default": false }
      ]
    }
  ],
  "note": "Schemas match actual configuration structure in business-rules-registry.json"
}
```

---

### GET `/ecommerce/business-rules/schemas/{schemaId}`

Returns a single schema by ID (e.g. `SKU_GENERATION`).

**Response:** `{ "success": true, "schema": { ...RuleConfigurationSchema } }`

Returns `404` with `{ "success": false, "error": "Schema not found: ..." }` if the schemaId has no registered schema (complex nested configs use the raw JSON editor instead).

---

### POST `/ecommerce/business-rules/schemas/{schemaId}/validate`

Validates a configuration object against the named schema before saving.

**Request body:** The `configuration` object to validate.
```json
{
  "pattern":        "{brandCode}-{categoryCode}-{hash}",
  "brandCodeLength": 3,
  "condition":      "sku_missing"
}
```

**Response on valid:**
```json
{
  "valid":    true,
  "errors":   [],
  "warnings": [],
  "message":  "Configuration is valid"
}
```

**Response on invalid (400):**
```json
{
  "valid":    false,
  "errors":   ["pattern: required field missing"],
  "warnings": [],
  "message":  "Configuration validation failed"
}
```

---

### GET `/ecommerce/business-rules/schemas/templates/{ruleId}`

Returns an example configuration and field documentation for a known rule. Used to populate a "Start from template" button in the rule editor.

**Built-in templates:** `SKU_GENERATION`, `PRICE_VALIDATION`, `CATEGORY_ENHANCEMENT`

**Response:**
```json
{
  "success":  true,
  "ruleId":   "SKU_GENERATION",
  "template": {
    "description": "Auto-generate SKU using brand-category-hash pattern",
    "example": {
      "pattern":         "{brandCode}-{categoryCode}-{hash}",
      "brandCodeLength": 3,
      "hashLength":      6,
      "condition":       "sku_missing",
      "overwriteExisting": false
    },
    "fields": {
      "pattern":        "Pattern template with {brandCode}, {categoryCode}, {hash} placeholders",
      "brandCodeLength":"Number of characters from brand name (1-10)",
      "condition":      "When to generate: 'sku_missing', 'always', or 'empty'"
    }
  }
}
```

Returns `404` for unknown `ruleId`.

---

### GET `/ecommerce/business-rules/schemas/suggest`

Suggests a schema based on `ruleType` and a text `purpose`.

**Query params:**
```
ruleType=BUSINESS_LOGIC
purpose=price
```

**Response on match:**
```json
{
  "success": true,
  "schema":  { ...RuleConfigurationSchema },
  "message": "Schema suggestion found"
}
```

**Response on no match:**
```json
{
  "success": false,
  "message": "No schema suggestion found",
  "availableSchemas": [
    { "schemaId": "PRICE_VALIDATION", "schemaName": "Price Validation", "description": "..." }
  ]
}
```

---

## POST `/ecommerce/business-rules/execute`

Executes matching rules against a product data payload.

**Request body:**
```json
{
  "organizationId": "org_123",
  "ruleType":       "PRE_PROCESSING",
  "productData":    { "name": "wireless earbuds", "price": "29.99" },
  "context": {
    "userId":          "user_abc",
    "organizationId":  "org_123",
    "userRole":        "BUSINESS_USER",
    "targetChannels":  ["shopify"],
    "productCategory": "electronics",
    "permissions":     []
  },
  "fieldName": "all",
  "formData":  { ... }
}
```

**Response:**
```json
{
  "success": true,
  "ruleExecutionResult": {
    "success":      true,
    "enhancedData": { "name": "Wireless Earbuds", "price": 29.99, "sku": "WE-001" },
    "violations":   [],
    "warnings":     [],
    "metadata":     { "rulesExecuted": 3 }
  }
}
```

---

## TypeScript Types

```typescript
// src/types/businessRules.ts

type RuleType = 'PRE_PROCESSING' | 'BUSINESS_LOGIC' | 'DATA_ENHANCEMENT';

type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

type ValidationOperator =
  | 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'NOT_EQUALS'
  | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL'
  | 'MIN_LENGTH' | 'MAX_LENGTH' | 'LENGTH_BETWEEN'
  | 'REGEX' | 'NOT_REGEX'
  | 'REQUIRED' | 'NOT_NULL'
  | 'IN' | 'NOT_IN' | 'CONTAINS' | 'NOT_CONTAINS';

type TransformationType =
  | 'UPPERCASE' | 'LOWERCASE' | 'CAPITALIZE' | 'TRIM'
  | 'TRIM_START' | 'TRIM_END' | 'ROUND' | 'FORMAT_DATE'
  | 'REMOVE_SPECIAL_CHARS' | 'REPLACE' | 'CONCATENATE';

type EnhancementType =
  | 'AUTO_GENERATE_TAGS' | 'ADD_CATEGORY_HIERARCHY'
  | 'ENRICH_FROM_BARCODE' | 'SUGGEST_PRICING'
  | 'IMAGE_ANALYSIS' | 'SEO_OPTIMIZATION';

interface ValidationRule {
  field:      string;
  operator:   ValidationOperator;
  value?:     any;
  message:    string;
  severity:   ValidationSeverity;
  errorCode?: string;
}

interface TransformationRule {
  field:          string;
  transformation: TransformationType;
  order:          number;
  parameters?:    Record<string, any>;
}

interface EnhancementRule {
  field:        string;
  enhancement:  EnhancementType;
  source?:      string;
  parameters?:  Record<string, any>;
}

interface BusinessRule {
  id?:               string;
  ruleId:            string;
  ruleName:          string;
  ruleDescription?:  string;
  ruleType:          RuleType;
  enabled:           boolean;
  priority:          number;
  configuration?:    Record<string, any>;
  validationRules?:      ValidationRule[];
  transformationRules?:  TransformationRule[];
  enhancementRules?:     EnhancementRule[];
  applicableFields?:     string[];
  applicableCategories?: string[];
  supportedChannels?:    string[];
  isCritical?:           boolean;
  executionTimeoutMs?:   number;
  organizationId?:       string;
  tenantSpecific?:       boolean;
  executionCount?:       number;
  successCount?:         number;
  failureCount?:         number;
  avgExecutionTimeMs?:   number;
  lastExecutedAt?:       string;
  tags?:                 string[];
  version?:              string;
  createdAt?:            string;
  updatedAt?:            string;
}

interface RuleFilter {
  type?:       RuleType;
  fields?:     string[];
  categories?: string[];
  channels?:   string[];
  enabled?:    boolean;
  search?:     string;
}

interface CreateRuleRequest {
  ruleId:                string;
  ruleName:              string;
  ruleDescription?:      string;
  ruleType:              RuleType;
  priority:              number;
  enabled:               boolean;
  validationRules?:      ValidationRule[];
  transformationRules?:  TransformationRule[];
  enhancementRules?:     EnhancementRule[];
  applicableFields?:     string[];
  applicableCategories?: string[];
  supportedChannels?:    string[];
  isCritical?:           boolean;
  executionTimeoutMs?:   number;
  tags?:                 string[];
}

interface BusinessRulesResponse {
  success:     boolean;
  message?:    string;
  rule?:       BusinessRule;
  rules?:      BusinessRule[];
  count?:      number;
  statistics?: RuleStatistics;
  enabled?:    boolean;
}

interface RuleStatistics {
  totalRules:             number;
  totalExecutions:        number;
  successfulExecutions:   number;
  failedExecutions:       number;
  averageExecutionTimeMs: number;
}
```
