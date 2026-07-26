# API Reference — Channel Category API Config Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/channel-category-api-configs`

Manages `channel_category_api_config` collection — configuration for how the platform fetches category trees and category attributes per channel.

**Status: Implemented** (2026-06-04)

**Files:**
- `channel/category/controller/ChannelCategoryApiConfigAdminController.java`

---

## GET `/admin/channel-category-api-configs`

List channel category API configurations.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `channelType` | String | — | Filter to one channel |
| `enabled` | Boolean | `true` | When true, returns only enabled channels; pass false for all |

**Response:** `ChannelCategoryApiConfig[]`

```json
[
  {
    "id": "6612a3f400000030",
    "channelType": "shopify",
    "label": "Shopify",
    "treeApiConfig": {
      "baseUrl": "https://{storeId}",
      "httpMethod": "GET",
      "childrenUrlPath": "/admin/api/2024-01/custom_collections.json",
      "authStrategy": "API_KEY_HEADER",
      "authCredentialKey": "accessToken",
      "authHeaderName": "X-Shopify-Access-Token",
      "itemsJsonPath": "custom_collections",
      "nodeIdField": "id",
      "nodeNameField": "title",
      "treeStructure": "FLAT_WITH_PARENT_ID",
      "fullTreeStrategy": "SINGLE_CALL",
      "paginationStrategy": "NONE",
      "searchEndpoint": "/merchant-data/shopify/{storeId}/categories/search"
    },
    "attributeConfig": {
      "graphqlQuery": "query TaxonomyCategoryAttributes($id: ID!) { ... }",
      "graphqlIdVariable": "id",
      "itemsJsonPath": "data.node.attributeCategories",
      "nestedArrayField": "attributes",
      "idField": "id",
      "nameField": "name"
    },
    "taxonomyConfig": {
      "enabled": true,
      "fetchConfig": {
        "fetchStrategy": "GRAPHQL",
        "apiPath": "/admin/api/{apiVersion}/graphql.json",
        "apiVersion": "2024-01",
        "dataPath": "data.taxonomy.categories"
      }
    },
    "importConfig": {
      "capable": true,
      "slugField": "handle",
      "productCountField": "products_count",
      "collectionType": "manual"
    },
    "enabled": true,
    "updatedAt": "2026-06-04T08:00:00"
  }
]
```

---

## GET `/admin/channel-category-api-configs/{channelType}`

Get the config for a specific channel.

**Response:** `ChannelCategoryApiConfig` or `404`

---

## POST `/admin/channel-category-api-configs`

Create a config for a new channel. Use when onboarding a channel that has no existing config document.

**Request body:** Full `ChannelCategoryApiConfig` — the `id` field is ignored (MongoDB assigns one).

```json
{
  "channelType": "shopee_sg",
  "label": "Shopee SG",
  "treeApiConfig": {
    "baseUrl": "https://partner.shopeemobile.com",
    "childrenUrlPath": "/api/v2/product/get_category",
    "authStrategy": "HMAC_SHA256",
    "authCredentialKey": "partnerKey",
    "itemsJsonPath": "response.category_list",
    "nodeIdField": "catid",
    "nodeNameField": "display_category_name",
    "nodeHasChildrenField": "has_children",
    "treeStructure": "NESTED",
    "nestedChildrenField": "children",
    "fullTreeStrategy": "SINGLE_CALL",
    "paginationStrategy": "NONE"
  },
  "enabled": true
}
```

**Response:** `201 Created` — saved `ChannelCategoryApiConfig`

---

## PUT `/admin/channel-category-api-configs/{channelType}/tree-api`

Replace the `treeApiConfig` sub-document for a channel.

Use when the channel migrates their category tree API endpoint, auth strategy, or response field names.

**Request body:** `CategoryTreeApiConfig` — full replacement of the sub-document.

```json
{
  "baseUrl": "https://{storeId}",
  "httpMethod": "GET",
  "childrenUrlPath": "/admin/api/2024-10/custom_collections.json",
  "authStrategy": "API_KEY_HEADER",
  "authCredentialKey": "accessToken",
  "authHeaderName": "X-Shopify-Access-Token",
  "itemsJsonPath": "custom_collections",
  "nodeIdField": "id",
  "nodeNameField": "title",
  "treeStructure": "FLAT_WITH_PARENT_ID",
  "fullTreeStrategy": "SINGLE_CALL",
  "paginationStrategy": "NONE"
}
```

**Response:** `200 OK` — updated `treeApiConfig` sub-document

**Side effect:** Clears `channel_category_cache` for this channel across all stores so the next tree load fetches from the updated endpoint.

---

## PUT `/admin/channel-category-api-configs/{channelType}/attribute-api`

Replace the `attributeConfig` sub-document for a channel.

Use when the channel changes their per-category attribute API (endpoint path, response field names, GraphQL query, or lookup strategy).

**Request body:** `AttributeApiConfig` — full replacement of the sub-document.

