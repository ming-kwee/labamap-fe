# Step 2 — Category-Specific Required & Recommended Fields

**Status: Implemented** — Phases 1–3 done. Phase 4 (APM condition eval) pending.

## Problem Statement

The original design used `requiredFieldObjects` and `recommendedFields` on `ChannelConfiguration` as flat, channel-wide lists applied identically to every product regardless of category. Those fields were **never populated by the seeder** and have since been removed. The replacement is a three-layer system described below.

The two original failure modes this solves:

- **Over-requiring**: putting the union of all categories shows irrelevant fields (e.g. `batteries_required` for a clothing product on Amazon)
- **Under-requiring**: putting only the universal minimum silently excludes category-specific required fields from the completion score

Real-world required fields differ significantly per category:

| Channel     | Electronics                               | Clothing                                | Food                           |
|-------------|-------------------------------------------|-----------------------------------------|--------------------------------|
| Shopify     | model_number, voltage, connectivity       | material, care_instructions, size_type  | ingredients, allergens, expiry |
| Amazon      | model_number, batteries_required, wattage | department, item_type_keyword, material | item_form, diet_type           |
| TikTok Shop | package_weight, package_dimensions        | brand_id, color, size                   | —                              |

---

## What Already Exists

`channel_category_attributes_cache` already stores per-category required/optional fields keyed by `(channelType, storeId, categoryId)`, populated live from the channel API. `ChannelStepSchemaService.buildStoreResult()` already receives this as `categoryAttrsForSchema` and attaches it as `categoryAttributeSection` on the response.

**The gap:** `categoryAttributeSection` is returned to the frontend but is not wired into the completion score. `reqTotal` and `reqFilled` are computed only from the flat `channelConfig.getRequiredFieldObjects()` list, so category-specific required fields never affect the readiness percentage.

---

## Three-Layer Required Field System

Required fields in Step 2 are assembled from three layers, applied in order:

| Layer | Source | Applies when |
|-------|--------|--------------|
| **0 — Channel-wide** | `EcommerceMasterAttributeDocument.requiredByChannel` | Always — every product on that channel |
| **1 — Category slug (Path A)** | `ChannelConfiguration.categoryRequirements[slug]` | When saved `categoryId` maps to a known slug |
| **2 — Leaf category (Path B)** | Live channel attribute API → `channel_category_attributes_cache` | When a leaf category is selected and channel has attribute API |

All three layers are additive — a field appearing in any layer is placed in the required section and counted in `channelRequiredTotal` (layers 0+1) or `categoryRequiredTotal` (layer 2).

---

## Channel-Wide Required Fields (Layer 0) — `requiredByChannel`

**Implemented 2026-05-16.**

Fields that must be filled for **every product on a given channel**, regardless of category, are marked on `EcommerceMasterAttributeDocument` using the `requiredByChannel` map.

### Field on `EcommerceMasterAttributeDocument`

