# Step 2 — Channel-Specific Data Sources Planning

## Problem Statement

The current Step 2 implementation treats every field's `options[]` as static data baked
into the schema response, and `masterValue` as a raw mirror of what the master product
stores. This works for simple text or number fields, but breaks down for eleven distinct
real-world scenarios that require different data-sourcing strategies:

| Scenario | Short name | Root cause |
|----------|-----------|------------|
| A | Merchant-sourced options | Options come from merchant's live account, not static config |
| B | Master-to-channel value mapping | Master value is valid internally but invalid/incomplete on channel |
| C | Hierarchical category tree | Category selection is multi-level; leaf node unlocks further fields |
| D | Category-dependent field injection | Selecting a category causes new required fields to appear |
| E | Cross-field conditional dependencies | A channel field's visibility or rules depend on another channel field |
| F | Multi-language content requirements | Channel/region requires content in multiple locales simultaneously |
| G | Channel pricing and currency conversion | Channel requires a different currency with platform rounding rules |
| H | Channel-specific media compliance | Channel image/video specs may reject the master product's media |
| I | Cross-store value inheritance | Org has sibling stores; copy values intelligently between tabs |
| J | Channel-specific SEO and keyword structure | Platform search fields have unique structure incompatible with master tags |
| K | Computed/derived fields from multiple master sources | Channel field must be assembled from several master fields, not just mapped 1-to-1 |

---

## Scenario A — Merchant-Sourced Options

### What it is

A `SELECT` or `MULTISELECT` field whose valid options are fetched in real time from the
merchant's connected account via the channel's API.

### Real examples by channel

| Channel     | Field                                | Merchant data source.                     |
|-------------|--------------------------------------|-------------------------------------------|
| Shopify     | `location_id` (fulfillment location) | `GET /admin/api/locations.json`           |
| Shopify.    | `collection_id`                      | `GET /admin/api/custom_collections.json`  |
| Shopify.    | `shipping_zone`                      | `GET /admin/api/shipping_zones.json`      |
| Amazon.     | `fulfillment_channel`                | SP-API `GetServiceStatus`                 |
| Amazon      | `merchant_shipping_group`            | SP-API `listInputFieldValues`             |
| TikTok Shop | `warehouse_id`                       | TikTok Partner API `GetWarehouses`        |
| TikTok Shop | `shipping_template_id`               | TikTok Partner API `GetShippingTemplates` |
| Lazada      | `warehouse_code`                     | Lazada Open Platform `GetWarehouseDetail` |
| eBay        | `fulfillment_policy_id`              | eBay Fulfillment Policy API               |
| Shopee      | `logistics_channel_id`               | Shopee `getLogistics`                     |

### Why the current approach fails

`ChannelStepSchemaService.java` builds field `options[]` from
`EcommerceMasterAttributeDocument.allowedValues` — a static list set at configuration
time. Warehouse IDs are dynamic: they change when the merchant adds or removes locations.
Hard-coding them results in stale or wrong options within hours.

### Solution

**Hybrid eager/lazy embed**

- **Eager embed** (small stable lists, < 50 items): during schema generation, the backend
  calls the channel's live API via `ChannelMerchantDataService` and embeds the result
  directly in `ChannelFormField.options[]`. The frontend requires no changes.

- **Lazy load** (large dynamic lists such as category trees): the schema marks the field
  with `optionsSource: "MERCHANT_API"` and an `optionsEndpoint` path. The frontend fetches
  options when the field section expands or the select is focused. A loading skeleton is
  shown during the request.

**New backend service**

```java
public interface ChannelMerchantDataService {
    String getChannelType();
    Mono<List<FieldOption>> fetchOptions(String storeId, String fieldName, String organizationId);
}
// Implementations: ShopifyMerchantDataService, TikTokMerchantDataService, etc.
// Registered as Map<String, ChannelMerchantDataService> bean keyed by channelType.
```

**New backend endpoint (lazy-load path only)**

```
GET /api/v1/merchant-data/{channelType}/{storeId}/field-options
    ?fieldName=...&organizationId=...
Response: { "fieldName": "location_id", "options": [{ "value": "...", "label": "..." }] }
```

**New section in `SectionName`**

```typescript
type SectionName = ... | "merchant_data";
// Groups all MERCHANT_API fields together so the seller understands they are
// account-specific, not product-specific.
```

**Frontend: loading state in `ChannelFieldInput`**

```
[Shopify] Fulfillment Location
  Loading options from Shopify Store A...  [skeleton]
  → resolves to live warehouse list
```

---

## Scenario B — Master-to-Channel Value Mapping

### What it is

The master product carries a canonical field value. A channel requires its own taxonomy
code for the equivalent concept. The system must suggest — or auto-populate — the correct
channel-specific code based on the master value.

### Real examples

| Master field | Master value        | Channel | Channel field         | Expected channel value           |
|--------------|---------------------|---------|-----------------------|----------------------------------|
| `material`   | `"cotton"`          | Lazada  | `bahan`               | `"LZ_MAT_001"` (Cotton)          |
| `material`   | `"polyester blend"` | Lazada  | `bahan`               | `"LZ_MAT_003"` (Polyester Blend) |
| `material`   | `"cotton"`          | Amazon  | `fabric_type`         | `"100% Cotton"`                  |
| `color`      | `"navy blue"`       | TikTok  | `colour_id`           | `"COLOUR_0036"`                  |
| `color`      | `"navy blue"`       | Shopee  | `colour`              | `"17"` (Shopee color ID)         |
| `gender`     | `"unisex"`          | Amazon  | `department`          | `["mens", "womens"]` (multi)     |
| `category`   | `"T-Shirt"`         | Lazada  | `primary_category_id` | `"10001234"`                     |

### Why this is different from `master_overrides`

`master_overrides` lets the seller override a master field's raw value for a specific
channel — useful when the value is valid but needs adjusting (e.g. a longer product name
for Amazon). Value mapping is a different problem: the master value is **meaningless or
invalid** on the target channel. `material: "cotton"` is not a valid Lazada `bahan` code;
the seller must pick from Lazada's own taxonomy. The system translates automatically where
a mapping exists and prompts the seller to resolve it where one does not.

### Solution

**New data collection: `channel_field_value_mappings`**

