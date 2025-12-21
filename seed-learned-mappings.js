// MongoDB Seed Script: Channel Field Mappings (Learned Mappings)
// Run with: mongosh labamap < seed-learned-mappings.js

// Connect to labamap database
use labamap;

print("\n==========================================");
print("Seeding Channel Field Mappings");
print("==========================================\n");

// Drop existing
print("Dropping existing learned mappings...");
db.channel_field_mappings.deleteMany({});

// Insert bootstrap mappings for Shopify
print("Inserting 6 bootstrap mappings for Shopify...\n");

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

print("✅ Inserted 6 learned mappings\n");

// Verify
print("==========================================");
print("Verification");
print("==========================================\n");

const mappings = db.channel_field_mappings.find({}, {channelId: 1, sourceField: 1, targetField: 1, confidence: 1}).toArray();
mappings.forEach(function(mapping) {
  print("  - " + mapping.sourceField + " → " + mapping.targetField + " (" + mapping.confidence + "% confidence)");
});

print("\nTotal mappings: " + db.channel_field_mappings.countDocuments());

print("\n==========================================");
print("✅ Learned mappings seeded successfully!");
print("==========================================\n");
