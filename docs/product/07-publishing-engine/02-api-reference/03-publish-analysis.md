# API Reference — Publish Analysis

## Status: Service Complete, No Endpoint

`PublishAnalysisService` is fully implemented and runs the complete 7-stage pre-flight analysis of a product's publish readiness. However, **no controller endpoint currently exposes it**. `POST /channels/publish/analyze` does not exist yet.

To expose it, wire `PublishAnalysisService` into `ChannelPublishController` and add a `@PostMapping("/analyze")` handler.

---

## Planned Endpoint

```
POST /labamap/api/v1/channels/publish/analyze
```

**Request body:**

```json
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-us-store",
  "organizationId":  "org_123",
  "categoryId":      "electronics"
}
```

---

## Response: `PublishAnalysisResponse`

### Identity Fields

```json
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-us-store",
  "channelType":     "shopify",
  "categoryId":      "electronics",
  "organizationId":  "org_123",
  "analyzedAt":      "2026-04-30T10:00:00"
}
```

### Overall Result

```json
{
  "readyToPublish": true,
  "readinessScore": 87
}
```

`readinessScore` starts at 100:
- `-30` if master product not found
- `-10` per `ERROR`-severity issue
- `-5` per `WARNING`-severity issue

### Stage 1: masterProduct

```json
{
  "masterProduct": {
    "source":      "mongodb",
    "found":       true,
    "fieldCount":  12,
    "fields":      ["name", "price", "sku", "brand", ...],
    "hasVariants": true,
    "variantCount": 3
  }
}
```

`source` values: `"mongodb"`, `"external_service"`, `"request"`, `"not_found"`.

### Stage 2: channelData (Step 2)

```json
{
  "channelData": {
    "step2DataFound":          true,
    "completionPercentage":    85,
    "filledRequiredFields":    ["vendor", "product_type"],
    "missingRequiredFields":   ["tags"],
    "filledRecommendedFields": ["body_html", "status"],
    "channelFieldCount":       7
  }
}
```

### Stage 3: mergedData

```json
{
  "mergedData": {
    "fieldCount": 18,
    "fields":     ["name", "price", "sku", "vendor", "product_type", ...],
    "note":       "masterOverrides and channelData merged onto masterProductData"
  }
}
```

### Stage 4: adaptiveMapping

```json
{
  "adaptiveMapping": {
    "overallConfidence": 92.0,
    "status":            "SUCCESS",
    "message":           null,
    "totalMappings":     10,
    "unmappedSourceFields": [],
    "unmappedTargetFields": ["weight"],
    "postProcessingHandledFields": ["images"],
    "strategyBreakdown": {
      "CHANNEL_SPECIFIC": 6,
      "SEMANTIC_KNOWLEDGE": 3,
      "ALIAS_MAPPING": 1
    },
    "processingTimeMs": 1247
  }
}
```

`adaptiveMapping.status` values: `"SUCCESS"`, `"WARNING"`, `"ERROR"`.

### Stage 5: joltSpec

```json
{
  "joltSpec": {
    "found":          true,
    "source":         "channel_jolt_specs",
    "categoryId":     "electronics",
    "version":        "v1.2",
    "operationCount": 3,
    "confidence":     null
  }
}
```

`source` values: `"adaptive_pattern_matching"`, `"channel_jolt_specs"`, `"request"`, `"not_found"`.  
`confidence` is null when the spec was loaded from `channel_jolt_specs` (confidence is stored in the collection document but not re-evaluated here).

### Stage 6: transformation

```json
{
  "transformation": {
    "success":           true,
    "errorMessage":      null,
    "inputFieldCount":   18,
    "outputFieldCount":  11,
    "outputTopLevelKeys": ["product"],
    "unmappedInputFields": ["internalNotes"],
    "transformedData":   { "product": { "title": "Wireless Earbuds Pro", ... } }
  }
}
```

### Stage 7: postProcessing

```json
{
  "postProcessing": {
    "ruleCount": 2,
    "rules": [
      {
        "name":           "images_to_src",
        "priority":       10,
        "enabled":        true,
        "sourcePath":     "product.mainImage",
        "targetPath":     "product.images",
        "operationCount": 1
      }
    ]
  }
}
```

### Issues & Suggestions

```json
{
  "issues": [
    {
      "severity": "WARNING",
      "category": "CHANNEL_DATA",
      "field":    "tags",
      "message":  "Required field 'tags' not filled in Step 2"
    },
    {
      "severity": "INFO",
      "category": "TRANSFORMATION",
      "field":    "internalNotes",
      "message":  "Source field 'internalNotes' has no mapping and will be dropped"
    }
  ],
  "suggestions": [
    "Fill required channel fields in Step 2 before publishing",
    "Run /analyze with persistJolt=true to save the JOLT spec for faster future publishes"
  ],
  "joltPersisted": false
}
```

