// MongoDB Seed Script: Channel Configurations
// Run with: mongosh labamap < seed-channels.js

// Connect to labamap database
use labamap;

print("\n==========================================");
print("Seeding Channel Configurations");
print("==========================================\n");

// Drop existing data (if any)
print("Dropping existing channel configurations...");
db.channel_configurations.deleteMany({});

// Insert 4 channel configurations
print("Inserting 4 channel configurations...\n");

db.channel_configurations.insertMany([
  // 1. Shopify
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

  // 2. Amazon
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

  // 3. Walmart
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

  // 4. eBay
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

print("✅ Inserted 4 channel configurations\n");

// Verify insertion
print("==========================================");
print("Verification");
print("==========================================\n");

const channels = db.channel_configurations.find({}, {channelId: 1, channelName: 1, isActive: 1}).toArray();
channels.forEach(function(channel) {
  print("  - " + channel.channelName + " (" + channel.channelId + ") - Active: " + channel.isActive);
});

print("\nTotal channels: " + db.channel_configurations.countDocuments());

print("\n==========================================");
print("✅ Channel configurations seeded successfully!");
print("==========================================\n");
