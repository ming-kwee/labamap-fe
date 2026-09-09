# P1 — Channel Config Management Admin APIs

Three collections that configure the channel integration layer are currently managed exclusively via code and deployments. While not as immediately critical as the P0 items, they represent significant operational friction when channels update their APIs, when JOLT tuning is needed, or when field boost adjustments are required.

---

## 4. `channel_jolt_specs` — JOLT Spec Admin

### Why This Matters

JOLT specs are the transformation heart of the publish pipeline. APM auto-generates them, but:

1. **No visibility** — there is no API to see what JOLT spec is currently active for a given channel/category/org combination. Debugging a publish failure that produces wrong output requires querying MongoDB directly.
2. **No manual curation** — when APM generates a suboptimal spec (e.g., wrong array index, missing field), the only option is re-running analyse. There is no way to manually edit the spec and protect it from future APM overwrite.
3. **`isManuallyConfigured` field exists but is never set** — the `ChannelJoltSpec` entity has `isManuallyConfigured: Boolean` in `JoltMetadata` but there is no API to set it. APM always overwrites specs regardless.
4. **Bulk delete exists, targeted delete does not** — `deleteByChannelId` exists for bulk cleanup but you cannot delete a single spec without MongoDB Compass.

### Collection Structure

```
channel_jolt_specs
  ├── channelId           String     — "shopify", "amazon", etc.
  ├── categoryId          String     — "clothing", "electronics", "default"
  ├── organizationId      String     — null = system default
  ├── isSystemDefault     Boolean
  ├── joltSpec            List       — array of JOLT operation objects
  ├── isActive            Boolean
  ├── joltMetadata
  │     ├── version                String
  │     ├── mappingCount           Integer
  │     ├── isManuallyConfigured   Boolean  ← never set via API currently
  │     ├── generatedAt            LocalDateTime
  │     ├── generatedBy            String
  │     └── strategyBreakdown      Map
  ├── createdAt           LocalDateTime
  └── updatedAt           LocalDateTime
```

### Operational Use Cases

**View active spec for debugging a publish failure:**
```
GET /admin/channel-jolt-specs?channelId=shopify&categoryId=clothing&organizationId=org_123
→ Returns the spec being used; compare against expected transformation
```

**Manually correct a spec and protect from APM overwrite:**
```
PUT /{id}
{
  "joltSpec": [...corrected operations...],
  "markAsManuallyConfigured": true
}
→ Sets joltMetadata.isManuallyConfigured = true
→ AdaptivePatternMatchingCommandImpl skips overwrite when isManuallyConfigured = true
```

**Force regeneration by deleting a stale spec:**
```
DELETE /{id}
→ Next publish/analyse generates a fresh spec
```

**Bulk clear all specs for a channel (after major channel API update):**
```
DELETE /admin/channel-jolt-specs?channelId=amazon
→ Wraps existing deleteByChannelId repository method
```

### Required Code Change in APM

For `isManuallyConfigured` protection to work, `AdaptivePatternMatchingCommandImpl.saveOrUpdateJoltSpec()` needs one guard:

```java
// Before overwriting an existing spec, check if it's manually configured
.flatMap(existing -> {
    if (Boolean.TRUE.equals(existing.getJoltMetadata() != null
            ? existing.getJoltMetadata().getIsManuallyConfigured() : false)) {
        log.info("Skipping JOLT overwrite — spec is manually configured: {}/{}/{}",
                channelId, categoryId, organizationId);
        return Mono.just(existing);
    }
    // proceed with overwrite
    ...
})
```

This is a small, isolated change with no risk to the auto-generation path.

---

## 5. `channel_configurations` — Channel Configuration Admin

### Why This Matters

`ChannelConfiguration` is the control plane for every channel. It holds:
- `fieldBoosts` — confidence adjustments for field matching
- `postProcessingRules` — rules that enrich the JOLT output via `operations[]` (e.g. FOR_EACH, CONCAT_INTO, EXTRACT_DIMENSIONS, WRAP_ARRAY_TO_OBJECTS)
- `categoryRequirements` — per-category required/recommended fields for Shopify/WIX/eBay
- `apiWrapperConfig` — how the JOLT output is wrapped before sending to the channel
- `apiSchema` — base target schema for APM

All of this is currently seeded by `ChannelConfigurationDataLoader` and various migrations. Any tuning requires a deployment.

### Recommended Scope: Targeted Updates Only

