# Dynamic Form System — How It Works

## Overview

The form displayed to the user is **not hardcoded in the frontend**. Every field — its
label, type, validation rules, options, section, order, and visibility conditions — comes
from the backend via a form schema API. The frontend is a rendering engine that
interprets this schema and produces the correct UI.

This means:
- Adding a new field requires a backend change only (no frontend deploy)
- Category-specific fields appear automatically when a category is selected
- Validation rules are defined by the business team in the database
- New field types can be handled by adding a case in `FieldRenderer.tsx`

---

## Schema Structure

The backend returns a `DynamicFormSchema` object:

```ts
interface DynamicFormSchema {
  title: string;
  description: string;
  version: string;
  generatedAt: string;
  generatedFor: {
    userId: string;
    organizationId: string;
    userRole: string;
    permissions: string[];
  };
  fields?: FormField[];          // flat array — preferred format
  sections?: FormSection[];      // nested format — flattened by frontend
  conditionalLogic?: FormLogic;
  governanceInfo?: FormGovernanceInfo;
  metadata?: {
    formStage?: 'essential' | 'category-specific';
    fieldCount: number;
    requiredFieldCount: number;
    conditionalFieldCount: number;
    variantScopedFields?: string[];   // field names with variantScope: 'dual'
    variantDimensions?: string[];     // field names that are variant dimensions
  };
}
```

### Fields vs Sections

The backend may return fields in two formats. The frontend normalizes both to a flat
`fields` array inside `useFormSchema.unwrapSchema()`:

**Format A — flat fields:**
```json
{
  "fields": [
    { "fieldName": "name", "section": "basic-info", ... },
    { "fieldName": "price", "section": "pricing", ... }
  ]
}
```

**Format B — nested sections:**
```json
{
  "sections": [
    {
      "key": "basic-info",
      "label": "Basic Information",
      "fields": [
        { "fieldName": "name", ... }
      ]
    }
  ]
}
```

`flattenSections()` in `useFormSchema` converts Format B to Format A by iterating all
sections and stamping `field.section = section.key` on each field. The result is always
a flat `fields` array on `schema`.

---

## FormField — Complete Structure

```ts
interface FormField {
  // Identity
  fieldName: string;           // Primary identifier  (e.g. "productName")
  name?: string;               // Alias — code uses fieldName || name
  fieldType: FormFieldType;    // Rendering type (see Field Types section below)
  label: string;               // Displayed label
  description?: string;        // Tooltip text (shown on info icon hover)
  placeholder?: string;        // Input placeholder
  helpText?: string;           // Text shown below input
  defaultValue?: any;          // Applied on schema load if field is empty

  // Validation
  validationRules: {
    required?: boolean;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;          // Regex pattern string
    precision?: number;        // Decimal places for number fields
    enum?: string[];           // Allowed values
    maxItems?: number;         // For media/file fields
    isVariantDimension?: boolean;   // Hint: this is a variant dimension
    variantFields?: string[];       // Names of variant-level fields
  };

  // Conditional visibility
  conditionalVisibility?: {
    showWhen?: string;         // Expression or operator-object (see below)
    hideWhen?: string;
    requiredWhen?: string;     // Make required only when condition is true
    disabledWhen?: string;
  };

  // Options (for select/radio/multiselect)
  options?: { value: string; label: string; description?: string; disabled?: boolean }[];

  // State flags
  readOnly: boolean;
  hidden: boolean;
  required: boolean;

  // Layout
  group?: string;
  section?: string;            // Section key (e.g. 'basic-info', 'pricing')
  displayLevel?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific';
  order?: number;              // Sort order within section
  width?: 'full' | 'half' | 'third' | 'quarter';

  // Variant handling
  variantScope?: 'dual' | 'variant_only' | null;

  // Governance
  businessContext: {
    businessOwner: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    version: number;
    variantDimension?: boolean;
    categorySpecific?: boolean;
    channelSpecific?: boolean;
  };
}
```

---

## Field Types

`FieldRenderer.tsx` maps `field.fieldType` to the correct input component:

| `fieldType` value | Rendered as | Notes |
|---|---|---|
| `text` | `<input type="text">` | Default for most string fields |
| `number` | `<input type="number">` | |
| `email` | `<input type="email">` | |
| `url` | `<input type="url">` | |
| `tel` | `<input type="tel">` | |
| `textarea` | `<textarea rows="3">` | For descriptions, long text |
| `select` | `<select>` | Requires `options` array |
| `multiselect` | `<select multiple>` | Not yet custom-rendered — falls through to text input |
| `checkbox` | `<input type="checkbox">` | Boolean fields (hasVariants, trackQuantity) |
| `radio` | `<input type="radio">` | Falls through to text |
| `date` | `<input type="date">` | |
| `datetime-local` | `<input type="datetime-local">` | |
| `image` | `ImageUploadField` | Single image, `multiple=false` |
| `file` | `ImageUploadField` | Multiple images, `multiple=true` |
| `media` | `ImageUploadField` | Multiple images, `multiple=true` |
| `variant-configurator` | *(excluded from sections — handled by VariantsSection)* | |
| `channel-settings` | Falls through to text | Channel-level configuration |
| `color` | Falls through to text | Future: color picker |
| `range` | Falls through to text | Future: range slider |

