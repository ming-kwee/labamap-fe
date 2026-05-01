# Backend Recommendation — Phase 3: Hierarchical Category Tree (Scenario C)

**Date:** 2026-03-07
**Author:** Frontend Team
**Status:** Frontend complete. Backend implementation required.
**Priority:** High — category is a required field on every major channel; sellers cannot
              publish without selecting a valid leaf category.

---

## Overview

Each channel (Lazada, Shopee, TikTok Shop, Amazon) organises its product catalogue into
a deep tree of categories (3–6 levels, up to 50 000 nodes). Sellers must navigate this
tree level-by-level and commit a leaf node ID. The leaf node ID is what the channel
platform requires in the listing payload.

This cannot be solved by Scenario A (flat SELECT) because:
- The full tree is too large to embed in the schema response.
- Selection is **stateful** — each level's options depend on what the user picked at the
  previous level.

Phase 3 adds:
1. A new `CATEGORY_TREE` field type in the schema response.
2. A `categoryTreeConfig` object telling the frontend which endpoints to call.
3. Two backend endpoints: one for the root level, one for children of a given parent.
4. An optional `selectedPath` array so the frontend can display the full breadcrumb for
   a previously saved leaf node without re-fetching.
5. A scheduled `CategorySyncJob` that caches the full tree in MongoDB (24 h TTL) so the
   per-level endpoints serve from cache rather than hitting the channel API on every request.

The frontend `CategoryTreePicker` component is already complete. It calls these endpoints
as the seller drills down through levels.

---

## 1. New Field Type in Schema Response

### `ChannelFormFieldDto` extension

Add `"CATEGORY_TREE"` as a valid `fieldType` value. Also add `categoryTreeConfig` (nullable
for non-category fields):

```java
public class ChannelFormFieldDto {
    // ... existing fields ...

    // New field type value: "CATEGORY_TREE"
    private String fieldType;  // already exists — just add "CATEGORY_TREE" to allowed values

    /**
     * Only present when fieldType == "CATEGORY_TREE".
     * Null for all other field types.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private CategoryTreeConfigDto categoryTreeConfig;
}
```

### `CategoryTreeConfigDto`

```java
public record CategoryTreeConfigDto(

    /**
     * Endpoint for the root level (no parentId).
     * Pre-built relative path the frontend calls directly.
     * e.g. "/merchant-data/lazada/store-abc/categories?organizationId=org_123"
     */
    String rootEndpoint,

    /**
     * Endpoint template for loading children. Use {parentId} literal as placeholder.
     * e.g. "/merchant-data/lazada/store-abc/categories?parentId={parentId}&organizationId=org_123"
     * The frontend replaces {parentId} with the selected node's id before fetching.
     */
    String childEndpoint,

    /** Maximum depth of this channel's category tree — used for UI hints */
    int maxDepth,

    /**
     * If true, the seller must select a leaf node (hasChildren=false).
     * If false, intermediate nodes can also be committed.
     * Most channels require leaf selection.
     */
    boolean requireLeafNode,

    /**
     * Optional: pre-populated breadcrumb path for the currently saved leaf value.
     * The last entry is the committed leaf node. Allows the frontend to display
     * "Electronics › Mobile Phones › Smartphones" on load without re-fetching.
     * Omit if no value is currently saved for this field.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    List<CategoryNodeDto> selectedPath

) {}

public record CategoryNodeDto(
    String id,
    String name,
    boolean hasChildren
) {}
```

### Example schema field JSON

```json
{
  "fieldName": "primary_category_id",
  "fieldType": "CATEGORY_TREE",
  "label": "Product Category",
  "required": true,
  "helpText": "Select the most specific category that fits your product.",
  "currentValue": "10001234",
  "categoryTreeConfig": {
    "rootEndpoint": "/merchant-data/lazada/store-abc/categories?organizationId=org_123",
    "childEndpoint": "/merchant-data/lazada/store-abc/categories?parentId={parentId}&organizationId=org_123",
    "maxDepth": 5,
    "requireLeafNode": true,
    "selectedPath": [
      { "id": "1000", "name": "Electronics",    "hasChildren": true },
      { "id": "1050", "name": "Mobile Phones",  "hasChildren": true },
      { "id": "1051", "name": "Smartphones",    "hasChildren": true },
      { "id": "10001234", "name": "Android Phones", "hasChildren": false }
    ]
  }
}
```

