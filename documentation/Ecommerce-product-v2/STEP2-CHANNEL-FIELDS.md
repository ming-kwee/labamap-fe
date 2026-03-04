# Step 2 — Channel Fields

## What This Step Does

Step 2 lets a seller fill in **channel-specific product data** for every connected store
before publishing. A single master product may be listed on Shopify, Amazon, Lazada and
TikTok simultaneously — each platform has its own required fields, naming conventions and
category structure. Step 2 provides a tabbed form per store so sellers can customise data
without duplicating effort.

```
After Step 1 (master product created)
            │
            ▼
  /products/{masterProductId}/channel-fields
            │
            ├─ Tab: Shopify Store A     ← ChannelSchemaPerStore
            ├─ Tab: Amazon Malaysia     ← ChannelSchemaPerStore
            └─ Tab: TikTok Shop         ← ChannelSchemaPerStore
                        │
                        ├─ required fields   (platform-specific, required=true)
                        ├─ recommended fields
                        ├─ optional fields
                        ├─ master_overrides  (override master product values per channel)
                        └─ variant_overrides (per-SKU overrides in a table)
```

---

## Location

```
src/modules/ecommerce-product-v2/step2-channel-fields/
```

---

## Directory Structure

```
step2-channel-fields/
├── types/
│   └── channelStore.ts          ← All Step 2 + Step 3 TypeScript types
├── services/
│   ├── channelStore.service.ts  ← ChannelStoreService, ChannelProductDataService,
│   │                               ChannelSchemaService, PublishService, mapStore()
│   ├── channelOAuth.service.ts  ← ChannelOAuthService (OAuth initiation + completion)
│   └── index.ts
└── components/
    ├── stores/
    │   ├── ChannelTypeBadge.tsx      ← Color-coded channel type chip + getChannelMeta()
    │   ├── ConnectStoreModal.tsx     ← Add / edit / OAuth store connection modal
    │   └── ChannelStoresDashboard.tsx← Full store management UI (used at /channels/stores)
    ├── wizard/
    │   ├── ChannelFieldInput.tsx     ← Renders one ChannelFormField by fieldType
    │   ├── MasterOverrideField.tsx   ← Override + reset control for master_overrides section
    │   ├── MasterOverrideSection.tsx ← Renders all master_overrides fields in a section card
    │   ├── VariantOverridesTable.tsx ← Per-SKU override table (variant_overrides section)
    │   ├── ChannelStoreTab.tsx       ← One store's full form (all sections)
    │   └── ChannelFieldsWizard.tsx   ← Top-level wizard: tabs + autosave + navigation
    └── index.ts
```

---

## Entry Point

```tsx
import ChannelFieldsWizard from '@/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelFieldsWizard';
// or via the v2 root barrel:
import { ChannelFieldsWizard } from '@/modules/ecommerce-product-v2';

// Usage — page just passes masterProductId from URL params
<ChannelFieldsWizard masterProductId={params.masterProductId} />
```

**Props**

| Prop | Type | Description |
|------|------|-------------|
| `masterProductId` | `string` | ID of the master product created in Step 1 |

The component is self-contained — it fetches its own schema, manages all store tabs, and
handles navigation to Step 3.

---

## Data Flow

### 1. Schema Generation

