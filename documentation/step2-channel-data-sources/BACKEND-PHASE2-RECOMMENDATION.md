# Backend Recommendation — Phase 2: Master-to-Channel Value Mapping (Scenario B)

**Date:** 2026-03-07
**Author:** Frontend Team
**Status:** Frontend complete. Backend implementation required.
**Priority:** High — without this, SELECT fields that depend on channel taxonomy codes
              will always start empty, even when the master product already has the answer.

---

## Overview

When a seller fills the master product (Step 1), they use plain language values
(e.g. `material: "cotton"`, `color: "navy blue"`). Channel platforms require their own
taxonomy codes for the same concepts (e.g. Lazada `bahan: "LZ_MAT_001"`,
TikTok `colour_id: "COLOUR_0036"`).

Phase 2 adds a **value mapping layer** that:
1. Looks up a mapping table (`channel_field_value_mappings`) at schema-generation time.
2. Attaches a `masterMappedSuggestion` object to any SELECT/MULTISELECT field where a
   mapping is found.
3. Lets the frontend offer a one-click "Accept" banner so the seller does not have to
   manually search through thousands of taxonomy codes.

The frontend already renders these banners. The backend just needs to populate the
`masterMappedSuggestion` field in the schema response.

---

## Key distinction from `master_overrides`

| Feature | `master_overrides` | Value mapping (Phase 2) |
|---------|-------------------|------------------------|
| Use case | Same field, different raw value per channel | Master value is invalid/meaningless on channel |
| Example | Title shortened for TikTok's 100-char limit | `"cotton"` → `"LZ_MAT_001"` |
| Field type | Any | SELECT / MULTISELECT with channel taxonomy |
| Data source | Seller edits the field manually | Mapping table + fuzzy fallback |

---

## 1. New MongoDB Collection — `channel_field_value_mappings`

Create a new collection with the following document structure:

```json
{
  "_id":              "ObjectId",
  "channelType":     "lazada",
  "masterFieldName": "material",
  "channelFieldName":"bahan",
  "mappings": [
    { "masterValue": "cotton",          "channelValue": "LZ_MAT_001", "channelLabel": "Cotton" },
    { "masterValue": "polyester blend", "channelValue": "LZ_MAT_003", "channelLabel": "Polyester Blend" },
    { "masterValue": "linen",           "channelValue": "LZ_MAT_007", "channelLabel": "Linen" }
  ],
  "fallbackStrategy": "PROMPT_USER"
}
```

### Document fields

| Field | Type | Description |
|-------|------|-------------|
| `channelType` | String | e.g. `"lazada"`, `"tiktok"`, `"shopee"` |
| `masterFieldName` | String | The field name in the master product schema |
| `channelFieldName` | String | The field name in the channel's attribute schema |
| `mappings` | Array | Each entry maps one master value to one channel value |
| `mappings[].masterValue` | String | Canonical master value (lowercase, trimmed) |
| `mappings[].channelValue` | String | Channel taxonomy code |
| `mappings[].channelLabel` | String | Human-readable label shown in the "Accept" banner |
| `fallbackStrategy` | Enum | What to do when no mapping is found (see below) |

### `fallbackStrategy` values

| Value | Behaviour |
|-------|-----------|
| `PROMPT_USER` | Backend sets `confidence: "NONE"` — frontend shows a warning, seller must pick manually |
| `FREE_TEXT` | Backend copies the master value as-is into `suggestedValue` with `confidence: "FUZZY"` |
| `USE_CLOSEST` | Backend runs Levenshtein distance against all known `masterValue` strings; picks nearest with `confidence: "FUZZY"` |

### Seed data for Phase 2 MVP

Insert via `DataInitializer` bean (upsert by `channelType + masterFieldName + channelFieldName`):

#### Material / Fabric

| channelType | masterFieldName | channelFieldName | masterValue → channelValue |
|-------------|----------------|-----------------|---------------------------|
| `lazada` | `material` | `bahan` | cotton→LZ_MAT_001, polyester→LZ_MAT_003, linen→LZ_MAT_007, silk→LZ_MAT_005 |
| `amazon` | `material` | `fabric_type` | cotton→"100% Cotton", polyester→"Polyester", linen→"Linen" |
| `shopee` | `material` | `material` | cotton→"Cotton", polyester→"Polyester" |