---

## 2. New REST Endpoints

Both endpoints are served by a new controller (or extend the existing `MerchantDataController`).

### Root level

```
GET /api/v1/merchant-data/{channelType}/{storeId}/categories
    ?organizationId={organizationId}
```

Omit `parentId` → returns the top-level category nodes.

### Children of a node

```
GET /api/v1/merchant-data/{channelType}/{storeId}/categories
    ?parentId={parentId}&organizationId={organizationId}
```

### Response (both endpoints)

```json
[
  { "id": "1000", "name": "Electronics",   "hasChildren": true  },
  { "id": "2000", "name": "Fashion",       "hasChildren": true  },
  { "id": "3000", "name": "Home & Living", "hasChildren": true  }
]
```

### Controller

```java
@RestController
@RequestMapping("/api/v1/merchant-data")
public class MerchantDataController {

    private final Map<String, ChannelMerchantDataService> merchantDataServices;
    private final CategoryCacheService categoryCacheService;

    // ... existing field-options endpoint from Phase 1 ...

    @GetMapping("/{channelType}/{storeId}/categories")
    public Mono<List<CategoryNodeDto>> getCategories(
            @PathVariable String channelType,
            @PathVariable String storeId,
            @RequestParam(required = false) String parentId,
            @RequestParam String organizationId) {

        return categoryCacheService
            .getChildren(channelType, storeId, parentId, organizationId)
            .map(nodes -> nodes.stream()
                .map(n -> new CategoryNodeDto(n.getId(), n.getName(), n.isHasChildren()))
                .toList());
    }
}
```

**Error handling:** Return `200` with `[]` if the channel API is unavailable. Log the error.
Never return `4xx/5xx` — the frontend handles an empty list gracefully.

---

## 3. Category Cache Service

### `CategoryCacheService` interface

```java
package com.labamap.ecommerce.channel.category;

import reactor.core.publisher.Mono;
import java.util.List;

public interface CategoryCacheService {

    /**
     * Returns the immediate children of parentId, or top-level nodes if parentId is null.
     * Reads from channel_category_cache first; falls back to live channel API on miss.
     *
     * @param channelType    e.g. "lazada"
     * @param storeId        the merchant's store
     * @param parentId       null = root level
     * @param organizationId owning org
     */
    Mono<List<CategoryNode>> getChildren(
        String channelType, String storeId,
        String parentId, String organizationId);

    /**
     * Returns the full path from root to a given nodeId.
     * Used to populate categoryTreeConfig.selectedPath when building the schema response.
     * Returns empty list if nodeId is not found in cache.
     */
    Mono<List<CategoryNode>> getPathToNode(
        String channelType, String storeId, String nodeId, String organizationId);
}
```

### `CategorySyncJob` — scheduled full-tree cache warm-up

```java
@Component
@RequiredArgsConstructor
public class CategorySyncJob {

    private final Map<String, ChannelMerchantDataService> merchantDataServices;
    private final ChannelCategoryRepository categoryRepository;

    /**
     * Runs every 24 hours (configurable via properties).
     * Fetches the full category tree from each channel for each active store
     * and stores it in channel_category_cache for fast per-level serving.
     */
    @Scheduled(cron = "${channel.category.sync.cron:0 0 2 * * *}")
    public void syncAllChannelCategories() {
        // For each active ChannelStoreConnection:
        //   1. Call channel API's category tree endpoint (full tree)
        //   2. Flatten into CategoryCacheDocument records (one per node)
        //   3. Upsert into channel_category_cache with TTL 24h
        log.info("CategorySyncJob starting...");
        // Implementation delegates to per-channel ChannelMerchantDataService
    }
}
```

---

## 4. MongoDB Collection — `channel_category_cache`

