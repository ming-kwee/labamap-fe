# Ecommerce Product v2 — Module Overview

## What This Module Does

`ecommerce-product-v2` is the **Step 1 implementation** of the omnichannel product creation
wizard. It handles everything required to create a master product: loading a backend-generated
dynamic form, rendering it to the user, validating input, and submitting the product to the API.

A **master product** is the canonical product record — channel-agnostic data that serves as the
source of truth for all downstream channel publishing. It is created once in Step 1; subsequent
steps (channel-specific fields, publish) derive from it.

```
Step 1 — ecommerce-product-v2          Step 2 — channel-platform             Step 3 — channel-platform
─────────────────────────────          ──────────────────────────            ─────────────────────────
Dynamic form (schema from backend)     One tab per connected store           Preview cards + publish
Category-aware field loading           channel_store_connections             channel_product_data status
Variant dimension detection            + channel_configurations              + credentials
Enhanced validation pipeline           + EcommerceMasterAttribute
                                         (isChannelField = true)
             │                                      │                                    │
             ▼                                      ▼                                    ▼
    MasterProductDocument               ChannelProductData × N              sync_channel_product_impl
    (one per product)                   (one per product × store)           (per store, in parallel)
```

This module only covers **Step 1**. It does not know about stores, channels, or publishing.

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

| File | What It Covers |
|------|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module structure, layer separation, component hierarchy, design decisions |
| [DYNAMIC-FORM-SYSTEM.md](DYNAMIC-FORM-SYSTEM.md) | How backend-driven form generation works: schema structure, field types, display levels, conditional visibility, sections |
| [HOOKS-REFERENCE.md](HOOKS-REFERENCE.md) | All 6 React hooks — state shape, methods, options, interaction diagrams |
| [COMPONENTS-REFERENCE.md](COMPONENTS-REFERENCE.md) | All UI components — props, rendering logic, section routing, FieldRenderer dispatch |
| [VARIANT-SYSTEM.md](VARIANT-SYSTEM.md) | Variant dimension detection, cartesian product generation, dual-scope fields, enable/disable logic |
| [PRODUCT-SUBMISSION-PIPELINE.md](PRODUCT-SUBMISSION-PIPELINE.md) | generateMasterProduct, BackendContext, enhanced validation, product creation, error handling |
| [SERVICES-AND-TYPES-REFERENCE.md](SERVICES-AND-TYPES-REFERENCE.md) | All 4 services and all TypeScript types/interfaces with field-level explanations |

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
// Components
export { ProductCreatePage }             // Use this in pages
export { ProductCreationPageWrapper }    // Backward-compat alias for ProductCreatePage

// Core types
export type { MasterProduct, ProductVariant }
export type { FormField, DynamicFormSchema, EnhancedValidationResult }
export type { FieldMapping, AdaptivePatternMatchingResponse }

// Services
export { ProductApiService }
export { MediaUploadService }
export { generateFormSchema, refreshFormSchema, createBackendContext }
export { analyzePatternMatching, publishToChannel, getAvailableChannels }

// Compat objects (same interface as old module)
export const channelMappingService   // { analyzePatternMatching, publishToChannel, ... }
export const productGenerationService // { generateMasterProduct, transformMasterProductToSourceSchema, ... }

// Utils
export { generateMasterProduct, transformMasterProductToSourceSchema, generateMappingRequest }
export { getSectionMetadata, mapUserRole, validateProductCategory }
```
