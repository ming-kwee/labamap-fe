# Backend Recommendation — Phase 4: Category-Dependent Dynamic Field Injection (Scenario D)

**Date:** 2026-03-07
**Author:** Frontend Team
**Status:** Frontend complete. Backend implementation required.
**Priority:** High — required for all channels where category selection unlocks mandatory
              product attributes (Lazada, Shopee, TikTok Shop, Amazon).

---

## Overview

After the seller picks a leaf category in the Phase 3 `CategoryTreePicker`, the channel
platform requires a **different set of product attributes** depending on the exact category.
A phone listing needs RAM, storage, OS; a T-shirt listing needs sleeve_type, fit_type, neck_style.
These fields cannot be known in advance and are not stored in `EcommerceMasterAttributeDocument`.

Phase 4 adds:
1. A new REST endpoint that returns category-specific fields for a given leaf node ID.
2. A `categoryAttributeSection` embedded in the schema response when a category is already
   saved — so the form pre-populates without an extra round-trip on load.
3. Backend completeness validation that accounts for category-specific required fields on save.

The frontend's `ChannelStoreTab` is already complete:
- When the seller picks a leaf, it fetches category attributes and renders them.
- When the category changes, it clears stale field values automatically.
- On load, it uses `categoryAttributeSection` from the schema (if present) directly —
  no extra fetch needed.

---

## 1. New REST Endpoint — Category Attributes

```
GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes
    ?categoryId={leafNodeId}&organizationId={organizationId}
```

### Response

```json
{
  "categoryId": "10001234",
  "categoryName": "Smartphones",
  "categoryPath": ["Electronics", "Mobile Phones", "Smartphones"],
  "requiredFields": [
    {
      "fieldName": "ram",
      "fieldType": "SELECT",
      "label": "RAM",
      "required": true,
      "options": [
        { "value": "2", "label": "2 GB" },
        { "value": "4", "label": "4 GB" },
        { "value": "8", "label": "8 GB" },
        { "value": "12", "label": "12 GB" }
      ]
    },
    {
      "fieldName": "storage",
      "fieldType": "SELECT",
      "label": "Internal Storage",
      "required": true,
      "options": [
        { "value": "64", "label": "64 GB" },
        { "value": "128", "label": "128 GB" },
        { "value": "256", "label": "256 GB" }
      ]
    },
    {
      "fieldName": "os",
      "fieldType": "SELECT",
      "label": "Operating System",
      "required": true,
      "options": [
        { "value": "android", "label": "Android" },
        { "value": "ios", "label": "iOS" },
        { "value": "other", "label": "Other" }
      ]
    }
  ],
  "optionalFields": [
    {
      "fieldName": "screen_size_inches",
      "fieldType": "NUMBER",
      "label": "Screen Size (inches)",
      "required": false,
      "validationRules": { "min": 4.0, "max": 8.0 }
    },
    {
      "fieldName": "connectivity",
      "fieldType": "MULTISELECT",
      "label": "Connectivity",
      "required": false,
      "options": [
        { "value": "wifi", "label": "Wi-Fi" },
        { "value": "bluetooth", "label": "Bluetooth" },
        { "value": "nfc", "label": "NFC" },
        { "value": "5g", "label": "5G" }
      ]
    }
  ]
}
```

**Field types** in the response can be any `ChannelFieldType` — including `SELECT`,
`MULTISELECT`, `TEXT`, `NUMBER`, `TEXTAREA`. They follow the same shape as regular
`ChannelFormField` objects, so the existing `ChannelFieldInput` component renders them
without changes.

**Error handling:** Return `200` with `requiredFields: []` and `optionalFields: []` if the
channel API is unavailable. Log the error. Never return `4xx/5xx`.

### Controller addition

