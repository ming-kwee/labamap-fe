# Ecommerce Product Wizard — Module Overview

## What This Module Does

`ecommerce-product-v2` is the complete 3-step omnichannel product creation wizard. It handles everything from creating a master product through to publishing on connected channels (Shopify, Amazon, TikTok, Lazada, etc.).

A **master product** is the canonical product record — channel-agnostic data that serves as the source of truth for all downstream channel publishing. It is created once in Step 1; subsequent steps add channel-specific overrides and publish to each store.

```
Step 1 — step1-create/             Step 2 — step2-channel-fields/       Step 3 — step3-publish/
───────────────────────────        ─────────────────────────────        ─────────────────────
Dynamic form (schema-driven)       One tab per connected store           Preview cards + publish
Category-aware field loading       channel_store_connections             channel_product_data status
Variant dimension detection        + EcommerceMasterAttribute            + credentials
Enhanced validation pipeline         (isChannelField = true)
              │                    Master & variant overrides            Adaptive pattern matching
              ▼                              │                                    │
    MasterProductDocument          ChannelProductData × N             sync_channel_product_impl
    (one per product)              (one per product × store)          (per store, in parallel)
```

---

## Routes

|                | URL                             | Component                  |
|----------------|---------------------------------|----------------------------|
| Step 1         | `/products/v2/create`           | `ProductCreatePage`        |
| Step 2         | `/products/{id}/channel-fields` | `ChannelFieldsWizard`      |
| Step 3         | `/products/{id}/publish`        | `PublishDashboard`         |
| Stores         | `/channels/stores`              | `ChannelStoresDashboard`   |
| OAuth callback | `/channels/oauth/callback`      | `ChannelOAuthCallbackPage` |

---

## Module Directory

```
src/modules/ecommerce-product-v2/
│
├── index.ts                          ← Public barrel: all exports + backward-compat aliases
│
├── types/
│   ├── product.ts                    ← MasterProduct, ProductVariant, ChannelMapping
│   ├── form-schema.ts                ← FormField, DynamicFormSchema, EnhancedValidationResult
│   ├── channel-mapping.ts            ← FieldMapping, AdaptivePatternMatchingRequest/Response
│   └── index.ts
│
├── services/
│   ├── schema-api.service.ts         ← generateFormSchema, refreshFormSchema, BackendContext
│   ├── product-api.service.ts        ← ProductApiService.createProduct, .validateProductEnhanced
│   ├── media-upload.service.ts       ← MediaUploadService.uploadImage (XHR with progress)
│   ├── pattern-matching.service.ts   ← analyzePatternMatching, publishToChannel, previewJolt
│   └── index.ts
│
├── utils/
│   ├── form-utils.ts                 ← normalizeSectionKey, groupFieldsBySection, getSectionMetadata
│   ├── product-mapper.ts             ← generateMasterProduct, transformMasterProductToSourceSchema
│   ├── variant-scope.ts              ← classifyFieldsByScope, onVariantsEnabled, onVariantsDisabled
│   └── index.ts
│
├── step1-create/
│   ├── hooks/
│   │   ├── useFormSchema.ts          ← schema load + category cache + in-flight dedup
│   │   ├── useFormState.ts           ← formData + viewLevel + expandedSections
│   │   ├── useFieldHandler.ts        ← handleFieldChange + category side effects
│   │   ├── useFieldVisibility.ts     ← getVisibleFields (variantScope + conditions)
│   │   ├── useFieldValidation.ts     ← validateField on blur (required, min, max, pattern)
│   │   └── useProductSubmit.ts       ← validate → create pipeline
│   └── components/
│       ├── ProductCreatePage.tsx     ← Auth/org gate + entry point
│       ├── ProductCreateForm.tsx     ← Orchestrator: wires 6 hooks, computes sections
│       ├── FieldRenderer.tsx         ← Dispatches fieldType → correct input element
│       ├── CategorySelectField.tsx   ← Live category tree combobox
│       ├── ImageUploadField.tsx      ← Drag-drop + XHR upload with progress
│       ├── ValidationSummary.tsx     ← EnhancedValidationResult display
│       ├── VariantConfigurator.tsx   ← Dimension pickers + SKU matrix
│       ├── SkuMatrixPreview.tsx      ← Grid visualization
│       └── sections/
│           ├── BasicInfoSection.tsx
│           ├── PricingSection.tsx
│           ├── MediaSection.tsx
│           ├── ShippingSection.tsx
│           └── VariantsSection.tsx   ← hasVariants toggle + VariantConfigurator
│
├── step2-channel-fields/
│   ├── types/channelStore.ts         ← All Step 2 + Step 3 TypeScript types
│   ├── services/
│   │   ├── channelStore.service.ts   ← ChannelStoreService, ChannelProductDataService, mapStore
│   │   └── channelOAuth.service.ts   ← ChannelOAuthService
│   └── components/
│       ├── stores/                   ← ChannelTypeBadge, ConnectStoreModal, ChannelStoresDashboard
│       └── wizard/                   ← ChannelFieldInput, MasterOverrideSection, VariantOverridesTable,
│                                       ChannelStoreTab, ChannelFieldsWizard
│
└── step3-publish/
    └── components/
        └── PublishDashboard.tsx
```

---

## Layer Separation

The module enforces strict layer boundaries:

```
types/          ← no dependencies (TypeScript interfaces only)
services/       ← depends on types only; no React, no state
utils/          ← depends on types only; pure transforms, no API calls
step1-create/hooks/    ← depends on services + utils; React but no UI
step1-create/components/ ← depends on hooks + utils; UI only
```

Breaking this order (e.g., a component importing directly from another component's hook) is a bug.

---

## Data Handoff Between Steps

```
Step 1 creates product → writes sessionStorage["product_{masterProductId}"] = JSON.stringify(masterProduct)

Step 2 reads sessionStorage on mount → uses masterProduct.variants for channel schema generation
Step 2 autosaves → POST /channel-product-data/save × N stores
Step 2 completes → navigates to Step 3

Step 3 reads sessionStorage for master product fields
Step 3 loads channel data → GET /channel-product-data/{masterProductId}
Step 3 publishes → POST /channels/publish (single) or /channels/publish/batch (all)
```

The `sessionStorage` key `product_{masterProductId}` is the bridge between all three steps. The value is written once by Step 1 and read by Steps 2 and 3 — no extra API round-trip needed.

---

## Key Capabilities

| Capability                  | Description                                                                           |
|-----------------------------|---------------------------------------------------------------------------------------|
| Dynamic form generation     | Backend schema drives all fields — label, type, options, validation, order            |
| Category-aware loading      | Category selection triggers schema refresh; category-specific fields appear           |
| Variant dimension detection | SELECT fields with `variantScope: variant_only` become SKU matrix axes                |
| Dual-scope fields           | `variantScope: dual` fields appear at product level, then migrate to each variant row |
| Enhanced backend validation | Full business rule + schema validation before product creation                        |
| Progressive disclosure      | `displayLevel` controls which fields appear: essential → standard → full              |
| Per-channel overrides       | Each connected store has its own field values and per-SKU overrides                   |
| Adaptive publish            | AI-assisted field mapping from master schema to channel schema                        |

---

## ORGANIZATION_ID Placeholder

All wizard components hardcode `ORGANIZATION_ID = "org_123"`. Wire from the authenticated session context before going to production:

- `ChannelStoresDashboard.tsx` line 8
- `ChannelFieldsWizard.tsx` line 13
- `PublishDashboard.tsx`
