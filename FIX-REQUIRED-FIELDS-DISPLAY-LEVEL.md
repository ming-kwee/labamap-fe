# Fix Required Fields Display Level

**Date**: 2026-01-02
**Issue**: Required fields (`mainImage`, `status`) are marked as ADVANCED and hidden from users
**Solution**: Change display level from ADVANCED to ESSENTIAL for required fields
**Status**: ✅ Solution Ready - Execute MongoDB commands

---

## Problem Analysis

### Validation Error

Backend rejected product submission with:
```json
{
  "errors": [
    "Field 'inventory' must be at least 0.0",
    "Required field 'mainImage' is missing",
    "Required field 'status' is missing"
  ]
}
```

### Root Cause

**Required fields have wrong display level**:

| Field | Required | Display Level | Visible in Form? |
|-------|----------|---------------|------------------|
| `mainImage` | ✅ True | ❌ ADVANCED | ❌ NO (filtered out) |
| `status` | ✅ True | ❌ ADVANCED | ❌ NO (filtered out) |
| `inventory` | ✅ True | ✅ BASIC | ✅ YES (should show) |

**Frontend Filter Logic** (DynamicProductCreationFormRefactored.tsx:333-335):
```typescript
if (formStage === 'essential') {
  return isEssential || isBasic;  // ← Only shows ESSENTIAL and BASIC
}
```

**Result**: Required ADVANCED fields are hidden → User can't fill them → Submission fails

---

## Solution: MongoDB Update Commands

### Step 1: Connect to MongoDB

```bash
mongosh labamap
```

Or if using docker:
```bash
docker exec -it <mongo-container> mongosh labamap
```

---

### Step 2: Verify Current State

Check the current display levels:

```javascript
db.ecommerce_product_schema.find(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": { $in: ["mainImage", "status", "inventory"] }
  },
  {
    "fields.$": 1
  }
).forEach(doc => {
  doc.fields.forEach(field => {
    if (["mainImage", "status", "inventory"].includes(field.fieldName)) {
      print(`Field: ${field.fieldName}`);
      print(`  Display Level: ${field.displayLevel}`);
      print(`  Required: ${field.required}`);
      print("");
    }
  });
});
```

**Expected Current Values**:
```
Field: mainImage
  Display Level: ADVANCED
  Required: true

Field: status
  Display Level: ADVANCED
  Required: true

Field: inventory
  Display Level: BASIC
  Required: true
```

---

### Step 3: Update mainImage Display Level

Change `mainImage` from ADVANCED to ESSENTIAL:

```javascript
db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "mainImage"
  },
  {
    $set: {
      "fields.$[elem].displayLevel": "ESSENTIAL"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "mainImage" }]
  }
);
```

**Verify**:
```javascript
db.ecommerce_product_schema.findOne(
  { organizationId: "company_abc_12345", "fields.fieldName": "mainImage" },
  { "fields.$": 1 }
).fields[0].displayLevel;
// Should return: "ESSENTIAL"
```

---

### Step 4: Update status Display Level

Change `status` from ADVANCED to ESSENTIAL:

```javascript
db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "status"
  },
  {
    $set: {
      "fields.$[elem].displayLevel": "ESSENTIAL"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "status" }]
  }
);
```

**Verify**:
```javascript
db.ecommerce_product_schema.findOne(
  { organizationId: "company_abc_12345", "fields.fieldName": "status" },
  { "fields.$": 1 }
).fields[0].displayLevel;
// Should return: "ESSENTIAL"
```

---

### Step 5: Verify inventory (No change needed)

Check `inventory` is already BASIC:

```javascript
db.ecommerce_product_schema.findOne(
  { organizationId: "company_abc_12345", "fields.fieldName": "inventory" },
  { "fields.$": 1 }
).fields[0].displayLevel;
// Should return: "BASIC" (already correct)
```

---

### Step 6: Add Default Values (Optional)

For better UX, add default values to make fields "pseudo-required":

#### Add default status = "draft"

```javascript
db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "status"
  },
  {
    $set: {
      "fields.$[elem].defaultValue": "draft"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "status" }]
  }
);
```

#### Add default inventory = 0

```javascript
db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "inventory"
  },
  {
    $set: {
      "fields.$[elem].defaultValue": 0
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "inventory" }]
  }
);
```

---

