# Step 2 — Channel Data Sources (Advanced)

## The Problem

The standard Step 2 implementation treats all field options as static data baked into the schema response, and `masterValue` as a raw mirror of what the master product stores. This breaks down for eleven real-world scenarios where different data-sourcing strategies are needed.

---

## The Eleven Scenarios

| # | Short name                           | Root cause                                                                     |
|---|--------------------------------------|--------------------------------------------------------------------------------|
| A | Merchant-sourced options             | Options come from the merchant's live account (warehouses, shipping templates) |
| B | Master-to-channel value mapping      | Master value is meaningful internally but maps to a channel-specific code      |
| C | Hierarchical category tree           | Category selection is multi-level; leaf node unlocks further fields            |
| D | Category-dependent field injection   | Selecting a category causes new required fields to appear                      |
| E | Cross-field conditional dependencies | A channel field's visibility depends on another channel field                  |
| F | Multi-language content               | Channel/region requires content in multiple locales                            |
| G | Channel pricing and currency         | Channel requires a different currency with platform rounding rules             |
| H | Channel-specific media compliance    | Channel image/video specs may reject master product's media                    |
| I | Cross-store value inheritance        | Org has sibling stores; copy values intelligently between tabs                 |
| J | Channel-specific SEO and keywords    | Platform search fields have unique structure incompatible with master tags     |
| K | Computed/derived fields              | Channel field assembled from several master fields, not 1-to-1                 |

Phases 1–4 cover scenarios A–D. Scenarios E–K are planned.

---

## Phase 1 — Scenario A: Merchant-Sourced Options