```json
{
  "channelType":     "lazada",
  "masterFieldName": "material",
  "channelFieldName":"bahan",
  "mappings": [
    { "masterValue": "cotton",          "channelValue": "LZ_MAT_001", "channelLabel": "Cotton" },
    { "masterValue": "polyester blend", "channelValue": "LZ_MAT_003", "channelLabel": "Polyester Blend" }
  ],
  "fallbackStrategy": "PROMPT_USER"
}
```

`fallbackStrategy` values: `PROMPT_USER` | `FREE_TEXT` | `USE_CLOSEST`

**Schema field extension**

```typescript
interface ChannelFormField {
  masterMappedSuggestion?: {
    masterField:    string;
    masterValue:    unknown;
    suggestedValue: unknown;
    suggestedLabel: string;
    confidence: "EXACT" | "FUZZY" | "NONE";
  };
  optionsSource?: "STATIC" | "MERCHANT_API" | "MASTER_MAPPED";
}
```

**Frontend: accept-suggestion banner**

```
[Lazada] Bahan (Material)
  [EXACT match] Based on your master material "cotton":
  [ Cotton (LZ_MAT_001) ]  [Accept]  [Pick different]

[FUZZY match] "cotton blend" → closest: "Cotton Blend (LZ_MAT_003)"  — verify before accepting.

[No match] No mapping found for "denim". Please select the closest option.  [warning badge]
```

**New backend service**

```java
public interface ChannelValueMappingService {
    Mono<MasterMappedSuggestion> resolveSuggestion(
        String channelType, String masterFieldName,
        Object masterValue, String channelFieldName
    );
}
// Reads channel_field_value_mappings; applies Levenshtein for fuzzy fallback.
```

**Mapping table population strategy**

| Approach | Effort | When to use |
|----------|--------|-------------|
| Static YAML seed data via `DataInitializer` bean | Low | MVP — materials, colors, gender |
| Admin UI at `/admin/channel-mappings` | Medium | Ongoing operations |
| LLM-assisted suggestion (human review before activation) | High | Covering long-tail values |

---

## Scenario C — Hierarchical Category Tree Selection

### What it is

Channel category systems are deep trees with 3–6 levels and potentially thousands of leaf
nodes. To set a product's channel category, the seller must navigate level-by-level
(e.g. Electronics → Mobile Phones → Smartphones → Android Phones). The final leaf node
ID is what gets stored and submitted to the channel.

### Real examples

| Channel | Depth | Total nodes | API to fetch children |
|---------|-------|-------------|----------------------|
| Lazada | 4–5 levels | ~50 000 nodes | `GetCategoryTree` / `GetCategoriesByLevel` |
| Shopee | 3–4 levels | ~20 000 nodes | `getCategory` |
| TikTok Shop | 3–4 levels | ~30 000 nodes | `GetCategories` |
| Amazon | 4–6 levels | varies by marketplace | Browse Tree Guides |

### Why it cannot be handled by Scenarios A or B

Scenario A works for small flat lists. A category tree cannot be embedded in the schema
response without making it prohibitively large, and category selection is **stateful** —
the user picks level 1, which loads level 2 options, and so on.

Scenario B's mapping table works for well-known high-confidence mappings but not for
ambiguous categories or new product types.

### Solution

**Dedicated `fieldType: "CATEGORY_TREE"`**

```typescript
interface ChannelFormField {
  categoryTreeConfig?: {
    rootEndpoint:    string;  // e.g. "/merchant-data/lazada/{storeId}/categories"
    childEndpoint:   string;  // e.g. "...?parentId={parentId}"
    maxDepth:        number;
    requireLeafNode: boolean;
  };
}
```

**New backend endpoint: category children**

```
GET /api/v1/merchant-data/{channelType}/{storeId}/categories?parentId=...&organizationId=...
Response: [{ "id": "...", "name": "...", "hasChildren": true }]
```

Root-level call omits `parentId`.

**Frontend: `CategoryTreePicker` component**

```
[Lazada] Category
  Electronics > Mobile Phones > Smartphones > Android Phones  [Change]
  [Accept suggested: "Android Phones (10001234)"]  ← when B-style EXACT match exists
```

- Each level lazy-loads on selection; shows breadcrumb of selected path
- If a `masterMappedSuggestion.confidence = "EXACT"` exists, pre-navigates and shows
  "Accept suggested category" shortcut

**Backend: category sync job**

A scheduled `CategorySyncJob` caches the full tree in `channel_category_cache` (MongoDB,
TTL 24 hours) for channels with large stable taxonomy. Live API is fallback.

---

## Scenario D — Category-Dependent Dynamic Field Injection

### What it is

After the seller selects a category (Scenario C), the channel's API returns a **new set
of required and optional fields** specific to that category leaf node. These fields do not
exist in the original Step 2 schema and must be injected into the form dynamically.

### Real examples

| Channel | Category selected | Injected fields |
|---------|------------------|----------------|
| Lazada | Smartphones | RAM, storage, screen_size_inches, OS, connectivity |
| Lazada | Men's T-Shirts | sleeve_type, fit_type, neck_style, occasion |
| Amazon | Electronics | batteries_required, battery_type, included_components |
| TikTok Shop | Beauty | skin_type, product_function, applicable_part |
| Shopee | Laptops | processor_brand, processor_model, ram_capacity, ssd_capacity |

### Why the current static schema cannot handle this

Category-specific fields are not stored in `EcommerceMasterAttributeDocument` — they are
returned dynamically by each channel's "get category attributes" API, differ per
category and channel, and may themselves combine Scenario A options, Scenario B mappings,
or Scenario E conditional rules.

### Solution

**New backend endpoint: category attributes**

```
GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes
    ?categoryId={leafId}&organizationId=...
Response: {
  "categoryId": "10001234",
  "categoryName": "Smartphones",
  "requiredAttributes": [ { "fieldName": "ram", "fieldType": "SELECT", "options": [...] } ],
  "optionalAttributes": [ ... ]
}
```

**Schema response extension: `categoryAttributeSection`**

```typescript
interface ChannelSchemaPerStore {
  categoryAttributeSection?: {
    categoryId:   string;
    categoryName: string;
    categoryPath: string[];
    fields:       ChannelFormField[];
  };
}
```