On mount, `ChannelFieldsWizard` reads the master product's variants from `sessionStorage`
(key: `product_{masterProductId}`, written by Step 1's `ProductCreatePage`), then calls:

```
POST /api/v1/ecommerce/form-schema/channel-step
Body: { masterProductId, organizationId, masterVariants }
```

The backend returns a `ChannelStepSchemaResponse` containing one `ChannelSchemaPerStore`
per connected store. Each schema includes:
- Sections (required / recommended / optional / master_overrides / variant_overrides)
- Per-section `ChannelFormField[]` with `currentValue` pre-populated from saved data
- Per-SKU `VariantOverrideRow[]` for the variant table

### 2. Form State Per Tab

Each tab (`ChannelStoreTab`) maintains three buckets of values locally:

| Bucket | Key | Purpose |
|--------|-----|---------|
| `channelData` | `Record<string, unknown>` | Channel-specific field values |
| `masterOverrides` | `Record<string, unknown>` | Master product field overrides per channel |
| `variantOverrides` | `Record<string, Record<string, unknown>>` | Per-SKU field overrides |

### 3. Autosave

Two triggers flush values to `POST /api/v1/ecommerce/channel-product-data/save`:

| Trigger | Behaviour |
|---------|-----------|
| **Debounced timer** | 30-second idle timer, resets on every keystroke |
| **Tab change** | Immediate save of the active tab before switching |

The save payload (`ChannelStepSaveRequest`) merges all three buckets:

```ts
{
  masterProductId,
  storeId,
  channelType,
  masterOverrides,
  channelData,
  variantOverrides,
}
```

### 4. Completion Tracking

After every save, the backend returns updated completion statistics. The wizard shows a
colour-coded status dot per tab:

| Status | Meaning |
|--------|---------|
| `Empty` (grey) | No data entered yet |
| `Partial` (amber) | Some required fields filled |
| `Complete` (green) | All required fields filled |
| `Published` (green) | Store has been published |
| `Error` (red) | Previous publish failed |

---

## Form Sections

| `sectionName` | Rendered by | Description |
|--------------|-------------|-------------|
| `required` | `ChannelStoreTab` → `ChannelFieldInput` | Platform-required fields |
| `recommended` | `ChannelStoreTab` → `ChannelFieldInput` | Optional but recommended |
| `optional` | `ChannelStoreTab` → `ChannelFieldInput` | Supplementary fields |
| `master_overrides` | `MasterOverrideSection` | Override master product values for this channel |
| `variant_overrides` | `VariantOverridesTable` | Per-SKU overrides in a table layout |

---

## Field Input Component

`ChannelFieldInput` dispatches to the correct HTML element by `fieldType`:

| `ChannelFieldType` | Input rendered |
|--------------------|---------------|
| `TEXT` | `<input type="text">` |
| `TEXTAREA` | `<textarea>` |
| `NUMBER` | `<input type="number">` |
| `SELECT` | `<select>` (single) |
| `MULTISELECT` | Multi-select `<select>` |
| `CHECKBOX` | `<input type="checkbox">` |
| `RADIO` | `<input type="radio">` group |
| `DATE` | `<input type="date">` |
| `URL` | `<input type="url">` |
| `EMAIL` | `<input type="email">` |
| `COLOR` | `<input type="color">` |

---

## Master Overrides

The `master_overrides` section shows fields from the master product that the backend has
marked as channel-overridable (`isChannelOverridable: true`). Each field displays:
- The current master product value
- An editable input to override it for this channel only
- A "Reset to master" button that clears the override

---

## Variant Override Table

When a master product has variants, the `variant_overrides` section renders a table with:
- One **row per SKU**
- One **column per overridable field** (e.g. price, stock, channelSku)
- Inline editing; changes written to `variantOverrides[sku][fieldName]`

---

## Navigation

| Action | Destination |
|--------|-------------|
| Back button | `/products/{masterProductId}/channel-fields` (re-renders) |
| "Next: Publish" button | `/products/{masterProductId}/publish` (Step 3) |

Before navigating forward, the wizard flushes unsaved changes for the currently active tab.

---

## Services

### `ChannelStoreService`

Store connection CRUD — all calls require `organizationId`.

```ts
import { ChannelStoreService } from '@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service';
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `listStores(orgId)` | `GET /channel-stores?organizationId=` | List connected stores |
| `getStore(storeId, orgId)` | `GET /channel-stores/{storeId}` | Get single store |
| `connectStore(req, orgId)` | `POST /channel-stores` | Register a new store |
| `updateStore(storeId, req, orgId)` | `PUT /channel-stores/{storeId}` | Update credentials / settings |
| `deactivateStore(storeId, orgId)` | `PATCH /channel-stores/{storeId}/deactivate` | Soft-disable |
| `reactivateStore(storeId, orgId)` | `PATCH /channel-stores/{storeId}/reactivate` | Re-enable |
| `deleteStore(storeId, orgId)` | `DELETE /channel-stores/{storeId}` | Hard delete |
| `updateDisplayOrder(storeId, n, orgId)` | `PATCH /channel-stores/{storeId}/display-order` | Reorder |

### `ChannelProductDataService`

Channel product data persistence.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAllStoreData(masterProductId, orgId)` | `GET /channel-product-data/{masterProductId}` | All stores' saved data |
| `getStoreData(masterProductId, storeId, orgId)` | `GET /channel-product-data/{masterProductId}/{storeId}` | Single store |
| `saveChannelData(req)` | `POST /channel-product-data/save` | Save / upsert one store's form values |
| `getCompletionSummary(masterProductId, orgId)` | `GET /channel-product-data/{masterProductId}/completion` | Completion stats |

### `ChannelSchemaService`

Step 2 schema generation.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `generateChannelStepSchema(req)` | `POST /ecommerce/form-schema/channel-step` | Generate per-store field schemas |

### `ChannelOAuthService`

OAuth store connection flow.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `initiateOAuth(channelType, params)` | `POST /channel-stores/oauth/initiate` | Get redirect URL |
| `completeOAuth(channelType, params)` | `POST /channel-stores/oauth/complete` | Exchange code → store record |

The OAuth redirect lands at `/channels/oauth/callback`, which calls `completeOAuth` and
then redirects to `/channels/stores`.

---

## Types Reference

```ts
import type {
  // Connection
  ChannelType,
  ChannelStoreConnection,
  StoreConnectionRequest,
  // Product data
  ChannelProductData,
  ChannelProductStatus,
  ChannelStepSaveRequest,
  // Completion
  StoreCompletionEntry,
  CompletionSummaryResponse,
  // Schema
  ChannelFormField,
  ChannelFieldType,
  ChannelFormSection,
  ChannelSchemaPerStore,
  ChannelStepSchemaResponse,
  ChannelStepRequest,
  // Publish (also used in Step 3)
  PublishSingleRequest,
  StorePublishResult,
  BatchPublishRequest,
  BatchPublishResponse,
  PublishAnalysisResponse,
} from '@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore';
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Schema generated server-side | Backend knows which channel requires which fields; avoids hard-coding channel logic in the frontend |
| sessionStorage for master variants | Avoids an extra API round-trip; Step 1 wrote the full product to sessionStorage on creation |
| Debounced autosave (30s) | Prevents API spam on fast typists; immediate save on tab switch prevents data loss |
| Three separate value buckets | Mirrors the backend's storage model: `channelData` (channel-specific), `masterOverrides` (shared master overrides), `variantOverrides` (per-SKU) |
| `ORGANIZATION_ID` hardcoded | Placeholder — wire from auth context/session in production |

---

## Integration with Step 1 and Step 3

```
Step 1 writes:   sessionStorage["product_{id}"] = JSON.stringify(masterProduct)
Step 2 reads:    sessionStorage["product_{id}"]  → extracts variants for schema call
Step 2 saves:    POST /channel-product-data/save  × N stores
Step 3 reads:    GET  /channel-product-data/{id}  → all stores' saved data
Step 3 publishes: POST /channels/publish           (single) or
                  POST /channels/publish/batch     (all stores)
```
