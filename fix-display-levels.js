// MongoDB Script: Fix Required Fields Display Levels
// Execute: mongosh labamap < fix-display-levels.js
// Or copy-paste into mongosh after: use labamap

print("=== Starting Display Level Fixes ===\n");

// Step 1: Verify current state
print("STEP 1: Current State");
print("-".repeat(50));
db.ecommerce_product_schema.aggregate([
  { $match: { organizationId: "company_abc_12345" } },
  { $unwind: "$fields" },
  { $match: { "fields.fieldName": { $in: ["mainImage", "status", "inventory"] } } },
  { $project: {
      _id: 0,
      fieldName: "$fields.fieldName",
      displayLevel: "$fields.displayLevel",
      required: "$fields.required",
      defaultValue: "$fields.defaultValue"
    }
  }
]).forEach(doc => printjson(doc));

// Step 2: Update mainImage to ESSENTIAL
print("\nSTEP 2: Updating mainImage to ESSENTIAL");
print("-".repeat(50));
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
print(`✓ Modified ${mainImageResult.modifiedCount} document(s)`);

// Step 3: Update status to ESSENTIAL with default
print("\nSTEP 3: Updating status to ESSENTIAL with default 'draft'");
print("-".repeat(50));
const statusResult = db.ecommerce_product_schema.updateMany(
  {
    organizationId: "company_abc_12345",
    "fields.fieldName": "status"
  },
  {
    $set: {
      "fields.$[elem].displayLevel": "ESSENTIAL",
      "fields.$[elem].defaultValue": "draft"
    }
  },
  {
    arrayFilters: [{ "elem.fieldName": "status" }]
  }
);
print(`✓ Modified ${statusResult.modifiedCount} document(s)`);

// Step 4: Add default to inventory
print("\nSTEP 4: Adding default value to inventory");
print("-".repeat(50));
const inventoryResult = db.ecommerce_product_schema.updateMany(
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
print(`✓ Modified ${inventoryResult.modifiedCount} document(s)`);

// Step 5: Verify final state
print("\nSTEP 5: Final State (After Changes)");
print("-".repeat(50));
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

print("\n" + "=".repeat(50));
print("✅ COMPLETE - Display levels updated successfully!");
print("=".repeat(50));
print("\nNext steps:");
print("1. Refresh your browser: http://localhost:3000/products/create");
print("2. Check that mainImage, status, and inventory fields are visible");
print("3. Try submitting the form - validation errors should be gone");
