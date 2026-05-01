# Publishing Engine — Overview

## Purpose

The publishing engine transforms a master product into a channel-ready payload and delivers it to the downstream sync API. It is the backend implementation of Step 3 in the ecommerce wizard, but it is also callable directly for programmatic integrations and batch operations.

Base path: `/labamap/api/v1/channels/publish`

---

## Service Architecture

```
ChannelPublishController
  └── ChannelPublishService
        ├── ChannelStoreConnectionService    (resolve store, decrypt credentials)
        ├── GenericTokenRefreshService       (OAuth token refresh before publish)
        ├── ChannelProductDataService        (load Step 2 channelData + variantOverrides)
        ├── ProductCategoryRepository        (resolve category → ProductType)
        ├── ProductTypeRepository            (load variant dimension order)
        ├── ChannelJoltSpecRepository        (category-aware JOLT lookup)
        ├── JoltTransformationService        (apply JOLT spec)
        ├── GenericPostProcessingEngine      (post-processing rules)
        ├── ApiWrapperService                (wrap flat output under rootKey)
        ├── ChannelAttributeConverterService (build SyncChannelProductRequest)
        └── WebClient → localhost:9000/sync_channel_product_impl
```

---

## Full Pipeline

For each publish request:

```
1.  STORE-AWARE SETUP (only when storeId is present)
    a. Load ChannelStoreConnection (channelType, credentials, tokenExpiry)
    b. Derive channelId from store's channelType
    c. Load ChannelConfiguration for channelType
    d. Token refresh: compare now vs tokenExpiry[credKey] - bufferMinutes
       - If expiring: call channel token refresh endpoint, update store credentials
       - If refresh token invalid (401/403): reconnectRequired=true, abort
    e. Data-driven credential injection into request.publishOptions.customOptions
       (via channelConfig.integrationConfig.authentication.credentialMapping)
       Also injects: storeId, storeUrl, full decrypted credentials map
    f. Load channel_product_data for (masterProductId × storeId)
       Merge priority (lowest → highest):
         masterProduct < masterOverrides < channelData < variantOverrides[sku]
    g. Inject _productTypeVariantDimensions into masterProductData
       (resolved from masterProductData.categoryId → ProductCategory → ProductType)
       Also injects _productTypeName. Fire-and-forget on error.

2.  VALIDATION
    - masterProductId required
    - masterProductData required and non-empty
    - channelId required
    - joltSpec validated only if provided in request (it is optional — stored JOLT is loaded in step 3)

3.  CHANNEL CONFIG
    - Load active ChannelConfiguration for channelId

4.  JOLT SPEC RESOLUTION
    Priority (highest wins):
      a. channel_jolt_specs (by channelId + categoryId + organizationId, with 4-level fallback)
      b. request.joltSpec
    If neither found → 400 error with guidance to run /analyze with persistJolt=true

5.  JOLT TRANSFORMATION
    JoltTransformationService.transform(masterProductData, joltSpec)
    → Map<String, Object> transformedData

6.  POST-PROCESSING RULES
    GenericPostProcessingEngine.process(transformedData, channelConfig)
    Applied only when channelConfig.postProcessingRules is non-empty.

7.  POST-JOLT VARIANT OVERRIDE MERGE
    For each SKU in request.variantOverrides:
      Find matching variant in transformedData (top-level "variants" key, or one level deep)
      Merge non-null fields from variantOverrides[sku] onto variant node.
    Channel-specific variant fields (barcode, inventory_policy, etc.) that were not in
    the JOLT spec reach the channel API through this step.

8.  PAYLOAD WRAPPING
    If transformedData already has the rootKey (e.g. "product") → already wrapped, skip.
    Otherwise → ApiWrapperService.wrapPayload(transformedData, channelConfig)

9.  DRY RUN GATE
    dryRun=true → return wrapped transformedData, syncStatus="DRY_RUN", skip steps 10–12.

10. SYNC API CONVERSION
    ChannelAttributeConverterService.convertToSyncRequest(wrappedData, request, channelConfig, publishId)
    Builds: channelAttributes, variantGroups, optionGroups, metadataGroups, channelCredentials

11. SYNC API CALL
    POST localhost:9000/sync_channel_product_impl
    → SyncApiResponse: success, channelProductId, eventId, status, warnings, errors

12. STATUS UPDATE
    channel_product_data.status = PUBLISHED (success) or FAILED (failure)
    Skipped on dryRun.
```

---

## Two Publish Flows

### Store-aware flow (preferred)

When `storeId` is provided the service resolves the full store context automatically:
- credentials are decrypted and injected via the credential mapping in `ChannelConfiguration`
- Step 2 channel data and variant overrides are loaded and merged
- `channel_product_data` status is updated after publish

### Legacy flow (channelId-only)

When only `channelId` is provided (no `storeId`), credentials must be supplied explicitly in `publishOptions.customOptions`. Step 2 data is not merged. Status is not updated.

---

## Publish ID Format

```
pub_{epoch_ms}_{channelId}_{masterProductId}
```

Example: `pub_1746000000000_shopify_prod_abc123`

This ID is the `eventId` in the `SyncChannelProductRequest`, and is returned as `publishId` in the response.

---

## dryRun Mode

`dryRun: true` runs steps 1–8 (all transformation steps) and returns the wrapped, post-processed payload as `publishedData` without calling the sync API. No status update occurs.

Use for: testing JOLT specs, validating step 2 data merges, previewing channel payloads.

`syncStatus` = `"DRY_RUN"` in the response.

---

## Services in this Module

| Service | Package | Role |
|---------|---------|------|
| `ChannelPublishService` | `publishing/service/` | Orchestrates the full pipeline |
| `ChannelAttributeConverterService` | `publishing/service/` | Converts transformed data → `SyncChannelProductRequest` |
| `FieldTransformationService` | `publishing/service/` | Atomic field-level type conversions |
| `PublishAnalysisService` | `publishing/service/` | Pre-flight analysis (service complete, no endpoint yet) |
| `JoltTransformationService` | `channel/service/` | Applies JOLT transformation spec |
| `GenericPostProcessingEngine` | `channel/service/` | Applies post-processing rules |
| `ApiWrapperService` | `channel/service/` | Wraps flat payload under rootKey |
| `GenericTokenRefreshService` | `channel/store/service/` | Data-driven OAuth token refresh |

---

## Error Handling

| Scenario | HTTP status | syncStatus |
|----------|-------------|------------|
| Invalid request (missing required fields) | 400 | FAILED |
| No JOLT spec available | 400 | FAILED |
| Sync API HTTP error | 200 (body success=false) | FAILED |
| Unexpected exception | 500 | FAILED |
| Partial sync API response (success=false) | 400 | per sync response |

All error responses include a `PublishError` with `field`, `errorCode`, `message`, and `suggestion`.
