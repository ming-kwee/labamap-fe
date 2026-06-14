# Step 2 — Variant Option Suggestions: Frontend Implementation Guide

**Backend implemented:** 2026-06-05
**Frontend revised:** 2026-06-09
**Relates to:** `06-step2-category-attributes.md` (API reference), `11-step2-category-required-fields.md` (backend design), `07-publishing-engine/01-guides/06-variant-value-id-translation.md` (label→ID translation at publish time)

---

## Background

When a seller selects a leaf category (e.g. Shopify taxonomy "Shirts"), the backend fetches
category-specific attributes from the channel API and splits them into two lists:

| List | Contents | Where to render |
|---|---|---|
| `optionalFields` | Product-level metadata — Neckline, Sleeve length, Care instructions, Fabric | Optional section in Step 2 form |
| `variantOptionSuggestions` | Variant-driving attributes — Color, Size, Pattern | Variant options panel + variant table columns |

Previously all attributes were mixed into `optionalFields`. Now `variantOptionSuggestions` gives
the frontend the right list to offer in the variant builder with a "Apply as variant options"
affordance.

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
  variantOptionSuggestions: ChannelFormField[];           // variant drivers
}
```

Each `ChannelFormField` in `variantOptionSuggestions`:

```typescript
{
  fieldName: "Color",       // dimension name — matches Step 1 variant option key
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

## Three-Layer Value Resolution on Apply

When the seller clicks Apply, three things must happen correctly. They are NOT equivalent:

```
Layer 1 — Dimension names (channelData)
  option1_name = "Color"
  option2_name = "Size"
  → Tells Shopify what the variant dimensions are for this product

Layer 2 — Values actually used per variant (variantOverrides)
  variantOverrides["SKU-XS-BLACK"]["option1"] = "Black"
  variantOverrides["SKU-XS-BLACK"]["option2"] = "XS"
  variantOverrides["SKU-S-BLACK"]["option1"]  = "Black"
  variantOverrides["SKU-S-BLACK"]["option2"]  = "S"
  → Tells Shopify which option value each SKU is

Layer 3 — Summary of values used (channelData)
  option1_values = ["Black"]          ← unique values from Layer 2, NOT all taxonomy values
  option2_values = ["XS", "S"]        ← unique values from Layer 2, NOT all taxonomy values
  → Drives Shopify product.options[n].values in the publish payload
```

### Critical: option{n}_values ≠ all taxonomy values

A naive implementation dumps all taxonomy values into `option{n}_values`:
```
option2_values = ["Preemie", "Newborn", "0-3 months", "3-6 months", ...]  // ALL 63 Shirts sizes
```

This is wrong. The master product has variants with Size="XS" and Size="S". `option2_values`
must only contain the values the product's actual variants use. For Shopify's product create
API, `options[n].values` must match the `variant.option{n}` values exactly.

### Critical: taxonomy values are suggestions, not constraints

Shopify's product create API accepts **any string** for `variant.option1`, `variant.option2`, etc.
The taxonomy provides a curated list of well-known values, but a product with `option2 = "XS"`
is perfectly valid even if "XS" does not appear in Shopify's Shirts taxonomy size list. Do NOT
use a `<select>` constrained to taxonomy values for the per-variant option cells.

---

## Data Flow: variantOptions in MasterProductSnapshot

The master product's variant options (e.g. `{ Color: "Black", Size: "XS" }`) are stored in
`sessionStorage["product_{id}"].variants[n].options`. Step 2 reads this and must preserve the
structured options in the `MasterProductSnapshot`:

```typescript
// channelStore.ts — MasterProductSnapshot.variants
variants?: Array<{
  sku: string;
  variantLabel: string;
  variantOptions?: Record<string, string>;  // { Color: "Black", Size: "XS" } — REQUIRED
  [fieldName: string]: unknown;
}>;
```

`getMasterSnapshotFromSession` in `ChannelFieldsWizard.tsx` must NOT strip `options`:
```typescript
// WRONG — loses structured options
const { options, ...rest } = v;
return { ...rest, variantLabel: ... };

// CORRECT — preserve as variantOptions
const { options, ...rest } = v;
return {
  ...rest,
  variantLabel: options ? Object.values(options).join(" / ") : v.sku,
  variantOptions: options ?? {},   // ← preserved for Apply auto-populate
};
```

Without `variantOptions`, the Apply button cannot auto-populate the variant table — the structured
per-variant option values (Color=Black, Size=XS per SKU) are only available here.

---

## Apply Implementation

### handleVariantSuggestionsApply (ChannelStoreTab.tsx)

```typescript
function handleVariantSuggestionsApply(
  orderedSelections: Array<{ fieldName: string; label: string; labels: string[] }>
) {
  const updates: Record<string, unknown> = {};
  const newVariantOverrides = { ...values.variantOverrides };

  orderedSelections.forEach(({ fieldName, label, labels }, idx) => {
    const optionKey = `option${idx + 1}`;
    updates[`${optionKey}_name`] = label;   // "Color", "Size" — NOT fieldName

    // Auto-populate per-variant option{n} from master's structured options
    const usedValues = new Set<string>();
    (masterProduct?.variants ?? []).forEach((v) => {
      const variantOpts = v.variantOptions as Record<string, string> | undefined;
      // Match by fieldName ("Color") then label (same for Shopify taxonomy)
      const masterVal = variantOpts?.[fieldName] ?? variantOpts?.[label];
      if (!masterVal || !v.sku) return;
      usedValues.add(masterVal);
      newVariantOverrides[v.sku] = {
        ...(newVariantOverrides[v.sku] ?? {}),
        [optionKey]: masterVal,   // "Black", "XS" — directly from master
      };
    });

    // option{n}_values = unique values the actual variants use
    // Falls back to full taxonomy labels when master options absent or vocab mismatches
    updates[`${optionKey}_values`] = usedValues.size > 0 ? [...usedValues] : labels;
  });

  // Clear stale keys beyond current count
  for (let i = orderedSelections.length + 1; i <= 3; i++) {
    updates[`option${i}_name`] = undefined;
    updates[`option${i}_values`] = undefined;
  }
  const merged = { ...values.channelData };
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) delete merged[k]; else merged[k] = v;
  }
  onChange({ ...values, channelData: merged, variantOverrides: newVariantOverrides });
}
```

### Dynamic variant table columns

After Apply, new columns appear in the Variant Overrides table — one per applied option.
Use `fieldType: "TEXT"` (not SELECT) with taxonomy labels as datalist suggestions:

```typescript
// In variant_overrides section renderer:
for (let i = 1; i <= 3; i++) {
  const name = values.channelData[`option${i}_name`] as string | undefined;
  const vals = values.channelData[`option${i}_values`] as string[] | undefined;
  if (!name) continue;   // show column as soon as name is set, even if vals is empty
  dynamicOptionFields.push({
    fieldName: `option${i}`,
    fieldType: "TEXT",                              // free text — not SELECT
    label: name,
    required: false,
    placeholder: `Enter ${name}…`,
    options: (vals ?? []).map(v => ({ value: v, label: v })),  // datalist suggestions
  });
}
```

### TEXT + datalist in ChannelFieldInput

When `fieldType === "TEXT"` and `options.length > 0`, render an `<input list={datalistId}>` so
taxonomy values appear as browser autocomplete suggestions while still allowing free-text:

```tsx
// default case in ChannelFieldInput.renderInput()
if (options.length > 0) {
  const listId = `dl-${field.fieldName}`;
  return (
    <>
      <input type="text" list={listId} value={...} onChange={...} ... />
      <datalist id={listId}>
        {options.map(opt => <option key={opt.value} value={opt.label} />)}
      </datalist>
    </>
  );
}
// plain text input when no options
return <input type="text" ... />;
```

Use `opt.label` (not `opt.value`) as the datalist option value — Shopify takes the human-readable
label ("Black"), not the taxonomy GID (`gid://shopify/TaxonomyValue/1`).

---

## Save Format

```json
{
  "channelData": {
    "shopify_taxonomy_category_id": "gid://shopify/TaxonomyCategory/aa-1-13-7",
    "option1_name":   "Color",
    "option1_values": ["Black"],
    "option2_name":   "Size",
    "option2_values": ["XS", "S"]
  },
  "variantOverrides": {
    "SKU-XS-BLACK": { "option1": "Black", "option2": "XS" },
    "SKU-S-BLACK":  { "option1": "Black", "option2": "S"  }
  }
}
```

`option{n}_values` = unique set of values used by variants (derived from `variantOverrides`),
not the full taxonomy list.
`variant.option{n}` = the specific value for that SKU, auto-populated from master variant
options and editable by the seller from the variant table.

---

## Vocabulary Mismatch & channel_field_value_mappings

When master option values don't directly match taxonomy labels (e.g. master uses `"Jet Black"`,
Shopify taxonomy has `"Black"`), the per-variant cell stays empty after auto-populate. The seller
must type the correct value manually (the datalist shows taxonomy suggestions).