**Status:** Implemented (2026-03-09). See [API Reference — Step 2](../02-api-reference/04-step2-schema-and-channel-data.md#phase-1--merchant-sourced-options) for collection schema and endpoint spec.

Some SELECT/MULTISELECT fields (warehouse location, shipping template, fulfillment policy) must show options sourced from the merchant's live account, not from static configuration.

### Two delivery modes

| Mode            | When to use                     | How it works                                                                                                       |
|-----------------|---------------------------------|--------------------------------------------------------------------------------------------------------------------|
| **Eager embed** | Small stable lists (≤ 50 items) | Backend fetches from channel API during schema generation; fills `options[]` normally. Frontend unchanged.         |
| **Lazy load**   | Large or volatile lists         | Backend sets `optionsEndpoint`, leaves `options[]` empty. Frontend fetches on mount, shows spinner until resolved. |

### Frontend contract

Added to `ChannelFormField` in `channelStore.ts`:
```typescript
optionsSource?: "STATIC" | "MERCHANT_API";
optionsEndpoint?: string;  // e.g. "/merchant-data/tiktok/store-01/field-options?fieldName=warehouse_id&organizationId=org-01"
```

`ChannelFieldInput` checks `optionsSource === "MERCHANT_API"` on mount:
- Shows `OptionsSkeleton` while fetching
- Shows `OptionsError` + retry on failure
- Fills the `<select>` options on success

`"merchant_data"` section in `SectionName` groups account-specific fields (warehouses, shipping templates) with a blue-tinted header and a "Sourced from your {channelType} account" label.

### Backend architecture

All channel API integration knowledge is stored as configuration data in MongoDB. A single `GenericMerchantDataService` reads the config at runtime and executes the HTTP call. No per-channel Java classes exist.

The `merchant_api_operations` collection holds one document per `(channelType, operationName)` pair. It defines how to call the channel's API: base URL, URL path, auth strategy, how to extract items from the response, and which fields map to `value`/`label` in the resulting options list.

Both `baseUrl` and `urlPath` support a `{storeId}` placeholder replaced at runtime — Shopify uses `"https://{storeId}"` since each store has its own subdomain.

**Auth strategies:**

| `authStrategy`   | Transport                                           |
|------------------|-----------------------------------------------------|
| `BEARER_TOKEN`   | `Authorization: Bearer {credentialValue}`           |
| `API_KEY_HEADER` | Custom header `{authHeaderName}: {credentialValue}` |
| `API_KEY_QUERY`  | Query param `{authQueryParam}={credentialValue}`    |
| `NO_AUTH`        | No auth header                                      |

**Seeded operations** (`MerchantApiOperationDataLoader @Order(130)`)

| channelType   | operationName            | auth             | itemsJsonPath                     |
|---------------|--------------------------|------------------|-----------------------------------|
| `tiktok`      | `GetWarehouses`          | `BEARER_TOKEN`   | `data.warehouse_list`             |
| `tiktok`      | `GetShippingTemplates`   | `BEARER_TOKEN`   | `data.shipping_template_list`     |
| `lazada`      | `GetWarehouseDetail`     | `BEARER_TOKEN`   | `data`                            |
| `shopify`     | `GetLocations`           | `API_KEY_HEADER` | `locations`                       |
| `shopify`     | `GetCustomCollections`   | `API_KEY_HEADER` | `custom_collections`              |
| `ebay`        | `GetFulfillmentPolicies` | `BEARER_TOKEN`   | `fulfillmentPolicies`             |
| `shopee`      | `GetLogistics`           | `BEARER_TOKEN`   | `response.logistics_channel_list` |
| `amazon`      | `ListInputFieldValues`   | `BEARER_TOKEN`   | `payload.shippingGroups`          |

**Attribute document wiring** — links a field to its operation:
```json
{
  "fieldName":            "warehouse_id",
  "optionsSource":        "MERCHANT_API",
  "merchantApiOperation": "GetWarehouses",
  "supportedChannels":    ["tiktok"],
  "isChannelField":       true
}
```

**Adding a new channel or field — no code required.** Insert a document in `merchant_api_operations` and set `optionsSource: "MERCHANT_API"` + `merchantApiOperation` on the attribute document.

---

## Phase 2 — Scenario B: Master-to-Channel Value Mapping

**Status:** Implemented (2026-03-07). See [API Reference — Step 2](../02-api-reference/04-step2-schema-and-channel-data.md#phase-2--master-to-channel-value-mapping) for collection schema and admin endpoints.

The seller enters `material: "cotton"` in the master product. Lazada requires `bahan: "LZ_MAT_001"`. Phase 2 adds a mapping suggestion that pre-selects the correct channel code automatically.

### Frontend contract

Added to `ChannelFormField` in `channelStore.ts`:
```typescript
masterMappedSuggestion?: MasterMappedSuggestion;

interface MasterMappedSuggestion {
  masterField:    string;   // "material"
  masterValue:    unknown;  // "cotton"
  suggestedValue: unknown;  // "LZ_MAT_001"
  suggestedLabel: string;   // "Cotton"
  confidence: "EXACT" | "FUZZY" | "NONE";
}
```

`ChannelFieldInput` renders a `MappingSuggestionBanner` above the field:
- `EXACT` → blue banner + [Accept] [Pick different]. Also **pre-fills** the field with `suggestedValue`.
- `FUZZY` → amber banner + [Accept] [Pick different]. Does NOT pre-fill.
- `NONE` → amber warning only, no buttons.

[Accept] calls `onChange(suggestedValue)` and dismisses the banner.

### Backend architecture

The `channel_field_value_mappings` collection holds one document per `(channelType, masterFieldName, channelFieldName)` triplet. It stores the translation table between master taxonomy values and channel-specific codes, plus a `fallbackStrategy` for unmatched values.

**Fallback strategies:**

| `fallbackStrategy`   | Behaviour                                                                                          |
|----------------------|----------------------------------------------------------------------------------------------------|
| `PROMPT_USER`        | Returns `confidence: "NONE"` — warning badge, no Accept button                                     |
| `FREE_TEXT`          | Copies master value as-is with `confidence: "FUZZY"`                                               |
| `USE_CLOSEST`        | Levenshtein distance against all `masterValue` entries; returns closest with `confidence: "FUZZY"` |

**Resolution flow:** exact match → fallback strategy → `NONE` if no mapping document. Master values are normalized (lowercase, trimmed) before comparison. Mapping document lookup is cached 10 minutes (`@Cacheable("channelValueMappings")`).

**Seeded mappings** (`ChannelValueMappingDataLoader @Order(120)`)

| channelType   | masterFieldName  | channelFieldName   | example mapping            |
|---------------|------------------|--------------------|----------------------------|
| `lazada`      | `material`       | `bahan`            | cotton → LZ_MAT_001        |
| `amazon`      | `material`       | `fabric_type`      | cotton → "100% Cotton"     |
| `tiktok`      | `color`          | `colour_id`        | navy blue → COLOUR_0036    |
| `shopee`      | `color`          | `colour`           | navy blue → 17             |
| `amazon`      | `gender`         | `department`       | unisex → ["mens","womens"] |
| `lazada`      | `gender`         | `Gender`           | unisex → Unisex            |

Note: `channelValue` can be a `String` or `List<String>` (Amazon `department` maps unisex to both "mens" and "womens").

**`masterFieldName` on `EcommerceMasterAttributeDocument`** — links a channel field back to its master field:
```java
private String masterFieldName;  // e.g. "material" on the lazada "bahan" attribute
```

**Schema generation** — `ChannelStepSchemaService` calls `ChannelValueMappingService.resolveSuggestion()` for any SELECT/MULTISELECT field where `attr.masterFieldName != null`. On `EXACT`, the field is also pre-filled with `suggestedValue` when `currentValue` is null.

---

## Phase 3 — Scenario C: Hierarchical Category Tree

**Status:** Frontend complete. Backend implemented (2026-05-28).

Channel categories (TikTok, Lazada, Amazon Browse Nodes) are multi-level trees (3–6 levels, up to 50 000 nodes). A flat `<select>` cannot represent them.

### Frontend contract

Added to `ChannelFieldType`:
```typescript
"CATEGORY_TREE"
```

Added `categoryTreeConfig` to `ChannelFormField`:
```typescript
categoryTreeConfig?: {
  rootEndpoint:    string;              // GET /merchant-data/{ch}/{store}/categories
  childEndpoint:   string;             // ...?parentId={parentId}&organizationId=...
  maxDepth:        number;
  requireLeafNode: boolean;            // true = only leaf nodes are selectable
  selectedPath?:   CategoryTreeNode[]; // pre-populated breadcrumb for saved value
}
```

`CategoryTreePicker` component:
- Collapsed view: breadcrumb + [Browse] / [Change] button
- Open panel: level-by-level browsing with loading spinner, error state, [Cancel]
- Phase 2 integration: when `masterMappedSuggestion.confidence === "EXACT"` shows "Accept suggested category" shortcut — skips tree browsing

### Backend — `ChannelTaxonomyService` (implemented 2026-05-28)

**Two cache collections, two service classes:**

| Channel type    | Collection               | Service                  | TTL   | Scope          |
|-----------------|--------------------------|--------------------------|-------|----------------|
| Shopify         | `channel_taxonomy_cache` | `ChannelTaxonomyService` | 7 days | Global per channelType |
| All others      | `channel_category_cache` | `CategoryCacheService`   | 24h   | Per storeId    |

`CategoryController` routes automatically — `queryChildrenIfTaxonomy()` checks whether
the channel is taxonomy-enabled in a single DB read; if yes it routes to
`ChannelTaxonomyService`; otherwise to `CategoryCacheService`.

**API endpoints:**

```
GET /api/v1/categories/{channelType}/{storeId}/root?organizationId=...
    → top-level nodes (parentId = null)

GET /api/v1/categories/{channelType}/{storeId}/children/{parentId}?organizationId=...
    → direct children of parentId
```

**URL encoding for Shopify GIDs:** Shopify taxonomy node IDs contain `://`
(e.g. `gid://shopify/TaxonomyCategory/aa`). The frontend must URL-encode them before
embedding in path variables:

```typescript
// CategoryTreePicker.tsx
const encoded = encodeURIComponent(parentId);
// "gid://shopify/TaxonomyCategory/aa" → "gid%3A%2F%2Fshopify%2FTaxonomyCategory%2Faa"
fetch(`/api/v1/categories/shopify/${storeId}/children/${encoded}?organizationId=...`)
```

Spring `@PathVariable` auto-decodes — no special handling needed on the server side.

**Two-phase BFS for Shopify taxonomy (12,378 nodes, 7 levels):**

```
Phase 1 (synchronous — returns with HTTP response):
  GET taxonomy.categories first:26
  → write 26 roots to channel_taxonomy_cache
  → return HTTP response                     ← user sees roots in ~1.5s

Phase 2 (fire-and-forget via subscribe()):
  Level 1: batch childrenIds of 26 roots  → fetch → write 213 nodes  to MongoDB → recurse
  Level 2:                                → fetch → write 1,551 nodes to MongoDB → recurse
  Level 3:                                → fetch → write 4,265 nodes to MongoDB → recurse
  Level 4:                                → fetch → write 4,204 nodes to MongoDB → recurse
  Level 5:                                → fetch → write 1,628 nodes to MongoDB → recurse
  Level 6:                                → fetch → write 438 nodes  to MongoDB → done
  Total: 12,378 nodes in ~5 minutes
```

**Why level-by-level flush matters:**
The original implementation accumulated all 12,378 nodes in memory and called
`saveAll(12,378 docs)` as the final step. MongoDB's `saveAll` issues individual round-trips
per document, saturating the Atlas connection pool for ~190 seconds. During that window every
request waited for a connection — causing the 7–10 second hang on `CategoryTreePicker` open.

Fix: each BFS level's `newNodes` are written to MongoDB immediately after fetch via
`bulkUpsert(channelType, newNodes)` before recursing to the next level. No accumulation,
no saturation window.

**`refetchInFlight` guard — prevents BFS storms:**

```java
// count = 0 (empty cache): only one thread blocks on Phase 1
if (refetchInFlight.add(channelType)) {
    return fetchAndCacheAll(channelType, storeId, organizationId, config);
}
return Mono.empty();   // concurrent requests get empty list immediately

// count > 0 (partial/stale): serve stale, one BFS re-seed in background
if (refetchInFlight.add(channelType)) {
    cacheRepository.deleteByChannelType(channelType)
            .then(fetchAndCacheAll(channelType, storeId, organizationId, config))
            .doOnError(e -> refetchInFlight.remove(channelType))
            .subscribe();  // fire-and-forget
}
return Mono.empty();   // serve partial cache without blocking
```

Phase 2 BFS owns `refetchInFlight.remove(channelType)` exclusively — it is never removed
after Phase 1 completes, preventing a new BFS from starting while Phase 2 is still running.

**What was causing the 10-second hang (root cause):**

```
Every request hit ensureCache with count=26 (partial)
  → delete all 26 nodes
  → call fetchAndCacheAll() SYNCHRONOUSLY (7s+ blocking wait)
     → save 26 roots, BFS silently failed (onErrorResume suppressed error)
     → 0 children written
  → count = 26 again → next request repeats the same cycle
```

The fix made the partial-cache path non-blocking (serve stale, BFS in background),
so requests return in ~1.5s from Phase 1 cache, never blocking on BFS again.

**Benchmark (cold start → warm):**

| Event                              | Time from first request |
|------------------------------------|-------------------------|
| Root nodes visible (26 nodes)      | ~1.5 s                  |
| Level 1 children (213 nodes)       | ~25 s                   |
| Level 2 (1,551 nodes)              | ~65 s                   |
| Full tree (12,378 nodes)           | ~5 min                  |
| **Warm cache (all subsequent)**    | **< 100 ms**            |

`ChannelStepSchemaService` pre-populates `categoryTreeConfig.selectedPath` from the saved
`categoryId` so the form shows the correct breadcrumb on load without an extra round-trip.

---

## Phase 4 — Scenario D: Category-Dependent Field Injection

**Status:** Frontend complete. Backend planned.

When the seller selects a leaf category (Phase 3), the channel returns a different set of required/optional fields for that exact category. These fields are injected as a new "Category-specific fields" section rendered in violet.

### Frontend contract

Added to `ChannelSchemaPerStore`:
```typescript
categoryAttributeSection?: CategoryAttributeSection;

interface CategoryAttributeSection {
  categoryId:     string;
  categoryName:   string;
  categoryPath:   string[];           // breadcrumb labels
  requiredFields: ChannelFormField[]; // expanded by default
  optionalFields: ChannelFormField[]; // collapsible
}
```

`ChannelStoreTab` behaviour:
- `useEffect` + `useRef` watches for `categoryId` changes in form state
- Fetches attrs when `categoryId` changes; `lastFetchedCategoryId` ref prevents redundant fetches
- `handleFieldChange` clears stale category-specific field values before new set arrives
- Injected fields render as a violet-highlighted section

`categoryId` included in `ChannelStepSaveRequest` so the backend can include category-specific required fields in `completionPercentage`.

### Backend design (planned)

`ChannelStepSchemaService` will fetch category attributes for the saved `categoryId` and embed the result in `ChannelSchemaPerStore.categoryAttributeSection` so the form pre-populates on load without an extra round-trip.

---

## Phases 5–11 (E–K) — Planned

| Phase  | Scenario                                    | Status      |
|--------|---------------------------------------------|-------------|
| 5      | Cross-field conditional dependencies (E)    | Not started |
| 6      | Multi-language content (F)                  | Not started |
| 7      | Channel pricing / currency conversion (G)   | Not started |
| 8      | Media compliance validation per channel (H) | Not started |
| 9      | Cross-store value inheritance (I)           | Not started |
| 10     | Channel-specific SEO keyword structure (J)  | Not started |
| 11     | Computed/derived channel fields (K)         | Not started |

Each scenario has a full specification documented in the original planning source at `src/main/resources/Documentation/step2-channel-data-sources/README.md`.

---

## Data Flow Summary

```
POST /form-schema/channel-step
  Input: { masterProductId, organizationId, masterVariants }

  For each connected store in parallel:
    1. Load channel config       (channel_configurations)
    2. Load channel attrs        (ecommerce_master_attributes where isChannelField)
    3. Load saved channel data   (channel_product_data)
    4. Load master product data  (for Phase B/K suggestions)

    For each field:
      [A] optionsSource=MERCHANT_API
          → GenericMerchantDataService.fetchOptions(channelType, operationName, storeId, orgId)
          ≤ 50 items: embed in options[]   |   > 50 items: set optionsEndpoint (lazy-load)
      [B] masterFieldName set on attribute
          → ChannelValueMappingService.resolveSuggestion()
          → set masterMappedSuggestion; pre-fill currentValue if EXACT and no saved value
      [C] fieldType=CATEGORY_TREE
          → set categoryTreeConfig; fill selectedPath if value already saved
      [D] categoryId already saved
          → fetch category-attributes → embed categoryAttributeSection

  Assemble sections, calculate completionPercentage
  Return ChannelStepSchemaResponse
```

---

## Codebase

| File                                                            | Purpose                                                                                                                                                       |
|-----------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `step2-channel-fields/types/channelStore.ts`                    | All Phase 1–4 type additions: `optionsSource`, `optionsEndpoint`, `MasterMappedSuggestion`, `CATEGORY_TREE`, `categoryTreeConfig`, `CategoryAttributeSection` |
| `step2-channel-fields/components/wizard/ChannelFieldInput.tsx`  | `useMerchantOptions` hook (Phase 1), `MappingSuggestionBanner` (Phase 2), early-return for `CATEGORY_TREE` → `CategoryTreePicker` (Phase 3)                   |
| `step2-channel-fields/components/wizard/CategoryTreePicker.tsx` | Level-by-level category browser (Phase 3)                                                                                                                     |
| `step2-channel-fields/components/wizard/ChannelStoreTab.tsx`    | Category-dependent field injection (Phase 4)                                                                                                                  |
| `step2-channel-fields/services/channelStore.service.ts`         | `MerchantDataService.fetchFieldOptions()` (Phase 1 lazy-load)                                                                                                 |
| `channel/merchant/model/MerchantApiOperationDocument.java`      | MongoDB document for `merchant_api_operations` collection                                                                                                     |
| `channel/merchant/service/GenericMerchantDataService.java`      | Config-driven merchant options fetcher (Phase 1 backend)                                                                                                      |
| `channel/merchant/loader/MerchantApiOperationDataLoader.java`   | Seeds 8 operations at `@Order(130)`                                                                                                                           |
| `channel/mapping/ChannelValueMappingServiceImpl.java`           | EXACT → USE_CLOSEST → FREE_TEXT → NONE resolution (Phase 2 backend)                                                                                           |
| `channel/mapping/ChannelValueMappingDataLoader.java`            | Seeds material/color/gender mappings at `@Order(120)`                                                                                                         |
| `channel/mapping/ChannelMappingAdminController.java`            | CRUD at `/api/v1/admin/channel-mappings`                                                                                                                      |
