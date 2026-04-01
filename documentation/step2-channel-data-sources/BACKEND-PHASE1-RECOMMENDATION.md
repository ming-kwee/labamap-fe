# Backend Recommendation — Phase 1: Merchant-Sourced Options (Scenario A)

**Date:** 2026-03-07
**Author:** Frontend Team
**Status:** Frontend complete. Backend implementation required.
**Priority:** High — blocks real warehouse/shipping template options in Step 2 channel form.

---

## Overview

Step 2 of the product wizard asks sellers to fill channel-specific fields per connected store.
Some SELECT/MULTISELECT fields — warehouse location, shipping template, fulfillment policy —
must show options sourced from the merchant's live account, not from static configuration.

Currently the backend schema service (`ChannelStepSchemaService`) fills `options[]` from
`EcommerceMasterAttributeDocument.allowedValues` — a static list that becomes stale or
wrong as soon as the merchant adds or removes a warehouse.

This document specifies everything the backend must implement for Phase 1.
The frontend is already complete and waiting for the backend contract described below.

---

## Delivery Modes

Two modes are supported. Choose based on list size and volatility:

| Mode | Trigger condition | How it works |
|------|-------------------|--------------|
| **Eager embed** | Small stable lists (< 50 items) | Backend fetches from channel API during schema generation, fills `options[]` normally. Frontend sees a static options array — no changes needed. |
| **Lazy load** | Large or volatile lists | Backend sets `optionsEndpoint` and leaves `options[]` empty. Frontend fetches when the field renders, shows a spinner until resolved. |

For Phase 1 scope (warehouses, shipping templates), **eager embed is preferred** because these
lists are small (typically < 20 items). Lazy load is the fallback for stores with many locations.

---

## 1. Document Schema Change — `EcommerceMasterAttributeDocument`

Add two new fields to the MongoDB document that drives schema generation:

```java
// In EcommerceMasterAttributeDocument (or its DTO/record)

/**
 * Declares how the field's options are sourced.
 * STATIC    — options come from allowedValues (current behaviour, default).
 * MERCHANT_API — options are fetched at runtime from the channel's merchant API.
 */
private OptionsSource optionsSource = OptionsSource.STATIC;

/**
 * The channel-specific API operation name used to fetch options when
 * optionsSource == MERCHANT_API. Interpreted by the channel's
 * ChannelMerchantDataService implementation.
 *
 * Examples: "GetWarehouses", "GetShippingTemplates", "GetLocations"
 */
private String merchantApiOperation;

public enum OptionsSource {
    STATIC,
    MERCHANT_API
}
```

**Seed data to add for Phase 1** (insert or upsert via `DataInitializer`):

| channelType | fieldName | merchantApiOperation |
|-------------|-----------|----------------------|
| `tiktok` | `warehouse_id` | `GetWarehouses` |
| `tiktok` | `shipping_template_id` | `GetShippingTemplates` |
| `lazada` | `warehouse_code` | `GetWarehouseDetail` |
| `shopify` | `location_id` | `GetLocations` |
| `shopify` | `collection_id` | `GetCustomCollections` |
| `ebay` | `fulfillment_policy_id` | `GetFulfillmentPolicies` |
| `shopee` | `logistics_channel_id` | `GetLogistics` |
| `amazon` | `merchant_shipping_group` | `ListInputFieldValues` |

---

## 2. New Service Interface — `ChannelMerchantDataService`

Create a new Spring service interface. One implementation per channel type.
Register implementations as a `Map<String, ChannelMerchantDataService>` bean keyed by
`channelType` so `ChannelStepSchemaService` can look up the right one at runtime.

