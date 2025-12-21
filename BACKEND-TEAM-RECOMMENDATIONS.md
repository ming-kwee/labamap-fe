# Backend API Recommendations - Channel Publishing System

## Executive Summary for Backend Team

**What We Need**: A smart product publishing system that learns how to map product fields to different sales channels (Shopify, Amazon, eBay, Walmart) using machine learning.

**Why It Matters**: Users create ONE master product, and the system intelligently maps it to 4+ different channel formats without manual configuration.

**Technical Approach**: 5-tier adaptive pattern matching with ML-powered learning that improves over time.

**Timeline**: Start with 3 core endpoints, test with one channel (Shopify), expand to others.

---

## 🎯 Implementation Priority

### Phase 1: Core Functionality (Week 1-2)
1. ✅ **GET /channels** - Return list of available channels (EASIEST - Start here!)
2. ✅ **POST /adaptive-pattern-matching/analyze** - Pattern matching logic (CORE FEATURE)
3. ✅ **POST /channels/publish** - Publish to channel (INTEGRATION)

### Phase 2: Enhancements (Week 3-4)
4. Add MongoDB collections and ML learning
5. Implement JOLT transformation
6. Add validation and error handling

### Phase 3: Production Ready (Week 5+)
7. Rate limiting and caching
8. Multi-org support
9. Analytics and monitoring

---

## 📋 Required Endpoints - Detailed Specification

### 1. GET /channels - List Available Sales Channels

**Purpose**: Tell frontend which channels are configured and ready to use

**Base URL**: `http://localhost:8888/labamap/api/v1/channels`

**HTTP Method**: GET

**Request Headers**:
```http
GET /labamap/api/v1/channels HTTP/1.1
Host: localhost:8888
Content-Type: application/json
Accept: application/json
```

**Request Parameters**: None

**Success Response (200 OK)**:
```json
[
  {
    "channelId": "shopify",
    "channelName": "Shopify",
    "requiredFields": [
      "title",
      "price",
      "inventory_quantity"
    ],
    "optionalFields": [
      "description",
      "vendor",
      "product_type",
      "tags",
      "barcode",
      "weight",
      "weight_unit"
    ],
    "fieldConstraints": {
      "title": {
        "type": "string",
        "maxLength": 255,
        "required": true,
        "description": "Product title/name"
      },
      "price": {
        "type": "decimal",
        "min": 0.01,
        "required": true,
        "decimalPlaces": 2,
        "description": "Product price in store currency"
      },
      "inventory_quantity": {
        "type": "integer",
        "min": 0,
        "required": true,
        "description": "Available stock quantity"
      },
      "description": {
        "type": "string",
        "maxLength": 5000,
        "required": false,
        "description": "Product description HTML allowed"
      }
    },
    "variantSupport": true,
    "maxVariants": 100,
    "rateLimit": {
      "requestsPerSecond": 2,
      "requestsPerDay": 10000,
      "burstLimit": 5
    },
    "active": true,
    "apiVersion": "2024-01",
    "documentation": "https://shopify.dev/api/admin-rest/2024-01/resources/product"
  },
  {
    "channelId": "amazon",
    "channelName": "Amazon Seller Central",
    "requiredFields": [
      "title",
      "brand",
      "price",
      "quantity",
      "product_id",
      "product_id_type"
    ],
    "optionalFields": [
      "bullet_point_1",
      "bullet_point_2",
      "bullet_point_3",
      "bullet_point_4",
      "bullet_point_5",
      "description",
      "search_terms",
      "main_image_url"
    ],
    "fieldConstraints": {
      "title": {
        "type": "string",
        "maxLength": 200,
        "required": true,
        "description": "Product title (shorter than Shopify)"
      },
      "brand": {
        "type": "string",
        "maxLength": 50,
        "required": true,
        "description": "Brand name (required by Amazon)"
      },
      "bullet_point_1": {
        "type": "string",
        "maxLength": 500,
        "required": false,
        "description": "Key feature bullet point"
      }
    },
    "variantSupport": true,
    "maxVariants": 2000,
    "rateLimit": {
      "requestsPerSecond": 1,
      "requestsPerDay": 5000
    },
    "active": true
  },
  {
    "channelId": "walmart",
    "channelName": "Walmart Marketplace",
    "requiredFields": [
      "productName",
      "brand",
      "price",
      "sku",
      "upc"
    ],
    "optionalFields": [
      "productDescription",
      "mainImageUrl",
      "productCategory"
    ],
    "fieldConstraints": {
      "productName": {
        "type": "string",
        "maxLength": 200,
        "required": true
      },
      "upc": {
        "type": "string",
        "pattern": "^[0-9]{12}$",
        "required": true,
        "description": "12-digit UPC barcode"
      }
    },
    "variantSupport": false,
    "active": true
  },
  {
    "channelId": "ebay",
    "channelName": "eBay",
    "requiredFields": [
      "Title",
      "StartPrice",
      "Quantity",
      "CategoryID"
    ],
    "optionalFields": [
      "Description",
      "PictureURL",
      "Brand"
    ],
    "fieldConstraints": {
      "Title": {
        "type": "string",
        "maxLength": 80,
        "required": true,
        "description": "eBay has strict 80 char limit"
      },
      "CategoryID": {
        "type": "integer",
        "required": true,
        "description": "eBay category number"
      }
    },
    "variantSupport": false,
    "active": true
  }
]
```

**Error Responses**:

