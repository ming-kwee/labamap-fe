# Step 2 — Channel Fields

## What This Step Does

Step 2 lets sellers fill channel-specific product data for every connected store before publishing. A single master product listed on Shopify, Amazon, Lazada, and TikTok simultaneously needs different required fields, naming conventions, and category structures per platform. Step 2 provides a tabbed form per store.

```
/products/{masterProductId}/channel-fields
      │
      ├─ Tab: Shopify Store A      sections: required / recommended / optional / master_overrides / variant_overrides
      ├─ Tab: Amazon Malaysia      sections: required / recommended / optional / master_overrides / variant_overrides
      └─ Tab: TikTok Shop          sections: required / recommended / optional / master_overrides / variant_overrides
```

---

## Channel Fields vs. Master Overrides

Two distinct types of fields appear in Step 2, driven by two flags on `EcommerceMasterAttributeDocument`:

| Flag                         | What it means                                                                                                   | Where the value goes                                                       |
|------------------------------|-----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| `isChannelField: true`       | Field exists only on this channel — no master product equivalent (e.g. Shopify `vendor`, TikTok `warehouse_id`) | `channelData` bucket → merged into masterProductData before JOLT           |
| `isChannelOverridable: true` | Master product field that the seller can override per channel (e.g. shorten `name` for TikTok's 100-char limit) | `masterOverrides` bucket → merged before `channelData` in publish pipeline |

Step 1's form schema endpoint explicitly excludes `isChannelField: true` attributes — they are never shown in the master product creation form.

---

## Schema Generation

On mount, `ChannelFieldsWizard` reads the master product's variants from `sessionStorage` (key: `product_{masterProductId}`, written by Step 1), then calls:

```
POST /api/v1/ecommerce/form-schema/channel-step
{
  "masterProductId":  "prod_abc123",
  "organizationId":   "org_123",
  "masterVariants":   [{ "sku": "SKU-001", ... }]
}
```

The response includes `masterProduct: MasterProductSnapshot` — a lightweight copy of the master product's attributes and variant dimensions, used to pre-populate `master_overrides` section values and build the `variant_overrides` table.

The backend generates the schema by combining **three data sources**:

```
SOURCE 1: channel_store_connections
  WHERE organizationId = org_123 AND isActive = true
  → which stores to build tabs for

SOURCE 2: channel_configurations
  WHERE channelId = store.channelType
  → which fields are required/recommended for this channel type

SOURCE 3: EcommerceMasterAttributeDocument
  WHERE isChannelField = true
    AND supportedChannels CONTAINS store.channelType
  → what each field looks like (label, type, validation, helpText)
```

Response is a `ChannelStepSchemaResponse` containing one `ChannelSchemaPerStore` per store. Each schema includes sections (required / recommended / optional / master_overrides / variant_overrides) with fields pre-populated from any previously saved data.

---

## Form State Per Tab

Each `ChannelStoreTab` maintains three separate value buckets:

| Bucket             | Key                                       | Purpose                                         |
|--------------------|-------------------------------------------|-------------------------------------------------|
| `channelData`      | `Record<string, unknown>`                 | Channel-specific field values                   |
| `masterOverrides`  | `Record<string, unknown>`                 | Master product field overrides for this channel |
| `variantOverrides` | `Record<sku, Record<fieldName, unknown>>` | Per-SKU field overrides                         |

---

## Autosave

Two triggers flush values to `POST /channel-product-data/save`:

| Trigger         | Behaviour                                         |
|-----------------|---------------------------------------------------|
| Debounced timer | 30-second idle timer, resets on every keystroke   |
| Tab change      | Immediate save of the active tab before switching |

Save payload (`ChannelStepSaveRequest`):
```typescript
{
  masterProductId,
  storeId,
  channelType,
  masterOverrides,   // from masterOverrides bucket
  channelData,       // from channelData bucket
  variantOverrides,  // from variantOverrides bucket
}
```

---

## Form Sections

| `sectionName`       | Rendered by             | Description                                     |
|---------------------|-------------------------|-------------------------------------------------|
| `required`          | `ChannelFieldInput`     | Platform-required fields — must fill to publish |
| `recommended`       | `ChannelFieldInput`     | Optional but strongly advised                   |
| `optional`          | `ChannelFieldInput`     | Supplementary fields                            |
| `master_overrides`  | `MasterOverrideSection` | Override master product values per channel      |
| `variant_overrides` | `VariantOverridesTable` | Per-SKU overrides in a table layout             |

---

## Master Overrides

The `master_overrides` section shows fields from the master product that are marked `isChannelOverridable: true` in the backend schema. Each field displays:
- The current master product value
- An editable override input for this channel
- A "Reset to master" button that clears the override

When the seller overrides a field (e.g. shortens the product title for TikTok's 100-char limit), the override value is sent to that channel at publish time. Other channels continue using the master product value.

---

## Variant Override Table

When the master product has variants, the `variant_overrides` section renders a table:
- One **row per SKU**
- One **column per overridable field** (e.g. price, stock, barcode, channelSku, inventory_policy)
- Inline editing; changes written to `variantOverrides[sku][fieldName]`

**Column configuration** comes from `variantFields[]` in the schema's `variant_overrides` section. The table is fully data-driven — no hardcoded field names. Two flags on each `ChannelFormField` drive behavior:
- `isMasterField: true` → reads current value from `masterProduct.variants[i][fieldName]`
- `isMasterField: false` → reads from `variantOverrides[sku][fieldName]` (channel-specific)

---

## Completion Tracking

After every autosave, the backend returns updated completion statistics. The wizard shows a status dot per tab:

| Status            | Meaning                               |
|-------------------|---------------------------------------|
| Grey (Empty)      | No data entered yet                   |
| Amber (Partial)   | Some required fields filled           |
| Green (Complete)  | All required fields filled            |
| Green (Published) | Store has been published successfully |
| Red (Error)       | Previous publish attempt failed       |

`completionStats` in the schema response has four fields:

| Field               | Description                                |
|---------------------|--------------------------------------------|
| `requiredTotal`     | Number of required fields for this channel |
| `requiredFilled`    | How many required fields are non-empty     |
| `recommendedTotal`  | Number of recommended fields               |
| `recommendedFilled` | How many recommended fields are non-empty  |

**isFilled rules (backend `ChannelProductDataService.isFilled()`):**
- `CHECKBOX` (Boolean): always counted as filled — a false checkbox is a valid answer
- `NUMBER`: filled if the value is not null
- `MULTISELECT` (Collection): filled if the array is non-empty
- `TEXT`/`TEXTAREA`/`SELECT`/etc.: filled if the string is non-empty after trimming

---

## ChannelFieldInput — Field Type Dispatch

`ChannelFieldInput.tsx` renders the correct input for each `ChannelFieldType`:

| `ChannelFieldType`      | Input                                          |
|-------------------------|------------------------------------------------|
| `TEXT`                  | `<input type="text">`                          |
| `TEXTAREA`              | `<textarea>`                                   |
| `NUMBER`                | `<input type="number">`                        |
| `SELECT`                | `<select>`                                     |
| `MULTISELECT`           | Multi-select `<select>`                        |
| `CHECKBOX`              | `<input type="checkbox">`                      |
| `RADIO`                 | `<input type="radio">` group                   |
| `DATE`                  | `<input type="date">`                          |
| `URL`, `EMAIL`, `COLOR` | `<input>` with matching type                   |
| `CATEGORY_TREE`         | `CategoryTreePicker` (level-by-level browsing) |

Advanced field types (lazy-loaded merchant options, value mapping banners) are covered in [09-step2-channel-data-sources.md](09-step2-channel-data-sources.md).

---

## Integration with Step 1 and Step 3

```
Step 1 → sessionStorage["product_{id}"] = JSON.stringify(masterProduct)
Step 2 → reads sessionStorage → POST /form-schema/channel-step
Step 2 → POST /channel-product-data/save × N stores
Step 3 → GET  /channel-product-data/{id} (all stores' saved data)
Step 3 → POST /channels/publish or /channels/publish/batch
```

---

## Category-Dependent Field Injection (Phase 4)

When the master product's category is set, `ChannelStoreTab` fetches category-specific attributes from the channel:

```
GET /merchant-data/{channel}/{store}/category-attributes?categoryId={masterCategoryId}
→ categoryAttributeSection: { required: [...], optional: [...] }
```

Injected as a violet-highlighted section below the optional fields. Required category attributes are expanded by default; optional are collapsible. If the seller switches the master product's category, stale category fields are cleared before the new set is injected.

---

## Codebase

| File                                                               | Purpose                                             |
|--------------------------------------------------------------------|-----------------------------------------------------|
| `step2-channel-fields/components/wizard/ChannelFieldsWizard.tsx`   | Top-level: tabs + autosave + navigation             |
| `step2-channel-fields/components/wizard/ChannelStoreTab.tsx`       | One store's full form (all sections)                |
| `step2-channel-fields/components/wizard/ChannelFieldInput.tsx`     | Dispatches `fieldType` → input element              |
| `step2-channel-fields/components/wizard/MasterOverrideSection.tsx` | Renders `master_overrides` section                  |
| `step2-channel-fields/components/wizard/MasterOverrideField.tsx`   | Single override field + reset button                |
| `step2-channel-fields/components/wizard/VariantOverridesTable.tsx` | Per-SKU override table                              |
| `step2-channel-fields/types/channelStore.ts`                       | All Step 2 + Step 3 TypeScript types                |
| `step2-channel-fields/services/channelStore.service.ts`            | `ChannelSchemaService`, `ChannelProductDataService` |
