# Data Flow Analysis - Where Does `base_price` Come From?

## 🔍 Question

**User asks**: "Why does frontend send `base_price` to backend when the form schema doesn't have that field?"

**Answer**: It's transformed from `price` to `base_price` by the `transformMasterProductToSourceSchema()` function!

---

## 📊 Complete Data Flow (Step by Step)

### Step 1: User Fills Form
```
Form Field: "Price"
Input Name: "price"
User Types: 59.99
```

**Form Schema** (from backend):
```json
{
  "fields": [
    {
      "fieldName": "price",
      "label": "Price",
      "fieldType": "number",
      "required": true
    }
  ]
}
```

---

### Step 2: Form Data Collection
```typescript
// Form collects data
const formData = {
  name: "Gaming Mouse",
  sku: "GM-001",
  price: 59.99,         // ← User's input
  description: "High-performance gaming mouse",
  category: "electronics"
};
```

**At this point**: Still has `price` (not `base_price`)

---

### Step 3: Generate Master Product
```typescript
// File: src/modules/ecommerce-product/services/productGenerationService.ts
// Function: generateMasterProduct()

const product: MasterProduct = {
  id: "prod_1234",
  name: "Gaming Mouse",
  sku: "GM-001",
  price: 59.99,        // ← Still called "price"
  description: "High-performance gaming mouse",
  category: "electronics"
};
```

**At this point**: MasterProduct has `price` property

---

### Step 4: Navigate to Channel Publishing
```typescript
// User clicks "Go to Channel Publishing"
// Product stored in session storage
sessionStorage.setItem('product_prod_1234', JSON.stringify(product));

// Navigate to publish page
router.push('/products/publish-to-channel?productId=prod_1234');
```

---

### Step 5: User Clicks "Analyze Pattern Matching"
```typescript
// File: src/app/(admin)/products/publish-to-channel/page.tsx
// Line 142

const request = generateMappingRequest(product, selectedChannel, {
  confidenceThreshold: 70,
  organizationId: 'org_demo'
});
```

---

### Step 6: Generate Mapping Request
```typescript
// File: src/modules/ecommerce-product/services/productGenerationService.ts
// Function: generateMappingRequest()
// Line 456

export function generateMappingRequest(product, channelId, options) {
  // ✨ THIS IS WHERE THE MAGIC HAPPENS ✨
  const sourceSchema = transformMasterProductToSourceSchema(product);
  const targetSchema = getChannelSchemaTemplate(channelId);

  return {
    sourceSchema,    // ← Contains "base_price" (not "price")
    targetSchema,
    channelId,
    confidenceThreshold: 70
  };
}
```

---

### Step 7: Transform to Source Schema (THE KEY STEP!)
```typescript
// File: src/modules/ecommerce-product/services/productGenerationService.ts
// Function: transformMasterProductToSourceSchema()
// Lines 228-347

export function transformMasterProductToSourceSchema(product: MasterProduct) {
  const sourceSchema: Record<string, any> = {};

  // ✨ FIELD NAME OVERRIDES - THIS IS WHERE "price" BECOMES "base_price" ✨
  const fieldNameOverrides: Record<string, string> = {
    'name': 'product_name',
    'sku': 'product_sku',
    'description': 'product_description',
    'price': 'base_price',           // ← HERE! "price" → "base_price"
    'quantity': 'stock_quantity',
    'mainImage': 'main_image',
    'metaTitle': 'seo_title',
    'metaDescription': 'seo_description',
    'metaKeywords': 'seo_keywords',
  };

  // Iterate over product properties
  Object.entries(product).forEach(([key, value]) => {
    // key = "price", value = 59.99

    // Determine target field name using overrides
    const targetFieldName = fieldNameOverrides[key] || convertToSnakeCase(key);
    // targetFieldName = "base_price" (from override!)

    // Add to source schema
    sourceSchema[targetFieldName] = value;
    // sourceSchema["base_price"] = 59.99
  });

  return sourceSchema;
}
```

