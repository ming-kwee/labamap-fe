# API Reference — Step 2: Category Attributes & Category Requirements

Base path: `/labamap/api/v1`

**Implemented:** Phase 3 (Path A static map) + Path B activation (live API per channel)  
**Relates to:** `11-step2-category-required-fields.md` (design), `12-path-b-category-attributes-explanation.md` (internals),
`01-guides/18-variant-option-suggestions-frontend.md` (variant-axis resolution — supersedes the suggestions model)

> **⚠️ `variantOptionSuggestions` is now backend-NARROWED (2026-07-15).** It used to be an *eligible
> pool* of variant-driving attributes; it now contains only the product's **real axes**
> (`variantOptionAttributeNames ∩ Step-1 variant dimensions`) when the request includes
> `masterProductId`. Non-axis eligible fields (Pattern, Style) are demoted into `optionalFields` as
> single-value attributes. Realize `option{n}_values` from the product's actual SKUs — never dump the
> attribute's full taxonomy list. **Phase 2 (shipped 2026-07-15):** the backend now also emits
> `variantAxes` (authoritative resolved axes) + `axisValidation` (both `NON_NULL`); the frontend prefers
> `variantAxes` and gates publish on BLOCKING issues. See `docs/product/01-catalog-schema/01-guides/08a-variant-axis-resolution.md`,
> `docs/FRONTEND-VARIANT-AXIS-NARROWING.md`, and guide 18.

---

## GET `/merchant-data/{channelType}/{storeId}/category-attributes`

Returns the required and optional product attributes for a specific leaf category.

Always returns HTTP 200 — empty arrays on error or no attribute API configured for the channel.

**Path params:**

| Param | Description |
|-------|-------------|
| `channelType` | e.g. `tiktokshop`, `lazada`, `amazon`, `shopify`, `ebay`, `shopee`, `woocommerce` |
| `storeId` | Store ID from `channel_store_connections` |

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `categoryId` | Yes | Leaf node ID as returned by the category tree endpoints |
| `organizationId` | Yes | Organization ID |
| `masterProductId` | Recommended | When present, `variantOptionSuggestions` is narrowed to this product's real axes (`eligible ∩ Step-1 dimensions`) and non-axis eligible fields are demoted to `optionalFields`. Omit → legacy eligible-only (Pattern still leaks as a candidate axis). |

**Example:**
```
GET /labamap/api/v1/merchant-data/tiktokshop/store-sg-01/category-attributes
    ?categoryId=123456&organizationId=org_xyz
```

**Response:** `CategoryAttributesResponse`
```json
{
  "categoryId":   "gid://shopify/TaxonomyCategory/aa-1-13-7",
  "categoryName": "Shirts",
  "categoryPath": ["Apparel & Accessories", "Clothing", "Tops"],
  "requiredFields": [],
  "optionalFields": [
    { "fieldName": "Sleeve length type", "fieldType": "SELECT", "label": "Sleeve length type",
      "required": false, "options": [{ "value": "gid://...", "label": "Long sleeve" }, ...] },
    { "fieldName": "Neckline",           "fieldType": "SELECT", "label": "Neckline",
      "required": false, "options": [{ "value": "gid://...", "label": "V-neck" }, ...] },
    { "fieldName": "Care instructions",  "fieldType": "SELECT", "label": "Care instructions",
      "required": false, "options": [...] }
  ],
  "variantOptionSuggestions": [
    { "fieldName": "Color",   "fieldType": "SELECT", "label": "Color",
      "required": false, "options": [{ "value": "gid://shopify/TaxonomyValue/1", "label": "Black" }, ...] },
    { "fieldName": "Size",    "fieldType": "SELECT", "label": "Size",
      "required": false, "options": [{ "value": "gid://shopify/TaxonomyValue/100", "label": "S" }, ...] },
    { "fieldName": "Pattern", "fieldType": "SELECT", "label": "Pattern",
      "required": false, "options": [...] }
  ]
}
```

`variantOptionSuggestions` — attributes whose values typically drive variant creation (Color, Size, Pattern)
rather than describing the product as a whole. Only populated when `variantOptionAttributeNames` is
configured on the channel's `AttributeApiConfig`. For channels without this config, all non-required
attributes appear in `optionalFields` as before.

