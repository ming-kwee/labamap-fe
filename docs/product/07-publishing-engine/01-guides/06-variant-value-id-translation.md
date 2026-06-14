# Variant Option Value Translation — Label → Channel ID at Publish Time

**Designed:** 2026-06-10  
**Relates to:** `18-variant-option-suggestions-frontend.md`, `05-post-processing-config.md`

---

## Problem

Channel taxonomy returns variant option values in two forms:

| Form | Example | Channels |
|---|---|---|
| **Label (string)** | `"Black"`, `"XS"` | Shopify, WIX, eBay |
| **Taxonomy ID** | `"123"`, `"LZ_COLOR_019"` | TikTok Shop, Lazada, Shopee |

The master product always stores labels: `variant.options = { Color: "Black", Size: "XS" }`.

When a seller applies variant option suggestions in Step 2 and saves, `variantOverrides` stores the master's label:

```json
{
  "variantOverrides": {
    "SKU-XS-BLACK": { "option1": "Black", "option2": "XS" }
  }
}
```

For **label-channels** (Shopify, WIX) this is correct — `variant.option1 = "Black"` is what the API expects. For **ID-channels** (TikTok `value_id`, Lazada `sales_attributes`) the API requires the taxonomy ID `"123"`, not the string `"Black"`.

---

## Decision: Option B — Translate Labels at Backend Publish Time

**Frontend stores labels always.** Backend translates label → channel ID during the publish pipeline, using the existing `ChannelValueMappingService`.

### Why not Option A (store ID at frontend)?

Option A requires the frontend to know whether a channel is label-based or ID-based, and to look up the taxonomy ID at apply time. This couples the Apply handler to channel API knowledge. It also means stored `variantOverrides` are no longer human-readable and cannot be re-used across channels.

### Why Option B is safe

- `ChannelValueMappingService` already implements EXACT → FUZZY (Levenshtein) → FREE_TEXT fallback
- If no mapping document exists for a field, confidence is `NONE` and the original label is passed through — the channel accepts it as a custom value or the publish fails explicitly (better than silently sending the wrong ID)
- The service is already cached (`@Cacheable("channelValueMappings")`) — no per-variant DB round-trip at publish time

---

## Frontend: No Changes Needed

The current Apply implementation already stores labels:

```typescript
// handleVariantSuggestionsApply — current behaviour
const masterVal = variantOpts?.[fieldName] ?? variantOpts?.[label]; // "Black" (label from master)
newVariantOverrides[v.sku][optionKey] = masterVal;                  // "Black" stored as-is
```

Because the master product always holds human-readable strings, `masterVal` is always a label. Backend handles the rest.

The only frontend contract to maintain: **`opt.label` (not `opt.value`) is what goes into `option{n}_values`**. `opt.value` is the taxonomy GID/ID and is never stored in channel product data — it is only used transiently during the apply flow to display the value in the datalist.

---

## Backend: `VariantValueTranslationService`

### Where it hooks in

In `ChannelPublishService`, after merging `variantOverrides` into `masterProductData` but **before** `buildVariantGroups` / JOLT:

```
loadAndMergeChannelData()       ← variantOverrides merged here (labels)
        ↓
VariantValueTranslationService  ← NEW: labels → IDs for ID-channels (reactive)
        ↓
buildVariantGroups()            ← reads translated values
        ↓
JOLT transform
        ↓
GenericPostProcessingEngine     ← BUILD_SALES_ATTRIBUTES sees value_id already set
```

### How it resolves dimension name from slot

`variantOverrides` uses `option1`/`option2` as keys. The dimension name ("Color", "Size") is in `channelData.option1_name` / `channelData.option2_name`. The service reads those to reconstruct the mapping:

```
option1 = "Black"  +  channelData.option1_name = "Color"
→ dimension = "Color" (or normalized: "color")
→ resolveSuggestion(channelType, "color", "Black", channelFieldName)
```

`channelFieldName` is looked up from `EcommerceMasterAttributeDocument` via `masterFieldName = "color"` — the same document already has `masterFieldName` linked to the channel-specific field.

### Service contract

```java
/**
 * Translates variant dimension labels → channel-specific values (IDs or labels)
 * at publish time. No-op for channels where labels ARE the API values.
 *
 * Returns updated productData map with dimension values replaced where a
 * mapping document exists in channel_field_value_mappings.
 */
public interface VariantValueTranslationService {

    /**
     * @param channelType     e.g. "tiktokshop", "lazada"
     * @param productData     merged product data (variants contain label values)
     * @param channelData     Step 2 saved data (contains option{n}_name keys)
     * @param channelConfig   used to check if translation is needed for this channel
     * @return productData with variant dimension values translated where possible
     */
    Mono<Map<String, Object>> translateVariantValues(
            String channelType,
            Map<String, Object> productData,
            Map<String, Object> channelData,
            ChannelConfiguration channelConfig);
}
```