500 Internal Server Error:
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to fetch channel configurations",
  "details": "MongoDB connection error"
}
```

**Implementation Notes**:

1. **Start Simple**: For MVP, you can return hardcoded JSON array. Move to MongoDB later.
2. **Channel Order**: Return most popular channels first (Shopify, Amazon, Walmart, eBay)
3. **Active Flag**: Only return channels where `active: true`
4. **Caching**: Cache this response for 1 hour (changes rarely)

**Example Node.js Implementation (Simple Version)**:

```javascript
// routes/channels.js
router.get('/channels', async (req, res) => {
  try {
    // Option 1: Hardcoded for MVP (fastest to implement)
    const channels = [
      {
        channelId: 'shopify',
        channelName: 'Shopify',
        requiredFields: ['title', 'price', 'inventory_quantity'],
        optionalFields: ['description', 'vendor', 'product_type', 'tags'],
        fieldConstraints: {
          title: { type: 'string', maxLength: 255, required: true },
          price: { type: 'decimal', min: 0.01, required: true }
        },
        variantSupport: true,
        maxVariants: 100,
        active: true
      },
      // ... other channels
    ];

    // Option 2: From MongoDB (production)
    // const channels = await db.collection('channel_configurations').find({ active: true }).toArray();

    res.status(200).json(channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch channel configurations',
      details: error.message
    });
  }
});
```

---

### 2. POST /adaptive-pattern-matching/analyze - Smart Field Mapping

**Purpose**: Analyze master product and intelligently map fields to channel-specific format using 5-tier matching strategy

**Base URL**: `http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze`

**HTTP Method**: POST

**Request Headers**:
```http
POST /labamap/api/v1/adaptive-pattern-matching/analyze HTTP/1.1
Host: localhost:8888
Content-Type: application/json
Accept: application/json
```

**Request Body Structure**:
```json
{
  "sourceSchema": {
    "product_name": "Gaming Mouse G502 HERO",
    "product_sku": "GM-502-BLK",
    "base_price": 59.99,
    "product_description": "High-performance wired gaming mouse with HERO 25K sensor",
    "stock_quantity": 150,
    "brand": "Logitech",
    "category": "electronics",
    "subcategory": "computer-accessories",
    "main_image": "https://cdn.example.com/images/gm502.jpg",
    "weight": 0.121,
    "weight_unit": "kg",
    "barcode": "097855139276",
    "dimensions_length": 13.2,
    "dimensions_width": 7.5,
    "dimensions_height": 4.0,
    "dimension_unit": "cm"
  },
  "targetSchema": {
    "title": "",
    "price": 0,
    "sku": "",
    "description": "",
    "inventory_quantity": 0,
    "vendor": "",
    "product_type": "",
    "tags": "",
    "image": "",
    "barcode": "",
    "weight": 0,
    "weight_unit": ""
  },
  "channelId": "shopify",
  "confidenceThreshold": 70,
  "organizationId": "org_demo",
  "userId": "user_demo"
}
```

**Request Body Fields Explained**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sourceSchema | object | Yes | Master product data (flat key-value pairs) |
| targetSchema | object | Yes | Empty channel schema (shows expected fields) |
| channelId | string | Yes | Target channel: "shopify", "amazon", "walmart", "ebay" |
| confidenceThreshold | number | No | Minimum confidence % to include mapping (default: 70) |
| organizationId | string | No | For org-specific learned mappings |
| userId | string | No | For tracking who created mapping |

**Success Response (200 OK)**:
```json
{
  "fieldMappings": [
    {
      "sourcePath": "product_name",
      "targetPath": "title",
      "confidence": 95,
      "matchStrategy": "KNOWLEDGE_BASED",
      "reasoning": "Learned from 1542 successful mappings",
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
      "reasoning": "Perfect semantic match for price fields",
      "usageCount": 2341,
      "successRate": 99.9,
      "dataTransformation": null
    },
    {
      "sourcePath": "product_sku",
      "targetPath": "sku",
      "confidence": 100,
      "matchStrategy": "EXACT_MATCH",
      "reasoning": "Perfect semantic match for SKU fields",
      "usageCount": 2341,
      "successRate": 99.9
    },
    {
      "sourcePath": "product_description",
      "targetPath": "description",
      "confidence": 90,
      "matchStrategy": "SEMANTIC_MATCH",
      "reasoning": "Both fields represent PRODUCT_DESCRIPTION semantic type",
      "usageCount": 892,
      "successRate": 94.2
    },
    {
      "sourcePath": "stock_quantity",
      "targetPath": "inventory_quantity",
      "confidence": 88,
      "matchStrategy": "SIMILARITY_MATCH",
      "reasoning": "Levenshtein similarity: 78% (stock vs inventory)",
      "usageCount": 1123,
      "successRate": 96.1
    },
    {
      "sourcePath": "brand",
      "targetPath": "vendor",
      "confidence": 85,
      "matchStrategy": "SEMANTIC_WITH_BOOST",
      "reasoning": "Semantic type BRAND maps to vendor (Shopify-specific)",
      "usageCount": 1876,
      "successRate": 97.8,
      "channelBoost": 10,
      "note": "Shopify uses 'vendor' instead of 'brand'"
    },
    {
      "sourcePath": "category",
      "targetPath": "product_type",
      "confidence": 75,
      "matchStrategy": "PATTERN_MATCH",
      "reasoning": "Regex pattern detected category/type relationship",
      "usageCount": 445,
      "successRate": 87.3
    },
    {
      "sourcePath": "main_image",
      "targetPath": "image",
      "confidence": 92,
      "matchStrategy": "KNOWLEDGE_BASED",
      "reasoning": "Learned mapping from production usage",
      "usageCount": 967,
      "successRate": 93.4
    },
    {
      "sourcePath": "barcode",
      "targetPath": "barcode",
      "confidence": 100,
      "matchStrategy": "EXACT_MATCH",
      "reasoning": "Identical field names",
      "usageCount": 1234,
      "successRate": 99.1
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
        "main_image": "image",
        "barcode": "barcode",
        "weight": "weight",
        "weight_unit": "weight_unit"
      }
    },
    {
      "operation": "default",
      "spec": {
        "status": "active",
        "published": true,
        "created_at": "${now}"
      }
    },
    {
      "operation": "modify-overwrite-beta",
      "spec": {
        "tags": "=concat(@(1,product_type), ',', @(1,subcategory))"
      }
    }
  ],
  "overallConfidence": 93,
  "unmappedSourceFields": [
    "subcategory",
    "dimensions_length",
    "dimensions_width",
    "dimensions_height",
    "dimension_unit"
  ],
  "unmappedTargetFields": [
    "tags"
  ],
  "matchingMetadata": {
    "knowledgeBasedMatches": 2,
    "semanticMatches": 1,
    "semanticWithBoost": 1,
    "similarityMatches": 1,
    "patternMatches": 1,
    "exactMatches": 3,
    "totalMatches": 9,
    "processingTimeMs": 245,
    "algorithm": "5-tier-adaptive-v1.0"
  },
  "recommendations": [
    {
      "type": "WARNING",
      "message": "Field 'tags' in target schema has no mapping. Consider adding product_type or category."
    },
    {
      "type": "INFO",
      "message": "Dimension fields not mapped to Shopify (not supported in basic product schema)"
    }
  ]
}
```

**Error Responses**:

400 Bad Request - Invalid Input:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": [
    "Field 'sourceSchema' is required and must be an object",
    "Field 'targetSchema' is required and must be an object",
    "Field 'channelId' must be one of: shopify, amazon, walmart, ebay"
  ]
}
```

