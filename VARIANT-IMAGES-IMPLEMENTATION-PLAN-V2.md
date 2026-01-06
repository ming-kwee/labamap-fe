# Variant Images Implementation Plan V2

## Overview

**Goal:** Format variant images as a channel variant field to be sent to the sync API, which will handle the actual Shopify linking.

**Key Insight:** Backend doesn't merge images or create links. It just formats variant images into the correct data structure for the sync API to process.

---

## Required Data Structure

When calling `syncApiWebClient`, the payload needs this structure:

```json
{
  "vrntId": "channel_variant_images",
  "chnlVrntName": "product.variants.images",
  "chnlVrntValue": "[{\"src\":\"https://...\"}]",
  "chnlVrntType": "object[]",
  "isSupportField": true
}
```

**Fields Explained:**
- `vrntId`: Identifier for this variant field type
- `chnlVrntName`: Target path in Shopify API (`product.variants.images`)
- `chnlVrntValue`: JSON string containing array of image objects
- `chnlVrntType`: Data type (`object[]` indicates array of objects)
- `isSupportField`: Flag indicating this is a supported field

---

## Current Flow Analysis

### Existing Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ 1. ChannelPublishService.publishProduct()                   │
│    - Validates request                                       │
│    - Applies JOLT transformation                            │
│    - Applies post-processing                                │
│    - Converts to sync API format ← WHERE WE ADD LOGIC       │
│    - Calls syncApiWebClient                                 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. ChannelAttributeConverterService.convertToSyncRequest()  │
│    - Builds channelAttributes                               │
│    - Builds variantGroups                                   │
│    - Builds optionGroups                                    │
│    - Builds metadataGroups                                  │
│    - Returns SyncChannelProductRequest                      │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. SyncApiWebClient → Sync API Service                      │
│    - Processes variant images                               │
│    - Uploads images to Shopify                              │
│    - Links images to variants                               │
│    - Returns result                                         │
└──────────────────────────────────────────────────────────────┘
```

### Where to Add Variant Images

The variant images should be added in **Step 2** as part of the `variantGroups` in the sync request.

---

## Input Data Analysis

### Master Product Data

```json
{
  "name": "Cotton T-Shirt",
  "mainImage": [
    "https://cdn.example.com/main1.jpg",
    "https://cdn.example.com/main2.jpg"
  ],
  "variants": [
    {
      "id": "variant-red",
      "color": "Red",
      "sku": "TSHIRT-RED",
      "price": 29.99,
      "variantImage": "https://cdn.example.com/red.jpg"
    },
    {
      "id": "variant-blue",
      "color": "Blue",
      "sku": "TSHIRT-BLUE",
      "price": 29.99,
      "variantImage": "https://cdn.example.com/blue.jpg"
    },
    {
      "id": "variant-green",
      "color": "Green",
      "sku": "TSHIRT-GREEN",
      "price": 29.99,
      "variantImage": null
    }
  ]
}
```

### After JOLT Transformation

```json
{
  "product": {
    "title": "Cotton T-Shirt",
    "images": [
      {"src": "https://cdn.example.com/main1.jpg"},
      {"src": "https://cdn.example.com/main2.jpg"}
    ],
    "variants": [
      {
        "id": "variant-red",
        "sku": "TSHIRT-RED",
        "price": 29.99,
        "option1": "Red",
        "variantImage": "https://cdn.example.com/red.jpg"  // ← Keep this
      },
      {
        "id": "variant-blue",
        "sku": "TSHIRT-BLUE",
        "price": 29.99,
        "option1": "Blue",
        "variantImage": "https://cdn.example.com/blue.jpg"
      },
      {
        "id": "variant-green",
        "sku": "TSHIRT-GREEN",
        "price": 29.99,
        "option1": "Green",
        "variantImage": null
      }
    ]
  }
}
```

### Expected Sync Request

```json
{
  "masterProductId": "PROD123",
  "channelId": "shopify",
  "channelAttributes": [...],
  "variantGroups": [
    {
      "vrntId": "channel_variant_images",
      "chnlVrntName": "product.variants.images",
      "chnlVrntValue": "[{\"src\":\"https://cdn.example.com/red.jpg\"},{\"src\":\"https://cdn.example.com/blue.jpg\"}]",
      "chnlVrntType": "object[]",
      "isSupportField": true
    }
  ],
  "optionGroups": [...],
  "metadataGroups": [...]
}
```

---

## Decision: Can Use Adaptive Pattern or Manual JOLT?

### Question 1: Extract variantImage field

**Can Adaptive Pattern do this?** ✅ Yes, if configured

**Requirements:**
1. Field semantic knowledge has `variantImage` with semantic type `variant_image_url`
2. Channel field mapping exists for this semantic type
3. Adaptive pattern generates JOLT spec

**OR**

**Manual JOLT:** Just add to JOLT spec manually

```json
{
  "variants": {
    "*": {
      "variantImage": "product.variants[&1].variantImage"
    }
  }
}
```

### Question 2: Format as sync request structure

**Can Adaptive Pattern do this?** ❌ No

**Reason:** This is sync API-specific formatting, not field mapping

**Must be done in:** `ChannelAttributeConverterService`

### Conclusion

✅ **JOLT (Adaptive or Manual):** Extract variantImage field
✅ **ChannelAttributeConverterService:** Format for sync API
❌ **No Post-Processing needed** (unless we want extra validation)

---

## Implementation Plan

### Phase 1: JOLT Spec - Extract variantImage

#### Option A: Use Adaptive Pattern (Recommended if infrastructure exists)

**Step 1:** Check if field semantic knowledge exists

```java
// Check in field_semantic_knowledge collection
{
  "fieldName": "variantImage",
  "semanticType": "variant_image_url",
  "dataType": "string",
  "isArray": false
}
```

**Step 2:** Check if channel mapping exists

```java
// Check in channel_field_mappings collection
{
  "channelId": "shopify",
  "semanticType": "variant_image_url",
  "targetPath": "product.variants[].variantImage",
  "transformationType": "DIRECT"
}
```

If both exist, adaptive pattern will auto-generate JOLT spec ✅

#### Option B: Manual JOLT Spec Update (Faster for now)

Update the JOLT spec migration to include variantImage:

**File:** `JoltSpecImageMappingFixMigration.java` or new migration

```java
// In the shift spec, update variants mapping
Map<String, Object> variantFields = new HashMap<>();
variantFields.put("id", "product.variants[&1].id");
variantFields.put("sku", "product.variants[&1].sku");
variantFields.put("price", "product.variants[&1].price");
variantFields.put("cost", "product.variants[&1].cost");
variantFields.put("comparePrice", "product.variants[&1].compare_at_price");
variantFields.put("color", "product.variants[&1].color");
variantFields.put("size", "product.variants[&1].size");
variantFields.put("weight", "product.variants[&1].weight");
variantFields.put("stock", "product.variants[&1].inventory_quantity");
variantFields.put("barcode", "product.variants[&1].barcode");
variantFields.put("variantImage", "product.variants[&1].variantImage");  // ← ADD THIS