### Step 7: Verify All Changes

Run comprehensive check:

```javascript
db.ecommerce_product_schema.aggregate([
  {
    $match: {
      organizationId: "company_abc_12345"
    }
  },
  {
    $unwind: "$fields"
  },
  {
    $match: {
      "fields.fieldName": { $in: ["mainImage", "status", "inventory"] }
    }
  },
  {
    $project: {
      _id: 0,
      fieldName: "$fields.fieldName",
      displayLevel: "$fields.displayLevel",
      required: "$fields.required",
      defaultValue: "$fields.defaultValue",
      fieldType: "$fields.fieldType"
    }
  },
  {
    $sort: { fieldName: 1 }
  }
]);
```

**Expected Output**:
```json
[
  {
    "fieldName": "inventory",
    "displayLevel": "BASIC",
    "required": true,
    "defaultValue": 0,
    "fieldType": "NUMBER"
  },
  {
    "fieldName": "mainImage",
    "displayLevel": "ESSENTIAL",
    "required": true,
    "defaultValue": null,
    "fieldType": "FILE"
  },
  {
    "fieldName": "status",
    "displayLevel": "ESSENTIAL",
    "required": true,
    "defaultValue": "draft",
    "fieldType": "SELECT"
  }
]
```

---

## Complete Script (Copy-Paste)

Execute this entire script in mongosh:

```javascript
// Connect to labamap database
use labamap;

print("=== STEP 1: Verify Current State ===");
db.ecommerce_product_schema.aggregate([
  { $match: { organizationId: "company_abc_12345" } },
  { $unwind: "$fields" },
  { $match: { "fields.fieldName": { $in: ["mainImage", "status", "inventory"] } } },
  { $project: {
      _id: 0,
      fieldName: "$fields.fieldName",
      displayLevel: "$fields.displayLevel",
      required: "$fields.required"
    }
  }
]).forEach(doc => printjson(doc));

print("\n=== STEP 2: Update mainImage Display Level ===");
const mainImageResult = db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "mainImage"
  },
  {
    $set: {
      "fields.$[elem].displayLevel": "ESSENTIAL"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "mainImage" }]
  }
);
print(`Modified: ${mainImageResult.modifiedCount} documents`);

print("\n=== STEP 3: Update status Display Level ===");
const statusResult = db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "status"
  },
  {
    $set: {
      "fields.$[elem].displayLevel": "ESSENTIAL"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "status" }]
  }
);
print(`Modified: ${statusResult.modifiedCount} documents`);

print("\n=== STEP 4: Add Default Values ===");
const statusDefaultResult = db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "status"
  },
  {
    $set: {
      "fields.$[elem].defaultValue": "draft"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "status" }]
  }
);
print(`Status default added: ${statusDefaultResult.modifiedCount} documents`);

const inventoryDefaultResult = db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "inventory"
  },
  {
    $set: {
      "fields.$[elem].defaultValue": 0
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "inventory" }]
  }
);
print(`Inventory default added: ${inventoryDefaultResult.modifiedCount} documents`);

print("\n=== STEP 5: Verify Final State ===");
db.ecommerce_product_schema.aggregate([
  { $match: { organizationId: "company_abc_12345" } },
  { $unwind: "$fields" },
  { $match: { "fields.fieldName": { $in: ["mainImage", "status", "inventory"] } } },
  { $project: {
      _id: 0,
      fieldName: "$fields.fieldName",
      displayLevel: "$fields.displayLevel",
      required: "$fields.required",
      defaultValue: "$fields.defaultValue",
      fieldType: "$fields.fieldType"
    }
  },
  { $sort: { fieldName: 1 } }
]).forEach(doc => printjson(doc));

print("\n✅ COMPLETE - Changes applied successfully!");
```

---

## Expected Changes

### Before

| Field | Display Level | Required | Default | Visible? |
|-------|---------------|----------|---------|----------|
| mainImage | ADVANCED | true | - | ❌ NO |
| status | ADVANCED | true | - | ❌ NO |
| inventory | BASIC | true | - | ✅ YES |

### After

| Field | Display Level | Required | Default | Visible? |
|-------|---------------|----------|---------|----------|
| mainImage | **ESSENTIAL** | true | - | ✅ **YES** |
| status | **ESSENTIAL** | true | **draft** | ✅ **YES** |
| inventory | BASIC | true | **0** | ✅ YES |