```java
@GetMapping("/{channelType}/{storeId}/category-attributes")
public Mono<CategoryAttributesResponse> getCategoryAttributes(
        @PathVariable String channelType,
        @PathVariable String storeId,
        @RequestParam String categoryId,
        @RequestParam String organizationId) {

    ChannelCategoryService svc = channelCategoryServices.get(channelType);
    if (svc == null) {
        return Mono.just(CategoryAttributesResponse.empty(categoryId));
    }
    return svc.fetchCategoryAttributes(storeId, categoryId, organizationId);
}

public record CategoryAttributesResponse(
    String categoryId,
    String categoryName,
    List<String> categoryPath,
    List<ChannelFormFieldDto> requiredFields,
    List<ChannelFormFieldDto> optionalFields
) {
    public static CategoryAttributesResponse empty(String categoryId) {
        return new CategoryAttributesResponse(categoryId, "", List.of(), List.of(), List.of());
    }
}
```

---

## 2. `ChannelCategoryService` Extension

Add `fetchCategoryAttributes` to the existing `ChannelCategoryService` interface
(introduced in Phase 3):

```java
public interface ChannelCategoryService {
    String getChannelType();

    // ... existing methods from Phase 3 ...

    /**
     * Fetches the set of product attributes required/optional for the given leaf category.
     * These fields differ per category — a Smartphone listing needs RAM, storage, OS;
     * a T-shirt listing needs sleeve_type, fit_type, neck_style.
     *
     * @param storeId        the merchant's store
     * @param categoryId     the leaf node ID from the category tree
     * @param organizationId owning org (for credential resolution)
     */
    Mono<CategoryAttributesResponse> fetchCategoryAttributes(
        String storeId, String categoryId, String organizationId);
}
```

### Phase 4 implementations

#### `LazadaCategoryService`

```java
@Override
public Mono<CategoryAttributesResponse> fetchCategoryAttributes(
        String storeId, String categoryId, String organizationId) {
    // Lazada Open Platform: GET /category/attributes/get?primaryCategoryId={categoryId}
    // Returns: List of attribute objects with inputType, isMandatory, options[]
    // Map to ChannelFormFieldDto (SELECT for enum type, TEXT/TEXTAREA for freetext)
}
```

#### `TikTokCategoryService`

```java
@Override
public Mono<CategoryAttributesResponse> fetchCategoryAttributes(
        String storeId, String categoryId, String organizationId) {
    // TikTok Partner API: GET /api/product/category_attribute
    //   ?category_id={categoryId}
    // Returns: attribute_list[] with input_type, is_required, values[]
}
```

#### `ShopeeCategoryService`

```java
@Override
public Mono<CategoryAttributesResponse> fetchCategoryAttributes(
        String storeId, String categoryId, String organizationId) {
    // Shopee Open Platform: shop.get_attributes
    //   mandatory: attributeId, name, isMandatory, inputType, values[]
}
```

Stub implementations returning `CategoryAttributesResponse.empty(categoryId)` are
acceptable for channels not yet integrated.

---

## 3. Schema Response Extension — `categoryAttributeSection`

When `ChannelStepSchemaService` builds a `ChannelSchemaPerStore`, if the store already
has a saved value for its `CATEGORY_TREE` field (`channelData.primary_category_id` etc.),
pre-fetch the category attributes and embed them in the response:

```java
// Inside ChannelStepSchemaService.buildSchemaPerStore(...)

String savedCategoryId = (String) existingChannelData.get(categoryFieldName);
CategoryAttributesResponse categoryAttrs = null;

if (savedCategoryId != null) {
    ChannelCategoryService catSvc = channelCategoryServices.get(channelType);
    if (catSvc != null) {
        categoryAttrs = catSvc
            .fetchCategoryAttributes(storeId, savedCategoryId, organizationId)
            .timeout(Duration.ofSeconds(3))
            .onErrorResume(e -> {
                log.warn("Category attrs pre-fetch failed for {}/{}: {}",
                    channelType, savedCategoryId, e.getMessage());
                return Mono.empty();
            })
            .blockOptional()
            .orElse(null);
    }
}

ChannelSchemaPerStoreDto schema = buildBaseSchema(...);
if (categoryAttrs != null) {
    schema.setCategoryAttributeSection(toCategoryAttributeSectionDto(categoryAttrs));
}
return schema;
```

### New DTO — `CategoryAttributeSectionDto`