Map<String, Object> variantsMapping = new HashMap<>();
variantsMapping.put("*", variantFields);
shiftSpec.put("variants", variantsMapping);
```

**Recommendation:** Use Option B (manual) for now, migrate to adaptive pattern later if needed.

---

### Phase 2: Update ChannelAttributeConverterService

**File:** `ChannelAttributeConverterService.java`

**Current Method:**
```java
public SyncChannelProductRequest convertToSyncRequest(
    Map<String, Object> transformedData,
    PublishProductRequest request,
    ChannelConfiguration channelConfig,
    String publishId
) {
    // ... existing code ...
}
```

**Add Variant Image Processing:**

```java
/**
 * Extract variant images and format as channel variant group
 */
private List<SyncChannelProductRequest.VariantGroup> buildVariantGroups(
        Map<String, Object> transformedData,
        ChannelConfiguration channelConfig) {

    List<SyncChannelProductRequest.VariantGroup> variantGroups = new ArrayList<>();

    // Extract variants from transformed data
    Object productObj = transformedData.get("product");
    if (!(productObj instanceof Map)) {
        return variantGroups;
    }

    Map<String, Object> product = (Map<String, Object>) productObj;
    Object variantsObj = product.get("variants");

    if (!(variantsObj instanceof List)) {
        return variantGroups;
    }

    List<Map<String, Object>> variants = (List<Map<String, Object>>) variantsObj;

    // Collect variant images
    List<Map<String, Object>> variantImages = new ArrayList<>();

    for (Map<String, Object> variant : variants) {
        Object variantImageObj = variant.get("variantImage");

        if (variantImageObj != null && !variantImageObj.toString().trim().isEmpty()) {
            Map<String, Object> imageObj = new HashMap<>();
            imageObj.put("src", variantImageObj.toString());
            variantImages.add(imageObj);
        }
    }

    // Only create variant group if we have variant images
    if (!variantImages.isEmpty()) {
        try {
            // Convert to JSON string
            ObjectMapper objectMapper = new ObjectMapper();
            String variantImagesJson = objectMapper.writeValueAsString(variantImages);

            // Create variant group
            SyncChannelProductRequest.VariantGroup variantImageGroup =
                SyncChannelProductRequest.VariantGroup.builder()
                    .vrntId("channel_variant_images")
                    .chnlVrntName("product.variants.images")
                    .chnlVrntValue(variantImagesJson)
                    .chnlVrntType("object[]")
                    .isSupportField(true)
                    .build();

            variantGroups.add(variantImageGroup);

            log.info("Built variant images group with {} images", variantImages.size());

        } catch (Exception e) {
            log.error("Failed to serialize variant images", e);
        }
    }

    return variantGroups;
}
```

**Update convertToSyncRequest method:**

```java
public SyncChannelProductRequest convertToSyncRequest(
        Map<String, Object> transformedData,
        PublishProductRequest request,
        ChannelConfiguration channelConfig,
        String publishId) {

    // ... existing code ...

    // Build variant groups (NEW)
    List<SyncChannelProductRequest.VariantGroup> variantGroups = buildVariantGroups(
        transformedData,
        channelConfig
    );

    return SyncChannelProductRequest.builder()
        .masterProductId(request.getMasterProductId())
        .channelId(request.getChannelId())
        .publishId(publishId)
        .channelAttributes(channelAttributes)
        .variantGroups(variantGroups)  // ← ADD THIS
        .optionGroups(optionGroups)
        .metadataGroups(metadataGroups)
        .channelCredentials(channelCredentials)
        .build();
}
```

---

### Phase 3: Ensure SyncChannelProductRequest Has VariantGroups

**File:** `SyncChannelProductRequest.java`

**Check if VariantGroup model exists:**

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SyncChannelProductRequest {

    private String masterProductId;
    private String channelId;
    private String publishId;

    private List<ChannelAttribute> channelAttributes;
    private List<VariantGroup> variantGroups;  // ← Check this exists
    private List<OptionGroup> optionGroups;
    private List<MetadataGroup> metadataGroups;
    private Map<String, String> channelCredentials;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class VariantGroup {
        private String vrntId;
        private String chnlVrntName;
        private String chnlVrntValue;
        private String chnlVrntType;
        private Boolean isSupportField;
    }

    // ... other inner classes ...
}
```

