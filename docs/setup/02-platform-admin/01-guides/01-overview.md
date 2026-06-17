# Platform Admin — Overview

This module defines the admin CRUD APIs that allow platform operators to manage core platform configuration at runtime — without code changes or deployments.

Module root: `com.labamap.labamapomnichannelbe4fe` (spread across `adaptivepattern`, `channel`, and `ecommerce` packages)

Base URL: `http://localhost:8888/labamap/api/v1/admin`

**Status: Fully Implemented** — All P0 and P1 items done (2026-06-04).

---

## Why Platform Admin APIs Matter

Every collection in the system falls into one of two management patterns:

| Pattern | Example | Change requires |
|---------|---------|-----------------|
| **Data-driven (runtime)** | `channel_category_api_schemas`, `channel_field_value_mappings` | Admin API call |
| **Code-driven (deployment)** | `channel_field_mappings`, `field_semantic_knowledge`, `merchant_api_operations` | Code change + PR + deploy |

The second pattern is a deployment bottleneck. When APM generates wrong field mappings, when a new product attribute type needs semantic knowledge, or when a channel changes their warehouse API endpoint — ops teams must wait for a developer and a deployment cycle instead of fixing the issue in minutes.

The six recommendations in this module convert the most operationally painful code-driven collections into data-driven ones, following the same proven pattern already used by `channel_category_api_schemas` and `channel_field_value_mappings`.

---

## Architecture

```
Platform Operator (internal tooling / Postman)
        │
        │  HTTPS  /api/v1/admin/*
        ▼
┌─────────────────────────────────────────────────────────┐
│                  Admin Controllers                       │
│                                                          │
│  ChannelFieldMappingAdminController    (P0)             │
│  FieldSemanticKnowledgeAdminController (P0)             │
│  MerchantApiOperationAdminController   (P0)             │
│  ChannelJoltSpecAdminController        (P1)             │
│  ChannelConfigurationAdminController   (P1)             │
│  ChannelCategoryApiConfigAdminController (P1)           │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼  direct repository access (no service layer needed)
┌─────────────────────────────────────────────────────────┐
│                  MongoDB Collections                     │
│                                                          │
│  channel_field_mappings          (APM Tier 1)           │
│  field_semantic_knowledge        (APM knowledge base)   │
│  merchant_api_operations         (merchant data sources)│
│  channel_jolt_specs              (JOLT transformation)  │
│  channel_configurations          (channel config)       │
│  channel_category_api_config     (category tree APIs)   │
└─────────────────────────────────────────────────────────┘
```

---

## Recommended Admin APIs

### 🔴 P0 — Critical (directly impacts publish quality)

| # | Collection | Controller | Endpoint Prefix | Status |
|---|---|---|---|---|
| 1 | `channel_field_mappings` | `ChannelFieldMappingAdminController` | `/admin/channel-field-mappings` | **✅ Implemented** |
| 2 | `field_semantic_knowledge` | `FieldSemanticKnowledgeAdminController` | `/admin/field-semantic-knowledge` | **✅ Implemented** |
| 3 | `merchant_api_operations` | `MerchantApiOperationAdminController` | `/admin/merchant-api-operations` | **✅ Implemented** |

### 🟡 P1 — Important (operational agility)

| # | Collection | Controller | Endpoint Prefix | Status |
|---|---|---|---|---|
| 4 | `channel_jolt_specs` | `ChannelJoltSpecAdminController` | `/admin/channel-jolt-specs` | **✅ Implemented** |
| 5 | `channel_configurations` | `ChannelConfigurationAdminController` | `/admin/channel-configurations` | **✅ Implemented** |
| 6 | `channel_category_api_config` | `ChannelCategoryApiConfigAdminController` | `/admin/channel-category-api-configs` | **✅ Implemented** |

---

## What Already Has Admin CRUD (Reference)

| Collection | Controller | Path |
|---|---|---|
| `channel_category_api_schemas` | `ChannelCategoryApiSchemaAdminController` | `/admin/channel-category-schemas` |
| `channel_category_mappings` | `ChannelCategoryMappingAdminController` | `/admin/channel-category-mappings` |
| `channel_field_value_mappings` | `ChannelMappingAdminController` | `/admin/channel-mappings` |
| `ecommerce_master_attributes` | `MasterAttributeAdminController` | `/admin/master-attributes` |
| ~~`platform_category_templates`~~ | ~~`PlatformCategoryTemplateAdminController`~~ | ~~`/admin/platform-category-templates`~~ — **DIHAPUS 2026-06-17**, frontend removed, DataLoader no-op, backend cleanup di `15-platform-admin-components-cleanup.md` |
| ~~`product_categories`~~ | ~~`ProductCategoryAdminController`~~ | ~~`/admin/product-categories`~~ — **DIHAPUS 2026-06-16**, migrated to tags + ProductType, lihat `14-product-categories-migration-backend.md` |
| `product_types` | `ProductTypeAdminController` | `/admin/product-types` |

---

## Implementation Pattern

All six recommendations follow the same established pattern:

```java
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/<resource>")
@RequiredArgsConstructor
public class <Resource>AdminController {

    private final <Resource>Repository repository;

    @GetMapping                         // list with optional filters
    @GetMapping("/{id}")                // get by id
    @PostMapping                        // create
    @PutMapping("/{id}")                // update specific fields
    @PutMapping("/{id}/deactivate")     // soft delete
    @ResponseStatus(HttpStatus.CREATED) // on POST
}
```

No service layer needed — admin controllers talk directly to the repository. Business logic (validation, side effects like JOLT invalidation) lives in the controller helper methods.

---

## Document Index

| Document | Content |
|---|---|
| `02-p0-apm-knowledge-management.md` | Detailed guide — P0 items (channel_field_mappings, field_semantic_knowledge, merchant_api_operations) |
| `03-p1-channel-config-management.md` | Detailed guide — P1 items (channel_jolt_specs, channel_configurations, channel_category_api_config) |
| `../02-api-reference/01-channel-field-mappings.md` | API reference — channel_field_mappings |
| `../02-api-reference/02-field-semantic-knowledge.md` | API reference — field_semantic_knowledge |
| `../02-api-reference/03-merchant-api-operations.md` | API reference — merchant_api_operations |
| `../02-api-reference/04-channel-jolt-specs.md` | API reference — channel_jolt_specs |
| `../02-api-reference/05-channel-configurations.md` | API reference — channel_configurations |
| `../02-api-reference/06-channel-category-api-config.md` | API reference — channel_category_api_config |