```java
public record CategoryAttributeSectionDto(
    String categoryId,
    String categoryName,
    List<String> categoryPath,
    List<ChannelFormFieldDto> requiredFields,
    List<ChannelFormFieldDto> optionalFields
) {}
```

Add to `ChannelSchemaPerStoreDto`:

```java
@JsonInclude(JsonInclude.Include.NON_NULL)
private CategoryAttributeSectionDto categoryAttributeSection;
```

---

## 4. Completeness Validation Update — Save Endpoint

When the frontend saves Step 2 data (`POST /api/v1/channel-products/save` or equivalent),
it now sends `categoryId` alongside `channelData`:

```json
{
  "masterProductId": "prod-123",
  "storeId": "store-abc",
  "channelType": "lazada",
  "categoryId": "10001234",
  "channelData": {
    "primary_category_id": "10001234",
    "ram": "8",
    "storage": "128",
    "os": "android"
  },
  "masterOverrides": {},
  "variantOverrides": {}
}
```

The backend `completionPercentage` calculation must be updated to include
category-specific required fields:

```java
// In ChannelProductCompletionService (or wherever completionPercentage is computed)

int completionNumerator = 0;
int completionDenominator = 0;

// 1. Count standard required fields from ChannelStepSchemaService
for (ChannelFormFieldDto field : standardRequiredFields) {
    completionDenominator++;
    if (channelData.containsKey(field.getFieldName()) &&
        channelData.get(field.getFieldName()) != null) {
        completionNumerator++;
    }
}

// 2. Count category-specific required fields (Scenario D)
if (categoryId != null) {
    ChannelCategoryService catSvc = channelCategoryServices.get(channelType);
    if (catSvc != null) {
        List<ChannelFormFieldDto> catRequiredFields = catSvc
            .fetchCategoryAttributes(storeId, categoryId, organizationId)
            .map(CategoryAttributesResponse::requiredFields)
            .blockOptional()
            .orElse(List.of());

        for (ChannelFormFieldDto field : catRequiredFields) {
            completionDenominator++;
            if (channelData.containsKey(field.getFieldName()) &&
                channelData.get(field.getFieldName()) != null) {
                completionNumerator++;
            }
        }
    }
}

int completionPercentage = completionDenominator == 0 ? 100
    : (completionNumerator * 100 / completionDenominator);
```

**Cache note:** Cache the `fetchCategoryAttributes` result using the same
`categoryCacheService` from Phase 3 (or a short TTL in-memory cache). This endpoint
is called on every save — it must not block due to channel API latency.

---

## 5. Caching Category Attributes

Store fetched category attributes in `channel_category_cache` alongside tree nodes,
or in a separate `channel_category_attributes_cache` collection:

```json
{
  "_id": "ObjectId",
  "channelType": "lazada",
  "storeId": "store-abc",
  "categoryId": "10001234",
  "requiredFields": [ ... ],
  "optionalFields": [ ... ],
  "syncedAt": "2026-03-07T02:00:00Z",
  "expireAt": "2026-03-08T02:00:00Z"
}
```

TTL: **24 hours** (same as category tree nodes — attributes change with tree updates).

The `CategorySyncJob` (Phase 3) should also warm up attributes for commonly used leaf
nodes (e.g. top 100 categories by usage frequency).

---

## 6. `categoryPath` Resolution

The `categoryPath` field (`["Electronics", "Mobile Phones", "Smartphones"]`) is needed
by the frontend for display only. Resolve it from `channel_category_cache` using
`pathFromRoot` (stored per-node in Phase 3):

```java
private List<String> resolveCategoryPath(String channelType, String storeId, String categoryId) {
    return categoryCacheService
        .getPathToNode(channelType, storeId, categoryId, organizationId)
        .map(nodes -> nodes.stream()
            .map(CategoryNode::getName)
            .toList())
        .blockOptional()
        .orElse(List.of());
}
```

---

## 7. Real-World Attribute Mappings by Channel

