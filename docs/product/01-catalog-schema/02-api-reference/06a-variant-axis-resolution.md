# API Reference — Variant Axis Resolution

Base path: `/labamap/api/v1`

**Guide:** `01-guides/08a-variant-axis-resolution.md` · **FE contract:** `02-ecommerce-wizard/02-api-reference/06-step2-category-attributes.md`

Axis resolution has **no dedicated endpoint**. The resolved `variantAxes` + `axisValidation` are
delivered as extra fields on the existing `CategoryAttributesResponse`, through two paths:

| Path | Where | Resolves axes when |
|------|-------|--------------------|
| Embedded | `channels[].categoryAttributeSection` in the Step 2 schema (`POST /ecommerce/form-schema/channel-step`) | always (product context is server-side) |
| Standalone | `GET /merchant-data/{channelType}/{storeId}/category-attributes` | only when `masterProductId` is supplied |

---

## GET `/merchant-data/{channelType}/{storeId}/category-attributes`

Returns the category's required/optional fields plus resolved variant axes for a product.

**Query parameters:**

| Param | Required | Notes |
|-------|----------|-------|
| `categoryId` | yes | Leaf category node id. |
| `organizationId` | yes | Owning org. |
| `masterProductId` | **no** | When present, `variantOptionSuggestions` is narrowed and `variantAxes` + `axisValidation` are populated from the product's Step-1 structure. When absent, the legacy eligible-only response is returned (backward-compatible). |

Always returns `200` (empty field arrays on error). `variantAxes` / `axisValidation` are omitted from
JSON when null (`@JsonInclude(NON_NULL)`).

---

## Response: `CategoryAttributesResponse`

| Field | Type | Notes |
|-------|------|-------|
| `categoryId` | string | Leaf node id. |
| `categoryName` | string | Leaf display name. |
| `categoryPath` | string[] | Ancestor labels, root → parent (excludes leaf). |
| `requiredFields` | ChannelFormField[] | Category-required fields. |
| `optionalFields` | ChannelFormField[] | Product-level metadata; **includes demoted non-axis fields** (e.g. Pattern). |
| `variantOptionSuggestions` | ChannelFormField[] | **Deprecated** — value-vocabulary hint only. Never derive the axis SET from it. |
| `variantAxes` | ResolvedVariantAxis[] \| null | Authoritative axes = permitted ∩ Step-1 dims, values realized from SKUs. |
| `axisValidation` | AxisValidationIssue[] \| null | Axis-level problems. |

---

## Schema: `ResolvedVariantAxis`

| Field | Type | Notes |
|-------|------|-------|
| `optionIndex` | int | 1-based option position (1..3). Order follows Step-1 dimension order. |
| `attributeCode` | string | Step-1 dimension code, e.g. `"color"`. Join key. |
| `name` | string | Display name → `option{n}_name`, e.g. `"Color"`. |
| `values` | string[] | Distinct values the product's SKUs actually use → `option{n}_values`. Never the full taxonomy. |
| `perSku` | map<string,string> | `sku → the value that SKU uses on this axis`. Seeds `variantOverrides[sku]["option{n}"]`. |
| `valueVocabulary` | {label, channelValueId?}[] \| null | Channel taxonomy hint (datalist + label→id translation). Omitted when null. |

```json
{
  "optionIndex": 1,
  "attributeCode": "color",
  "name": "Color",
  "values": ["Black", "Red"],
  "perSku": { "TS-BLK-S": "Black", "TS-BLK-M": "Black", "TS-RED-S": "Red", "TS-RED-M": "Red" },
  "valueVocabulary": [
    { "label": "Black", "channelValueId": "gid://shopify/.../Black" },
    { "label": "Red",   "channelValueId": "gid://shopify/.../Red" }
  ]
}
```

---

## Schema: `AxisValidationIssue`

