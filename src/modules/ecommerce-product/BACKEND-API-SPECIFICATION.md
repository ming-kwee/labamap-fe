# Backend API Specification for Channel Publishing

## Base URL
```
http://localhost:8888/labamap/api/v1
```

## Required Endpoints

### 1. Get Available Channels

**Endpoint:** `GET /channels`

**Description:** Returns list of all supported sales channels

**Request:**
```http
GET /labamap/api/v1/channels
Content-Type: application/json
```

**Response:** `200 OK`
```json
[
  {
    "channelId": "shopify",
    "channelName": "Shopify",
    "requiredFields": ["title", "price", "inventory_quantity"],
    "optionalFields": ["description", "vendor", "product_type", "tags"],
    "fieldConstraints": {
      "title": {
        "maxLength": 255,
        "required": true,
        "type": "string"
      },
      "price": {
        "type": "decimal",
        "min": 0.01,
        "required": true
      }
    },
    "variantSupport": true,
    "maxVariants": 100,
    "rateLimit": {
      "requestsPerSecond": 2,
      "requestsPerDay": 10000
    }
  },
  {
    "channelId": "amazon",
    "channelName": "Amazon Seller Central",
    "requiredFields": ["title", "brand", "price", "quantity", "product_id"],
    "optionalFields": ["bullet_point_1", "bullet_point_2", "bullet_point_3", "description"],
    "fieldConstraints": {
      "title": {
        "maxLength": 200,
        "required": true
      },
      "brand": {
        "maxLength": 50,
        "required": true
      }
    },
    "variantSupport": true,
    "maxVariants": 2000
  },
  {
    "channelId": "walmart",
    "channelName": "Walmart Marketplace",
    "requiredFields": ["productName", "brand", "price", "sku", "upc"],
    "optionalFields": ["productDescription", "mainImageUrl"],
    "fieldConstraints": {
      "productName": {
        "maxLength": 200,
        "required": true
      }
    },
    "variantSupport": false
  },
  {
    "channelId": "ebay",
    "channelName": "eBay",
    "requiredFields": ["Title", "StartPrice", "Quantity", "CategoryID"],
    "optionalFields": ["Description", "PictureURL"],
    "fieldConstraints": {
      "Title": {
        "maxLength": 80,
        "required": true
      }
    },
    "variantSupport": false
  }
]
```

---

### 2. Analyze Adaptive Pattern Matching

**Endpoint:** `POST /adaptive-pattern-matching/analyze`

**Description:** Analyzes master product and generates field mappings using 5-tier matching strategy

**5-Tier Matching Strategy:**
1. **Knowledge-Based** (95%+ confidence) - Learned from production usage (MongoDB: `channel_field_mappings`)
2. **Semantic Match** (85%+ confidence) - Semantic type equivalence (MongoDB: `field_semantic_knowledge`)
3. **Similarity Match** (60-90% confidence) - Levenshtein distance for snake_case ↔ camelCase
4. **Pattern Match** (75% confidence) - Regex-based detection
5. **Channel-Specific Boost** - Platform intelligence (Amazon, Shopify, etc.)

**Request:**
```http
POST /labamap/api/v1/adaptive-pattern-matching/analyze
Content-Type: application/json
```

**Request Body:**
```json
{
  "sourceSchema": {
    "product_name": "Gaming Mouse G502",
    "product_sku": "GM-001",
    "base_price": 59.99,
    "product_description": "High-performance gaming mouse",
    "stock_quantity": 100,
    "brand": "Logitech",
    "category": "electronics",
    "main_image": "https://example.com/image.jpg",
    "weight": 0.5,
    "weight_unit": "kg"
  },
  "targetSchema": {
    "title": "",
    "price": 0,
    "sku": "",
    "description": "",
    "quantity": 0,
    "vendor": "",
    "product_type": "",
    "image": ""
  },
  "channelId": "shopify",
  "confidenceThreshold": 70,
  "organizationId": "org_demo",
  "userId": "user_demo"
}
```