#### Color

| channelType | masterFieldName | channelFieldName | masterValue → channelValue |
|-------------|----------------|-----------------|---------------------------|
| `tiktok` | `color` | `colour_id` | black→COLOUR_0001, white→COLOUR_0002, navy blue→COLOUR_0036, red→COLOUR_0010 |
| `shopee` | `color` | `colour` | black→1, white→2, red→3, navy blue→17, green→4 |
| `lazada` | `color` | `Color` | black→Black, white→White, red→Red, navy→Navy Blue |

#### Gender / Department

| channelType | masterFieldName | channelFieldName | masterValue → channelValue |
|-------------|----------------|-----------------|---------------------------|
| `amazon` | `gender` | `department` | mens→mens, womens→womens, unisex→["mens","womens"] |
| `lazada` | `gender` | `Gender` | male→Male, female→Female, unisex→Unisex |

---

## 2. New DTO — `MasterMappedSuggestion`

Add to the DTO layer (alongside `ChannelFormFieldDto`):

```java
package com.labamap.ecommerce.channel.schema.dto;

/**
 * Attached to a ChannelFormFieldDto when the backend can suggest a channel-specific
 * value derived from the master product's value for the same conceptual field.
 *
 * The frontend uses this to render an "Accept" banner above SELECT/MULTISELECT fields,
 * letting the seller confirm the mapping with one click.
 */
public record MasterMappedSuggestionDto(

    /** Master product field that was the source (e.g. "material") */
    String masterField,

    /** Raw master value (e.g. "cotton") */
    Object masterValue,

    /**
     * Channel-specific value to write when the seller accepts.
     * May be a String or a List<String> (for MULTISELECT fields like Amazon department).
     */
    Object suggestedValue,

    /** Human-readable label shown in the banner (e.g. "Cotton (LZ_MAT_001)") */
    String suggestedLabel,

    /** How confident the mapping is */
    Confidence confidence

) {
    public enum Confidence { EXACT, FUZZY, NONE }
}
```

### Schema field extension — `ChannelFormFieldDto`

Add one new nullable field to the existing DTO:

```java
public class ChannelFormFieldDto {
    // ... existing fields ...

    /**
     * Scenario B: populated when a master-to-channel value mapping exists.
     * Null for fields with no mapping (static options, free-text fields, etc.).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private MasterMappedSuggestionDto masterMappedSuggestion;

    /**
     * Extend existing optionsSource enum to include MASTER_MAPPED.
     * STATIC       — static options[] (current default, unchanged)
     * MERCHANT_API — Scenario A live options from merchant account
     * MASTER_MAPPED — Scenario B; a masterMappedSuggestion is attached
     */
    private String optionsSource; // "STATIC" | "MERCHANT_API" | "MASTER_MAPPED"
}
```

---

## 3. New Service Interface — `ChannelValueMappingService`

```java
package com.labamap.ecommerce.channel.mapping;

import com.labamap.ecommerce.channel.schema.dto.MasterMappedSuggestionDto;
import reactor.core.publisher.Mono;

public interface ChannelValueMappingService {

    /**
     * Resolves a master product field value to a channel-specific taxonomy value.
     *
     * @param channelType      e.g. "lazada", "tiktok"
     * @param masterFieldName  e.g. "material", "color"
     * @param masterValue      the raw master product value (String, Number, etc.)
     * @param channelFieldName e.g. "bahan", "colour_id"
     * @return a suggestion (confidence may be EXACT, FUZZY, or NONE); never empty
     */
    Mono<MasterMappedSuggestionDto> resolveSuggestion(
        String channelType,
        String masterFieldName,
        Object masterValue,
        String channelFieldName
    );
}
```

### Implementation — `ChannelValueMappingServiceImpl`

