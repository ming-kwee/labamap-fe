# Ecommerce Product v2 — Module Overview

## What This Module Does

`ecommerce-product-v2` is the **complete 3-step omnichannel product creation wizard**.
It handles everything from creating a master product through to publishing it on connected
e-commerce channels (Shopify, Amazon, TikTok, Lazada, etc.).

A **master product** is the canonical product record — channel-agnostic data that serves as the
source of truth for all downstream channel publishing. It is created once in Step 1; subsequent
steps add channel-specific overrides and publish to each store.

```
Step 1 — step1-create/                Step 2 — step2-channel-fields/        Step 3 — step3-publish/
─────────────────────────────         ──────────────────────────────        ───────────────────────
Dynamic form (schema from backend)    One tab per connected store           Preview cards + publish
Category-aware field loading          channel_store_connections             channel_product_data status
Variant dimension detection           + EcommerceMasterAttribute            + credentials
Enhanced validation pipeline            (isChannelField = true)
                                      Master & variant overrides per store  Adaptive pattern matching
             │                                      │                                    │
             ▼                                      ▼                                    ▼
    MasterProductDocument               ChannelProductData × N              sync_channel_product_impl
    (one per product)                   (one per product × store)           (per store, in parallel)
```

**Routes:**

| Step | URL | Component |
|------|-----|-----------|
| Step 1 | `/products/v2/create` | `ProductCreatePage` |
| Step 2 | `/products/{id}/channel-fields` | `ChannelFieldsWizard` |
| Step 3 | `/products/{id}/publish` | `PublishDashboard` |
| Stores | `/channels/stores` | `ChannelStoresDashboard` |
| OAuth | `/channels/oauth/callback` | `ChannelOAuthCallbackPage` |

---

## Key Capabilities

| Capability | Description |
|------------|-------------|
| Dynamic form generation | Backend schema drives what fields appear, their types, options, order, and validation |
| Category-aware loading | Selecting a category triggers a schema refresh that adds category-specific fields |
| Variant dimension detection | SELECT fields with variant-related names auto-become dimension pickers |
| Dual-scope field handling | Fields marked `variantScope: 'dual'` appear at product level, then migrate to each variant row |
| Enhanced backend validation | Full business rule + schema validation before product creation, with violations and score |
| Section collapsing | Schema-driven sections are collapsible cards, ordered by section metadata |
| Image upload | GCP Storage upload with progress tracking, 10 MB limit, XHR-based |

---

## Module Root

```
src/modules/ecommerce-product-v2/
```

### Entry Point

```tsx
// Consumer usage
import { ProductCreatePage } from '@/modules/ecommerce-product-v2';

// In a page
<ProductCreatePage onProductCreated={(product, channels) => {
  // product: MasterProduct
  // channels: string[]
  router.push(`/products/${product.id}/channel-fields`);
}} />
```

`ProductCreatePage` handles auth, org context, loading states, and renders the full form.
It is the **only component you need to import** to add Step 1 to a page.

---

## Documents in This Module

### Step 1 — Create Master Product
| File | What It Covers |
|------|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module structure, layer separation, component hierarchy, design decisions |
| [DYNAMIC-FORM-SYSTEM.md](DYNAMIC-FORM-SYSTEM.md) | How backend-driven form generation works: schema structure, field types, display levels, conditional visibility, sections |
| [HOOKS-REFERENCE.md](HOOKS-REFERENCE.md) | All 6 React hooks — state shape, methods, options, interaction diagrams |
| [COMPONENTS-REFERENCE.md](COMPONENTS-REFERENCE.md) | All UI components — props, rendering logic, section routing, FieldRenderer dispatch |
| [VARIANT-SYSTEM.md](VARIANT-SYSTEM.md) | Variant dimension detection, cartesian product generation, dual-scope fields, enable/disable logic |
| [PRODUCT-SUBMISSION-PIPELINE.md](PRODUCT-SUBMISSION-PIPELINE.md) | generateMasterProduct, BackendContext, enhanced validation, product creation, error handling |
| [SERVICES-AND-TYPES-REFERENCE.md](SERVICES-AND-TYPES-REFERENCE.md) | All 4 services and all TypeScript types/interfaces with field-level explanations |