`issues[].severity` values: `"ERROR"`, `"WARNING"`, `"INFO"`.  
`issues[].category` values: `"PRODUCT_DATA"`, `"CHANNEL_DATA"`, `"JOLT_SPEC"`, `"TRANSFORMATION"`.

---

## Full Response Example

```json
{
  "masterProductId": "prod_abc123",
  "storeId":         "shopify-us-store",
  "channelType":     "shopify",
  "categoryId":      "electronics",
  "organizationId":  "org_123",
  "analyzedAt":      "2026-04-30T10:00:00",

  "readyToPublish":  true,
  "readinessScore":  87,

  "masterProduct": {
    "source": "mongodb", "found": true, "fieldCount": 12,
    "hasVariants": true, "variantCount": 3
  },

  "channelData": {
    "step2DataFound": true, "completionPercentage": 85,
    "filledRequiredFields": ["vendor", "product_type"],
    "missingRequiredFields": ["tags"]
  },

  "mergedData": { "fieldCount": 18 },

  "adaptiveMapping": {
    "overallConfidence": 92.0, "status": "SUCCESS",
    "totalMappings": 10, "processingTimeMs": 1247
  },

  "joltSpec": {
    "found": true, "source": "channel_jolt_specs",
    "version": "v1.2", "operationCount": 3
  },

  "transformation": {
    "success": true, "outputFieldCount": 11,
    "outputTopLevelKeys": ["product"]
  },

  "postProcessing": { "ruleCount": 2 },

  "issues": [
    { "severity": "WARNING", "category": "CHANNEL_DATA", "field": "tags",
      "message": "Required field 'tags' not filled in Step 2" }
  ],
  "suggestions": [],
  "joltPersisted": false
}
```

---

## TypeScript Types

```typescript
// src/modules/ecommerce-product-v2/step3-publish/types/analysis.ts

interface PublishAnalysisRequest {
  masterProductId: string;
  storeId?:        string;
  organizationId?: string;
  categoryId?:     string;
}

interface MasterProductInfo {
  source:       'mongodb' | 'external_service' | 'request' | 'not_found';
  found:        boolean;
  fieldCount:   number;
  fields?:      string[];
  hasVariants:  boolean;
  variantCount: number;
}

interface ChannelDataInfo {
  step2DataFound:          boolean;
  completionPercentage:    number;
  filledRequiredFields:    string[];
  missingRequiredFields:   string[];
  filledRecommendedFields?: string[];
  channelFieldCount:       number;
}

interface MergedDataInfo {
  fieldCount: number;
  fields?:    string[];
  note?:      string;
}

interface AdaptiveMappingInfo {
  overallConfidence:           number;
  status:                      'SUCCESS' | 'WARNING' | 'ERROR';
  message?:                    string;
  totalMappings:               number;
  unmappedSourceFields:        string[];
  unmappedTargetFields:        string[];
  postProcessingHandledFields: string[];
  strategyBreakdown:           Record<string, number>;
  processingTimeMs:            number;
}

interface JoltSpecInfo {
  found:          boolean;
  source:         'adaptive_pattern_matching' | 'channel_jolt_specs' | 'request' | 'not_found';
  categoryId?:    string;
  version?:       string;
  operationCount?: number;
  confidence?:    number;
}

interface TransformationInfo {
  success:           boolean;
  errorMessage?:     string;
  inputFieldCount:   number;
  outputFieldCount:  number;
  outputTopLevelKeys: string[];
  unmappedInputFields: string[];
  transformedData?:  Record<string, unknown>;
}

interface RuleInfo {
  name:           string;
  priority:       number;
  enabled:        boolean;
  sourcePath?:    string;
  targetPath?:    string;
  operationCount: number;
}

interface PostProcessingInfo {
  ruleCount: number;
  rules?:    RuleInfo[];
}

interface AnalysisIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  category: 'PRODUCT_DATA' | 'CHANNEL_DATA' | 'JOLT_SPEC' | 'TRANSFORMATION';
  field?:   string;
  message:  string;
}

interface PublishAnalysisResponse {
  masterProductId: string;
  storeId?:        string;
  channelType:     string;
  categoryId?:     string;
  organizationId?: string;
  analyzedAt:      string;

  readyToPublish:  boolean;
  readinessScore:  number;

  masterProduct:   MasterProductInfo;
  channelData:     ChannelDataInfo;
  mergedData:      MergedDataInfo;
  adaptiveMapping: AdaptiveMappingInfo;
  joltSpec:        JoltSpecInfo;
  transformation:  TransformationInfo;
  postProcessing:  PostProcessingInfo;

  issues:          AnalysisIssue[];
  suggestions:     string[];
  joltPersisted:   boolean;
}
```