The `SELECT` type (uppercase) from the backend is lowercased before dispatch:
```ts
const fieldType = (field.fieldType || '').toLowerCase();
```

---

## Display Levels

Display levels control which fields appear before vs after a category is selected.
They implement progressive disclosure — don't overwhelm with 40 fields on first load.

| Level | When shown | Purpose |
|---|---|---|
| `essential` | Always (formStage=essential) | Core fields that apply to every product |
| `basic` | Always (formStage=essential) | Standard fields expected for most products |
| `category-specific` | After category selected (formStage=category-specific) | Fields that only make sense for the chosen category |
| `advanced` | After category selected | Optional advanced fields |
| `optional` | After category selected | Least important fields |

```ts
// Filtering logic in ProductCreateForm's useMemo
const filteredFields = visibleFields.filter((field) => {
  const displayLevel = (field.displayLevel || '').toLowerCase();
  if (formStage === 'essential') {
    return displayLevel === 'essential' || displayLevel === 'basic';
  }
  // After category selected: show everything
  return (
    displayLevel === 'essential' ||
    displayLevel === 'basic' ||
    displayLevel === 'category-specific' ||
    field.conditionalVisibility !== null
  );
});
```

**FormStage transitions:**

```
Initial load (no category)
  formStage = 'essential'
  Shows: essential + basic fields only

User selects a category (e.g. 'electronics')
  loadCategoryFieldsSmooth('electronics') called
  formStage = 'category-specific'
  Shows: essential + basic + category-specific + advanced + optional + conditional fields
```

---

## Section Organization

After filtering and sorting by `field.order`, fields are grouped by their `section`
property into a `Record<string, FormField[]>`.

```ts
groupFieldsBySection(sortedFields, ['hasVariants', 'variantConfigurator'])
// excludes hasVariants and variantConfigurator — they are rendered by VariantsSection
```

Sections are then sorted by their metadata `order`:

```ts
const SECTION_METADATA = {
  'basic-info': { label: 'Basic Information', icon: Package,      order: 1 },
  'pricing':    { label: 'Pricing & Inventory', icon: DollarSign, order: 2 },
  'media':      { label: 'Images & Media',      icon: Image,      order: 3 },
  'content':    { label: 'Product Content',     icon: FileText,   order: 4 },
  'shipping':   { label: 'Shipping Details',    icon: Truck,      order: 5 },
  'seo':        { label: 'SEO & Marketing',     icon: Star,       order: 6 },
  'taxonomy':   { label: 'Categories & Tags',   icon: Tag,        order: 7 },
  'variants':   { label: 'Product Variants',    icon: Settings,   order: 8 },
};
```

Unknown section keys get a fallback label (title-cased from the key) and `order: 999`.

The `normalizeSectionKey` function converts any backend key format to kebab-case:

```ts
normalizeSectionKey('basicInfo')    // → 'basic-info'
normalizeSectionKey('BASIC_INFO')   // → 'basic-info'
normalizeSectionKey('basic-info')   // → 'basic-info'
```

---

## Conditional Visibility System

Fields can have visibility conditions set in `conditionalVisibility`. The frontend
evaluates these conditions in real time as `formData` changes.

### Operator-Based Conditions (Object Format)

The backend can return conditions as an object with a field reference and operator:

```json
{
  "conditionalVisibility": {
    "showWhen": {
      "field": "hasVariants",
      "operator": "equals",
      "value": true
    }
  }
}
```

**Supported operators:**

| Operator | Meaning |
|---|---|
| `equals` / `eq` | Strict equality |
| `not_equals` / `neq` | Strict inequality |
| `greater_than` / `gt` | Numeric greater than |
| `less_than` / `lt` | Numeric less than |
| `greater_than_or_equal` / `gte` | Numeric ≥ |
| `less_than_or_equal` / `lte` | Numeric ≤ |
| `contains` | String includes substring |
| `not_contains` | String does not include substring |
| `starts_with` | String starts with value |
| `ends_with` | String ends with value |
| `in` | Value is in array |
| `not_in` | Value is not in array |
| `is_empty` | Field is empty/null/undefined/false |
| `is_not_empty` | Field is not empty |
| `matches` | Regex test |
| `not_matches` | Fails regex test |