404 Not Found - Channel Not Found:
```json
{
  "error": "CHANNEL_NOT_FOUND",
  "message": "Channel configuration not found",
  "channelId": "invalid_channel",
  "availableChannels": ["shopify", "amazon", "walmart", "ebay"]
}
```

500 Internal Server Error:
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to process pattern matching",
  "details": "Error connecting to MongoDB or processing algorithm"
}
```

---

### 3. POST /channels/publish - Publish Product to Channel

**Purpose**: Transform master product using field mappings and publish to actual sales channel

**Base URL**: `http://localhost:8888/labamap/api/v1/channels/publish`

**HTTP Method**: POST

**Request Headers**:
```http
POST /labamap/api/v1/channels/publish HTTP/1.1
Host: localhost:8888
Content-Type: application/json
Accept: application/json
Authorization: Bearer {user_token}  // Optional: for multi-user systems
```

**Request Body**:
```json
{
  "masterProductId": "prod_67583923840cde2f4b37e123",
  "masterProductData": {
    "product_name": "Gaming Mouse G502 HERO",
    "product_sku": "GM-502-BLK",
    "base_price": 59.99,
    "product_description": "High-performance wired gaming mouse",
    "stock_quantity": 150,
    "brand": "Logitech",
    "category": "electronics",
    "main_image": "https://cdn.example.com/images/gm502.jpg",
    "barcode": "097855139276",
    "weight": 0.121,
    "weight_unit": "kg"
  },
  "channelId": "shopify",
  "fieldMappings": [
    {
      "sourcePath": "product_name",
      "targetPath": "title",
      "confidence": 95,
      "matchStrategy": "KNOWLEDGE_BASED"
    },
    {
      "sourcePath": "base_price",
      "targetPath": "price",
      "confidence": 100,
      "matchStrategy": "EXACT_MATCH"
    }
    // ... all mappings from analyze endpoint
  ],
  "joltSpec": [
    {
      "operation": "shift",
      "spec": {
        "product_name": "title",
        "base_price": "price",
        "product_sku": "sku"
      }
    }
  ],
  "publishOptions": {
    "skipValidation": false,
    "dryRun": false,
    "autoPublish": true,
    "syncInventory": true
  },
  "organizationId": "org_demo",
  "userId": "user_demo"
}
```

**Request Body Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| masterProductId | string | Yes | Unique ID of master product in your system |
| masterProductData | object | Yes | Full product data (same as sourceSchema) |
| channelId | string | Yes | Target channel identifier |
| fieldMappings | array | Yes | Mappings from analyze endpoint |
| joltSpec | array | Yes | JOLT transformation spec from analyze |
| publishOptions | object | No | Publishing configuration |
| organizationId | string | No | For multi-tenant systems |
| userId | string | No | User who initiated publish |

**Success Response (200 OK)**:
```json
{
  "success": true,
  "publishId": "pub_1702456789_shopify_prod123",
  "channelProductId": "shopify_prod_987654321",
  "channelUrl": "https://mystore.myshopify.com/admin/products/987654321",
  "publishedData": {
    "title": "Gaming Mouse G502 HERO",
    "price": 59.99,
    "sku": "GM-502-BLK",
    "description": "High-performance wired gaming mouse",
    "inventory_quantity": 150,
    "vendor": "Logitech",
    "product_type": "electronics",
    "image": "https://cdn.example.com/images/gm502.jpg",
    "barcode": "097855139276",
    "weight": 0.121,
    "weight_unit": "kg",
    "status": "active",
    "published": true
  },
  "transformationApplied": {
    "fieldsTransformed": 9,
    "fieldsDropped": 2,
    "fieldsAdded": 2
  },
  "warnings": [
    "Field 'tags' was not mapped - using default empty value",
    "Field 'subcategory' in source was not mapped to target"
  ],
  "errors": [],
  "publishedAt": "2025-12-12T10:30:45.123Z",
  "syncStatus": "COMPLETED",
  "mlLearningRecorded": true,
  "performanceMetrics": {
    "transformationTimeMs": 23,
    "channelApiCallTimeMs": 456,
    "totalTimeMs": 479
  }
}
```

**Partial Success Response (207 Multi-Status)**:
```json
{
  "success": false,
  "publishId": "pub_1702456789_shopify_prod123",
  "channelProductId": null,
  "publishedData": null,
  "warnings": [
    "Price validation failed: minimum price is $1.00",
    "Image URL is not accessible"
  ],
  "errors": [
    {
      "field": "inventory_quantity",
      "error": "REQUIRED_FIELD_MISSING",
      "message": "Shopify requires inventory_quantity field"
    }
  ],
  "publishedAt": null,
  "syncStatus": "FAILED",
  "retryable": true
}
```

