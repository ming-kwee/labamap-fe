# Backend MongoDB Data Requirements for Variant Image Support

## Overview

To support variant image upload in the frontend schema, the backend needs to add proper metadata to MongoDB collections so the data-driven schema generation can automatically include the `variantImage` field.

---

## Collection 1: ecommerce_product_attributes

### New Document: variantImage Master Attribute

```javascript
{
  "attributeId": "attr_variant_image",
  "fieldName": "variantImage",
  "label": "Variant Image",
  "description": "Image URL specific to this product variant (e.g., color-specific image)",
  "dataType": "string",
  "fieldType": "image",  // or "url" if you want plain URL input
  "category": "ALL",  // Available for all product categories
  "displayLevel": "ADVANCED",  // Show in advanced/variant section
  "section": "variants",  // Part of variant configuration
  "isRequired": false,  // Optional - not all variants need images
  "isArray": false,  // Single image per variant
  "defaultValue": null,
  "order": 15,  // Display order within variant fields

  // Validation rules
  "validationRules": {
    "pattern": "^https?://.*\\.(jpg|jpeg|png|gif|webp)$",
    "minLength": 10,
    "maxLength": 2048,
    "errorMessage": "Must be a valid image URL (JPEG, PNG, GIF, WebP)"
  },

  // UI Configuration
  "uiConfig": {
    "placeholder": "https://storage.googleapis.com/.../variant-image.jpg",
    "helpText": "Upload an image specific to this variant (e.g., show red product for red variant)",
    "component": "ImageUpload",  // Use image upload component
    "uploadCategory": "variant",  // Category for GCP folder structure
    "maxFileSize": 10485760,  // 10MB in bytes
    "acceptedFormats": ["image/jpeg", "image/png", "image/gif", "image/webp"],
    "previewSize": "thumbnail"  // Show small preview in variant table
  },

  // Business context
  "businessContext": {
    "purpose": "variant_differentiation",
    "variantDimension": false,  // NOT a dimension (color/size are dimensions)
    "variantAttribute": true,   // Attribute of a variant (like price, SKU)
    "affectsInventory": false,
    "affectsPricing": false,
    "visibleToCustomer": true
  },

  // Conditional visibility
  "conditionalVisibility": {
    "showWhen": "hasVariants === true",  // Only show when product has variants
    "hideWhen": null
  },

  // Channel relevance
  "channelRelevance": {
    "shopify": {
      "supported": true,
      "required": false,
      "mappingType": "DIRECT",
      "targetField": "product.variants[].image_id",  // Shopify links via image_id
      "notes": "Shopify requires linking image to variant via image_id"
    },
    "amazon": {
      "supported": true,
      "required": false,
      "mappingType": "DIRECT",
      "targetField": "Variation.Images",
      "notes": "Amazon supports variation images"
    },
    "walmart": {
      "supported": true,
      "required": false,
      "mappingType": "DIRECT",
      "targetField": "variant.primaryImageUrl"
    },
    "ebay": {
      "supported": true,
      "required": false,
      "mappingType": "DIRECT",
      "targetField": "Variation.VariationSpecificPictureSet"
    },
    "website": {
      "supported": true,
      "required": false,
      "mappingType": "DIRECT",
      "targetField": "variants.image"
    }
  },

  // Metadata
  "metadata": {
    "version": "1.0",
    "tags": ["variant", "image", "media", "visual"],
    "deprecated": false,
    "addedInVersion": "2.0.0",
    "relatedFields": ["mainImage", "gallery", "color", "size"]
  },

  // Status
  "isActive": true,
  "createdAt": new Date("2026-01-06T00:00:00Z"),
  "updatedAt": new Date("2026-01-06T00:00:00Z"),
  "createdBy": "system",
  "updatedBy": "system"
}
```

### Key Design Decisions:

1. **fieldType: "image" vs "url"**
   - Use `"image"` to trigger ImageUpload component in UI
   - Use `"url"` if you want plain text input with URL validation

2. **displayLevel: "ADVANCED"**
   - Not shown in initial essential fields
   - Appears when user configures variants
   - Prevents cluttering the initial form

3. **section: "variants"**
   - Groups with other variant-specific fields
   - Frontend knows to include this in variant table config