### Step 2 — Channel Fields
| File | What It Covers |
|------|----------------|
| [STEP2-CHANNEL-FIELDS.md](STEP2-CHANNEL-FIELDS.md) | ChannelFieldsWizard, autosave system, section types, form buckets, services |
| [CHANNEL-STORES.md](CHANNEL-STORES.md) | Store CRUD, ConnectStoreModal, OAuth flow, ChannelTypeBadge |

### Step 3 — Publish
| File | What It Covers |
|------|----------------|
| [STEP3-PUBLISH.md](STEP3-PUBLISH.md) | PublishDashboard, readiness scoring, single/batch publish, JOLT preview, effective value display |

---

## Related Documentation

- [Master-Product-Channel-Specific/ARCHITECTURE.md](../Master-Product-Channel-Specific/ARCHITECTURE.md) — How Step 2 and Step 3 build on what Step 1 creates
- [Master-Product-Channel-Specific/PRODUCT-WIZARD-FLOW.md](../Master-Product-Channel-Specific/PRODUCT-WIZARD-FLOW.md) — End-to-end wizard API contracts
- [dynamic-form/DYNAMIC-FORM-GENERATION-EXPLAINED.md](../dynamic-form/DYNAMIC-FORM-GENERATION-EXPLAINED%20(must%20read).md) — Deep-dive on the backend schema system

---

## Public API

The root `index.ts` exports everything external consumers need. The exports deliberately mirror
the old `ecommerce-product` module names so migration is a one-line import path change.

```ts
// ── Step 1 Components ──────────────────────────────────────────────────────
export { ProductCreatePage }             // Use this in pages
export { ProductCreationPageWrapper }    // Backward-compat alias for ProductCreatePage

// ── Step 2 Components ──────────────────────────────────────────────────────
export { ChannelFieldsWizard }           // Step 2 wizard
export { ChannelStoresDashboard }        // Store management UI
export { ChannelTypeBadge, getChannelMeta }
export { ConnectStoreModal }

// ── Step 3 Components ──────────────────────────────────────────────────────
export { PublishDashboard }              // Step 3 publish UI

// ── Core types (Step 1) ────────────────────────────────────────────────────
export type { MasterProduct, ProductVariant }
export type { FormField, DynamicFormSchema, EnhancedValidationResult }
export type { FieldMapping, AdaptivePatternMatchingResponse }

// ── Channel store types (Step 2 / 3) ──────────────────────────────────────
export type { ChannelType, ChannelStoreConnection, StoreConnectionRequest }
export type { ChannelProductData, ChannelProductStatus, ChannelStepSaveRequest }
export type { StorePublishResult, BatchPublishRequest, BatchPublishResponse }
export type { ChannelFormField, ChannelSchemaPerStore, ChannelStepSchemaResponse }
export type { PublishAnalysisResponse }

// ── Services ───────────────────────────────────────────────────────────────
export { ProductApiService }
export { MediaUploadService }
export { generateFormSchema, refreshFormSchema, createBackendContext }
export { analyzePatternMatching, publishToChannel, getAvailableChannels }
export { ChannelStoreService, ChannelProductDataService, ChannelSchemaService, PublishService }

// ── Compat objects (same interface as old module) ──────────────────────────
export const channelMappingService   // { analyzePatternMatching, publishToChannel, ... }
export const productGenerationService // { generateMasterProduct, transformMasterProductToSourceSchema, ... }

// ── Utils ──────────────────────────────────────────────────────────────────
export { generateMasterProduct, transformMasterProductToSourceSchema, generateMappingRequest }
export { getSectionMetadata, mapUserRole, validateProductCategory }
```
