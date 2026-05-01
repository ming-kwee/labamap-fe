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

---

## Phase 2 — Scenario B: Master-to-Channel Value Mapping

**Date:** 2026-03-07
**Status:** Frontend complete. Backend pending.

---

### What was implemented

Phase 2 covers Scenario B: SELECT/MULTISELECT fields where the master product already has
a value (e.g. `material: "cotton"`) but the channel requires a platform-specific taxonomy
code (e.g. Lazada `bahan: "LZ_MAT_001"`). The backend resolves the translation via a
`channel_field_value_mappings` collection and attaches a `masterMappedSuggestion` to the
schema response. The frontend renders a one-click "Accept" banner.

---

### Files changed

#### `src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts`

- Added `"MASTER_MAPPED"` to the `optionsSource` union:
  `"STATIC" | "MERCHANT_API" | "MASTER_MAPPED"`
- Added `masterMappedSuggestion?: MasterMappedSuggestion` to `ChannelFormField`
- Added new exported interface `MasterMappedSuggestion`:
  ```typescript
  interface MasterMappedSuggestion {
    masterField:    string;
    masterValue:    unknown;
    suggestedValue: unknown;
    suggestedLabel: string;
    confidence: "EXACT" | "FUZZY" | "NONE";
  }
  ```

#### `src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelFieldInput.tsx`

- Added `MappingSuggestionBanner` component handling all three confidence states:
  - **EXACT** — blue-tinted banner; [Accept] [Pick different] buttons; Accept calls `onChange`
    immediately with `suggestedValue` and hides the banner.
  - **FUZZY** — amber-tinted banner; same buttons; includes "verify before accepting" warning.
  - **NONE** — amber warning-only banner; no buttons; persists so seller knows to pick manually.
- Added local `suggestionDismissed` state — "Pick different" collapses the banner for
  EXACT/FUZZY; NONE warning is always shown.
- `MasterMappedSuggestion` type now imported from `../../types/channelStore`.
- All existing field types (SELECT, TEXT, etc.) are fully unaffected when
  `masterMappedSuggestion` is absent.

---

### Backend contract (what backend must implement)

See `BACKEND-PHASE2-RECOMMENDATION.md` for the full spec. In summary:

**New collection:** `channel_field_value_mappings`

```json
{
  "channelType": "lazada",
  "masterFieldName": "material",
  "channelFieldName": "bahan",
  "mappings": [
    { "masterValue": "cotton", "channelValue": "LZ_MAT_001", "channelLabel": "Cotton" }
  ],
  "fallbackStrategy": "PROMPT_USER"
}
```

**New DTO field on `ChannelFormField`:**

```json
{
  "optionsSource": "MASTER_MAPPED",
  "masterMappedSuggestion": {
    "masterField": "material",
    "masterValue": "cotton",
    "suggestedValue": "LZ_MAT_001",
    "suggestedLabel": "Cotton",
    "confidence": "EXACT"
  }
}
```

**New `masterFieldName` on `EcommerceMasterAttributeDocument`** — links a channel field
to its corresponding master field so the schema service can look up the master value.

**New service:** `ChannelValueMappingService.resolveSuggestion(channelType, masterField, masterValue, channelField)` — exact match first, Levenshtein fuzzy fallback, NONE if no mapping found.

---

---

## Phase 3 — Scenario C: Hierarchical Category Tree Selection

**Date:** 2026-03-07
**Status:** Frontend complete. Backend pending.

---

### What was implemented

Phase 3 covers Scenario C: category fields on platforms like Lazada, TikTok Shop, and Shopee
are deep trees (3–6 levels, up to 50 000 nodes). Embedding the full tree in the schema response
is impossible; selection is stateful (each level loads based on the previous pick). A dedicated
`CATEGORY_TREE` field type with a level-by-level picker component handles this correctly.

---

### Files changed

#### `src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts`

