# Publishing Roadmap Analysis - Updated After MongoDB Migration

## Your Questions Answered

### Q1: Does Step 2 use the apiSchema field that was just migrated to MongoDB?

**✅ YES!** Step 2 now uses the `apiSchema` field that was just migrated to MongoDB.

**What happened**:
- Before migration: Step 2 used hardcoded templates in `ComplexSchemaService.java`
- After migration (2025-12-27): Step 2 reads from `apiSchema` field in MongoDB's `channel_configurations` collection
- **Status**: ✅ **READY TO USE** - All 4 channels (Shopify, Amazon, Walmart, eBay) have `apiSchema` populated

**Endpoint**:
```
GET /labamap/api/v1/channels/shopify/schema/complex?format=nested
```

**Response** (from MongoDB apiSchema):
```json
{
  "schema": {
    "product": {
      "title": "",
      "body_html": "",
      "vendor": "",
      "variants": [
        {
          "price": 0.0,
          "sku": "",
          "inventory_quantity": 0,
          "option1": "",
          "option2": ""
        }
      ],
      "options": [
        {
          "name": "",
          "values": []
        }
      ],
      "images": [
        {
          "src": "",
          "alt": "",
          "position": 1
        }
      ]
    }
  }
}
```

---

### Q2: Does Step 3 use the same apiSchema field or a separate field?

**❌ NO - Step 3 uses a SEPARATE field called `validationSchema`**

**Important distinction**:

| Field              | Used By   | Purpose                                                                       | Status             |
|--------------------|-----------|-------------------------------------------------------------------------------|--------------------|
| `apiSchema`        | Step 2    | Defines the **STRUCTURE** (what fields exist, nested objects, arrays)         | ✅ Ready            |
| `validationSchema` | Step 3    | Defines **VALIDATION RULES** (min/max, patterns, required fields, data types) | 🔧 Not implemented |

**Why separate fields?**

1. **apiSchema** = The shape/structure of the API payload
   - Example: `{ product: { title: "", variants: [] } }`
   - Tells you: "What does a Shopify product look like?"

2. **validationSchema** = The rules for valid data (JSON Schema standard)
   - Example: `{ properties: { title: { type: "string", minLength: 1, maxLength: 255 } } }`
   - Tells you: "What values are allowed for each field?"

**Step 3 Implementation (NOT YET DONE)**:

You need to:
1. Add `validationSchema` field to MongoDB `channel_configurations`
2. Create a validation service that uses JSON Schema validator
3. Create validation endpoint: `POST /labamap/api/v1/validate/{channelId}`

**Example of what validationSchema would look like**:
```javascript
{
  channelId: "shopify",

  // Step 2 field (READY)
  apiSchema: {
    product: {
      title: "",
      variants: [...]
    }
  },

  // Step 3 field (NEEDS TO BE ADDED)
  validationSchema: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "product": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 255
          },
          "variants": {
            "type": "array",
            "minItems": 1,
            "maxItems": 100,
            "items": {
              "type": "object",
              "properties": {
                "price": {
                  "type": "string",
                  "pattern": "^[0-9]+(\\.[0-9]{2})?$"
                }
              },
              "required": ["price"]
            }
          }
        },
        "required": ["title", "variants"]
      }
    }
  }
}
```

---

### Q3: How do I switch from Step 1 to Step 2 to Step 3? Is it automatic or like a feature flag?

**❌ NEITHER - It's endpoint-based!**

**Not automatic**: The system doesn't automatically decide which step to use
**Not a feature flag**: There's no configuration toggle or feature flag

**How it works**: Each step uses a **DIFFERENT API ENDPOINT**

### Step Switching Table

| Step       | Endpoint                                                    | What It Returns   | MongoDB Field Used                 |
|------------|-------------------------------------------------------------|-------------------|------------------------------------|
| **Step 1** | `GET /api/v1/channels/shopify/schema`                       | Flat schema       | `requiredFields`, `optionalFields` |
| **Step 2** | `GET /api/v1/channels/shopify/schema/complex?format=nested` | Nested schema     | `apiSchema` ✅                      |
| **Step 3** | `POST /api/v1/validate/shopify`                             | Validation result | `validationSchema` 🔧              |
| **Step 4** | N/A (uses SDK directly)                                     | N/A               | None                               |

### How Your Frontend Chooses

**Your frontend code explicitly decides which endpoint to call**:

