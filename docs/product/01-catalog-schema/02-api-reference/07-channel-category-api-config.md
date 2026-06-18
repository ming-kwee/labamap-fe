# `channel_category_api_config` — Reference

## What it is

`channel_category_api_config` is a MongoDB collection with **one document per channel type**.
It is the single source of truth for how the backend communicates with each channel's category
API. Instead of writing per-channel Java code every time a new channel is added, all HTTP
parameters, authentication, response parsing rules, and feature flags are stored here and
read at runtime.

There is **no frontend-facing API** for this collection. It is managed by the backend
startup loader (`CategoryApiConfigDataLoader` @Order 140) which upserts all documents on
every application start.

---

## Who reads it and why

| Consumer | What it reads | What it does with it |
|---|---|---|
| `GenericCategoryService` | Connection, auth, response mapping | Builds and executes HTTP requests to fetch category nodes from channel APIs |
| `CategorySyncJob` | `enabled`, `fullTreeStrategy` | Decides which channels to pre-warm and which tree-traversal strategy to use |
| `ChannelCategoryImportService` | `importCapable`, node field mappings | Drives the import wizard — fetches and maps merchant-created collections |
| `ChannelTaxonomyService` | `taxonomyEnabled`, `importCapable`, `taxonomyFetchConfig` | `getCategoryFlags()` returns both UI flags; `taxonomyFetchConfig` drives the full taxonomy cache fetch into `channel_taxonomy_cache` |
| `ChannelStoreController` (GET list) | *(via `ChannelTaxonomyService.getCategoryFlags()`)* | Sets `taxonomyEnabled` + `importCapable` flags in store API responses |

---

## Full field reference

### Identity

| Field | Type | Description |
|---|---|---|
| `channelType` | String | Channel identifier, e.g. `"shopify"`, `"wix"`, `"lazada"`. Unique index. |
| `label` | String | Human-readable name for logging and admin display. |
| `enabled` | Boolean | If `false`, `GenericCategoryService` and `CategorySyncJob` skip this channel. |
| `taxonomyEnabled` | Boolean | `true` = channel has a fixed, channel-owned global taxonomy tree cached in `channel_taxonomy_cache` (shared across all stores). Supports `GRAPHQL` strategy (Shopify) and `REST` strategy (eBay). Read by `ChannelTaxonomyService`. Independent of `importCapable`; Shopify is both. |
| `treeCapable` | Boolean | `true` = channel has a platform-defined category tree browseable via REST (`GenericCategoryService`). Covers Shopee, Amazon, TikTok, eBay, Lazada. |

---

### Connection

| Field | Type | Description |
|---|---|---|
| `baseUrl` | String | Base URL for all API calls. Supports `{storeId}` placeholder, e.g. `"https://{storeId}"` for Shopify (substituted with `store.storeUrl` at runtime). |
| `httpMethod` | String | `"GET"` or `"POST"`. |
| `childrenUrlPath` | String | URL path appended to `baseUrl`. Used by `GenericCategoryService` for tree drill-down and by `ChannelCategoryImportService` as the primary import endpoint. |
| `parentIdQueryParam` | String | Query param name for the parent node ID when drilling down (e.g. `"parent_id"`, `"parent_category_id"`). Null = channel does not use a parent param. |
| `omitParentParamForRoot` | Boolean | If `true`, omit `parentIdQueryParam` entirely when fetching the root level. If `false`, send `parentIdQueryParam=0`. |
| `requestBodyTemplate` | Map | JSON body sent for POST requests (e.g. Wix paging body). Serialized as `application/json`. Null for GET channels. |

---

### Authentication

| Field | Type | Description |
|---|---|---|
| `authStrategy` | Enum | How auth is applied to every request. See strategies below. |
| `authCredentialKey` | String | Key in `channel_store_connections.credentials` whose value is the auth secret. |
| `authHeaderName` | String | Header name for `API_KEY_HEADER` strategy (e.g. `"X-Shopify-Access-Token"`). |
| `authQueryParam` | String | Query param name for `API_KEY_QUERY` strategy (e.g. `"access_token"`). |
| `credentialHeaders` | Map | Maps HTTP header name → credential key. Applied to every request. Used by Wix to inject `"wix-site-id"` from stored credentials alongside Bearer auth. |
| `credentialQueryParams` | Map | Maps query param name → credential key. Used when multiple credential values are passed as query params (e.g. WooCommerce `consumer_key` + `consumer_secret`, TikTok `app_key`). |
| `fixedQueryParams` | Map | Static key → value query params always appended (e.g. `per_page=100` for WooCommerce). |

