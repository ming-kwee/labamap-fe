# Variant Fields Missing from Backend Schema

**Date**: 2026-01-02
**Issue**: Variant section (hasVariants checkbox + configurator) not appearing in product form
**Root Cause**: Backend schema missing required variant field definitions

---

## Problem Analysis

### Current Backend Response

**Request**:
```bash
curl -X POST "http://localhost:8888/labamap/api/v1/ecommerce/form-schema/generate" \
  -H "Content-Type: application/json" \
  -d '{"context":{"userId":"demo_user_123","organizationId":"company_abc_12345","userRole":"BUSINESS_USER","targetChannels":["shopify"],"productCategory":"","permissions":[]}}'
```

**Response**:
```json
{
  "formSchema": {
    "fields": [],  // ← EMPTY! No fields at all
    "groups": [],
    "metadata": {
      "fieldCount": 0
    }
  }
}
```

**Problem**: Empty `fields` array = no variants, no form fields at all.

---

## Why Variants Don't Appear

### Frontend Rendering Logic

**File**: `DynamicProductCreationFormRefactored.tsx` (Lines 602-614)

```typescript
// Find variantConfigurator field in schema
const variantField = schema.fields.find((field: any) => {
  const fieldType = (field.fieldType || '').toLowerCase();
  return fieldType === 'variant_configurator' || fieldType === 'variant-configurator';
});

// ⚠️ CRITICAL: Only render section if variantConfigurator field exists
if (!variantField) return null; // ← Entire variant section hidden!
```

**Result**: Without a `variant_configurator` field, the entire variant section (including hasVariants checkbox) won't render.

---

## What Backend Schema MUST Include

### 1. ✅ **REQUIRED**: Variant Configurator Field

This field triggers the rendering of the entire variant section.

```javascript
{
  fieldName: "variantConfigurator",
  fieldType: "variant_configurator",  // ← MUST be exactly this (case-insensitive)
  label: "Product Variants",
  description: "Configure product variations like size, color, and material",
  required: false,
  section: "variants",
  displayLevel: "enhanced",
  order: 100,
  validationRules: {
    // Optional: explicitly define variant table columns
    variantFields: [
      { name: "color", label: "Color", type: "select" },
      { name: "size", label: "Size", type: "select" },
      { name: "price", label: "Price", type: "number" },
      { name: "stock", label: "Stock", type: "number" },
      { name: "sku", label: "SKU", type: "text" },
      { name: "barcode", label: "Barcode", type: "text" }
    ]
  }
}
```

**Without this field**: Variant section won't render at all.

---

### 2. ✅ **OPTIONAL**: HasVariants Field

This field provides custom label and help text for the checkbox. If missing, defaults will be used.

```javascript
{
  fieldName: "hasVariants",
  fieldType: "boolean",
  label: "This product has variants",
  helpText: "Enable this to configure product variations (e.g., different sizes, colors, materials)",
  required: false,
  section: "variants",
  displayLevel: "essential",
  order: 99
}
```

**Without this field**: Checkbox still renders but uses default text:
- Default Label: "This product has variants"
- Default Help: "Enable this to configure product variations (e.g., different sizes, colors, materials)"

---

### 3. ✅ **REQUIRED**: Variant Dimension Fields (SELECT fields)

The VariantConfiguratorDynamic component auto-detects variant dimensions from SELECT fields.

**Auto-Detection Rules** (from `VariantConfiguratorDynamic.tsx` lines 78-133):

1. **Field Type MUST be**: `SELECT` or `select`
2. **Field MUST have**: `options` array with at least 1 option
3. **Field name MUST contain** (case-insensitive):
   - `color`
   - `size`
   - `material`
   - `style`
   - `pattern`
   - `finish`
   - `texture`
   - `fabric`
   - `type`
   - `variant`

**OR** be explicitly marked:
   - `validationRules.isVariantDimension: true`
   - `businessContext.variantDimension: true`
   - `metadata.variantDimension: true`

**Example Variant Dimension Fields**:

```javascript
// Color dimension
{
  fieldName: "color",
  fieldType: "select",  // ← MUST be SELECT
  label: "Color",
  required: false,
  section: "variants",
  displayLevel: "enhanced",
  order: 101,
  options: [  // ← MUST have options
    { label: "Red", value: "red" },
    { label: "Blue", value: "blue" },
    { label: "Green", value: "green" },
    { label: "Black", value: "black" },
    { label: "White", value: "white" }
  ]
}

// Size dimension
{
  fieldName: "size",
  fieldType: "select",  // ← MUST be SELECT
  label: "Size",
  required: false,
  section: "variants",
  displayLevel: "enhanced",
  order: 102,
  options: [  // ← MUST have options
    { label: "Small", value: "S" },
    { label: "Medium", value: "M" },
    { label: "Large", value: "L" },
    { label: "X-Large", value: "XL" },
    { label: "2X-Large", value: "2XL" }
  ]
}

// Material dimension (using explicit marking)
{
  fieldName: "material",
  fieldType: "select",
  label: "Material",
  required: false,
  section: "variants",
  displayLevel: "enhanced",
  order: 103,
  options: [
    { label: "Cotton", value: "cotton" },
    { label: "Polyester", value: "polyester" },
    { label: "Wool", value: "wool" },
    { label: "Silk", value: "silk" }
  ],
  validationRules: {
    isVariantDimension: true  // ← Explicit marking (alternative to name pattern)
  }
}
```

**Without these fields**: Variant configurator renders but has NO dimensions to configure (empty state).

---

### 4. 📋 **Optional**: Category-Specific Variant Fields

Use `conditionalVisibility` to show variant dimensions only for specific categories.

**Example**: Show "clothingSize" only for clothing category

```javascript
{
  fieldName: "clothingSize",
  fieldType: "select",
  label: "Clothing Size",
  required: false,
  section: "variants",
  displayLevel: "category-specific",
  order: 104,
  options: [
    { label: "XS", value: "xs" },
    { label: "S", value: "s" },
    { label: "M", value: "m" },
    { label: "L", value: "l" },
    { label: "XL", value: "xl" }
  ],
  conditionalVisibility: {
    showWhen: "category === 'clothing'"  // ← Only for clothing
  }
}

// Electronics-specific variant
{
  fieldName: "storageSize",
  fieldType: "select",
  label: "Storage Capacity",
  required: false,
  section: "variants",
  displayLevel: "category-specific",
  order: 105,
  options: [
    { label: "64GB", value: "64gb" },
    { label: "128GB", value: "128gb" },
    { label: "256GB", value: "256gb" },
    { label: "512GB", value: "512gb" }
  ],
  conditionalVisibility: {
    showWhen: "category === 'electronics'"
  }
}
```

---

## Complete Minimal Example for MongoDB

### Insert into `ecommerce_product_schema` Collection

```javascript
db.ecommerce_product_schema.updateOne(
  {
    organizationId: "company_abc_12345",
    channelId: "master",
    category: "",
    userRole: "BUSINESS_USER"
  },
  {
    $push: {
      fields: {
        $each: [
          // 1. REQUIRED: Variant Configurator Field
          {
            fieldName: "variantConfigurator",
            fieldType: "variant_configurator",
            label: "Product Variants",
            description: "Configure product variations",
            required: false,
            section: "variants",
            displayLevel: "enhanced",
            order: 100
          },

          // 2. OPTIONAL: HasVariants Boolean Field
          {
            fieldName: "hasVariants",
            fieldType: "boolean",
            label: "This product has variants",
            helpText: "Enable this to configure product variations (e.g., different sizes, colors, materials)",
            required: false,
            section: "variants",
            displayLevel: "essential",
            order: 99
          },

          // 3. REQUIRED: Variant Dimension - Color
          {
            fieldName: "color",
            fieldType: "select",
            label: "Color",
            required: false,
            section: "variants",
            displayLevel: "enhanced",
            order: 101,
            options: [
              { label: "Red", value: "red" },
              { label: "Blue", value: "blue" },
              { label: "Green", value: "green" },
              { label: "Black", value: "black" },
              { label: "White", value: "white" }
            ]
          },

          // 4. REQUIRED: Variant Dimension - Size
          {
            fieldName: "size",
            fieldType: "select",
            label: "Size",
            required: false,
            section: "variants",
            displayLevel: "enhanced",
            order: 102,
            options: [
              { label: "Small", value: "S" },
              { label: "Medium", value: "M" },
              { label: "Large", value: "L" },
              { label: "X-Large", value: "XL" }
            ]
          }
        ]
      }
    }
  },
  { upsert: true }
);
```

