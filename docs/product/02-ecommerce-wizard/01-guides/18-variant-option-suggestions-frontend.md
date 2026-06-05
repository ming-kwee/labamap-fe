# Step 2 — Variant Option Suggestions: Frontend Implementation Guide

**Backend implemented:** 2026-06-05  
**Relates to:** `06-step2-category-attributes.md` (API reference), `11-step2-category-required-fields.md` (backend design)

---

## Background

When a seller selects a leaf category (e.g. Shopify taxonomy "Shirts"), the backend fetches
category-specific attributes from the channel API and splits them into two lists:

| List | Contents | Where to render |
|---|---|---|
| `optionalFields` | Product-level metadata — Neckline, Sleeve length, Care instructions, Fabric | Optional section in Step 2 form |
| `variantOptionSuggestions` | Variant-driving attributes — Color, Size, Pattern | Variant builder (new UX) |

Previously all attributes were mixed into `optionalFields`. Now `variantOptionSuggestions` gives
the frontend the right list to offer in the variant builder with a "Use as variant option" affordance.

---

## What the Backend Sends

`categoryAttributeSection` on `ChannelSchemaPerStore` (inside the schema response):

```typescript
interface CategoryAttributesResponse {
  categoryId:               string;
  categoryName:             string;    // e.g. "Shirts"
  categoryPath:             string[];  // e.g. ["Apparel & Accessories", "Clothing", "Tops"]
  requiredFields:           ChannelFormField[];
  optionalFields:           ChannelFormField[];           // product metadata
  variantOptionSuggestions: ChannelFormField[];           // NEW — variant drivers
}
```

Each `ChannelFormField` in `variantOptionSuggestions`:

```typescript
{
  fieldName: "Color",       // use as option name in Shopify product.options[]
  fieldType: "SELECT",
  label:     "Color",
  required:  false,
  options: [
    { value: "gid://shopify/TaxonomyValue/1",  label: "Black" },
    { value: "gid://shopify/TaxonomyValue/13", label: "Red" },
    ...                                         // 19 options for Color
  ]
}
```

`variantOptionSuggestions` is `[]` (never null) when:
- No category is selected yet
- The channel has no `variantOptionAttributeNames` configured (Lazada, TikTok, Amazon, eBay, WIX)
- The selected category returned no matching attributes

**Channels with split enabled:** Shopify only (initial release).
Configured via `channel_category_api_config.attributeConfig.variantOptionAttributeNames`.

---

## Recommended UX

### When category is selected and `variantOptionSuggestions` is non-empty

Show a **"Variant Options from Category"** panel above or alongside the variant configurator:

```
┌──────────────────────────────────────────────────────────────────┐
│  Category: Shirts  (Apparel & Accessories › Clothing › Tops)     │
│                                                                    │
│  Suggested variant options for this category:                     │
│                                                                    │
│  [✓] Color    — 19 values (Black, White, Red…)   [Use]           │
│  [✓] Size     — 8 values (XS, S, M, L, XL…)     [Use]           │
│  [ ] Pattern  — 12 values (Solid, Striped…)       [Use]          │
│                                                                    │
│  [Apply selected as variant options]                              │
└──────────────────────────────────────────────────────────────────┘
```

Clicking **"Apply"** pre-populates the variant option names (Color, Size) and their allowed values
in the variant configurator. The seller can then deselect values they don't use (e.g. remove "Beige"
from Color).

### When `variantOptionSuggestions` is empty

Do not render the panel. Variant configuration stays fully manual.

---

## Implementation Steps

### 1. Update TypeScript types

```typescript
// Add to CategoryAttributesResponse
interface CategoryAttributesResponse {
  categoryId:               string;
  categoryName:             string;
  categoryPath:             string[];
  requiredFields:           ChannelFormField[];
  optionalFields:           ChannelFormField[];
  variantOptionSuggestions: ChannelFormField[];  // ADD THIS
}
```

### 2. Do NOT render `variantOptionSuggestions` in the Optional section

The optional section should only render `optionalFields`. If the current implementation renders
all of `categoryAttributeSection.optionalFields` — make sure `variantOptionSuggestions` is not
included in that render path. They are two separate arrays.

### 3. Render the "Variant Options from Category" panel

Show the panel when:
```typescript
categoryAttributeSection?.variantOptionSuggestions?.length > 0
```

Each suggestion renders as a checkbox row with the option name and a preview of its values:

```typescript
variantOptionSuggestions.map(field => (
  <SuggestionRow
    key={field.fieldName}
    label={field.label}
    valueCount={field.options?.length ?? 0}
    valuePreview={field.options?.slice(0, 3).map(o => o.label).join(", ")}
    checked={selectedSuggestions.includes(field.fieldName)}
    onChange={() => toggleSuggestion(field.fieldName)}
  />
))
```

