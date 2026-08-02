# Documentation Index

Each top-level folder covers one documentation domain. Folders are numbered in learning order.

```
docs/
  product/
    01-catalog-schema/             ← Category, ProductType, MasterAttribute, Channel Mapping, Form Schema, Variants
    02-ecommerce-wizard/           ← 3-step product creation wizard: Step 1 (create), Step 2 (channel fields), Step 3 (publish)
    03-business-rules/             ← Server-side rules engine: validation, transformation, enhancement rules admin
    04-conditional-logic/          ← Client-side form behaviour: show/hide/require fields based on other field values
    06-adaptive-pattern-matching/  ← APM: 5-tier field matching cascade, JOLT spec generation and persistence
    07-publishing-engine/          ← Publish pipeline, JOLT transform, post-processing engine, sync API
  setup/
    01-channel-connect/            ← Marketplace store connections: OAuth, credential encryption, token refresh
```

---

## 01-catalog-schema

The catalog schema system: how categories, product types, attributes, and channel mappings connect.

### 01-guides/ — Concepts and codebase (everyone reads this)

Read in numbered order — each topic builds on the previous.

| File | What you learn |
|------|---------------|
| `01-system-overview.md` | Two actors (merchant vs platform), five phases, architecture, golden rules |
| `02-product-categories.md` | Tree structure, materialized paths, ProductType assignment, channelSyncSummary |
| `03-product-types.md` | Why ProductType exists, variant dimensions, resolution chain, stability contract |
| `04-master-attributes.md` | Dual-mode filter (Phase 4 vs Phase 1), displayLevel, variantScope |
| `05-channel-category-mapping.md` | Import wizard, push-out, drift detection, state machine, two channel types |
| `06-category-select-ui.md` | `fieldType:category-select` pattern, slug cache, Java enum normalisation |
| `07-form-schema.md` | Two-phase loading, unwrapSchema, productTypeId flow, cache key |
| `08-variant-options.md` | Three-step resolution chain, seeded dimensions, VariantConfigurator states |

### 02-api-reference/ — API contracts and data structures (backend engineers)

| File | What it covers |
|------|---------------|
| `01-product-categories.md` | Collection schema, indexes, all endpoints |
| `02-product-types.md` | Collection schema, variantDimensions field, all endpoints |
| `03-master-attributes.md` | Collection schema, fieldType values, all endpoints |
| `04-channel-category-mapping.md` | Collection schema, syncStatus state machine, all 9 endpoints |
| `05-form-schema.md` | generate + refresh + cache endpoints, FormField shape, FormSchemaResponse |
| `06-variant-options.md` | Two-endpoint composition, dimensionOptions Map, seeded options table |

---

## 02-ecommerce-wizard

The 3-step omnichannel product creation wizard: dynamic form (Step 1), per-channel field configuration (Step 2), and multi-store publish with pattern matching (Step 3).

Module root: `src/modules/ecommerce-product-v2/`

### 01-guides/ — Concepts and codebase (everyone reads this)

Read in numbered order — each file builds on the previous.

| File | What you learn |
|------|---------------|
| `01-module-overview.md` | 3-step flow, routes, module directory tree, sessionStorage data handoff |
| `02-step1-dynamic-form.md` | Schema lifecycle, 6 hooks, section organisation, FieldRenderer dispatch, conditional visibility |
| `03-step1-display-level.md` | 5 displayLevels, 3 ViewLevel tiers, filter implementation, visibility evaluation order |
| `04-step1-variant-configurator.md` | Dimension detection, cartesian product generation, dual-scope value migration, JSON persistence |
| `05-step1-media-upload.md` | Gallery vs per-variant image contexts, XHR progress upload, GCP storage layout |
| `06-step1-product-submission.md` | 4-stage pipeline, `generateMasterProduct` mapping, enhanced validation, `canSubmit` |
| `07-channel-stores.md` | Three data collections, ConnectStoreModal, credential schema, Shopify OAuth flow |
| `08-step2-channel-fields.md` | Schema generation, form state 3 buckets, autosave, 5 section types, completion tracking |
| `09-step2-channel-data-sources.md` | 11 data-sourcing scenarios, Phases 1–4 implementation, Phases 5–11 planned |
| `10-step3-publish.md` | Readiness analysis, adaptive pattern matching 5-tier cascade, publish pipeline, variant override bug |

### 02-api-reference/ — API contracts and data structures (backend engineers)

| File | What it covers |
|------|---------------|
| `01-step1-form-schema-and-product.md` | generate + validate + create endpoints, `FormField` shape, `MasterProduct` type, `BackendContext` |
| `02-step1-media-upload.md` | Upload endpoint, GCP storage layout, `MediaUploadService` contract, `galleryImages` requirement |
| `03-channel-stores.md` | `channel_store_connections` + `channel_configurations` collections, all store CRUD + OAuth endpoints |
| `04-step2-schema-and-channel-data.md` | `POST /form-schema/channel-step`, `ChannelFormField` shape, `channel_product_data` collection, Phase 1–3 backend requirements |
| `05-step3-publish-and-pattern-matching.md` | Publish single + batch + analyze, 8-step backend pipeline, adaptive mapping 5-tier, JOLT preview, all TypeScript types |