**Error Responses**:

400 Bad Request:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Product data validation failed",
  "details": [
    "Field 'title' exceeds maximum length of 255 characters",
    "Field 'price' must be greater than 0.01"
  ]
}
```

401 Unauthorized:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Channel credentials not configured",
  "channelId": "shopify",
  "hint": "Configure Shopify API credentials in admin panel"
}
```

500 Internal Server Error:
```json
{
  "error": "PUBLISH_FAILED",
  "message": "Failed to publish to channel",
  "channelId": "shopify",
  "details": "Shopify API error: Rate limit exceeded",
  "retryAfter": 60
}
```

---

## 🧠 5-Tier Matching Algorithm - Implementation Guide

### Overview

The system uses 5 different strategies to match source fields to target fields, ordered by confidence:

```
Tier 1: Knowledge-Based (95-100%) → Learned from production
Tier 2: Semantic Match (85-95%)   → Field type equivalence
Tier 3: Similarity Match (60-90%) → String similarity (Levenshtein)
Tier 4: Pattern Match (75-85%)    → Regex patterns
Tier 5: Channel Boost (varies)    → Platform-specific intelligence
```

### Implementation Steps

#### Step 1: Knowledge-Based Matching (Tier 1)

**Query MongoDB for learned mappings**:

```javascript
async function knowledgeBasedMatch(sourceField, targetField, channelId, organizationId) {
  // Query learned mappings from production usage
  const mapping = await db.collection('channel_field_mappings').findOne({
    channelId: channelId,
    sourceField: sourceField,
    targetField: targetField,
    $or: [
      { organizationId: organizationId },  // Org-specific
      { organizationId: 'org_global' }     // Global learned
    ],
    validated: true,
    successRate: { $gte: 90 }  // Only use high-success mappings
  });

  if (mapping) {
    return {
      sourcePath: sourceField,
      targetPath: targetField,
      confidence: mapping.confidence || 95,
      matchStrategy: 'KNOWLEDGE_BASED',
      usageCount: mapping.usageCount,
      successRate: mapping.successRate,
      reasoning: `Learned from ${mapping.usageCount} successful mappings`
    };
  }

  return null;
}
```

**MongoDB Schema**:
```javascript
{
  _id: ObjectId("..."),
  channelId: "shopify",
  sourceField: "product_name",
  targetField: "title",
  confidence: 95.0,
  matchStrategy: "KNOWLEDGE_BASED",
  successRate: 98.5,
  usageCount: 1542,
  lastUsed: ISODate("2025-12-11"),
  validated: true,
  organizationId: "org_global",
  createdAt: ISODate("2025-01-01"),
  updatedAt: ISODate("2025-12-11")
}
```

#### Step 2: Semantic Matching (Tier 2)

**Check semantic field types**:

```javascript
async function semanticMatch(sourceField, targetField) {
  // Find semantic types for both fields
  const sourceSemantics = await db.collection('field_semantic_knowledge').findOne({
    $or: [
      { aliases: sourceField },
      { commonPatterns: { $regex: new RegExp(sourceField, 'i') } }
    ]
  });

  const targetSemantics = await db.collection('field_semantic_knowledge').findOne({
    $or: [
      { aliases: targetField },
      { commonPatterns: { $regex: new RegExp(targetField, 'i') } }
    ]
  });

  // If both match the same semantic type
  if (sourceSemantics && targetSemantics &&
      sourceSemantics.semanticType === targetSemantics.semanticType) {
    return {
      sourcePath: sourceField,
      targetPath: targetField,
      confidence: sourceSemantics.baseConfidence || 90,
      matchStrategy: 'SEMANTIC_MATCH',
      reasoning: `Both fields represent ${sourceSemantics.semanticType} semantic type`
    };
  }

  return null;
}
```

**Semantic Knowledge Schema**:
```javascript
{
  _id: ObjectId("..."),
  semanticType: "PRODUCT_NAME",
  aliases: ["title", "name", "product_title", "item_name", "product_name", "productName"],
  commonPatterns: ["^product[_-]?name$", "^title$", "^name$", "^item[_-]?name$"],
  keywords: ["product", "name", "title", "item"],
  baseConfidence: 95.0,
  description: "Primary product identifier/title",
  examples: ["Gaming Mouse G502", "iPhone 15 Pro", "Organic Cotton T-Shirt"],
  createdAt: ISODate("2025-01-01"),
  updatedAt: ISODate("2025-12-11")
}
```

