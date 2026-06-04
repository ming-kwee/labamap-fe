# API Reference — Merchant API Operations Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/merchant-api-operations`

Manages `merchant_api_operations` collection — data-driven configuration for fetching dynamic options (warehouses, brands, categories, carriers) from merchant/channel APIs.

**Status: Not Yet Implemented**

---

## GET `/admin/merchant-api-operations`

List all operations with optional filters.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `channelType` | String | Filter by channel — "shopify", "tiktokshop", etc. |
| `operationName` | String | Filter by operation name |
| `enabled` | Boolean | Default true; pass false to include disabled |

**Response:** `MerchantApiOperationDocument[]`

```json
[
  {
    "id": "6612a3f400000010",
    "channelType": "shopify",
    "operationName": "GetLocations",
    "baseUrl": "https://{storeId}/admin/api/2024-01",
    "urlPath": "/locations.json",
    "authStrategy": "BEARER_TOKEN",
    "authCredentialKey": "accessToken",
    "fixedQueryParams": {},
    "credentialQueryParams": {},
    "itemsJsonPath": "locations",
    "valueField": "id",
    "labelField": "name",
    "enabled": true,
    "description": "Shopify store locations for inventory management"
  }
]
```

---

## GET `/admin/merchant-api-operations/{id}`

Get a single operation by `_id`.

---

## POST `/admin/merchant-api-operations`

Create a new merchant API operation.

**Request body:**

```json
{
  "channelType": "walmart",
  "operationName": "GetFulfillmentCenters",
  "baseUrl": "https://marketplace.walmartapis.com",
  "urlPath": "/v3/fulfillment/centers",
  "authStrategy": "API_KEY_HEADER",
  "authCredentialKey": "clientId",
  "fixedQueryParams": {},
  "credentialQueryParams": {},
  "itemsJsonPath": "fulfillmentCenters",
  "valueField": "centerId",
  "labelField": "centerName",
  "enabled": true,
  "description": "Walmart fulfillment center list for inventory allocation"
}
```

**Response:** `201 Created` — saved document

**Auth strategy values:**

| Value | How auth is applied |
|---|---|
| `BEARER_TOKEN` | `Authorization: Bearer {credential}` header |
| `API_KEY_HEADER` | `X-API-Key: {credential}` header (key name configurable) |
| `API_KEY_QUERY` | `?apiKey={credential}` query param |
| `NO_AUTH` | No authentication |

---

## PUT `/admin/merchant-api-operations/{id}`

Update an existing operation. All fields optional.

**Common use case — update a changed endpoint:**
```json
{
  "urlPath": "/api/v2/warehouse/list",
  "itemsJsonPath": "data.warehouses"
}
```

**Response:** `200 OK` — updated document or `404`

---

## PUT `/admin/merchant-api-operations/{id}/disable`

Disable an operation. `GenericMerchantDataService.fetchOptions()` returns an empty list for disabled operations — the form field falls back to a text input.

**Response:** `200 OK` — updated document

---

## PUT `/admin/merchant-api-operations/{id}/enable`

Re-enable a disabled operation.

**Response:** `200 OK` — updated document

---

## DELETE `/admin/merchant-api-operations/{id}`

Hard delete. Use `disable` for reversible removal.

**Response:** `204 No Content`

---

## How It Connects to Form Schema

When `EcommerceMasterAttributeDocument` has:
```json
{
  "optionsSource": "MERCHANT_API",
  "merchantApiOperation": "GetWarehouses"
}
```

`ChannelStepSchemaService` calls `GenericMerchantDataService.fetchOptions(channelType, "GetWarehouses", storeId, orgId)` which:
1. Looks up this collection by `(channelType, operationName)` where `enabled=true`
2. Calls the configured endpoint with the store's credentials
3. Traverses `itemsJsonPath` using dot-notation
4. Maps each item to `{value: item[valueField], label: item[labelField]}`
5. Returns the options list to the form schema

Adding a new operation document is immediately reflected on the next Step 2 form load — no restart needed.

---

## Currently Seeded Operations (Reference)

| Channel | Operation | Description |
|---|---|---|
| `tiktokshop` | `GetWarehouses` | TikTok warehouse list |
| `tiktokshop` | `GetBrands` | TikTok brand list |
| `lazada` | `GetWarehouses` | Lazada warehouse list |
| `shopify` | `GetLocations` | Shopify store locations |
| `shopify` | `GetCollections` | Shopify custom collections |
| `ebay` | `GetShippingPolicies` | eBay shipping policy list |
| `shopee` | `GetLogistics` | Shopee logistics channel list |
| `amazon` | `GetMarketplaces` | Amazon marketplace list |

---

## Implementation Notes

**Repository:** `MerchantApiOperationRepository` — `findByChannelTypeAndOperationNameAndEnabledTrue`, `findByChannelTypeAndEnabledTrue`.

**Package:** `channel/merchant/repository/`

**Uniqueness:** `(channelType, operationName)` should be unique. On duplicate POST, return `409 Conflict`.