**If VariantGroup doesn't exist, add it.**

---

### Phase 4: Update JOLT Spec Migration

**Create new migration:** `VariantImageJoltSpecMigration.java`

```java
package com.labamap.labamapomnichannelbe4fe.config;

import com.labamap.labamapomnichannelbe4fe.channel.model.entity.ChannelConfiguration;
import com.labamap.labamapomnichannelbe4fe.channel.repository.ChannelConfigurationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Component
@Order(8)
@RequiredArgsConstructor
public class VariantImageJoltSpecMigration implements CommandLineRunner {

    private final ChannelConfigurationRepository channelRepository;

    @Override
    public void run(String... args) {
        log.info("========================================");
        log.info("VARIANT IMAGE JOLT SPEC MIGRATION START");
        log.info("========================================");

        updateShopifyVariantImageMapping();

        log.info("========================================");
        log.info("VARIANT IMAGE JOLT SPEC MIGRATION END");
        log.info("========================================");
    }

    private void updateShopifyVariantImageMapping() {
        ChannelConfiguration shopifyConfig = channelRepository
            .findSystemDefaultByChannelId("shopify")
            .blockOptional()
            .orElse(null);

        if (shopifyConfig == null) {
            log.warn("Shopify configuration not found");
            return;
        }

        List<Map<String, Object>> joltSpec = shopifyConfig.getJoltSpec();
        if (joltSpec == null || joltSpec.isEmpty()) {
            log.warn("No JOLT spec found for Shopify");
            return;
        }

        // Find shift operation
        Map<String, Object> shiftOperation = joltSpec.stream()
            .filter(op -> "shift".equals(op.get("operation")))
            .findFirst()
            .orElse(null);

        if (shiftOperation == null) {
            log.warn("No shift operation found in JOLT spec");
            return;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> spec = (Map<String, Object>) shiftOperation.get("spec");

        if (spec == null) {
            log.warn("No spec found in shift operation");
            return;
        }

        // Get variants mapping
        @SuppressWarnings("unchecked")
        Map<String, Object> variantsMapping = (Map<String, Object>) spec.get("variants");

        if (variantsMapping == null) {
            log.warn("No variants mapping found in JOLT spec");
            return;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> variantFields = (Map<String, Object>) variantsMapping.get("*");

        if (variantFields == null) {
            log.warn("No variant fields mapping found");
            return;
        }

        // Check if variantImage already exists
        if (variantFields.containsKey("variantImage")) {
            log.info("✓ variantImage mapping already exists, skipping...");
            log.info("   Current mapping: variantImage → {}", variantFields.get("variantImage"));
            return;
        }

        // Add variantImage mapping
        variantFields.put("variantImage", "product.variants[&1].variantImage");

        // Save updated configuration
        shopifyConfig.setJoltSpec(joltSpec);
        shopifyConfig.setUpdatedAt(LocalDateTime.now());
        channelRepository.save(shopifyConfig).block();

        log.info("✅ Added variantImage mapping to Shopify JOLT spec");
        log.info("   variantImage → product.variants[&1].variantImage");
    }
}
```