**100+ Semantic Types to Create**:
```javascript
const semanticTypes = [
  // Identity & Core
  { type: 'PRODUCT_NAME', aliases: ['title', 'name', 'product_name', 'productName', 'item_name'] },
  { type: 'SKU', aliases: ['sku', 'product_code', 'item_number', 'article_number'] },
  { type: 'BARCODE', aliases: ['barcode', 'upc', 'ean', 'gtin', 'isbn'] },

  // Pricing
  { type: 'PRICE', aliases: ['price', 'base_price', 'unit_price', 'cost', 'amount'] },
  { type: 'COMPARE_PRICE', aliases: ['compare_price', 'msrp', 'list_price', 'original_price'] },
  { type: 'CURRENCY', aliases: ['currency', 'currency_code', 'price_currency'] },

  // Inventory
  { type: 'QUANTITY', aliases: ['quantity', 'stock', 'inventory', 'qty', 'available', 'stock_quantity'] },
  { type: 'WAREHOUSE', aliases: ['warehouse', 'location', 'storage_location', 'fulfillment_center'] },

  // Description
  { type: 'DESCRIPTION', aliases: ['description', 'details', 'product_description', 'long_description'] },
  { type: 'SHORT_DESCRIPTION', aliases: ['short_description', 'summary', 'tagline'] },

  // Categorization
  { type: 'CATEGORY', aliases: ['category', 'type', 'product_type', 'classification'] },
  { type: 'BRAND', aliases: ['brand', 'manufacturer', 'vendor', 'maker', 'supplier'] },
  { type: 'TAGS', aliases: ['tags', 'keywords', 'labels', 'taxonomy'] },

  // Media
  { type: 'IMAGE', aliases: ['image', 'picture', 'photo', 'main_image', 'primary_image', 'image_url'] },
  { type: 'IMAGE_ALT', aliases: ['image_alt', 'alt_text', 'image_description'] },
  { type: 'VIDEO', aliases: ['video', 'video_url', 'product_video'] },

  // Physical Attributes
  { type: 'WEIGHT', aliases: ['weight', 'product_weight', 'item_weight'] },
  { type: 'WEIGHT_UNIT', aliases: ['weight_unit', 'weight_uom'] },
  { type: 'LENGTH', aliases: ['length', 'dimensions_length', 'size_length'] },
  { type: 'WIDTH', aliases: ['width', 'dimensions_width', 'size_width'] },
  { type: 'HEIGHT', aliases: ['height', 'dimensions_height', 'size_height'] },
  { type: 'DIMENSION_UNIT', aliases: ['dimension_unit', 'size_unit', 'measurement_unit'] },

  // SEO
  { type: 'META_TITLE', aliases: ['meta_title', 'seo_title', 'page_title'] },
  { type: 'META_DESCRIPTION', aliases: ['meta_description', 'seo_description'] },
  { type: 'META_KEYWORDS', aliases: ['meta_keywords', 'seo_keywords'] },

  // Variants
  { type: 'VARIANT_COLOR', aliases: ['color', 'colour', 'variant_color'] },
  { type: 'VARIANT_SIZE', aliases: ['size', 'variant_size', 'product_size'] },
  { type: 'VARIANT_MATERIAL', aliases: ['material', 'fabric', 'composition'] }
];
```

#### Step 3: Similarity Matching (Tier 3)

**Use Levenshtein distance**:

```javascript
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function similarityMatch(sourceField, targetField) {
  // Normalize field names
  const source = sourceField.toLowerCase().replace(/[_-]/g, '');
  const target = targetField.toLowerCase().replace(/[_-]/g, '');

  const distance = levenshteinDistance(source, target);
  const maxLength = Math.max(source.length, target.length);
  const similarity = ((maxLength - distance) / maxLength) * 100;

  if (similarity >= 60) {
    return {
      sourcePath: sourceField,
      targetPath: targetField,
      confidence: Math.min(90, similarity),
      matchStrategy: 'SIMILARITY_MATCH',
      reasoning: `Levenshtein similarity: ${Math.round(similarity)}%`
    };
  }

  return null;
}

// Examples:
// "product_name" vs "productName" → 85% similarity
// "stock_quantity" vs "inventory_quantity" → 70% similarity
// "base_price" vs "price" → 65% similarity
```

#### Step 4: Pattern Matching (Tier 4)

**Regex-based detection**:

```javascript
function patternMatch(sourceField, targetField) {
  const patterns = [
    // Price patterns
    { source: /price|cost|amount/i, target: /price|cost|amount/i, type: 'PRICE', confidence: 80 },

    // Quantity patterns
    { source: /qty|quantity|stock|inventory/i, target: /qty|quantity|stock|inventory/i, type: 'QUANTITY', confidence: 75 },

    // Name/Title patterns
    { source: /name|title/i, target: /name|title/i, type: 'NAME', confidence: 85 },

    // Description patterns
    { source: /desc|description|details/i, target: /desc|description|details/i, type: 'DESCRIPTION', confidence: 75 },

    // Image patterns
    { source: /image|img|picture|photo/i, target: /image|img|picture|photo/i, type: 'IMAGE', confidence: 80 },

    // Category patterns
    { source: /category|type|class/i, target: /category|type|class/i, type: 'CATEGORY', confidence: 70 }
  ];

  for (const pattern of patterns) {
    if (pattern.source.test(sourceField) && pattern.target.test(targetField)) {
      return {
        sourcePath: sourceField,
        targetPath: targetField,
        confidence: pattern.confidence,
        matchStrategy: 'PATTERN_MATCH',
        reasoning: `Regex pattern detected ${pattern.type} relationship`
      };
    }
  }

  return null;
}
```

#### Step 5: Channel-Specific Boost (Tier 5)

**Platform intelligence**:

```javascript
function channelBoost(mapping, channelId) {
  const channelRules = {
    shopify: {
      // Shopify uses 'vendor' instead of 'brand'
      'brand->vendor': { boost: 10, reason: "Shopify uses 'vendor' for brand" },
      // Shopify prefers 'product_type' for categories
      'category->product_type': { boost: 8, reason: "Shopify categorization" },
      // Shopify inventory field naming
      'stock->inventory_quantity': { boost: 7, reason: "Shopify inventory naming" }
    },
    amazon: {
      // Amazon requires 'bullet_point' fields
      'feature->bullet_point_1': { boost: 12, reason: "Amazon bullet points" },
      'brand->brand': { boost: 15, reason: "Brand required by Amazon" },
      'upc->product_id': { boost: 10, reason: "Amazon product identification" }
    },
    walmart: {
      // Walmart uses camelCase
      'product_name->productName': { boost: 8, reason: "Walmart camelCase convention" },
      'upc->upc': { boost: 15, reason: "UPC required by Walmart" }
    },
    ebay: {
      // eBay uses PascalCase
      'title->Title': { boost: 5, reason: "eBay PascalCase convention" },
      'price->StartPrice': { boost: 10, reason: "eBay pricing field" }
    }
  };

  const channelSpecific = channelRules[channelId];
  if (!channelSpecific) return mapping;

  const key = `${mapping.sourcePath}->${mapping.targetPath}`;
  const boost = channelSpecific[key];

  if (boost) {
    return {
      ...mapping,
      confidence: Math.min(100, mapping.confidence + boost.boost),
      matchStrategy: 'SEMANTIC_WITH_BOOST',
      channelBoost: boost.boost,
      reasoning: `${mapping.reasoning} + ${boost.reason}`
    };
  }

  return mapping;
}
```