When a `CATEGORY_TREE` field has a stored value (category already chosen), schema
generation pre-fetches the category attributes and includes them in this section so the
form is pre-populated on load.

**Frontend dynamic injection**

When the user picks a leaf in `CategoryTreePicker`:
1. Call the category-attributes endpoint
2. Inject fields into `storeValues[storeId].channelData` form state
3. Render a new collapsible section "Category-specific fields — {categoryName}"
4. Clear old category field values from state when the category changes

`isLocallyComplete()` must include injected required fields.
The `saveChannelData` payload must include `categoryId` so the backend validates
completeness against the right attribute set.

---

## Scenario E — Cross-Field Conditional Dependencies

### What it is

A channel field's visibility, required-ness, or validation rules depend on the current
value of another field **within the same channel form**. Separate from the master product
form's `conditionalLogic` handled by `useFieldVisibility.ts`.

### Real examples

| Channel | Trigger field | Trigger value | Affected field | Effect |
|---------|--------------|---------------|----------------|--------|
| Amazon | `is_adult_product` | `true` | `adult_product_category` | becomes required |
| Shopify | `requires_shipping` | `false` | `weight`, `shipping_class` | hidden |
| TikTok | `is_pre_order` | `true` | `pre_order_days` | required, range 1–14 |
| TikTok | `is_pre_order` | `false` | `pre_order_days` | hidden |
| Lazada | `package_weight_unit` | `"kg"` vs `"g"` | `package_weight` validation | min/max ×1000 |
| eBay | `listing_type` | `"AUCTION"` | `starting_price`, `reserve_price` | visible + required |
| eBay | `listing_type` | `"FIXED_PRICE"` | `starting_price`, `reserve_price` | hidden |

### Solution

**Schema extension: `conditionalRules` on `ChannelFormField`**

```typescript
interface ChannelFieldConditionalRule {
  triggerField:   string;
  triggerValues:  unknown[];
  effect: "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" | "SET_VALIDATION";
  validationOverride?: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string };
}
```

**Frontend: `useChannelFieldVisibility` hook**

```typescript
function useChannelFieldVisibility(
  fields: ChannelFormField[],
  currentValues: Record<string, unknown>
): {
  isVisible:     (fieldName: string) => boolean;
  isRequired:    (fieldName: string) => boolean;
  getValidation: (fieldName: string) => ChannelFormField["validationRules"];
}
```

`ChannelStoreTab` calls the hook and passes results to each `ChannelFieldInput`.
`isLocallyComplete()` calls `isRequired()` instead of reading the static `field.required`.
Backend `saveChannelData` must also evaluate `conditionalRules` when computing
`completionPercentage`.

---

## Scenario F — Multi-Language / Localized Content

### What it is

Some channel–region combinations require product content in multiple languages
simultaneously. A single `TEXT` or `TEXTAREA` field is insufficient — the value must be
a map of locale codes to translated strings, and all required locales must be filled
before publishing.

### Real examples

| Channel | Store region | Required locales | Fields affected |
|---------|-------------|-----------------|-----------------|
| Lazada | Malaysia | `en`, `ms` | name, description, bullet_points |
| Lazada | Thailand | `en`, `th` | name, description |
| Amazon | Japan | `en`, `ja` | title, bullet_points, product_description |
| TikTok Shop | SEA (multi-region) | `en` + region locale | title, description |

### Solution

**New `fieldType: "LOCALIZED_TEXT"` / `"LOCALIZED_TEXTAREA"`**

```typescript
interface ChannelFormField {
  localeConfig?: {
    requiredLocales:     string[];  // e.g. ["en", "ms"]
    optionalLocales?:    string[];
    maxLengthPerLocale?: number;
  };
}
// Value shape in channelData:
// channelData["name"] = { "en": "Blue Cotton T-Shirt", "ms": "T-Shirt Kapas Biru" }
```

**Frontend: `LocalizedTextInput` component**

```
[Lazada MY] Product Name
  English (required)       [Blue Cotton T-Shirt         ]
  Bahasa Malaysia *        [T-Shirt Kapas Biru           ]
  [Translate with AI]  ← auto-fills empty locales; flagged ai_generated=true in save payload
```

`isLocallyComplete()` must verify all `requiredLocales` are non-empty.

---

## Scenario G — Channel Pricing and Currency Conversion

### What it is

The master product stores a price in the organization's base currency. A channel store
may be configured for a different currency. The channel price field must auto-convert,
apply channel-specific rounding rules, respect platform price constraints, and allow the
seller to override.

### Real examples

| Master | Base | Channel | Target | Rounding | Suggestion |
|--------|------|---------|--------|----------|------------|
| 29.99 | SGD | Tokopedia | IDR | nearest 1000 | IDR 339,000 |
| 29.99 | SGD | Shopee MY | MYR | nearest 0.50 | MYR 99.50 |
| 29.99 | SGD | Lazada TH | THB | nearest 10 | THB 790 |

Distinct from `master_overrides` which copies the raw number without currency awareness.

### Solution

**New `fieldType: "CURRENCY_PRICE"`**

```typescript
interface ChannelFormField {
  currencyConfig?: {
    targetCurrency:    string;
    sourceCurrency:    string;
    roundingRule:      "NEAREST_1" | "NEAREST_10" | "NEAREST_100" | "NEAREST_1000"
                     | "NEAREST_0_5" | "NEAREST_0_01";
    channelMinPrice?:  number;
    channelMaxPrice?:  number;
  };
  priceSuggestion?: {
    sourceValue:    number;
    sourceCurrency: string;
    suggestedValue: number;
    targetCurrency: string;
    exchangeRate:   number;
    rateTimestamp:  string;  // ISO 8601
  };
}
```

**Frontend: `CurrencyPriceInput` component**

```
[Tokopedia] Listing Price (IDR)
  [Auto-converted from SGD 29.99 at rate 11,324.5 on 2026-03-05]
  [ IDR  339,000    ]  [Use suggestion]  [Enter manually]
  Min: IDR 100 — Max: IDR 100,000,000
```

**Backend: `ExchangeRateService`**

```java
public interface ExchangeRateService {
    Mono<ExchangeRate> getRate(String fromCurrency, String toCurrency);
    // External provider (Open Exchange Rates, ECB); Redis TTL = 1 hour
}
```