#### `authStrategy` values

| Value | What it does |
|---|---|
| `BEARER_TOKEN` | Adds `Authorization: Bearer {credentialValue}` header |
| `API_KEY_HEADER` | Adds `{authHeaderName}: {credentialValue}` header |
| `API_KEY_QUERY` | Adds `{authQueryParam}={credentialValue}` query param |
| `HMAC_SHA256` | Auth injected entirely via `credentialQueryParams` (used by Shopee) |
| `NO_AUTH` | No auth header or param — credentials go entirely through `credentialQueryParams` (used by WooCommerce) |

---

### Response parsing

| Field | Type | Description |
|---|---|---|
| `responseIsArray` | Boolean | `true` when the channel API returns a bare JSON array rather than an object (e.g. WooCommerce). The array is wrapped in a synthetic `{ itemsJsonPath: [...] }` map so the generic extractor works uniformly. |
| `itemsJsonPath` | String | Dot-notation path to the array of category nodes in the response (e.g. `"data.category_list"`, `"categories"`, `"items"` for WooCommerce synthetic wrapper). |
| `nodeIdField` | String | Field name within each node for the category ID (e.g. `"id"`, `"category_id"`). Supports dot-notation for nested fields. |
| `nodeNameField` | String | Field name for the display name (e.g. `"name"`, `"local_name"`, `"title"`). |
| `nodeHasChildrenField` | String | Field indicating whether this node has children. Null = always `false` (leaf-only or flat list). |
| `nodeHasChildrenInvert` | Boolean | If `true`, the field is a "leaf" flag — its value is inverted to derive `hasChildren` (used by TikTok `is_leaf`, Lazada `leaf`). |
| `nodeParentIdField` | String | Field for the parent node ID. Required for `FLAT_WITH_PARENT_ID` tree structure. Supports dot-notation (e.g. Wix `"parentCategory.id"`). Null for `CHILDREN_PER_REQUEST`. |

---

### Tree structure

| Field | Type | Description |
|---|---|---|
| `treeStructure` | Enum | How the API returns nodes. See below. |
| `nestedChildrenField` | String | For `NESTED` only: the field within each node containing its sub-nodes array (e.g. `"children"`, `"childCategoryTreeNodes"`). |
| `fullTreeStrategy` | Enum | Strategy used by `CategorySyncJob` to warm the full tree cache. See below. |

#### `treeStructure` values

| Value | Meaning |
|---|---|
| `CHILDREN_PER_REQUEST` | Each API call returns the direct children of a given parent. Standard drill-down. |
| `FLAT_WITH_PARENT_ID` | One API call returns all nodes; each node has a `nodeParentIdField` that identifies its parent. |
| `NESTED` | Response is a recursive tree JSON; `GenericCategoryService` flattens it using `nestedChildrenField`. |

#### `fullTreeStrategy` values

| Value | Meaning |
|---|---|
| `RECURSIVE` | `CategorySyncJob` runs BFS from root, calling the API repeatedly level by level. Works with `CHILDREN_PER_REQUEST`. |
| `SINGLE_CALL` | One HTTP call returns the entire tree. Works with `FLAT_WITH_PARENT_ID` or `NESTED`. |
| `ROOT_ONLY` | Only root-level nodes are fetched. Channel has no full-tree API. Tree cache is populated lazily on user demand. |

---

### Pagination

| Field | Type | Description |
|---|---|---|
| `paginationStrategy` | Enum | `NONE`, `OFFSET`, `PAGE_NUMBER`, or `CURSOR`. |
| `pageParam` | String | Query param name for page number or offset. |
| `pageSizeParam` | String | Query param name for page size. |
| `pageSizeValue` | Integer | Page size value to request. |
| `totalPagesJsonPath` | String | Dot-notation path to total page count in the response. |
| `cursorJsonPath` | String | Dot-notation path to next-page cursor in the response. |
| `cursorParam` | String | Query param name for the cursor value. |