### Complete Matching Algorithm

```javascript
async function analyzePatternMatching(sourceSchema, targetSchema, channelId, options = {}) {
  const { confidenceThreshold = 70, organizationId, userId } = options;
  const mappings = [];
  const unmappedSource = [];
  const unmappedTarget = [...Object.keys(targetSchema)];

  const metadata = {
    knowledgeBasedMatches: 0,
    semanticMatches: 0,
    similarityMatches: 0,
    patternMatches: 0,
    exactMatches: 0,
    totalMatches: 0,
    processingTimeMs: 0
  };

  const startTime = Date.now();

  // Iterate through source fields
  for (const sourceField of Object.keys(sourceSchema)) {
    let bestMatch = null;

    // Try each tier in order
    for (const targetField of Object.keys(targetSchema)) {
      // Tier 1: Knowledge-Based
      let match = await knowledgeBasedMatch(sourceField, targetField, channelId, organizationId);
      if (match && match.confidence >= confidenceThreshold) {
        metadata.knowledgeBasedMatches++;
        bestMatch = match;
        break; // High confidence, stop searching
      }

      // Tier 2: Semantic Match
      match = await semanticMatch(sourceField, targetField);
      if (match && match.confidence >= confidenceThreshold) {
        metadata.semanticMatches++;
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }

      // Tier 3: Similarity Match
      match = similarityMatch(sourceField, targetField);
      if (match && match.confidence >= confidenceThreshold) {
        metadata.similarityMatches++;
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }

      // Tier 4: Pattern Match
      match = patternMatch(sourceField, targetField);
      if (match && match.confidence >= confidenceThreshold) {
        metadata.patternMatches++;
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
      }

      // Exact match check
      if (sourceField.toLowerCase() === targetField.toLowerCase()) {
        bestMatch = {
          sourcePath: sourceField,
          targetPath: targetField,
          confidence: 100,
          matchStrategy: 'EXACT_MATCH',
          reasoning: 'Identical field names'
        };
        metadata.exactMatches++;
        break;
      }
    }

    // Tier 5: Apply channel-specific boost
    if (bestMatch) {
      bestMatch = channelBoost(bestMatch, channelId);
      mappings.push(bestMatch);

      // Remove from unmapped targets
      const targetIndex = unmappedTarget.indexOf(bestMatch.targetPath);
      if (targetIndex > -1) {
        unmappedTarget.splice(targetIndex, 1);
      }
    } else {
      unmappedSource.push(sourceField);
    }
  }

  metadata.totalMatches = mappings.length;
  metadata.processingTimeMs = Date.now() - startTime;

  // Calculate overall confidence
  const avgConfidence = mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length || 0;

  // Generate JOLT spec
  const joltSpec = generateJoltSpec(mappings, sourceSchema, targetSchema);

  return {
    fieldMappings: mappings,
    joltSpec: joltSpec,
    overallConfidence: Math.round(avgConfidence),
    unmappedSourceFields: unmappedSource,
    unmappedTargetFields: unmappedTarget,
    matchingMetadata: metadata
  };
}
```

### JOLT Transformation Generation

```javascript
function generateJoltSpec(mappings, sourceSchema, targetSchema) {
  const shiftSpec = {};
  const defaultSpec = {};

  // Build shift operation from mappings
  mappings.forEach(mapping => {
    shiftSpec[mapping.sourcePath] = mapping.targetPath;
  });

  // Add default values for unmapped required fields
  Object.keys(targetSchema).forEach(field => {
    if (!Object.values(shiftSpec).includes(field)) {
      // Set defaults based on type
      const value = targetSchema[field];
      if (typeof value === 'string') defaultSpec[field] = '';
      else if (typeof value === 'number') defaultSpec[field] = 0;
      else if (typeof value === 'boolean') defaultSpec[field] = false;
    }
  });

  const jolt = [
    {
      operation: 'shift',
      spec: shiftSpec
    }
  ];

  if (Object.keys(defaultSpec).length > 0) {
    jolt.push({
      operation: 'default',
      spec: defaultSpec
    });
  }

  return jolt;
}
```

---

## 🗄️ MongoDB Setup Instructions

### Database Structure

```
Database: labamap
Collections:
  ├── field_semantic_knowledge       (100+ semantic types)
  ├── channel_field_mappings         (Learned mappings)
  ├── channel_configurations         (Channel rules)
  └── product_publish_history        (Audit log)
```

### 1. Create Database and Collections

```javascript
// mongo shell or mongosh
use labamap;

// Create collections with validation
db.createCollection("field_semantic_knowledge", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["semanticType", "aliases", "baseConfidence"],
      properties: {
        semanticType: { bsonType: "string" },
        aliases: { bsonType: "array", items: { bsonType: "string" } },
        commonPatterns: { bsonType: "array" },
        keywords: { bsonType: "array" },
        baseConfidence: { bsonType: "double", minimum: 0, maximum: 100 },
        description: { bsonType: "string" }
      }
    }
  }
});

db.createCollection("channel_field_mappings", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["channelId", "sourceField", "targetField", "confidence"],
      properties: {
        channelId: { bsonType: "string" },
        sourceField: { bsonType: "string" },
        targetField: { bsonType: "string" },
        confidence: { bsonType: "double", minimum: 0, maximum: 100 },
        successRate: { bsonType: "double" },
        usageCount: { bsonType: "int" }
      }
    }
  }
});

db.createCollection("channel_configurations");
db.createCollection("product_publish_history");
```

### 2. Create Indexes

