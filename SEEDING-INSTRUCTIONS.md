# MongoDB Seeding Instructions

## 📋 Overview

These seed scripts populate the MongoDB database with initial data required for the Channel Publishing System.

## 📁 Seed Script Files

| File | Description | Collections |
|------|-------------|-------------|
| **seed-all.js** | 🌟 **Master script** - Seeds everything | All 3 collections |
| seed-channels.js | Channel configurations only | channel_configurations |
| seed-semantic-types.js | Semantic field types only | field_semantic_knowledge |
| seed-learned-mappings.js | Learned ML mappings only | channel_field_mappings |

## 🚀 Quick Start (Recommended)

**Just run the master script** - it seeds everything at once:

```bash
mongosh labamap < seed-all.js
```

That's it! All 3 collections will be seeded with:
- ✅ 4 channel configurations (Shopify, Amazon, Walmart, eBay)
- ✅ 10 semantic types (PRODUCT_NAME, PRICE, SKU, etc.)
- ✅ 6 learned mappings (Bootstrap ML system)

## 📦 What Gets Seeded

### Collection 1: channel_configurations (4 documents)

**Shopify**:
- Required: title, price, inventory_quantity
- Optional: description, vendor, product_type, tags, barcode, weight, weight_unit
- Field boosts: brand→vendor, category→product_type, stock_quantity→inventory_quantity

**Amazon Seller Central**:
- Required: title, brand, price, quantity, product_id, product_id_type
- Optional: bullet_point_1-5, description, search_terms, main_image_url
- Field boosts: product_description→bullet_point_1, brand→brand, barcode→product_id

**Walmart Marketplace**:
- Required: productName, brand, price, sku, upc
- Optional: productDescription, mainImageUrl, productCategory
- Field boosts: product_name→productName, barcode→upc

**eBay**:
- Required: Title, StartPrice, Quantity, CategoryID
- Optional: Description, PictureURL, Brand
- Field boosts: product_name→Title, base_price→StartPrice

### Collection 2: field_semantic_knowledge (10 documents)

1. **PRODUCT_NAME** - title, name, product_name, productName, Title
2. **PRICE** - price, base_price, unit_price, cost, StartPrice
3. **SKU** - sku, product_code, item_number, product_id
4. **DESCRIPTION** - description, details, product_description, Description
5. **QUANTITY** - quantity, stock, inventory, stock_quantity, Quantity
6. **BRAND** - brand, manufacturer, vendor, Brand
7. **CATEGORY** - category, type, product_type, CategoryID
8. **IMAGE** - image, main_image, PictureURL, mainImageUrl
9. **BARCODE** - barcode, upc, ean, gtin
10. **WEIGHT** - weight, product_weight, item_weight

### Collection 3: channel_field_mappings (6 documents)

All for **Shopify** channel:
1. product_name → title (95% confidence, 1542 uses, 98.5% success)
2. base_price → price (100% confidence, 2341 uses, 99.9% success)
3. brand → vendor (85% confidence, 1876 uses, 97.8% success)
4. product_sku → sku (100% confidence, 2341 uses, 99.9% success)
5. product_description → description (90% confidence, 892 uses, 94.2% success)
6. stock_quantity → inventory_quantity (88% confidence, 1123 uses, 96.1% success)

## 🔧 Alternative Usage

### Option 1: Seed Individual Collections

If you only need to update one collection:

```bash
# Seed only channels
mongosh labamap < seed-channels.js

# Seed only semantic types
mongosh labamap < seed-semantic-types.js

# Seed only learned mappings
mongosh labamap < seed-learned-mappings.js
```

### Option 2: MongoDB Compass (GUI)

1. Open MongoDB Compass
2. Connect to your MongoDB instance
3. Select `labamap` database
4. Click "MongoSH" tab at the bottom
5. Copy and paste content from `seed-all.js`
6. Press Enter

### Option 3: Copy-Paste Method

If `mongosh` command doesn't work:

```bash
# Open mongosh shell
mongosh

# Switch to labamap database
use labamap

# Copy and paste content from seed-all.js
# (everything except the first "use labamap;" line)
```

## ✅ Verify Seeding Success

After running the seed script, you should see:

```
╔════════════════════════════════════════════════════════════════╗
║                    VERIFICATION SUMMARY                        ║
╚════════════════════════════════════════════════════════════════╝

✅ channel_configurations:    4 documents
✅ field_semantic_knowledge:  10 documents
✅ channel_field_mappings:    6 documents

╔════════════════════════════════════════════════════════════════╗
║                 ✅ SEEDING COMPLETED SUCCESSFULLY!              ║
╚════════════════════════════════════════════════════════════════╝
```