```json
{
  "fieldName": "product_type",
  "fieldType": "TEXT",
  "supportedChannels": ["shopify", "wix"],
  "requiredByChannel": {
    "shopify": true,
    "wix":     true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `required` | `Boolean` | Document-level default. Used as fallback when `requiredByChannel` has no entry for the current channel. |
| `requiredByChannel` | `Map<String, Boolean>` | Per-channel override. Key = `channelType`. Takes precedence over `required`. |

**Resolution logic in `ChannelStepSchemaService.isRequiredForChannel()`:**
1. If `requiredByChannel` contains the current `channelType` → use that value
2. Otherwise → fall back to document-level `required`

**Precedence table:**

| `required` | `requiredByChannel` | Result for `shopify` |
|---|---|---|
| `true` | absent | required (falls back to default) |
| `null` | `{"shopify": true}` | required (per-channel wins) |
| `true` | `{"shopify": false, "woocommerce": true}` | not required on Shopify, required on WooCommerce |
| `true` | `{"woocommerce": false}` | required on Shopify (fallback), not required on WooCommerce |

### Currently Seeded Channel-Wide Required Fields

| Field | Channels | Seeder |
|-------|----------|--------|
| `vendor` | Shopify | `ShopifyChannelAttributesMigration` |
| `product_type` | Shopify, WIX | `ShopifyChannelAttributesMigration` |

### Adding Required Fields for Other Channels

1. In the channel's attribute seeder, add `.requiredByChannel(Map.of("channelType", true))` to the builder.
2. In the same seeder's upsert block, add `existing.setRequiredByChannel(attr.getRequiredByChannel())` so re-runs propagate the flag to existing documents.
3. No changes to `ChannelStepSchemaService` are needed.

---

## Two Implementation Paths

Channels split into two types based on whether they provide a live attribute API:

| Path           | Channels                            | Required field source                                       | Prerequisite                                                      |
|----------------|-------------------------------------|-------------------------------------------------------------|-------------------------------------------------------------------|
| B — Live API   | Amazon, TikTok Shop, Lazada, Shopee | `channel_category_attributes_cache`                         | None for wiring; stub must be implemented to activate (see below) |
| A — Static map | Shopify, WIX, eBay, Walmart         | Seeded `categoryRequirements` map on `ChannelConfiguration` | Path B wiring already deployed                                    |

Both paths feed the same completion scoring logic after implementation. Path B wiring is implemented first because it is zero-risk (all additions are null-guarded, produce identical behaviour while the stub returns empty) and requires no model seeder. Path A is implemented second because it requires a model change and a `@Order(111)` migration seeder.

### Path B has two distinct phases

**Phase 1 — Wiring (implement first, zero risk):** Add `categoryAttrsForSchema` into the completion scoring formula and thread it through section builder signatures. All additions are null-guarded. While the stub returns empty, `catReqTotal = 0` and `catReqFilled = 0`, so the formula `totalReqItems = reqTotal + 0` is algebraically identical to the current behaviour. This wiring is deployed once and lies dormant with no effect until Phase 2 activates it.

**Phase 2 — Activation (per channel, separate work items):** Implement `fetchAndCacheAttributes()` for each channel. Until this is done, `channel_category_attributes_cache` has no data and the wiring produces no change in scores.

### `fetchAndCacheAttributes` is a stub

`channel_category_attributes_cache` is defined by `@Document` on `CategoryAttributesCacheDocument`, keyed by `(channelType, storeId, categoryId)` with a 24-hour TTL on `expireAt`. The read path exists. However, `CategoryCacheServiceImpl.fetchAndCacheAttributes()` is currently an unimplemented stub:

```java
// CategoryCacheServiceImpl.java line ~175
private Mono<CategoryAttributesResponse> fetchAndCacheAttributes(...) {
    // Category attributes API is channel-specific and not yet generified (Phase 4 concern).
    // Return empty on cache miss so the form still renders without crashing.
    return Mono.just(CategoryAttributesResponse.empty(categoryId));
}
```

`categoryAttrsRepository.save()` is never called anywhere in the codebase. Because **MongoDB only creates a collection on the first document insert**, the `channel_category_attributes_cache` collection does not exist in MongoDB at all — you will not find it in Compass or any DB client until Phase 2 is implemented and a save occurs. The `@Document` annotation, compound index, and TTL index are applied by Spring Data automatically on first save; no manual collection creation is needed.

On every cache miss (i.e. always), the service returns an empty response. `categoryAttrsForSchema` in `buildStoreResult()` is therefore always an empty shell. Path B Phase 2 depends on implementing `fetchAndCacheAttributes()` per channel — calling the channel's category attribute API, mapping the response to `CachedAttributeField` list, and saving a `CategoryAttributesCacheDocument` with `expireAt = now + 24h`.

---

## Path A — Static `categoryRequirements` Map (Shopify, WIX, eBay)

These channels have no live endpoint that returns per-category attribute requirements. The fields must be seeded from platform documentation.

### 1. Data Model Change — `ChannelConfiguration`

Add a new inner class and field:

```java
// In ChannelConfiguration.java

/**
 * Per-category overrides for required and recommended fields.
 * Key: category slug (e.g. "clothing", "electronics", "food").
 * When a product's saved categoryId maps to a slug present here,
 * these lists are merged on top of the channel-level defaults.
 */
private Map<String, CategoryFieldOverride> categoryRequirements;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public static class CategoryFieldOverride {
    /** Fields required IN ADDITION to the channel-level requiredFieldObjects. */
    private List<RequiredField> additionalRequiredFields;
    /** Channel-level recommended fields to SUPPRESS for this category (field names). */
    private List<String> suppressRecommendedFields;
    /** Fields recommended IN ADDITION to channel-level recommendedFields. */
    private List<RecommendedField> additionalRecommendedFields;
}
```

`additionalRequiredFields` uses the existing `RequiredField` inner class — no new type needed.

### 2. Seeder — New Migration Class

Create `ChannelCategoryRequirementsMigration.java` at `@Order(111)` (after `ChannelFieldMappingOverridesMigration` at 110):

```java
// Shopify example entries:
Map<String, ChannelConfiguration.CategoryFieldOverride> shopifyCategoryRequirements = new HashMap<>();

shopifyCategoryRequirements.put("clothing", ChannelConfiguration.CategoryFieldOverride.builder()
    .additionalRequiredFields(List.of(
        RequiredField.builder().fieldName("material").fieldType("string")
            .description("Fabric/material composition").build(),
        RequiredField.builder().fieldName("care_instructions").fieldType("string")
            .description("Washing and care instructions").build(),
        RequiredField.builder().fieldName("size_type").fieldType("string")
            .description("Size type (regular, plus, petite)").build()
    ))
    .build());