---

## Verification Steps

### Step 1: Test Backend Response

```bash
curl -X POST "http://localhost:8888/labamap/api/v1/ecommerce/form-schema/generate" \
  -H "Content-Type: application/json" \
  -d '{"context":{"userId":"demo_user_123","organizationId":"company_abc_12345","userRole":"BUSINESS_USER","targetChannels":["shopify"],"productCategory":"","permissions":[]}}' \
  | jq '.formSchema.fields[] | select(.fieldType | test("variant"; "i")) | {fieldName, fieldType, label}'
```

**Expected Output**:
```json
{
  "fieldName": "variantConfigurator",
  "fieldType": "variant_configurator",
  "label": "Product Variants"
}
{
  "fieldName": "hasVariants",
  "fieldType": "boolean",
  "label": "This product has variants"
}
```

**Check for variant dimensions**:
```bash
curl -X POST "http://localhost:8888/labamap/api/v1/ecommerce/form-schema/generate" \
  -H "Content-Type: application/json" \
  -d '{"context":{"userId":"demo_user_123","organizationId":"company_abc_12345","userRole":"BUSINESS_USER","targetChannels":["shopify"],"productCategory":"","permissions":[]}}' \
  | jq '.formSchema.fields[] | select(.fieldType == "select" and (.fieldName | test("color|size|material"; "i"))) | {fieldName, options: .options | length}'
```

**Expected Output**:
```json
{
  "fieldName": "color",
  "options": 5
}
{
  "fieldName": "size",
  "options": 4
}
```

---

### Step 2: Test Frontend Rendering

**Navigate to**: `http://localhost:3000/products/create`

**Check browser console for**:
```
[VariantConfiguratorDynamic] Detecting variant dimensions from schema
[VariantConfiguratorDynamic] Detected dimensions: [{name: "color", ...}, {name: "size", ...}]
```

**UI should show**:
1. ✅ **Variant Section Card** with title "Product Variants"
2. ✅ **HasVariants Checkbox** with label "This product has variants"
3. ✅ **Variant Dimension Selectors** (Color, Size checkboxes)
4. ✅ **Generate Variants Button**
5. ✅ **Variant Table** (after generating)

---

### Step 3: Console Logs to Watch

**If variant section DOES NOT appear**:
```javascript
// DynamicProductCreationFormRefactored.tsx line 614
if (!variantField) return null; // ← Check this is being hit
```

**Check console for**:
```
[ProductForm] 📊 Current Hook Values: {
  schemaFieldCount: 0,  // ← Should be > 0
  ...
}
```

**If variant dimensions NOT detected**:
```javascript
// VariantConfiguratorDynamic.tsx line 72-75
console.log('🔥 [VariantConfiguratorDynamic] ❌ No schema or fields available');
```

**OR**:
```javascript
// VariantConfiguratorDynamic.tsx line 94
console.log(`🔥 [VariantConfiguratorDynamic] Field "${fieldName}" rejected: no valid options`);
```

---

## Common Issues & Solutions

### Issue 1: "Variant section doesn't appear at all"

**Cause**: Missing `variant_configurator` field

**Solution**: Add field to schema:
```javascript
{
  fieldName: "variantConfigurator",
  fieldType: "variant_configurator",  // ← Case-insensitive but must match
  ...
}
```

---

### Issue 2: "Variant section appears but no dimensions available"

**Cause**: No SELECT fields with variant-related names

**Solution**: Add SELECT fields with options:
```javascript
{
  fieldName: "color",  // ← Name must contain variant keyword
  fieldType: "select",  // ← MUST be select
  options: [...]  // ← MUST have options
}
```

**OR** use explicit marking:
```javascript
{
  fieldName: "productStyle",  // ← Name doesn't match pattern
  fieldType: "select",
  options: [...],
  validationRules: {
    isVariantDimension: true  // ← Explicit marking
  }
}
```

---

### Issue 3: "Some dimensions appear, others don't"

**Cause**: Field doesn't match auto-detection rules

**Debug**:
```javascript
// Check console logs
console.log('[VariantConfiguratorDynamic] Field "xxx" analysis:', {
  isCommonVariantField: false,  // ← Name doesn't match pattern
  isExplicitVariantDimension: false,  // ← No explicit marking
  finalDecision: false  // ← Won't be used as dimension
});
```

