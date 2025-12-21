// MongoDB Master Seed Script
// Seeds all required collections for the Channel Publishing System
// Run with: mongosh labamap < seed-all.js

print("\n");
print("╔════════════════════════════════════════════════════════════════╗");
print("║                                                                ║");
print("║     Channel Publishing System - Database Seeding              ║");
print("║                                                                ║");
print("╚════════════════════════════════════════════════════════════════╝");
print("\n");

// Connect to labamap database
use labamap;

print("Connected to database: labamap\n");

// ============================================================================
// STEP 1: Seed Channel Configurations
// ============================================================================

print("==========================================");
print("STEP 1/3: Channel Configurations");
print("==========================================\n");

db.channel_configurations.deleteMany({});

db.channel_configurations.insertMany([
  {
    channelId: "shopify",
    channelName: "Shopify",
    description: "Shopify e-commerce platform",
    isActive: true,
    version: "1.0",
    metadata: {
      variantSupport: true,
      apiVersion: "2024-01",
      maxVariants: 100,
      documentation: "https://shopify.dev/api/admin-rest/2024-01/resources/product"
    },
    requiredFields: ["title", "price", "inventory_quantity"],
    optionalFields: ["description", "vendor", "product_type", "tags", "barcode", "weight", "weight_unit"],
    fieldBoosts: [
      { sourceField: "brand", targetField: "vendor", boostValue: 10, reason: "Shopify uses 'vendor' for brand" },
      { sourceField: "category", targetField: "product_type", boostValue: 8, reason: "Shopify categorization" },
      { sourceField: "stock_quantity", targetField: "inventory_quantity", boostValue: 7, reason: "Shopify inventory naming" }
    ],
    fieldConstraints: {
      title: { type: "string", maxLength: 255, required: true },
      price: { type: "decimal", min: 0.01, required: true, decimalPlaces: 2 },
      inventory_quantity: { type: "integer", min: 0, required: true }
    },
    confidenceThresholds: {
      knowledge_based: 95,
      semantic_match: 85,
      similarity_match: 60,
      pattern_match: 75
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "amazon",
    channelName: "Amazon Seller Central",
    description: "Amazon marketplace for sellers",
    isActive: true,
    version: "1.0",
    metadata: {
      variantSupport: true,
      maxVariants: 2000,
      documentation: "https://sellercentral.amazon.com"
    },
    requiredFields: ["title", "brand", "price", "quantity", "product_id", "product_id_type"],
    optionalFields: ["bullet_point_1", "bullet_point_2", "bullet_point_3", "bullet_point_4", "bullet_point_5", "description", "search_terms", "main_image_url"],
    fieldBoosts: [
      { sourceField: "product_description", targetField: "bullet_point_1", boostValue: 12, reason: "Amazon bullet points" },
      { sourceField: "brand", targetField: "brand", boostValue: 15, reason: "Brand required by Amazon" },
      { sourceField: "barcode", targetField: "product_id", boostValue: 10, reason: "Amazon product identification" }
    ],
    fieldConstraints: {
      title: { type: "string", maxLength: 200, required: true },
      brand: { type: "string", maxLength: 50, required: true },
      bullet_point_1: { type: "string", maxLength: 500, required: false }
    },
    confidenceThresholds: {
      knowledge_based: 95,
      semantic_match: 85,
      similarity_match: 60,
      pattern_match: 75
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "walmart",
    channelName: "Walmart Marketplace",
    description: "Walmart online marketplace",
    isActive: true,
    version: "1.0",
    metadata: {
      variantSupport: false,
      documentation: "https://developer.walmart.com"
    },
    requiredFields: ["productName", "brand", "price", "sku", "upc"],
    optionalFields: ["productDescription", "mainImageUrl", "productCategory"],
    fieldBoosts: [
      { sourceField: "product_name", targetField: "productName", boostValue: 8, reason: "Walmart camelCase convention" },
      { sourceField: "barcode", targetField: "upc", boostValue: 15, reason: "UPC required by Walmart" }
    ],
    fieldConstraints: {
      productName: { type: "string", maxLength: 200, required: true },
      upc: { type: "string", pattern: "^[0-9]{12}$", required: true }
    },
    confidenceThresholds: {
      knowledge_based: 95,
      semantic_match: 85,
      similarity_match: 60,
      pattern_match: 75
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "ebay",
    channelName: "eBay",
    description: "eBay online auction and shopping",
    isActive: true,
    version: "1.0",
    metadata: {
      variantSupport: false,
      documentation: "https://developer.ebay.com"
    },
    requiredFields: ["Title", "StartPrice", "Quantity", "CategoryID"],
    optionalFields: ["Description", "PictureURL", "Brand"],
    fieldBoosts: [
      { sourceField: "product_name", targetField: "Title", boostValue: 5, reason: "eBay PascalCase convention" },
      { sourceField: "base_price", targetField: "StartPrice", boostValue: 10, reason: "eBay pricing field" }
    ],
    fieldConstraints: {
      Title: { type: "string", maxLength: 80, required: true },
      CategoryID: { type: "integer", required: true }
    },
    confidenceThresholds: {
      knowledge_based: 95,
      semantic_match: 85,
      similarity_match: 60,
      pattern_match: 75
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print("✅ Inserted 4 channel configurations");
print("   - Shopify");
print("   - Amazon Seller Central");
print("   - Walmart Marketplace");
print("   - eBay\n");

// ============================================================================
// STEP 2: Seed Semantic Types
// ============================================================================

print("==========================================");
print("STEP 2/3: Field Semantic Knowledge");
print("==========================================\n");

db.field_semantic_knowledge.deleteMany({});

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

print("✅ Inserted 10 semantic types");
print("   - PRODUCT_NAME, PRICE, SKU, DESCRIPTION, QUANTITY");
print("   - BRAND, CATEGORY, IMAGE, BARCODE, WEIGHT\n");

// ============================================================================
// STEP 3: Seed Learned Mappings
// ============================================================================

print("==========================================");
print("STEP 3/3: Channel Field Mappings");
print("==========================================\n");

db.channel_field_mappings.deleteMany({});

db.channel_field_mappings.insertMany([
  {
    channelId: "shopify",
    sourceField: "product_name",
    targetField: "title",
    confidence: 95.0,
    matchStrategy: "KNOWLEDGE_BASED",
    successRate: 98.5,
    usageCount: 1542,
    lastUsed: new Date(),
    validated: true,
    organizationId: "org_global",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "base_price",
    targetField: "price",
    confidence: 100.0,
    matchStrategy: "EXACT_MATCH",
    successRate: 99.9,
    usageCount: 2341,
    lastUsed: new Date(),
    validated: true,
    organizationId: "org_global",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "brand",
    targetField: "vendor",
    confidence: 85.0,
    matchStrategy: "SEMANTIC_WITH_BOOST",
    successRate: 97.8,
    usageCount: 1876,
    lastUsed: new Date(),
    validated: true,
    organizationId: "org_global",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "product_sku",
    targetField: "sku",
    confidence: 100.0,
    matchStrategy: "EXACT_MATCH",
    successRate: 99.9,
    usageCount: 2341,
    lastUsed: new Date(),
    validated: true,
    organizationId: "org_global",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "product_description",
    targetField: "description",
    confidence: 90.0,
    matchStrategy: "SEMANTIC_MATCH",
    successRate: 94.2,
    usageCount: 892,
    lastUsed: new Date(),
    validated: true,
    organizationId: "org_global",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "stock_quantity",
    targetField: "inventory_quantity",
    confidence: 88.0,
    matchStrategy: "SIMILARITY_MATCH",
    successRate: 96.1,
    usageCount: 1123,
    lastUsed: new Date(),
    validated: true,
    organizationId: "org_global",
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print("✅ Inserted 6 learned mappings for Shopify");
print("   - product_name → title (95% confidence)");
print("   - base_price → price (100% confidence)");
print("   - brand → vendor (85% confidence)");
print("   - product_sku → sku (100% confidence)");
print("   - product_description → description (90% confidence)");
print("   - stock_quantity → inventory_quantity (88% confidence)\n");

// ============================================================================
// VERIFICATION
// ============================================================================

print("\n");
print("╔════════════════════════════════════════════════════════════════╗");
print("║                    VERIFICATION SUMMARY                        ║");
print("╚════════════════════════════════════════════════════════════════╝");
print("\n");

const channelCount = db.channel_configurations.countDocuments();
const semanticCount = db.field_semantic_knowledge.countDocuments();
const mappingCount = db.channel_field_mappings.countDocuments();

print("✅ channel_configurations:    " + channelCount + " documents");
print("✅ field_semantic_knowledge:  " + semanticCount + " documents");
print("✅ channel_field_mappings:    " + mappingCount + " documents");

print("\n");
print("╔════════════════════════════════════════════════════════════════╗");
print("║                 ✅ SEEDING COMPLETED SUCCESSFULLY!              ║");
print("╚════════════════════════════════════════════════════════════════╝");
print("\n");

print("Next Steps:");
print("1. Test GET /channels endpoint:");
print("   curl http://localhost:8888/labamap/api/v1/channels\n");
print("2. Test pattern matching endpoint:");
print("   curl -X POST http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze \\");
print("     -H 'Content-Type: application/json' \\");
print("     -d '{\"sourceSchema\":{\"product_name\":\"Test\"},\"targetSchema\":{\"title\":\"\"},\"channelId\":\"shopify\"}'\n");
print("3. Open frontend: http://localhost:3000/products/publish-to-channel\n");