- Added `"CATEGORY_TREE"` to `ChannelFieldType` union
- Added `CategoryTreeNode` interface: `{ id, name, hasChildren }`
- Added `CategoryTreeConfig` interface:
  - `rootEndpoint: string` — relative path for top-level nodes (no parentId)
  - `childEndpoint: string` — template with `{parentId}` placeholder for drilling down
  - `maxDepth: number` — maximum depth of the channel's tree
  - `requireLeafNode: boolean` — if true, only leaf nodes can be committed
  - `selectedPath?: CategoryTreeNode[]` — pre-populated breadcrumb for currently saved value
- Added `categoryTreeConfig?: CategoryTreeConfig` to `ChannelFormField`

#### `src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/CategoryTreePicker.tsx` _(new file)_

Self-contained picker component for `CATEGORY_TREE` fields:
- **Collapsed view**: breadcrumb of committed selection (from `selectedPath` or built as user picks) + [Browse] / [Change] button
- **Open panel**: breadcrumb nav bar (clickable to go back), scrollable level list, loading spinner, error state, [Cancel] footer
- **Drilling down**: clicking a node with `hasChildren=true` fetches and shows its children; clicking a leaf commits the selection and closes the panel
- **Suggestion banner** (Phase 2 integration): when `masterMappedSuggestion.confidence === "EXACT"` and no value is committed, shows a "Suggested category" banner with [Accept] / [Browse] buttons; Accept fires `onChange` immediately without opening the picker
- Fetches levels via `fetch(BASE + config.rootEndpoint)` and `fetch(BASE + config.childEndpoint.replace("{parentId}", ...))`
- All state is local; no external hook needed

#### `src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelFieldInput.tsx`

- Imported `CategoryTreePicker`
- Added early return before banner/switch logic:
  ```tsx
  if (field.fieldType === "CATEGORY_TREE") {
    return <CategoryTreePicker field={field} value={value} onChange={onChange} disabled={disabled} />;
  }
  ```
  `CategoryTreePicker` manages its own suggestion banner internally, so the generic Phase 2 banner is not applied.

---

### Backend contract (what backend must implement)

See `BACKEND-PHASE3-RECOMMENDATION.md` for the full spec. In summary:

**New field type in schema:**
```json
{
  "fieldName": "primary_category_id",
  "fieldType": "CATEGORY_TREE",
  "required": true,
  "currentValue": "10001234",
  "categoryTreeConfig": {
    "rootEndpoint": "/merchant-data/lazada/{storeId}/categories?organizationId=org_123",
    "childEndpoint": "/merchant-data/lazada/{storeId}/categories?parentId={parentId}&organizationId=org_123",
    "maxDepth": 5,
    "requireLeafNode": true,
    "selectedPath": [
      { "id": "1000", "name": "Electronics", "hasChildren": true },
      { "id": "10001234", "name": "Android Phones", "hasChildren": false }
    ]
  }
}
```

**New endpoint (root + children, same path):**
```
GET /api/v1/merchant-data/{channelType}/{storeId}/categories
    ?organizationId=...             ← root level
    ?parentId=...&organizationId=... ← children
Response: [{ "id": "...", "name": "...", "hasChildren": true }]
```

**New collection:** `channel_category_cache` — one document per node, TTL 24 h, indexed by `(channelType, storeId, parentId)` for fast child lookups.

**New service:** `ChannelCategoryService` — per-channel implementations (Lazada, TikTok, Shopee) stub first, then live API.

**Scheduled job:** `CategorySyncJob` — full-tree warm-up daily at 02:00, writes to `channel_category_cache`.

---

---

## Phase 4 — Scenario D: Category-Dependent Dynamic Field Injection

**Date:** 2026-03-07
**Status:** Frontend complete. Backend pending.

---

### What was implemented

