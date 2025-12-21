// MongoDB Seed Script: Field Semantic Knowledge
// Run with: mongosh labamap < seed-semantic-types.js

// Connect to labamap database
use labamap;

print("\n==========================================");
print("Seeding Field Semantic Knowledge");
print("==========================================\n");

// Drop existing
print("Dropping existing semantic types...");
db.field_semantic_knowledge.deleteMany({});

// Insert semantic types
print("Inserting 10 semantic types...\n");

db.field_semantic_knowledge.insertMany([
  {
    semanticType: "PRODUCT_NAME",
    aliases: ["title", "name", "product_name", "productName", "item_name", "product_title", "Title"],
    commonPatterns: ["^product[_-]?name$", "^title$", "^name$", "^Title$"],
    keywords: ["product", "name", "title", "item"],
    baseConfidence: 95.0,
    description: "Primary product identifier/title",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "PRICE",
    aliases: ["price", "base_price", "unit_price", "cost", "amount", "selling_price", "StartPrice"],
    commonPatterns: ["^.*price$", "^cost$", "^amount$", "^StartPrice$"],
    keywords: ["price", "cost", "amount", "money"],
    baseConfidence: 98.0,
    description: "Product price/cost",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "SKU",
    aliases: ["sku", "product_code", "item_number", "article_number", "product_sku", "product_id"],
    commonPatterns: ["^sku$", "^.*code$", "^.*number$", "^product_id$"],
    keywords: ["sku", "code", "number"],
    baseConfidence: 99.0,
    description: "Stock keeping unit identifier",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "DESCRIPTION",
    aliases: ["description", "details", "product_description", "long_description", "body", "Description", "productDescription"],
    commonPatterns: ["^.*desc.*$", "^details$", "^body$", "^Description$"],
    keywords: ["description", "details", "body", "content"],
    baseConfidence: 90.0,
    description: "Product description/details",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "QUANTITY",
    aliases: ["quantity", "stock", "inventory", "qty", "available", "stock_quantity", "inventory_quantity", "Quantity"],
    commonPatterns: ["^.*qty$", "^.*quantity$", "^stock$", "^inventory$", "^Quantity$"],
    keywords: ["quantity", "stock", "inventory", "available"],
    baseConfidence: 92.0,
    description: "Available quantity/stock",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "BRAND",
    aliases: ["brand", "manufacturer", "vendor", "maker", "supplier", "Brand"],
    commonPatterns: ["^brand$", "^vendor$", "^manufacturer$", "^Brand$"],
    keywords: ["brand", "vendor", "manufacturer"],
    baseConfidence: 94.0,
    description: "Product brand/manufacturer",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "CATEGORY",
    aliases: ["category", "type", "product_type", "classification", "product_category", "productCategory", "CategoryID"],
    commonPatterns: ["^.*category$", "^.*type$", "^classification$", "^CategoryID$"],
    keywords: ["category", "type", "class"],
    baseConfidence: 88.0,
    description: "Product category/type",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "IMAGE",
    aliases: ["image", "picture", "photo", "main_image", "primary_image", "image_url", "img", "PictureURL", "mainImageUrl"],
    commonPatterns: ["^.*image.*$", "^.*img.*$", "^.*photo.*$", "^.*picture.*$", "^PictureURL$"],
    keywords: ["image", "picture", "photo", "img"],
    baseConfidence: 93.0,
    description: "Product image URL",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "BARCODE",
    aliases: ["barcode", "upc", "ean", "gtin", "isbn"],
    commonPatterns: ["^barcode$", "^upc$", "^ean$", "^gtin$"],
    keywords: ["barcode", "upc", "ean", "gtin"],
    baseConfidence: 99.0,
    description: "Product barcode/UPC/EAN",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "WEIGHT",
    aliases: ["weight", "product_weight", "item_weight", "shipping_weight"],
    commonPatterns: ["^.*weight$"],
    keywords: ["weight", "mass"],
    baseConfidence: 96.0,
    description: "Product weight",
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print("✅ Inserted 10 semantic types\n");

// Verify
print("==========================================");
print("Verification");
print("==========================================\n");

const semanticTypes = db.field_semantic_knowledge.find({}, {semanticType: 1, aliases: 1}).toArray();
semanticTypes.forEach(function(type) {
  print("  - " + type.semanticType + " (" + type.aliases.length + " aliases)");
});

print("\nTotal semantic types: " + db.field_semantic_knowledge.countDocuments());

print("\n==========================================");
print("✅ Semantic types seeded successfully!");
print("==========================================\n");