One document per node. Index on `(channelType, storeId, nodeId)` and
`(channelType, storeId, parentId)` for fast child lookups.

```json
{
  "_id": "ObjectId",
  "channelType": "lazada",
  "storeId": "store-abc",
  "nodeId": "1050",
  "name": "Mobile Phones",
  "parentId": "1000",
  "hasChildren": true,
  "depth": 1,
  "pathFromRoot": ["1000", "1050"],
  "syncedAt": "2026-03-07T02:00:00Z",
  "expireAt": "2026-03-08T02:00:00Z"
}
```

Use MongoDB TTL index on `expireAt` for automatic cleanup:

```java
@Document(collection = "channel_category_cache")
@CompoundIndexes({
    @CompoundIndex(def = "{'channelType':1,'storeId':1,'nodeId':1}", unique = true),
    @CompoundIndex(def = "{'channelType':1,'storeId':1,'parentId':1}")
})
public class ChannelCategoryCacheDocument {
    @Id private String id;
    private String channelType;
    private String storeId;
    private String nodeId;
    private String name;
    private String parentId;    // null for root-level nodes
    private boolean hasChildren;
    private int depth;
    private List<String> pathFromRoot;
    private Instant syncedAt;

    @Indexed(expireAfterSeconds = 0)
    private Instant expireAt;   // set to syncedAt + 24h by the sync job
}
```

---

## 5. Channel API Implementations for Category Fetching

Extend `ChannelMerchantDataService` (from Phase 1) with a category tree method,
or create a separate `ChannelCategoryService` interface:

```java
public interface ChannelCategoryService {
    String getChannelType();

    /**
     * Fetches direct children of parentId from the channel API.
     * parentId == null returns the root level.
     */
    Mono<List<CategoryNode>> fetchChildren(String storeId, String parentId, String organizationId);

    /**
     * Fetches the full category tree (used by CategorySyncJob).
     * May return a very large list. Implementations should paginate if needed.
     */
    Flux<CategoryNode> fetchFullTree(String storeId, String organizationId);
}
```

### Phase 3 implementations to build

#### `LazadaCategoryService`

```java
@Service
public class LazadaCategoryService implements ChannelCategoryService {

    @Override public String getChannelType() { return "lazada"; }

    @Override
    public Mono<List<CategoryNode>> fetchChildren(String storeId, String parentId, String organizationId) {
        // Lazada Open Platform: GET /category/tree/get
        // or GET /category/tree/get?parentCategoryId={parentId}
        // Map: categoryId → nodeId, name → name, leaf → !hasChildren
    }
}
```

#### `TikTokCategoryService`

```java
@Service
public class TikTokCategoryService implements ChannelCategoryService {

    @Override public String getChannelType() { return "tiktok"; }

    @Override
    public Mono<List<CategoryNode>> fetchChildren(String storeId, String parentId, String organizationId) {
        // TikTok Partner API: GET /api/products/categories
        // parentId param: category_id
    }
}
```

#### `ShopeeCategoryService`

```java
@Service
public class ShopeeCategoryService implements ChannelCategoryService {

    @Override public String getChannelType() { return "shopee"; }

    @Override
    public Mono<List<CategoryNode>> fetchChildren(String storeId, String parentId, String organizationId) {
        // Shopee Open Platform API: shop.get_categories
    }
}
```

Additional channels (`ShopifyCategoryService`, `AmazonCategoryService`) follow the same
pattern. Stub implementations returning `Mono.just(List.of())` are acceptable for
channels not yet integrated — the picker will show an empty list rather than crashing.

### Bean registration

```java
@Configuration
public class CategoryServiceConfig {

    @Bean
    public Map<String, ChannelCategoryService> channelCategoryServices(
            List<ChannelCategoryService> implementations) {
        return implementations.stream()
            .collect(Collectors.toMap(
                ChannelCategoryService::getChannelType,
                Function.identity()
            ));
    }
}
```

---

## 6. Schema Generation Update — `ChannelStepSchemaService`

When the schema service encounters a field with `fieldType == CATEGORY_TREE`, build
the `categoryTreeConfig` using the pre-built endpoint paths and optionally populate
`selectedPath` for the current value.

