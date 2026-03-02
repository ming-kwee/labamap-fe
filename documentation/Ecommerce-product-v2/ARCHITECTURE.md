# Architecture — Ecommerce Product v2

## Module Layout

```
src/modules/ecommerce-product-v2/
│
├── index.ts                        ← Public API: all exports with backward-compat aliases
│
├── types/                          ← TypeScript interfaces, no runtime logic
│   ├── product.ts                  ← MasterProduct, ProductVariant, ChannelMapping
│   ├── form-schema.ts              ← FormField, DynamicFormSchema, EnhancedValidationResult
│   ├── channel-mapping.ts          ← FieldMapping, AdaptivePatternMatchingRequest/Response
│   └── index.ts
│
├── services/                       ← API calls only, no React, no state
│   ├── schema-api.service.ts       ← generateFormSchema, refreshFormSchema, createBackendContext
│   ├── product-api.service.ts      ← ProductApiService.createProduct, .validateProductEnhanced
│   ├── media-upload.service.ts     ← MediaUploadService.uploadImage (XHR with progress)
│   ├── pattern-matching.service.ts ← analyzePatternMatching, publishToChannel (standalone fns)
│   └── index.ts
│
├── utils/                          ← Pure transforms, no API calls, no React
│   ├── form-utils.ts               ← normalizeSectionKey, groupFieldsBySection, getSectionMetadata
│   ├── product-mapper.ts           ← generateMasterProduct, transformMasterProductToSourceSchema
│   ├── variant-scope.ts            ← classifyFieldsByScope, onVariantsEnabled, onVariantsDisabled
│   └── index.ts
│
└── step1-create/                   ← All Step 1 UI: hooks + components scoped to this step
    ├── index.ts
    ├── hooks/
    │   ├── useFormSchema.ts        ← Schema fetch + category caching + in-flight dedup
    │   ├── useFormState.ts         ← formData + expandedSections + showJsonPreview
    │   ├── useFieldHandler.ts      ← handleFieldChange with category/hasVariants special logic
    │   ├── useFieldVisibility.ts   ← isFieldVisible + getVisibleFields (variantScope + conditions)
    │   ├── useFieldValidation.ts   ← validateField (required, min/max, pattern, email, url)
    │   ├── useProductSubmit.ts     ← validate → create pipeline
    │   └── index.ts
    └── components/
        ├── ProductCreatePage.tsx   ← Auth/org gate → renders org info bar + ProductCreateForm
        ├── ProductCreateForm.tsx   ← Orchestrator: wires 6 hooks, computes sections, routes rendering
        ├── FieldRenderer.tsx       ← Dispatches fieldType → correct input element
        ├── ImageUploadField.tsx    ← Drag-drop + XHR upload with progress
        ├── ValidationSummary.tsx   ← Renders EnhancedValidationResult (violations, warnings, score)
        ├── VariantConfigurator.tsx ← Dynamic variant dimension picker + variant table
        ├── VariantMultiImageUpload.tsx  ← Per-variant image upload (compact grid)
        ├── index.ts
        └── sections/
            ├── BasicInfoSection.tsx   ← Generic collapsible section (name, description, brand...)
            ├── PricingSection.tsx     ← Generic collapsible section (price, cost, compareAt...)
            ├── MediaSection.tsx       ← Generic collapsible section (mainImage, gallery...)
            ├── ShippingSection.tsx    ← Generic collapsible section (weight, dimensions...)
            └── VariantsSection.tsx    ← Special section: hasVariants toggle + VariantConfigurator
```

---

## Layer Separation

The module is organized in strict layers. Each layer may only depend on layers above it in the list:

```
types/           ← No dependencies (pure interfaces)
    ↑
services/        ← Depend on types only (fetch + API logic)
    ↑
utils/           ← Depend on types + services (pure transforms)
    ↑
hooks/           ← Depend on types + services + utils (React state)
    ↑
components/      ← Depend on all layers (React UI)
```

**This means:**
- Services never import from utils or hooks
- Utils never import from hooks or components
- Hooks never import from components
- Components can import anything they need

---

## Component Hierarchy

```
ProductCreatePage
    │   (reads: useAuth, useOrganization)
    │   (renders: OrgInfoBar, ProductCreateForm)
    │
    └── ProductCreateForm
            │   (hooks: useFormSchema, useFormState, useFieldHandler,
            │           useFieldVisibility, useFieldValidation, useProductSubmit)
            │
            ├── ValidationSummary  (when showValidation + validationResult)
            │
            ├── [schema-driven sections — one per section key from schema]
            │     BasicInfoSection / PricingSection / MediaSection / ShippingSection
            │         └── FieldRenderer (one per field)
            │               └── ImageUploadField (for image/media/file fields)
            │
            └── VariantsSection  (when variantConfigurator field exists in schema)
                    └── VariantConfigurator
                              └── VariantMultiImageUpload (one per variant row)
```

---

## Data Flow — Schema to Rendered Form

```
ProductCreateForm mounts
        │
        ▼
useFormSchema.loadSchema()
        │
        ▼ POST /api/v1/ecommerce/form-schema/generate
        │
        ▼ BackendContext { userId, orgId, role, channels, category: '' }
        │
Backend returns DynamicFormSchema
  fields: [ { fieldName, fieldType, section, displayLevel, ... }, ... ]
        │
        ▼ unwrapSchema() + flattenSections() inside useFormSchema
        │
schema.fields  ← flat array, section key stamped onto each field
        │
        ▼ useMemo: sortedSections
  getVisibleFields(fields, formData)     ← filters out hidden/condition-failed fields
  filter by displayLevel (essential|basic for formStage=essential)
  sort by field.order
  groupFieldsBySection(sortedFields)     ← { 'basic-info': [...], 'pricing': [...], ... }
  sort sections by getSectionMetadata(key).order
        │
        ▼ renderSection() for each [sectionKey, fields]
  BasicInfoSection / PricingSection / MediaSection / ShippingSection
        │
        ▼ FieldRenderer for each field
  → correct input element
```

