# How Variant System Works - Simple & Clear Guide

## 🎯 Quick Overview

The variant system lets users create multiple versions of a product (like different colors, sizes, or storage capacities) without manually creating each one. The system automatically generates all combinations and provides a table to manage them.

**Key Point:** Everything is automatic. The system detects available dimensions from the schema, generates all combinations, and builds the UI dynamically.

**Last Updated:** 2026-01-20 (Rewritten based on actual implementation)

---

## 📚 Table of Contents

1. [What is a Variant?](#what-is-a-variant)
2. [How Dimensions Are Discovered](#how-dimensions-are-discovered)
3. [The Complete User Flow](#the-complete-user-flow)
4. [How Data Flows Through Components](#how-data-flows-through-components)
5. [Cartesian Product Generation](#cartesian-product-generation)
6. [State Management & Updates](#state-management--updates)
7. [Table Rendering Logic](#table-rendering-logic)
8. [Category Change Behavior](#category-change-behavior)
9. [Common Patterns & Examples](#common-patterns--examples)

---

## What is a Variant?

A **variant** is one specific combination of product options.

### Example: iPhone Product

```
Product: iPhone 15 Pro
Dimensions:
  - Storage Capacity: [128GB, 256GB, 512GB]
  - Color: [Black, Silver]
  - Connectivity: [WiFi Only, WiFi+Cellular]

Variants (all combinations):
  1. 128GB + Black + WiFi Only
  2. 128GB + Black + WiFi+Cellular
  3. 128GB + Silver + WiFi Only
  4. 128GB + Silver + WiFi+Cellular
  5. 256GB + Black + WiFi Only
  6. 256GB + Black + WiFi+Cellular
  7. 256GB + Silver + WiFi Only
  8. 256GB + Silver + WiFi+Cellular
  9. 512GB + Black + WiFi Only
  10. 512GB + Black + WiFi+Cellular
  11. 512GB + Silver + WiFi Only
  12. 512GB + Silver + WiFi+Cellular

Total: 3 × 2 × 2 = 12 variants
```

Each variant has:
- **Unique ID:** Generated from dimension values (e.g., "128gb-black-wifi")
- **Own properties:** Price, SKU, stock, images
- **Shared properties:** Product name, category, brand (from parent product)

---

## How Dimensions Are Discovered

**CRITICAL:** The system does NOT look for fields marked as "dimensions". Instead, it uses **intelligent pattern matching**.

### Discovery Rules (Line 83-138 in VariantConfiguratorDynamic.tsx)

A field becomes a dimension if it meets **ALL** these criteria:

#### ✅ Requirement 1: Must be a SELECT field with options
```typescript
field.fieldType === 'SELECT' || field.fieldType === 'select'
field.options && Array.isArray(field.options) && field.options.length > 0
```

#### ✅ Requirement 2: Field name matches dimension patterns
```typescript
Field name contains any of these keywords (case-insensitive):
- color
- size
- material
- style
- pattern
- finish
- texture
- fabric
- type
- variant
- capacity
- connectivity
```

**OR** explicitly marked:
```typescript
field.validationRules?.isVariantDimension === true
// OR
field.businessContext?.variantDimension === true
// OR
field.metadata?.variantDimension === true
```

#### ✅ Requirement 3: Passes conditional visibility
```typescript
If field has conditionalVisibility.showWhen:
  - Evaluate expression with current formData
  - Example: "hasVariants === true && category === 'electronics'"
  - If true, field is visible; otherwise hidden
```

### Real Examples

**Electronics Category Schema:**
```javascript
Schema Fields:
[
  {
    fieldName: "storageCapacity",
    fieldType: "SELECT",
    options: ["64gb", "128gb", "256gb"],
    conditionalVisibility: { showWhen: "hasVariants === true" }
  },
  {
    fieldName: "color",
    fieldType: "SELECT",
    options: ["black", "silver", "gold"],
    conditionalVisibility: { showWhen: "hasVariants === true" }
  },
  {
    fieldName: "connectivityType",
    fieldType: "SELECT",
    options: ["wifi", "wifi_cellular"],
    conditionalVisibility: { showWhen: "hasVariants === true" }
  },
  {
    fieldName: "warranty",  // ❌ NOT A DIMENSION
    fieldType: "SELECT",
    options: ["1_year", "2_years"],
    conditionalVisibility: { showWhen: "category === 'electronics'" }
  }
]

When hasVariants = false:
  → All conditionalVisibility checks fail
  → No dimensions detected
  → Variant configurator shows: "No variant dimensions detected"

When hasVariants = true:
  → storageCapacity: ✅ has "capacity" in name → DIMENSION
  → color: ✅ has "color" in name → DIMENSION
  → connectivityType: ✅ has "type" in name → DIMENSION
  → warranty: ❌ no pattern match → NOT A DIMENSION

Result: 3 dimensions available
```

**Why "warranty" is NOT a dimension:**
- It's a SELECT field with options ✓
- But "warranty" doesn't match any dimension patterns ✗
- Not explicitly marked as variant dimension ✗
- Therefore: excluded from dimensions

---

## The Complete User Flow

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: User navigates to /products/create                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Form loads with essential fields                    │
│ - Name, SKU, Price, Category dropdown                       │
│ - hasVariants checkbox (unchecked by default)               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: User selects Category = "Electronics"               │
│ - Triggers loadCategoryFieldsSmooth("electronics")          │
│ - Backend returns electronics-specific schema                │
│ - Form now shows: brand, model, warranty, etc.              │
│ - Variant dimensions are in schema but HIDDEN               │
│   (conditionalVisibility: "hasVariants === true")           │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: User checks "This product has variants"             │
│ - formData.hasVariants = true                               │
│ - Component re-renders                                       │
│ - VariantConfiguratorDynamic receives updated formData      │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: VariantConfiguratorDynamic detects dimensions       │
│ Process (Line 71-180):                                       │
│   a. Loop through schema.fields                             │
│   b. Filter: SELECT fields only                             │
│   c. Filter: Field name matches patterns                    │
│   d. Evaluate: conditionalVisibility.showWhen               │
│      - Replace "hasVariants" with "true" in expression      │
│      - Evaluate: "true === true && 'electronics' === ..."   │
│      - Result: true ✓                                       │
│   e. Fields that pass all checks = DIMENSIONS               │
│                                                              │
│ Detected Dimensions:                                         │
│   - storageCapacity: [64gb, 128gb, 256gb]                  │
│   - color: [black, silver]                                  │
│   - connectivityType: [wifi, wifi_cellular]                │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: UI renders dimension selectors                      │
│                                                              │
│ ┌─ Storage Capacity (3 available) ──────────┐              │
│ │ ☐ 64gb  ☐ 128gb  ☐ 256gb                  │              │
│ │ Selected: 0 of 3                           │              │
│ └────────────────────────────────────────────┘              │
│                                                              │
│ ┌─ Color (2 available) ──────────────────────┐             │
│ │ ☐ black  ☐ silver                          │             │
│ │ Selected: 0 of 2                            │             │
│ └────────────────────────────────────────────┘              │
│                                                              │
│ ┌─ Connectivity Type (2 available) ──────────┐             │
│ │ ☐ wifi  ☐ wifi_cellular                    │             │
│ │ Selected: 0 of 2                            │             │
│ └────────────────────────────────────────────┘              │
│                                                              │
│ [Generate Variants (0 × 0 × 0 = 1)]                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: User selects dimension values                       │
│ - Clicks checkboxes:                                        │
│   Storage: ☑ 128gb, ☑ 256gb                                │
│   Color: ☑ black, ☑ silver                                 │
│   Connectivity: ☑ wifi, ☑ wifi_cellular                    │
│                                                              │
│ - State updates (Line 290-302):                             │
│   selectedOptions = {                                        │
│     storageCapacity: ["128gb", "256gb"],                    │
│     color: ["black", "silver"],                             │
│     connectivityType: ["wifi", "wifi_cellular"]             │
│   }                                                          │
│                                                              │
│ - Button updates:                                            │
│   [Generate Variants (2 × 2 × 2 = 8)]                       │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: User clicks "Generate Variants"                     │
│                                                              │
│ Process (Line 304-401):                                      │
│   a. Get active dimensions (those with selections)          │
│   b. Call recursive Cartesian product function              │
│   c. Generate all combinations (8 variants)                 │
│   d. Create variant objects with IDs                        │
│   e. Preserve existing data (images, prices) if            │
│      variant ID matches previous generation                 │
│   f. Store in LOCAL state only (not parent yet)            │
│                                                              │
│ Generated Variants:                                          │
│   [                                                          │
│     { id: "128gb-black-wifi", ... },                        │
│     { id: "128gb-black-wifi_cellular", ... },               │
│     { id: "128gb-silver-wifi", ... },                       │
│     { id: "128gb-silver-wifi_cellular", ... },              │
│     { id: "256gb-black-wifi", ... },                        │
│     { id: "256gb-black-wifi_cellular", ... },               │
│     { id: "256gb-silver-wifi", ... },                       │
│     { id: "256gb-silver-wifi_cellular", ... }               │
│   ]                                                          │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 9: Variant table renders                               │
│                                                              │
│ Table with columns (from variantConfig):                    │
│   - Storage Capacity (dimension)                            │
│   - Color (dimension)                                       │
│   - Connectivity Type (dimension)                           │
│   - Images (special: VariantMultiImageUpload)              │
│   - Price (number input)                                    │
│   - Cost (number input)                                     │
│   - Compare Price (number input)                            │
│   - Stock (number input)                                    │
│   - SKU (text input)                                        │
│   - Weight (number input)                                   │
│   - Barcode (text input)                                    │
│   - Actions (delete button)                                 │
│                                                              │
│ 8 rows (one per variant)                                    │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 10: User fills variant data                            │
│                                                              │
│ Row 1 (128gb-black-wifi):                                   │
│   - Uploads 3 images → updateVariant() → parent updated     │
│   - Sets price to 999.99 → updateVariant() → parent updated│
│   - Sets SKU to PHONE-128-BLK-W → updateVariant()          │
│                                                              │
│ Row 2 (128gb-black-wifi_cellular):                          │
│   - Uploads 2 images → updateVariant() → parent updated     │
│   - Sets price to 1099.99 → updateVariant()                │
│   ... (user fills other rows)                               │
│                                                              │
│ Parent Form Data:                                            │
│   formData.variantConfigurator = JSON.stringify({           │
│     variants: [...all 8 variants with data...],             │
│     options: selectedOptions,                                │
│     totalVariants: 8,                                        │
│     dimensions: [...]                                        │
│   })                                                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 11: User submits form                                  │
│ - All form data (including variants) sent to backend        │
│ - Product created with 8 variants                           │
└─────────────────────────────────────────────────────────────┘
```

---

## How Data Flows Through Components

### Component Hierarchy

```
DynamicProductCreationFormRefactored (Parent)
│
├─ formData: {
│    name: "iPhone 15 Pro",
│    category: "electronics",
│    hasVariants: true,
│    variantConfigurator: "{...JSON string...}",  // ← Variants stored here
│    ...other fields
│  }
│
└─ VariantConfiguratorDynamic (Child)
   │
   ├─ Props Received:
   │    - value: formData.variantConfigurator (JSON string)
   │    - onChange: function to update parent
   │    - schema: full product schema
   │    - formData: current form state
   │    - organizationId: for image uploads
   │    - productId: for image uploads
   │
   ├─ Local State:
   │    - selectedOptions: { storageCapacity: ["128gb"], color: ["black"], ... }
   │    - variants: [{ id: "128gb-black-wifi", price: 999, ... }, ...]
   │    - lastCategory: "electronics" (for change detection)
   │
   └─ Derived State (useMemo):
        - variantDimensions: dimensions detected from schema
        - variantConfig: table column configuration
```

### Data Update Flow

```
User Action: Upload image to variant "128gb-black-wifi"
──────────────────────────────────────────────────────

1. VariantMultiImageUpload component:
   User selects file → uploads to GCP → gets URL

2. VariantMultiImageUpload calls: onImagesChange(["https://...img1.jpg"])

3. VariantConfiguratorDynamic.updateVariant():
   Line 404-410:
   - Find variant with id="128gb-black-wifi"
   - Update: variant.variantImages = ["https://...img1.jpg"]
   - Create new variants array (immutable update)
   - setVariants(newArray) → updates local state
   - updateParent(newArray, selectedOptions) → notifies parent

4. updateParent() function (Line 272-288):
   - Creates config object:
     {
       variants: [...updated variants...],
       options: selectedOptions,
       totalVariants: 8,
       dimensions: [...]
     }
   - Converts to JSON: JSON.stringify(config)
   - Calls: onChange(jsonString)

5. Parent component (DynamicProductCreationFormRefactored):
   - handleVariantConfiguratorChange(jsonString)
   - Updates: formData.variantConfigurator = jsonString
   - Component re-renders (but VariantConfiguratorDynamic doesn't remount)

Result: Parent has updated variant data, ready for form submission
```

### CRITICAL: When Parent Gets Updated

**Parent is updated when:**
- ✅ User edits any variant field (price, SKU, stock, etc.)
- ✅ User uploads/removes variant images
- ✅ User deletes a variant

**Parent is NOT updated when:**
- ❌ User clicks "Generate Variants" button
- ❌ User checks/unchecks dimension option checkboxes

**Why?** Clicking "Generate Variants" stores variants in LOCAL state only. This prevents unnecessary re-renders and potential component unmounting issues.

---

## Cartesian Product Generation

### The Algorithm (Line 333-350)

```typescript
// Recursive function to generate all combinations
function generateCombinations(
  dimensions: Dimension[],
  currentCombination: Record<string, string> = {}
): Record<string, string>[] {

  // Base case: no more dimensions to process
  if (dimensions.length === 0) {
    return [currentCombination];
  }

  // Take first dimension
  const [firstDimension, ...restDimensions] = dimensions;
  const selectedValues = selectedOptions[firstDimension.name] || [];

  const combinations: Record<string, string>[] = [];

  // For each selected value in this dimension
  selectedValues.forEach(value => {
    // Add this value to current combination
    const newCombination = {
      ...currentCombination,
      [firstDimension.name]: value
    };

    // Recursively process remaining dimensions
    const subCombinations = generateCombinations(restDimensions, newCombination);

    // Add all sub-combinations to results
    combinations.push(...subCombinations);
  });

  return combinations;
}
```

### Visual Example

```
Dimensions:
  - Storage: ["128gb", "256gb"]
  - Color: ["black", "silver"]

Execution Trace:
────────────────

Step 1: Process Storage dimension
  - Value: "128gb"
    → Combination: { storageCapacity: "128gb" }
    → Recurse with Color dimension:
      - Value: "black"
        → Combination: { storageCapacity: "128gb", color: "black" }
        → No more dimensions
        → Result: [{ storageCapacity: "128gb", color: "black" }]

      - Value: "silver"
        → Combination: { storageCapacity: "128gb", color: "silver" }
        → No more dimensions
        → Result: [{ storageCapacity: "128gb", color: "silver" }]

    → Results: [
        { storageCapacity: "128gb", color: "black" },
        { storageCapacity: "128gb", color: "silver" }
      ]

  - Value: "256gb"
    → Combination: { storageCapacity: "256gb" }
    → Recurse with Color dimension:
      - Value: "black"
        → Combination: { storageCapacity: "256gb", color: "black" }
        → No more dimensions
        → Result: [{ storageCapacity: "256gb", color: "black" }]

      - Value: "silver"
        → Combination: { storageCapacity: "256gb", color: "silver" }
        → No more dimensions
        → Result: [{ storageCapacity: "256gb", color: "silver" }]

    → Results: [
        { storageCapacity: "256gb", color: "black" },
        { storageCapacity: "256gb", color: "silver" }
      ]

Final Result:
─────────────
[
  { storageCapacity: "128gb", color: "black" },
  { storageCapacity: "128gb", color: "silver" },
  { storageCapacity: "256gb", color: "black" },
  { storageCapacity: "256gb", color: "silver" }
]

Total: 2 × 2 = 4 variants
```

### Variant Object Creation (Line 356-387)

```typescript
const newVariants = allCombinations.map(combination => {
  // Generate ID from dimension values
  const idParts = activeDimensions.map(dim => combination[dim.name]).join('-');
  const id = idParts.toLowerCase().replace(/\s+/g, '-');
  // Example: "128gb-black" (lowercase, hyphen-separated)

  // Find existing variant with same ID (for preserving data)
  const existing = variants.find(v => v.id === id);

  // Create variant object
  return {
    id,
    ...combination,  // All dimension values (storageCapacity, color, etc.)

    // Preserve existing data if variant was previously generated
    variantImages: existing?.variantImages || [],  // Uploaded images
    price: existing?.price || 0,
    cost: existing?.cost || 0,
    comparePrice: existing?.comparePrice || 0,
    stock: existing?.stock || 0,
    weight: existing?.weight || 0,
    sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
    barcode: existing?.barcode || ''
  };
});
```

**Why preserve existing data?**
If user uploads images to "128gb-black-wifi" variant, then clicks "Generate Variants" again (maybe after adding more options), the images should be preserved because the ID matches.

---

## State Management & Updates

### State Variables (Line 216-218)

```typescript
// Track selected options for each dimension
const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
// Example: { storageCapacity: ["128gb", "256gb"], color: ["black"] }

// Track generated variants
const [variants, setVariants] = useState<VariantOption[]>([]);
// Example: [{ id: "128gb-black", price: 999, ... }, ...]

// Track last category (for change detection)
const [lastCategory, setLastCategory] = useState<string | undefined>(formData?.category);
```

### Option Selection Handler (Line 290-302)

```typescript
const handleOptionChange = (dimensionName: string, optionValue: string, checked: boolean) => {
  const newSelections = { ...selectedOptions };

  if (checked) {
    // Add option to selected list
    newSelections[dimensionName] = [
      ...(newSelections[dimensionName] || []),
      optionValue
    ];
  } else {
    // Remove option from selected list
    newSelections[dimensionName] = (newSelections[dimensionName] || [])
      .filter(v => v !== optionValue);
  }

  setSelectedOptions(newSelections);
  // Does NOT call updateParent() here - only selection state changes
};
```

### Variant Update Handler (Line 404-410)

```typescript
const updateVariant = (id: string, field: string, newValue: any) => {
  // Find and update specific variant
  const updatedVariants = variants.map(variant =>
    variant.id === id ? { ...variant, [field]: newValue } : variant
  );

  // Update local state
  setVariants(updatedVariants);

  // IMPORTANT: Notify parent of changes
  updateParent(updatedVariants, selectedOptions);
};
```

**This function is called when:**
- User types in price input
- User types in SKU input
- User uploads image (via VariantMultiImageUpload)
- User edits any variant field

---

## Table Rendering Logic

### Table Configuration (Line 159-171)

Two sources for table configuration:

**Option 1: Backend-Provided (Preferred)**
```typescript
const variantField = schema.fields.find(f =>
  f.fieldName === 'variantConfigurator'
);

if (variantField?.validationRules?.variantFields) {
  // Use backend-defined configuration
  return variantField.validationRules.variantFields;
}
```

**Option 2: Auto-Generated (Fallback)**
```typescript
const autoConfig = [
  // Dimension columns (dynamic)
  ...dimensions.map(dim => ({
    name: dim.name,
    label: dim.label,
    type: 'select'
  })),

  // Standard columns (fixed)
  { name: 'variantImages', label: 'Images', type: 'images' },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'cost', label: 'Cost', type: 'number' },
  { name: 'comparePrice', label: 'Compare Price', type: 'number' },
  { name: 'stock', label: 'Stock', type: 'number' },
  { name: 'sku', label: 'SKU', type: 'text' },
  { name: 'weight', label: 'Weight', type: 'number' },
  { name: 'barcode', label: 'Barcode', type: 'text' }
];
```

### Table Rendering (Line 471-547)

```typescript
<table>
  <thead>
    <tr>
      {/* Render column headers from variantConfig */}
      {variantConfig.map(field => (
        <th key={field.name}>{field.label}</th>
      ))}
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {/* Render one row per variant */}
    {variants.map(variant => (
      <tr key={variant.id}>
        {/* Render cells based on field type */}
        {variantConfig.map(field => (
          <td key={field.name}>
            {renderCell(field, variant)}
          </td>
        ))}
        <td>
          <button onClick={() => deleteVariant(variant.id)}>🗑️</button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

### Cell Rendering by Type (Line 492-527)

```typescript
function renderCell(field, variant) {
  switch (field.type) {
    case 'images':
      return (
        <VariantMultiImageUpload
          variantId={variant.id}
          currentImages={variant[field.name] || []}
          onImagesChange={(urls) => updateVariant(variant.id, field.name, urls)}
          organizationId={organizationId}
          productId={productId}
          maxImages={5}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={variant[field.name] || 0}
          onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
          className="w-20 p-1 border rounded"
          step={['price', 'cost', 'comparePrice'].includes(field.name) ? "0.01" : "1"}
        />
      );

    case 'text':
      return (
        <input
          type="text"
          value={variant[field.name] || ''}
          onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
          className="w-24 p-1 border rounded"
        />
      );

    case 'select':
      // For dimension columns, just display the value (not editable)
      return <span>{variant[field.name] || '-'}</span>;

    default:
      return <span>{variant[field.name] || '-'}</span>;
  }
}
```

---

## Category Change Behavior

### The Problem

When user switches from "Electronics" to "Apparel":
- Electronics has dimensions: Storage, Color, Connectivity
- Apparel has dimensions: Size, Color, Material
- If we don't clear selections, user would see wrong dimensions with old selections

### The Solution (Line 221-248)

```typescript
React.useEffect(() => {
  const currentCategory = formData?.category;
  const categoryChanged = currentCategory !== lastCategory;

  if (categoryChanged && variantDimensions.length > 0) {
    console.log('Category changed - Resetting all selections');

    // Reset selections for ALL dimensions to empty
    const resetSelections: Record<string, string[]> = {};
    variantDimensions.forEach(dim => {
      resetSelections[dim.name] = [];
    });

    setSelectedOptions(resetSelections);
    setVariants([]);
    setLastCategory(currentCategory);
  }
}, [formData?.category, variantDimensions, lastCategory]);
```

### Example Flow

```
Initial State:
  category: "electronics"
  selectedOptions: {
    storageCapacity: ["128gb", "256gb"],
    color: ["black"],
    connectivityType: ["wifi"]
  }
  variants: [4 variants generated]

User Action: Change category to "apparel"
  ↓
Effect Triggers:
  currentCategory: "apparel"
  lastCategory: "electronics"
  categoryChanged: true ✓
  ↓
Reset Logic:
  New dimensions detected: [size, color, material]
  resetSelections = {
    size: [],
    color: [],
    material: []
  }
  ↓
State Updates:
  selectedOptions = { size: [], color: [], material: [] }
  variants = []
  lastCategory = "apparel"
  ↓
UI Re-renders:
  - All checkboxes unchecked
  - No variants in table
  - Button shows: "Generate Variants (0 × 0 × 0 = 1)"
```

**CRITICAL:** This only triggers on **category change**, not on other field changes (like hasVariants, price, etc.).

---

## Common Patterns & Examples

### Pattern 1: Dimension Detection

**Scenario:** Backend adds new dimension "batteryType" for electronics

**Backend Schema:**
```json
{
  "fieldName": "batteryType",
  "fieldType": "SELECT",
  "options": [
    { "value": "lithium", "label": "Lithium Ion" },
    { "value": "nimh", "label": "NiMH" }
  ],
  "conditionalVisibility": {
    "showWhen": "hasVariants === true && category === 'electronics'"
  }
}
```

**Result:**
- No frontend code changes needed ✓
- Field name "batteryType" contains "type" → matches pattern ✓
- Automatically detected as 4th dimension ✓
- Appears in dimension selectors ✓
- Included in Cartesian product ✓

### Pattern 2: Variant ID Stability

**Scenario:** User generates variants, uploads images, then regenerates

**Initial Generation:**
```
Selected: Storage = [128gb], Color = [black]
Generated: [{ id: "128gb-black", variantImages: [], price: 0 }]
User uploads 3 images to "128gb-black"
State: [{ id: "128gb-black", variantImages: ["url1", "url2", "url3"], price: 999 }]
```

**User Adds More Options:**
```
Selected: Storage = [128gb, 256gb], Color = [black]
Clicks "Generate Variants"
```

**Regeneration Logic:**
```typescript
New combinations: ["128gb-black", "256gb-black"]

For "128gb-black":
  - Find existing variant with id="128gb-black" ✓
  - Copy variantImages: ["url1", "url2", "url3"] ✓
  - Copy price: 999 ✓
  - Result: Images preserved!

For "256gb-black":
  - Find existing variant with id="256gb-black" ✗
  - No existing data
  - Create new: { variantImages: [], price: 0 }
```

### Pattern 3: Conditional Visibility Expression

**Complex Expression:**
```json
{
  "fieldName": "premiumFeatures",
  "conditionalVisibility": {
    "showWhen": "hasVariants === true && category === 'electronics' && price > 1000"
  }
}
```

**Evaluation When:**
```javascript
formData = {
  hasVariants: true,
  category: "electronics",
  price: 1299.99
}

Expression: "hasVariants === true && category === 'electronics' && price > 1000"

Step 1: Replace variables
  "true === true && 'electronics' === 'electronics' && 1299.99 > 1000"

Step 2: Evaluate
  new Function("return true === true && 'electronics' === 'electronics' && 1299.99 > 1000")()
  → true

Result: Field is visible ✓
```

### Pattern 4: Multi-Image Upload to Variant

**User Flow:**
```
1. User clicks [+] button in Images column for variant "128gb-black-wifi"
2. Selects 3 image files from computer
3. VariantMultiImageUpload component:
   - Uploads file 1 to GCP → gets URL1
   - Uploads file 2 to GCP → gets URL2
   - Uploads file 3 to GCP → gets URL3
4. Calls: onImagesChange([URL1, URL2, URL3])
5. VariantConfiguratorDynamic.updateVariant("128gb-black-wifi", "variantImages", [URL1, URL2, URL3])
6. Updates local variant array
7. Calls updateParent() → parent formData updated
8. VariantMultiImageUpload re-renders showing: [📷][📷][📷][+] 3/5
```

### Pattern 5: Variant Deletion

**User Flow:**
```
1. User clicks 🗑️ button for variant "256gb-silver-wifi_cellular"
2. onClick handler:
   const newVariants = variants.filter(v => v.id !== "256gb-silver-wifi_cellular");
   setVariants(newVariants);
   updateParent(newVariants, selectedOptions);
3. Local state updated: 8 variants → 7 variants
4. Parent updated: formData.variantConfigurator contains 7 variants
5. Table re-renders showing 7 rows
```

---

## Quick Reference

### Key Files & Line Numbers

**VariantConfiguratorDynamic.tsx:**
- Line 42-68: Expression-based conditional visibility evaluation
- Line 71-180: Automatic dimension detection from schema
- Line 216-218: State variables (selectedOptions, variants, lastCategory)
- Line 221-248: Category change detection & reset logic
- Line 290-302: Option selection handler
- Line 304-401: Cartesian product generation (recursive algorithm)
- Line 404-410: Variant update handler (notifies parent)
- Line 418-575: UI rendering (dimension selectors + table)

**DynamicProductCreationFormRefactored.tsx:**
- Line 605-748: Variant section rendering
- Line 734-741: Props passed to VariantConfiguratorDynamic

### Important Concepts

**Dimension Discovery:** Pattern matching on field names (color, size, type, capacity, etc.)

**Conditional Visibility:** Expression-based evaluation using `showWhen` property

**Cartesian Product:** Recursive algorithm generating all combinations

**Variant ID:** Generated from dimension values, enables data preservation

**State Updates:** Local state for generation, parent updates on edits

**Category Change:** Automatic reset of selections and variants

---

## Summary: How It All Works Together

1. **User selects category** → Schema loaded with category-specific fields
2. **User enables variants** → `hasVariants = true` makes dimension fields visible
3. **System detects dimensions** → Pattern matching on SELECT fields
4. **User selects dimension values** → Checkboxes update local state
5. **User clicks Generate** → Cartesian product creates all combinations
6. **Table renders** → Dynamic columns from config, rows from variants
7. **User edits variants** → Updates propagate to parent form
8. **User submits form** → All variant data included in submission

**No hardcoding. Everything is driven by schema data and user selections.**

---

**Document Version:** 3.0 (Complete rewrite based on actual code)
**Last Updated:** 2026-01-20
**Maintained By:** Frontend Team
**Verified Against:** VariantConfiguratorDynamic.tsx implementation