---

### Import wizard fields

These fields are only relevant when `importCapable = true`. They tell `ChannelCategoryImportService`
how to map raw API response items to `ImportPreviewItem` and `ImportableCollectionDto`.

| Field | Type | Description |
|---|---|---|
| `importCapable` | Boolean | `true` = this channel has merchant-created collections (Shopify, WooCommerce, Wix). `ChannelCategoryImportService` will use this config to drive the import wizard. `false` = import wizard not applicable (Amazon, TikTok, eBay use fixed taxonomies). |
| `nodeSlugField` | String | Field in each item for the URL slug (e.g. `"handle"` for Shopify, `"slug"` for Wix/WooCommerce). Null = slug derived from name via slugify. |
| `nodeProductCountField` | String | Field for the number of products in the collection (e.g. `"products_count"` for Shopify, `"count"` for WooCommerce, `"numberOfProducts"` for Wix). Null = no product count available. |
| `collectionType` | String | Default collection type label for items from the primary endpoint (e.g. `"manual"`). Appears in `ImportableCollectionDto.collectionType`. |
| `additionalCollectionEndpoints` | List | Extra endpoints to call and merge into import results. Each entry has `urlPath`, `itemsJsonPath`, and `collectionType`. Used by Shopify to fetch `smart_collections` alongside `custom_collections`. |

---

### UI metadata

| Field | Type | Description |
|---|---|---|
| `maxDepth` | Integer | Maximum tree depth. Read by `ChannelStepSchemaService` to set `categoryTreeConfig.maxDepth` on the Step 2 category select field. Default `5`. |
| `requireLeafNode` | Boolean | If `true`, merchants must select a leaf node (no children). Read by `ChannelStepSchemaService` to set `categoryTreeConfig.requireLeafNode`. Default `true`. |

---

### Taxonomy fetch config (`taxonomyFetchConfig`)

Only populated when `taxonomyEnabled = true`. Tells `ChannelTaxonomyService` how to fetch
and cache the channel's global taxonomy tree into `channel_taxonomy_cache`.
`null` for per-store channels (Lazada, TikTok, Shopee) — those use `channel_category_cache` via `GenericCategoryService`.

Two fetch strategies are supported:

**`GRAPHQL`** (e.g. Shopify): Two-phase fetch — Phase 1 fetches root nodes synchronously via `graphqlQuery`; Phase 2 BFS fetches child nodes in background batches via `batchFetchQuery`.

**`REST`** (e.g. eBay): Delegates entirely to `GenericCategoryService.fetchFullTreeWithCreds()` which reads `treeApiConfig` from the same document. All nodes fetched in one call; `childrenIds`, `ancestorIds`, `isLeaf`, `isRoot`, and `level` are derived from the flat node list. No Phase 2 BFS needed.

| Field | Type | Description |
|---|---|---|
| `fetchStrategy` | String | `"GRAPHQL"` or `"REST"`. |
| `graphqlQuery` | String | *GRAPHQL only.* Full GraphQL query string for Phase 1 root fetch. Must use `$cursor: String` variable. |
| `batchFetchQuery` | String | *GRAPHQL only.* GraphQL query for Phase 2 BFS batch node fetch. Must accept `$ids: [ID!]!`. If null, Phase 2 is skipped — only root nodes cached. |
| `apiVersion` | String | *GRAPHQL only.* API version string substituted into `apiPath` as `{apiVersion}`. |
| `apiPath` | String | *GRAPHQL only.* URL path template, e.g. `"/admin/api/{apiVersion}/graphql.json"`. |
| `dataPath` | String | *GRAPHQL only.* Dot-notation to the paginated container in the response. Container must have `nodes[]` and `pageInfo.hasNextPage` + `pageInfo.endCursor`. |
| `minCacheSize` | Long | Minimum node count to consider the cache complete. Partial cache (below threshold) triggers a background re-fetch. Default `500` when null. Shopify ~10K nodes, eBay ~25K nodes. |

---