```java
private ChannelFormFieldDto buildCategoryTreeField(
        EcommerceMasterAttributeDocument attribute,
        String channelType, String storeId,
        Object currentValue, String organizationId) {

    ChannelFormFieldDto field = mapBaseFields(attribute, currentValue);
    field.setFieldType("CATEGORY_TREE");

    String baseUrl = String.format(
        "/merchant-data/%s/%s/categories?organizationId=%s",
        URLEncoder.encode(channelType, UTF_8),
        URLEncoder.encode(storeId, UTF_8),
        URLEncoder.encode(organizationId, UTF_8)
    );
    String childUrl = baseUrl + "&parentId={parentId}";

    List<CategoryNodeDto> selectedPath = null;
    if (currentValue != null) {
        selectedPath = categoryCacheService
            .getPathToNode(channelType, storeId, String.valueOf(currentValue), organizationId)
            .timeout(Duration.ofSeconds(2))
            .onErrorResume(e -> {
                log.warn("Could not resolve category path for {}: {}", currentValue, e.getMessage());
                return Mono.just(List.of());
            })
            .blockOptional()
            .orElse(List.of())
            .stream()
            .map(n -> new CategoryNodeDto(n.getId(), n.getName(), n.isHasChildren()))
            .toList();

        if (selectedPath.isEmpty()) selectedPath = null; // omit from JSON if not found
    }

    field.setCategoryTreeConfig(new CategoryTreeConfigDto(
        baseUrl, childUrl,
        attribute.getCategoryTreeMaxDepth(),  // new field on EcommerceMasterAttributeDocument
        attribute.isCategoryTreeRequireLeaf(),
        selectedPath
    ));

    return field;
}
```

### New fields on `EcommerceMasterAttributeDocument`

```java
/** Only for fieldType == CATEGORY_TREE. Maximum depth of this channel's tree. */
private int categoryTreeMaxDepth = 5;

/** Only for fieldType == CATEGORY_TREE. If true, only leaf nodes can be committed. */
private boolean categoryTreeRequireLeaf = true;
```

**Seed data** for these fields:

| channelType | fieldName | categoryTreeMaxDepth | categoryTreeRequireLeaf |
|-------------|-----------|---------------------|------------------------|
| `lazada` | `primary_category_id` | 5 | true |
| `tiktok` | `category_id` | 4 | true |
| `shopee` | `category_id` | 4 | true |
| `amazon` | `node_id` | 6 | true |

---

## 7. Integration with Phase 2 (Scenario B) — Suggested Category

If `masterMappedSuggestion` is also set on a `CATEGORY_TREE` field (i.e. the backend found
an EXACT mapping from the master `category` field to a channel category ID), the
frontend's `CategoryTreePicker` renders a one-click "Accept suggested category" banner.

To enable this, populate `masterMappedSuggestion` on the `CATEGORY_TREE` field exactly
as described in Phase 2, in addition to `categoryTreeConfig`:

```json
{
  "fieldName": "primary_category_id",
  "fieldType": "CATEGORY_TREE",
  "categoryTreeConfig": { ... },
  "masterMappedSuggestion": {
    "masterField": "category",
    "masterValue": "T-Shirt",
    "suggestedValue": "10001234",
    "suggestedLabel": "Men's T-Shirts",
    "confidence": "EXACT"
  }
}
```

The `channel_field_value_mappings` collection (Phase 2) handles this — no new backend
work is needed beyond adding the right mapping entries.

---

## 8. Caching and Performance

| Concern | Recommendation |
|---------|---------------|
| Root and child level requests | Serve from `channel_category_cache` (MongoDB). Cache TTL: 24 h. |
| Cache miss | Fall through to live channel API, cache the result, return. |
| `selectedPath` resolution | Use `pathFromRoot` field stored in `channel_category_cache`. O(1) lookup by `nodeId`. |
| Full-tree warm-up | `CategorySyncJob` runs at 02:00 daily. Also run on first store connection. |
| Concurrent requests during cold cache | Stampede protection: use reactive `Mono.cache()` or a per-key lock. |
| Very large trees (Amazon, > 100 000 nodes) | Sync job paginates. Per-level endpoint always returns only direct children — no large payloads. |

