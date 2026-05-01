# Sync API Integration

## Overview

The sync API is a separate service at `localhost:9000` that takes a channel-agnostic product representation and handles the actual channel API calls (Shopify, Amazon, WIX, TikTok Shop, etc.).

Our backend transforms the master product into a `SyncChannelProductRequest`, then calls:

```
POST localhost:9000/sync_channel_product_impl
```

The sync API returns a `SyncApiResponse` with the `channelProductId` assigned by the channel.

---

## WebClient Configuration

The `WebClient` bean (`syncApiWebClient`) is configured with `baseUrl = "http://localhost:9000"`. All publish calls use:

```
POST /sync_channel_product_impl
Content-Type: application/json
```

On `WebClientResponseException`, the error includes the HTTP status code and response body. The error code in the response follows the pattern `SYNC_API_HTTP_{statusCode}`.

---

## SyncChannelProductRequest Structure

A flat, strongly-typed request — **no** nested `channelProducts` wrapper. All 5 components are top-level arrays:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "pub_1746000000000_shopify_prod_abc123",
  "channelAttributes": [...],
  "variantGroups": [...],
  "optionGroups": [...],
  "metadataGroups": [...],
  "channelCredentials": [...]
}
```

- `id` — UUID generated for this sync request (for idempotency on the sync side)
- `eventId` — the `publishId` from our system (`pub_{timestamp}_{channelId}_{masterProductId}`)

---

## channelAttributes

Product-level fields, flat array:

```json
[
  {
    "attrId":        "id",
    "chnlAttrName":  "id",
    "chnlAttrValue": "550e8400-...",
    "chnlAttrType":  "string",
    "isCommonField": true,
    "isSupportField": true
  },
  {
    "attrId":        "product_name",
    "chnlAttrName":  "product.title",
    "chnlAttrValue": "Wireless Earbuds Pro",
    "chnlAttrType":  "string",
    "isCommonField": false,
    "isSupportField": false
  }
]
```

`isCommonField` — marks system-level routing fields (id, organization, store).  
`isSupportField` — marks fields that support the sync operation but aren't channel product attributes (e.g. body_html).

---

## variantGroups

One `VariantGroup` per variant. Each group contains the variant's fields as `ChannelVariant` entries:

```json
[
  {
    "channelVariant": [
      {
        "vrntId":       "channel_variant_price",
        "chnlVrntName": "product.variants.price",
        "chnlVrntValue": "29.99",
        "chnlVrntType": "string",
        "isSupportField": false
      },
      {
        "vrntId":       "color",
        "chnlVrntName": "product.variants.option1",
        "chnlVrntValue": "Black",
        "chnlVrntType": "string",
        "isSupportField": false
      },
      {
        "vrntId":       "passthrough_inventory_policy",
        "chnlVrntName": "product.variants.inventory_policy",
        "chnlVrntValue": "deny",
        "chnlVrntType": "TEXT",
        "isSupportField": false
      }
    ]
  }
]
```

Fields emitted in two passes:
1. Pre-registered fields from `attributeMappings.variantFields` (sorted by dimension order when ProductType is present)
2. Passthrough — any variant field not in pre-registered mappings (channel-specific fields like `barcode`, `inventory_policy`)

---

## optionGroups

One `OptionGroup` per option (variant dimension name + values). Shopify options are named (e.g. "Color") and carry an array of valid values:

```json
[
  {
    "channelOption": [
      {
        "optnId":       "option_name",
        "chnlOptnName": "product.options.name",
        "chnlOptnType": "string",
        "chnlOptnValue": "Color",
        "isSupportField": false
      },
      {
        "optnId":       "option_values",
        "chnlOptnName": "product.options.values",
        "chnlOptnType": "array",
        "chnlOptnValue": "[\"Black\",\"White\",\"Red\"]",
        "isSupportField": false
      }
    ]
  }
]
```

The options key is channel-specific: `options` for Shopify, `productOptions` for WIX.

---

## metadataGroups

Workflow instructions for the sync API. All metadata items from `channelConfig.channelMetadataList` are packed into a single `MetadataGroup`:

```json
[
  {
    "channelMetadata": [
      {
        "channelId":   "shopify",
        "key":         "workflow_step",
        "value":       "create_product",
        "grouping":    "workflow",
        "subGrouping": "product",
        "target":      "shopify_api"
      },
      {
        "channelId":   "shopify",
        "key":         "api_version",
        "value":       "2024-01",
        "grouping":    "config",
        "subGrouping": null,
        "target":      "shopify_api"
      }
    ]
  }
]
```

Shopify has 5 workflow instruction items covering its multi-step API flow:
create product → update variants → add media → link media to choices → publish.

Metadata is static — seeded by `ChannelConfigurationDataLoader` on startup.

---

## channelCredentials

Authentication for the sync API to call the channel:

```json
[
  {
    "credId":       "auth_token",
    "chnlCredName": "token",
    "chnlCredValue": "shpat_..."
  },
  {
    "credId":       "auth_site_id",
    "chnlCredName": "wix-site-id",
    "chnlCredValue": "53001808-..."
  }
]
```

Credentials are injected into `request.publishOptions.customOptions` by the data-driven credential mapping step (from `ChannelConfiguration.integrationConfig.authentication.credentialMapping`) before `ChannelAttributeConverterService` runs.

---

## SyncApiResponse

```json
{
  "success":          true,
  "message":          "Product published successfully",
  "channelProductId": "8234567890123",
  "eventId":          "pub_1746000000000_shopify_prod_abc123",
  "status":           "COMPLETED",
  "data":             { ... },
  "warnings":         [],
  "errors":           [],
  "metadata":         { ... }
}
```

`status` values observed: `"COMPLETED"`, `"PENDING"`, `"FAILED"`.

`errors[]` shape: `{ "code": string, "message": string, "field": string, "details": string }`.

The `errors[].details` field maps to `PublishError.suggestion` in the publish response.

---

## Status Update after Publish

After the sync API responds, `ChannelPublishService` updates `channel_product_data`:

| Sync result | Status set |
|-------------|-----------|
| `response.success = true` | `PUBLISHED` (via `channelProductDataService.markPublished`) |
| `response.success = false` | `FAILED` (via `channelProductDataService.markFailed`, stores first error message) |
| `dryRun = true` | No update |

Failures here are logged but do not fail the overall publish response — the channel product was already published or failed independently.
