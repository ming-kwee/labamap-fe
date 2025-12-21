// MongoDB Master Seed Script v2.0 - Multi-Tenant Compatible
// Seeds all required collections for the Channel Publishing System
// Compatible with backend structure as of 2025-12-16
// Run with: mongosh labamap_omnichannel < seed-all-v2-multitenant.js

print("\n");
print("╔════════════════════════════════════════════════════════════════╗");
print("║                                                                ║");
print("║   Channel Publishing System - Database Seeding v2.0           ║");
print("║   Multi-Tenant Compatible (2025-12-16)                        ║");
print("║                                                                ║");
print("╚════════════════════════════════════════════════════════════════╝");
print("\n");

// Connect to labamap_omnichannel database
use labamap_omnichannel;

print("Connected to database: labamap_omnichannel\n");

// ============================================================================
// STEP 1: Seed Channel Configurations (Multi-Tenant)
// ============================================================================

print("==========================================");
print("STEP 1/3: Channel Configurations (Multi-Tenant)");
print("==========================================\n");

db.channel_configurations.deleteMany({});

db.channel_configurations.insertMany([
  {
    channelId: "shopify",
    channelName: "Shopify",
    description: "Shopify e-commerce platform",
    organizationId: null,                // System-wide default (multi-tenant support)
    isSystemDefault: true,               // Built-in template
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
      {
        sourcePattern: "brand",          // FIXED: sourceField → sourcePattern
        targetPattern: "vendor",         // FIXED: targetField → targetPattern
        confidenceBoost: 10.0,           // FIXED: boostValue → confidenceBoost
        reason: "Shopify uses 'vendor' for brand",
        condition: null
      },
      {
        sourcePattern: "category",
        targetPattern: "product_type",
        confidenceBoost: 8.0,
        reason: "Shopify categorization",
        condition: null
      },
      {
        sourcePattern: "stock_quantity",
        targetPattern: "inventory_quantity",
        confidenceBoost: 7.0,
        reason: "Shopify inventory naming",
        condition: null
      }
    ],
    fieldConstraints: {  // Future feature - MongoDB will store it
      title: { type: "string", maxLength: 255, required: true },
      price: { type: "decimal", min: 0.01, required: true, decimalPlaces: 2 },
      inventory_quantity: { type: "integer", min: 0, required: true }
    },
    confidenceThresholds: {
      knowledge_based: 95.0,
      semantic_match: 85.0,
      similarity_match: 60.0,
      pattern_match: 75.0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "amazon",
    channelName: "Amazon Seller Central",
    description: "Amazon marketplace for sellers",
    organizationId: null,
    isSystemDefault: true,
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
      {
        sourcePattern: "product_description",
        targetPattern: "bullet_point_1",
        confidenceBoost: 12.0,
        reason: "Amazon bullet points",
        condition: null
      },
      {
        sourcePattern: "brand",
        targetPattern: "brand",
        confidenceBoost: 15.0,
        reason: "Brand required by Amazon",
        condition: null
      },
      {
        sourcePattern: "barcode",
        targetPattern: "product_id",
        confidenceBoost: 10.0,
        reason: "Amazon product identification",
        condition: null
      }
    ],
    fieldConstraints: {
      title: { type: "string", maxLength: 200, required: true },
      brand: { type: "string", maxLength: 50, required: true },
      bullet_point_1: { type: "string", maxLength: 500, required: false }
    },
    confidenceThresholds: {
      knowledge_based: 95.0,
      semantic_match: 85.0,
      similarity_match: 60.0,
      pattern_match: 75.0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "walmart",
    channelName: "Walmart Marketplace",
    description: "Walmart online marketplace",
    organizationId: null,
    isSystemDefault: true,
    isActive: true,
    version: "1.0",
    metadata: {
      variantSupport: false,
      documentation: "https://developer.walmart.com"
    },
    requiredFields: ["productName", "brand", "price", "sku", "upc"],
    optionalFields: ["productDescription", "mainImageUrl", "productCategory"],
    fieldBoosts: [
      {
        sourcePattern: "product_name",
        targetPattern: "productName",
        confidenceBoost: 8.0,
        reason: "Walmart camelCase convention",
        condition: null
      },
      {
        sourcePattern: "barcode",
        targetPattern: "upc",
        confidenceBoost: 15.0,
        reason: "UPC required by Walmart",
        condition: null
      }
    ],
    fieldConstraints: {
      productName: { type: "string", maxLength: 200, required: true },
      upc: { type: "string", pattern: "^[0-9]{12}$", required: true }
    },
    confidenceThresholds: {
      knowledge_based: 95.0,
      semantic_match: 85.0,
      similarity_match: 60.0,
      pattern_match: 75.0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "ebay",
    channelName: "eBay",
    description: "eBay online auction and shopping",
    organizationId: null,
    isSystemDefault: true,
    isActive: true,
    version: "1.0",
    metadata: {
      variantSupport: false,
      documentation: "https://developer.ebay.com"
    },
    requiredFields: ["Title", "StartPrice", "Quantity", "CategoryID"],
    optionalFields: ["Description", "PictureURL", "Brand"],
    fieldBoosts: [
      {
        sourcePattern: "product_name",
        targetPattern: "Title",
        confidenceBoost: 5.0,
        reason: "eBay PascalCase convention",
        condition: null
      },
      {
        sourcePattern: "base_price",
        targetPattern: "StartPrice",
        confidenceBoost: 10.0,
        reason: "eBay pricing field",
        condition: null
      }
    ],
    fieldConstraints: {
      Title: { type: "string", maxLength: 80, required: true },
      CategoryID: { type: "integer", required: true }
    },
    confidenceThresholds: {
      knowledge_based: 95.0,
      semantic_match: 85.0,
      similarity_match: 60.0,
      pattern_match: 75.0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print("✅ Inserted 4 system default channel configurations");
print("   - Shopify (organizationId: null, isSystemDefault: true)");
print("   - Amazon Seller Central (organizationId: null, isSystemDefault: true)");
print("   - Walmart Marketplace (organizationId: null, isSystemDefault: true)");
print("   - eBay (organizationId: null, isSystemDefault: true)\n");

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
    lastUpdated: new Date()  // FIXED: updatedAt → lastUpdated
  },
  {
    semanticType: "PRICE",
    aliases: ["price", "base_price", "unit_price", "cost", "amount", "selling_price", "StartPrice"],
    commonPatterns: ["^.*price$", "^cost$", "^amount$", "^StartPrice$"],
    keywords: ["price", "cost", "amount", "money"],
    baseConfidence: 98.0,
    description: "Product price/cost",
    lastUpdated: new Date()
  },
  {
    semanticType: "SKU",
    aliases: ["sku", "product_code", "item_number", "article_number", "product_sku", "product_id"],
    commonPatterns: ["^sku$", "^.*code$", "^.*number$", "^product_id$"],
    keywords: ["sku", "code", "number"],
    baseConfidence: 99.0,
    description: "Stock keeping unit identifier",
    lastUpdated: new Date()
  },
  {
    semanticType: "DESCRIPTION",
    aliases: ["description", "details", "product_description", "long_description", "body", "Description", "productDescription"],
    commonPatterns: ["^.*desc.*$", "^details$", "^body$", "^Description$"],
    keywords: ["description", "details", "body", "content"],
    baseConfidence: 90.0,
    description: "Product description/details",
    lastUpdated: new Date()
  },
  {
    semanticType: "QUANTITY",
    aliases: ["quantity", "stock", "inventory", "qty", "available", "stock_quantity", "inventory_quantity", "Quantity"],
    commonPatterns: ["^.*qty$", "^.*quantity$", "^stock$", "^inventory$", "^Quantity$"],
    keywords: ["quantity", "stock", "inventory", "available"],
    baseConfidence: 92.0,
    description: "Available quantity/stock",
    lastUpdated: new Date()
  },
  {
    semanticType: "BRAND",
    aliases: ["brand", "manufacturer", "vendor", "maker", "supplier", "Brand"],
    commonPatterns: ["^brand$", "^vendor$", "^manufacturer$", "^Brand$"],
    keywords: ["brand", "vendor", "manufacturer"],
    baseConfidence: 94.0,
    description: "Product brand/manufacturer",
    lastUpdated: new Date()
  },
  {
    semanticType: "CATEGORY",
    aliases: ["category", "type", "product_type", "classification", "product_category", "productCategory", "CategoryID"],
    commonPatterns: ["^.*category$", "^.*type$", "^classification$", "^CategoryID$"],
    keywords: ["category", "type", "class"],
    baseConfidence: 88.0,
    description: "Product category/type",
    lastUpdated: new Date()
  },
  {
    semanticType: "IMAGE",
    aliases: ["image", "picture", "photo", "main_image", "primary_image", "image_url", "img", "PictureURL", "mainImageUrl"],
    commonPatterns: ["^.*image.*$", "^.*img.*$", "^.*photo.*$", "^.*picture.*$", "^PictureURL$"],
    keywords: ["image", "picture", "photo", "img"],
    baseConfidence: 93.0,
    description: "Product image URL",
    lastUpdated: new Date()
  },
  {
    semanticType: "BARCODE",
    aliases: ["barcode", "upc", "ean", "gtin", "isbn"],
    commonPatterns: ["^barcode$", "^upc$", "^ean$", "^gtin$"],
    keywords: ["barcode", "upc", "ean", "gtin"],
    baseConfidence: 99.0,
    description: "Product barcode/UPC/EAN",
    lastUpdated: new Date()
  },
  {
    semanticType: "WEIGHT",
    aliases: ["weight", "product_weight", "item_weight", "shipping_weight"],
    commonPatterns: ["^.*weight$"],
    keywords: ["weight", "mass"],
    baseConfidence: 96.0,
    description: "Product weight",
    lastUpdated: new Date()
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
    mappingStrategy: "KNOWLEDGE_BASED",  // FIXED: matchStrategy → mappingStrategy
    successRate: 98.5,
    usageCount: 1542,
    lastUsedAt: new Date(),              // FIXED: lastUsed → lastUsedAt
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "base_price",
    targetField: "price",
    confidence: 100.0,
    mappingStrategy: "EXACT_MATCH",
    successRate: 99.9,
    usageCount: 2341,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "brand",
    targetField: "vendor",
    confidence: 85.0,
    mappingStrategy: "SEMANTIC_WITH_BOOST",
    successRate: 97.8,
    usageCount: 1876,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "product_sku",
    targetField: "sku",
    confidence: 100.0,
    mappingStrategy: "EXACT_MATCH",
    successRate: 99.9,
    usageCount: 2341,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "product_description",
    targetField: "description",
    confidence: 90.0,
    mappingStrategy: "SEMANTIC_MATCH",
    successRate: 94.2,
    usageCount: 892,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "shopify",
    sourceField: "stock_quantity",
    targetField: "inventory_quantity",
    confidence: 88.0,
    mappingStrategy: "SIMILARITY_MATCH",
    successRate: 96.1,
    usageCount: 1123,
    lastUsedAt: new Date(),
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

print("✅ channel_configurations:    " + channelCount + " documents (multi-tenant ready)");
print("✅ field_semantic_knowledge:  " + semanticCount + " documents");
print("✅ channel_field_mappings:    " + mappingCount + " documents");

print("\n");
print("📊 Multi-Tenant Configuration:");
print("   - All channel configs have organizationId: null");
print("   - All channel configs have isSystemDefault: true");
print("   - Ready for organization-specific customizations");

print("\n");
print("╔════════════════════════════════════════════════════════════════╗");
print("║                 ✅ SEEDING COMPLETED SUCCESSFULLY!              ║");
print("║                   (Multi-Tenant Compatible v2.0)               ║");
print("╚════════════════════════════════════════════════════════════════╝");
print("\n");

print("Next Steps:");
print("1. Test GET /channels endpoint:");
print("   curl http://localhost:8888/api/v1/channels\n");
print("2. Test multi-tenant query:");
print("   curl 'http://localhost:8888/api/v1/channels?organizationId=org_test'\n");
print("3. Test pattern matching endpoint:");
print("   curl -X POST http://localhost:8888/api/v1/adaptive-pattern-matching/analyze \\");
print("     -H 'Content-Type: application/json' \\");
print("     -d '{\"sourceSchema\":{\"product_name\":\"Test\"},\"targetSchema\":{\"title\":\"\"},\"channelId\":\"shopify\",\"confidenceThreshold\":70}'\n");
print("4. Open frontend: http://localhost:3000/products/publish-to-channel\n");

print("Changes from v1:");
print("  ✅ Added organizationId (null for system defaults)");
print("  ✅ Added isSystemDefault (true for templates)");
print("  ✅ Fixed fieldBoosts structure (sourcePattern, targetPattern, confidenceBoost)");
print("  ✅ Fixed channel_field_mappings field names (mappingStrategy, lastUsedAt)");
print("  ✅ Fixed field_semantic_knowledge date field (lastUpdated)");
print("\n");