4. **conditionalVisibility**
   - Only shows when `hasVariants === true`
   - Automatically hidden for simple products without variants

5. **businessContext.variantAttribute = true**
   - Marks this as a per-variant field (not a variant dimension)
   - Frontend uses this to determine where to show the field

---

## Collection 2: field_semantic_knowledge

### New Document: Variant Image Semantic Type

```javascript
{
  "semanticTypeId": "sem_variant_image_url",
  "semanticType": "variant_image_url",
  "label": "Variant Image URL",
  "description": "URL of an image representing a specific product variant",
  "category": "media",
  "subcategory": "variant_media",

  // Data characteristics
  "dataType": "string",
  "format": "url",
  "isArray": false,
  "isNullable": true,

  // Common field names that map to this semantic type
  "fieldNamePatterns": [
    "variantImage",
    "variant_image",
    "variantImageUrl",
    "variant_image_url",
    "variantPicture",
    "variant_picture",
    "optionImage",
    "option_image",
    "colorImage",  // Common pattern: color-specific images
    "sizeImage"
  ],

  // Validation
  "validationRules": {
    "urlProtocols": ["http", "https"],
    "fileExtensions": [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    "maxLength": 2048,
    "pattern": "^https?://.*\\.(jpg|jpeg|png|gif|webp)(\\?.*)?$"
  },

  // Business rules
  "businessRules": {
    "uniquenessScope": "variant",  // Should be unique per variant
    "inheritanceRules": null,  // Does not inherit from parent
    "defaultBehavior": "null",  // Default to null if not provided
    "requiredChannels": []  // Not required for any channel
  },

  // Adaptive pattern matching
  "adaptivePatternConfig": {
    "priority": 80,  // High priority for matching
    "confidenceThreshold": 0.7,
    "matchingStrategies": [
      "EXACT_MATCH",      // variantImage → variantImage
      "SEMANTIC_MATCH",   // variant_image → variantImage
      "PATTERN_MATCH",    // *variant*image* → variantImage
      "BUSINESS_CONTEXT"  // variantAttribute = true
    ]
  },

  // Related semantic types
  "relatedSemanticTypes": {
    "parent": "image_url",  // Generic image URL
    "siblings": [
      "main_image_url",
      "gallery_image_url",
      "thumbnail_url"
    ],
    "children": []
  },

  // Channel-specific transformations
  "transformationRules": {
    "shopify": {
      "targetType": "image_reference",
      "transformation": "LINK_TO_IMAGE_ID",
      "notes": "Shopify requires linking existing product image via image_id"
    },
    "amazon": {
      "targetType": "variation_image_url",
      "transformation": "DIRECT",
      "notes": "Amazon accepts direct URL for variation images"
    },
    "walmart": {
      "targetType": "variant_image_url",
      "transformation": "DIRECT"
    }
  },

  // Metadata
  "metadata": {
    "version": "1.0",
    "tags": ["variant", "image", "visual", "media"],
    "examples": [
      "https://storage.googleapis.com/my-store/products/tshirt-red.jpg",
      "https://cdn.example.com/variants/shoe-size-10.png"
    ],
    "usageContext": "variant_configuration"
  },

  // Status
  "isActive": true,
  "createdAt": new Date("2026-01-06T00:00:00Z"),
  "updatedAt": new Date("2026-01-06T00:00:00Z"),
  "createdBy": "system"
}
```

### Why This Matters:

1. **Adaptive Pattern Matching:**
   - When backend receives a field named "variantImage" or "variant_image", it automatically recognizes it
   - Confidence score calculation uses these patterns
   - Helps with intelligent field mapping

2. **Channel Transformation Rules:**
   - Different channels handle variant images differently
   - Shopify: Links to existing image via `image_id`
   - Amazon: Direct URL in variation data
   - This metadata guides transformation logic

3. **Field Name Patterns:**
   - Supports multiple naming conventions
   - `variantImage`, `variant_image`, `colorImage`, etc.
   - Flexible for different data sources

---

## Collection 3: channel_field_mappings

### Document 1: Shopify Variant Image Mapping