---

## Testing After Changes

### Test 1: Verify Frontend Shows Fields

**Action**: Refresh product form (`http://localhost:3000/products/create`)

**Expected**:
- ✅ `mainImage` field should appear (image upload)
- ✅ `status` field should appear (dropdown)
- ✅ `inventory` field should appear (number input)

**Check Browser Console**:
```
[useProductFormSchema] Schema loaded successfully. Stage: essential
[ProductForm] 📊 Current Hook Values: {
  schemaFieldCount: X,  // Should be higher than before
  ...
}
```

---

### Test 2: Check Field Rendering

**Open React DevTools** → Components → DynamicProductCreationFormRefactored

**Check `filteredFields` state**:
- Should include `mainImage`, `status`, `inventory`

**Check DOM**:
```html
<!-- Should see these fields rendered -->
<div data-field="mainImage">...</div>
<div data-field="status">...</div>
<div data-field="inventory">...</div>
```

---

### Test 3: Test Form Submission

**Fill in the form**:
1. Name: "Test Product"
2. Category: "Electronics"
3. Brand: "Test Brand"
4. SKU: "TEST-001"
5. Price: 100
6. **Status**: Select "draft" (should have default)
7. **Inventory**: 10 (or leave as 0 default)
8. **Main Image**: Upload an image (or skip if optional)

**Submit**:

**Expected Success**:
```json
{
  "success": true,
  "product": {
    "name": "Test Product",
    "status": "draft",
    "inventory": 10,
    "mainImage": "https://...",
    ...
  }
}
```

**Expected Console**:
```
✅ Product created successfully
```

---

### Test 4: Verify Backend Accepts Submission

**Check backend logs**:
```
Enhanced validation: PASSED
Product saved: prod_xxx
```

**No validation errors** for missing fields ✅

---

## Troubleshooting

### Issue 1: Fields Still Not Showing

**Check**:
1. Clear browser cache
2. Refresh page (hard refresh: Cmd+Shift+R)
3. Check if schema was actually updated in MongoDB

**Verify**:
```javascript
db.ecommerce_product_schema.findOne(
  { organizationId: "company_abc_12345" },
  { fields: { $elemMatch: { fieldName: "mainImage" } } }
).fields[0].displayLevel;
// Should return: "ESSENTIAL"
```

---

### Issue 2: Update Command Modified 0 Documents

**Cause**: Schema document doesn't exist or organizationId doesn't match

**Check**:
```javascript
db.ecommerce_product_schema.countDocuments({
  organizationId: "company_abc_12345"
});
// Should return: > 0
```

If 0, schema needs to be seeded first (see HARDCODED-DATA-FIX-SUMMARY.md)

---

### Issue 3: Field Shows But Still Validation Error

**Check**:
1. Is field value actually being submitted?
2. Check browser Network tab → Payload

**Debug**:
```typescript
// Add console.log in form submission
console.log('Submitting formData:', formData);
// Should include mainImage, status, inventory
```

---

## Alternative: Make Fields Optional

If you prefer to make fields optional instead of changing display level:

```javascript
// Make mainImage optional
db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "mainImage"
  },
  {
    $set: {
      "fields.$[elem].required": false,
      "fields.$[elem].validationRules.required": false
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "mainImage" }]
  }
);

// Make status optional
db.ecomm_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "status"
  },
  {
    $set: {
      "fields.$[elem].required": false,
      "fields.$[elem].validationRules.required": false,
      "fields.$[elem].defaultValue": "draft"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "status" }]
  }
);
```

**Note**: This changes business logic - only do if fields truly aren't required.

---

## Summary

**Problem**: Required fields hidden due to ADVANCED display level

**Solution**: Change display level to ESSENTIAL for required fields

**MongoDB Updates**:
- ✅ `mainImage`: ADVANCED → ESSENTIAL
- ✅ `status`: ADVANCED → ESSENTIAL + default "draft"
- ✅ `inventory`: Add default 0

**Expected Result**:
- ✅ All required fields visible in form
- ✅ Form submission succeeds
- ✅ No validation errors

**Execute**: Run the complete script in mongosh

---

**Created**: 2026-01-02
**Status**: ✅ Ready to execute
**Impact**: Fixes form submission validation errors
**Next Step**: Execute MongoDB script and test form