`channel_field_value_mappings` is the backend mechanism for systematic mismatches — seed a
mapping `"jet black" → "Black"` and the backend can emit a `masterMappedSuggestion` on the
variant option field. For **ID-based channels** (TikTok Shop, Lazada), this same mapping also
drives label → ID translation at publish time via `VariantValueTranslationService` — the
frontend always stores human-readable labels, and the backend substitutes the taxonomy ID
transparently. See `06-variant-value-id-translation.md` for the full design.

> **Frontend contract:** always store `opt.label` (the human-readable string) in
> `option{n}_values` and in `variantOverrides.option{n}`. Never store `opt.value` (taxonomy GID
> or ID). The backend resolves the correct channel API value at publish time.

**Vocabulary mismatch is often a category signal.** If the master product has adult sizes
`["XS", "S", "M"]` but the Shopify category (e.g. "Shirts" in the Babies taxonomy) returns
only baby sizes `["Preemie", "Newborn", "0-3 months"]`, the empty cells after Apply indicate
the seller likely chose the wrong Shopify category. The seller should change the category
first, then re-apply.

---

## `categoryId` Key in `channelData` — Do Not Store

Do **not** add a `categoryId` key inside `channelData`:

```json
// WRONG — causes duplicate "Category" TEXT field in UI
{ "channelData": { "shopify_taxonomy_category_id": "gid://...", "categoryId": "gid://..." } }

// CORRECT
{ "channelData": { "shopify_taxonomy_category_id": "gid://..." } }
```

