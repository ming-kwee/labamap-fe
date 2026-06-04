# P0 — APM Knowledge Management Admin APIs

Three collections that directly control APM (Adaptive Pattern Matching) quality are currently managed exclusively via code and deployments. Each one is a bottleneck: a wrong mapping, a missing semantic type, or a changed merchant API endpoint requires a PR, review, and deployment to fix.

| # | Collection | Status |
|---|---|---|
| 1 | `channel_field_mappings` | **✅ Implemented** (2026-06-04) |
| 2 | `field_semantic_knowledge` | **✅ Implemented** (2026-06-04) |
| 3 | `merchant_api_operations` | Pending |

---

## 1. `channel_field_mappings` — APM Tier 1 Admin ✅

### Why This Is the Highest Priority

APM Tier 1 (CHANNEL_SPECIFIC) is the highest-confidence tier at ~95%. When a Tier 1 mapping is wrong, every publish for that channel uses the wrong transformation — systematically. This has already happened in this codebase: `name → product.options[0].name` (wrong) instead of `name → product.title` (correct). The fix required writing `ChannelFieldMappingOverridesMigration`, merging it, and deploying.

With an admin API, an operator fixes it in 30 seconds via `PUT /{id}`.

### Collection Structure

```
channel_field_mappings
  ├── channelId           String     — "shopify", "amazon", etc.
  ├── sourceField         String     — master product field name
  ├── sourceAliases       List       — alternative source field names
  ├── targetField         String     — channel API field path
  ├── targetAliases       List       — alternative target paths
  ├── confidence          Double     — 0–100; Tier 1 entries are typically 95–99
  ├── mappingStrategy     String     — EXACT_OVERRIDE | EXACT | SEMANTIC | EXCLUDE | EXCLUDE_SOURCE
  ├── isRequired          Boolean    — always included in generated JOLT
  ├── isActive            Boolean    — soft delete
  ├── successRate         Double     — learned from publish history
  ├── usageCount          Long       — learned from publish history
  ├── description         String
  ├── createdAt           LocalDateTime
  └── updatedAt           LocalDateTime
```

### Key Strategies

| Strategy | Meaning | Use case |
|---|---|---|
| `EXACT_OVERRIDE` | Highest priority, bypasses semantic matching | Fix a wrong learned mapping |
| `EXACT` | Direct verified mapping | Known correct pair |
| `EXCLUDE` | Remove target field from matching candidates | Channel-only field with no master equivalent |
| `EXCLUDE_SOURCE` | Remove source field from matching | Field that should never be auto-matched |
| `REQUIRED` | Always inject into JOLT even without source match | Critical fields like `status`, `category` |

### Operational Use Cases

**Fix a wrong mapping:**
```
GET /admin/channel-field-mappings?channelId=shopify&sourceField=name
→ find the wrong mapping (name → product.options[0].name)
PUT /{id}  { "targetField": "product.title", "mappingStrategy": "EXACT_OVERRIDE" }
```

**Add an explicit mapping for a new channel:**
```
POST /admin/channel-field-mappings
{
  "channelId": "lazada",
  "sourceField": "brand",
  "targetField": "Attributes.brand",
  "confidence": 99.0,
  "mappingStrategy": "EXACT_OVERRIDE",
  "isRequired": false
}
```

**Exclude a source field from APM matching:**
```
POST /admin/channel-field-mappings
{
  "channelId": "shopify",
  "sourceField": "internalNotes",
  "targetField": "__excluded__",
  "mappingStrategy": "EXCLUDE_SOURCE",
  "description": "Internal field, never publish to any channel"
}
```

### Side Effects

- When a mapping is created or updated, `channel_jolt_specs` for that channel should be invalidated (force regeneration on next analyse) — same pattern as `ChannelCategoryApiSchemaAdminController.invalidateJoltSpecs()`.
- The `successRate` and `usageCount` fields are learned automatically from publish history and should not be manually editable to preserve integrity.

### Repository: `ChannelFieldMappingRepository`

Already has rich query support: filter by channelId, sourceField, targetField, strategy, confidence, successRate, usageCount, regex patterns, isRequired, isActive, lastUsedAt. No new repository methods needed.

---

## 2. `field_semantic_knowledge` — APM Knowledge Base Admin

### Why This Matters

`field_semantic_knowledge` is the brain of APM Tier 2 (SEMANTIC_KNOWLEDGE), Tier 3 (ALIAS_MAPPING), and Tier 4 (PATTERN_MAPPING). It defines what semantic type a field name belongs to (e.g., `material` → `MATERIAL_TYPE`), what aliases it has, what keywords it contains, and what regex patterns identify it.

Currently seeded from JSON files in `src/main/resources/adaptivepattern/` and re-applied only on deployment. When a new product attribute type is introduced (e.g., sustainability certifications, digital product licenses), APM is completely blind to it until the JSON is updated and the app is redeployed.

### Collection Structure

