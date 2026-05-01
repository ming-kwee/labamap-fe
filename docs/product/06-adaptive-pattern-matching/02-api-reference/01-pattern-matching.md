# API Reference — Adaptive Pattern Matching

Base path: `/labamap/api/v1/adaptive-pattern-matching`

---

## MongoDB Collection: `field_semantic_knowledge`

Knowledge base that drives Tier 2 (SEMANTIC_KNOWLEDGE) and Tier 3 (ALIAS_MAPPING) matching.

```json
{
  "_id":           "...",
  "fieldName":     "productName",
  "semanticType":  "PRODUCT_NAME",
  "description":   "Product display name or title",
  "dataType":      "string",
  "aliases":       ["name", "title", "product_title", "item_name"],
  "commonPatterns": [".*name.*", ".*title.*"],
  "keywords":      ["product", "name", "title"],
  "validChannels": ["shopify", "amazon", "lazada"],
  "baseConfidence": 95.0,
  "category":      "PRODUCT",
  "isRequired":    false,
  "isCommon":      true,
  "dataSource":    "CURATED",
  "fieldType":     "TEXT",
  "isActive":      true
}
```

**Key constraint:** `fieldName` is unique per document. `semanticType` is NOT — many documents can share the same type. When alias lookup returns multiple documents, the one with the highest `baseConfidence` is selected.

**Common semantic types:** `PRODUCT_NAME`, `PRICE`, `SKU`, `DESCRIPTION`, `BRAND`, `INVENTORY`, `IMAGE`, `CATEGORY`, `WEIGHT`, `DIMENSIONS`, `GTIN`, `UPC`, `EAN`, `COLOR`, `SIZE`, `TAGS`, `BARCODE`

---

## MongoDB Collection: `channel_field_mappings`

Pre-configured and learned mappings for Tier 1 (CHANNEL_SPECIFIC).

```json
{
  "_id":            "...",
  "channelId":      "shopify",
  "sourceField":    "name",
  "targetField":    "title",
  "sourceAliases":  ["product_name", "title"],
  "targetAliases":  ["item_name"],
  "confidence":     95.0,
  "successRate":    98.5,
  "mappingStrategy": "EXACT",
  "category":       "PRODUCT",
  "isRequired":     true,
  "isActive":       true
}
```

`mappingStrategy` values: `EXACT`, `SEMANTIC`, `SIMILARITY`, `PATTERN`, `CUSTOM`

---

## POST `/adaptive-pattern-matching/analyze`

Runs the full 5-tier matching analysis and returns field mappings + JOLT spec. This is the primary endpoint used by Step 3.