```javascript
{
  "mappingId": "map_shopify_variant_image",
  "channelId": "shopify",
  "channelName": "Shopify",

  // Source (Master Product)
  "sourceField": "variants[].variantImage",
  "sourceSemanticType": "variant_image_url",
  "sourceDataType": "string",

  // Target (Shopify API)
  "targetField": "product.variants[].image_id",
  "targetPath": "product.variants[].image_id",  // Alternative: product.variants[].image
  "targetDataType": "integer",  // Shopify uses image_id (integer)

  // Mapping configuration
  "mappingType": "TRANSFORM",  // Not direct - requires transformation
  "transformationType": "IMAGE_URL_TO_ID",
  "transformationLogic": {
    "description": "Convert image URL to Shopify image_id by finding matching image in product.images array",
    "steps": [
      "1. Extract variant image URL from master product",
      "2. Find matching image in product.images array by URL",
      "3. Get the image.id from matched image",
      "4. Set variant.image_id = image.id",
      "5. If no match found, upload image first, then link"
    ],
    "fallbackBehavior": "UPLOAD_AND_LINK",  // If image not in product.images, upload it first
    "syncApiHandles": true  // Sync API handles this transformation
  },

  // Validation
  "validationRules": {
    "required": false,
    "nullable": true,
    "constraints": {
      "imageUrlMustExist": true,
      "imageMustBeInProductImages": false  // Can auto-upload if not present
    }
  },

  // Priority and confidence
  "priority": 85,
  "defaultConfidence": 0.95,  // High confidence - well-understood mapping

  // Bidirectional mapping (for pulling data from Shopify)
  "bidirectional": true,
  "reverseMapping": {
    "sourceField": "product.variants[].image_id",
    "targetField": "variants[].variantImage",
    "transformationType": "IMAGE_ID_TO_URL",
    "transformationLogic": {
      "description": "Convert Shopify image_id to URL",
      "steps": [
        "1. Get variant.image_id from Shopify",
        "2. Find image in product.images where image.id = variant.image_id",
        "3. Extract image.src (URL)",
        "4. Set master product variant.variantImage = image.src"
      ]
    }
  },

  // Channel-specific notes
  "channelSpecificNotes": {
    "shopifyApi": "variants",
    "shopifyApiVersion": "2024-01",
    "apiDocumentation": "https://shopify.dev/docs/api/admin-rest/2024-01/resources/product-variant#resource-object",
    "limitations": [
      "Variant can only reference images that exist in product.images array",
      "Each variant can have only one image",
      "Image must be uploaded to product first before linking to variant"
    ],
    "bestPractices": [
      "Upload variant-specific images to product.images first",
      "Then link via image_id, not image URL",
      "Sync API handles this automatically"
    ]
  },

  // JOLT spec contribution (if using adaptive pattern)
  "joltSpecContribution": {
    "operation": "shift",
    "path": "variants[].variantImage",
    "targetPath": "product.variants[&1].variantImage",
    "notes": "Extract variantImage but don't map to image_id yet - Sync API handles linking"
  },

  // Metadata
  "metadata": {
    "version": "1.0",
    "tags": ["variant", "image", "shopify"],
    "status": "active",
    "testedWith": "Shopify API 2024-01"
  },

  // Status
  "isActive": true,
  "createdAt": new Date("2026-01-06T00:00:00Z"),
  "updatedAt": new Date("2026-01-06T00:00:00Z")
}
```

### Document 2: Amazon Variant Image Mapping