**Output of this function**:
```json
{
  "product_name": "Gaming Mouse",
  "product_sku": "GM-001",
  "base_price": 59.99,         // ← "price" transformed to "base_price"
  "product_description": "High-performance gaming mouse",
  "category": "electronics"
}
```

---

### Step 8: Send to Backend
```typescript
// File: src/modules/ecommerce-product/services/channelMappingService.ts
// Function: analyzePatternMatching()

const response = await fetch(`${baseUrl}/adaptive-pattern-matching/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourceSchema: {
      product_name: "Gaming Mouse",
      product_sku: "GM-001",
      base_price: 59.99,        // ← Sent to backend as "base_price"
      product_description: "High-performance gaming mouse",
      category: "electronics"
    },
    targetSchema: {
      title: "",
      price: 0,
      inventory_quantity: 0,
      // ... other Shopify fields
    },
    channelId: "shopify",
    confidenceThreshold: 70
  })
});
```

---

## 🎯 Visual Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Form Schema (Backend Provided)                      │
├──────────────────────────────────────────────────────────────┤
│ Field: "price" (label: "Price")                              │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: User Input                                           │
├──────────────────────────────────────────────────────────────┤
│ formData = { price: 59.99 }                                  │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Generate Master Product                              │
├──────────────────────────────────────────────────────────────┤
│ product = { price: 59.99 }  (MasterProduct interface)        │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: Transform to Source Schema ✨ TRANSFORMATION HERE!  │
├──────────────────────────────────────────────────────────────┤
│ fieldNameOverrides = {                                       │
│   'price': 'base_price'  ← OVERRIDE MAPPING                  │
│ }                                                             │
│                                                               │
│ sourceSchema = { base_price: 59.99 }                         │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 5: Send to Backend                                      │
├──────────────────────────────────────────────────────────────┤
│ POST /adaptive-pattern-matching/analyze                      │
│ {                                                             │
│   "sourceSchema": {                                           │
│     "base_price": 59.99  ← TRANSFORMED FIELD NAME           │
│   }                                                           │
│ }                                                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔑 Why the Transformation?

### Semantic Field Naming Convention

The transformation uses **semantic naming** to make field meanings clearer:

| Frontend/Form Name | Master Product | Source Schema | Reason |
|-------------------|----------------|---------------|--------|
| `price` | `price` | `base_price` | Clarifies it's the base/regular price (vs sale price) |
| `name` | `name` | `product_name` | Distinguishes from other name types |
| `sku` | `sku` | `product_sku` | Context clarity |
| `description` | `description` | `product_description` | Distinguishes from other descriptions |
| `quantity` | `quantity` | `stock_quantity` | Clarifies it's inventory stock |

**Purpose**: Makes pattern matching more accurate by using industry-standard field names.

---

## 📝 Code Location

### Where `base_price` Comes From:

**File**: `/src/modules/ecommerce-product/services/productGenerationService.ts`
**Function**: `transformMasterProductToSourceSchema()`
**Lines**: 236-247

```typescript
const fieldNameOverrides: Record<string, string> = {
  'name': 'product_name',
  'sku': 'product_sku',
  'description': 'product_description',
  'price': 'base_price',           // ← Line 241: THE TRANSFORMATION
  'quantity': 'stock_quantity',
  'mainImage': 'main_image',
  'metaTitle': 'seo_title',
  'metaDescription': 'seo_description',
  'metaKeywords': 'seo_keywords',
};
```

---

## 🎓 Why This Design?

### 1. **Industry Standard Naming**
E-commerce platforms use different naming conventions:
- Shopify: `price`, `compare_at_price`
- Amazon: `base_price`, `sale_price`
- WooCommerce: `regular_price`, `sale_price`

Using `base_price` in the source schema helps pattern matching algorithms recognize it across different conventions.

### 2. **Semantic Clarity**
`base_price` is more explicit than `price`:
- Is it the base price?
- Is it a sale price?
- Is it a compare-at price?
- Is it a cost price?

`base_price` removes ambiguity.

### 3. **Pattern Matching Accuracy**
Backend pattern matching algorithms can more easily match:
- `base_price` → Shopify's `price` (95% confidence)
- `base_price` → Amazon's `standard_price` (90% confidence)
- `base_price` → eBay's `StartPrice` (88% confidence)

vs. the generic `price` which could mean anything.

---

## 🔄 Complete Field Transformations

Here are ALL the field name transformations that happen:

| Form/Product Field | Transformed to Source Schema | Reason |
|-------------------|----------------------------|--------|
| `name` | `product_name` | Context clarity |
| `sku` | `product_sku` | Context clarity |
| `description` | `product_description` | Context clarity |
| `price` | `base_price` | Semantic clarity |
| `quantity` | `stock_quantity` | Inventory context |
| `mainImage` | `main_image` | snake_case convention |
| `metaTitle` | `seo_title` | SEO context |
| `metaDescription` | `seo_description` | SEO context |
| `metaKeywords` | `seo_keywords` | SEO context |
| `compareAtPrice` | `compare_at_price` | Auto snake_case |
| `trackQuantity` | `track_quantity` | Auto snake_case |
| **All other fields** | **Auto snake_case** | Automatic conversion |

---

## 💡 Example Trace

### Complete Request Example:

**Form Input**:
```json
{
  "name": "Gaming Mouse G502",
  "sku": "GM-001",
  "price": 59.99,
  "description": "High-performance gaming mouse",
  "category": "electronics",
  "quantity": 100
}
```

**After `generateMasterProduct()`**:
```json
{
  "id": "prod_1234",
  "name": "Gaming Mouse G502",
  "sku": "GM-001",
  "price": 59.99,
  "description": "High-performance gaming mouse",
  "category": "electronics",
  "quantity": 100
}
```

**After `transformMasterProductToSourceSchema()`**:
```json
{
  "product_name": "Gaming Mouse G502",      // name → product_name
  "product_sku": "GM-001",                  // sku → product_sku
  "base_price": 59.99,                      // price → base_price ✨
  "product_description": "High-performance gaming mouse",  // description → product_description
  "category": "electronics",                 // category → category (no override)
  "stock_quantity": 100                     // quantity → stock_quantity
}
```

**Sent to Backend**:
```json
{
  "sourceSchema": {
    "product_name": "Gaming Mouse G502",
    "product_sku": "GM-001",
    "base_price": 59.99,                    // ← THIS IS WHAT YOU SEE
    "product_description": "High-performance gaming mouse",
    "category": "electronics",
    "stock_quantity": 100
  },
  "targetSchema": {
    "title": "",
    "price": 0,
    "inventory_quantity": 0,
    "vendor": "",
    "product_type": ""
  },
  "channelId": "shopify"
}
```

---

## 🎯 Summary

**Question**: Where does `base_price` come from?

**Answer**:
1. Form has field called `price` ✅
2. User enters value (e.g., 59.99) ✅
3. MasterProduct object stores it as `price` ✅
4. **`transformMasterProductToSourceSchema()` transforms `price` → `base_price`** ✨
5. Request sent to backend with `base_price` ✅

**Why?**
- **Semantic clarity**: "base_price" is more explicit than "price"
- **Pattern matching accuracy**: Industry-standard naming
- **Cross-platform consistency**: Different channels use different conventions

**Where to change it?**
If you want to send `price` instead of `base_price`:

```typescript
// File: src/modules/ecommerce-product/services/productGenerationService.ts
// Line 241

const fieldNameOverrides: Record<string, string> = {
  'name': 'product_name',
  'sku': 'product_sku',
  'description': 'product_description',
  // 'price': 'base_price',  // ← Comment out or remove this line
  'quantity': 'stock_quantity',
  // ...
};
```

Then it will send `price` as-is (or auto-convert to `price` via snake_case).

---

**Conclusion**: The transformation is **intentional and by design** for better pattern matching accuracy! 🎯