---

## Data Flow — User Fills Form → Category Change

```
User selects category value (e.g. "electronics")
        │
FieldRenderer onChange → handleFieldChange('category', 'electronics')
        │
useFieldHandler detects fieldName === 'category'
        │ setFormData({ ...prev, category: 'electronics' })
        │ calls onCategoryChange('electronics')
        │
ProductCreateForm.handleCategoryChange('electronics')
        │ calls loadCategoryFieldsSmooth('electronics')
        │
useFormSchema.loadCategoryFieldsSmooth()
        │ check cache → miss
        │ POST /api/v1/ecommerce/form-schema/generate with category: 'electronics'
        │ unwrap + cache under key 'electronics'
        │ setSchema(newSchema)  setFormStage('category-specific')
        │
sortedSections recomputed via useMemo
        │ now includes category-specific fields (displayLevel: 'category-specific')
        │
Form re-renders with expanded field set
```

---

## Data Flow — Submit

```
User clicks "Create Product"
        │
ProductCreateForm.handleSubmit(e)
        │ validateProductCategory(formData.category, assignedCategories, orgDefault)
        │
generateMasterProduct({ formData, schema, organizationId, userId })
        │  → form data → MasterProduct object (see PRODUCT-SUBMISSION-PIPELINE.md)
        │
useProductSubmit.submitProduct(product)
        │
        ├── Step 1: createBackendContext(userId, orgId, role, channels, category)
        │
        ├── Step 2: ProductApiService.validateProductEnhanced(product, context)
        │     POST /api/v1/ecommerce/dynamic-products/validate
        │     if !valid || !canSubmit → setShowValidation(true), return null
        │
        └── Step 3: ProductApiService.createProduct(product, context)
              POST /api/v1/ecommerce/dynamic-products/create
              returns MasterProduct
              onProductCreated(product, targetChannels)
```

---

## Design Decisions

### Decision 1: ProductCreatePage handles auth; ProductCreateForm handles schema

`ProductCreatePage` owns the auth/org context gate and derives `userId`, `organizationId`,
`userRole`, `targetChannels`, `assignedCategories`, `organizationDefaultCategory` from it.
`ProductCreateForm` receives these as plain props, making it fully testable without mocking
the auth context.

```tsx
// ProductCreateForm has no auth imports
interface ProductCreateFormProps {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  ...
}
```

### Decision 2: Schema is a flat `fields` array, never a nested sections tree

The backend may return either `{ fields: [...] }` or `{ sections: [{ fields: [...] }] }`.
`useFormSchema.unwrapSchema()` normalizes this: if sections exist without a top-level
`fields` array, it flattens all section fields into one array, stamping each field with its
`section` key. All downstream code only works with `schema.fields`.

This means:
- `groupFieldsBySection()` receives a flat array and groups by `field.section`
- A new section key from the backend requires no frontend code change

### Decision 3: Section routing in ProductCreateForm uses normalized key matching

`sortedSections` returns `[sectionKey, fields]` pairs where `sectionKey` is already
normalized to kebab-case by `normalizeSectionKey()`. `renderSection()` switches on this
key and routes to the matching section component:

```
'pricing'  → PricingSection
'media'    → MediaSection
'shipping' → ShippingSection
else       → BasicInfoSection  (handles basic-info, content, seo, taxonomy, unknown)
```

`VariantsSection` is not part of `sortedSections` — it is rendered separately because
the variant configurator field is explicitly excluded from the section grouping via
`groupFieldsBySection(fields, ['hasVariants', 'variantConfigurator'])`.

### Decision 4: Schema caching keyed by category string

`useFormSchema` maintains a `Map<string, schema>` ref keyed by `category || 'essential'`.
Switching back to a previously seen category is instant (no network round-trip). In-flight
request deduplication prevents multiple concurrent fetches for the same key (e.g., if the
user rapidly changes and re-selects the same category).

### Decision 5: `BackendContext` is defined in `schema-api.service.ts`

Both the schema service and the product API service need `BackendContext`. It is defined
once in `schema-api.service.ts` (where the `createBackendContext()` factory also lives)
and re-exported from `product-api.service.ts`:

```ts
// product-api.service.ts
import type { BackendContext } from './schema-api.service';
export type { BackendContext };
```

This prevents the ambiguous export error that `export * from` both would cause.

### Decision 6: productId for image uploads uses a stable ref

Image uploads need a `productId` path segment before the product is saved.
`ProductCreateForm` uses a `useRef` to generate the temp ID once on mount:

```ts
const tempProductIdRef = useRef(`temp_${Date.now()}`);
const productId = formData.id || tempProductIdRef.current;
```

Using a ref (not state, not `useMemo`) means the value never changes during the
component's lifetime, preventing unnecessary re-renders and keeping upload paths stable.

### Decision 7: Variant fields excluded from section grouping, rendered separately

```ts
groupFieldsBySection(sortedFields, ['hasVariants', 'variantConfigurator'])
```

The `hasVariants` checkbox and `variantConfigurator` field are excluded from the
schema-driven section rendering. `VariantsSection` renders them manually with custom UI
(gradient checkbox area, warning state, opacity toggle). This allows full control over
the variant UX without affecting the generic section rendering pipeline.