```
field_semantic_knowledge
  ├── fieldName           String     — primary identifier (unique)
  ├── semanticType        String     — e.g., "PRODUCT_NAME", "PRICE", "MATERIAL_TYPE"
  ├── category            String     — e.g., "product", "variant", "media"
  ├── dataType            String     — "string", "number", "boolean", "array"
  ├── baseConfidence      Double     — starting confidence for Tier 2 matches
  ├── aliases             List       — alternative names for this field
  ├── keywords            List       — keywords used in Tier 5 (Jaccard similarity)
  ├── commonPatterns      List       — regex patterns for Tier 4 matching
  ├── validChannels       List       — channels where this field applies; empty = all
  ├── isCommon            Boolean    — true = applies across most product types
  ├── isRequired          Boolean    — true = must be mapped in every JOLT spec
  ├── isActive            Boolean    — soft delete
  ├── description         String
  ├── createdAt           LocalDateTime
  └── updatedAt           LocalDateTime
```

### Key Operations

**Add a new semantic type for a product attribute category:**
```json
POST /admin/field-semantic-knowledge
{
  "fieldName": "sustainability_cert",
  "semanticType": "SUSTAINABILITY",
  "category": "product",
  "dataType": "string",
  "baseConfidence": 90.0,
  "aliases": ["eco_cert", "green_cert", "sustainability_label"],
  "keywords": ["sustainability", "eco", "green", "certified", "organic"],
  "commonPatterns": [".*sustain.*", ".*eco.*cert.*"],
  "isCommon": false,
  "isRequired": false
}
```

**Extend aliases for an existing type to improve matching:**
```
GET /admin/field-semantic-knowledge?semanticType=MATERIAL_TYPE
PUT /{id}  { "aliases": ["material", "fabric", "material_type", "cloth_type", "tejido"] }
```

**Boost confidence for a channel-specific field:**
```
PUT /{id}  { "baseConfidence": 95.0, "validChannels": ["amazon", "ebay"] }
```

### Impact on APM

Every change to this collection takes effect on the **next APM analysis request** — no restart, no deployment. The service reads from MongoDB reactively. Existing JOLT specs are not automatically invalidated (unlike schema extensions), because semantic knowledge changes affect matching quality, not target schema structure. Merchants re-analyse to benefit from improved semantic mappings.

### Repository: `FieldSemanticKnowledgeRepository`

Supports: findByFieldName, findBySemanticType, findByCategory, findByAliasesIn, findByKeywordsIn, findByBaseConfidenceGreaterThanEqual, findByIsActive, findByValidChannelsContaining. No new repository methods needed.

---

## 3. `merchant_api_operations` — Merchant Data Source Admin

### Why This Matters

`MerchantApiOperationDataLoader` seeds 8 operations for 5 channels (TikTok warehouses, Lazada categories, Shopify locations, eBay shipping, Shopee brands, Amazon marketplaces). Every new data source — a new warehouse API, a new brand lookup, a new carrier list — requires: add Java entry → code review → merge → deploy.

This is the same problem that `channel_category_api_schemas` solved: platform data that is purely configuration, has no business logic, and should be managed at runtime.

### Collection Structure

```
merchant_api_operations
  ├── channelType         String     — "shopify", "amazon", etc.
  ├── operationName       String     — e.g., "GetWarehouses", "GetBrands"
  ├── baseUrl             String     — supports {storeId} placeholder
  ├── urlPath             String     — path appended to baseUrl
  ├── authStrategy        String     — BEARER_TOKEN | API_KEY_HEADER | API_KEY_QUERY | NO_AUTH
  ├── authCredentialKey   String     — key in store credentials to use for auth
  ├── fixedQueryParams    Map        — always-included query params
  ├── credentialQueryParams Map      — params sourced from store credentials
  ├── itemsJsonPath       String     — dot-notation path to items array in response
  ├── valueField          String     — field in each item to use as option value
  ├── labelField          String     — field in each item to use as option label
  ├── enabled             Boolean    — soft disable without delete
  ├── description         String
  └── updatedAt           LocalDateTime
```

### Operational Use Cases

**Add a new warehouse API for a new channel (e.g., Walmart):**
```json
POST /admin/merchant-api-operations
{
  "channelType": "walmart",
  "operationName": "GetFulfillmentCenters",
  "baseUrl": "https://marketplace.walmartapis.com",
  "urlPath": "/v3/fulfillment/centers",
  "authStrategy": "API_KEY_HEADER",
  "authCredentialKey": "clientId",
  "itemsJsonPath": "fulfillmentCenters",
  "valueField": "centerId",
  "labelField": "centerName",
  "enabled": true,
  "description": "Walmart fulfillment center list for inventory allocation"
}
```

**Update a changed endpoint without deployment:**
```
GET /admin/merchant-api-operations?channelType=lazada&operationName=GetCategories
PUT /{id}  { "urlPath": "/api/v2/category/tree/get", "itemsJsonPath": "data.category_list" }
```

**Temporarily disable a broken data source:**
```
PUT /{id}/disable
→ returns 200; GenericMerchantDataService.fetchOptions() returns empty list gracefully
```

### How It Connects to the Form

When `EcommerceMasterAttributeDocument.optionsSource = MERCHANT_API` and `merchantApiOperation = "GetWarehouses"`, `ChannelStepSchemaService` calls `GenericMerchantDataService.fetchOptions(channelType, operationName, storeId, orgId)` which looks up the operation document by `(channelType, operationName)`. Adding or updating an operation document is immediately reflected in the Step 2 form schema — no restart needed.

### Repository: `MerchantApiOperationRepository`

Supports: findByChannelTypeAndOperationNameAndEnabledTrue, findByChannelTypeAndEnabledTrue. No new repository methods needed.
