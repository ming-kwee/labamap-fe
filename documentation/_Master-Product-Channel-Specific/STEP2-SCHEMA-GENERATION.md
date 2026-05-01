# Step 2 — Form Schema Generation

## Overview

Step 2 of the product wizard displays a tabbed form — one tab per connected store.
Each tab renders a schema of channel-specific fields grouped into sections:
**Required → Recommended → Variant Overrides → Optional (collapsed)**.

The schema is generated dynamically by combining three data sources:

```
SOURCE 1: channel_store_connections
  WHERE organizationId = "org_123" AND isActive = true
  → tells us WHICH stores to build tabs for

SOURCE 2: channel_configurations
  WHERE channelId = store.channelType
  → tells us WHICH fields are required/recommended for that channel type

SOURCE 3: EcommerceMasterAttributeDocument
  WHERE isChannelField = true
    AND supportedChannels CONTAINS store.channelType
  → tells us WHAT each field looks like (label, type, validation, helpText)
```

---

## Schema Response Shape

```
POST /api/v1/ecommerce/form-schema/channel-step

Request:
{
  "masterProductId": "prod_abc123",
  "organizationId":  "org_123"
}
```

The endpoint loads the org's connected stores automatically — no need for the
frontend to pass `selectedChannels`. Stores drive the tabs.

```json
{
  "step": 2,
  "masterProductId": "prod_abc123",
  "channels": [
    {
      "channelType": "shopify",
      "storeId":     "shopify-us-store",
      "storeName":   "My Shopify US Store",
      "storeUrl":    "mystore.myshopify.com",
      "displayOrder": 1,
      "completionStatus": "READY",
      "completionPercentage": 100,
      "sections": [
        {
          "sectionName": "required",
          "label": "Required Fields",
          "description": "Must be filled before publishing to Shopify",
          "priority": 1,
          "fields": [
            {
              "fieldName":   "vendor",
              "fieldType":   "TEXT",
              "label":       "Vendor",
              "required":    true,
              "helpText":    "The brand or manufacturer of this product",
              "placeholder": "e.g. Apple, Samsung",
              "variantScope": "product_only",
              "currentValue": "TechBrand US"
            },
            {
              "fieldName":   "product_type",
              "fieldType":   "TEXT",
              "label":       "Product Type",
              "required":    true,
              "helpText":    "Shopify product type for categorization",
              "currentValue": null
            }
          ]
        },
        {
          "sectionName": "recommended",
          "label": "Recommended Fields",
          "description": "Improves discoverability on Shopify",
          "priority": 2,
          "fields": [
            {
              "fieldName": "tags",
              "fieldType": "MULTISELECT",
              "label":     "Tags",
              "required":  false,
              "helpText":  "Comma-separated product tags",
              "currentValue": ["electronics", "gadget"]
            },
            {
              "fieldName": "published_scope",
              "fieldType": "SELECT",
              "label":     "Published Scope",
              "required":  false,
              "options":   [
                { "value": "web",    "label": "Online Store" },
                { "value": "global", "label": "Online Store + POS" }
              ],
              "currentValue": "web"
            }
          ]
        },
        {
          "sectionName": "variant_overrides",
          "label": "Variant Overrides",
          "description": "Override per-variant data specifically for this store",
          "priority": 3,
          "displayAs": "TABLE",
          "variantFields": [
            { "fieldName": "inventory_policy", "fieldType": "SELECT",
              "label": "Inventory Policy",
              "options": [{"value":"deny"},{"value":"continue"}] },
            { "fieldName": "barcode", "fieldType": "TEXT", "label": "Barcode" }
          ],
          "variants": [
            { "sku": "SKU-001", "currentOverrides": { "inventory_policy": "deny" } },
            { "sku": "SKU-002", "currentOverrides": {} }
          ]
        },
        {
          "sectionName": "optional",
          "label": "Optional Fields",
          "priority": 4,
          "collapsible": true,
          "defaultExpanded": false,
          "fields": [ ... ]
        }
      ],
      "completionStats": {
        "requiredTotal":    2,
        "requiredFilled":   2,
        "recommendedTotal": 4,
        "recommendedFilled": 2
      }
    },
    {
      "channelType":  "wix",
      "storeId":      "wix-main-site",
      "storeName":    "My WIX Store",
      "displayOrder": 2,
      "completionStatus": "DRAFT",
      "completionPercentage": 60,
      "sections": [ ... ]
    }
  ]
}
```

---

## Service Implementation