### Implementation sketch

```java
@Override
public Mono<Map<String, Object>> translateVariantValues(
        String channelType,
        Map<String, Object> productData,
        Map<String, Object> channelData,
        ChannelConfiguration channelConfig) {

    // Skip translation for label-based channels — no mapping documents expected
    if (!requiresValueTranslation(channelType, channelConfig)) {
        return Mono.just(productData);
    }

    // Build slot → dimension map from channelData.option{n}_name
    Map<String, String> slotToDimension = new LinkedHashMap<>();
    for (int i = 1; i <= 3; i++) {
        Object name = channelData.get("option" + i + "_name");
        if (name instanceof String s && !s.isBlank()) {
            slotToDimension.put("option" + i, s.toLowerCase(Locale.ROOT));
        }
    }
    if (slotToDimension.isEmpty()) return Mono.just(productData);

    List<Map<String, Object>> variants = extractVariants(productData, channelType);
    if (variants.isEmpty()) return Mono.just(productData);

    // For each variant, translate each slot value
    return Flux.fromIterable(variants)
        .flatMap(variant -> translateVariant(variant, channelType, slotToDimension))
        .collectList()
        .map(translated -> rebuildProductData(productData, translated, channelType));
}

private Mono<Map<String, Object>> translateVariant(
        Map<String, Object> variant,
        String channelType,
        Map<String, String> slotToDimension) {

    // Collect translation tasks for each slot present in this variant
    List<Mono<Void>> tasks = new ArrayList<>();
    Map<String, Object> mutable = new LinkedHashMap<>(variant);

    for (Map.Entry<String, String> slot : slotToDimension.entrySet()) {
        String optionKey = slot.getKey();       // "option1"
        String dimension = slot.getValue();     // "color"
        Object labelValue = variant.get(optionKey);
        if (labelValue == null) continue;

        Mono<Void> task = resolveChannelFieldName(channelType, dimension)
            .flatMap(channelFieldName ->
                valueMappingService.resolveSuggestion(
                    channelType, dimension, labelValue, channelFieldName))
            .doOnNext(suggestion -> {
                if (suggestion.confidence() != MasterMappedSuggestion.Confidence.NONE
                        && suggestion.suggestedValue() != null) {
                    // Replace label with channel value in-place
                    mutable.put(optionKey, suggestion.suggestedValue());
                    // Also write channel-native field for post-processing (e.g. color_value_id)
                    mutable.put(dimension + "_value_id", suggestion.suggestedValue());
                    log.debug("Translated {}.{}: '{}' → '{}' ({})",
                        channelType, dimension, labelValue,
                        suggestion.suggestedValue(), suggestion.confidence());
                }
                // NONE → keep original label (FREE_TEXT path)
            })
            .then();
        tasks.add(task);
    }

    return Mono.when(tasks).thenReturn(mutable);
}
```

### `requiresValueTranslation` — data-driven, no if/switch

Instead of hardcoding which channels need translation, check whether any `channel_field_value_mappings` document exists for this channelType. This keeps the service fully data-driven:

```java
private boolean requiresValueTranslation(String channelType,
                                          ChannelConfiguration channelConfig) {
    // Flag in integrationConfig.variantValueTranslation (set in ChannelConfigurationDataLoader)
    ChannelConfiguration.IntegrationConfig ic = channelConfig.getIntegrationConfig();
    return ic != null && Boolean.TRUE.equals(ic.getVariantValueTranslation());
}
```

Add `variantValueTranslation: true` to TikTok Shop and Lazada in `ChannelConfigurationDataLoader`. Shopify, WIX, eBay leave it `false` (or absent).

---

## Channel Behaviour Summary

| Channel | Variant option API | Translation | Notes |
|---|---|---|---|
| Shopify | `variant.option1 = "Black"` (label) | ❌ No | Labels pass through directly |
| WIX | `choices = { Color: "Black" }` (label) | ❌ No | Labels pass through |
| eBay | `VariationSpecifics.Color = "Black"` (label) | ❌ No | |
| TikTok Shop | `sales_attributes[].value_id = "123"` | ✅ Yes | Free-text → `custom_value` |
| Lazada | `sales_attributes[].value_id = "123"` | ✅ Yes | Free-text → fallback |
| Shopee | `tier_variation` by `option_list[].name` | Partial | Label-based in tier system |
| Amazon | `variation_attributes` (label) | ❌ No | Amazon takes display values |