```json
{
  "urlPath": "/api/v2/product/get_attribute_tree",
  "categoryIdQueryParam": "category_id_list",
  "itemsJsonPath": "response.list",
  "nestedArrayField": "attribute_tree",
  "idField": "attribute_id",
  "nameField": "name",
  "requiredField": "mandatory",
  "valuesField": "attribute_value_list",
  "valueIdField": "value_id",
  "valueNameField": "name"
}
```

> **Shopee note:** `/api/v2/product/get_attributes` is `api_suspended` on the Partner API
> (verified via `scripts/shopee_probe.py` — returns `api_suspended` even with a valid token).
> Use `get_attribute_tree` instead. Its response nests attributes under
> `response.list[{category_id, attribute_tree[…]}]`, so `itemsJsonPath` targets `response.list`
> and `nestedArrayField: "attribute_tree"` flattens each entry's attributes. Field names also
> differ: `mandatory` (not `is_mandatory`) and `name` (not `display_*`). SELECT vs TEXT is inferred
> from `attribute_value_list` presence — free-text attributes (e.g. EAN) omit it.

**Response:** `200 OK` — updated `attributeConfig` sub-document

---

## PUT `/admin/channel-category-api-configs/{channelType}/disable`

Disable category sync for a channel. `CategorySyncJob` and `CategoryDriftPollingJob` skip channels where `enabled=false`.

**Response:** `200 OK` — full updated `ChannelCategoryApiConfig`

---

## PUT `/admin/channel-category-api-configs/{channelType}/enable`

Re-enable a disabled channel's category sync.

**Response:** `200 OK` — full updated `ChannelCategoryApiConfig`

---

## Fields NOT Editable via Admin API

| Field | Reason |
|---|---|
| `importConfig` | Import wizard orchestration is tightly coupled to `ChannelCategoryImportService` parsing logic; changes require code review |
| `taxonomyConfig` | GraphQL taxonomy query shape is tightly coupled to `ChannelTaxonomyService`; changes require code review |

---

## Currently Configured Channels (Reference)

| Channel | Tree Strategy | Attribute API | Taxonomy |
|---|---|---|---|
| `shopify` | SINGLE_CALL + FLAT_WITH_PARENT_ID | GraphQL (attributeCategories) | GraphQL taxonomy enabled |
| `amazon` | RECURSIVE + CHILDREN_PER_REQUEST | Two-step lookup (JSON_SCHEMA) | No |
| `tiktokshop` | SINGLE_CALL + NESTED | REST GET with category_id | No |
| `lazada` | RECURSIVE + CHILDREN_PER_REQUEST | REST GET with primary_category_id | No |
| `shopee` | SINGLE_CALL + NESTED | REST GET (HMAC_SHA256) | No |
| `ebay` | SINGLE_CALL + FLAT_WITH_PARENT_ID | REST GET (aspectConstraint) | No |

---

## `HMAC_SHA256` Auth Strategy — Generic Per-Request Signing

When `authStrategy = "HMAC_SHA256"`, `GenericCategoryService` computes a fresh HMAC-SHA256
signature for every request. The signing is **fully data-driven** via three fields on
`CategoryTreeApiConfig`:

| Field | Default | Description |
|---|---|---|
| `hmacSigningCredentialKey` | `"partnerId"` | Credential key whose value is prepended to the sign message |
| `hmacTimestampParam` | `"timestamp"` | Query param name for the computed timestamp |
| `hmacSignParam` | `"sign"` | Query param name for the computed signature |

**Sign formula:** `HMAC-SHA256(creds[hmacSigningCredentialKey] + urlPath + timestamp, OAuthAppConfig.clientSecret)`

The signing secret comes from `app.oauth.channels.{channelType}.client-secret` in
`application.yml` — the platform-level partner key, never stored per-store.

**Shopee example** (uses all defaults — no override needed in config):
```json
{
  "authStrategy": "HMAC_SHA256",
  "authCredentialKey": "accessToken",
  "credentialQueryParams": {
    "access_token": "accessToken",
    "shop_id":      "shopId",
    "partner_id":   "partnerId"
  }
}
```
`GenericCategoryService` appends `?access_token=...&shop_id=...&partner_id=...&timestamp=...&sign=...`
to every category/attribute request automatically.

To add a **new channel** with HMAC signing: set `authStrategy = "HMAC_SHA256"` and configure
`credentialQueryParams` for the channel-specific credential params. Override `hmacSigningCredentialKey`
only if the channel uses a different field name than `"partnerId"` in its sign formula.

---

## Implementation Notes

**Controller:** `channel/category/controller/ChannelCategoryApiConfigAdminController.java`

**Repository:** `ChannelCategoryApiConfigRepository` — `findByChannelType`, `findByEnabledTrue`, `findAll`.

**Cache invalidation:** `PUT /tree-api` calls `ChannelCategoryRepository.deleteAllByChannelType(channelType)` to clear stale cache across all stores for the channel. Cache-miss on the next tree load triggers a fresh fetch from the updated endpoint. Errors are logged but do not fail the config update.

**Update strategy:** Load document → replace targeted sub-document → save. Other sub-documents (`importConfig`, `taxonomyConfig`) are untouched.