Phase 4 covers Scenario D: after the seller selects a leaf category (Phase 3), the
channel returns a different set of required/optional fields depending on that exact
category. These fields are not in the static schema — they are fetched dynamically and
injected as a new "Category-specific fields" section rendered in violet.

---

### Files changed

#### `src/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore.ts`

- Added `categoryId?: string` to `ChannelStepSaveRequest` — backend uses this to
  validate category-specific required fields when computing `completionPercentage`
- Added `CategoryAttributeSection` interface:
  ```typescript
  interface CategoryAttributeSection {
    categoryId:     string;
    categoryName:   string;
    categoryPath:   string[];          // breadcrumb labels
    requiredFields: ChannelFormField[];
    optionalFields: ChannelFormField[];
  }
  ```
- Added `categoryAttributeSection?: CategoryAttributeSection` to `ChannelSchemaPerStore` —
  pre-fetched by backend when a category is already saved; avoids extra round-trip on load

#### `src/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelStoreTab.tsx`

- Added `useEffect`, `useRef` to React imports; added `CategoryAttributeSection`, `ChannelFormField` to type imports; added `BASE` constant
- **`mainCategoryField`** — computed at render time by scanning all sections for the first `CATEGORY_TREE` field
- **`categoryId`** — derived from `values.channelData[mainCategoryField.fieldName]`
- **Category attrs state**: `categoryAttrs` (initialised from `schema.categoryAttributeSection`), `catAttrsLoading`, `catAttrsError`, `catOptionalExpanded`
- **`lastFetchedCategoryId` ref** — prevents re-fetching when re-renders occur without a category change; initialised from `schema.categoryAttributeSection?.categoryId`
- **`useEffect`** — when `categoryId` changes: fetches `GET /merchant-data/{channelType}/{storeId}/category-attributes?categoryId=...&organizationId=org_123`; skips fetch if data is already current
- **`handleFieldChange`** — extended: when the `CATEGORY_TREE` field changes, removes all stale category-specific field keys from `channelData` before calling `onChange`
- **`renderCategoryAttributeSection()`** — renders:
  - Loading spinner (violet-tinted) while fetching
  - Error banner if fetch fails
  - Section header (violet) with `categoryName` + breadcrumb path
  - Required category fields grid (always expanded)
  - Optional category fields (collapsible, own `catOptionalExpanded` state)
  - Uses same `FieldRow` + `ChannelFieldInput` as all other sections

---

### Backend contract (what backend must implement)

See `BACKEND-PHASE4-RECOMMENDATION.md` for the full spec. In summary:

**New endpoint:**
```
GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes
    ?categoryId={leafId}&organizationId=...
Response: {
  "categoryId": "10001234",
  "categoryName": "Smartphones",
  "categoryPath": ["Electronics", "Mobile Phones", "Smartphones"],
  "requiredFields": [ ChannelFormField ],
  "optionalFields": [ ChannelFormField ]
}
```

**Schema pre-fetch:** `ChannelStepSchemaService` fetches attrs for the saved category and
embeds in `ChannelSchemaPerStore.categoryAttributeSection`.

**Save validation:** Accept `categoryId` in `ChannelStepSaveRequest`; include category-specific
required fields in `completionPercentage` calculation.

**New service method:** `ChannelCategoryService.fetchCategoryAttributes(storeId, categoryId, organizationId)` on all channel implementations.

---

### Phases not yet implemented

| Phase | Scenario | Status |
|-------|----------|--------|
| 3 | Hierarchical category tree (C) | Frontend complete — backend pending |
| 4 | Category-dependent field injection (D) | Frontend complete — backend pending |
| 5 | Cross-field conditional dependencies (E) | Not started |
| 6 | Multi-language content (F) | Not started |
| 7 | Currency conversion (G) | Not started |
| 8 | Media compliance (H) | Not started |
| 9 | Cross-store value inheritance (I) | Not started |
| 10 | Channel-specific keyword structure (J) | Not started |
| 11 | Computed/derived fields (K) | Not started |