```java
package com.labamap.ecommerce.channel.merchant;

import reactor.core.publisher.Mono;
import java.util.List;

public interface ChannelMerchantDataService {

    /** Returns the channelType this implementation handles, e.g. "tiktok". */
    String getChannelType();

    /**
     * Fetches live options for a given field from the merchant's channel account.
     *
     * @param storeId         the channel_store_connections storeId
     * @param fieldName       the EcommerceMasterAttributeDocument fieldName, e.g. "warehouse_id"
     * @param organizationId  the organization owning the store
     * @return list of {value, label} pairs to populate the SELECT field
     */
    Mono<List<FieldOption>> fetchOptions(String storeId, String fieldName, String organizationId);

    /** Simple value/label pair returned to the schema layer and REST endpoint. */
    record FieldOption(String value, String label) {}
}
```

### Phase 1 implementations to build

#### `TikTokMerchantDataService`

```java
@Service
public class TikTokMerchantDataService implements ChannelMerchantDataService {

    @Override
    public String getChannelType() { return "tiktok"; }

    @Override
    public Mono<List<FieldOption>> fetchOptions(String storeId, String fieldName, String organizationId) {
        return switch (fieldName) {
            case "warehouse_id"          -> fetchWarehouses(storeId, organizationId);
            case "shipping_template_id"  -> fetchShippingTemplates(storeId, organizationId);
            default -> Mono.just(List.of());
        };
    }

    private Mono<List<FieldOption>> fetchWarehouses(String storeId, String organizationId) {
        // Call TikTok Partner API: GET /api/logistics/get_warehouse_list
        // Requires: access_token resolved from channel_store_connections.credentials
        // Map response: warehouse_id → FieldOption(warehouse_id, warehouse_name)
    }

    private Mono<List<FieldOption>> fetchShippingTemplates(String storeId, String organizationId) {
        // Call TikTok Partner API: GET /api/logistics/shipping_template/list
        // Map response: template_id → FieldOption(template_id, name)
    }
}
```

#### `LazadaMerchantDataService`

```java
@Service
public class LazadaMerchantDataService implements ChannelMerchantDataService {

    @Override
    public String getChannelType() { return "lazada"; }

    @Override
    public Mono<List<FieldOption>> fetchOptions(String storeId, String fieldName, String organizationId) {
        return switch (fieldName) {
            case "warehouse_code" -> fetchWarehouses(storeId, organizationId);
            default -> Mono.just(List.of());
        };
    }

    private Mono<List<FieldOption>> fetchWarehouses(String storeId, String organizationId) {
        // Call Lazada Open Platform: GET /warehouse/get
        // Map: warehouseCode → FieldOption(warehouseCode, name)
    }
}
```

Additional implementations (`ShopifyMerchantDataService`, `EbayMerchantDataService`, etc.)
follow the same pattern. Stubs returning `Mono.just(List.of())` are acceptable for channels
not yet integrated — the frontend will show an empty SELECT rather than breaking.

### Bean registration

```java
@Configuration
public class MerchantDataServiceConfig {

    @Bean
    public Map<String, ChannelMerchantDataService> merchantDataServices(
            List<ChannelMerchantDataService> implementations) {
        return implementations.stream()
            .collect(Collectors.toMap(
                ChannelMerchantDataService::getChannelType,
                Function.identity()
            ));
    }
}
```

---

## 3. Schema Generation Update — `ChannelStepSchemaService`

When building a `ChannelFormField` during schema generation, check `optionsSource`:

```java
// Pseudocode inside ChannelStepSchemaService.buildField(...)

ChannelFormFieldDto field = mapBaseFields(attribute, currentValue);

if (attribute.getOptionsSource() == OptionsSource.MERCHANT_API) {
    ChannelMerchantDataService svc = merchantDataServices.get(channelType);

    if (svc != null) {
        List<FieldOption> liveOptions = svc
            .fetchOptions(storeId, attribute.getFieldName(), organizationId)
            .block(Duration.ofSeconds(5));   // or use reactive chain

        if (liveOptions != null && liveOptions.size() <= 50) {
            // ── Eager embed (preferred for Phase 1) ──────────────────────
            field.setOptions(liveOptions.stream()
                .map(o -> new OptionDto(o.value(), o.label()))
                .toList());
            field.setOptionsSource("MERCHANT_API");

        } else {
            // ── Lazy load (large lists or fetch failed) ───────────────────
            field.setOptions(List.of());
            field.setOptionsSource("MERCHANT_API");
            field.setOptionsEndpoint(buildOptionsEndpoint(
                channelType, storeId, attribute.getFieldName(), organizationId
            ));
        }
    }
}
```