---

## 03-business-rules

Server-side rules stored in MongoDB, executed during product submission. Managed by platform admins at `/business-rules`.

Module root: `src/modules/ecommerce-business-rules/`

### 01-guides/

| File | What you learn |
|------|---------------|
| `01-overview.md` | 3 rule types (PRE_PROCESSING / BUSINESS_LOGIC / DATA_ENHANCEMENT), admin UI components, known disabled-rules backend limitation |

### 02-api-reference/

| File | What it covers |
|------|---------------|
| `01-business-rules.md` | MongoDB collection, all 7 endpoints, `BusinessRule` / `CreateRuleRequest` / `RuleStatistics` types |

---

## 04-conditional-logic

Client-side form behaviour engine. Rules evaluate on every field change (no server round-trip) and control field visibility, required state, disabled state, and values.

Module root: `src/modules/ecommerce-conditional-logic/`

### 01-guides/

| File | What you learn |
|------|---------------|
| `01-overview.md` | Simple vs complex rule modes, 17 operators, 14 action types, rule scope, `useConditionalLogic` hook integration pattern, integration status with `ecommerce-product-v2` |

### 02-api-reference/

| File | What it covers |
|------|---------------|
| `01-conditional-logic.md` | MongoDB collection, all 12 endpoints, context-aware loading helper, all TypeScript types |

---

## 05-channel-connect

Marketplace store connection lifecycle: credential storage, OAuth flows (Phases A–E), automatic token refresh, webhook-driven deactivation, and publish-time credential injection.

Module root (frontend): `src/modules/ecommerce-product-v2/step2-channel-fields/` + `src/modules/channel-platform/`  
Module root (backend): `com.labamap.labamapomnichannelbe4fe.channel.store`

Located at: `docs/05-channel-connect/`

### 01-guides/

| File | What you learn |
|------|---------------|
| `01-overview.md` | Architecture, MongoDB data model, security principles, supported channels table, publish pipeline connection |
| `02-per-channel-credentials.md` | Step-by-step credential setup for all 10 channels (Shopify, Wix, Amazon, eBay, TikTok Shop, Lazada, Tokopedia, Shopee, Facebook, Walmart) |
| `03-oauth-flow.md` | 5-phase OAuth lifecycle: app registration, initiation, callback + code exchange, webhook deactivation, token lifecycle |
| `04-frontend-integration.md` | Component tree, data flow, `CREDENTIAL_FIELDS` map, OAuth vs manual split, action buttons by status, adding a new channel |

### 02-api-reference/

| File | What it covers |
|------|---------------|
| `01-channel-stores-api.md` | `channel_store_connections` schema, `connectionStatus` truth table, all REST endpoints, TypeScript types |
| `02-credential-security.md` | AES-256-GCM algorithm, stored format, `CredentialEncryptionService` API, key management, key rotation |
| `03-token-refresh.md` | `GenericTokenRefreshService` flow, `TokenRefreshConfig` class, Wix + TikTok Shop configs, Walmart per-call, Shopee HMAC, adding refresh for new channels |
| `04-oauth-endpoints.md` | All OAuth endpoints (`/oauth/initiate`, `/oauth/{ch}/callback`, `/webhooks/{ch}/{event}`), `OAuthStateNonce` TTL doc, `oauth_audit_log` collection, env vars |

---

## 06-adaptive-pattern-matching

Adaptive pattern matching (APM) analyses master product fields and channel schema fields to generate a JOLT transformation spec. The generated spec is persisted in `channel_jolt_specs` so future publishes skip the expensive analysis.

Module root (backend): `com.labamap.labamapomnichannelbe4fe.channel.service`

### 01-guides/

| File | What you learn |
|------|---------------|
| `01-overview.md` | 5-tier matching cascade, confidence scores, when APM runs vs stored spec |
| `02-matching-tiers.md` | CHANNEL_SPECIFIC → SEMANTIC_KNOWLEDGE → ALIAS_MAPPING → PATTERN_MAPPING → KEYWORD_SIMILARITY |
| `03-jolt-persistence.md` | channel_jolt_specs collection, 4-level category fallback, persistJolt flag |

### 02-api-reference/

| File | What it covers |
|------|---------------|
| `01-pattern-matching.md` | `/analyze` endpoint, `FieldMapping` shape, `MatchStrategy` enum, `AdaptiveMappingResult` |
| `02-channel-schema.md` | `/channel-schema` endpoint, channel schema document shape, schema caching |

---

## 07-publishing-engine

The publishing engine transforms a master product into a channel-ready payload and delivers it to the downstream sync API. It is the backend of Step 3 in the ecommerce wizard.

