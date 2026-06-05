# API Reference — Merchant API Operations Admin

Base URL: `http://localhost:8888/labamap/api/v1/admin/merchant-api-operations`

Manages `merchant_api_operations` collection — data-driven configuration for fetching dynamic options (warehouses, brands, categories, carriers) from merchant/channel APIs.

**Status: Implemented** (2026-06-04)

**Files:**
- `channel/merchant/controller/MerchantApiOperationAdminController.java`
- `channel/merchant/model/dto/MerchantApiOperationRequest.java`
- `channel/merchant/repository/MerchantApiOperationRepository.java` — added `findByChannelType()` and `findByChannelTypeAndOperationName()`

---

## GET `/admin/merchant-api-operations`

List operations with optional filters. Filter priority:
1. `channelType` + `operationName` → exact pair lookup
2. `channelType` only → all operations for that channel
3. none → all operations across all channels

Default: returns only enabled operations. Pass `enabled=false` to include disabled ones.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `channelType` | String | — | Filter by channel — "shopify", "tiktokshop", etc. |
| `operationName` | String | — | Filter by operation name (use with channelType) |
| `enabled` | Boolean | `true` | Pass `false` to include disabled operations |

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

**Defaults applied when not provided:**
- `httpMethod` → `"GET"`
- `enabled` → `true`

**Returns `400 Bad Request`** when any of these are missing: `channelType`, `operationName`, `baseUrl`, `urlPath`, `itemsJsonPath`, `valueField`, `labelField`.
**Returns `409 Conflict`** when `(channelType, operationName)` pair already exists — use `PUT /{id}`.

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

**Immutable fields (ignored if provided):** `channelType`, `operationName`

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

**Controller:** `channel/merchant/controller/MerchantApiOperationAdminController.java`
**DTO:** `channel/merchant/model/dto/MerchantApiOperationRequest.java`
**Repository:** `channel/merchant/repository/MerchantApiOperationRepository.java`

Two methods were added to the repository for the admin API:
- `findByChannelType(channelType)` — all operations regardless of enabled status
- `findByChannelTypeAndOperationName(channelType, operationName)` — exact pair lookup regardless of enabled

**Uniqueness:** `(channelType, operationName)` is enforced by `@CompoundIndex(unique = true)` at DB level. `POST` returns `409 Conflict` via application-level guard before the DB constraint fires.

**No JOLT invalidation needed** — merchant API operations feed Step 2 form field options, not JOLT transformation schemas. Changes take effect on next form schema load.

**disable vs delete:** Use `disable` for reversible removal. A disabled operation causes `GenericMerchantDataService.fetchOptions()` to return an empty list — the form field gracefully falls back to free-text input.