---

## TikTok Shop: Free-Text Fallback

TikTok Shop accepts custom values (not in taxonomy) via the `custom_value` field:

```json
{ "attribute_id": "xxx", "value_id": "", "custom_value": "Maroon" }
```

When `ChannelValueMappingService` returns `NONE` confidence (no mapping found for `"Maroon"`), the translation service writes:

```java
mutable.put("color_custom_value", labelValue.toString());
// color_value_id stays absent or ""
```

The `BUILD_SALES_ATTRIBUTES` post-processing rule checks `color_value_id` first; if absent/blank, uses `color_custom_value` as `custom_value`.

This means sellers can freely type any color name — it publishes as a custom value on TikTok without requiring a mapping document entry for every long-tail value.

---

## Data Requirements: `channel_field_value_mappings`

For each ID-based channel, seed documents for the common variant dimensions.  
These are added to `ChannelValueMappingDataLoader` (`@Order(120)`):

```java
// TikTok Shop — Color
ChannelFieldValueMappingDocument.builder()
    .channelType("tiktokshop")
    .masterFieldName("color")
    .channelFieldName("color_value_id")
    .fallbackStrategy(FallbackStrategy.FREE_TEXT)  // → custom_value path
    .mappings(List.of(
        entry("Black",  "201341716", "Black"),
        entry("White",  "201341717", "White"),
        entry("Red",    "201341718", "Red"),
        entry("Blue",   "201341724", "Blue"),
        ...
    ))
    .build()

// TikTok Shop — Size
ChannelFieldValueMappingDocument.builder()
    .channelType("tiktokshop")
    .masterFieldName("size")
    .channelFieldName("size_value_id")
    .fallbackStrategy(FallbackStrategy.FREE_TEXT)
    .mappings(List.of(
        entry("XS", "201346061", "XS"),
        entry("S",  "201346062", "S"),
        ...
    ))
    .build()
```

No code change is needed to add a new channel or new dimension — insert the document and restart (or wait for cache TTL = 10 min).

---

## `BUILD_SALES_ATTRIBUTES` Rule Update (TikTok Post-Processing)

After `VariantValueTranslationService` runs, TikTok variants will have extra fields:

```
variant.color            = "Black"      (original label — kept)
variant.color_value_id   = "123"        (translated — NEW)
variant.color_custom_value = ""         (empty if matched)

variant.size             = "XS"
variant.size_value_id    = "201346061"
variant.size_custom_value = ""
```

Update the `BUILD_SALES_ATTRIBUTES` rule in `GenericPostProcessingEngine` to read `{dim}_value_id` and `{dim}_custom_value`:

```java
// Current: reads color/size as custom_value only
salesAttr.put("custom_value", String.valueOf(item.get(dim)));

// Updated: prefers value_id, falls back to custom_value
Object valueId = item.get(dim + "_value_id");
Object customVal = item.get(dim + "_custom_value");
if (valueId != null && !valueId.toString().isBlank()) {
    salesAttr.put("value_id", valueId.toString());
    salesAttr.put("custom_value", "");
} else {
    salesAttr.put("value_id", "");
    salesAttr.put("custom_value",
        customVal != null ? customVal.toString() : String.valueOf(item.get(dim)));
}
```

---

## Implementation Checklist

### Backend (required for TikTok / Lazada variant option values)

- [ ] Add `variantValueTranslation: boolean` field to `ChannelConfiguration.IntegrationConfig`
- [ ] Update `ChannelConfigurationDataLoader` — set `variantValueTranslation = true` for TikTok and Lazada
- [ ] Implement `VariantValueTranslationService` + `VariantValueTranslationServiceImpl`
- [ ] Hook into `ChannelPublishService` — call service after `loadAndMergeChannelData`, before `buildVariantGroups`
- [ ] Update `BUILD_SALES_ATTRIBUTES` in `GenericPostProcessingEngine` — read `{dim}_value_id` / `{dim}_custom_value`
- [ ] Seed TikTok and Lazada color/size value mappings in `ChannelValueMappingDataLoader`

### Frontend

**No changes required.** The current Apply implementation already stores labels. The backend handles all channel-specific ID translation transparently.

### Priority

Medium. Shopify (primary channel) works correctly today. This is required only when onboarding TikTok Shop or Lazada with category-specific variant attributes that use taxonomy IDs (not all TikTok categories require `value_id` — categories that accept `custom_value = "Black"` work already).
