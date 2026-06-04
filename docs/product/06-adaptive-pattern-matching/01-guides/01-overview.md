# Adaptive Pattern Matching — Overview

## What This Module Does

The Adaptive Pattern Matching engine maps fields from a master product schema to a channel's target API schema. It does this intelligently using a 5-tier algorithm that goes from hard-coded channel knowledge down to fuzzy string similarity, and generates a JOLT transformation spec that the publish pipeline uses to transform products at publish time.

```
Master product fields                  Shopify target fields
────────────────────                   ─────────────────────
{ name, price, sku, brand }   ──→      { title, price, sku, vendor }

                 AdaptivePatternMatchingEngine
                         │
                         ▼
               FieldMappings + confidence scores
               JOLT transformation spec
               → Persisted to channel_jolt_specs
```

---

## How It Fits in the Product Wizard

Step 3 of the product wizard calls `POST /api/v1/adaptive-pattern-matching/analyze` to get field mappings and a JOLT spec before publishing. The JOLT spec is passed as part of the publish request, or it may already be persisted in `channel_jolt_specs` (the category-aware fast path).

```
Step 3 (frontend)
  └─ POST /api/v1/adaptive-pattern-matching/analyze  ← get mappings + jolt
  └─ POST /api/v1/channels/publish                   ← publish (uses jolt from above or from DB)
```

**Also available:**
- `POST /channels/publish/analyze` — `PublishAnalysisService` exposed via `ChannelController`; runs the full analysis pipeline including category-aware APM
- `POST /channels/preview-jolt` — no controller endpoint exists (service only)

---

## Collections

| Collection                        | Purpose                                                                                                                                                                   |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `channel_jolt_specs`              | Category-aware JOLT specs — one per (channelId × categoryId × organizationId). Stored so subsequent publish calls skip re-analysis (~20ms vs ~1000ms)                     |
| `field_semantic_knowledge`        | Knowledge base of field semantic types. `fieldName` is unique; `semanticType` is NOT unique. Used by Tier 2 and Tier 3 matching                                           |
| `channel_field_mappings`          | Pre-configured or learned field mappings per channel. Used by Tier 1 (CHANNEL_SPECIFIC). Highest priority — represents verified relationships                             |
| `channel_category_api_schemas`    | Per-category API schema extensions — one active document per (channelType × categorySlug). Seeded for Amazon (8 categories), eBay (5), Walmart (3). Merged into base `apiSchema` at APM time so category-specific fields appear in the target schema. Managed at runtime via `GET/POST/PUT /api/v1/admin/channel-category-schemas` |

---

## Service Architecture

```
AdaptivePatternMatchingCommandImpl          ← orchestrator
  ├─ FieldMatchingService                  ← facade; entry point for field matching
  │    └─ KnowledgeBasedFieldMatchingService  ← 5-tier matching engine
  │         ├─ ChannelFieldMappingRepository          (Tier 1: CHANNEL_SPECIFIC)
  │         ├─ FieldSemanticKnowledgeRepository       (Tier 2: SEMANTIC_KNOWLEDGE, Tier 3: ALIAS_MAPPING)
  │         ├─ ChannelConfigurationRepository         (channel boosts + category-scoped boost conditions)
  │         └─ ChannelCategoryApiSchemaRepository     (category schema extensions — Phase 1–4)
  ├─ ChannelSchemaService                 ← generates target schema; merges category extension
  ├─ SchemaFlattenerService               ← converts nested schemas to flat field paths
  └─ JoltSpecGeneratorService             ← turns MatchResult list into JOLT shift spec
```

`FieldMatchingService` is a facade over `KnowledgeBasedFieldMatchingService`. It exposes:
- `findMatchesReactive(sourceFields, targetFields, channelId)` — standard matching
- `findMatchesReactive(sourceFields, targetFields, channelId, categorySlug)` — category-aware matching; passes slug into boost condition evaluation
- `findMatchesForOrganization(sourceFields, targetFields, channelId, organizationId)` — adds org-specific override tiers

`DataInitializationService` seeds `field_semantic_knowledge` and `channel_field_mappings` from the JSON files in `src/main/resources/adaptivepattern/`.

---

## Codebase

| File | Purpose |
|------|---------|
| `adaptivepattern/controller/AdaptivePatternMatchingController.java` | `/analyze`, `/generate-jolt`, `/quick-match`, `/auto-approve` |
| `adaptivepattern/controller/WrapperDemoController.java` | `/demo/wrap`, `/demo/compare-wrappers`, `/demo/simulate-publish` |
| `adaptivepattern/command/impl/AdaptivePatternMatchingCommandImpl.java` | Orchestrator — JOLT lookup, field matching, persistence |
| `adaptivepattern/service/FieldMatchingService.java` | Facade for field matching |
| `adaptivepattern/service/KnowledgeBasedFieldMatchingService.java` | 5-tier matching engine |
| `adaptivepattern/service/JoltSpecGeneratorService.java` | JOLT spec generation |
| `adaptivepattern/service/SchemaFlattenerService.java` | Nested → flat field paths |
| `adaptivepattern/model/entity/ChannelJoltSpec.java` | `channel_jolt_specs` collection entity |
| `adaptivepattern/model/entity/FieldSemanticKnowledge.java` | `field_semantic_knowledge` collection entity |
| `adaptivepattern/model/entity/ChannelFieldMapping.java` | `channel_field_mappings` collection entity |
| `adaptivepattern/model/request/AdaptivePatternMatchingRequest.java` | Request DTO |
| `adaptivepattern/model/response/AdaptivePatternMatchingResponse.java` | Response DTO |
| `src/main/resources/adaptivepattern/*.json` | Seed data for semantic knowledge + field mappings |