Schema generation calls this service and embeds `priceSuggestion` — seller sees the
conversion immediately without extra API calls. Same pattern applied to variant-level
price columns in `VariantOverridesTable`.

---

## Scenario H — Channel-Specific Media Compliance

### What it is

Each channel has strict technical requirements for product images and videos. The master
product's media assets may not satisfy them, causing silent publish failures or active
rejections. The channel form needs to flag which master images pass, which fail, and allow
uploading channel-specific replacement media where needed.

### Real examples

| Channel | Requirement | Common failure |
|---------|------------|----------------|
| Amazon | White/pure background, min 1000×1000px, JPEG, no watermark, no overlay text | Lifestyle images, dark backgrounds |
| Amazon | Main image must be on white; secondary images can be lifestyle | Wrong first image |
| TikTok Shop | 9:16 or 1:1 ratio; product video required for some categories | Wrong aspect ratio; missing video |
| Shopee | No watermarks; max 2 MB per image; 1:1 preferred | Watermarked agency images |
| Lazada | Min 500×500px; up to 8 images; white background recommended for first image | Undersized images |
| eBay | Min 500px on longest side; max 12 images | Reused thumbnail images |

### Why the current media handling fails

`MasterProductSnapshot.mainImage` is a URL passed through to the publish pipeline with
no compliance checking. If Amazon rejects an image with a background, the seller only
finds out after a failed publish — there is no pre-publish warning in Step 2.

### Solution

**New `fieldType: "CHANNEL_MEDIA"`**

```typescript
interface ChannelFormField {
  // When fieldType = "CHANNEL_MEDIA":
  mediaConfig?: {
    mediaType:        "IMAGE" | "VIDEO" | "IMAGE_OR_VIDEO";
    minWidth?:        number;
    minHeight?:       number;
    aspectRatios?:    string[];   // e.g. ["1:1", "9:16"]
    allowedFormats:   string[];   // e.g. ["JPEG", "PNG"]
    maxFileSizeBytes?: number;
    maxCount?:        number;
    minCount?:        number;
    backgroundRule?:  "WHITE_ONLY" | "ANY";
    noWatermark?:     boolean;
    noTextOverlay?:   boolean;
    videoRequired?:   boolean;
    videoMaxDurationSeconds?: number;
  };
}
```

**New backend service: `MediaComplianceService`**

```java
public interface MediaComplianceService {
    Mono<MediaComplianceResult> check(String imageUrl, MediaConfig config);
    // Checks: dimensions, format, file size.
    // Background and watermark detection: calls lightweight vision service
    //   (e.g. Google Vision API color analysis, or a local rule-based check).
}

// Result shape:
record MediaComplianceResult(
    boolean passes,
    List<String> failures,    // e.g. ["TOO_SMALL", "WRONG_FORMAT", "HAS_WATERMARK"]
    int width, int height,
    String format
) {}
```

**Schema generation**

For each `CHANNEL_MEDIA` field, the backend checks the master product's existing images
against the channel's `mediaConfig` and embeds a compliance summary per image:

```typescript
interface ChannelFormField {
  masterMediaAssets?: Array<{
    url:        string;
    width:      number;
    height:     number;
    format:     string;
    compliance: "PASS" | "FAIL" | "WARNING";
    issues?:    string[];  // e.g. ["TOO_SMALL", "HAS_WATERMARK"]
  }>;
}
```

**Frontend: `ChannelMediaField` component**

```
[Amazon] Product Images (min 1000×1000 | white background | JPEG only)

  Master images:
  [img1] PASS   [img2] FAIL: background not white  [img3] WARNING: 800×800, too small
         [Use] ✓              [Replace]                     [Use anyway] [Replace]

  Channel-specific uploads:
  [+ Upload replacement for Amazon only]

  Video:
  [ Upload product video (required for this category) ]
```

- "Use" marks the image for this channel (stored in `channelData.images[]`)
- "Replace" opens an upload dialog — the replacement is stored separately from the master
  image and only used for this channel
- The compliance check runs at schema-gen time; a "Re-check" button re-runs it via a
  new endpoint

**New endpoint: media compliance re-check**

```
POST /api/v1/media/compliance-check
Body: { channelType, imageUrls: string[], mediaConfig }
Response: { results: [{ url, compliance, issues, width, height, format }] }
```

**New `SectionName` value**

```typescript
type SectionName = ... | "channel_media";
```

---

## Scenario I — Cross-Store Value Inheritance

### What it is

An organization with multiple stores of the same or similar channel type (e.g.
`shopify-us` + `shopify-eu`, or `shopee-my` + `shopee-th`) typically fills one store
completely, then wants to copy most values to the sibling store and adjust only a small
number of fields (price, language, warehouse). Without a copy mechanism, the seller must
re-enter every field manually for each store.

### Why naive copy breaks

A plain "copy all" from one store tab to another would paste:
- **Wrong warehouse IDs** (Scenario A) — `shopify-us`'s US location ID is meaningless in
  `shopify-eu`
- **Wrong currency** (Scenario G) — USD price pasted into an EUR store is semantically
  wrong
- **Wrong locale content** (Scenario F) — English-only content pasted into a Thai locale
  store leaves required locales empty
- **Wrong category** (Scenario C) — Category IDs are marketplace-specific and may differ
  between regions even for the same channel type

### Solution

**Frontend: "Copy from store" dropdown on each tab**

```
[Shopify EU tab]
  [Copy values from: Shopify US Store ▾]  [Copy selected fields ▾]
  ┌──────────────────────────────────────────────────────────────────┐
  │ Select fields to copy:                                           │
  │  ✓ vendor          ✓ product_type     ✓ tags                    │
  │  ✗ location_id     (MERCHANT_API — skipped, account-specific)   │
  │  ✗ listing_price   (CURRENCY_PRICE — skipped, different currency)│
  │  ✗ name_en/ms      (LOCALIZED_TEXT — target locale differs)     │
  │  ✓ published_scope ✓ requires_shipping                          │
  └──────────────────────────────────────────────────────────────────┘
  [Apply copy]
```

**Skip rules for copy**