**Empty response (no attribute API configured, e.g. WIX):**
```json
{
  "categoryId":   "category-wix-123",
  "categoryName": "",
  "categoryPath": [],
  "requiredFields": [],
  "optionalFields": [],
  "variantOptionSuggestions": []
}
```

**Cache behaviour:** Results are cached in `channel_category_attributes_cache` with a 24-hour TTL
(MongoDB TTL index on `expireAt`). First call fetches live from the channel API; subsequent calls
within 24 hours are served from cache.

**Per-channel implementation:**

| Channel | API mode | Notes |
|---------|----------|-------|
| Lazada | REST GET | Direct: `/api/category/attributes?primary_category_id={id}` |
| TikTok Shop | REST GET | Direct: `/api/products/attributes?category_id={id}` |
| Shopee | REST GET | Direct: `/api/v2/product/get_attributes?category_id={id}` |
| eBay | REST GET | Direct: `/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id={id}` |
| Shopify | GraphQL POST | `TaxonomyCategoryAttributes` query; `TaxonomyCategoryAttribute` union — `TaxonomyChoiceListAttribute` (SELECT, `values.nodes`) + `TaxonomyMeasurementAttribute` (TEXT); `attributes(first: 50)` paginated connection |
| Amazon | Two-step REST | Category name → product type search → JSON Schema fetch |
| WooCommerce | REST GET | Store-level attributes (not category-specific); bare JSON array response |
| WIX | — | No attribute API; returns empty. Category requirements from Path A only |

---

## Updated: `ChannelSchemaPerStore` — `categoryAttributeSection` field

`POST /ecommerce/form-schema/channel-step` now includes an optional `categoryAttributeSection`
field on each store schema entry. It is present only when a CATEGORY_TREE field has a saved value
in `channel_product_data` for that store.

```json
{
  "storeId":    "tiktok-sg-01",
  "channelType":"tiktokshop",
  "sections": { "...": "..." },
  "completionStats": { "...": "..." },
  "categoryAttributeSection": {
    "categoryId":   "123456",
    "categoryName": "Women's T-Shirts",
    "categoryPath": ["Clothing", "Women's", "T-Shirts"],
    "requiredFields": [
      { "fieldName": "100001", "fieldType": "SELECT", "label": "Color", "required": true, "options": [...] }
    ],
    "optionalFields": [
      { "fieldName": "100010", "fieldType": "SELECT", "label": "Pattern", "required": false, "options": [...] }
    ]
  }
}
```

`categoryAttributeSection` is `null` / omitted when no category is saved. The `required` section
in `sections` already contains these fields (category required fields are appended directly).
`categoryAttributeSection` is provided as a convenience so the frontend can render a context
panel ("These fields are required for: Women's T-Shirts") without re-parsing the required section.

`variantOptionSuggestions` inside `categoryAttributeSection` lists attributes that are better
presented in the variant builder (Color, Size, Pattern) rather than the product optional section.
See `18-variant-option-suggestions-frontend.md` for the complete frontend implementation guide.

---

## ⚠ Backend Gap — `categoryAttributeSection` Not Reliably Embedded on Schema Load (2026-06-09)

**Status: Spec says it should be embedded; observed behaviour is often `null` for saved products.**

### Expected behaviour (per this spec)

When `channel_product_data` for the store already has a saved CATEGORY_TREE field value (the seller
previously picked a category and autosave ran), the schema generation should:

1. Read the saved `categoryId` from `channelData[categoryTreeFieldName]`
2. Call `CategoryCacheService.getAttributesForCategory(channelType, storeId, categoryId)` (reads
   from `channel_category_attributes_cache`, TTL 24h)
3. Embed the result as `categoryAttributeSection` in `ChannelSchemaPerStore`

### Observed behaviour

`categoryAttributeSection` comes back `null` even for products with a confirmed saved category.
The frontend therefore always hits the mid-session fetch path:

```
ChannelStoreTab mount
  → categoryId = "gid://shopify/TaxonomyCategory/aa-1-13-7"  (from channelData)
  → schema.categoryAttributeSection = null                    (expected: populated)
  → useEffect fires: GET /merchant-data/shopify/{storeId}/category-attributes?categoryId=...
  → categoryAttrs loaded from live API / cache (extra round-trip)
  → categoryIsUnchangedFromSchema = false (mid-session path, not compact banner path)
```