shopifyCategoryRequirements.put("electronics", ChannelConfiguration.CategoryFieldOverride.builder()
    .additionalRequiredFields(List.of(
        RequiredField.builder().fieldName("model_number").fieldType("string")
            .description("Manufacturer model number").build(),
        RequiredField.builder().fieldName("connectivity").fieldType("string")
            .description("Connectivity type (WiFi, Bluetooth, USB)").build()
    ))
    .additionalRecommendedFields(List.of(
        RecommendedField.builder().fieldName("voltage").fieldType("string")
            .description("Operating voltage").recommendationScore(0.8).build()
    ))
    .build());

// Apply: config.setCategoryRequirements(shopifyCategoryRequirements); config save
```

Supported slugs to seed for Shopify: `clothing`, `electronics`, `home-garden`, `sports`, `food`, `beauty`, `books`, `toys`  
Supported slugs to seed for WIX: same set, adjusted for WIX field names  
Supported slugs to seed for eBay: `electronics`, `motors`, `fashion`, `collectibles`, `sporting-goods`

### 3. Category Slug Resolution

The saved `channelData` in `ChannelProductData` contains the product's selected category. The value is a category ID (e.g. `"shopify_cat_123"`) or slug depending on the channel. A helper is needed to normalise this to a slug:

```java
// In ChannelStepSchemaService

private String resolveCategorySlug(ChannelProductData savedData, String channelType) {
    if (savedData == null || savedData.getChannelData() == null) return null;
    Object catVal = savedData.getChannelData().get("categoryId");
    if (catVal == null) catVal = savedData.getChannelData().get("category");
    if (catVal == null) return null;
    String raw = String.valueOf(catVal).toLowerCase();
    // Shopify/WIX store product type slugs directly — normalise to known slug
    return CATEGORY_SLUG_ALIASES.getOrDefault(raw, raw);
}

// Known aliases map (seed from platform docs):
private static final Map<String, String> CATEGORY_SLUG_ALIASES = Map.of(
    "apparel", "clothing",
    "clothes", "clothing",
    "fashion", "clothing",
    "tech",    "electronics",
    "gadgets", "electronics"
);
```

### 4. Merge Logic in `buildStoreResult()`

> **Note:** The code below reflects the current implemented state. `requiredFieldObjects` and
> `recommendedFields` have been removed from `ChannelConfiguration`. `effectiveRequired` is now
> seeded from `EcommerceMasterAttributeDocument.requiredByChannel` (Layer 0) before Path A
> category overrides are applied. See [Channel-Wide Required Fields](#channel-wide-required-fields-layer-0--requiredByChannel) section below.

```java
// Layer 0: channel-wide required fields from EcommerceMasterAttributeDocument
String channelType = store.getChannelType();
String categorySlug = resolveCategorySlug(savedData, channelType);
List<ChannelConfiguration.RequiredField> effectiveRequired = channelAttrs.stream()
        .filter(a -> isRequiredForChannel(a, channelType))
        .map(a -> ChannelConfiguration.RequiredField.builder()
                .fieldName(a.getFieldName())
                .fieldType(a.getFieldType())
                .description(a.getDescription())
                .build())
        .collect(Collectors.toCollection(ArrayList::new));
List<ChannelConfiguration.RecommendedField> effectiveRecommended = new ArrayList<>();

// Layer 1 (Path A): merge category-specific overrides on top
if (categorySlug != null && channelConfig.getCategoryRequirements() != null) {
    ChannelConfiguration.CategoryFieldOverride override =
            channelConfig.getCategoryRequirements().get(categorySlug);
    if (override != null) {
        if (override.getAdditionalRequiredFields() != null)
            effectiveRequired.addAll(override.getAdditionalRequiredFields());
        if (override.getAdditionalRecommendedFields() != null)
            effectiveRecommended.addAll(override.getAdditionalRecommendedFields());
        if (override.getSuppressRecommendedFields() != null) {
            Set<String> suppressed = new HashSet<>(override.getSuppressRecommendedFields());
            effectiveRecommended.removeIf(f -> suppressed.contains(f.getFieldName()));
        }
    }
}
// Layer 2 (Path B): live category attribute API fields appended in buildRequiredSection()
```

`effectiveRequired` and `effectiveRecommended` are passed to `buildRequiredSection`, `buildRecommendedSection`, `countFilledRequired`, `countFilledRecommended`, and `reqTotal`/`recTotal` calculations.

---

## Path B — Live API Integration (Amazon, TikTok Shop, Lazada, Shopee)

These channels expose an attribute endpoint that returns the exact required/optional fields for any given leaf category. This data is already fetched and cached in `channel_category_attributes_cache` and returned as `categoryAttributeSection` in the Step 2 response.

### 1. Wire Category Attributes into Completion Score

In `buildStoreResult()`, after computing `reqTotal` and `reqFilled` from the channel-level fields, add the category-specific counts:

```java
// categoryAttrsForSchema is already passed into buildStoreResult() — use it here

int catReqTotal = 0;
int catReqFilled = 0;