```java
@Service
@RequiredArgsConstructor
public class ChannelValueMappingServiceImpl implements ChannelValueMappingService {

    private final ChannelFieldValueMappingRepository mappingRepository;

    @Override
    public Mono<MasterMappedSuggestionDto> resolveSuggestion(
            String channelType, String masterFieldName,
            Object masterValue, String channelFieldName) {

        String normalizedMasterValue = normalize(masterValue);

        return mappingRepository
            .findByChannelTypeAndMasterFieldNameAndChannelFieldName(
                channelType, masterFieldName, channelFieldName)
            .flatMap(doc -> {
                // 1. Exact match
                Optional<MappingEntry> exact = doc.getMappings().stream()
                    .filter(m -> normalize(m.getMasterValue()).equals(normalizedMasterValue))
                    .findFirst();

                if (exact.isPresent()) {
                    MappingEntry e = exact.get();
                    return Mono.just(new MasterMappedSuggestionDto(
                        masterFieldName, masterValue,
                        e.getChannelValue(), e.getChannelLabel(),
                        MasterMappedSuggestionDto.Confidence.EXACT
                    ));
                }

                // 2. Fuzzy / fallback
                return switch (doc.getFallbackStrategy()) {
                    case USE_CLOSEST -> resolveClosest(doc, masterFieldName, masterValue, normalizedMasterValue);
                    case FREE_TEXT   -> Mono.just(new MasterMappedSuggestionDto(
                        masterFieldName, masterValue,
                        masterValue, String.valueOf(masterValue),
                        MasterMappedSuggestionDto.Confidence.FUZZY
                    ));
                    default -> Mono.just(new MasterMappedSuggestionDto(
                        masterFieldName, masterValue, null, null,
                        MasterMappedSuggestionDto.Confidence.NONE
                    ));
                };
            })
            // No mapping document at all → NONE
            .switchIfEmpty(Mono.just(new MasterMappedSuggestionDto(
                masterFieldName, masterValue, null, null,
                MasterMappedSuggestionDto.Confidence.NONE
            )));
    }

    private Mono<MasterMappedSuggestionDto> resolveClosest(
            ChannelFieldValueMappingDocument doc,
            String masterFieldName, Object masterValue, String normalizedInput) {

        return Mono.fromSupplier(() ->
            doc.getMappings().stream()
                .min(Comparator.comparingInt(m ->
                    levenshtein(normalize(m.getMasterValue()), normalizedInput)))
                .map(m -> new MasterMappedSuggestionDto(
                    masterFieldName, masterValue,
                    m.getChannelValue(), m.getChannelLabel(),
                    MasterMappedSuggestionDto.Confidence.FUZZY
                ))
                .orElse(new MasterMappedSuggestionDto(
                    masterFieldName, masterValue, null, null,
                    MasterMappedSuggestionDto.Confidence.NONE
                ))
        );
    }

    /** Lowercase + trim for consistent comparison */
    private String normalize(Object value) {
        return value == null ? "" : value.toString().toLowerCase(Locale.ROOT).strip();
    }

    /** Standard Levenshtein distance */
    private int levenshtein(String a, String b) {
        int[] dp = IntStream.range(0, b.length() + 1).toArray();
        for (int i = 1; i <= a.length(); i++) {
            int prev = dp[0];
            dp[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int temp = dp[j];
                dp[j] = (a.charAt(i - 1) == b.charAt(j - 1))
                    ? prev
                    : 1 + Math.min(prev, Math.min(dp[j], dp[j - 1]));
                prev = temp;
            }
        }
        return dp[b.length()];
    }
}
```

---

## 4. Repository

```java
@Repository
public interface ChannelFieldValueMappingRepository
        extends ReactiveMongoRepository<ChannelFieldValueMappingDocument, String> {

    Mono<ChannelFieldValueMappingDocument> findByChannelTypeAndMasterFieldNameAndChannelFieldName(
        String channelType, String masterFieldName, String channelFieldName);
}
```

---

## 5. Schema Generation Update — `ChannelStepSchemaService`

When building a `ChannelFormFieldDto`, call `ChannelValueMappingService` for any
SELECT or MULTISELECT field that has a corresponding master product value:

```java
// Pseudocode inside ChannelStepSchemaService.buildField(attribute, masterProduct, channelType, storeId)

ChannelFormFieldDto field = mapBaseFields(attribute, currentValue);

boolean isMapped =
    (attribute.getFieldType() == FieldType.SELECT ||
     attribute.getFieldType() == FieldType.MULTISELECT) &&
    attribute.getMasterFieldName() != null;          // FK to master schema field

if (isMapped) {
    Object masterValue = masterProduct.getField(attribute.getMasterFieldName());
    if (masterValue != null) {
        MasterMappedSuggestionDto suggestion = channelValueMappingService
            .resolveSuggestion(
                channelType,
                attribute.getMasterFieldName(),
                masterValue,
                attribute.getFieldName()
            )
            .timeout(Duration.ofSeconds(2))
            .onErrorResume(e -> {
                log.warn("Value mapping failed for {}/{}: {}", channelType, attribute.getFieldName(), e.getMessage());
                return Mono.empty();
            })
            .blockOptional()
            .orElse(null);

        if (suggestion != null) {
            field.setMasterMappedSuggestion(suggestion);
            field.setOptionsSource("MASTER_MAPPED");

            // If EXACT match and field currently has no value, pre-fill it
            if (suggestion.confidence() == Confidence.EXACT && field.getCurrentValue() == null) {
                field.setCurrentValue(suggestion.suggestedValue());
            }
        }
    }
}
```

### Important: `masterFieldName` link in `EcommerceMasterAttributeDocument`

The schema service needs to know which master field maps to which channel field.
Add a new nullable field to `EcommerceMasterAttributeDocument`:

```java
/**
 * The master product field that conceptually corresponds to this channel field.
 * Used by ChannelValueMappingService to look up a translation from the master value.
 * Null for channel-specific fields with no master equivalent (e.g. warehouse_id).
 *
 * Examples:
 *   channelFieldName = "bahan"   → masterFieldName = "material"
 *   channelFieldName = "colour_id" → masterFieldName = "color"
 */
private String masterFieldName;
```

**Seed data** (add to existing `DataInitializer` entries):

| channelType | channelFieldName | masterFieldName |
|-------------|-----------------|----------------|
| `lazada` | `bahan` | `material` |
| `lazada` | `Color` | `color` |
| `lazada` | `Gender` | `gender` |
| `tiktok` | `colour_id` | `color` |
| `amazon` | `fabric_type` | `material` |
| `amazon` | `department` | `gender` |
| `shopee` | `material` | `material` |
| `shopee` | `colour` | `color` |

---

## 6. JSON Contract — Frontend

The frontend reads the following exact fields from `ChannelFormField` in the schema response:

```json
{
  "fieldName": "bahan",
  "fieldType": "SELECT",
  "label": "Material (Bahan)",
  "required": true,
  "optionsSource": "MASTER_MAPPED",
  "options": [
    { "value": "LZ_MAT_001", "label": "Cotton" },
    { "value": "LZ_MAT_003", "label": "Polyester Blend" }
  ],
  "masterMappedSuggestion": {
    "masterField": "material",
    "masterValue": "cotton",
    "suggestedValue": "LZ_MAT_001",
    "suggestedLabel": "Cotton",
    "confidence": "EXACT"
  }
}
```

**Rules:**
- `optionsSource: "MASTER_MAPPED"` tells the frontend to render the suggestion banner UI.
- `options[]` must still be populated (same as `STATIC` or `MERCHANT_API`) — the banner is shown
  **in addition to** the normal SELECT dropdown, not instead of it.
- When `confidence: "EXACT"`, the frontend also **pre-fills** the field with `suggestedValue`
  immediately (as if the seller already accepted). Omit `masterMappedSuggestion` entirely
  if no mapping document exists for this field.
- When `confidence: "NONE"`, set `suggestedValue: null` and `suggestedLabel: null` in JSON.
  The frontend renders a warning badge instead of an Accept button.

### Frontend banner states (for reference)

```
confidence: "EXACT"
┌─────────────────────────────────────────────────────┐
│ EXACT MATCH  Based on master material "cotton"       │
│ → Cotton                          [Accept] [Pick different] │
└─────────────────────────────────────────────────────┘

confidence: "FUZZY"
┌─────────────────────────────────────────────────────┐
│ FUZZY MATCH  Based on master material "cotton blend" │
│              — verify before accepting               │
│ → Cotton Blend                    [Accept] [Pick different] │
└─────────────────────────────────────────────────────┘

confidence: "NONE"
┌─────────────────────────────────────────────────────┐
│ ⚠  No mapping found for master material "denim".     │
│    Please select the closest option manually.        │
└─────────────────────────────────────────────────────┘
```

---

## 7. Caching Recommendation

Mapping lookups are lightweight (MongoDB document read, no external API call),
but high-frequency during schema generation. Cache at the document level:

```java
@Cacheable(
    value = "channelValueMappings",
    key = "#channelType + ':' + #masterFieldName + ':' + #channelFieldName"
)
public Mono<ChannelFieldValueMappingDocument> findMappingDocument(
        String channelType, String masterFieldName, String channelFieldName) {
    return mappingRepository.findByChannelTypeAndMasterFieldNameAndChannelFieldName(
        channelType, masterFieldName, channelFieldName);
}
```

Suggested TTL: **10 minutes** (mappings change rarely; a short TTL allows ops to push
fixes without a redeploy).

---

## 8. Admin Endpoint for Mapping Management (Phase 2B — optional)

Expose CRUD for `channel_field_value_mappings` so the operations team can add or edit
mappings without a redeploy:

```
GET    /api/v1/admin/channel-mappings?channelType=lazada&masterFieldName=material
POST   /api/v1/admin/channel-mappings          — create document
PUT    /api/v1/admin/channel-mappings/{id}     — replace mappings[]
DELETE /api/v1/admin/channel-mappings/{id}
```

The frontend `/admin/channel-mappings` UI can be planned for Phase 2B.

---

## Implementation Order

1. **`channel_field_value_mappings` collection** — create document schema + repository
2. **Seed data** — insert material/color/gender mappings for Lazada, TikTok, Amazon via `DataInitializer`
3. **`MasterMappedSuggestionDto`** — add DTO + extend `ChannelFormFieldDto`
4. **`masterFieldName`** — add field to `EcommerceMasterAttributeDocument` + seed data
5. **`ChannelValueMappingServiceImpl`** — implement EXACT + NONE path (skip fuzzy initially)
6. **Schema generation** — call service in `ChannelStepSchemaService.buildField()`
7. **Integration test** — verify schema response includes `masterMappedSuggestion` for Lazada `bahan`
8. **Fuzzy `USE_CLOSEST`** — add Levenshtein fallback
9. **Cache** — add 10-minute TTL cache on mapping document lookup
10. **Admin endpoint** — (Phase 2B) CRUD for ops team

---

## Testing Checklist

- [ ] Schema response includes `masterMappedSuggestion` for Lazada `bahan` when master `material = "cotton"`
- [ ] `confidence: "EXACT"` — field is pre-filled with `suggestedValue` in `currentValue`
- [ ] `confidence: "FUZZY"` — suggestion shown, field NOT pre-filled
- [ ] `confidence: "NONE"` — `suggestedValue`/`suggestedLabel` are null; warning shown in frontend
- [ ] No mapping document → `masterMappedSuggestion` absent from JSON; field renders normally
- [ ] `optionsSource` still set to `"MASTER_MAPPED"` for mapped fields; `"STATIC"` for unmapped
- [ ] `options[]` still populated (mapping banner appears alongside the dropdown)
- [ ] TikTok `colour_id` suggestion from master `color = "navy blue"` → `COLOUR_0036`
- [ ] Amazon `department` suggestion from master `gender = "unisex"` → `["mens","womens"]` (multiselect)
- [ ] Levenshtein fuzzy: `"100% cotton"` → closest match `"cotton"` → `LZ_MAT_001` with `FUZZY`
- [ ] Mapping lookup timeout (> 2 s) → schema generation continues without suggestion (no error thrown)
- [ ] Cache hit: second schema load within 10 min does not hit MongoDB again
- [ ] Static/MERCHANT_API fields are fully unaffected (no regression)

---

## What the Frontend Already Does (no further frontend changes needed for Phase 2)

| Backend sends | Frontend behaviour |
|--------------|-------------------|
| `confidence: "EXACT"` | Blue banner: "Exact match — Based on master material 'cotton'" + [Accept] [Pick different]. Pre-fills field value. |
| `confidence: "FUZZY"` | Amber banner: "Fuzzy match — verify before accepting" + [Accept] [Pick different]. Does NOT pre-fill. |
| `confidence: "NONE"` | Amber warning: "No mapping found for 'denim'. Please select manually." No buttons. |
| `masterMappedSuggestion` absent | No banner. Field renders as normal SELECT/MULTISELECT. |
| Accept clicked | `onChange(fieldName, suggestedValue)` fired immediately; banner dismissed. |
| Pick different / dismissed | Banner hidden; seller picks from dropdown normally. |