### Expression-Based Conditions (String Format)

The backend can also return conditions as a JavaScript expression string:

```json
{
  "conditionalVisibility": {
    "showWhen": "hasVariants === true && category === 'electronics'"
  }
}
```

`useFieldVisibility` evaluates these with `new Function('return ' + expression)()` after
substituting current `formData` values:

```ts
let expression = showWhen;
Object.keys(formData).forEach(key => {
  const val = formData[key];
  const valStr = typeof val === 'string' ? `'${val}'` : val;
  expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), valStr);
});
return new Function(`return ${expression}`)();
```

If evaluation throws an error, the field defaults to **visible** (fail-open).

### variantScope Visibility

Independent of `conditionalVisibility`, the `variantScope` property controls visibility
relative to the variants state:

```ts
// useFieldVisibility.isFieldVisible()
if (field.variantScope === 'variant_only') return false;   // never shown at product level
if (field.variantScope === 'dual' && formData.hasVariants) return false; // hidden when variants on
```

`variant_only` fields are never rendered in the main form — they appear only in variant
table rows inside `VariantConfigurator`.

`dual` fields appear in the main form when `hasVariants = false`, and are then
**hidden and their values copied to the first variant row** when `hasVariants = true`.
See [VARIANT-SYSTEM.md](VARIANT-SYSTEM.md) for the full dual-scope mechanism.

---

## Schema Generation Request

The API call that generates the form schema:

```
POST /api/v1/ecommerce/form-schema/generate
Content-Type: application/json

{
  "userId":          "user_abc",
  "organizationId":  "org_123",
  "userRole":        "BUSINESS_USER",
  "targetChannels":  ["shopify", "wix"],
  "productCategory": "",                   ← empty for initial load
  "permissions":     ["CREATE_PRODUCT"],
  "requestId":       "req_1706123456789",
  "timestamp":       1706123456789
}
```

The backend uses this context to decide:
- Which fields to include (based on role and permissions)
- Which category-specific fields to add (based on productCategory)
- Which options to populate for SELECT fields
- What validation rules to apply

**Category refresh** uses `refreshFormSchema()` (same endpoint, same body structure, but
with a non-empty `productCategory`). This returns the full schema including category-
specific fields. The frontend replaces its current schema entirely.

---

## Schema Lifecycle

```
Component mounts
      │
      ▼
loadSchema()                         ← called from useEffect([], []) — once only
  POST /api/v1/ecommerce/form-schema/generate (category: '')
  cache key = 'essential'
  setSchema(essentialSchema)
  setFormStage('essential')
      │
      ▼
User selects category = 'electronics'
      │
loadCategoryFieldsSmooth('electronics')
  setIsAddingCategoryFields(true)
  check cache key 'electronics' → miss
  POST /api/v1/ecommerce/form-schema/generate (category: 'electronics')
  cache key = 'electronics'
  setSchema(electronicsSchema)
  setFormStage('category-specific')
  setIsAddingCategoryFields(false)
      │
      ▼
User changes category to 'clothing'
      │
loadCategoryFieldsSmooth('clothing')
  cache key 'clothing' → miss
  POST /api/v1/ecommerce/form-schema/generate (category: 'clothing')
  ...
      │
      ▼
User changes category back to 'electronics'
      │
loadCategoryFieldsSmooth('electronics')
  cache key 'electronics' → HIT
  setSchema(cachedElectronicsSchema)    ← instant, no API call
  setFormStage('category-specific')
```

**In-flight deduplication:** If `loadCategoryFieldsSmooth('electronics')` is called while
a previous call for the same key is still in flight, the second call awaits the existing
`Promise` rather than creating a new one.

---

## Applied Default Values

When `schema` first loads (or changes), `ProductCreateForm` runs an effect that walks all
fields and applies their `defaultValue` to any form field that is currently empty:

```ts
useEffect(() => {
  if (!schema?.fields) return;
  setFormData(prev => {
    const updated = { ...prev };
    let hasChanges = false;
    for (const field of schema.fields) {
      const fieldName = field.name || field.fieldName;
      if (
        field.defaultValue !== undefined &&
        field.defaultValue !== null &&
        (updated[fieldName] === undefined || updated[fieldName] === null || updated[fieldName] === '')
      ) {
        updated[fieldName] = field.defaultValue;
        hasChanges = true;
      }
    }
    return hasChanges ? updated : prev;
  });
}, [schema, setFormData]);
```

This only populates empty fields — it never overwrites values the user has already entered
or values loaded from `initialData`.