## How `taxonomyEnabled`, `importCapable`, and `treeCapable` flow to the frontend

All three flags are stored in `channel_category_api_config` and read independently — they
are **not** mutually exclusive. Shopify is both taxonomy-enabled and import-capable.

```
channel_category_api_config.taxonomyEnabled
channel_category_api_config.importCapable
channel_category_api_config.treeCapable       ← deployed 2026-06-15
        ↓ read at request time (not startup)

ChannelStoreController GET /channel-stores
  → ChannelTaxonomyService.getCategoryFlags(channelType)
        ↓ single DB call → ChannelCategoryFlags(taxonomyEnabled, importCapable, treeCapable)
  → ChannelStoreConnectionResponse.from(entity, flags)
        ↓ sets all three flags directly (no derivation)

API response: { taxonomyEnabled: true/false, importCapable: true/false, treeCapable: true/false }
        ↓
Frontend routing in ChannelCategoryMappingPage.handleOpenMap():
  if taxonomyEnabled → TaxonomyMapperModal mode="taxonomy" (Shopify GraphQL taxonomy)
  if treeCapable     → TaxonomyMapperModal mode="tree"     (REST/HMAC category tree)
  if importCapable   → ImportWizardModal                   (merchant-created collections)
  if none            → toast "No mapping flow configured"
```

Previously `importCapable` was derived as `!taxonomyEnabled` in the DTO. This was wrong
for channels like Amazon/Lazada/TikTok (neither flag true). All flags now come directly
from `channel_category_api_config`.

`treeCapable` shares the same modal as `taxonomyEnabled` (`TaxonomyMapperModal`) but with
`mode="tree"` so labels say "Category Tree" instead of "Taxonomy". The underlying browse
endpoint (`GET /taxonomy/{channelType}/children`) works for all channels via
`channel_category_cache` — no separate endpoint needed.

---

## How the three runtime consumers use this collection

### 1. `GenericCategoryService` — category tree drill-down

Called from the Step 2 form schema and the category picker UI when a merchant navigates the
channel's category tree.

```
GET /channel-categories?channelType=lazada&storeId=xxx&parentId=yyy
  → GenericCategoryService.fetchChildrenFromApi(channelType, storeId, parentId, orgId)
    → configRepository.findByChannelTypeAndEnabledTrue(channelType)
    → builds HTTP request using connection + auth + pagination fields
    → parses response using itemsJsonPath + nodeIdField + nodeNameField + nodeHasChildrenField
    → returns List<CategoryNode>
```

### 2. `CategorySyncJob` — nightly full-tree cache warm-up

Runs at 02:00 daily. Pre-fetches every enabled channel's full category tree and stores it
in `channel_category_cache` so UI interactions are served from cache, not live API calls.

```
@Scheduled(cron "0 0 2 * * *")
  → configRepository.findByEnabledTrue()         ← which channels to sync
  → for each active store in enabled channels:
      GenericCategoryService.fetchFullTreeFromApi()
        uses fullTreeStrategy:
          SINGLE_CALL → one HTTP call (Shopee, Wix, eBay)
          RECURSIVE   → BFS from root (Lazada, TikTok)
          ROOT_ONLY   → root level only (Shopify, Amazon)
      → saves to channel_category_cache with 24h TTL
```

### 3. `ChannelCategoryImportService` — import wizard

Called when a merchant clicks the Import Wizard for a merchant-collection channel (Shopify,
WooCommerce, Wix).

```
GET /import/preview?storeId=xxx
  → configRepository.findByChannelType(channelType)
    .filter(ChannelCategoryApiConfig::isImportCapable)   ← guard
  → builds HTTP request using same connection + auth fields as GenericCategoryService
  → also calls additionalCollectionEndpoints (e.g. Shopify smart_collections)
  → maps items using nodeIdField, nodeNameField, nodeSlugField, nodeParentIdField
  → returns List<ImportableCollectionDto> or List<ImportPreviewItem>
```

---

## Current documents (8 channels)

`treeCapable` deployed 2026-06-15 — values set by `CategoryApiConfigDataLoader`.