## 🧪 Test Backend Endpoints

### Test 1: GET /channels

```bash
curl http://localhost:8888/labamap/api/v1/channels
```

**Expected**: Returns 4 channels (Shopify, Amazon, Walmart, eBay)

### Test 2: POST /adaptive-pattern-matching/analyze

```bash
curl -X POST http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sourceSchema": {
      "product_name": "Gaming Mouse G502",
      "base_price": 59.99,
      "product_sku": "GM-502",
      "brand": "Logitech",
      "stock_quantity": 150
    },
    "targetSchema": {
      "title": "",
      "price": 0,
      "sku": "",
      "vendor": "",
      "inventory_quantity": 0
    },
    "channelId": "shopify",
    "confidenceThreshold": 70,
    "organizationId": "org_demo"
  }'
```

**Expected**: Returns field mappings with confidence scores

## 🌐 Test Frontend

1. Open: http://localhost:3000/products/publish-to-channel
2. Should see 4 channels in dropdown
3. Select "Shopify"
4. Click "Analyze Pattern Matching"
5. Should see field mappings table with confidence scores

## ⚠️ Troubleshooting

### Error: "command not found: mongosh"

**Solution**: Install MongoDB Shell

```bash
# macOS
brew install mongosh

# Or download from: https://www.mongodb.com/try/download/shell
```

### Error: "MongoServerError: Authentication failed"

**Solution**: Use connection string with credentials

```bash
mongosh "mongodb://username:password@localhost:27017/labamap" < seed-all.js
```

### Error: "connect ECONNREFUSED 127.0.0.1:27017"

**Solution**: Start MongoDB server

```bash
# macOS
brew services start mongodb-community

# Or
mongod --dbpath /path/to/data
```

### Seed Script Shows No Output

**Solution**: The script might have run but you didn't see output. Check manually:

```bash
mongosh labamap
> db.channel_configurations.count()
# Should return: 4

> db.field_semantic_knowledge.count()
# Should return: 10

> db.channel_field_mappings.count()
# Should return: 6
```

## 🔄 Re-seeding (Starting Fresh)

The seed scripts automatically **delete existing data** before inserting. You can safely run them multiple times:

```bash
# This will delete old data and insert fresh data
mongosh labamap < seed-all.js
```

## 📊 Database Schema

### channel_configurations
```javascript
{
  channelId: String,           // "shopify", "amazon", etc.
  channelName: String,         // "Shopify", "Amazon Seller Central"
  description: String,
  isActive: Boolean,
  version: String,
  metadata: Object,
  requiredFields: [String],
  optionalFields: [String],
  fieldBoosts: [Object],       // Channel-specific field boosts
  fieldConstraints: Object,
  confidenceThresholds: Object,
  createdAt: Date,
  updatedAt: Date
}
```

### field_semantic_knowledge
```javascript
{
  semanticType: String,        // "PRODUCT_NAME", "PRICE", etc.
  aliases: [String],           // ["title", "name", "product_name"]
  commonPatterns: [String],    // Regex patterns
  keywords: [String],
  baseConfidence: Number,      // 0-100
  description: String,
  createdAt: Date,
  updatedAt: Date
}
```

### channel_field_mappings
```javascript
{
  channelId: String,
  sourceField: String,         // "product_name"
  targetField: String,         // "title"
  confidence: Number,          // 0-100
  matchStrategy: String,       // "KNOWLEDGE_BASED", "SEMANTIC_MATCH", etc.
  successRate: Number,         // 0-100
  usageCount: Number,          // ML tracking
  lastUsed: Date,
  validated: Boolean,
  organizationId: String,      // "org_global" or specific org
  createdAt: Date,
  updatedAt: Date
}
```

## 📞 Need Help?

If you encounter issues:

1. Check MongoDB is running: `mongosh --eval "db.version()"`
2. Verify database access: `mongosh labamap --eval "db.stats()"`
3. Check collections: `mongosh labamap --eval "db.getCollectionNames()"`
4. See BACKEND-TEST-RESULTS.md for detailed testing guide
5. See BACKEND-TEAM-RECOMMENDATIONS.md for API specifications

---

**Quick Command Reference**:

```bash
# Seed everything (RECOMMENDED)
mongosh labamap < seed-all.js

# Verify seeding
mongosh labamap --eval "db.channel_configurations.count()"
mongosh labamap --eval "db.field_semantic_knowledge.count()"
mongosh labamap --eval "db.channel_field_mappings.count()"

# View seeded data
mongosh labamap --eval "db.channel_configurations.find().pretty()"

# Test backend
curl http://localhost:8888/labamap/api/v1/channels
```

---

✅ **After seeding, the Channel Publishing System will be fully functional!**