```javascript
{
  "mappingId": "map_amazon_variant_image",
  "channelId": "amazon",
  "channelName": "Amazon Seller Central",

  // Source (Master Product)
  "sourceField": "variants[].variantImage",
  "sourceSemanticType": "variant_image_url",
  "sourceDataType": "string",

  // Target (Amazon API)
  "targetField": "Variation.Images.VariationImage",
  "targetPath": "Product.DescriptionData.Variation.Images.VariationImage",
  "targetDataType": "string",

  // Mapping configuration
  "mappingType": "DIRECT",  // Amazon accepts direct URLs
  "transformationType": "NONE",
  "transformationLogic": {
    "description": "Direct mapping - Amazon accepts image URLs directly",
    "steps": [
      "1. Extract variant image URL",
      "2. Map to Variation.Images.VariationImage",
      "3. Amazon validates and fetches image"
    ]
  },

  // Validation
  "validationRules": {
    "required": false,
    "nullable": true,
    "constraints": {
      "urlMustBePublic": true,
      "imageSizeMin": "500x500",  // Amazon requirement
      "imageSizeMax": "10000x10000",
      "fileFormats": ["JPEG", "PNG", "GIF"],
      "maxFileSize": "10MB"
    }
  },

  // Priority and confidence
  "priority": 85,
  "defaultConfidence": 0.90,

  // Channel-specific notes
  "channelSpecificNotes": {
    "amazonApi": "MWS Product API / SP-API",
    "apiVersion": "2020-09-01",
    "limitations": [
      "Image must be publicly accessible",
      "Minimum 500x500 pixels",
      "Amazon fetches and validates image during submission"
    ]
  },

  // JOLT spec contribution
  "joltSpecContribution": {
    "operation": "shift",
    "path": "variants[].variantImage",
    "targetPath": "Product.DescriptionData.Variation.Images.VariationImage[&1]"
  },

  // Status
  "isActive": true,
  "createdAt": new Date("2026-01-06T00:00:00Z"),
  "updatedAt": new Date("2026-01-06T00:00:00Z")
}
```

### Document 3: Walmart Variant Image Mapping

```javascript
{
  "mappingId": "map_walmart_variant_image",
  "channelId": "walmart",
  "channelName": "Walmart Marketplace",

  // Source
  "sourceField": "variants[].variantImage",
  "sourceSemanticType": "variant_image_url",
  "sourceDataType": "string",

  // Target
  "targetField": "variant.primaryImageUrl",
  "targetPath": "MPItemFeed.MPItem.variant.primaryImageUrl",
  "targetDataType": "string",

  // Mapping
  "mappingType": "DIRECT",
  "transformationType": "NONE",

  // Validation
  "validationRules": {
    "required": false,
    "constraints": {
      "imageSize": "2000x2000 recommended",
      "fileFormats": ["JPEG", "PNG"]
    }
  },

  // Priority
  "priority": 85,
  "defaultConfidence": 0.90,

  // Status
  "isActive": true,
  "createdAt": new Date("2026-01-06T00:00:00Z"),
  "updatedAt": new Date("2026-01-06T00:00:00Z")
}
```

### Document 4: eBay Variant Image Mapping

```javascript
{
  "mappingId": "map_ebay_variant_image",
  "channelId": "ebay",
  "channelName": "eBay",

  // Source
  "sourceField": "variants[].variantImage",
  "sourceSemanticType": "variant_image_url",
  "sourceDataType": "string",

  // Target
  "targetField": "Variation.VariationSpecificPictureSet.PictureURL",
  "targetPath": "Item.Variations.Variation.VariationSpecificPictureSet.PictureURL",
  "targetDataType": "string",

  // Mapping
  "mappingType": "DIRECT",
  "transformationType": "NONE",

  // Validation
  "validationRules": {
    "required": false,
    "constraints": {
      "maxImages": 12,
      "imageSize": "1600x1600 recommended"
    }
  },

  // Priority
  "priority": 85,
  "defaultConfidence": 0.88,

  // Status
  "isActive": true,
  "createdAt": new Date("2026-01-06T00:00:00Z"),
  "updatedAt": new Date("2026-01-06T00:00:00Z")
}
```

---

## Implementation Checklist

### Phase 1: Add Master Attribute
```bash
# MongoDB Shell Command
db.ecommerce_product_attributes.insertOne({
  // ... paste the master attribute document above
});
```

**Verification:**
```javascript
// Check if attribute exists
db.ecommerce_product_attributes.findOne({ fieldName: "variantImage" });

// Expected: Document with all metadata returned
```

### Phase 2: Add Semantic Knowledge
```bash
# MongoDB Shell Command
db.field_semantic_knowledge.insertOne({
  // ... paste the semantic type document above
});
```

**Verification:**
```javascript
// Check if semantic type exists
db.field_semantic_knowledge.findOne({ semanticType: "variant_image_url" });

// Expected: Document with matching patterns and transformation rules
```

### Phase 3: Add Channel Mappings
```bash
# MongoDB Shell Commands (run all 4)
db.channel_field_mappings.insertMany([
  { /* Shopify mapping */ },
  { /* Amazon mapping */ },
  { /* Walmart mapping */ },
  { /* eBay mapping */ }
]);
```

