# API Reference — Channel Category API Config Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/channel-category-api-configs`

Manages `channel_category_api_config` collection — configuration for how the platform fetches category trees and category attributes per channel.

**Status: Not Yet Implemented**

---

## GET `/admin/channel-category-api-configs`

List all channel category API configurations.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `channelType` | String | Filter by channel |
| `enabled` | Boolean | Default true |

**Response:** `ChannelCategoryApiConfig[]`

```json
[
  {
    "id": "6612a3f400000030",
    "channelType": "shopify",
    "treeApiConfig": {
      "endpoint": "/merchant-data/shopify/{storeId}/categories",
      "searchEndpoint": "/merchant-data/shopify/{storeId}/categories/search",
      "authStrategy": "BEARER_TOKEN",
      "authCredentialKey": "accessToken",
      "fullTreeStrategy": "SINGLE_REQUEST",
      "treeStructure": "HIERARCHICAL"
    },
    "attributeApiConfig": {
      "endpoint": "/merchant-data/shopify/{storeId}/category-attributes",
      "authStrategy": "BEARER_TOKEN",
      "authCredentialKey": "accessToken"
    },
    "taxonomyConfig": {
      "graphqlEndpoint": "https://{storeId}/admin/api/2024-01/graphql.json",
      "enabled": true
    },
    "enabled": true,
    "updatedAt": "2026-06-04T08:00:00"
  }
]
```

---

## GET `/admin/channel-category-api-configs/{channelType}`

Get config for a specific channel.

**Response:** `ChannelCategoryApiConfig` or `404`

---

## POST `/admin/channel-category-api-configs`

Create a new channel category API configuration (for onboarding a new channel).

**Request body:**

```json
{
  "channelType": "shopee_sg",
  "treeApiConfig": {
    "endpoint": "https://partner.shopeemobile.com/api/v2/product/get_category",
    "authStrategy": "API_KEY_QUERY",
    "authCredentialKey": "partnerKey",
    "fullTreeStrategy": "SINGLE_REQUEST",
    "treeStructure": "HIERARCHICAL"
  },
  "enabled": true
}
```

**Response:** `201 Created`

---

## PUT `/admin/channel-category-api-configs/{channelType}/tree-api`

Update the `treeApiConfig` for a channel — endpoint and auth changes when the channel updates their API.

**Request body:**

```json
{
  "endpoint": "/merchant-data/shopify/{storeId}/categories/v2",
  "searchEndpoint": "/merchant-data/shopify/{storeId}/categories/search/v2",
  "authStrategy": "BEARER_TOKEN",
  "authCredentialKey": "accessToken"
}
```

**Response:** `200 OK` — updated `treeApiConfig`

**Side effect:** `channel_category_cache` for this channel should be cleared so the next category tree load fetches fresh data against the new endpoint.

---

## PUT `/admin/channel-category-api-configs/{channelType}/attribute-api`

Update the `attributeApiConfig` — endpoint for fetching category-specific required attributes.

**Request body:**

```json
{
  "endpoint": "/merchant-data/amazon/{storeId}/category-attributes/v2",
  "authStrategy": "BEARER_TOKEN",
  "authCredentialKey": "accessToken"
}
```

**Response:** `200 OK` — updated `attributeApiConfig`

---

## PUT `/admin/channel-category-api-configs/{channelType}/disable`

Disable category sync for a channel. `CategorySyncJob` and `CategoryDriftPollingJob` will skip this channel.

**Response:** `200 OK`

---

## PUT `/admin/channel-category-api-configs/{channelType}/enable`

Re-enable a disabled channel.

**Response:** `200 OK`

---

## Fields NOT Editable via Admin API

| Field | Reason |
|---|---|
| `importWizardConfig` | Import wizard orchestration is complex; config changes require code review |
| `taxonomyConfig.graphqlQuery` | GraphQL query shape is tightly coupled to `ChannelTaxonomyService` parsing logic |

---

## Currently Configured Channels (Reference)

| Channel | Tree Strategy | Taxonomy |
|---|---|---|
| `shopify` | SINGLE_REQUEST / HIERARCHICAL | GraphQL taxonomy enabled |
| `amazon` | PAGINATED / FLAT | No |
| `tiktokshop` | SINGLE_REQUEST / HIERARCHICAL | No |
| `lazada` | RECURSIVE / HIERARCHICAL | No |
| `shopee` | SINGLE_REQUEST / FLAT | No |
| `ebay` | PAGINATED / FLAT | No |

---

## Implementation Notes

**Repository:** `ChannelCategoryApiConfigRepository` — `findByChannelType`, `findAll`.

**Package:** `channel/category/config/`

**Cache invalidation:** When `treeApiConfig.endpoint` is updated, call `ChannelCategoryRepository.deleteByChannelType(channelType)` to clear stale cached tree data. The next tree load will fetch from the updated endpoint.
