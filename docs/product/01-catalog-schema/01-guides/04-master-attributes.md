# Master Attributes

## What Is a MasterAttribute?

A **platform-owned field definition** describing one piece of product data: its name,
type, options, validation rules, and where it appears in forms and channel listings.

Examples: `brand` (text), `color` (select), `storage_capacity` (select),
`5g_support` (boolean), `screen_size` (number), `os` (select).

Platform engineers create and maintain MasterAttributes. Merchants cannot edit them —
merchants only fill in values (e.g., "Black", "128GB") for their own products.

---

## The Two Assignment Systems (Dual-Mode)

### Phase 1 / Legacy: `applicableCategories[]`
```json
"applicableCategories": ["ObjectId_Smartphones", "ObjectId_BudgetPhones"]
```
Direct assignment to category ObjectIds. Breaks if categories are renamed.

### Phase 4 (current): `productTypeIds[]`
```json
"productTypeIds": ["ObjectId_Smartphone"]
```
Assignment to ProductType ObjectIds. Stable — category renames don't break anything.

### Dual-mode filter chain

```
For each attribute:
  Has productTypeIds (non-empty)?
    YES → Phase 4: include if productTypeId ∋ this list
          (permissive: if category has no productTypeId, include the attribute)
    NO  → Legacy: include if categoryId ∋ applicableCategories
  Neither field set → global attribute, always included
```

This is implemented in `DataDrivenSchemaGenerationService` (Step 1 form) and
`DynamicChannelSchemaService` (Step 2 channel forms).

---

## Phase 2 — Path Inheritance

```
Request: GET /admin/master-attributes?categoryId=<smartphones-ObjectId>

Backend:
  1. Load "Smartphones" → path: "electronics/phones/smartphones"
  2. Find all descendants: db.product_categories.find({ path: /^electronics\/phones\/smartphones/ })
     → [smartphones, budget-smartphones, premium-smartphones]
  3. Find attributes:
     { $or: [
         { applicableCategories: { $in: descendantIds } },  // Phase 1
         { productTypeIds: { $in: applicableTypeIds } }     // Phase 4
     ]}
```

Selecting "Phones" in the sidebar shows attributes assigned to any phone subcategory,
not just the exact "Phones" node.

---

## displayLevel — Form Field Categorisation

| Level | Meaning | Behaviour |
|-------|---------|-----------|
| `essential` | Core fields | Always visible, required |
| `basic` | Standard fields | Visible by default |
| `advanced` | Technical details | Collapsed behind "Show advanced" |
| `optional` | Nice-to-have | Collapsed, not required |
| `category-specific` | Added when category selected | Injected after schema refresh |

---

## variantScope — Attribute Role in Variant System

| variantScope | Meaning |
|-------------|---------|
| `product_only` | Applies once per product (brand, model name) |
| `variant_only` | Defines a SKU axis (color, size, storage) |
| `dual` | Appears at both product and variant level (price per SKU) |

Note: `variantScope: "variant_only"` says the attribute CAN create variants.
`ProductType.variantDimensions` says which attributes ARE used as axes, and in what order.

---

## Impact When an Attribute Changes

When a platform engineer adds a new attribute to a ProductType:
1. The attribute appears in forms for all new products in categories using that type.
2. Existing products get the field in edit form (empty until merchant fills it).
3. If `required: false` → existing products unaffected until merchant edits them.
4. Channel adapters pick up `channelMappings` on the attribute to map to channel field names.

---

## Attribute Count Badge

`GET /admin/master-attributes/category-counts`

```
Per category:
  If category has productTypeId:
    → MongoDB count: { productTypeIds: categoryTypeId }
  If no productTypeId:
    → In-memory legacy subtree count

attributeCount on ProductType:
    → Denormalized, updated whenever MasterAttribute.productTypeIds changes
    → Shown in ProductType list without querying master_attributes
```

---

## TypeScript Types

`src/modules/ecommerce-product-v2/types/form-schema.ts`
```typescript
type FormFieldType =
  | 'text' | 'number' | 'email' | 'textarea' | 'select' | 'multiselect'
  | 'checkbox' | 'radio' | 'date' | 'file' | 'image' | 'media'
  | 'variant-configurator' | 'channel-settings' | 'category-select';

type FieldDisplayLevel =
  | 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific';

interface FormField {
  fieldName:    string;
  fieldType:    FormFieldType;
  label:        string;
  required:     boolean;
  displayLevel?: FieldDisplayLevel;
  variantScope?: 'dual' | 'variant_only' | null;
  options?:     FormFieldOption[];
  validationRules: FormFieldValidationRules;
}
```