**Verification:**
```javascript
// Check if all mappings exist
db.channel_field_mappings.find({
  sourceField: "variants[].variantImage"
}).count();

// Expected: 4 (Shopify, Amazon, Walmart, eBay)
```

### Phase 4: Update JOLT Spec (Already Planned)

**Option A:** If using adaptive pattern, it will auto-generate based on channel_field_mappings

**Option B:** Manual JOLT update via migration (see VARIANT-IMAGES-IMPLEMENTATION-PLAN-V2.md Phase 4)

---

## Testing Data Flow

### Test 1: Schema Generation
```bash
# Call schema generation endpoint
POST /api/v1/ecommerce/form-schema/generate
{
  "context": {
    "userId": "user-123",
    "organizationId": "org-abc",
    "userRole": "BUSINESS_USER",
    "targetChannels": ["shopify", "amazon"],
    "productCategory": "",
    "permissions": []
  }
}

# Expected response should include:
{
  "fields": [
    // ... other fields
    {
      "fieldName": "variantImage",
      "label": "Variant Image",
      "fieldType": "image",
      "displayLevel": "ADVANCED",
      "required": false,
      "conditionalVisibility": {
        "showWhen": "hasVariants === true"
      }
    }
  ]
}
```

### Test 2: Adaptive Pattern Matching
```bash
# If adaptive pattern is enabled, test field matching
POST /api/v1/ecommerce/adaptive-pattern/match
{
  "sourceFields": [
    { "name": "variantImage", "value": "https://..." },
    { "name": "variant_image", "value": "https://..." },
    { "name": "colorImage", "value": "https://..." }
  ],
  "targetChannel": "shopify"
}

# Expected: All three variants should match to same semantic type
{
  "matches": [
    {
      "sourceField": "variantImage",
      "semanticType": "variant_image_url",
      "targetField": "product.variants[].image_id",
      "confidence": 0.95
    },
    {
      "sourceField": "variant_image",
      "semanticType": "variant_image_url",
      "targetField": "product.variants[].image_id",
      "confidence": 0.92
    },
    {
      "sourceField": "colorImage",
      "semanticType": "variant_image_url",
      "targetField": "product.variants[].image_id",
      "confidence": 0.85
    }
  ]
}
```

### Test 3: JOLT Transformation
```bash
# Input master product
{
  "name": "T-Shirt",
  "variants": [
    {
      "color": "Red",
      "variantImage": "https://cdn.example.com/red.jpg"
    },
    {
      "color": "Blue",
      "variantImage": "https://cdn.example.com/blue.jpg"
    }
  ]
}

# After JOLT transformation
{
  "product": {
    "title": "T-Shirt",
    "variants": [
      {
        "option1": "Red",
        "variantImage": "https://cdn.example.com/red.jpg"  // ✓ Preserved
      },
      {
        "option1": "Blue",
        "variantImage": "https://cdn.example.com/blue.jpg"  // ✓ Preserved
      }
    ]
  }
}
```

### Test 4: Sync API Request Format
```bash
# After ChannelAttributeConverterService processing
{
  "masterProductId": "prod-123",
  "channelId": "shopify",
  "variantGroups": [
    {
      "vrntId": "channel_variant_images",
      "chnlVrntName": "product.variants.images",
      "chnlVrntValue": "[{\"src\":\"https://cdn.example.com/red.jpg\"},{\"src\":\"https://cdn.example.com/blue.jpg\"}]",
      "chnlVrntType": "object[]",
      "isSupportField": true
    }
  ]
}

# ✓ Correct format for Sync API
```

---

## Migration Script Template