The top-level `request.categoryId` (outside `channelData`) is still used for completion scoring.

---

## Which Channels Have This Feature

| Channel | `variantOptionSuggestions` | Notes |
|---|---|---|
| Shopify | ✅ Color, Size, Pattern, Style, Fit, Width, Length, Scent | From Shopify Product Taxonomy GraphQL API |
| TikTok Shop | ❌ empty | Color/Size appear in `requiredFields` instead |
| Lazada | ❌ empty | No `variantOptionAttributeNames` configured |
| Amazon | ❌ empty | No `variantOptionAttributeNames` configured |
| eBay | ❌ empty | No `variantOptionAttributeNames` configured |
| WIX | ❌ empty | No attribute API; Path A only |

To enable for a new channel, update `attributeConfig.variantOptionAttributeNames` via admin API:

```http
PUT /api/v1/admin/channel-category-api-configs/tiktokshop/attribute-api
{ "variantOptionAttributeNames": ["Color", "Size", "Style"] }
```

---

## Implementation Checklist

### Frontend (complete)

| # | What | File | Status |
|---|---|---|---|
| 1 | `variantOptions` field on `MasterProductSnapshot.variants` | `channelStore.ts` | ✅ 2026-06-09 |
| 2 | Preserve `variantOptions` in `getMasterSnapshotFromSession` | `ChannelFieldsWizard.tsx` | ✅ 2026-06-09 |
| 3 | `handleVariantSuggestionsApply` — auto-populate from `variantOptions`, derive `option{n}_values` from used values | `ChannelStoreTab.tsx` | ✅ 2026-06-09 |
| 4 | Dynamic variant table columns — `fieldType: "TEXT"`, dedup against schema variantFields | `ChannelStoreTab.tsx` | ✅ 2026-06-09 |
| 5 | TEXT + datalist in `ChannelFieldInput` — suggestions without hard constraint | `ChannelFieldInput.tsx` | ✅ 2026-06-09 |
| 6 | `categoryId` not stored inside `channelData` | `ChannelFieldsWizard.tsx` | ✅ 2026-06-09 |
| 7 | Missing `key` on mid-session `VariantOptionSuggestionsPanel` — stale state on category switch | `ChannelStoreTab.tsx` | ✅ 2026-06-09 |
| 8 | Case-insensitive `variantOptions` lookup (step 1 may store "Color", taxonomy sends "color") | `ChannelStoreTab.tsx` | ✅ 2026-06-09 |