### 4. On "Apply" — inject into variant configurator

When the seller clicks Apply, for each selected suggestion:

1. Add `field.fieldName` as a variant option name (e.g. `"Color"`)
2. Add `field.options` as the option values (e.g. `[{value: "...", label: "Black"}, ...]`)
3. Mark each option as selected by default (seller can deselect)

The variant configurator then generates the SKU matrix from the selected options × values.

**Save format:** When saving `channelData` after variant options are applied:

```json
{
  "channelData": {
    "shopify_taxonomy_category_id": "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "option1_name":   "Color",
    "option1_values": ["Black", "White", "Red"],
    "option2_name":   "Size",
    "option2_values": ["S", "M", "L", "XL"]
  }
}
```

Do **not** store the full Shopify taxonomy value GIDs (e.g. `gid://shopify/TaxonomyValue/1`) as
the option values — Shopify's product create API takes the human-readable label, not the GID.
Use `option.label` not `option.value` when building the save payload.

### 5. On category change — re-fetch suggestions

When the CATEGORY_TREE field value changes:

1. Save new `channelData.shopify_taxonomy_category_id` immediately (autosave)
2. Call:
   ```
   GET /api/v1/merchant-data/shopify/{storeId}/category-attributes
       ?categoryId={newCategoryId}&organizationId={orgId}
   ```
3. Update `variantOptionSuggestions` panel with the new response
4. Clear previously applied variant options if the category changes significantly
   (or show a warning: "Category changed — review your variant options")

Alternatively (simpler): re-call `POST /ecommerce/form-schema/channel-step` to get the full
updated `categoryAttributeSection`. Acceptable if debounced.

---

## `categoryId` Key in `channelData` — Do Not Store

Do **not** add a `categoryId` key inside `channelData` pointing to the taxonomy GID:

```json
// WRONG — causes duplicate "Category" field in UI
{
  "channelData": {
    "shopify_taxonomy_category_id": "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "categoryId": "gid://shopify/TaxonomyCategory/aa-1-13-7"   ← remove this
  }
}

// CORRECT
{
  "channelData": {
    "shopify_taxonomy_category_id": "gid://shopify/TaxonomyCategory/aa-1-13-7"
  }
}
```

The `categoryId` key inside `channelData` appears as a duplicate TEXT field in the UI. The
backend resolves the Path A slug from the Path B `categoryPath` automatically (via
`resolveCategorySlug()` Priority 3) — no extra `categoryId` key is needed.

The top-level `request.categoryId` field in the save request body (outside `channelData`) is
still used by the save endpoint for completion score calculation and is correct to include:

```json
{
  "masterProductId": "...",
  "storeId":         "...",
  "channelType":     "shopify",
  "categoryId":      "gid://shopify/TaxonomyCategory/aa-1-13-7",   ← top-level: OK
  "channelData": {
    "shopify_taxonomy_category_id": "gid://shopify/TaxonomyCategory/aa-1-13-7"
  }
}
```

---

## Which Channels Have This Feature

| Channel | `variantOptionSuggestions` | Notes |
|---|---|---|
| Shopify | ✅ Color, Size, Pattern, Style, Fit, Width, Length, Scent | From Shopify Product Taxonomy GraphQL API |
| TikTok Shop | ❌ empty | Attributes have `required` flag; Color/Size appear in `requiredFields` instead |
| Lazada | ❌ empty | No `variantOptionAttributeNames` configured |
| Amazon | ❌ empty | No `variantOptionAttributeNames` configured |
| eBay | ❌ empty | No `variantOptionAttributeNames` configured |
| WIX | ❌ empty | No attribute API; Path A only |

To add variant option splitting for a new channel, update its `attributeConfig.variantOptionAttributeNames`
via the admin API — no code change needed:

```http
PUT /api/v1/admin/channel-category-api-configs/tiktokshop/attribute-api
{
  ... existing attributeConfig fields ...,
  "variantOptionAttributeNames": ["Color", "Size", "Style"]
}
```

---

## Summary of Backend Contract Changes (2026-06-05)

| Change | Impact on Frontend |
|---|---|
| `CategoryAttributesResponse` gains `variantOptionSuggestions` field | Add to TypeScript type; render in variant builder panel |
| `optionalFields` no longer includes Color/Size/Pattern for Shopify | Remove duplicate rendering if those were showing in optional section |
| `categoryAttributeSection` on `ChannelSchemaPerStore` always includes `variantOptionSuggestions: []` | No null-check needed; check `.length > 0` for panel visibility |
| `channelData["categoryId"]` = GID causes duplicate UI field | Do not store GID under `categoryId` key inside `channelData` |
| Shopify GraphQL query updated — `attributes(first: 50)` connection, union types | No frontend impact — transparent to API consumers |