**Solution**: Either:
1. Rename field to match pattern (color, size, material, etc.)
2. OR add explicit marking: `validationRules.isVariantDimension: true`

---

### Issue 4: "Category-specific variant doesn't show for category"

**Cause**: Conditional visibility not evaluating correctly

**Debug**:
```javascript
console.log('[VariantConfiguratorDynamic] Field "xxx" analysis:', {
  isVariantField: true,
  isVisible: false,  // ← Conditional check failed
  conditionalVisibility: { showWhen: "category === 'electronics'" },
  currentCategory: "clothing"  // ← Mismatch!
});
```

**Solution**: Verify:
1. `conditionalVisibility.showWhen` expression is correct
2. `formData.category` value matches expected value
3. Expression uses correct JavaScript syntax

---

## Field Type Reference

### Supported Variant Field Types

| Field Type | Purpose | Required | Example |
|-----------|---------|----------|---------|
| `variant_configurator` | Triggers variant section | ✅ YES | Main configurator UI |
| `boolean` | HasVariants checkbox | ⚠️ Optional | "This product has variants" |
| `select` | Variant dimensions | ✅ YES | Color, Size, Material |

### Field Naming Patterns (Auto-Detection)

| Pattern | Detected As | Example |
|---------|-------------|---------|
| `*color*` | Color dimension | `color`, `productColor`, `variantColor` |
| `*size*` | Size dimension | `size`, `clothingSize`, `packageSize` |
| `*material*` | Material dimension | `material`, `fabricMaterial` |
| `*style*` | Style dimension | `style`, `productStyle` |
| `*type*` | Type dimension | `type`, `productType` |
| `*variant*` | Generic variant | `variant`, `variantOption` |

**Note**: Patterns are case-insensitive.

---

## Summary

### What's Missing from Backend

Based on current empty schema, you need to add to MongoDB:

**Minimum Required Fields** (3 fields):
1. ✅ `variantConfigurator` field (fieldType: `variant_configurator`)
2. ✅ `color` field (fieldType: `select`, with options)
3. ✅ `size` field (fieldType: `select`, with options)

**Optional But Recommended** (1 field):
4. ⚠️ `hasVariants` field (fieldType: `boolean`)

**Total**: 4 fields minimum to see variants working.

### Quick Test Script

```javascript
// Run this in mongosh to add minimal variant fields
db.ecommerce_product_schema.updateOne(
  { organizationId: "company_abc_12345", channelId: "master" },
  {
    $set: {
      fields: [
        {
          fieldName: "variantConfigurator",
          fieldType: "variant_configurator",
          label: "Product Variants",
          section: "variants",
          displayLevel: "enhanced",
          order: 100
        },
        {
          fieldName: "hasVariants",
          fieldType: "boolean",
          label: "This product has variants",
          section: "variants",
          displayLevel: "essential",
          order: 99
        },
        {
          fieldName: "color",
          fieldType: "select",
          label: "Color",
          section: "variants",
          displayLevel: "enhanced",
          order: 101,
          options: [
            { label: "Red", value: "red" },
            { label: "Blue", value: "blue" },
            { label: "Black", value: "black" }
          ]
        },
        {
          fieldName: "size",
          fieldType: "select",
          label: "Size",
          section: "variants",
          displayLevel: "enhanced",
          order: 102,
          options: [
            { label: "S", value: "S" },
            { label: "M", value: "M" },
            { label: "L", value: "L" }
          ]
        }
      ]
    }
  },
  { upsert: true }
);
```

Then test:
```bash
curl -X POST "http://localhost:8888/labamap/api/v1/ecommerce/form-schema/generate" \
  -H "Content-Type: application/json" \
  -d '{"context":{"userId":"demo_user_123","organizationId":"company_abc_12345","userRole":"BUSINESS_USER","targetChannels":["shopify"],"productCategory":"","permissions":[]}}' \
  | jq '.formSchema.fields | length'
```

Should return: **4** (not 0)

---

**Created**: 2026-01-02
**Status**: Diagnostic complete - backend schema needs 4 variant fields
**Next Step**: Re-seed MongoDB with variant field definitions