---

### Phase 5: Testing

**Test Cases:**

#### Test 1: Variants with images
```json
// Input
{
  "variants": [
    {"variantImage": "red.jpg"},
    {"variantImage": "blue.jpg"}
  ]
}

// Expected in sync request
{
  "variantGroups": [
    {
      "vrntId": "channel_variant_images",
      "chnlVrntName": "product.variants.images",
      "chnlVrntValue": "[{\"src\":\"red.jpg\"},{\"src\":\"blue.jpg\"}]",
      "chnlVrntType": "object[]",
      "isSupportField": true
    }
  ]
}
```

#### Test 2: Some variants without images (null values)
```json
// Input
{
  "variants": [
    {"variantImage": "red.jpg"},
    {"variantImage": null},
    {"variantImage": "blue.jpg"}
  ]
}

// Expected (nulls filtered out)
{
  "variantGroups": [
    {
      "chnlVrntValue": "[{\"src\":\"red.jpg\"},{\"src\":\"blue.jpg\"}]"
    }
  ]
}
```

#### Test 3: No variant images
```json
// Input
{
  "variants": [
    {"variantImage": null},
    {"variantImage": ""}
  ]
}

// Expected (no variant group created)
{
  "variantGroups": []
}
```

#### Test 4: Empty variants array
```json
// Input
{
  "variants": []
}

// Expected
{
  "variantGroups": []
}
```

---

## Implementation Checklist