---

## 9. `EcommerceMasterAttributeDocument` — field type enum

Add `CATEGORY_TREE` to the `FieldType` enum used in `EcommerceMasterAttributeDocument`:

```java
public enum FieldType {
    TEXT, TEXTAREA, NUMBER, SELECT, MULTISELECT,
    CHECKBOX, RADIO, DATE, URL, EMAIL, COLOR,
    CATEGORY_TREE  // Phase 3
}
```

---

## Implementation Order

1. **`channel_category_cache` collection** — create document schema + indexes
2. **`ChannelCategoryService` interface** — define interface and `CategoryNode` record
3. **Stub implementations** — `LazadaCategoryService` and `TikTokCategoryService`
   returning hardcoded test nodes (unblocks integration testing immediately)
4. **`CategoryCacheService`** — implement `getChildren()` + `getPathToNode()`
   (reads cache; on miss, calls stub; stores in cache)
5. **REST endpoint** — `GET /merchant-data/{channelType}/{storeId}/categories`
6. **Schema generation** — update `ChannelStepSchemaService` to emit `CATEGORY_TREE`
   field type + `categoryTreeConfig`
7. **`CategorySyncJob`** — full-tree sync scheduled job
8. **Real channel API calls** — replace stubs with live Lazada / TikTok calls
9. **Phase 2 integration** — add category mappings to `channel_field_value_mappings`
   for EXACT suggestion on `primary_category_id`

---

## Frontend Contract (do not break)

The frontend reads these exact fields. Changing names or nesting will break the picker:

| Field | Type | Notes |
|-------|------|-------|
| `fieldType` | `"CATEGORY_TREE"` | Triggers `CategoryTreePicker` instead of regular input |
| `categoryTreeConfig.rootEndpoint` | `string` | Relative path including all static query params |
| `categoryTreeConfig.childEndpoint` | `string` | Template with literal `{parentId}` placeholder |
| `categoryTreeConfig.maxDepth` | `number` | Informational; used for future validation |
| `categoryTreeConfig.requireLeafNode` | `boolean` | If true, only leaf nodes can be committed |
| `categoryTreeConfig.selectedPath` | `CategoryNode[] \| null` | Breadcrumb for current value; omit if not found |
| Each `CategoryNode.id` | `string` | Becomes the field's saved value on leaf selection |
| Each `CategoryNode.hasChildren` | `boolean` | false = leaf; selection commits immediately |

**Root endpoint called when picker opens.** Child endpoint called on each drill-down.
Both return `CategoryNode[]` (flat array, direct children only).

---

## Testing Checklist

- [ ] `GET /merchant-data/lazada/{storeId}/categories` (no parentId) returns top-level nodes
- [ ] `GET /merchant-data/lazada/{storeId}/categories?parentId=1000` returns children of node 1000
- [ ] Response format: `[{ "id": "...", "name": "...", "hasChildren": true/false }]`
- [ ] Schema field with `fieldType: "CATEGORY_TREE"` includes `categoryTreeConfig` object
- [ ] `rootEndpoint` and `childEndpoint` in `categoryTreeConfig` are valid relative paths
- [ ] `childEndpoint` contains the literal string `{parentId}` as placeholder
- [ ] `selectedPath` populated correctly when `currentValue` is set
- [ ] `selectedPath` absent (not null, omitted from JSON) when `currentValue` is null
- [ ] Cache hit: second call within 24 h does not call channel API
- [ ] Cache miss: live channel API is called, result cached, correct nodes returned
- [ ] `CategorySyncJob` runs without error and populates `channel_category_cache`
- [ ] Stub implementations return test nodes before real channel API is wired
- [ ] Channel API timeout / error: returns `200 []` without throwing 500
- [ ] Non-CATEGORY_TREE fields are completely unaffected
- [ ] `masterMappedSuggestion` + `CATEGORY_TREE`: frontend shows "Accept suggested category" banner