| Field property | Copy behaviour |
|----------------|----------------|
| `optionsSource = "MERCHANT_API"` | Always skip — IDs are account-specific |
| `fieldType = "CURRENCY_PRICE"` | Skip by default; offer "copy and convert" if exchange rate known |
| `fieldType = "LOCALIZED_TEXT"` | Skip if target store has different `requiredLocales`; copy shared locales only |
| `fieldType = "CATEGORY_TREE"` | Skip if different channel type; copy if same channel type + same region |
| `fieldType = "CHANNEL_MEDIA"` | Copy if same channel type (same specs); skip otherwise |
| All other fields | Copy with user confirmation if value differs from target's existing value |

**Backend endpoint (optional — pure frontend copy is also viable)**

```
GET /api/v1/ecommerce/channel-product-data/{masterProductId}/{sourceStoreId}
```

This endpoint already exists (for cross-store inheritance). The frontend reads it,
applies the skip rules above, and writes into the target store's form state. The copy
never writes to the backend directly — the user still triggers the normal autosave.

**Schema field extension**

```typescript
interface ChannelFormField {
  copyable?: boolean;  // false for MERCHANT_API, optionally false for others
  // Schema generation sets this based on optionsSource and fieldType.
}
```

**"Inherited from {store}" indicator**

After a copy, each copied field shows a subtle "Copied from Shopify US" badge until the
user edits it. This is purely client-side state — it clears on the next save.

---

## Scenario J — Channel-Specific SEO and Keyword Structure

### What it is

Every channel has its own search algorithm and requires differently structured keyword
or search metadata. These fields are structurally incompatible with the master product's
`tags[]` or `seoKeywords[]` and cannot be auto-populated from them without transformation.

### Real examples

| Channel | Field | Structure | Constraints |
|---------|-------|-----------|-------------|
| Amazon | `search_terms` | 5 separate string lines | Each max 100 chars; no word from the title; no competitor names |
| Amazon | `subject_keywords` | Comma-separated string | Max 255 chars total |
| Amazon | `other_item_attributes` | Free-form attribute pairs | Used for A9 index enrichment |
| Shopee | `#hashtags` | Array of strings prefixed with `#` | Max 20 hashtags; each max 24 chars |
| TikTok Shop | `product_hashtags` | Array of hashtag strings | Affects TikTok Discover ranking |
| Lazada | `keywords` | Comma-separated string | Separate field from description |
| eBay | `item_specifics` | Key-value pairs specific to category | Drives eBay catalog match |

### Why this cannot use existing field types

Amazon's `search_terms` is not a `MULTISELECT` — it is exactly 5 independent lines of
text, each with its own character limit and a rule that prohibits repeating words already
in the product title. No single existing `ChannelFieldType` can express this.

Shopee's `#hashtags` must be formatted with a `#` prefix and stored as an array. The
master product's `tags` array stores plain strings without the prefix — direct copying
would produce invalid data.

### Solution

**New `fieldType: "KEYWORD_LIST"` and `"SEARCH_TERM_LINES"`**

```typescript
type ChannelFieldType = ... | "KEYWORD_LIST" | "SEARCH_TERM_LINES";

interface ChannelFormField {
  keywordConfig?: {
    fieldType:       "KEYWORD_LIST" | "SEARCH_TERM_LINES";
    maxItems?:       number;     // e.g. 20 for Shopee hashtags
    maxLengthEach?:  number;     // e.g. 24 chars per hashtag
    prefix?:         string;     // e.g. "#" for hashtags
    lineCount?:      number;     // e.g. 5 for Amazon search_terms
    maxLengthPerLine?: number;   // e.g. 100 for Amazon search_terms
    forbiddenWords?: "FROM_TITLE" | "FROM_BRAND" | "COMPETITOR_NAMES";
  };
  // Suggestion derived from master SEO tags (Scenario B-style):
  keywordSuggestions?: Array<{
    value:      string;
    source:     "MASTER_TAGS" | "MASTER_SEO_KEYWORDS" | "MASTER_DESCRIPTION";
    applicable: boolean;  // false if it would violate a constraint (e.g. word in title)
  }>;
}
```

**Frontend: `KeywordListInput` and `SearchTermLinesInput` components**

```
[Amazon] Search Terms (5 lines × max 100 chars each)

  Line 1: [ cotton t-shirt men comfortable                    ] 40/100
  Line 2: [ crew neck summer top breathable                   ] 32/100
  Line 3: [                                                   ]  0/100 ← empty
  Line 4: [                                                   ]  0/100
  Line 5: [                                                   ]  0/100

  Suggestions from master tags:  [cotton] [t-shirt] [men's fashion]
  Warnings:
  ⚠ "Blue" already in your title — avoid repeating it here.
```

```
[Shopee] Hashtags (max 20 | max 24 chars each)

  [#cotton] [#tshirt] [#mensfashion] [#casualwear] [+ Add]
  Suggestions:  [#cotton] [#tshirt] ← from master tags, formatted with #
```

**Backend: keyword suggestion service**

At schema generation, the backend derives keyword suggestions from the master product's
`tags`, `seoKeywords`, and a text extraction from `description`. It applies constraint
rules (e.g. flag any suggestion that is already a word in `name`) and sets `applicable`
accordingly.

---

## Scenario K — Computed/Derived Fields from Multiple Master Sources

### What it is

A channel field's value must be **assembled from multiple master product fields** using
a transformation rule. This is distinct from Scenario B (which maps one master field's
vocabulary to a channel equivalent) and from `master_overrides` (which copies one field
as-is). The source is multiple fields and the derivation involves concatenation, slicing,
formatting, or arithmetic.

### Real examples

| Channel | Channel field | Derivation | Source fields |
|---------|--------------|------------|---------------|
| Amazon | `bullet_point_1` .. `bullet_point_5` | Split master `description` into 5 max-255-char paragraphs | `description` |
| Amazon | `item_package_weight` | `weight` + estimated packaging weight offset (configurable) | `weight` |
| Shopify | `product_type` | Concatenate `category.name` + `subcategory.name` with `/` | `category`, `subcategory` |
| TikTok | `title` | Truncate `name` to 255 chars; append `brand` if total < 200 chars | `name`, `brand` |
| Lazada | `short_description` | Extract first 2 sentences from `description` | `description` |
| eBay | `title` | `name` (60 chars max) + key variant option (e.g. "Blue, Size M") | `name`, `defaultVariant` |
| Shopee | `package_dimensions` | Format `dimensions` as `{length}x{width}x{height} cm` string | `dimensions` |