**Request body:** `AdaptivePatternMatchingRequest`
```json
{
  "sourceSchema": {
    "properties": {
      "name":  { "type": "string" },
      "price": { "type": "number" },
      "sku":   { "type": "string" },
      "brand": { "type": "string" }
    }
  },
  "targetSchema": {
    "properties": {
      "title":  { "type": "string" },
      "price":  { "type": "string" },
      "sku":    { "type": "string" },
      "vendor": { "type": "string" }
    }
  },
  "channelId":                "shopify",
  "categoryId":               "clothing",
  "organizationId":           null,
  "confidenceThreshold":      70.0,
  "autoApprove":              false,
  "forceReanalyze":           false,
  "persistJolt":              true,
  "persistConfidenceThreshold": 80.0
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `categoryId` | `"default"` | Product category for category-aware JOLT lookup. Omit for products without a specific category |
| `organizationId` | `null` | Null = use system default JOLT |
| `confidenceThreshold` | `70.0` | Minimum confidence for a mapping to be included |
| `autoApprove` | `false` | Auto-approve all mappings above threshold |
| `forceReanalyze` | `false` | Force regeneration even if a valid stored JOLT exists |
| `persistJolt` | `false` | Save generated JOLT to `channel_jolt_specs` collection |
| `persistConfidenceThreshold` | `80.0` | Minimum overall confidence required to persist |

**Response:** `AdaptivePatternMatchingResponse`
```json
{
  "joltSpec": [
    {
      "operation": "shift",
      "spec": {
        "name":  "product.title",
        "price": "product.variants[0].price",
        "sku":   "product.variants[0].sku"
      }
    }
  ],
  "fieldMappings": [
    {
      "sourcePath":         "name",
      "targetPath":         "product.title",
      "sourceFieldName":    "name",
      "targetFieldName":    "title",
      "sourceSemanticType": "PRODUCT_NAME",
      "targetSemanticType": "PRODUCT_NAME",
      "matchStrategy":      "CHANNEL_SPECIFIC",
      "confidence":         95.0,
      "sourceType":         "string",
      "targetType":         "string",
      "additionalContext":  {}
    },
    {
      "sourcePath":         "brand",
      "targetPath":         "product.vendor",
      "sourceFieldName":    "brand",
      "targetFieldName":    "vendor",
      "matchStrategy":      "SEMANTIC_KNOWLEDGE",
      "confidence":         88.5,
      "sourceType":         "string",
      "targetType":         "string"
    }
  ],
  "overallConfidence":  92.0,
  "status":             "EXCELLENT",
  "message":            null,
  "unmappedSourceFields": [],
  "unmappedTargetFields": ["vendor"],
  "postProcessingHandledFields": ["images"],
  "matchingMetadata": {
    "totalSourceFields":    4,
    "totalTargetFields":    4,
    "matchedFields":        3,
    "unmatchedSourceFields": 0,
    "unmatchedTargetFields": 1,
    "processingTimeMs":     1247,
    "matchStrategyCount": {
      "CHANNEL_SPECIFIC":   2,
      "SEMANTIC_KNOWLEDGE": 1
    },
    "warnings": ["JOLT spec persisted to channel_jolt_specs (confidence: 92.0%)"]
  }
}
```

**Fast-path response** (when stored JOLT is reused):
```json
{
  "joltSpec":          [...],
  "fieldMappings":     [],
  "overallConfidence": 92.0,
  "status":            "EXCELLENT",
  "message":           "Using stored JOLT spec (category: clothing, version: v1.0, confidence: 92.0%). Set forceReanalyze=true to regenerate.",
  "matchingMetadata": {
    "warnings": ["Using stored JOLT spec - field analysis skipped"]
  }
}
```

`status` values: `EXCELLENT` (≥90%), `GOOD` (≥70%), `POOR` (<70%), `ERROR`

`matchStrategy` values: `CHANNEL_SPECIFIC`, `SEMANTIC_KNOWLEDGE`, `ALIAS_MAPPING`, `PATTERN_MAPPING`, `KEYWORD_SIMILARITY`

Returns `400 Bad Request` if `status = "ERROR"`.

---

## POST `/adaptive-pattern-matching/generate-jolt`

Same as `/analyze`. Alias for JOLT generation use case. No behavior difference.

**Request/Response:** Same as `/analyze`.

---

## POST `/adaptive-pattern-matching/quick-match`

Same as `/analyze` but enforces a minimum `confidenceThreshold` of 80.0. If the request provides a lower threshold, it is silently raised to 80.0.

---

## POST `/adaptive-pattern-matching/auto-approve`

Sets `confidenceThreshold = 90.0` and `autoApprove = true` regardless of what the request provides. Intended for automated pipelines where only very high-confidence mappings should proceed.

---

## GET `/adaptive-pattern-matching/health`

Returns `"Adaptive Pattern Matching Service is running"` as a plain string.

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/services/pattern-matching.service.ts

interface AdaptivePatternMatchingRequest {
  sourceSchema:               Record<string, unknown>;
  targetSchema:               Record<string, unknown>;
  channelId:                  string;
  categoryId?:                string;   // default: "default"
  organizationId?:            string;
  confidenceThreshold?:       number;   // default: 70.0
  autoApprove?:               boolean;  // default: false
  forceReanalyze?:            boolean;  // default: false
  persistJolt?:               boolean;  // default: false
  persistConfidenceThreshold?: number;  // default: 80.0
}

interface FieldMapping {
  sourcePath:          string;
  targetPath:          string;
  sourceFieldName:     string;
  targetFieldName:     string;
  sourceSemanticType?: string;
  targetSemanticType?: string;
  matchStrategy:       MatchStrategy;
  confidence:          number;
  sourceType?:         string;
  targetType?:         string;
  additionalContext?:  Record<string, unknown>;
}

type MatchStrategy =
  | 'CHANNEL_SPECIFIC'
  | 'SEMANTIC_KNOWLEDGE'
  | 'ALIAS_MAPPING'
  | 'PATTERN_MAPPING'
  | 'KEYWORD_SIMILARITY';

interface MatchingMetadata {
  totalSourceFields:    number;
  totalTargetFields:    number;
  matchedFields:        number;
  unmatchedSourceFields: number;
  unmatchedTargetFields: number;
  processingTimeMs:     number;
  matchStrategyCount:   Record<MatchStrategy, number>;
  warnings:             string[];
}

interface AdaptivePatternMatchingResponse {
  joltSpec:                    unknown[];
  fieldMappings:               FieldMapping[];
  overallConfidence:           number;
  status:                      'EXCELLENT' | 'GOOD' | 'POOR' | 'ERROR';
  message?:                    string;
  unmappedSourceFields:        string[];
  unmappedTargetFields:        string[];
  postProcessingHandledFields: string[];
  matchingMetadata:            MatchingMetadata;
}
```