**Response:** `200 OK`
```json
{
  "fieldMappings": [
    {
      "sourcePath": "product_name",
      "targetPath": "title",
      "confidence": 95,
      "matchStrategy": "KNOWLEDGE_BASED",
      "usageCount": 1542,
      "successRate": 98.5,
      "dataTransformation": null,
      "channelBoost": 0
    },
    {
      "sourcePath": "base_price",
      "targetPath": "price",
      "confidence": 100,
      "matchStrategy": "EXACT_MATCH",
      "usageCount": 2341,
      "successRate": 99.9
    },
    {
      "sourcePath": "product_sku",
      "targetPath": "sku",
      "confidence": 100,
      "matchStrategy": "EXACT_MATCH",
      "usageCount": 2341,
      "successRate": 99.9
    },
    {
      "sourcePath": "product_description",
      "targetPath": "description",
      "confidence": 90,
      "matchStrategy": "SEMANTIC_MATCH",
      "usageCount": 892,
      "successRate": 94.2
    },
    {
      "sourcePath": "stock_quantity",
      "targetPath": "inventory_quantity",
      "confidence": 88,
      "matchStrategy": "SIMILARITY_MATCH",
      "usageCount": 1123,
      "successRate": 96.1
    },
    {
      "sourcePath": "brand",
      "targetPath": "vendor",
      "confidence": 85,
      "matchStrategy": "SEMANTIC_WITH_BOOST",
      "usageCount": 1876,
      "successRate": 97.8,
      "channelBoost": 10
    },
    {
      "sourcePath": "category",
      "targetPath": "product_type",
      "confidence": 75,
      "matchStrategy": "PATTERN_MATCH",
      "usageCount": 445,
      "successRate": 87.3
    },
    {
      "sourcePath": "main_image",
      "targetPath": "image",
      "confidence": 92,
      "matchStrategy": "KNOWLEDGE_BASED",
      "usageCount": 967,
      "successRate": 93.4
    }
  ],
  "joltSpec": [
    {
      "operation": "shift",
      "spec": {
        "product_name": "title",
        "base_price": "price",
        "product_sku": "sku",
        "product_description": "description",
        "stock_quantity": "inventory_quantity",
        "brand": "vendor",
        "category": "product_type",
        "main_image": "image"
      }
    },
    {
      "operation": "default",
      "spec": {
        "status": "active",
        "published": true
      }
    }
  ],
  "overallConfidence": 93,
  "unmappedSourceFields": ["weight", "weight_unit"],
  "unmappedTargetFields": ["tags", "barcode"],
  "matchingMetadata": {
    "knowledgeBasedMatches": 2,
    "semanticMatches": 1,
    "similarityMatches": 1,
    "patternMatches": 1,
    "totalMatches": 8,
    "processingTimeMs": 245
  }
}
```

**Match Strategy Types:**
- `KNOWLEDGE_BASED` - Learned from production (95%+ confidence)
- `SEMANTIC_MATCH` - Semantic type equivalence (85%+ confidence)
- `SEMANTIC_WITH_BOOST` - Semantic + channel-specific boost
- `SIMILARITY_MATCH` - Levenshtein distance (60-90% confidence)
- `PATTERN_MATCH` - Regex patterns (75% confidence)
- `EXACT_MATCH` - Perfect field name match (100% confidence)

---

### 3. Publish to Channel

**Endpoint:** `POST /channels/publish`

**Description:** Publishes transformed product data to selected channel and records ML learning data

**Request:**
```http
POST /labamap/api/v1/channels/publish
Content-Type: application/json
```