A full CRUD for `ChannelConfiguration` is risky — a bad update to `apiWrapperConfig` could break every publish for that channel. The admin API should expose **targeted field-level updates** for the safe-to-change sub-structures, not a full document replace.

### Operational Use Cases

**Read all channel configurations (ops/debugging):**
```
GET /admin/channel-configurations
GET /admin/channel-configurations/{channelId}
→ Returns config without sensitive credential schemas
```

**Add a category-level field boost without deployment:**
```
PUT /admin/channel-configurations/{channelId}/field-boosts
{
  "action": "add",
  "boost": {
    "sourcePattern": "barcode",
    "targetPattern": ".*upc.*",
    "confidenceBoost": 12.0,
    "reason": "Walmart UPC field naming",
    "condition": null
  }
}
```

**Remove a misconfigured boost:**
```
PUT /admin/channel-configurations/{channelId}/field-boosts
{
  "action": "remove",
  "sourcePattern": "barcode",
  "targetPattern": "product_id"
}
```

**Update a post-processing rule (e.g., fix image enrichment path):**
```
PUT /admin/channel-configurations/{channelId}/post-processing-rules
{
  "action": "upsert",
  "rule": {
    "name": "enrich-images",
    "sourcePath": "product.images",
    "targetPath": "product.images",
    "operations": [
      { "op": "FOR_EACH", "steps": [
        { "op": "STRING_TO_OBJECT", "keyField": "src" },
        { "op": "SET_DEFAULT", "field": "alt", "value": "" }
      ] }
    ]
  }
}
```

### What Should NOT Be Editable via Admin API

| Field | Reason |
|---|---|
| `apiSchema` | Managed by `ChannelCategoryApiSchemaAdminController` (category extensions) and code (base schema) |
| `apiWrapperConfig` | A wrong rootKey breaks every publish; requires code review |
| `integrationConfig` / `authenticationConfig` | Contains credential schemas and auth flows |
| `oauthConfig` | OAuth endpoints and scopes; changes require app re-authorization |

---

## 6. `channel_category_api_config` — Category API Config Admin

### Why This Matters

`ChannelCategoryApiConfig` controls how the platform fetches category trees and searches categories per channel. It is seeded by `CategoryApiConfigDataLoader` and never changes at runtime. But channels do update their APIs:

- Shopify migrated from REST to GraphQL for taxonomy
- TikTok Shop changes their category API version periodically
- New channels (Shopee, Lazada variants) need onboarding without deployment

### Collection Structure

```
channel_category_api_config
  ├── channelType             String
  ├── treeApiConfig
  │     ├── endpoint          String     — URL template for category tree
  │     ├── searchEndpoint    String     — URL template for category search
  │     ├── authStrategy      String     — BEARER_TOKEN | API_KEY_HEADER | NO_AUTH
  │     ├── authCredentialKey String
  │     ├── fullTreeStrategy  String     — SINGLE_REQUEST | PAGINATED | RECURSIVE
  │     └── treeStructure     String     — FLAT | HIERARCHICAL | NESTED
  ├── attributeApiConfig
  │     ├── endpoint          String     — URL template for category attributes
  │     ├── authStrategy      String
  │     └── lookupConfig      Object     — how to find attributes by categoryId
  ├── taxonomyConfig          Object     — for GraphQL-based taxonomy (Shopify)
  └── importWizardConfig      Object     — batch import configuration
```

### Operational Use Cases

**Update Shopify's category search endpoint after an API migration:**
```
GET /admin/channel-category-api-configs?channelType=shopify
PUT /{id}/tree-api
{
  "searchEndpoint": "/merchant-data/shopify/{storeId}/categories/search/v2"
}
```

**Onboard a new channel's category API:**
```
POST /admin/channel-category-api-configs
{
  "channelType": "shopee_sg",
  "treeApiConfig": {
    "endpoint": "https://partner.shopeemobile.com/api/v2/product/get_category",
    "authStrategy": "API_KEY_QUERY",
    "authCredentialKey": "partnerKey",
    "fullTreeStrategy": "SINGLE_REQUEST",
    "treeStructure": "HIERARCHICAL"
  }
}
```

**Disable category tree sync for a channel under maintenance:**
```
PUT /{id}/disable
→ CategorySyncJob skips this channel until re-enabled
```

### Scope Note

Only `treeApiConfig` and `attributeApiConfig` endpoint/auth fields should be editable. The `importWizardConfig` involves complex import orchestration that should remain code-managed.
