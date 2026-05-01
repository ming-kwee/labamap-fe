# Category-Select in Master Product — Architecture

**Feature:** The "Product Category" field in the master product create form (`/products/v2/create`)
lets merchants assign their product to one node in the platform's `product_categories` tree.
Selecting a category triggers a schema refresh that loads category-specific attributes and resolves
the `productTypeId` that drives the variant configurator.

---

## Why a plain `<select>` with `options[]` doesn't work

The `product_categories` collection is a **parent-child tree** (up to N levels deep). A flat
`options: [{ value, label }]` array has no concept of depth, so the backend cannot embed the full
tree inside the form-schema response without:

- Coupling the schema payload size to the category catalogue size.
- Re-sending the entire catalogue on every cache miss.
- Losing hierarchy information that the UI needs to make the picker usable.

Additionally, `GET /admin/product-categories/slugs` already returns every field the picker needs
(`id`, `name`, `slug`, `path`, `level`) and is the canonical live source for the category
catalogue. Embedding a snapshot of this data inside the form-schema response would create a
second, potentially stale copy.

---

## Solution: `fieldType: "category-select"`

The backend emits the category field with a dedicated `fieldType` and **no `options[]`**:

```json
{
  "fieldName": "category",
  "fieldType": "category-select",
  "label": "Product Category",
  "required": true,
  "helpText": "Determines which attribute set and variant dimensions apply to this product."
}
```

The frontend `FieldRenderer` detects this type and renders a `CategorySelectField` component
that fetches the live tree from `GET /admin/product-categories/slugs`, sorts by `path`, and
renders an indented dropdown where `level` drives the visual hierarchy.

---

## Data flow

```
Backend: FormSchemaService
  → emits category field with fieldType: "category-select", no options[]

Frontend: FieldRenderer
  → detects fieldType === "category-select"
  → renders <CategorySelectField>

CategorySelectField (mounts)
  → GET /labamap/api/v1/admin/product-categories/slugs
  → sort by path  (alphabetic path sort = correct tree order automatically)
  → render <select> with level-indented <option> labels

User selects a category slug (e.g. "smartphones")
  → onChange(fieldName, "smartphones")
  → useFieldHandler detects fieldName === "category"
  → calls loadCategoryFieldsSmooth("smartphones")
  → POST /ecommerce/form-schema/refresh { context: { productCategory: "smartphones" } }
  → response: metadata.productTypeId = "6623a1b2c3d4e5f6a7b8c9d0"
  → useProductTypeVariants(productTypeId) fetches variant dimensions + options
```

---

## Why `path` sort gives correct tree order

`CategorySlugItem.path` is the materialized path stored in MongoDB:

```
"electronics"
"electronics/mobile"
"electronics/mobile/smartphones"
"electronics/mobile/feature-phones"
"electronics/laptops"
"apparel"
"apparel/clothing"
```

Sorting these strings alphabetically produces parent-before-child ordering with siblings
adjacent — the same visual structure as the tree — without any recursive traversal.

---

## Indentation scheme

```
Electronics                        level 0  →  no indent
  Mobile                           level 1  →  · · ·
    Smartphones                    level 2  →  · · · · · ·
    Feature Phones                 level 2  →  · · · · · ·
  Laptops                          level 1  →  · · ·
Apparel                            level 0  →  no indent
  Clothing                         level 1  →  · · ·
```

Each depth level adds 3 non-breaking spaces (` `) as a prefix to the `<option>` label.
The value stored on the product is always the plain `slug` — no indentation in the stored value.

---

## Stored value and backend contract

The value written to `formData.category` and ultimately to `masterProduct.categorySlug` is the
plain slug string (e.g. `"smartphones"`). This is what `FormSchemaService.resolveCategory()`
already expects when called from `POST /form-schema/refresh`.

Nothing changes in the save contract. The only change is how the field is rendered.

---

## Files changed

| File | Change |
|------|--------|
| `src/modules/ecommerce-product-v2/types/form-schema.ts` | Added `"category-select"` to `FormFieldType` union |
| `src/modules/ecommerce-product-v2/step1-create/components/CategorySelectField.tsx` | **New** — fetches slugs, renders indented dropdown |
| `src/modules/ecommerce-product-v2/step1-create/components/FieldRenderer.tsx` | Added `category-select` branch dispatching to `CategorySelectField` |

---

## Related documentation

| Document | What it covers |
|----------|----------------|
| `CATEGORY-SELECT-BACKEND-CHANGES.md` | Exact backend change required in `DataDrivenSchemaGenerationService` |
| `PHASE5-VARIANT-OPTIONS-BACKEND-REQUIREMENTS.md` | How productTypeId flows from category selection to variant options |
| `PHASE4-BACKEND-CONTRACT-CHANGES.md` | ProductType entity; `productTypeId` on `product_categories` documents |