**Request Body:**
```json
{
  "masterProductId": "prod_1234567890",
  "masterProductData": {
    "product_name": "Gaming Mouse G502",
    "product_sku": "GM-001",
    "base_price": 59.99,
    "product_description": "High-performance gaming mouse",
    "stock_quantity": 100,
    "brand": "Logitech",
    "category": "electronics",
    "main_image": "https://example.com/image.jpg"
  },
  "channelId": "shopify",
  "fieldMappings": [
    {
      "sourcePath": "product_name",
      "targetPath": "title",
      "confidence": 95,
      "matchStrategy": "KNOWLEDGE_BASED"
    }
  ],
  "joltSpec": [
    {
      "operation": "shift",
      "spec": {
        "product_name": "title",
        "base_price": "price"
      }
    }
  ],
  "skipValidation": false,
  "dryRun": false
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "channelProductId": "shopify_prod_987654321",
  "channelUrl": "https://mystore.myshopify.com/admin/products/987654321",
  "publishedData": {
    "title": "Gaming Mouse G502",
    "price": 59.99,
    "sku": "GM-001",
    "description": "High-performance gaming mouse",
    "inventory_quantity": 100,
    "vendor": "Logitech",
    "product_type": "electronics",
    "image": "https://example.com/image.jpg"
  },
  "warnings": [
    "Field 'tags' was not mapped - using default empty value"
  ],
  "errors": [],
  "publishedAt": "2025-12-12T10:30:45Z",
  "syncStatus": "COMPLETED"
}
```

**ML Learning Side Effect:**
After successful publish, update MongoDB:
```javascript
// Update channel_field_mappings collection
db.channel_field_mappings.updateOne(
  {
    channelId: "shopify",
    sourceField: "product_name",
    targetField: "title"
  },
  {
    $inc: { usageCount: 1 },
    $set: {
      lastUsed: new Date(),
      successRate: calculateSuccessRate(), // (successfulUses / totalUses) * 100
      validated: true
    }
  },
  { upsert: true }
);
```

---

### 4. Get Channel Configuration (Optional but Recommended)

**Endpoint:** `GET /channels/{channelId}/configuration`

**Request:**
```http
GET /labamap/api/v1/channels/shopify/configuration
```

**Response:** `200 OK`
```json
{
  "channelId": "shopify",
  "channelName": "Shopify",
  "apiEndpoint": "https://mystore.myshopify.com/admin/api/2024-01",
  "requiredFields": ["title", "price", "inventory_quantity"],
  "optionalFields": ["description", "vendor", "product_type", "tags"],
  "fieldConstraints": {
    "title": {
      "maxLength": 255,
      "required": true,
      "type": "string"
    },
    "price": {
      "type": "decimal",
      "min": 0.01,
      "required": true
    }
  },
  "variantSupport": true,
  "maxVariants": 100,
  "rateLimit": {
    "requestsPerSecond": 2,
    "requestsPerDay": 10000
  }
}
```

---

### 5. Preview JOLT Transformation (Optional)

**Endpoint:** `POST /jolt/preview`

**Request:**
```http
POST /labamap/api/v1/jolt/preview
Content-Type: application/json
```

**Request Body:**
```json
{
  "sourceData": {
    "product_name": "Gaming Mouse G502",
    "base_price": 59.99
  },
  "joltSpec": [
    {
      "operation": "shift",
      "spec": {
        "product_name": "title",
        "base_price": "price"
      }
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "title": "Gaming Mouse G502",
  "price": 59.99
}
```

---

## MongoDB Collections Required

### 1. `field_semantic_knowledge`
Stores 100+ semantic types for intelligent matching

```javascript
{
  "_id": ObjectId("..."),
  "semanticType": "PRODUCT_NAME",
  "aliases": ["title", "name", "product_title", "item_name", "product_name"],
  "commonPatterns": ["^product[_-]?name$", "^title$", "^name$"],
  "keywords": ["product", "name", "title", "item"],
  "baseConfidence": 95.0,
  "description": "Primary product identifier/title",
  "createdAt": ISODate("2025-01-01"),
  "updatedAt": ISODate("2025-12-11")
}
```

**Example Semantic Types:**
- `PRODUCT_NAME` → title, name, product_name
- `PRICE` → price, base_price, unit_price, cost
- `SKU` → sku, product_code, item_number
- `DESCRIPTION` → description, details, product_description
- `QUANTITY` → quantity, stock, inventory, qty
- `BRAND` → brand, manufacturer, vendor, maker
- `CATEGORY` → category, type, product_type, classification
- `IMAGE` → image, picture, photo, main_image