```javascript
// field_semantic_knowledge indexes
db.field_semantic_knowledge.createIndex({ semanticType: 1 }, { unique: true });
db.field_semantic_knowledge.createIndex({ aliases: 1 });

// channel_field_mappings indexes
db.channel_field_mappings.createIndex({ channelId: 1, sourceField: 1, targetField: 1 }, { unique: true });
db.channel_field_mappings.createIndex({ channelId: 1, successRate: -1 });
db.channel_field_mappings.createIndex({ organizationId: 1, channelId: 1 });

// channel_configurations indexes
db.channel_configurations.createIndex({ channelId: 1 }, { unique: true });
db.channel_configurations.createIndex({ active: 1 });

// product_publish_history indexes
db.product_publish_history.createIndex({ masterProductId: 1, channelId: 1 });
db.product_publish_history.createIndex({ publishedAt: -1 });
```

### 3. Seed Initial Data

```javascript
// Insert semantic types (first 20 examples)
db.field_semantic_knowledge.insertMany([
  {
    semanticType: "PRODUCT_NAME",
    aliases: ["title", "name", "product_name", "productName", "item_name", "product_title"],
    commonPatterns: ["^product[_-]?name$", "^title$", "^name$"],
    keywords: ["product", "name", "title", "item"],
    baseConfidence: 95.0,
    description: "Primary product identifier/title",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "PRICE",
    aliases: ["price", "base_price", "unit_price", "cost", "amount", "selling_price"],
    commonPatterns: ["^.*price$", "^cost$", "^amount$"],
    keywords: ["price", "cost", "amount", "money"],
    baseConfidence: 98.0,
    description: "Product price/cost",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "SKU",
    aliases: ["sku", "product_code", "item_number", "article_number", "product_sku"],
    commonPatterns: ["^sku$", "^.*code$", "^.*number$"],
    keywords: ["sku", "code", "number"],
    baseConfidence: 99.0,
    description: "Stock keeping unit identifier",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "DESCRIPTION",
    aliases: ["description", "details", "product_description", "long_description", "body"],
    commonPatterns: ["^.*desc.*$", "^details$", "^body$"],
    keywords: ["description", "details", "body", "content"],
    baseConfidence: 90.0,
    description: "Product description/details",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "QUANTITY",
    aliases: ["quantity", "stock", "inventory", "qty", "available", "stock_quantity", "inventory_quantity"],
    commonPatterns: ["^.*qty$", "^.*quantity$", "^stock$", "^inventory$"],
    keywords: ["quantity", "stock", "inventory", "available"],
    baseConfidence: 92.0,
    description: "Available quantity/stock",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "BRAND",
    aliases: ["brand", "manufacturer", "vendor", "maker", "supplier"],
    commonPatterns: ["^brand$", "^vendor$", "^manufacturer$"],
    keywords: ["brand", "vendor", "manufacturer"],
    baseConfidence: 94.0,
    description: "Product brand/manufacturer",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "CATEGORY",
    aliases: ["category", "type", "product_type", "classification", "product_category"],
    commonPatterns: ["^.*category$", "^.*type$", "^classification$"],
    keywords: ["category", "type", "class"],
    baseConfidence: 88.0,
    description: "Product category/type",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    semanticType: "IMAGE",
    aliases: ["image", "picture", "photo", "main_image", "primary_image", "image_url", "img"],
    commonPatterns: ["^.*image.*$", "^.*img.*$", "^.*photo.*$", "^.*picture.*$"],
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
  // ... add 90 more semantic types
]);

// Insert channel configurations
db.channel_configurations.insertMany([
  {
    channelId: "shopify",
    channelName: "Shopify",
    requiredFields: ["title", "price", "inventory_quantity"],
    optionalFields: ["description", "vendor", "product_type", "tags", "barcode", "weight", "weight_unit"],
    fieldConstraints: {
      title: { type: "string", maxLength: 255, required: true },
      price: { type: "decimal", min: 0.01, required: true },
      inventory_quantity: { type: "integer", min: 0, required: true }
    },
    variantSupport: true,
    maxVariants: 100,
    rateLimit: {
      requestsPerSecond: 2,
      requestsPerDay: 10000
    },
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    channelId: "amazon",
    channelName: "Amazon Seller Central",
    requiredFields: ["title", "brand", "price", "quantity", "product_id"],
    optionalFields: ["bullet_point_1", "bullet_point_2", "description"],
    fieldConstraints: {
      title: { type: "string", maxLength: 200, required: true },
      brand: { type: "string", maxLength: 50, required: true }
    },
    variantSupport: true,
    maxVariants: 2000,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

// Insert initial learned mappings (bootstrap ML system)
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
  }
  // ... add more bootstrap mappings
]);
```

---

## 🧪 Testing Guide

### Test 1: Get Channels

```bash
curl -X GET http://localhost:8888/labamap/api/v1/channels \
  -H "Content-Type: application/json" | jq
```

**Expected Output**:
```json
[
  {
    "channelId": "shopify",
    "channelName": "Shopify",
    "requiredFields": ["title", "price", "inventory_quantity"],
    ...
  }
]
```

### Test 2: Analyze Pattern Matching

```bash
curl -X POST http://localhost:8888/labamap/api/v1/adaptive-pattern-matching/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sourceSchema": {
      "product_name": "Gaming Mouse G502",
      "base_price": 59.99,
      "product_sku": "GM-502",
      "stock_quantity": 150
    },
    "targetSchema": {
      "title": "",
      "price": 0,
      "sku": "",
      "inventory_quantity": 0
    },
    "channelId": "shopify",
    "confidenceThreshold": 70
  }' | jq
```

**Expected Output**:
```json
{
  "fieldMappings": [
    {
      "sourcePath": "product_name",
      "targetPath": "title",
      "confidence": 95,
      "matchStrategy": "KNOWLEDGE_BASED",
      ...
    }
  ],
  "overallConfidence": 93,
  ...
}
```

### Test 3: Publish to Channel (Dry Run)