| `channelType` | `taxonomyEnabled` | `importCapable` | `treeCapable` | `fullTreeStrategy` | Auth strategy |
|---|---|---|---|---|---|
| `lazada` | false | false | **true** | `RECURSIVE` | `API_KEY_QUERY` |
| `tiktokshop` | false | false | **true** | `RECURSIVE` | `API_KEY_QUERY` + `credentialQueryParams` |
| `shopee` | false | false | **true** | `SINGLE_CALL` | `HMAC_SHA256` via `credentialQueryParams` |
| `amazon` | false | false | **true** | `ROOT_ONLY` | `BEARER_TOKEN` |
| `ebay` | false | false | **true** | `SINGLE_CALL` | `BEARER_TOKEN` |
| `wix` | false | **true** | false | `SINGLE_CALL` | `BEARER_TOKEN` + `credentialHeaders` (wix-site-id) |
| `shopify` | **true** | **true** | false | `ROOT_ONLY` | `API_KEY_HEADER` (X-Shopify-Access-Token) |
| `woocommerce` | false | **true** | false | `ROOT_ONLY` | `NO_AUTH` + `credentialQueryParams` (consumer_key/secret) |

**Why Shopify is `treeCapable = false`:** Shopify is already covered by `taxonomyEnabled = true`.
`treeCapable` is specifically for channels that have a REST tree but no GraphQL taxonomy.
`taxonomyEnabled` takes routing priority in the frontend.

**Why Wix/WooCommerce are `treeCapable = false`:** Their categories are merchant-owned
collections (`importCapable`), not a platform-defined tree. The `ImportWizardModal` is the
correct flow for them, not `TaxonomyMapperModal`.

---

## Adding a new channel

No Java code changes are required. Insert a document in `channel_category_api_config`:

```json
{
  "channelType": "etsy",
  "label": "Etsy Taxonomy",
  "baseUrl": "https://openapi.etsy.com",
  "httpMethod": "GET",
  "childrenUrlPath": "/v3/application/seller-taxonomy/nodes",
  "omitParentParamForRoot": true,
  "authStrategy": "API_KEY_HEADER",
  "authHeaderName": "x-api-key",
  "authCredentialKey": "accessToken",
  "itemsJsonPath": "results",
  "nodeIdField": "id",
  "nodeNameField": "name",
  "nodeHasChildrenField": "children_count",
  "nodeHasChildrenInvert": false,
  "treeStructure": "CHILDREN_PER_REQUEST",
  "fullTreeStrategy": "RECURSIVE",
  "maxDepth": 4,
  "requireLeafNode": true,
  "importCapable": false,
  "enabled": true
}
```

For an import-capable channel (merchant creates own collections), additionally set:
```json
{
  "importCapable": true,
  "nodeSlugField": "slug",
  "nodeProductCountField": "listing_count",
  "collectionType": "manual"
}
```

Then restart the application. `CategoryApiConfigDataLoader` will upsert the document on
next startup and all three consumers (`GenericCategoryService`, `CategorySyncJob`,
`ChannelCategoryImportService`) will begin using the new channel automatically.

---

## `treeCapable` — Implementation Notes (deployed 2026-06-15)

`treeCapable` is now a live field returned in `GET /channel-stores` responses.

**How it flows:**

```
channel_category_api_config.treeCapable (set by CategoryApiConfigDataLoader)
  ↓
ChannelTaxonomyService.getCategoryFlags() → ChannelCategoryFlags(taxonomyEnabled, importCapable, treeCapable)
  ↓
ChannelStoreConnectionResponse.from(entity, flags) → { treeCapable: true/false }
  ↓
Frontend: store.treeCapable === true → TaxonomyMapperModal mode="tree"
```

**Frontend fallback** `TREE_CAPABLE_CHANNELS` in `_types/channel-mapping.ts` is now a
no-op — the `store.treeCapable === true` branch short-circuits before `isTreeCapable()`.

**Why separate from `taxonomyEnabled`:** `taxonomyEnabled` covers GraphQL taxonomy
(Shopify). `treeCapable` covers REST/HMAC category trees (Shopee, Amazon, TikTok, eBay,
Lazada). Both use `GET /taxonomy/{channelType}/children` but different cache tables:
`channel_taxonomy_cache` vs `channel_category_cache`.