**Package:** `com.labamap.labamapomnichannelbe4fe.ecommerce.channelproduct.service`
**File:** `ChannelStepSchemaService.java`

### Algorithm

```
1. Load all active stores for the org  (channel_store_connections)
2. For each store, parallel-load:
   a. Channel config for the store's channelType  (channel_configurations)
   b. Channel-specific attributes for the channelType  (EcommerceMasterAttributeDocument)
   c. Existing saved data for this product+store  (channel_product_data)
   d. Master product variants  (to build variant override table)
3. For each store, build sections:
   a. REQUIRED   — fields in channelConfig.requiredFieldObjects, enriched with attribute metadata
   b. RECOMMENDED — fields in channelConfig.recommendedFields, enriched with attribute metadata
   c. VARIANT OVERRIDES — variant-scoped channel fields from master attributes
   d. OPTIONAL   — remaining channel attributes not in required/recommended
4. Inject currentValue into each field from saved channel_product_data
5. Calculate completionStats
6. Return full ChannelStepSchemaResponse
```

### Code Sketch

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelStepSchemaService {

    private final ChannelStoreConnectionService storeConnectionService;
    private final ChannelService channelService;
    private final EcommerceMasterAttributeMongoRepository attributeRepository;
    private final ChannelProductDataRepository channelProductDataRepository;
    private final MasterAttributeSchemaService attributeSchemaService;

    public Mono<ChannelStepSchemaResponse> generateSchema(
            String masterProductId,
            String organizationId,
            List<Map<String, Object>> masterVariants) {

        // 1. Load all active stores for the org
        return storeConnectionService.getActiveStores(organizationId)
                .collectList()
                .flatMap(stores -> {
                    // 2. Build schema for each store in parallel
                    List<Mono<ChannelSchemaPerStore>> storeSchemaMono = stores.stream()
                            .map(store -> buildStoreSchema(
                                    store, masterProductId, organizationId, masterVariants))
                            .toList();

                    return Flux.merge(storeSchemaMono)
                            .sort(Comparator.comparing(s -> s.getDisplayOrder()))
                            .collectList();
                })
                .map(storeSchemas -> ChannelStepSchemaResponse.builder()
                        .step(2)
                        .masterProductId(masterProductId)
                        .channels(storeSchemas)
                        .build());
    }

    private Mono<ChannelSchemaPerStore> buildStoreSchema(
            ChannelStoreConnection store,
            String masterProductId,
            String organizationId,
            List<Map<String, Object>> masterVariants) {

        // Load in parallel: channel config + attributes + saved data
        return Mono.zip(
                channelService.getChannelById(store.getChannelType()),
                attributeRepository.findByIsChannelFieldTrueAndSupportedChannelsContaining(
                        store.getChannelType()).collectList(),
                channelProductDataRepository
                        .findByMasterProductIdAndStoreId(masterProductId, store.getStoreId())
                        .defaultIfEmpty(emptyData(masterProductId, store))
        ).map(tuple -> {
            ChannelConfiguration channelConfig = tuple.getT1();
            List<EcommerceMasterAttributeDocument> attrs = tuple.getT2();
            ChannelProductData savedData = tuple.getT3();

            // Build field lookup map for fast enrichment
            Map<String, EcommerceMasterAttributeDocument> attrByName = attrs.stream()
                    .collect(Collectors.toMap(
                            EcommerceMasterAttributeDocument::getFieldName,
                            a -> a, (a, b) -> a));

            // Build sections
            List<ChannelFormSection> sections = new ArrayList<>();

            sections.add(buildRequiredSection(
                    channelConfig.getRequiredFieldObjects(), attrByName, savedData));
            sections.add(buildRecommendedSection(
                    channelConfig.getRecommendedFields(), attrByName, savedData));
            sections.add(buildVariantOverridesSection(
                    attrs, masterVariants, savedData));
            sections.add(buildOptionalSection(
                    attrs, channelConfig, attrByName, savedData));

            // Calculate completion
            int reqTotal  = channelConfig.getRequiredFieldObjects() != null
                    ? channelConfig.getRequiredFieldObjects().size() : 0;
            int reqFilled = countFilledRequired(
                    channelConfig.getRequiredFieldObjects(), savedData.getChannelData());

            int completionPct = reqTotal > 0 ? (reqFilled * 100 / reqTotal) : 100;

            return ChannelSchemaPerStore.builder()
                    .channelType(store.getChannelType())
                    .storeId(store.getStoreId())
                    .storeName(store.getStoreName())
                    .storeUrl(store.getStoreUrl())
                    .displayOrder(store.getDisplayOrder())
                    .completionStatus(savedData.getStatus().name())
                    .completionPercentage(completionPct)
                    .sections(sections)
                    .completionStats(CompletionStats.builder()
                            .requiredTotal(reqTotal)
                            .requiredFilled(reqFilled)
                            .build())
                    .build();
        });
    }

    private ChannelFormSection buildRequiredSection(
            List<ChannelConfiguration.RequiredField> requiredFields,
            Map<String, EcommerceMasterAttributeDocument> attrByName,
            ChannelProductData savedData) {

        List<ChannelFormField> fields = requiredFields == null ? List.of() :
                requiredFields.stream()
                        .map(rf -> buildFormField(
                                rf.getFieldName(), true,
                                attrByName.get(rf.getFieldName()),
                                savedData.getChannelData()))
                        .toList();

        return ChannelFormSection.builder()
                .sectionName("required")
                .label("Required Fields")
                .description("Must be filled before publishing to this channel")
                .priority(1)
                .fields(fields)
                .build();
    }

    private ChannelFormSection buildVariantOverridesSection(
            List<EcommerceMasterAttributeDocument> attrs,
            List<Map<String, Object>> masterVariants,
            ChannelProductData savedData) {

        // Variant-scoped channel fields
        List<EcommerceMasterAttributeDocument> variantAttrs = attrs.stream()
                .filter(a -> "variant_only".equals(a.getVariantScope())
                        || "dual".equals(a.getVariantScope()))
                .toList();

        List<ChannelFormField> variantFields = variantAttrs.stream()
                .map(a -> buildFormField(a.getFieldName(), false, a, Map.of()))
                .toList();

        // One row per variant from the master product
        List<VariantOverrideRow> variantRows = masterVariants.stream()
                .map(v -> {
                    String sku = String.valueOf(v.get("sku"));
                    Map<String, Object> existing = savedData.getVariantOverrides() != null
                            ? savedData.getVariantOverrides().getOrDefault(sku, Map.of())
                            : Map.of();
                    return VariantOverrideRow.builder()
                            .sku(sku)
                            .currentOverrides(existing)
                            .build();
                })
                .toList();

        return ChannelFormSection.builder()
                .sectionName("variant_overrides")
                .label("Variant Overrides")
                .priority(3)
                .displayAs(masterVariants.size() >= 2 ? "TABLE" : "FORM")
                .variantFields(variantFields)
                .variants(variantRows)
                .build();
    }

    private ChannelFormField buildFormField(
            String fieldName, boolean required,
            EcommerceMasterAttributeDocument attr,
            Map<String, Object> savedData) {

        return ChannelFormField.builder()
                .fieldName(fieldName)
                .fieldType(attr != null ? mapFieldType(attr.getFieldType()) : "TEXT")
                .label(attr != null ? attr.getDescription() : fieldName)
                .required(required)
                .helpText(attr != null ? attr.getMappingHint() : null)
                .options(buildOptions(attr))
                .currentValue(savedData.get(fieldName))
                .build();
    }
}
```

---

## New Repository Method Required

Add to `EcommerceMasterAttributeMongoRepository`:

```java
@Query("{ 'active': true, 'isChannelField': true, 'supportedChannels': { $in: [?0] } }")
Flux<EcommerceMasterAttributeDocument> findByIsChannelFieldTrueAndSupportedChannelsContaining(
        String channelType);
```

---

## How Required vs Recommended vs Optional is Determined

```
Field classification priority:

1. If fieldName is in channel_configurations.requiredFieldObjects[]
   → section = "required"

2. Else if fieldName is in channel_configurations.recommendedFields[]
   → section = "recommended"

3. Else if EcommerceMasterAttributeDocument.variantScope = "variant_only" or "dual"
   → section = "variant_overrides"

4. Else (remaining channel fields)
   → section = "optional"
```

This means:
- `channel_configurations` **owns the classification** (required vs recommended)
- `EcommerceMasterAttributeDocument` **owns the field metadata** (label, type, validation)
- The service **joins them** to produce a rich, classified schema

---

## Cross-Store Value Inheritance

When the same org has `shopify-us-store` and `shopify-eu-store`, the frontend can
offer "inherit from another store". The backend supports this via:

```
GET /api/v1/ecommerce/channel-product-data/{masterProductId}/{sourceStoreId}
```

The frontend copies the `channelData` from source store and populates the target
store's form. The user can override individual fields before saving.

This is purely a **frontend convenience** — the backend saves each store independently.