### Why this is different from Scenario B

Scenario B maps a single field's **vocabulary** (e.g. `color: "navy blue"` → ID
`"COLOUR_0036"`). The source and target are both single-valued; only the code changes.

Scenario K **assembles content** from multiple fields or transforms a field's structure:
splitting text blocks, concatenating strings from different fields, applying numeric
offsets. The derivation rule is a small pipeline of operations, not a lookup table.

### Solution

**New schema field: `derivationRule`**

```typescript
interface ChannelFormField {
  derivationRule?: {
    operation:    "TRUNCATE" | "SPLIT_PARAGRAPHS" | "CONCAT" | "FORMAT_TEMPLATE"
                | "ARITHMETIC_OFFSET" | "EXTRACT_SENTENCES";
    sourceFields: string[];          // master field names to read from
    params:       Record<string, unknown>;  // operation-specific parameters
    // e.g. for TRUNCATE:          { maxLength: 255 }
    // e.g. for SPLIT_PARAGRAPHS:  { lineIndex: 0, maxLength: 255 }
    // e.g. for CONCAT:            { separator: "/", fields: ["category","subcategory"] }
    // e.g. for FORMAT_TEMPLATE:   { template: "{length}x{width}x{height} cm" }
    // e.g. for ARITHMETIC_OFFSET: { field: "weight", offsetGrams: 200 }
    // e.g. for EXTRACT_SENTENCES: { count: 2 }
  };
  derivedSuggestion?: unknown;  // backend computes this at schema-gen time
}
```

**Backend: `FieldDerivationService`**

```java
public interface FieldDerivationService {
    Mono<Object> derive(String channelType, String fieldName,
                        DerivationRule rule, Map<String, Object> masterProductData);
}
```

At schema generation, the backend reads `EcommerceMasterAttributeDocument.derivationRule`,
executes the operation against the master product's data, and sets `derivedSuggestion`
in the field. The seller sees the computed result and can accept or override it.

**Frontend: derived-suggestion banner**

```
[Amazon] Bullet Point 1
  [Derived from description]
  "Premium quality cotton blend fabric that keeps you comfortable all day..."
  [Accept]  [Edit]

[Amazon] Bullet Point 2
  "Machine washable at 30°C. Available in 12 colours and 5 sizes."
  [Accept]  [Edit]
```

When the seller edits a derived field, the banner changes to "Custom (derived suggestion
available)" with a "Restore derived" link.

**`EcommerceMasterAttributeDocument` extension**

```java
// --- Scenario K ---
private DerivationRule derivationRule;  // JSON-serialized DerivationRule object
```

---

## Combined Schema Field Extension Summary

All new fields added to `ChannelFormField` across all scenarios:

```typescript
interface ChannelFormField {
  // --- EXISTING ---
  fieldName:       string;
  fieldType:       ChannelFieldType;
  label:           string;
  required:        boolean;
  helpText?:       string;
  placeholder?:    string;
  options?:        Array<{ value: string; label: string }>;
  validationRules?: { minLength?: number; maxLength?: number; pattern?: string; min?: number; max?: number };
  currentValue?:   unknown;
  isMasterField?:  boolean;
  masterValue?:    unknown;

  // --- Scenario A ---
  optionsSource?:   "STATIC" | "MERCHANT_API" | "MASTER_MAPPED";
  optionsEndpoint?: string;

  // --- Scenario B ---
  masterMappedSuggestion?: {
    masterField: string; masterValue: unknown;
    suggestedValue: unknown; suggestedLabel: string;
    confidence: "EXACT" | "FUZZY" | "NONE";
  };

  // --- Scenario C ---
  categoryTreeConfig?: {
    rootEndpoint: string; childEndpoint: string;
    maxDepth: number; requireLeafNode: boolean;
  };

  // --- Scenario E ---
  conditionalRules?: Array<{
    triggerField: string; triggerValues: unknown[];
    effect: "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" | "SET_VALIDATION";
    validationOverride?: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string };
  }>;

  // --- Scenario F ---
  localeConfig?: {
    requiredLocales: string[]; optionalLocales?: string[]; maxLengthPerLocale?: number;
  };

  // --- Scenario G ---
  currencyConfig?: {
    targetCurrency: string; sourceCurrency: string; roundingRule: string;
    channelMinPrice?: number; channelMaxPrice?: number;
  };
  priceSuggestion?: {
    sourceValue: number; sourceCurrency: string;
    suggestedValue: number; targetCurrency: string;
    exchangeRate: number; rateTimestamp: string;
  };

  // --- Scenario H ---
  mediaConfig?: {
    mediaType: "IMAGE" | "VIDEO" | "IMAGE_OR_VIDEO";
    minWidth?: number; minHeight?: number;
    aspectRatios?: string[]; allowedFormats: string[];
    maxFileSizeBytes?: number; maxCount?: number; minCount?: number;
    backgroundRule?: "WHITE_ONLY" | "ANY";
    noWatermark?: boolean; noTextOverlay?: boolean;
    videoRequired?: boolean; videoMaxDurationSeconds?: number;
  };
  masterMediaAssets?: Array<{
    url: string; width: number; height: number; format: string;
    compliance: "PASS" | "FAIL" | "WARNING"; issues?: string[];
  }>;

  // --- Scenario I ---
  copyable?: boolean;

  // --- Scenario J ---
  keywordConfig?: {
    maxItems?: number; maxLengthEach?: number; prefix?: string;
    lineCount?: number; maxLengthPerLine?: number;
    forbiddenWords?: "FROM_TITLE" | "FROM_BRAND" | "COMPETITOR_NAMES";
  };
  keywordSuggestions?: Array<{ value: string; source: string; applicable: boolean }>;

  // --- Scenario K ---
  derivationRule?: {
    operation: "TRUNCATE" | "SPLIT_PARAGRAPHS" | "CONCAT" | "FORMAT_TEMPLATE"
             | "ARITHMETIC_OFFSET" | "EXTRACT_SENTENCES";
    sourceFields: string[];
    params: Record<string, unknown>;
  };
  derivedSuggestion?: unknown;
}
```

**Extended `ChannelFieldType`**