```javascript
// File: migrations/add_variant_image_support.js

db = db.getSiblingDB('labamap');

print('========================================');
print('VARIANT IMAGE SUPPORT MIGRATION START');
print('========================================');

// 1. Add master attribute
print('\n1. Adding master attribute: variantImage');
const attributeResult = db.ecommerce_product_attributes.insertOne({
  attributeId: "attr_variant_image",
  fieldName: "variantImage",
  label: "Variant Image",
  description: "Image URL specific to this product variant",
  dataType: "string",
  fieldType: "image",
  category: "ALL",
  displayLevel: "ADVANCED",
  section: "variants",
  isRequired: false,
  isArray: false,
  defaultValue: null,
  order: 15,
  validationRules: {
    pattern: "^https?://.*\\.(jpg|jpeg|png|gif|webp)$",
    minLength: 10,
    maxLength: 2048,
    errorMessage: "Must be a valid image URL"
  },
  uiConfig: {
    placeholder: "https://storage.googleapis.com/.../variant-image.jpg",
    helpText: "Upload an image specific to this variant",
    component: "ImageUpload",
    uploadCategory: "variant",
    maxFileSize: 10485760,
    acceptedFormats: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    previewSize: "thumbnail"
  },
  businessContext: {
    purpose: "variant_differentiation",
    variantDimension: false,
    variantAttribute: true,
    affectsInventory: false,
    affectsPricing: false,
    visibleToCustomer: true
  },
  conditionalVisibility: {
    showWhen: "hasVariants === true",
    hideWhen: null
  },
  channelRelevance: {
    shopify: { supported: true, required: false, mappingType: "DIRECT" },
    amazon: { supported: true, required: false, mappingType: "DIRECT" },
    walmart: { supported: true, required: false, mappingType: "DIRECT" },
    ebay: { supported: true, required: false, mappingType: "DIRECT" },
    website: { supported: true, required: false, mappingType: "DIRECT" }
  },
  metadata: {
    version: "1.0",
    tags: ["variant", "image", "media", "visual"],
    deprecated: false,
    addedInVersion: "2.0.0",
    relatedFields: ["mainImage", "gallery", "color", "size"]
  },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "migration",
  updatedBy: "migration"
});

print('✓ Master attribute added:', attributeResult.insertedId);

// 2. Add semantic knowledge
print('\n2. Adding semantic knowledge: variant_image_url');
const semanticResult = db.field_semantic_knowledge.insertOne({
  semanticTypeId: "sem_variant_image_url",
  semanticType: "variant_image_url",
  label: "Variant Image URL",
  description: "URL of an image representing a specific product variant",
  category: "media",
  subcategory: "variant_media",
  dataType: "string",
  format: "url",
  isArray: false,
  isNullable: true,
  fieldNamePatterns: [
    "variantImage",
    "variant_image",
    "variantImageUrl",
    "variant_image_url",
    "variantPicture",
    "colorImage",
    "optionImage"
  ],
  validationRules: {
    urlProtocols: ["http", "https"],
    fileExtensions: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    maxLength: 2048,
    pattern: "^https?://.*\\.(jpg|jpeg|png|gif|webp)(\\?.*)?$"
  },
  businessRules: {
    uniquenessScope: "variant",
    inheritanceRules: null,
    defaultBehavior: "null",
    requiredChannels: []
  },
  adaptivePatternConfig: {
    priority: 80,
    confidenceThreshold: 0.7,
    matchingStrategies: ["EXACT_MATCH", "SEMANTIC_MATCH", "PATTERN_MATCH", "BUSINESS_CONTEXT"]
  },
  relatedSemanticTypes: {
    parent: "image_url",
    siblings: ["main_image_url", "gallery_image_url", "thumbnail_url"],
    children: []
  },
  transformationRules: {
    shopify: { targetType: "image_reference", transformation: "LINK_TO_IMAGE_ID" },
    amazon: { targetType: "variation_image_url", transformation: "DIRECT" },
    walmart: { targetType: "variant_image_url", transformation: "DIRECT" }
  },
  metadata: {
    version: "1.0",
    tags: ["variant", "image", "visual", "media"],
    examples: [
      "https://storage.googleapis.com/my-store/products/tshirt-red.jpg",
      "https://cdn.example.com/variants/shoe-size-10.png"
    ],
    usageContext: "variant_configuration"
  },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "migration"
});

print('✓ Semantic knowledge added:', semanticResult.insertedId);

// 3. Add channel mappings
print('\n3. Adding channel mappings (4 channels)');
const mappingResults = db.channel_field_mappings.insertMany([
  // Shopify
  {
    mappingId: "map_shopify_variant_image",
    channelId: "shopify",
    channelName: "Shopify",
    sourceField: "variants[].variantImage",
    sourceSemanticType: "variant_image_url",
    targetField: "product.variants[].image_id",
    targetPath: "product.variants[].image_id",
    mappingType: "TRANSFORM",
    transformationType: "IMAGE_URL_TO_ID",
    priority: 85,
    defaultConfidence: 0.95,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // Amazon
  {
    mappingId: "map_amazon_variant_image",
    channelId: "amazon",
    sourceField: "variants[].variantImage",
    sourceSemanticType: "variant_image_url",
    targetField: "Variation.Images.VariationImage",
    mappingType: "DIRECT",
    priority: 85,
    defaultConfidence: 0.90,
    isActive: true,
    createdAt: new Date()
  },
  // Walmart
  {
    mappingId: "map_walmart_variant_image",
    channelId: "walmart",
    sourceField: "variants[].variantImage",
    sourceSemanticType: "variant_image_url",
    targetField: "variant.primaryImageUrl",
    mappingType: "DIRECT",
    priority: 85,
    defaultConfidence: 0.90,
    isActive: true,
    createdAt: new Date()
  },
  // eBay
  {
    mappingId: "map_ebay_variant_image",
    channelId: "ebay",
    sourceField: "variants[].variantImage",
    sourceSemanticType: "variant_image_url",
    targetField: "Variation.VariationSpecificPictureSet.PictureURL",
    mappingType: "DIRECT",
    priority: 85,
    defaultConfidence: 0.88,
    isActive: true,
    createdAt: new Date()
  }
]);

print('✓ Channel mappings added:', mappingResults.insertedIds);

print('\n========================================');
print('VARIANT IMAGE SUPPORT MIGRATION COMPLETE');
print('========================================');
print('\nSummary:');
print('- Master attribute: variantImage ✓');
print('- Semantic type: variant_image_url ✓');
print('- Channel mappings: 4 (Shopify, Amazon, Walmart, eBay) ✓');
print('\nNext steps:');
print('1. Verify schema generation includes variantImage field');
print('2. Test adaptive pattern matching');
print('3. Update JOLT spec (VariantImageJoltSpecMigration.java)');
print('4. Test end-to-end product creation with variant images');
```