Side effects of the missing embed:
- Extra HTTP call on every Step 2 page load
- `categoryName` returned by the live endpoint may be a raw GID instead of a display name (backend
  data quality issue surfaced by this path)
- `variantOptionSuggestions` not available at initial render — panel appears after the extra fetch

### Root cause to investigate in `ChannelStepSchemaService`

```java
// ChannelStepSchemaService.buildSchemaForStore() — suspected omission:

// Current (suspected):
channelSchemaPerStore.setCategoryAttributeSection(null);  // or not set at all

// Required:
String savedCategoryId = getCategoryIdFromChannelData(channelProductData, channelConfig);
if (savedCategoryId != null) {
    CategoryAttributeSection section =
        categoryCacheService.getAttributesForCategory(channelType, storeId, savedCategoryId);
    channelSchemaPerStore.setCategoryAttributeSection(section);  // embed — never null when id present
}
```

### `categoryName` quality requirement

When the frontend falls back to the mid-session fetch path, the endpoint
`GET /merchant-data/{channelType}/{storeId}/category-attributes?categoryId=...` must return a
human-readable `categoryName` (e.g. `"Shirts"`), never the raw GID
(`"gid://shopify/TaxonomyCategory/aa-1-13-7"`).

If `categoryName` is not resolved from the cache, the backend should fall back to extracting
the display name from the category cache node rather than echoing the GID:

```java
// CategoryAttributeServiceImpl — when building CategoryAttributeSection:
String displayName = categoryNode.getDisplayName();  // from channel_category_cache
if (displayName == null || displayName.startsWith("gid://")) {
    displayName = categoryNode.getExternalId();  // last-resort: use the leaf code
}
section.setCategoryName(displayName);
```

The same applies to `categoryPath[]` — no element should contain a raw GID.

### Priority

Medium. The frontend works around it with an extra fetch, but it adds latency on every Step 2 load
and causes display artefacts when the backend returns a GID as the category name.

---

## Updated: `CompletionStats` Shape

The `completionStats` object on `ChannelSchemaPerStore` has been extended to expose the split
between channel-level and category-level required fields.

**New shape:**
```typescript
interface CompletionStats {
  requiredTotal:         number;  // channel + category combined
  requiredFilled:        number;  // channel + category combined
  channelRequiredTotal:  number;  // from channelConfig.requiredFieldObjects (+ Path A override)
  channelRequiredFilled: number;
  categoryRequiredTotal: number;  // from live category attribute API (Path B)
  categoryRequiredFilled: number;
  recommendedTotal:      number;
  recommendedFilled:     number;
}
```

**JSON example:**
```json
{
  "requiredTotal":          9,
  "requiredFilled":         4,
  "channelRequiredTotal":   5,
  "channelRequiredFilled":  3,
  "categoryRequiredTotal":  4,
  "categoryRequiredFilled": 1,
  "recommendedTotal":       8,
  "recommendedFilled":      5
}
```

`completionPercentage` (on the parent `ChannelSchemaPerStore` object) is the pre-calculated integer:
`floor(requiredFilled / requiredTotal × 100)`, or 100 if `requiredTotal == 0`.

When `categoryRequiredTotal == 0` (no category selected, or channel has no attribute API), the
stats are identical to the pre-Path-B values: `requiredTotal == channelRequiredTotal`.

---

## MongoDB: `channel_category_attributes_cache`

Created automatically on first cache write (MongoDB deferred collection creation).

```json
{
  "_id":           "...",
  "channelType":   "tiktokshop",
  "storeId":       "store-sg-01",
  "categoryId":    "123456",
  "categoryName":  "Women's T-Shirts",
  "categoryPath":  ["Clothing", "Women's", "T-Shirts"],
  "requiredFields": [
    {
      "fieldName": "100001",
      "fieldType": "SELECT",
      "label":     "Color",
      "required":  true,
      "options":   [{ "value": "1001", "label": "Red" }]
    }
  ],
  "optionalFields": [...],
  "variantSuggestionFields": [
    { "fieldName": "Color", "fieldType": "SELECT", "label": "Color", "required": false, "options": [...] },
    { "fieldName": "Size",  "fieldType": "SELECT", "label": "Size",  "required": false, "options": [...] }
  ],
  "syncedAt":  "2026-06-05T10:00:00Z",
  "expireAt":  "2026-06-06T10:00:00Z"
}
```