```typescript
type ChannelFieldType =
  | "TEXT" | "TEXTAREA" | "NUMBER" | "SELECT" | "MULTISELECT"
  | "CHECKBOX" | "RADIO" | "DATE" | "URL" | "EMAIL" | "COLOR"
  | "CATEGORY_TREE"        // C
  | "LOCALIZED_TEXT"       // F
  | "LOCALIZED_TEXTAREA"   // F
  | "CURRENCY_PRICE"       // G
  | "CHANNEL_MEDIA"        // H
  | "KEYWORD_LIST"         // J
  | "SEARCH_TERM_LINES";   // J
```

**Extended `SectionName`**

```typescript
type SectionName =
  | "required" | "recommended" | "variant_overrides" | "optional" | "master_overrides"
  | "merchant_data"        // A: fields sourced from merchant account
  | "category_attributes"  // D: injected after category selection
  | "channel_media"        // H: channel-specific media compliance
  | "channel_seo";         // J: channel-specific keyword/search fields
```

---

## Enhanced Combined Data Flow

```
POST /form-schema/channel-step
  Input: { masterProductId, organizationId, masterVariants }

  For each connected store in parallel:
    1. Load channel config  (channel_configurations)
    2. Load channel attrs   (EcommerceMasterAttributeDocument where isChannelField)
    3. Load saved data      (channel_product_data)
    4. Load master product data (for B, F, G, J, K suggestions)

    For each field:
      [A] optionsSource=MERCHANT_API, small list → fetchOptions() → embed options[]
      [A] optionsSource=MERCHANT_API, large list → set optionsEndpoint
      [B] masterFieldLink set → resolveSuggestion() → set masterMappedSuggestion
      [C] fieldType=CATEGORY_TREE → set categoryTreeConfig
      [D] category already saved → getAttributes(categoryId) → inject categoryAttributeSection
      [E] fieldDependencies in channel_config → populate conditionalRules
      [F] channel has requiredLocales → set fieldType=LOCALIZED_TEXT, localeConfig
      [G] fieldType=CURRENCY_PRICE → getRate() → apply rounding → set priceSuggestion
      [H] fieldType=CHANNEL_MEDIA → check master images against mediaConfig → set masterMediaAssets
      [I] set copyable=false for MERCHANT_API, CURRENCY_PRICE with diff currency, mismatched LOCALIZED_TEXT
      [J] fieldType=KEYWORD_LIST → derive keywordSuggestions from master tags/seoKeywords
      [K] derivationRule set → execute derivation against master data → set derivedSuggestion

    Assemble sections
    Calculate completionPercentage (conditional rules + locale requirements + category attrs)

  Return ChannelStepSchemaResponse
```

---

## `EcommerceMasterAttributeDocument` Extensions Required

```java
// Scenario A
private String optionsSource;          // "STATIC" | "MERCHANT_API" | "MASTER_MAPPED"
private String merchantApiOperation;   // e.g. "GET_LOCATIONS"

// Scenario B
private String masterFieldLink;        // e.g. "material"

// Scenario E
private List<ChannelFieldConditionalRule> channelConditionalRules;

// Scenario F
private boolean isLocalizableField;

// Scenario G
private boolean isCurrencyField;
private String  currencyRoundingRule;

// Scenario H
private MediaConfig mediaConfig;       // serialized channel media requirements

// Scenario J
private KeywordConfig keywordConfig;   // serialized keyword structure config

// Scenario K
private DerivationRule derivationRule; // serialized multi-source derivation rule
```

---

## Frontend New Components Summary

| Component | Handles | Scenario |
|-----------|---------|----------|
| `CategoryTreePicker` | Multi-level cascading category selection | C |
| `LocalizedTextInput` | Multi-locale text/textarea with per-locale validation | F |
| `CurrencyPriceInput` | Price with auto-conversion suggestion, override | G |
| `ChannelMediaField` | Master image compliance badges, channel-specific upload | H |
| `KeywordListInput` | Hashtag array with prefix formatting and suggestions | J |
| `SearchTermLinesInput` | N-line keyword input with per-line limits and forbidden-word check | J |
| `useChannelFieldVisibility` hook | Evaluates `conditionalRules` against live form state | E |
| Updated `ChannelFieldInput` | Dispatches to all new component types; shows B/K suggestion banners | A–K |

---

## Priority and Phasing

### Phase 1 — Merchant-sourced options (Scenario A) ✅ IMPLEMENTED (2026-03-07)
Scope: warehouse IDs, shipping templates (TikTok, Lazada) — both eager and lazy paths.

**Frontend completed:**
- `channelStore.ts` — `optionsSource?: "STATIC" | "MERCHANT_API"` and `optionsEndpoint?: string` added to `ChannelFormField`; `"merchant_data"` added to `SectionName`
- `channelStore.service.ts` — `MerchantDataService.fetchFieldOptions()` for imperative/refresh calls
- `ChannelFieldInput.tsx` — `useMerchantOptions` hook: eager-embed (options[] already filled) requires no UI change; lazy-load (options[] empty + optionsEndpoint set) fetches on mount with spinner skeleton and error state
- `ChannelStoreTab.tsx` — `merchant_data` section rendered with blue accent header and "Sourced from your {channelType} account" label

**Backend still needed:**
1. Add `optionsSource` + `merchantApiOperation` to `EcommerceMasterAttributeDocument`
2. Implement `TikTokMerchantDataService`, `LazadaMerchantDataService` (and others)
3. Update `ChannelStepSchemaService` to embed live options (eager) or set `optionsEndpoint` (lazy)
4. `GET /api/v1/merchant-data/{channelType}/{storeId}/field-options` endpoint

### Phase 2 — Master-to-channel value mapping (Scenario B)
Scope: material/color/gender for Lazada and TikTok.
1. Create `channel_field_value_mappings` with seed data
2. Implement `ChannelValueMappingService` with Levenshtein fallback
3. Add `masterMappedSuggestion` to schema generation
4. Add accept-suggestion banner to `ChannelFieldInput`

### Phase 3 — Category tree selection (Scenario C)
Scope: Lazada and Shopee category pickers.
1. `CategorySyncJob` → `channel_category_cache`
2. `GET /merchant-data/{channel}/{store}/categories` endpoint
3. Build `CategoryTreePicker` component