### 2. `channel_field_mappings`
Stores learned mappings with ML statistics

```javascript
{
  "_id": ObjectId("..."),
  "channelId": "shopify",
  "sourceField": "product_name",
  "targetField": "title",
  "confidence": 95.0,
  "matchStrategy": "KNOWLEDGE_BASED",
  "successRate": 98.5,
  "usageCount": 1542,
  "lastUsed": ISODate("2025-12-11"),
  "validated": true,
  "organizationId": "org_global", // or specific org
  "createdAt": ISODate("2025-01-01"),
  "updatedAt": ISODate("2025-12-11")
}
```

### 3. `channel_configurations`
Channel-specific rules and requirements

```javascript
{
  "_id": ObjectId("..."),
  "channelId": "shopify",
  "channelName": "Shopify",
  "requiredFields": ["title", "price", "inventory_quantity"],
  "optionalFields": ["description", "vendor", "product_type"],
  "fieldConstraints": {
    "title": { "maxLength": 255, "required": true },
    "price": { "type": "decimal", "min": 0.01 }
  },
  "variantSupport": true,
  "maxVariants": 100,
  "rateLimit": {
    "requestsPerSecond": 2,
    "requestsPerDay": 10000
  },
  "active": true,
  "createdAt": ISODate("2025-01-01"),
  "updatedAt": ISODate("2025-12-11")
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": [
    "Field 'channelId' is required",
    "Field 'sourceSchema' must be an object"
  ]
}
```

### 404 Not Found
```json
{
  "error": "NOT_FOUND",
  "message": "Channel not found",
  "channelId": "invalid_channel"
}
```

### 500 Internal Server Error
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to process pattern matching",
  "details": "Error connecting to MongoDB"
}
```

---

## Implementation Priority

1. **High Priority (Required for basic functionality):**
   - ✅ `GET /channels` - List available channels
   - ✅ `POST /adaptive-pattern-matching/analyze` - Core matching logic
   - ✅ `POST /channels/publish` - Publish to channel

2. **Medium Priority (Enhances functionality):**
   - `GET /channels/{channelId}/configuration` - Channel details
   - `POST /jolt/preview` - Preview transformation

3. **Low Priority (Nice to have):**
   - `GET /channels/sync-status` - Track sync across channels
   - `GET /channels/{channelId}/learned-mappings` - View ML data
   - `POST /channels/custom-mappings` - Organization overrides

---

## Testing

Use the following curl commands to test:

```bash
# 1. Get channels
curl http://localhost:8888/labamap/api/v1/channels

# 2. Analyze pattern matching
curl -X POST http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sourceSchema": {"product_name": "Test Product", "base_price": 9.99},
    "targetSchema": {"title": "", "price": 0},
    "channelId": "shopify",
    "confidenceThreshold": 70
  }'

# 3. Publish to channel
curl -X POST http://localhost:8888/labamap/api/v1/channels/publish \
  -H "Content-Type: application/json" \
  -d '{
    "masterProductId": "prod_123",
    "masterProductData": {"product_name": "Test"},
    "channelId": "shopify",
    "fieldMappings": [],
    "joltSpec": []
  }'
```

---

## Notes for Backend Team

1. **JOLT Transformation**: Use `jolt-complete` library for JSON-to-JSON transformation
2. **Levenshtein Distance**: Use for similarity matching (60-90% threshold)
3. **ML Learning**: Update `usageCount` and `successRate` after each successful publish
4. **Rate Limiting**: Implement per-channel rate limits to avoid API throttling
5. **Caching**: Cache channel configurations and semantic knowledge for performance
6. **Validation**: Validate field constraints before publishing
7. **Idempotency**: Make publish endpoint idempotent using `masterProductId`

---

**Status**: ✅ Complete API Specification
**Version**: 1.0.0
**Date**: 2025-12-12