if (categoryAttrsForSchema != null && categoryAttrsForSchema.requiredFields() != null) {
    catReqTotal = categoryAttrsForSchema.requiredFields().size();
    Map<String, Object> channelData = savedData.getChannelData() != null
            ? savedData.getChannelData() : Map.of();
    catReqFilled = (int) categoryAttrsForSchema.requiredFields().stream()
            .filter(f -> isFilled(f, channelData))
            .count();
}

int totalReqItems = reqTotal + catReqTotal;
int totalReqFilled = reqFilled + catReqFilled;
int completionPct = totalReqItems > 0 ? (totalReqFilled * 100 / totalReqItems) : 100;
```

`isFilled(ChannelFormField f, Map<String, Object> data)` already exists in `ChannelStepSchemaService` — reuse it directly.

### 2. Merge Category Required Fields into the Required Section

Currently `buildRequiredSection()` only renders channel-level required fields. It needs to also render the category-specific ones:

```java
// In buildRequiredSection(), after building fields from channelConfig.getRequiredFieldObjects():

if (categoryAttrsForSchema != null
        && categoryAttrsForSchema.requiredFields() != null
        && !categoryAttrsForSchema.requiredFields().isEmpty()) {
    // Category required fields are already ChannelFormField — append directly
    fields.addAll(categoryAttrsForSchema.requiredFields());
}
```

The `ChannelFormField` objects in `categoryAttrsForSchema.requiredFields()` are the same type already rendered by the form — no transformation needed.

### 3. Pass `categoryAttrsForSchema` into Section Builders

`buildRequiredSection()` currently has signature:
```java
private ChannelFormSection buildRequiredSection(
    List<ChannelConfiguration.RequiredField> requiredFields,
    Map<String, EcommerceMasterAttributeDocument> attrByName,
    ChannelProductData savedData, ...)
```

Add `CategoryAttributesResponse categoryAttrs` as a final parameter and thread it through from `buildStoreResult()`.

### 4. Exclude Category Fields from the Optional Section

After merging category required fields into the required section, their field names must be excluded from `buildOptionalSection()` to prevent duplication:

```java
Set<String> categoryRequiredNames = categoryAttrsForSchema != null
        ? categoryAttrsForSchema.requiredFields().stream()
              .map(ChannelFormField::getFieldName)
              .collect(Collectors.toSet())
        : Set.of();

// Pass categoryRequiredNames into buildOptionalSection() and add to the exclusion check:
// if (requiredFieldNames.contains(f) || recommendedFieldNames.contains(f)
//         || merchantApiFieldNames.contains(f) || categoryRequiredNames.contains(f)) continue;
```

---

## Completion Stats Response Change

Update `CompletionStats` builder call to surface the split:

```java
.completionStats(CompletionStats.builder()
    .requiredTotal(totalReqItems)
    .requiredFilled(totalReqFilled)
    .channelRequiredTotal(reqTotal)         // new field
    .channelRequiredFilled(reqFilled)       // new field
    .categoryRequiredTotal(catReqTotal)     // new field
    .categoryRequiredFilled(catReqFilled)   // new field
    .recommendedTotal(recTotal)
    .recommendedFilled(recFilled)
    .build())
```

Add `channelRequiredTotal`, `channelRequiredFilled`, `categoryRequiredTotal`, `categoryRequiredFilled` to the `CompletionStats` record/class.

---

## `apiSchema` — Not Universal Across Product Categories

`apiSchema` on `ChannelConfiguration` is a `Map<String, Object>` seeded once per channel by `ChannelConfigurationDataLoader`. It serves as the **target schema** for the Adaptive Pattern Matching (APM) engine: `ChannelSchemaService.generateComplexTargetSchema()` returns it directly, and APM maps every master product field against this structure to generate JOLT specs.

### Channels where a single `apiSchema` is genuinely correct

| Channel   | Why single schema is sufficient                                                                                                      |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------|
| Shopify   | API accepts the same `product.*` structure for every product type; `product_type` is a plain text tag that doesn't branch the schema |
| WIX       | Same `product.*` structure for all physical products regardless of category                                                          |

### Channels where `apiSchema` is an oversimplification

| Channel | Reality | What is missing |
|---------|---------|-----------------|
| Amazon | SP-API uses category-specific product type definitions — `Electronics`, `Clothing`, `Health` each have entirely different attribute sets | Category attributes (`Connectivity`, `MaterialType`, `Ingredients`, etc.) are absent from the seeded schema |
| eBay | "Item Specifics" are category-driven — Computers have `Processor`, `RAM`; Clothing has `Size`, `Material`, `Style` | Item Specifics do not exist in the seeded schema |
| Walmart | Category-specific attribute groups — Electronics needs `model_number`, `connectivity`; Food needs `allergen_info` | Category attribute groups absent from the seeded schema |

The seeded `apiSchema` for these three channels represents only the universal product envelope — enough for APM to map common fields (title, description, price, images) but insufficient for category-specific attributes. When a seller lists an electronics product on Amazon, APM cannot suggest `model_number → model_number` or `voltage → wattage` because those fields don't exist in the target schema.

### TikTok Shop — correct architecture already in place

TikTok's `apiSchema` includes `product_attributes[]` with `attribute_id`/`value_id` — the extension point for category-specific attributes. The seeded schema even comments `// Product attributes (category-specific)`. The specific attribute IDs for a given category are fetched from the TikTok category API and stored in `channel_category_attributes_cache`. This is the right pattern.