### Backend (implemented 2026-06-10)

| # | What | Doc | Priority | Status |
|---|---|---|---|---|
| B1 | New `BUILD_OPTIONS_FROM_FLAT_KEYS` operation in `GenericPostProcessingEngine` — reads `option{n}_name` / `option{n}_values` from `product.*` (forwarded by JOLT from channelData) and builds `product.options` with correct names; falls back to `EXTRACT_DIMENSIONS` when keys absent | `07-publishing-engine/01-guides/05-post-processing-config.md` | **Critical** | ✅ 2026-06-10 |
| B2 | `shopify-options-from-channel-data` rule seeded at priority 19 in `ChannelConfigurationDataLoader`; old `generate-options-from-variants` disabled (`enabled: false`) — new rule covers both paths | `05-post-processing-config.md` | **Critical** | ✅ 2026-06-10 |
| B3 | `variantOverrides` applied post-JOLT via `applyVariantOverridesPostJolt()` — verified correct: directly patches variant map after JOLT, overrides any JOLT-derived option values | `07-publishing-engine/02-api-reference/01-publish-request-response.md` | **Critical** | ✅ already correct |
| B4 | `option1_name` / `option2_name` / `option3_name` / `option{n}_values` added to Shopify `apiSchema` in `ChannelConfigurationDataLoader` — JOLT now forwards them to `product.*`; also surfaces as optional Step 2 schema fields for `currentValue` on reload | `02-ecommerce-wizard/02-api-reference/04-step2-schema-and-channel-data.md` | **Important** | ✅ 2026-06-10 |
| B5 | `categoryAttributeSection` embed relies on 3s timeout in `ChannelStepSchemaService` — works once cache is populated; storeUrl fix (2026-06-10) resolved the root cause that prevented initial cache population | `02-ecommerce-wizard/02-api-reference/06-step2-category-attributes.md` | **Important** | ✅ root cause fixed |
| B6 | `categoryName` GID fallback fixed: `CategoryCacheServiceImpl.fetchAndCacheAttributes()` now tries `ChannelTaxonomyCacheRepository.findByChannelTypeAndNodeId()` when path resolution returns a GID string | `06-step2-category-attributes.md` | **Important** | ✅ 2026-06-10 |
| B7 | Seed `channel_field_value_mappings` for variant option vocab mismatches (e.g. master "Jet Black" → Shopify taxonomy "Black") | Scenario B in `09-step2-channel-data-sources.md` | Optional | ⬜ |

---

## Summary of Backend Contract (unchanged 2026-06-05)

| Change | Impact on Frontend |
|---|---|
| `CategoryAttributesResponse` gains `variantOptionSuggestions` field | Add to TypeScript type; render in variant builder panel |
| `optionalFields` no longer includes Color/Size/Pattern for Shopify | Remove duplicate rendering if those were showing in optional section |
| `categoryAttributeSection` on `ChannelSchemaPerStore` always includes `variantOptionSuggestions: []` | No null-check needed; check `.length > 0` for panel visibility |
| `channelData["categoryId"]` = GID causes duplicate UI field | Do not store GID under `categoryId` key inside `channelData` |