```java
private String buildOptionsEndpoint(String channelType, String storeId,
                                    String fieldName, String organizationId) {
    return String.format(
        "/merchant-data/%s/%s/field-options?fieldName=%s&organizationId=%s",
        URLEncoder.encode(channelType, UTF_8),
        URLEncoder.encode(storeId, UTF_8),
        URLEncoder.encode(fieldName, UTF_8),
        URLEncoder.encode(organizationId, UTF_8)
    );
}
```

**Important:** Use a short timeout (3–5 s) with a fallback to lazy load. The schema endpoint
must not be slow due to a stalled channel API call.

```java
// Recommended: attempt eager, fall back to lazy on timeout or error
liveOptions = svc.fetchOptions(storeId, fieldName, organizationId)
    .timeout(Duration.ofSeconds(3))
    .onErrorResume(e -> {
        log.warn("Merchant data fetch failed for {}/{} — falling back to lazy load: {}",
            channelType, fieldName, e.getMessage());
        return Mono.empty();
    })
    .blockOptional()
    .orElse(null);

if (liveOptions == null) {
    // set lazy-load path
}
```

---

## 4. New REST Endpoint — Lazy Load

Required for the lazy-load path. The frontend calls this when `optionsEndpoint` is present.

```
GET /api/v1/merchant-data/{channelType}/{storeId}/field-options
    ?fieldName={fieldName}&organizationId={organizationId}
```

**Response:**
```json
{
  "fieldName": "warehouse_id",
  "options": [
    { "value": "WH_001", "label": "Main Warehouse (Jakarta)" },
    { "value": "WH_002", "label": "West Java Fulfillment" }
  ]
}
```

**Controller:**
```java
@RestController
@RequestMapping("/api/v1/merchant-data")
public class MerchantDataController {

    private final Map<String, ChannelMerchantDataService> merchantDataServices;

    @GetMapping("/{channelType}/{storeId}/field-options")
    public Mono<FieldOptionsResponse> getFieldOptions(
            @PathVariable String channelType,
            @PathVariable String storeId,
            @RequestParam String fieldName,
            @RequestParam String organizationId) {

        ChannelMerchantDataService svc = merchantDataServices.get(channelType);
        if (svc == null) {
            return Mono.just(new FieldOptionsResponse(fieldName, List.of()));
        }
        return svc.fetchOptions(storeId, fieldName, organizationId)
            .map(options -> new FieldOptionsResponse(fieldName, options));
    }

    public record FieldOptionsResponse(String fieldName, List<FieldOption> options) {}
}
```

**Error handling:** Return `200` with empty `options[]` rather than `4xx/5xx` if the channel
API is unavailable. The frontend will show an empty SELECT — bad UX but not a crash.
Log the error internally.

---

## 5. Credential Resolution

`ChannelMerchantDataService` implementations need the store's access token to call the
channel API. Retrieve it from `channel_store_connections` by `storeId`:

```java
// In each service implementation
ChannelStoreConnection store = channelStoreRepository
    .findByStoreIdAndOrganizationId(storeId, organizationId)
    .block();

String accessToken = store.getCredentials().get("accessToken");
// or "apiKey", "secretKey", etc. — key name depends on channel
```

Credentials are stored encrypted. Ensure the service has access to the same decryption
utility used elsewhere in the codebase.

---

## 6. `merchant_data` Section in Schema Response

Group all `MERCHANT_API` fields under a dedicated section in `ChannelSchemaPerStore.sections`
so the frontend renders them with the correct blue-tinted account-specific header:

```json
{
  "sectionName": "merchant_data",
  "label": "Account Settings",
  "priority": 10,
  "fields": [
    {
      "fieldName": "warehouse_id",
      "fieldType": "SELECT",
      "label": "Fulfillment Warehouse",
      "required": true,
      "optionsSource": "MERCHANT_API",
      "options": [
        { "value": "WH_001", "label": "Main Warehouse (Jakarta)" }
      ]
    }
  ]
}
```

`priority: 10` places it after `required` (priority 1) and `recommended` (priority 5) sections
but before `optional` (priority 20). Adjust to match your existing priority scheme.

---

## 7. Caching Recommendation

Channel API calls during schema generation add latency. Cache merchant data with a short TTL:

```java
@Cacheable(
    value = "merchantOptions",
    key = "#channelType + ':' + #storeId + ':' + #fieldName",
    unless = "#result.isEmpty()"
)
public List<FieldOption> fetchOptionsCached(String channelType, String storeId, String fieldName, String organizationId) {
    // delegates to the appropriate ChannelMerchantDataService
}
```

Recommended TTL by field type:

| Field | Suggested TTL |
|-------|--------------|
| `warehouse_id` | 30 minutes |
| `shipping_template_id` | 60 minutes |
| `location_id` (Shopify) | 30 minutes |
| `fulfillment_policy_id` (eBay) | 2 hours |
| `logistics_channel_id` (Shopee) | 4 hours |

Use Redis with `@EnableCaching` + a `RedisCacheManager` configured with per-cache TTLs.
If Redis is unavailable, fall back to Caffeine in-process cache.

---

## Implementation Order

Complete steps in this order to unblock the frontend as early as possible:

1. **`EcommerceMasterAttributeDocument` changes** — add `optionsSource`, `merchantApiOperation` fields and seed data
2. **`ChannelMerchantDataService` interface** — define the interface and `FieldOption` record
3. **Stub implementations** — `TikTokMerchantDataService` and `LazadaMerchantDataService` returning hardcoded test data (unblocks integration testing)
4. **Schema generation update** — update `ChannelStepSchemaService` to call stubs and embed options
5. **REST endpoint** — `GET /merchant-data/{channelType}/{storeId}/field-options`
6. **Real channel API calls** — replace stubs with live TikTok / Lazada calls
7. **Caching** — add Redis TTL cache on top of real calls
8. **Additional channels** — Shopify, eBay, Shopee, Amazon

---

## Frontend Contract (do not break)

The frontend reads these exact fields from `ChannelFormField` in the schema response:

| Field | Type | Notes |
|-------|------|-------|
| `optionsSource` | `"STATIC" \| "MERCHANT_API"` | Omit or `"STATIC"` for all existing static fields |
| `optionsEndpoint` | `string` | Only set for lazy-load path; omit for eager embed |
| `options` | `Array<{value, label}>` | Full array for eager; empty array for lazy |

The section `sectionName: "merchant_data"` is handled by the frontend with a distinct
blue-accented header. Any fields placed in this section must not also appear in `required`,
`recommended`, or `optional` sections — duplicate rendering will occur.

Existing static fields (`optionsSource` absent or `"STATIC"`) are completely unaffected.
No migration of existing data is needed.

---

## Testing Checklist

- [ ] Schema response includes `merchant_data` section with `optionsSource: "MERCHANT_API"` fields
- [ ] Eager embed: `options[]` is non-empty; `optionsEndpoint` is absent; field renders as normal SELECT
- [ ] Lazy load: `options[]` is empty; `optionsEndpoint` is set; frontend shows spinner then populates
- [ ] `GET /merchant-data/tiktok/{storeId}/field-options?fieldName=warehouse_id` returns `{fieldName, options[]}`
- [ ] Channel API timeout (> 3 s) falls back to lazy-load path without failing schema generation
- [ ] Channel API error falls back to lazy-load path without throwing 500
- [ ] Credentials are resolved correctly from `channel_store_connections`
- [ ] Cache hit: second schema load within TTL does not call channel API
- [ ] Static fields (`optionsSource` absent) are completely unaffected by this change
- [ ] Stub implementation returns test data before real channel calls are wired
