# Form Schema and Cache

## What Is the Form Schema?

The form schema is the server-generated field configuration for the Step 1 product create form. Instead of hardcoding which fields appear, the backend generates the field list dynamically based on:

- The merchant's role and permissions
- Which category is selected (drives category-specific attributes)
- The ProductType resolved from that category (drives variant dimensions)

The schema returns a `DynamicFormSchema` containing `fields[]` (or `sections[]`) and `metadata` with `productTypeId` and `productTypeName`.

---

## Two-Phase Loading

### Phase 1: Initial load (no category selected)

```
POST /ecommerce/form-schema/generate
  { context: { organizationId, userId, userRole, ... } }

Response:
  • Only global attributes (no productTypeIds, no applicableCategories)
  • metadata.isInitialLoad = true
  • metadata.productTypeId = null
  • Fields: name, description, sku, price, images, category, ...
```

The form renders minimal fields. The category picker is visible but empty.

### Phase 2: Category selected (schema refresh)

```
POST /ecommerce/form-schema/refresh
  { context: { productCategory: "smartphones", organizationId, ... } }

Response:
  • Global attributes + Smartphone-specific attributes
  • metadata.isCategorySpecific = true
  • metadata.productTypeId = "6623a1b2..."
  • metadata.productTypeName = "Smartphone"
  • Fields: name, description, sku, price, images, category,
            brand, os, ram, color, storage, 5g_support, ...
```

The form now shows all Smartphone attributes. `useProductTypeVariants` reads `productTypeId` from metadata to load the variant matrix.

---

## Full Schema Refresh Flow

```
Merchant selects "smartphones" in CategorySelectField
            │
            ▼
useFieldHandler: handleFieldChange("category", "smartphones")
  → Detects fieldName === "category"
  → Calls loadCategoryFieldsSmooth("smartphones")
            │
            ▼
POST /ecommerce/form-schema/refresh
  { context: { productCategory: "smartphones", organizationId, ... } }
            │
  Backend: DataDrivenSchemaGenerationService
    → CategoryRepository.findBySlug("smartphones")
    → resolveProductTypeId: walks ancestor chain if needed
    → Phase 4 filter: productTypeIds ∋ resolvedTypeId
    → Merge global + Smartphone attributes
    → metadata.productTypeId   = "6623a1b2..."
    → metadata.productTypeName = "Smartphone"
    │
    ▼
Response → unwrapSchema()
  → topMeta.productTypeId = "6623a1b2..."
            │
            ▼
useProductTypeVariants("6623a1b2...") fires
  → Loads variant dimensions + options
  → VariantConfigurator renders SKU matrix
```

---

## unwrapSchema — Merging Outer and Inner Metadata

The backend can embed `productTypeId` in one of two places:

```json
// Pattern A: outer metadata
{
  "formSchema": { ... },
  "metadata": { "productTypeId": "6623a1b2..." }
}

// Pattern B: inner metadata
{
  "formSchema": {
    "metadata": { "productTypeId": "6623a1b2..." },
    "fields": [ ... ]
  }
}
```

`unwrapSchema` handles both:
```typescript
function unwrapSchema(rawResponse: any) {
  const outerMeta = rawResponse?.metadata ?? {};
  const schemaData = rawResponse?.formSchema ?? rawResponse;
  const innerMeta  = schemaData.metadata ?? {};
  const topMeta = {
    ...innerMeta,
    ...outerMeta,   // outer wins if both are set
    productTypeId:   outerMeta.productTypeId   ?? innerMeta.productTypeId   ?? null,
    productTypeName: outerMeta.productTypeName ?? innerMeta.productTypeName ?? null,
  };
  return { schema: flattenSections(schemaData), topMeta };
}
```

`flattenSections` merges `formSchema.sections[].fields` into a flat `fields[]` array so the rest of the app only deals with one format regardless of how the backend structured the response.

---

## loadCategoryFieldsSmooth — Smooth Transition UX

```typescript
async function loadCategoryFieldsSmooth(categorySlug: string) {
  setIsRefreshing(true);
  // Keep existing fields visible while loading — no blank flash

  const raw = await schemaApi.refreshSchema({ context: { productCategory: categorySlug } });
  const { schema, topMeta } = unwrapSchema(raw);

  setFields(schema.fields);
  setTopMeta(topMeta);
  setIsRefreshing(false);
}
```

The form doesn't blank out during refresh. Old fields stay rendered until the new schema arrives, then swap in-place.

---

## Cache Key: productTypeId (not category slug)

Before Phase 5, the cache key was the category slug. This caused unnecessary misses:

```
"Budget Smartphones"  → ProductType: Smartphone → cache key: "budget-smartphones"
"Premium Smartphones" → ProductType: Smartphone → cache key: "premium-smartphones" → MISS
```

After Phase 5: cache key is `productTypeId`.

```
"Budget Smartphones"  → Smartphone typeId: "6623a1b2..." → HIT ✓
"Premium Smartphones" → Smartphone typeId: "6623a1b2..." → HIT ✓
```

Invalidation: `DELETE /ecommerce/form-schema/cache/product-type/{productTypeId}` — call this whenever a MasterAttribute's `productTypeIds` changes.

---

## Cache Invalidation Flow

```
Platform engineer adds "5g_support" to ProductType "Smartphone"
  → PUT /admin/master-attributes/{id} { productTypeIds: ["6623a1b2..."] }
  → Backend side effect: DELETE cache entries where key = "6623a1b2..."

Next refresh request:
  POST /form-schema/refresh { context: { productCategory: "smartphones" } }
  → MISS → generates fresh schema with 5g_support included
  → Cached under key: "6623a1b2..."
```

---

## Global vs Category-Specific Attributes

```
Global attributes (initial load only):
  name, description, sku, barcode, price, compare_at_price,
  images, tags, weight
  — any attribute with empty productTypeIds AND empty applicableCategories

Category-specific attributes (added on refresh):
  brand, os, ram, color, storage_capacity, 5g_support
  — attributes where productTypeIds ∋ Smartphone's typeId
```

The initial form never contains category-specific fields. This prevents empty irrelevant fields before the merchant has chosen a category.

---

## Codebase

| File                                                                     | Purpose                                                                             |
|--------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| `src/modules/ecommerce-product-v2/step1-create/hooks/useFormSchema.ts`   | `loadSchema()`, `loadCategoryFieldsSmooth()`, `unwrapSchema()`, `flattenSections()` |
| `src/modules/ecommerce-product-v2/step1-create/hooks/useFieldHandler.ts` | Detects `fieldName === "category"` → calls `loadCategoryFieldsSmooth`               |
| `src/modules/ecommerce-product-v2/services/schema-api.service.ts`        | `schemaApi.generateSchema()`, `schemaApi.refreshSchema()`                           |
| `src/modules/ecommerce-product-v2/types/form-schema.ts`                  | `DynamicFormSchema`, `FormSchemaResponse`, `FormField`, `FormFieldType`             |
