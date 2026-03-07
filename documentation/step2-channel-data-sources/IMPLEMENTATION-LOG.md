# Step 2 Channel Data Sources — Implementation Log

## Phase 1 — Scenario A: Merchant-Sourced Options

**Date:** 2026-03-07
**Status:** Frontend complete. Backend pending.

---

### What was implemented

Phase 1 covers Scenario A from the planning document: SELECT/MULTISELECT fields whose
valid options come from the merchant's live account (warehouses, shipping templates, etc.)
rather than from a static config.

Two delivery modes are supported:

| Mode | When used | Frontend work |
|------|-----------|---------------|
| Eager embed | Small stable lists (< 50 items). Backend fetches from channel API during schema generation and fills `options[]`. | None — field renders normally. |
| Lazy load | Large or volatile lists. Backend leaves `options[]` empty and sets `optionsEndpoint`. | Fetch on mount, spinner skeleton, error state. |

---

### Files changed

#### `src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts`

- Added `optionsSource?: "STATIC" | "MERCHANT_API"` to `ChannelFormField`
- Added `optionsEndpoint?: string` to `ChannelFormField`
  Pre-built by the backend as the full relative URL:
  `/merchant-data/{channelType}/{storeId}/field-options?fieldName=...&organizationId=...`
- Added `"merchant_data"` to `SectionName` union type
  Groups account-specific fields (warehouses, shipping templates) separately from product fields.

#### `src/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service.ts`

- Added `MerchantDataService.fetchFieldOptions(channelType, storeId, fieldName, organizationId)`
  Hits `GET /api/v1/merchant-data/{channelType}/{storeId}/field-options`.
  For imperative use (e.g. a refresh button). Components use `optionsEndpoint` directly.

#### `src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelFieldInput.tsx`

- Added `useMerchantOptions(field)` hook (called unconditionally at component top level):
  - If `optionsSource !== "MERCHANT_API"` or `optionsEndpoint` is absent, or `options[]` is
    already populated → returns `field.options` immediately, no fetch, zero overhead.
  - Otherwise → fetches `BASE + field.optionsEndpoint` once on mount.
- Added `<OptionsSkeleton>` — spinner + "Loading {label} options…" shown during fetch.
- Added `<OptionsError>` — red banner with error message if fetch fails.
- `SELECT` and `MULTISELECT` cases now use `options` from the hook instead of `field.options`
  directly, so lazy-loaded options render identically to eager-embedded ones.

#### `src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelStoreTab.tsx`

- Added `merchant_data` branch in `renderSection()`.
- Rendered with a blue-tinted header (distinct from the gray used by other sections).
- Header shows "Sourced from your {channelType} account" label so sellers understand
  these fields are tied to their account, not the product definition.
- Fields inside still use `FieldRow` + `ChannelFieldInput` — fully consistent with other sections.

---

### Backend contract (what backend must implement)

For eager embed:
```
EcommerceMasterAttributeDocument:
  optionsSource: "MERCHANT_API"
  merchantApiOperation: "GetWarehouses"   // channel-specific operation name
```

`ChannelStepSchemaService` calls `ChannelMerchantDataService.fetchOptions(storeId, fieldName, orgId)`
and fills `ChannelFormField.options[]` before returning the schema. Frontend sees a normal
options array and needs no special handling.

For lazy load (large lists):
```
ChannelFormField in schema response:
  optionsSource: "MERCHANT_API"
  optionsEndpoint: "/merchant-data/shopify/store-abc/field-options?fieldName=location_id&organizationId=org_123"
  options: []   // empty — frontend fetches
```

New endpoint required:
```
GET /api/v1/merchant-data/{channelType}/{storeId}/field-options
    ?fieldName=...&organizationId=...
Response: { "fieldName": "location_id", "options": [{ "value": "...", "label": "..." }] }
```

New section in schema response (for account-specific fields):
```
{
  "sectionName": "merchant_data",
  "label": "Account Settings",
  "priority": 10,
  "fields": [ ... ]
}
```

---

### How the lazy-load flow works end-to-end

```
1. Schema response arrives → ChannelFieldsWizard initialises storeValues
2. ChannelStoreTab renders sections → reaches merchant_data section
3. For each field: ChannelFieldInput mounts
4. useMerchantOptions detects optionsSource=MERCHANT_API + empty options[]
5. Spinner shown immediately ("Loading Fulfillment Location options…")
6. fetch(BASE + optionsEndpoint) fires
7. Response arrives → setOptions(data.options) → spinner replaced by SELECT/MULTISELECT
8. User picks a value → onChange fires normally → autosave as usual
```

---

### Phases not yet implemented

| Phase | Scenario | Status |
|-------|----------|--------|
| 2 | Master-to-channel value mapping (B) | Not started |
| 3 | Hierarchical category tree (C) | Not started |
| 4 | Category-dependent field injection (D) | Not started |
| 5 | Cross-field conditional dependencies (E) | Not started |
| 6 | Multi-language content (F) | Not started |
| 7 | Currency conversion (G) | Not started |
| 8 | Media compliance (H) | Not started |
| 9 | Cross-store value inheritance (I) | Not started |
| 10 | Channel-specific keyword structure (J) | Not started |
| 11 | Computed/derived fields (K) | Not started |