**`categoryPath` vs `categoryName`:**  
`categoryPath` contains the **ancestor** label names only (root → direct parent, NOT including the leaf).  
`categoryName` is the leaf node's display name.  
The frontend breadcrumb is built as `[...categoryPath, categoryName].join(" › ")`:

```
categoryPath  = ["Clothing", "Women's", "T-Shirts"]
categoryName  = "Women's T-Shirts"
breadcrumb    = "Clothing › Women's › T-Shirts › Women's T-Shirts"
```

Both fields are resolved from `channel_category_cache` via `CategoryCacheService.getPathToNode()`
during the attribute fetch-and-cache path in `CategoryCacheServiceImpl.fetchAndCacheAttributes()`.

Index: `{ channelType: 1, storeId: 1, categoryId: 1 }` (unique)  
TTL: `expireAt` field — MongoDB deletes document automatically after 24 h

---

## MongoDB: `channel_category_api_config` — Attribute Fields

The following fields on `ChannelCategoryApiConfig` drive the Path B attribute fetch for each channel.
Set by `CategoryApiConfigDataLoader` on startup.

| Field | Type | Description |
|-------|------|-------------|
| `attributesUrlPath` | `String` | REST path for the attribute API. `null` if channel uses GraphQL or two-step lookup |
| `attributeCategoryIdQueryParam` | `String` | Query param name for category ID (e.g. `"category_id"`) |
| `attributesItemsJsonPath` | `String` | Dot-notation path to the attributes array in the response (e.g. `"data.attributes"`) |
| `attributeIdField` | `String` | JSON field used as `fieldName` in the result (e.g. `"attribute_id"`) |
| `attributeNameField` | `String` | JSON field used as display label (e.g. `"attribute_name"`) |
| `attributeRequiredField` | `String` | Boolean field for required flag; supports dot-notation (e.g. `"aspectConstraint.aspectRequired"`) |
| `attributeIsCustomizedField` | `String` | When present: `false` + options present → SELECT; `true` or absent → TEXT |
| `attributeValuesField` | `String` | Field containing the allowed values array |
| `attributeValueIdField` | `String` | Field within each value object for the option value |
| `attributeValueNameField` | `String` | Field within each value object for the display label |
| `attributeResponseIsArray` | `boolean` | `true` when the API returns a bare JSON array (WooCommerce) |
| `attributeGraphqlQuery` | `String` | Full GraphQL query string (Shopify); triggers GraphQL mode |
| `attributeGraphqlIdVariable` | `String` | Variable name for category ID in the GraphQL query (default: `"id"`) |
| `attributeNestedArrayField` | `String` | Inner array field to flatten (Shopify: `"attributes"` inside each `attributeCategories` item) |
| `attributeLookupConfig` | `Object` | Two-step lookup config (Amazon); triggers lookup mode when non-null |

**`attributeLookupConfig` sub-fields (Amazon):**

| Field | Description |
|-------|-------------|
| `lookupUrlPath` | First request path (e.g. `/definitions/2020-09-01/productTypes`) |
| `keywordQueryParam` | Query param for the search keyword (e.g. `"keywords"`) |
| `keywordSource` | `"CATEGORY_NAME"` (default) or `"CATEGORY_ID"` |
| `lookupFixedQueryParams` | Static params for the lookup request |
| `resultIdPath` | Dot-notation to extract the translated ID from the lookup response (e.g. `"productTypes.0.name"`) |
| `schemaUrlTemplate` | Path template for the schema request; `{result}` replaced with extracted ID |
| `schemaFixedQueryParams` | Static params for the schema request |
| `schemaFormat` | `"FLAT_ARRAY"` (default) or `"JSON_SCHEMA"` (Amazon SP-API format) |

---

## MongoDB: `channel_configurations` — `categoryRequirements` Field (Path A)

Operator-curated per-category field overrides on `ChannelConfiguration`. Seeded by
`ChannelCategoryRequirementsMigration` on startup for Shopify, WIX, and eBay.