---

## Summary for Backend Team

### What to Add:

1. **ecommerce_product_attributes collection:**
   - 1 new document: `variantImage` master attribute
   - Marks it as ADVANCED display level, variant attribute
   - Includes validation rules, UI config, channel relevance

2. **field_semantic_knowledge collection:**
   - 1 new document: `variant_image_url` semantic type
   - Defines field name patterns for adaptive matching
   - Includes transformation rules for each channel

3. **channel_field_mappings collection:**
   - 4 new documents: Shopify, Amazon, Walmart, eBay mappings
   - Each defines how to transform variantImage for that channel
   - Shopify requires special handling (image_id linking)

### Why These Changes Matter:

1. **Data-Driven Schema:**
   - Frontend form will automatically include variantImage field
   - Field only shows when product has variants (conditional visibility)
   - No hardcoding needed in frontend

2. **Adaptive Pattern Matching:**
   - System can intelligently match various field names (variantImage, variant_image, colorImage)
   - Confidence scoring works automatically
   - Reduces manual mapping configuration

3. **Channel Transformation:**
   - Each channel gets correct data format
   - Shopify: Sync API handles image_id linking
   - Amazon/Walmart/eBay: Direct URL mapping
   - Metadata guides transformation logic

4. **Future-Proof:**
   - Easy to add more channels later
   - Field metadata centralized in MongoDB
   - Changes propagate automatically to schema generation

### Execution Steps:

1. Run migration script in MongoDB
2. Restart backend services (to pick up new metadata)
3. Test schema generation endpoint
4. Verify JOLT transformation includes variantImage
5. Test end-to-end product creation

### Dependencies:

- MongoDB collections must exist (already do)
- JOLT spec migration (separate, already planned)
- Sync API update (if needed for Shopify image_id linking)

---

**Document Version:** 1.0
**Created:** 2026-01-06
**Target Collections:** 3 (ecommerce_product_attributes, field_semantic_knowledge, channel_field_mappings)
**Total Documents to Add:** 6 (1 attribute + 1 semantic type + 4 channel mappings)
**Estimated Time:** 30 minutes (run migration + verify)