| Field | Type | Notes |
|-------|------|-------|
| `dimension` | string | The Step-1 dimension the issue concerns (empty for `TOO_MANY_AXES`). |
| `code` | enum | `NOT_EXPRESSIBLE_ON_CHANNEL` \| `INCOMPLETE_MATRIX` \| `TOO_MANY_AXES`. |
| `severity` | enum | `WARNING` \| `BLOCKING`. |
| `message` | string | Human-readable; render directly. |

| code | severity | trigger |
|------|----------|---------|
| `NOT_EXPRESSIBLE_ON_CHANNEL` | WARNING | a Step-1 dimension the SKUs vary on (>1 distinct value) is not in the channel's permitted axes |
| `INCOMPLETE_MATRIX` | BLOCKING | a resolved axis has some SKUs missing a value |
| `TOO_MANY_AXES` | BLOCKING | resolved axes > 3 |

```json
{ "dimension": "Fabric", "code": "NOT_EXPRESSIBLE_ON_CHANNEL", "severity": "WARNING",
  "message": "shopify does not offer 'Fabric' as a variant option for this category; SKUs differing only by Fabric may collide. Pick a category that supports it, or adjust Step 1." }
```

---

## Full example

**Request**
```
GET /labamap/api/v1/merchant-data/shopify/store-abc/category-attributes
      ?categoryId=gid://shopify/TaxonomyCategory/aa-1-13-8
      &organizationId=org_1
      &masterProductId=prod_123
```

**Response `200`**
```json
{
  "categoryId": "gid://shopify/TaxonomyCategory/aa-1-13-8",
  "categoryName": "T-Shirts",
  "categoryPath": ["Apparel & Accessories", "Clothing", "Tops"],
  "requiredFields": [ ],
  "optionalFields": [
    { "fieldName": "material", "label": "Material", "fieldType": "SELECT" },
    { "fieldName": "pattern",  "label": "Pattern",  "fieldType": "SELECT" }
  ],
  "variantOptionSuggestions": [
    { "fieldName": "color", "label": "Color" },
    { "fieldName": "size",  "label": "Size" }
  ],
  "variantAxes": [
    { "optionIndex": 1, "attributeCode": "color", "name": "Color",
      "values": ["Black","Red"],
      "perSku": { "TS-BLK-S": "Black", "TS-BLK-M": "Black", "TS-RED-S": "Red", "TS-RED-M": "Red" },
      "valueVocabulary": [ { "label": "Black", "channelValueId": "gid-blk" }, { "label": "Red", "channelValueId": "gid-red" } ] },
    { "optionIndex": 2, "attributeCode": "size", "name": "Size",
      "values": ["S","M"],
      "perSku": { "TS-BLK-S": "S", "TS-BLK-M": "M", "TS-RED-S": "S", "TS-RED-M": "M" } }
  ]
}
```

Here `pattern` was demoted (eligible but not a Step-1 axis), so it appears in `optionalFields` — not in
`variantOptionSuggestions` or `variantAxes`. `axisValidation` is omitted because there are no issues.

---

## Behavior notes

- **Gating:** the standalone endpoint resolves axes only with `masterProductId`. The frontend already
  sends it (`ChannelStoreTab.tsx`). The embedded `categoryAttributeSection` resolves without a param.
- **Null omission:** `variantAxes` / `axisValidation` absent ⇒ backend did not resolve axes for this
  response ⇒ the frontend `variantAxes ?? deriveFromSuggestions(...)` fallback applies.
- **No-signal safety:** a product with no ProductType dimensions and no variant metadata yields the
  response unchanged (nothing is silently dropped).
- **Backward compatibility:** existing 6-field `CategoryAttributesResponse` consumers are unaffected
  (a 6-arg constructor defaults the two new fields to null).
- **TypeScript types:** `ResolvedVariantAxis`, `AxisValidationIssue`, `CategoryAttributeSection` in
  `step2-channel-fields/types/channelStore.ts`.
- **Produced by:** `VariantAxisResolver.resolveAxes` (via `ChannelStepSchemaService.buildStoreResult`
  and `MerchantDataController`).