```json
{
  "channelId": "shopify",
  "categoryRequirements": {
    "clothing": {
      "additionalRequiredFields": [
        { "fieldName": "material",          "fieldType": "string", "description": "Fabric/material composition" },
        { "fieldName": "care_instructions", "fieldType": "string", "description": "Washing and care instructions" },
        { "fieldName": "size_type",         "fieldType": "string", "description": "Size type (regular, plus, petite)" }
      ],
      "additionalRecommendedFields": [
        { "fieldName": "fit",     "fieldType": "string", "description": "Fit style", "recommendationScore": 0.75 },
        { "fieldName": "pattern", "fieldType": "string", "description": "Pattern",   "recommendationScore": 0.65 }
      ],
      "suppressRecommendedFields": []
    },
    "electronics": {
      "additionalRequiredFields": [
        { "fieldName": "model_number", "fieldType": "string", "description": "Manufacturer model number" },
        { "fieldName": "connectivity", "fieldType": "string", "description": "Connectivity type" }
      ],
      "additionalRecommendedFields": [
        { "fieldName": "voltage",      "fieldType": "string", "description": "Operating voltage",  "recommendationScore": 0.8 },
        { "fieldName": "warranty",     "fieldType": "string", "description": "Warranty period",    "recommendationScore": 0.75 }
      ],
      "suppressRecommendedFields": []
    }
  }
}
```

Category slug resolution order (in `ChannelStepSchemaService.resolveCategorySlug()`):
1. Read `channelData.categoryId`; if null, read `channelData.category`
2. Lowercase the value
3. Apply `CATEGORY_SLUG_ALIASES` normalisation (`apparel→clothing`, `tech→electronics`, etc.)
4. Look up the normalised slug in `categoryRequirements` map

Seeded slugs per channel:

| Channel | Slugs |
|---------|-------|
| Shopify | `clothing`, `electronics`, `home-garden`, `sports`, `food`, `beauty`, `books`, `toys` |
| WIX | `clothing`, `electronics`, `home-garden`, `sports`, `food`, `beauty`, `books`, `toys` |
| eBay | `electronics`, `motors`, `fashion`, `collectibles`, `sporting-goods` |

---

## TypeScript Types

```typescript
// CategoryAttributesResponse — matches Java record (axis resolution added 2026-07-15)
interface CategoryAttributesResponse {
  categoryId:              string;
  categoryName:            string;
  categoryPath:            string[];       // ancestor labels, root → parent (NOT including leaf)
  requiredFields:          ChannelFormField[];
  optionalFields:          ChannelFormField[];  // product-level metadata attributes
  variantAxes?:            ResolvedVariantAxis[]; // authoritative axes = permitted ∩ Step-1 dimensions
  axisValidation?:         AxisValidationIssue[]; // NOT_EXPRESSIBLE_ON_CHANNEL | INCOMPLETE_MATRIX | TOO_MANY_AXES
  variantOptionSuggestions?: ChannelFormField[]; // @deprecated — value-vocabulary hint only (see doc 18)
}

// Server-resolved variant axis for THIS product on THIS channel (see doc 18 §4).
interface ResolvedVariantAxis {
  optionIndex:    number;    // 1..3, from Step-1 dimension order
  attributeCode:  string;    // "color"
  name:           string;    // "Color" → option{n}_name
  values:         string[];  // distinct realized values → option{n}_values (NEVER the full taxonomy)
  perSku:         Record<string, string>;                    // sku → value
  valueVocabulary?: { label: string; channelValueId?: string }[]; // datalist suggestions only
}

interface AxisValidationIssue {
  dimension: string;
  code:      "NOT_EXPRESSIBLE_ON_CHANNEL" | "INCOMPLETE_MATRIX" | "TOO_MANY_AXES";
  severity:  "WARNING" | "BLOCKING";
  message:   string;
}

// Updated CompletionStats — replaces the old { required, total, percentage } shape
interface CompletionStats {
  requiredTotal:          number;  // combined
  requiredFilled:         number;  // combined
  channelRequiredTotal:   number;  // Path A contribution
  channelRequiredFilled:  number;
  categoryRequiredTotal:  number;  // Path B contribution
  categoryRequiredFilled: number;
  recommendedTotal:       number;
  recommendedFilled:      number;
}

// Updated ChannelSchemaPerStore
interface ChannelSchemaPerStore {
  channelType:            string;
  storeId:                string;
  storeName:              string;
  storeUrl:               string;
  displayOrder?:          number;
  completionStatus:       ChannelProductStatus;
  completionPercentage:   number;
  sections:               ChannelFormSection[];
  completionStats:        CompletionStats;
  categoryAttributeSection?: CategoryAttributesResponse;  // NEW — null when no category saved
}
```