### Phase 1: JOLT Spec
- [ ] Create `VariantImageJoltSpecMigration.java`
- [ ] Add variantImage mapping to shift operation
- [ ] Test migration runs successfully
- [ ] Verify variantImage appears in transformed data

### Phase 2: Sync Request Conversion
- [ ] Check if `SyncChannelProductRequest.VariantGroup` exists
- [ ] Add `VariantGroup` model if missing
- [ ] Implement `buildVariantGroups()` method in `ChannelAttributeConverterService`
- [ ] Update `convertToSyncRequest()` to include variant groups
- [ ] Add logging for debugging

### Phase 3: Testing
- [ ] Test with variants containing images
- [ ] Test with null/empty variant images
- [ ] Test with no variants
- [ ] Verify JSON serialization is correct
- [ ] Check sync API receives correct format

### Phase 4: Validation (Optional)
- [ ] Add validation for variant image URLs
- [ ] Add error handling for serialization failures
- [ ] Add configuration flag to enable/disable feature

---

## Timeline Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | JOLT spec migration | 30 min |
| 2 | Check/add VariantGroup model | 15 min |
| 3 | Implement buildVariantGroups() | 1 hour |
| 4 | Update convertToSyncRequest() | 15 min |
| 5 | Testing (all cases) | 1 hour |
| 6 | Documentation | 15 min |

**Total: ~3.5 hours**

---

## Key Differences from V1

| Aspect | V1 (Original) | V2 (Current) |
|--------|---------------|--------------|
| **Complexity** | High (merge arrays, create links) | Low (just format data) |
| **Post-Processing** | Required | Not needed |
| **Image Merging** | Backend merges main + variant images | Sync API handles separately |
| **Linking** | Backend creates variant_ids | Sync API creates links |
| **Backend Responsibility** | Transform and merge | Extract and format |
| **Time Estimate** | ~5 hours | ~3.5 hours |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  INPUT: Master Product Data                                 │
│  {                                                           │
│    mainImage: [...],                                        │
│    variants: [                                              │
│      {id: "v1", variantImage: "red.jpg"},                  │
│      {id: "v2", variantImage: "blue.jpg"}                  │
│    ]                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: JOLT Transformation                                │
│  - mainImage → product.images[].src                         │
│  - variants[].variantImage → product.variants[].variantImage│
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Convert to Sync Request                            │
│  ChannelAttributeConverterService.buildVariantGroups()      │
│  - Extract variants[].variantImage                          │
│  - Filter out nulls/empties                                 │
│  - Serialize to JSON string                                 │
│  - Wrap in VariantGroup structure                           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  OUTPUT: Sync Request                                        │
│  {                                                           │
│    variantGroups: [                                         │
│      {                                                       │
│        vrntId: "channel_variant_images",                    │
│        chnlVrntName: "product.variants.images",             │
│        chnlVrntValue: "[{\"src\":\"red.jpg\"}...]",         │
│        chnlVrntType: "object[]",                            │
│        isSupportField: true                                 │
│      }                                                       │
│    ]                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Sync API (External Service)                                │
│  - Uploads images to Shopify                                │
│  - Links images to variants                                 │
│  - Handles all Shopify-specific logic                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Answer to Original Question

> "Do they can be implement using adaptive pattern or have to use jolt-postprocessing?"

**Answer:**

✅ **Partial Adaptive Pattern + Service Layer (No Post-Processing)**

**Breakdown:**
1. **JOLT (Adaptive or Manual):** Extract `variantImage` field ✅
2. **ChannelAttributeConverterService:** Format as sync API structure ✅
3. **Post-Processing:** NOT needed ✅
4. **Sync API:** Handles all Shopify operations ✅

**Why no post-processing?**
- No array merging needed
- No cross-referencing needed
- Just data extraction and formatting
- Sync API handles the complex logic

This approach is **much simpler** than V1!

---

**Document Version:** 2.0
**Created:** 2026-01-04
**Status:** Planning - Ready for Implementation