### Implementation plan — category schema extensions

Add `categoryApiSchemas: Map<String, Map<String, Object>>` to `ChannelConfiguration` (or to `CategoryFieldOverride` from Path A). Key = category slug, value = schema fields that extend the base `apiSchema` for that category.

```java
// In ChannelConfiguration.java
private Map<String, Map<String, Object>> categoryApiSchemas;
```

In `ChannelSchemaService.generateComplexTargetSchema()`, after loading the base `apiSchema`, merge the category extension when a `categorySlug` is known:

```java
// Merge category-specific schema extension on top of base apiSchema
if (categorySlug != null && channel.getCategoryApiSchemas() != null) {
    Map<String, Object> categoryExt = channel.getCategoryApiSchemas().get(categorySlug);
    if (categoryExt != null) {
        result.putAll(categoryExt);  // category fields supplement, not replace, base schema
    }
}
```

**Seeder entries for Amazon (examples):**

```java
Map<String, Map<String, Object>> amazonCategorySchemas = new HashMap<>();

Map<String, Object> electronicsSchema = new HashMap<>();
electronicsSchema.put("Item.ProductType.Electronics.Connectivity", "");
electronicsSchema.put("Item.ProductType.Electronics.ModelNumber", "");
electronicsSchema.put("Item.ProductType.Electronics.Wattage", 0);
electronicsSchema.put("Item.ProductType.Electronics.BatteriesRequired", false);
amazonCategorySchemas.put("electronics", electronicsSchema);

Map<String, Object> clothingSchema = new HashMap<>();
clothingSchema.put("Item.ProductType.Clothing.MaterialType", "");
clothingSchema.put("Item.ProductType.Clothing.Department", "");
clothingSchema.put("Item.ProductType.Clothing.SizeMap", "");
clothingSchema.put("Item.ProductType.Clothing.Color", "");
amazonCategorySchemas.put("clothing", clothingSchema);

config.setCategoryApiSchemas(amazonCategorySchemas);
```

**`categorySlug` resolution:** The APM request carries `channelId` and optionally `categoryId`. The schema service resolves `categoryId` → `categorySlug` using the same `resolveCategorySlug()` helper planned for Path A (used in `ChannelStepSchemaService`).

**Impact on APM:** Once category extensions are in the target schema, Tier 1 (Knowledge-Based) mappings for category-specific fields become possible, and Tier 2–3 (Semantic/Similarity) can suggest mappings for unrecognised source fields.

**Priority:** Shopify and WIX require no change. Amazon is the highest-value target (most category-specific fields, highest commercial impact). TikTok Shop is already correct.

---

## `fieldBoosts` — Also Partially Category-Specific

`fieldBoosts` on `ChannelConfiguration` is used by APM Tier 5 (Boost) in `KnowledgeBasedFieldMatchingService.getChannelSpecificBoostReactive()`. When the engine evaluates a source→target field pair, it sums the `confidenceBoost` of every entry whose `sourcePattern` and `targetPattern` match the field names (via `String.matches()`).

### Current boosts are channel-level naming conventions — correct as-is

All seeded boosts describe platform naming differences that apply to every product on that channel regardless of category:

| Channel | Boost | Reason |
|---------|-------|--------|
| Shopify | `brand → vendor (+10)` | Shopify always uses "vendor" |
| Shopify | `stock_quantity → inventory_quantity (+7)` | Shopify inventory naming |
| Amazon | `brand → brand (+15)` | Brand required on all Amazon listings |
| Walmart | `barcode → upc (+15)` | Walmart always requires UPC |

These are correct at the flat channel level — no change needed here.

### Category-specific boosts are needed but not yet supported

Some field-pair boosts only make sense for certain categories. Adding them to the flat list would incorrectly inflate confidence scores for unrelated products:

| Category | Channel | Boost needed | Why it must be category-scoped |
|----------|---------|--------------|-------------------------------|
| Electronics | Amazon | `model_number → model_number (+15)` | Irrelevant for food/clothing |
| Electronics | Amazon | `connector_type → interface (+8)` | Irrelevant for food/clothing |
| Clothing | Amazon | `material → material_type (+12)` | Irrelevant for electronics |
| Clothing | Shopify | `size_type → size_type (+10)` | Irrelevant for electronics |

### The `condition` field exists but is never evaluated

`ChannelConfiguration.FieldBoost` already has a `condition` field:

```java
public static class FieldBoost {
    private String sourcePattern;
    private String targetPattern;
    private Double confidenceBoost;
    private String reason;
    private String condition;  // Optional condition for when to apply boost — NEVER READ
}
```

`getChannelSpecificBoostReactive()` only matches `sourcePattern` and `targetPattern`. The `condition` field is declared and stored in MongoDB but never read or evaluated anywhere in the engine.

### Implementation plan for category-scoped boosts

**Option 1 — evaluate `condition` in the engine (minimal change):**

Define `condition` as a category slug expression, e.g. `"category=electronics"` or `"category=clothing|fashion"`. Then in `getChannelSpecificBoostReactive()`:

```java
return config.getFieldBoosts().stream()
    .filter(boost ->
        matchesCondition(boost.getCondition(), categorySlug) &&   // add this
        sourceField.getName().matches(boost.getSourcePattern()) &&
        targetField.getName().matches(boost.getTargetPattern())
    )
    .mapToDouble(ChannelConfiguration.FieldBoost::getConfidenceBoost)
    .sum();

// null condition = applies to all categories (backward-compatible)
private boolean matchesCondition(String condition, String categorySlug) {
    if (condition == null || condition.isBlank()) return true;
    if (!condition.startsWith("category=")) return true;
    String[] allowed = condition.substring(9).split("\\|");
    return Arrays.stream(allowed).anyMatch(s -> s.equalsIgnoreCase(categorySlug));
}
```

The `categorySlug` must be resolved from the APM request (add it to `AdaptivePatternMatchingRequest` or derive it from the product data passed at request time).

**Option 2 — add per-category boosts inside `CategoryFieldOverride` (cohesive with Path A):**

Add `List<FieldBoost> additionalFieldBoosts` to `CategoryFieldOverride`. The `ChannelCategoryRequirementsMigration` seeds category boosts alongside category required fields in one place. The engine looks up overrides the same way it will look up required fields.

Option 1 is simpler and backward-compatible (null condition = all categories). Option 2 is more cohesive with the Path A data model.

---

## Files to Change

| File | Change |
|------|--------|
| `channel/model/entity/ChannelConfiguration.java` | Add `categoryRequirements: Map<String, CategoryFieldOverride>` field and `CategoryFieldOverride` inner class; optionally add `additionalFieldBoosts` to `CategoryFieldOverride` |
| `config/ChannelCategoryRequirementsMigration.java` | New file `@Order(111)` — seeds static category requirements for Shopify, WIX, eBay; includes category-scoped boosts if Option 2 chosen |
| `ecommerce/channelproduct/service/ChannelStepSchemaService.java` | `buildStoreResult()` — merge `effectiveRequired`/`effectiveRecommended` (Path A) and wire `categoryAttrsForSchema` into completion score + section builders (Path B); add `resolveCategorySlug()` helper |
| `ecommerce/channelproduct/model/dto/CompletionStats.java` | Add `channelRequiredTotal`, `channelRequiredFilled`, `categoryRequiredTotal`, `categoryRequiredFilled` |
| `ecommerce/channelproduct/service/ChannelProductDataService.java` | Update completion percentage calculation to match (if duplicated here) |
| `adaptivepattern/service/KnowledgeBasedFieldMatchingService.java` | `getChannelSpecificBoostReactive()` — evaluate `condition` field against resolved category slug (Option 1); or look up `categoryBoosts` from `CategoryFieldOverride` (Option 2) |

---

## Implementation Order

### Phase 1 — Path B wiring (zero risk, no model change, no seeder)

1. **`CompletionStats`** — add `channelRequiredTotal`, `channelRequiredFilled`, `categoryRequiredTotal`, `categoryRequiredFilled` (additive, backward-compatible)
2. **`ChannelStepSchemaService`** — wire `categoryAttrsForSchema` into scoring and section builders:
   - Scoring formula: `catReqTotal`/`catReqFilled` from `categoryAttrsForSchema`, summed with channel-level `reqTotal`/`reqFilled`
   - Thread `CategoryAttributesResponse categoryAttrs` through `buildRequiredSection()` and `buildOptionalSection()` signatures
   - `buildRequiredSection()`: append `categoryAttrs.requiredFields()` after channel-level required fields
   - `buildOptionalSection()`: exclude `categoryRequiredNames` from optional field list

   With the stub still returning empty: `catReqTotal = 0`, formula is algebraically identical to today. All null-guards already present. Zero regression risk.

### Phase 2 — Path B activation (per channel, independent work items)

3. **`CategoryCacheServiceImpl.fetchAndCacheAttributes()`** — implement per channel:
   - TikTok Shop: call `/product/category/attribute/get`, map `attributes[]` to `CachedAttributeField`, save `CategoryAttributesCacheDocument` with `expireAt = now + 24h`
   - Amazon: call SP-API `getItemTypeDefinitions`, extract required attributes per product type
   - Lazada / Shopee: call respective category attribute endpoints

   Each channel is an independent work item. Phase 1 wiring activates automatically for each channel as its fetch is implemented and the first save creates the collection.