| Channel | API to fetch category attributes | Notes |
|---------|----------------------------------|-------|
| Lazada | `GET /category/attributes/get?primaryCategoryId=...` | Returns `attributeList[]` with `inputType` (ENUM_TYPE → SELECT, FREETEXT → TEXT) |
| TikTok Shop | `GET /api/product/category_attribute?category_id=...` | Returns `attribute_list[]`; values[] are the options |
| Shopee | `shop.get_attributes` | `attributeId`, `isMandatory`, `values[]` |
| Amazon | SP-API `getItemAttributes` or Browse Tree Guides | Complex; varies by marketplace |
| eBay | `GetCategorySpecifics` | Returns `NameRecommendation[]` with `ValidationRules` |

---

## 8. Frontend Contract (do not break)

The frontend reads these exact fields from `CategoryAttributeSection` in the schema:

| Field | Type | Notes |
|-------|------|-------|
| `categoryAttributeSection.categoryId` | `string` | Must match the saved `channelData[categoryFieldName]` value |
| `categoryAttributeSection.categoryName` | `string` | Shown in the section header |
| `categoryAttributeSection.categoryPath` | `string[]` | Breadcrumb labels (not IDs) |
| `categoryAttributeSection.requiredFields` | `ChannelFormField[]` | Always expanded; required = true |
| `categoryAttributeSection.optionalFields` | `ChannelFormField[]` | Collapsed by default |

Each field in `requiredFields` / `optionalFields` follows the standard `ChannelFormField`
shape — same as any other Step 2 field. The frontend renders them with `ChannelFieldInput`,
so all existing field types (SELECT, TEXT, NUMBER, MULTISELECT, etc.) work automatically.

**The category attribute endpoint response** (`GET /merchant-data/.../category-attributes`)
must follow the exact same structure as `categoryAttributeSection` in the schema, since the
frontend uses both interchangeably:

```json
{
  "categoryId":   "string",
  "categoryName": "string",
  "categoryPath": ["string"],
  "requiredFields": [ ChannelFormField ],
  "optionalFields": [ ChannelFormField ]
}
```

**The save request** (`ChannelStepSaveRequest`) now includes `categoryId`:
- Backend must accept this field and use it for completeness validation.
- If omitted (store has no `CATEGORY_TREE` field), ignore it.

---

## 9. Implementation Order

1. **`fetchCategoryAttributes` stub** — add to `LazadaCategoryService` and `TikTokCategoryService`, return hardcoded test fields for "Smartphones" (unblocks frontend integration testing)
2. **REST endpoint** — `GET /merchant-data/{channelType}/{storeId}/category-attributes`
3. **Cache** — store fetched attributes in `channel_category_attributes_cache`
4. **Schema pre-fetch** — update `ChannelStepSchemaService` to embed `categoryAttributeSection` when category is saved
5. **Save validation** — update `completionPercentage` calculation to include category-specific required fields; accept `categoryId` in save request
6. **`categoryPath` resolution** — use Phase 3 cache for breadcrumb labels
7. **Real channel API calls** — replace stubs with live Lazada / TikTok / Shopee attribute fetches
8. **`CategorySyncJob` extension** — warm up attributes for popular leaf nodes
9. **Additional channels** — Amazon, eBay

---

## Testing Checklist

- [ ] `GET /merchant-data/lazada/{storeId}/category-attributes?categoryId=10001234` returns `{ categoryId, categoryName, categoryPath, requiredFields, optionalFields }`
- [ ] `requiredFields` each have `required: true` and correct `fieldType`
- [ ] `optionalFields` each have `required: false`
- [ ] Schema response includes `categoryAttributeSection` when category is already saved
- [ ] `categoryAttributeSection.categoryId` matches `channelData[categoryFieldName]`
- [ ] `categoryAttributeSection` absent when no category is saved
- [ ] Frontend renders required category fields immediately on schema load (no spinner)
- [ ] Frontend fetches and renders new fields when seller changes category
- [ ] Frontend clears stale category field values when category changes
- [ ] Save request with `categoryId` triggers completeness recalculation including category required fields
- [ ] Completion bar reflects category-specific required fields correctly
- [ ] Channel API timeout (> 3 s) → endpoint returns `200` with empty fields arrays
- [ ] Cached attributes served on subsequent requests within 24 h
- [ ] Non-category-tree stores unaffected (`categoryAttributeSection` absent, save still works)