### Phase 4 — Category-dependent field injection (Scenario D)
Depends on Phase 3.
Scope: Lazada smartphone and fashion categories.
1. `GET /merchant-data/{channel}/{store}/category-attributes` endpoint
2. `categoryAttributeSection` in `ChannelSchemaPerStore`
3. Frontend injection + clear-on-change + completion recalculation

### Phase 5 — Cross-field conditional dependencies (Scenario E)
Scope: TikTok pre-order, Shopify requires_shipping, eBay listing_type.
1. `channelConditionalRules` in attribute document
2. Populate `conditionalRules` in schema generation
3. `useChannelFieldVisibility` hook
4. Backend completeness check includes conditional rules

### Phase 6 — Multi-language content (Scenario F)
Scope: Lazada MY and TH.
1. `requiredLocales` on channel configuration document
2. Schema generation: `LOCALIZED_TEXT` fieldType + `localeConfig`
3. `LocalizedTextInput` component
4. Completion check validates per-locale content

### Phase 7 — Currency conversion (Scenario G)
Scope: Tokopedia (IDR), Shopee MY (MYR).
1. `ExchangeRateService` with Redis TTL = 1 hour
2. `priceSuggestion` in schema generation
3. `CurrencyPriceInput` component
4. Apply to variant-level price columns in `VariantOverridesTable`

### Phase 8 — Media compliance (Scenario H)
Scope: Amazon (white background, size), TikTok (video required).
1. `MediaComplianceService` — dimensions + format checks; vision API for background/watermark
2. `mediaConfig` on attribute document; compliance check at schema-gen time
3. `ChannelMediaField` component with per-image PASS/FAIL badges
4. `POST /media/compliance-check` for re-check button
5. `channel_media` section in form

### Phase 9 — Cross-store value inheritance (Scenario I)
Scope: orgs with multiple stores of same channel type.
1. Add `copyable` flag to schema generation based on fieldType and optionsSource
2. "Copy from store" dropdown in `ChannelFieldsWizard` per tab
3. Frontend copy applies skip rules; writes to local form state only
4. "Copied from {store}" badge per field (client-side, clears on save)

### Phase 10 — Channel-specific keyword structure (Scenario J)
Scope: Amazon search_terms, Shopee hashtags.
1. `keywordConfig` on attribute document
2. `keywordSuggestions` derived from master tags at schema-gen time
3. `KEYWORD_LIST` and `SEARCH_TERM_LINES` fieldTypes
4. `KeywordListInput` and `SearchTermLinesInput` components
5. `channel_seo` section in form

### Phase 11 — Computed/derived channel fields (Scenario K)
Scope: Amazon bullet_points, TikTok title truncation, eBay title.
1. `DerivationRule` structure on attribute document
2. `FieldDerivationService` executing operations at schema-gen time
3. `derivedSuggestion` in schema field
4. "Derived suggestion" banner in `ChannelFieldInput` with Accept/Edit/Restore

---

## Open Questions

1. **A — Token expiry at schema-gen time**: If the store is `RECONNECT_REQUIRED`, skip
   live option fetching, return empty `options[]`, set `helpText` to "Reconnect your store
   to load available options."

2. **A — Caching merchant options**: Redis cache keyed `{channelType}:{storeId}:{fieldName}`,
   TTL 15 minutes, avoids hitting the channel API on every schema generation.

3. **B — Fuzzy match threshold**: Configurable Levenshtein score per channel type to
   decide between `"FUZZY"` and `"NONE"`.

4. **B+C — Variant-level mapping**: Per-variant `colour_id` fields in
   `VariantOverridesTable.tsx` need the same `masterMappedSuggestion` per cell.

5. **D — Category change with saved data**: Prompt the seller before clearing
   category-specific fields if any have been filled. Silent clear if all are empty.

6. **D — Backend completion for category attributes**: `saveChannelData` must include
   `categoryId` so the backend validates against the right attribute set, not just
   `channel_configurations.requiredFieldObjects`.

7. **E — Server-side conditional validation**: Backend `saveChannelData` must evaluate
   `conditionalRules` when computing `completionPercentage` — frontend-only evaluation
   can be bypassed via direct API calls.

8. **F — AI translation quality**: Translated locale values should be flagged
   `ai_generated: true` in the save payload so the backend can warn at publish time.

9. **G — Multi-currency variant table**: 20 variants × IDR price = 20 `CurrencyPriceInput`
   instances. The component must be lightweight to avoid rendering bottlenecks.

10. **H — Background/watermark detection cost**: Vision API calls are expensive.
    Cache compliance results per `(imageUrl + mediaConfig hash)` in Redis, TTL 24 hours.
    Only re-run when the image URL or config changes.

11. **H — Channel-specific media storage**: Channel-specific replacement images must be
    stored separately from master images (different S3 prefix or separate document) and
    referenced in `channelData.channelImages[]`.

12. **I — Currency conversion on copy**: When copying a `CURRENCY_PRICE` field from
    `shopify-us` (USD) to `shopify-eu` (EUR), offer "Copy and convert at current rate"
    vs "Copy raw value" vs "Skip".

13. **J — Forbidden-word check latency**: Checking for title words in Amazon search
    terms requires the title value to be resolved at suggestion time. The backend must
    read the master product's `name` (and any `master_overrides["name"]` for this channel)
    before generating suggestions.

14. **K — Derivation idempotency**: If the master product's `description` changes after
    the seller has already accepted a derived `bullet_point_1`, the backend should flag
    the field as "source changed — re-derive?" rather than silently overwriting the
    accepted value.

15. **Cross-scenario composition**: Scenario D fields (injected after category select)
    may combine A (merchant options), B (value mapping), E (conditional rules), and K
    (derived suggestions) for a single field. The schema generation pipeline must compose
    all applicable enrichments for any field regardless of how it was introduced.

---

## Related Documents

- `documentation/Ecommerce-product-v2/STEP2-CHANNEL-FIELDS.md` — current Step 2 implementation
- `documentation/Master-Product-Channel-Specific/STEP2-SCHEMA-GENERATION.md` — backend schema generation algorithm
- `documentation/stores-connect-BE/05-publish-pipeline-integration.md` — publish pipeline
- `documentation/stores-connect-BE/08-oauth-full-automation.md` — OAuth token management
- `documentation/stores-connect-BE/09-oauth-phases-a-to-e-implementation.md` — OAuth lifecycle phases