```bash
curl -X POST http://localhost:8888/labamap/api/v1/channels/publish \
  -H "Content-Type: application/json" \
  -d '{
    "masterProductId": "prod_123",
    "masterProductData": {
      "product_name": "Test Product",
      "base_price": 9.99
    },
    "channelId": "shopify",
    "fieldMappings": [],
    "joltSpec": [],
    "publishOptions": {
      "dryRun": true
    }
  }' | jq
```

---

## 📊 ML Learning System - Update Logic

**After successful publish, update MongoDB**:

```javascript
async function recordPublishSuccess(publishData) {
  const { masterProductId, channelId, fieldMappings, success } = publishData;

  // Update each field mapping's statistics
  for (const mapping of fieldMappings) {
    const filter = {
      channelId: channelId,
      sourceField: mapping.sourcePath,
      targetField: mapping.targetPath
    };

    const existing = await db.collection('channel_field_mappings').findOne(filter);

    if (existing) {
      // Update existing mapping
      const totalUses = existing.usageCount + 1;
      const successfulUses = success
        ? (existing.successRate * existing.usageCount / 100) + 1
        : (existing.successRate * existing.usageCount / 100);
      const newSuccessRate = (successfulUses / totalUses) * 100;

      await db.collection('channel_field_mappings').updateOne(
        filter,
        {
          $inc: { usageCount: 1 },
          $set: {
            successRate: newSuccessRate,
            lastUsed: new Date(),
            validated: success,
            updatedAt: new Date()
          }
        }
      );
    } else {
      // Create new mapping
      await db.collection('channel_field_mappings').insertOne({
        ...filter,
        confidence: mapping.confidence,
        matchStrategy: mapping.matchStrategy,
        successRate: success ? 100.0 : 0.0,
        usageCount: 1,
        lastUsed: new Date(),
        validated: success,
        organizationId: publishData.organizationId || 'org_global',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  // Record publish history
  await db.collection('product_publish_history').insertOne({
    masterProductId: masterProductId,
    channelId: channelId,
    success: success,
    fieldMappings: fieldMappings,
    publishedAt: new Date(),
    metadata: {
      organizationId: publishData.organizationId,
      userId: publishData.userId
    }
  });
}
```

---

## 🚀 Implementation Roadmap

### Week 1: Basic Setup
- [ ] Set up MongoDB connection
- [ ] Create collections and indexes
- [ ] Seed semantic types (at least 20)
- [ ] Implement `GET /channels` endpoint (hardcoded first, then MongoDB)
- [ ] Test with frontend

### Week 2: Core Matching Logic
- [ ] Implement Tier 1: Knowledge-Based matching
- [ ] Implement Tier 2: Semantic matching
- [ ] Implement Tier 3: Similarity matching (Levenshtein)
- [ ] Implement Tier 4: Pattern matching
- [ ] Implement Tier 5: Channel boost
- [ ] Complete `POST /adaptive-pattern-matching/analyze` endpoint
- [ ] Test with sample data

### Week 3: Publishing System
- [ ] Implement JOLT transformation library integration
- [ ] Build validation system for field constraints
- [ ] Implement `POST /channels/publish` endpoint (dry run mode first)
- [ ] Test transformation logic

### Week 4: ML Learning
- [ ] Implement publish success recording
- [ ] Update usageCount and successRate logic
- [ ] Test learning system with multiple publishes
- [ ] Verify confidence scores improve over time

### Week 5: Production Ready
- [ ] Add error handling and validation
- [ ] Implement rate limiting
- [ ] Add caching (channel configurations)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation

---

## 💡 Additional Recommendations

### 1. Technology Stack Suggestions

**Node.js Backend**:
```bash
npm install express mongoose jolt-complete levenshtein-edit-distance cors helmet
```

**Python Backend**:
```bash
pip install fastapi pymongo jolt-python python-Levenshtein uvicorn
```

### 2. Required Libraries

- **JOLT Transformation**: `jolt-complete` (Node) or custom implementation
- **Levenshtein Distance**: `levenshtein-edit-distance` (Node) or `python-Levenshtein` (Python)
- **MongoDB**: `mongoose` (Node) or `pymongo` (Python)
- **Validation**: `joi` (Node) or `pydantic` (Python)

### 3. Error Handling Best Practices

```javascript
// Standard error response format
{
  "error": "ERROR_CODE",
  "message": "Human-readable message",
  "details": "Technical details or array of errors",
  "timestamp": "2025-12-12T10:30:45Z",
  "requestId": "req_abc123"
}
```

### 4. Logging Requirements

Log the following for debugging:
- All API requests (method, path, params)
- Pattern matching results (confidence scores, strategies used)
- MongoDB queries (for performance tuning)
- Errors with stack traces
- ML learning updates

### 5. Performance Targets

- `GET /channels`: < 50ms (cache aggressively)
- `POST /analyze`: < 500ms (optimize MongoDB queries)
- `POST /publish`: < 2000ms (depends on channel API)

### 6. Security Checklist

- [ ] Validate all input data (prevent injection)
- [ ] Sanitize field names (no special characters)
- [ ] Rate limiting per IP/user
- [ ] API authentication (JWT tokens recommended)
- [ ] Channel API credentials encryption
- [ ] CORS configuration
- [ ] Input size limits

---

## 📞 Questions for Backend Team?

If you need clarification on:
1. **5-Tier Algorithm**: Schedule a call to walk through the logic
2. **MongoDB Schema**: Review the collections structure together
3. **JOLT Transformation**: Provide more examples
4. **Testing**: Set up a testing environment
5. **Integration**: How to connect to actual channel APIs (Shopify, Amazon, etc.)

---

**Status**: Ready for Implementation
**Priority**: Start with `GET /channels` → Test → Move to `POST /analyze`
**Timeline**: 5 weeks to production-ready system
**Next Step**: Set up MongoDB and implement `GET /channels` endpoint

---

*This specification provides everything needed to build the backend. Frontend is already complete and waiting for these endpoints.* 🎯
