# Phase 5 Backend Contract Changes
## Complete — Variant Matrix

**Feature:** ProductType drives the SKU variant matrix. The product create form generates a
type-consistent SKU grid. Channel adapters read variant dimensions to generate variants correctly.

---

## 1. MasterProductSnapshot — `productTypeVariantDimensions` + `productTypeName`

**Existing endpoint:** `GET /api/v1/channel-steps/{masterProductId}/schema`  
**Response type:** `ChannelStepSchemaResponse`  
**Field path:** `masterProduct`

### Required additions to `MasterProductSnapshot` (Java DTO):

```java
/** Phase 5: Populated when the master product's category has a ProductType with variantDimensions. */
@JsonInclude(JsonInclude.Include.NON_NULL)
private String productTypeName;

@JsonInclude(JsonInclude.Include.NON_NULL)
private List<VariantDimensionDto> productTypeVariantDimensions;

public static class VariantDimensionDto {
    private String attributeCode;   // e.g. "color"
    private String attributeName;   // e.g. "Color"
    private int order;              // 1 = primary axis (rows), 2 = secondary (columns)
    private boolean required;
}
```

### Populate in service:

```java
// In ChannelStepSchemaService.buildMasterProductSnapshot(masterProductId):
MasterProduct product = masterProductRepo.findById(masterProductId);
String categoryId = product.getCategoryId();

if (categoryId != null) {
    ProductCategory category = categoryRepo.findById(categoryId);
    if (category.getProductTypeId() != null) {
        ProductType productType = productTypeRepo.findById(category.getProductTypeId());
        snapshot.setProductTypeName(productType.getName());
        snapshot.setProductTypeVariantDimensions(
            productType.getVariantDimensions().stream()
                .sorted(Comparator.comparingInt(VariantDimension::getOrder))
                .map(d -> new VariantDimensionDto(d.getAttributeCode(), d.getAttributeName(), d.getOrder(), d.isRequired()))
                .collect(Collectors.toList())
        );
    }
}
```

**Frontend use:** `ChannelStoreTab.tsx` shows a banner in the variant_overrides section:
> "Variant axes defined by **Smartphone**: Color × Storage Capacity (required per SKU)"

---

## 2. CategoryService.get — `productTypeId` in response

**Existing endpoint:** `GET /api/v1/admin/product-categories/{id}`  
**Already implemented** in Phase 4 — the `productTypeId` field must be present on the response.

Frontend fetches this in `useProductTypeVariants` hook to resolve the ProductType.

Chain: `formData.category` (categoryId) → `GET /admin/product-categories/{id}` → `productTypeId`
→ `GET /admin/product-types/{productTypeId}` → `variantDimensions`

---

## 3. Channel Adapter — Variant Generation from ProductType

### New requirement: Channel adapter must respect ProductType.variantDimensions when syncing

When a master product has a ProductType with `variantDimensions`, the channel sync adapter must:

1. Read `ProductType.variantDimensions` (ordered) to determine axis structure
2. Generate variant combinations in the same `order` sequence (order=1 first, order=2 second)
3. Map each axis to the channel's variant attribute (using the channel mapping table from Phase 3)

**Affected classes:**
- `ShopifyProductSyncAdapter.buildVariantPayload(masterProduct)`
- `WooCommerceProductSyncAdapter.buildVariantPayload(masterProduct)`
- `AmazonProductSyncAdapter.buildVariantPayload(masterProduct)`

### Example Shopify adapter change:

```java
// Before (order-agnostic):
List<VariantAxis> axes = detectAxesFromVariants(masterProduct.getVariants());

// After (order from ProductType):
List<VariantAxis> axes;
if (masterProduct.getCategoryProductTypeId() != null) {
    ProductType pt = productTypeRepo.findById(masterProduct.getCategoryProductTypeId());
    axes = pt.getVariantDimensions().stream()
        .sorted(Comparator.comparingInt(VariantDimension::getOrder))
        .map(d -> new VariantAxis(d.getAttributeCode(), d.getAttributeName()))
        .collect(Collectors.toList());
} else {
    axes = detectAxesFromVariants(masterProduct.getVariants()); // fallback
}
```

---

## 4. Import Wizard — Shopify Option Detection

### Goal: Auto-suggest ProductType from Shopify product options during import

When importing from Shopify, the backend receives product options (e.g., `[{name: "Color"}, {name: "Size"}]`).
The system should suggest a ProductType whose `variantDimensions` best matches the import options.

### New endpoint:

```
POST /api/v1/admin/product-types/match-by-options
Content-Type: application/json

Request:
{
  "options": [
    { "name": "Color" },
    { "name": "Storage" }
  ]
}

Response:
{
  "bestMatch": {
    "id": "pt_001",
    "name": "Smartphone",
    "slug": "smartphone",
    "matchScore": 0.9,
    "matchedDimensions": ["color", "storage_capacity"]
  },
  "alternatives": [
    { "id": "pt_002", "name": "Tablet", "matchScore": 0.6, ... }
  ]
}
```

### Matching algorithm:

```java
// Normalize option names → lowercase + strip non-alphanum
// For each ProductType, score = (matched dimensions / max(importOptions, typeDimensions))
// Exact match on attributeName (case-insensitive) = 1.0
// Fuzzy match on attributeCode prefix = 0.7
// No match = 0
```

**Frontend use:** ImportWizardModal shows "Suggested ProductType: Smartphone" when importing a Shopify
product with Color + Storage options. Merchant can accept or choose a different type.

### ImportWizardModal changes needed (frontend):

1. After fetching Shopify product preview, call `POST /admin/product-types/match-by-options`
2. Display suggestion banner: "This product looks like a **Smartphone** (matched Color × Storage)"
3. Accept button: sets `productTypeId` on the import payload
4. Already-implemented: `channelStore.ts` `ImportWizardModal.tsx` handles Shopify import flow

---

## 5. Master Product — `productTypeId` on create/update

**Already implemented** in Phase 4: the master product document stores `productTypeId` (denormalized from
the category at save time). The channel sync adapters read it via `masterProduct.getCategoryProductTypeId()`.

If a product's category changes (and the new category has a different ProductType), the sync adapter
must regenerate the variant axis mapping on the next sync.

---

## 6. Summary of backend tasks

| Task | Endpoint | Priority |
|---|---|---|
| Add `productTypeName` + `productTypeVariantDimensions` to `MasterProductSnapshot` | `GET /channel-steps/{id}/schema` | **High** — unblocks ChannelStoreTab banner |
| Confirm `productTypeId` is in `GET /admin/product-categories/{id}` response | existing | **High** — unblocks `useProductTypeVariants` hook |
| Channel adapters: use ProductType dimension order when building variant payloads | Shopify/WooCommerce/Amazon sync | **Medium** — Phase 5 scale concern |
| New `POST /admin/product-types/match-by-options` for import wizard suggestion | new endpoint | **Low** — import UX enhancement |

---

## 7. MongoDB indexes (additional to Phase 4)

```js
// For the match-by-options query: full-text on variantDimensions.attributeName
db.product_types.createIndex(
  { "variantDimensions.attributeName": "text", "variantDimensions.attributeCode": "text" },
  { name: "variant_dimension_text_search" }
);
```