### Phase 3 — Path A (model change + seeder required)

4. **`ChannelConfiguration`** — add `categoryRequirements: Map<String, CategoryFieldOverride>` field and `CategoryFieldOverride` inner class (no behaviour change until step 5)
5. **`ChannelCategoryRequirementsMigration`** (`@Order(111)`) — seed Shopify, WIX, eBay static category requirements; include category-scoped `fieldBoosts` if Option 2 is chosen
6. **`ChannelStepSchemaService`** — add `resolveCategorySlug()` helper; merge `effectiveRequired`/`effectiveRecommended` from `categoryRequirements` override in `buildStoreResult()`

### Phase 4 — APM category boosting (standalone)

7. **`KnowledgeBasedFieldMatchingService`** — evaluate `condition` field in `getChannelSpecificBoostReactive()` (Option 1), or look up `CategoryFieldOverride.additionalFieldBoosts` (Option 2). Existing boosts with `condition = null` continue to apply to all categories unchanged.

---

**Verification steps:**
- After Phase 1: confirm no change in completion percentage for any existing product (stub returns empty, scores must be identical)
- After Phase 2 (one channel): confirm completion percentage increases for a product with a category set on that channel
- After Phase 3: confirm Shopify clothing product gains `material`, `care_instructions`, `size_type` in required section
- After Phase 4: confirm APM confidence for `model_number → model_number` is boosted for an Amazon electronics product but not for an Amazon clothing product

---

## Implementation Status (as of 2026-05-16)

| Phase | Status | Notes |
|-------|--------|-------|
| Layer 0 — Channel-wide `requiredByChannel` | **Done** | `EcommerceMasterAttributeDocument.requiredByChannel` added; `isRequiredForChannel()` helper in `ChannelStepSchemaService`; `vendor` + `product_type` seeded for Shopify; `product_type` also for WIX |
| Phase 1 — Path B wiring | **Done** | `CompletionStats` extended, scoring wired, section builders updated |
| Phase 2 — Path B activation | **Done** | All 7 channels configured: Lazada, TikTok, Shopee, eBay, Shopify (GraphQL), Amazon (two-step), WooCommerce |
| Phase 3 — Path A model + seeder | **Done** | `CategoryFieldOverride` added, `ChannelCategoryRequirementsMigration` @Order(111) seeded Shopify/WIX/eBay |
| Phase 4 — APM condition eval | **Pending** | `KnowledgeBasedFieldMatchingService.getChannelSpecificBoostReactive()` not yet updated |

API reference for Phases 1–3: [`02-api-reference/06-step2-category-attributes.md`](../02-api-reference/06-step2-category-attributes.md)

---

## Frontend Enhancements Required

The backend changes in Phases 1–3 introduce **two breaking contract changes** and **two new
behaviours** that require frontend work before the feature is usable end-to-end.

---

### 1. `CompletionStats` Type Change (Breaking)

**Old shape** (before Phase 1):
```typescript
completionStats?: { required: number; total: number; percentage: number };
```

**New shape:**
```typescript
interface CompletionStats {
  requiredTotal:          number;  // was "total"
  requiredFilled:         number;  // was "required"
  channelRequiredTotal:   number;  // new
  channelRequiredFilled:  number;  // new
  categoryRequiredTotal:  number;  // new — 0 when no category selected
  categoryRequiredFilled: number;  // new
  recommendedTotal:       number;  // new
  recommendedFilled:      number;  // new
}
```

**What to change:**
- Update the TypeScript type in `channelStore.ts` (or wherever `ChannelProductData` / `ChannelSchemaPerStore` is typed)
- Update every component that reads `completionStats.required` → `completionStats.requiredFilled`
  and `completionStats.total` → `completionStats.requiredTotal`
- `completionPercentage` is still a top-level integer field on `ChannelSchemaPerStore` — no change

**Optionally** expose the split in the UI progress bar:
```
Required: 4 / 9  (Channel: 3/5 · Category: 1/4)
```
This gives sellers visibility into which type of field they still need to fill.

---

### 2. `categoryAttributeSection` on `ChannelSchemaPerStore` (New Field)

`ChannelSchemaPerStore` now has an optional `categoryAttributeSection: CategoryAttributesResponse`
field (present only when a category is already saved for this store).

```typescript
interface ChannelSchemaPerStore {
  // ... existing fields ...
  categoryAttributeSection?: CategoryAttributesResponse;  // NEW
}

interface CategoryAttributesResponse {
  categoryId:     string;
  categoryName:   string;
  categoryPath:   string[];
  requiredFields: ChannelFormField[];
  optionalFields: ChannelFormField[];
}
```

**What to change:**
Add `categoryAttributeSection` to the `ChannelSchemaPerStore` TypeScript type.

Note: the category required fields are **already included inside `sections.required.fields`** in
the schema response — you do not need to render `categoryAttributeSection.requiredFields` to make
the form work. `categoryAttributeSection` is extra context for rendering a category info panel:

```
┌─────────────────────────────────────────────────────────┐
│  ℹ️  You selected: Women's T-Shirts (Clothing > Women's) │
│  These fields are required for this category.            │
└─────────────────────────────────────────────────────────┘
  Color *        [Select ▼]
  Material *     [________]
```

---

### 3. Category Selection `onChange` — Re-fetch Category Attributes (New Behaviour)

The Step 2 schema is generated once on page load. When the seller then **changes the category**
in a CATEGORY_TREE field, the schema response is stale — it was built before the new category was
known. The frontend must trigger a new attribute fetch.

**Recommended flow:**

```
User selects a new category node (leaf) in CATEGORY_TREE field
  │
  ├─ 1. Immediately save the new categoryId to channelData
  │       (this is needed for autosave + for Path A slug resolution on schema refresh)
  │       key: "categoryId"  (primary — used by resolveCategorySlug())
  │
  ├─ 2. Call category-attributes endpoint:
  │       GET /labamap/api/v1/merchant-data/{channelType}/{storeId}/category-attributes
  │           ?categoryId={newCategoryId}&organizationId={orgId}
  │
  └─ 3a. On success: inject the returned requiredFields and optionalFields into the
  │         relevant sections of the current store's form.
  │         - Move category requiredFields into the "required" section (replace old ones)
  │         - Move category optionalFields into the "optional" section
  │         - Update local completionStats: add categoryRequiredTotal/Filled
  │
  └─ 3b. Alternative (simpler): re-call POST /ecommerce/form-schema/channel-step
            and fully re-render the store's tab. Acceptable if debounced (no repeated
            calls while user browses the tree).
```

**Important:** The `categoryId` value saved in `channelData` must use the key `"categoryId"` (not
`"category_id"` or `"category"`). `ChannelStepSchemaService.resolveCategorySlug()` reads
`channelData.categoryId` first, then falls back to `channelData.category`.

---

### 4. `categoryId` Must Be Persisted in `channelData` on Save

Path A (static map) resolution uses `channelData.categoryId` to look up the category slug. If the
frontend does not include `categoryId` in the autosave payload, Path A overrides will not appear
on subsequent schema loads.

**What to change:**

When a CATEGORY_TREE field value changes, ensure `channelData` in the autosave request includes:

```json
{
  "masterProductId": "...",
  "storeId":         "...",
  "channelData": {
    "categoryId": "123456",   ← must be present when category is selected
    "color":      "red",
    "..."
  }
}
```

The CATEGORY_TREE field name (e.g. `"category"`, `"product_type"`) already stores the value in
`channelData` under that key. `categoryId` is the **additional** explicit key for category
resolution. If the CATEGORY_TREE field is already named `"categoryId"` in the schema, no extra
work is needed — it will already be in `channelData`.

---

### 5. Layer 0 — Channel-Wide Required Fields Behavioral Impact

With Layer 0 now active, **channel-wide required fields appear in the required section on every
product**, without any category needing to be selected first. Previously these fields landed in the
optional section because `requiredFieldObjects` was never populated.

**What changes in the API response for Shopify and WIX:**

- `sections.required.fields` will now contain `vendor` and/or `product_type` from page load —
  even when no category is selected.
- `completionStats.channelRequiredTotal` will be `2` for Shopify (vendor + product_type) and `1`
  for WIX (product_type only), instead of `0`.
- `completionStats.requiredTotal` increases by the same amount.
- `completionPercentage` drops for products that haven't filled these fields yet.

**Frontend changes required:**

| Change | Priority | Breaking? | Effort |
|--------|----------|-----------|--------|
| Expect required section to be non-empty even with no category selected | P0 | Yes — if UI hides/collapses required section assuming it's empty on load | Low |
| `channelRequiredTotal` / `requiredTotal` now non-zero from load | P0 | No (type is the same) — but progress bars showing 100% before category selection will now correctly show < 100% | Low |
| Do not treat an empty optional section as "all fields shown" | P1 | No | Low |

---

### 6. Summary of All Frontend Work

| Change | Priority | Breaking? | Effort |
|--------|----------|-----------|--------|
| Update `CompletionStats` TypeScript type | P0 | Yes — will crash if old shape assumed | Low (type only) |
| Fix all reads of `completionStats.required`/`.total` | P0 | Yes | Low (search & replace) |
| Handle non-empty required section before category is selected (Layer 0) | P0 | Yes if required section was conditionally hidden | Low |
| Add `categoryAttributeSection` to `ChannelSchemaPerStore` type | P1 | No (optional field) | Low |
| Persist `categoryId` in `channelData` autosave | P1 | No (additive) | Low |
| Call category-attributes endpoint on category change | P1 | No (currently no UX change) | Medium |
| Render `categoryAttributeSection` context panel | P2 | No | Medium |
| Show channel vs category split in progress bar | P2 | No | Low |