```javascript
// Example 1: Based on product complexity
if (product.variants && product.variants.length > 1) {
  // Product has multiple variants → Use Step 2
  const { schema } = await fetch(
    '/labamap/api/v1/channels/shopify/schema/complex?format=nested'
  ).then(r => r.json());
} else {
  // Simple product → Use Step 1
  const { targetSchema } = await fetch(
    '/labamap/api/v1/channels/shopify/schema'
  ).then(r => r.json());
}
```

```javascript
// Example 2: Using multiple steps together
// Step 2: Get schema structure
const { schema } = await fetch(
  '/labamap/api/v1/channels/shopify/schema/complex?format=nested'
).then(r => r.json());

// Build product data
const productData = buildProductFromUserInput();

// Step 3: Validate before publishing (when implemented)
const validation = await fetch(
  '/labamap/api/v1/validate/shopify',
  {
    method: 'POST',
    body: JSON.stringify(productData)
  }
).then(r => r.json());

if (!validation.valid) {
  showErrors(validation.errors);
  return;
}

// Publish to Shopify
publishToShopify(productData);
```

### Frontend Decision Logic

```javascript
class ShopifyPublisher {

  async publish(product) {
    // Decision 1: Which schema to use?
    const schema = this.chooseSchema(product);

    // Decision 2: Enable validation?
    if (this.config.enableValidation) {
      const isValid = await this.validate(product);
      if (!isValid) return;
    }

    // Decision 3: Use SDK or HTTP?
    if (this.config.useSDK) {
      return this.publishViaSDK(product);
    } else {
      return this.publishViaHTTP(product);
    }
  }

  chooseSchema(product) {
    // Your business logic decides
    if (product.variants?.length > 1) {
      return 'complex'; // Step 2
    }
    return 'flat'; // Step 1
  }
}
```

---

## Summary

### What's Ready NOW (After Migration)

✅ **Step 1**: Flat schema - Ready
✅ **Step 2**: Nested schema from MongoDB `apiSchema` - **Ready (Just migrated!)**
✅ **Step 4**: Shopify SDK - Ready (external library)

### What Needs Implementation

🔧 **Step 3**: Validation using `validationSchema` - Not implemented yet

### How Switching Works

1. **NOT automatic** - Frontend explicitly chooses which endpoint to call
2. **NOT a feature flag** - Each step is a different API endpoint
3. **Frontend decides** - Based on your business logic (product complexity, user settings, etc.)
4. **Can combine steps** - Use Step 2 for schema + Step 3 for validation simultaneously

### Next Steps

**This Week** (Step 2 is now ready!):
```bash
# Test Step 2 endpoint
curl http://localhost:8888/labamap/api/v1/channels/shopify/schema/complex?format=nested

# You should see the full nested schema from MongoDB
```

**Week 4** (When you want Step 3):
1. Add `validationSchema` field to channel configurations in MongoDB
2. Implement `SchemaValidationService.java` using JSON Schema validator library
3. Create validation endpoint: `POST /api/v1/validate/{channelId}`
4. Frontend can then call validation before publishing

---

## MongoDB Field Reference

```javascript
// Current state of channel_configurations collection
{
  _id: "...",
  channelId: "shopify",

  // ✅ STEP 1 FIELDS
  requiredFields: ["title", "price", "inventory_quantity"],
  optionalFields: ["description", "vendor", ...],

  // ✅ STEP 2 FIELD (MIGRATED 2025-12-27)
  apiSchema: {
    product: {
      title: "",
      variants: [...],
      options: [...],
      images: [...]
    }
  },

  // 🔧 STEP 3 FIELD (NEEDS TO BE ADDED)
  // validationSchema: {
  //   "$schema": "http://json-schema.org/draft-07/schema#",
  //   "type": "object",
  //   "properties": { ... }
  // }

  apiWrapperConfig: {...},
  isActive: true,
  isSystemDefault: true,
  organizationId: null
}
```

---

## Key Takeaways

1. **Step 2 is NOW ready** - `apiSchema` field populated in MongoDB for all channels
2. **Step 3 uses a DIFFERENT field** - `validationSchema` (not yet implemented)
3. **Switching is endpoint-based** - Your code chooses which endpoint to call
4. **Not automatic or feature flag** - Explicit frontend logic decides
5. **Steps can be combined** - Use Step 2 + Step 3 together for best results

**You're ready to start using Step 2 (complex nested schemas) immediately!** 🚀