Module root (backend): `com.labamap.labamapomnichannelbe4fe.publishing`

### 01-guides/

| File | What you learn |
|------|---------------|
| `01-overview.md` | Full 12-step pipeline, store-aware vs legacy flow, service dependency map |
| `02-jolt-transformation.md` | JOLT spec resolution priority, mainImage normalisation, post-processing scopes and operations, FieldTransformationService, variant override merge, payload wrapping |
| `03-attribute-conversion.md` | ChannelAttributeConverterService, @ separator, dimension order, buildChannelAttributes / buildVariantGroups / buildOptionGroups / buildMetadataGroups / buildChannelCredentials |
| `04-sync-api-integration.md` | SyncChannelProductRequest shape, sync API call, response handling |
| `05-post-processing-config.md` | Rule JSON structure, dot-notation path rules, MongoDB document shape, Shopify + WIX + TikTok examples, naming conventions, priority ranges, FOR_EACH step ordering, common pitfalls, new channel checklist |
| `06-variant-value-id-translation.md` | Variant option value label → channel ID translation at publish time |
| `07-data-driven-channel-config.md` | Removing hardcoded channel-type logic from services; sourcing channel behaviour from MongoDB |
| `08-shopee-variant-groups.md` | Walkthrough of the Shopee `variantGroups` pipeline: why it was empty, `BUILD_MODEL`→`variants` in-place, `seller_stock`/`model_id`, `skus.` prefix mapping for `init_tier_variation` + `add_model` |
| `15-jolt-agent-post-processing-split-konvergensi.md` | Why the AI JOLT-generation agent got stuck (mapping post-processing-owned fields, e.g. images → collision) and the fixes that make it converge: **#1** strip owned-target mappings at validation, **#2** coverage-aware completeness |
| `16-jolt-agent-gap-recommendations.md` | **#3** data-driven post-processing op catalog surfaced to the agent; genuine gaps routed to the review queue via `AiRecommendation.Analysis.postProcessingGaps` (+ per-gap op suggestions) |

> _Guides `09`–`14` also exist in the folder (channel capability, payload gaps, category-id fix, trace inspector); see the directory listing._
>
> **Frontend:** [`../FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md`](../FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md) — how the Review Queue UI should render `postProcessingGaps` / `postProcessingGapSuggestions` (distinct from `missingChannelRequirements`), plus the approve-warning and triage badge.

### 02-api-reference/

| File | What it covers |
|------|---------------|
| `01-publish-request-response.md` | `POST /channels/publish` single + batch endpoints, `PublishProductRequest` / `PublishProductResponse` shapes, all TypeScript types |
| `02-sync-api.md` | `SyncChannelProductRequest` shape, sync API contract, response mapping |
| `03-publish-analysis.md` | `PublishAnalysisService` 7-stage pre-flight response, all stage shapes, `readinessScore` algorithm, TypeScript types |
| `04-post-processing-operations.md` | All 19 implemented operations (DOCUMENT / LIST / PER_ITEM / LEGACY scopes) with full parameter tables and examples; condition value enums |

---

## 08-channel-category-tree

Channel category tree system: generic data-driven architecture untuk browsing dan searching kategori dari berbagai channel marketplace. Mencakup dua jalur (taxonomy cache untuk fixed global trees vs category cache per-toko), HMAC signing untuk Shopee, dan cara menambah channel baru tanpa Java code.

Module root (backend): `com.labamap.labamapomnichannelbe4fe.channel.category`

### 01-guides/

| File | What you learn |
|------|---------------|
| `01-architecture.md` | Two-path routing (taxonomy vs category cache), config fields, cara menambah channel baru |
| `02-shopee-integration.md` | HMAC-SHA256 signing, sandbox vs production URL, `partnerId` injection, bug fixes 2026-06-18 |
| `03-taxonomy-system.md` | Taxonomy cache untuk fixed global trees (Shopify GRAPHQL + eBay REST), Phase 1/2 BFS, cara menambah taxonomy channel |

### 02-api-reference/

| File | What it covers |
|------|---------------|
| `01-endpoints.md` | Category tree navigation + search + attributes endpoints, `channel_category_cache` + `channel_taxonomy_cache` schemas, config summary per channel, MongoDB maintenance guide |

---

## Implementation Status (as of 2026-04-29)

| Phase | What it introduced | Status |
|-------|-------------------|--------|
| Phase 1 | `applicableCategories` stores category ObjectIds on MasterAttribute | ✅ Done |
| Phase 2 | Path-inheritance: selecting a category includes all descendant attributes | ✅ Done |
| Phase 3 | `channel_category_mappings` collection + 9 admin endpoints | ✅ Done |
| Phase 4 | ProductType entity + `productTypeIds` on MasterAttribute | ✅ Done |
| Phase 5 | Variant matrix driven by ProductType; form schema cache key = productTypeId | ✅ Done |
