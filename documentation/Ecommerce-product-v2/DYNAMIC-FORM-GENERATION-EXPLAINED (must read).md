# Dynamic Form Generation - Complete Explanation

## Overview

The **DynamicProductCreationFormRefactored** component generates a complete product creation form dynamically from backend schema metadata. The form adapts based on:
- User's organization and permissions
- Selected product category (e.g., Electronics, Apparel, Books)
- Target sales channels (Shopify, Amazon, etc.)
- Conditional field visibility rules

**No fields are hardcoded.** Everything is driven by schema data from the backend.

**Last Updated:** 2026-01-20

---

## Table of Contents

1. [Form Generation Flow](#form-generation-flow)
2. [Schema Structure](#schema-structure)
3. [Example: Electronics Category Schema](#example-electronics-category-schema)
4. [Step-by-Step Form Generation](#step-by-step-form-generation)
5. [Variant-Specific Generation](#variant-specific-generation)
6. [Field Type Mapping](#field-type-mapping)
7. [Conditional Visibility System](#conditional-visibility-system)
8. [Section Organization](#section-organization)
9. [State Management](#state-management)
10. [Real-World Example Walkthrough](#real-world-example-walkthrough)

---

## Form Generation Flow

### High-Level Process

```
┌──────────────────────────────────────────────────────────┐
│ 1. COMPONENT MOUNT                                       │
│    User navigates to /products/create                    │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 2. AUTHENTICATION & CONTEXT                              │
│    - Get userId, organizationId from AuthContext        │
│    - Get userRole (BUSINESS_USER, ADMIN, DEVELOPER)     │
│    - Get targetChannels (Shopify, Amazon, etc.)         │
│    - Get assignedCategories from OrganizationContext    │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 3. LOAD INITIAL SCHEMA (Essential Fields)               │
│    Hook: useProductFormSchema.loadSchema()               │
│    API: POST /api/v1/ecommerce/form-schema/generate      │
│    Body: {                                               │
│      userId, organizationId, userRole,                   │
│      targetChannels, productCategory: "",                │
│      permissions: []                                      │
│    }                                                      │
│    Returns: Essential fields only (name, SKU, price)     │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 4. RENDER ESSENTIAL FORM                                 │
│    Display: Name, SKU, Price, Category selector          │
│    formStage: 'essential'                                │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 5. USER SELECTS CATEGORY                                 │
│    User Action: Select "Electronics" from dropdown       │
│    Trigger: handleCategoryChange("electronics")          │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 6. LOAD CATEGORY-SPECIFIC SCHEMA                        │
│    Hook: loadCategoryFieldsSmooth("electronics")         │
│    API: POST /api/v1/ecommerce/form-schema/generate      │
│    Body: {                                               │
│      userId, organizationId, userRole,                   │
│      targetChannels, productCategory: "electronics",     │
│      permissions: []                                      │
│    }                                                      │
│    Returns: Essential + Electronics-specific fields      │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 7. MERGE & FILTER FIELDS                                │
│    Process:                                              │
│    a. Combine essential + category-specific fields       │
│    b. Apply conditional visibility rules                 │
│    c. Filter by displayLevel (essential, basic, cat...)  │
│    d. Sort by order property                             │
│    e. Group by section (Basic Info, Pricing, etc.)      │
│    formStage: 'category-specific'                        │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 8. RENDER COMPLETE FORM                                  │
│    Display: All sections with category-specific fields   │
│    - Basic Information (name, SKU, category)             │
│    - Pricing (price, cost, compareAt)                    │
│    - Electronics-Specific (warranty, model, brand)       │
│    - Media (mainImage, gallery images)                   │
│    - SEO (meta title, description, keywords)             │
│    - Inventory (stock, trackQuantity)                    │
│    - Variants (hasVariants checkbox + configurator)      │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 9. USER ENABLES VARIANTS                                 │
│    User Action: Check "This product has variants"        │
│    Trigger: handleFieldChange('hasVariants', true)       │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 10. LOAD VARIANT DIMENSIONS                             │
│    Variant dimensions from schema (conditionalVisibility)│
│    Electronics dimensions:                               │
│    - Storage Capacity (64GB, 128GB, 256GB)               │
│    - Color (Black, White, Silver)                        │
│    - Connectivity (WiFi, WiFi+Cellular)                  │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 11. RENDER VARIANT CONFIGURATOR                         │
│    Component: VariantConfiguratorDynamic                 │
│    Shows: Dimension selectors + Variant table            │
└─────────────────────┬────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────────┐
│ 12. USER FILLS FORM & SUBMITS                           │
│    Trigger: handleSubmit()                               │
│    Process:                                              │
│    a. Generate MasterProduct object from formData        │
│    b. Validate against schema rules                      │
│    c. POST /api/v1/ecommerce/products                    │
│    d. Callback: onProductCreated(product)                │
└──────────────────────────────────────────────────────────┘
```

---

## Schema Structure

### Top-Level Schema Object

```typescript
Schema {
  fields: Field[]           // Array of field definitions
  metadata: {               // Optional metadata
    version: string
    lastUpdated: string
    category: string
  }
  validationRules?: {       // Global validation rules
    [fieldName: string]: ValidationRule[]
  }
}
```

### Field Definition Structure

```typescript
Field {
  // Identity
  fieldName: string         // Internal identifier (e.g., "warranty")
  name?: string             // Alternative field name (fallback)
  label: string             // Display label (e.g., "Warranty Information")

  // Type & Input
  fieldType: string         // INPUT type (TEXT, SELECT, CHECKBOX, etc.)
  inputType?: string        // HTML input type (text, number, email)

  // Behavior
  required: boolean         // Must have value?
  readOnly: boolean         // Cannot edit?
  disabled: boolean         // Grayed out?

  // Visibility
  displayLevel: string      // ESSENTIAL, BASIC, CATEGORY-SPECIFIC, ADVANCED
  conditionalVisibility: {  // Show/hide based on other fields
    field: string           // Field to check
    operator: string        // equals, notEquals, contains, etc.
    value: any              // Value to compare
  } | null

  // UI Organization
  section: string           // Which section? (basic, pricing, media, etc.)
  order: number             // Sort order within section
  placeholder?: string      // Input placeholder text
  helpText?: string         // Help tooltip text
  description?: string      // Longer explanation

  // Validation
  validationRules?: {
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: string        // Regex pattern
    maxItems?: number       // For arrays
    custom?: string         // Custom validation function name
  }

  // Select/Options
  options?: Array<{
    value: string
    label: string
    color?: string          // For color fields
    icon?: string           // For icon fields
  }>

  // Defaults
  defaultValue?: any
}
```

---

## Example: Electronics Category Schema

### Full Electronics Schema (Theoretical Example)

```json
{
  "fields": [

    // ===== ESSENTIAL FIELDS (Always shown) =====

    {
      "fieldName": "name",
      "label": "Product Name",
      "fieldType": "TEXT",
      "required": true,
      "displayLevel": "ESSENTIAL",
      "section": "basic",
      "order": 1,
      "placeholder": "Enter product name",
      "validationRules": {
        "minLength": 3,
        "maxLength": 200
      }
    },

    {
      "fieldName": "sku",
      "label": "SKU",
      "fieldType": "TEXT",
      "required": true,
      "displayLevel": "ESSENTIAL",
      "section": "basic",
      "order": 2,
      "placeholder": "e.g., ELEC-PHONE-001",
      "helpText": "Unique product identifier",
      "validationRules": {
        "pattern": "^[A-Z0-9-]+$",
        "minLength": 3,
        "maxLength": 50
      }
    },

    {
      "fieldName": "category",
      "label": "Category",
      "fieldType": "SELECT",
      "required": true,
      "displayLevel": "ESSENTIAL",
      "section": "basic",
      "order": 3,
      "options": [
        { "value": "electronics", "label": "Electronics" },
        { "value": "apparel", "label": "Apparel" },
        { "value": "books", "label": "Books" },
        { "value": "jewelry", "label": "Jewelry" }
      ]
    },

    {
      "fieldName": "price",
      "label": "Price",
      "fieldType": "NUMBER",
      "inputType": "number",
      "required": true,
      "displayLevel": "ESSENTIAL",
      "section": "pricing",
      "order": 10,
      "placeholder": "0.00",
      "validationRules": {
        "min": 0,
        "max": 999999.99
      }
    },

    // ===== BASIC FIELDS (Shown after essential) =====

    {
      "fieldName": "description",
      "label": "Description",
      "fieldType": "TEXTAREA",
      "required": false,
      "displayLevel": "BASIC",
      "section": "basic",
      "order": 4,
      "placeholder": "Describe your product...",
      "helpText": "Detailed product description for customers"
    },

    {
      "fieldName": "cost",
      "label": "Cost",
      "fieldType": "NUMBER",
      "inputType": "number",
      "required": false,
      "displayLevel": "BASIC",
      "section": "pricing",
      "order": 11,
      "placeholder": "0.00",
      "helpText": "Your cost (not shown to customers)"
    },

    {
      "fieldName": "compareAtPrice",
      "label": "Compare at Price",
      "fieldType": "NUMBER",
      "inputType": "number",
      "required": false,
      "displayLevel": "BASIC",
      "section": "pricing",
      "order": 12,
      "placeholder": "0.00",
      "helpText": "Original price (for showing discounts)"
    },

    // ===== ELECTRONICS-SPECIFIC FIELDS =====

    {
      "fieldName": "brand",
      "label": "Brand",
      "fieldType": "TEXT",
      "required": true,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 20,
      "placeholder": "e.g., Apple, Samsung, Sony",
      "conditionalVisibility": {
        "field": "category",
        "operator": "equals",
        "value": "electronics"
      }
    },

    {
      "fieldName": "model",
      "label": "Model Number",
      "fieldType": "TEXT",
      "required": true,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 21,
      "placeholder": "e.g., iPhone 15 Pro",
      "conditionalVisibility": {
        "field": "category",
        "operator": "equals",
        "value": "electronics"
      }
    },

    {
      "fieldName": "warranty",
      "label": "Warranty",
      "fieldType": "SELECT",
      "required": true,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 22,
      "defaultValue": "1_year",
      "options": [
        { "value": "no_warranty", "label": "No Warranty" },
        { "value": "90_days", "label": "90 Days" },
        { "value": "1_year", "label": "1 Year" },
        { "value": "2_years", "label": "2 Years" },
        { "value": "3_years", "label": "3 Years" },
        { "value": "lifetime", "label": "Lifetime" }
      ],
      "conditionalVisibility": {
        "field": "category",
        "operator": "equals",
        "value": "electronics"
      }
    },

    {
      "fieldName": "batteryLife",
      "label": "Battery Life",
      "fieldType": "TEXT",
      "required": false,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 23,
      "placeholder": "e.g., Up to 20 hours",
      "helpText": "Battery life specification",
      "conditionalVisibility": {
        "field": "category",
        "operator": "equals",
        "value": "electronics"
      }
    },

    {
      "fieldName": "connectivity",
      "label": "Connectivity",
      "fieldType": "MULTISELECT",
      "required": false,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 24,
      "options": [
        { "value": "wifi", "label": "WiFi" },
        { "value": "bluetooth", "label": "Bluetooth" },
        { "value": "nfc", "label": "NFC" },
        { "value": "5g", "label": "5G" },
        { "value": "usbc", "label": "USB-C" }
      ],
      "conditionalVisibility": {
        "field": "category",
        "operator": "equals",
        "value": "electronics"
      }
    },

    // ===== MEDIA FIELDS =====

    {
      "fieldName": "mainImage",
      "label": "Main Image",
      "fieldType": "IMAGE",
      "required": true,
      "displayLevel": "BASIC",
      "section": "media",
      "order": 30,
      "helpText": "Primary product image shown in listings"
    },

    {
      "fieldName": "galleryImages",
      "label": "Gallery Images",
      "fieldType": "MEDIA",
      "required": false,
      "displayLevel": "BASIC",
      "section": "media",
      "order": 31,
      "helpText": "Additional product images",
      "validationRules": {
        "maxItems": 10
      }
    },

    // ===== VARIANT FIELDS =====

    {
      "fieldName": "hasVariants",
      "label": "This product has variants",
      "fieldType": "CHECKBOX",
      "required": false,
      "displayLevel": "BASIC",
      "section": "variants",
      "order": 40,
      "helpText": "Enable if product has multiple variations (color, size, etc.)",
      "defaultValue": false
    },

    {
      "fieldName": "variantConfigurator",
      "label": "Product Variants",
      "fieldType": "VARIANT_CONFIGURATOR",
      "required": false,
      "displayLevel": "BASIC",
      "section": "variants",
      "order": 41,
      "description": "Configure product variations such as storage capacity, color, and connectivity options",
      "conditionalVisibility": {
        "field": "hasVariants",
        "operator": "equals",
        "value": true
      }
    },

    // ===== VARIANT DIMENSION FIELDS (Hidden, used by configurator) =====

    {
      "fieldName": "storageCapacity",
      "label": "Storage Capacity",
      "fieldType": "SELECT",
      "required": false,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "variant_dimensions",
      "order": 100,
      "options": [
        { "value": "64gb", "label": "64 GB" },
        { "value": "128gb", "label": "128 GB" },
        { "value": "256gb", "label": "256 GB" },
        { "value": "512gb", "label": "512 GB" },
        { "value": "1tb", "label": "1 TB" }
      ],
      "conditionalVisibility": {
        "field": "hasVariants",
        "operator": "equals",
        "value": true
      }
    },

    {
      "fieldName": "color",
      "label": "Color",
      "fieldType": "SELECT",
      "required": false,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "variant_dimensions",
      "order": 101,
      "options": [
        { "value": "black", "label": "Black", "color": "#000000" },
        { "value": "white", "label": "White", "color": "#FFFFFF" },
        { "value": "silver", "label": "Silver", "color": "#C0C0C0" },
        { "value": "gold", "label": "Gold", "color": "#FFD700" },
        { "value": "blue", "label": "Blue", "color": "#0000FF" }
      ],
      "conditionalVisibility": {
        "field": "hasVariants",
        "operator": "equals",
        "value": true
      }
    },

    {
      "fieldName": "connectivityType",
      "label": "Connectivity Type",
      "fieldType": "SELECT",
      "required": false,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "variant_dimensions",
      "order": 102,
      "options": [
        { "value": "wifi", "label": "WiFi Only" },
        { "value": "wifi_cellular", "label": "WiFi + Cellular" }
      ],
      "conditionalVisibility": {
        "field": "hasVariants",
        "operator": "equals",
        "value": true
      }
    },

    // ===== SEO FIELDS =====

    {
      "fieldName": "metaTitle",
      "label": "Meta Title",
      "fieldType": "TEXT",
      "required": false,
      "displayLevel": "ADVANCED",
      "section": "seo",
      "order": 50,
      "placeholder": "SEO title for search engines",
      "validationRules": {
        "maxLength": 60
      }
    },

    {
      "fieldName": "metaDescription",
      "label": "Meta Description",
      "fieldType": "TEXTAREA",
      "required": false,
      "displayLevel": "ADVANCED",
      "section": "seo",
      "order": 51,
      "placeholder": "SEO description for search engines",
      "validationRules": {
        "maxLength": 160
      }
    }
  ]
}
```

---

## Step-by-Step Form Generation

### Step 1: Component Mount & Authentication

```typescript
// Line 63-70: Get authentication context
const { user, organization, isAuthenticated, isLoading: authLoading } = useAuth();
const {
  organizationConfig,
  getAssignedChannels,
  getAssignedCategories,
  isLoading: orgLoading,
  error: orgError
} = useOrganization();

// Derived values
const userId = user.userId;                              // "user-123"
const organizationId = organization.organizationId;      // "org-abc-123"
const userRole = mapUserRole(user.role);                 // "BUSINESS_USER"
const targetChannels = getAssignedChannels();            // ["shopify", "amazon"]
const assignedCategories = getAssignedCategories();      // ["electronics", "apparel"]
```

**What's happening:**
- Component checks if user is authenticated
- Loads organization configuration
- Extracts user permissions and assigned channels/categories
- These values will be sent to backend for schema generation

---

### Step 2: Load Initial Schema (Essential Fields Only)

```typescript
// Line 215-226: useEffect runs once on mount
useEffect(() => {
  loadSchema();  // No category parameter = essential fields only
}, []); // Empty deps = run once

// Inside useProductFormSchema hook
const loadSchema = async (category?: string) => {
  const context = {
    userId: "user-123",
    organizationId: "org-abc-123",
    userRole: "BUSINESS_USER",
    targetChannels: ["shopify", "amazon"],
    productCategory: "",  // Empty = essential fields only
    permissions: []
  };

  // API Call
  const schemaData = await ProductService.generateFormSchema(context);
  // POST http://localhost:8888/labamap/api/v1/ecommerce/form-schema/generate

  setSchema(schemaData);
  setFormStage('essential');
};
```

**Backend returns:**
```json
{
  "fields": [
    { "fieldName": "name", "displayLevel": "ESSENTIAL", ... },
    { "fieldName": "sku", "displayLevel": "ESSENTIAL", ... },
    { "fieldName": "category", "displayLevel": "ESSENTIAL", ... },
    { "fieldName": "price", "displayLevel": "ESSENTIAL", ... }
  ]
}
```

---

### Step 3: Filter & Render Essential Fields

```typescript
// Line 325-364: useMemo - compute visible fields
const sortedSections = useMemo(() => {
  // Step 1: Get visible fields (apply conditional visibility)
  const visibleFields = getVisibleFields(schema.fields, formData);

  // Step 2: Filter by displayLevel
  const filteredFields = visibleFields.filter((field: any) => {
    const displayLevel = (field.displayLevel || '').toLowerCase();

    if (formStage === 'essential') {
      // Only show ESSENTIAL and BASIC fields
      return displayLevel === 'essential' || displayLevel === 'basic';
    }

    // After category selected, show all
    return true;
  });

  // Step 3: Sort by order
  const sortedFields = filteredFields.sort((a, b) => {
    return (a.order ?? 999) - (b.order ?? 999);
  });

  // Step 4: Group by section
  const fieldsBySection = groupFieldsBySection(sortedFields);

  // Step 5: Sort sections
  return Object.entries(fieldsBySection).sort(...);
}, [schema, formData, formStage]);
```

**Result:**
```javascript
sortedSections = [
  ["basic", [
    { fieldName: "name", order: 1, ... },
    { fieldName: "sku", order: 2, ... },
    { fieldName: "category", order: 3, ... }
  ]],
  ["pricing", [
    { fieldName: "price", order: 10, ... }
  ]]
]
```

---

### Step 4: Render Sections & Fields

```typescript
// Line 453-602: Render each section
{sortedSections.map(([sectionKey, sectionFields]) => {
  const sectionMeta = getSectionMetadata(sectionKey);
  // sectionKey = "basic"
  // sectionMeta = { label: "Basic Information", icon: Package, order: 1, ... }

  return (
    <Card key={sectionKey}>
      <CardHeader>
        <CardTitle>{sectionMeta.label}</CardTitle>  {/* "Basic Information" */}
      </CardHeader>
      <CardContent>
        {sectionFields.map((field: any) => {
          const fieldName = field.name || field.fieldName;
          const fieldType = (field.fieldType || '').toLowerCase();

          // Render different input types based on fieldType
          if (fieldType === 'textarea') {
            return <textarea name={fieldName} ... />;
          } else if (fieldType === 'select') {
            return (
              <select name={fieldName} ...>
                {field.options?.map(option => (
                  <option value={option.value}>{option.label}</option>
                ))}
              </select>
            );
          } else if (fieldType === 'number') {
            return <input type="number" name={fieldName} ... />;
          } else {
            return <input type="text" name={fieldName} ... />;
          }
        })}
      </CardContent>
    </Card>
  );
})}
```

**Rendered HTML (simplified):**
```html
<Card>
  <CardHeader>Basic Information</CardHeader>
  <CardContent>
    <div>
      <label>Product Name *</label>
      <input type="text" name="name" placeholder="Enter product name" />
    </div>
    <div>
      <label>SKU *</label>
      <input type="text" name="sku" placeholder="e.g., ELEC-PHONE-001" />
    </div>
    <div>
      <label>Category *</label>
      <select name="category">
        <option value="">Select...</option>
        <option value="electronics">Electronics</option>
        <option value="apparel">Apparel</option>
        <option value="books">Books</option>
      </select>
    </div>
  </CardContent>
</Card>

<Card>
  <CardHeader>Pricing</CardHeader>
  <CardContent>
    <div>
      <label>Price *</label>
      <input type="number" name="price" placeholder="0.00" />
    </div>
  </CardContent>
</Card>
```

---

### Step 5: User Selects Category "Electronics"

```typescript
// Line 532: User selects "electronics" from dropdown
<select
  name="category"
  value={formData.category || ''}
  onChange={(e) => handleFieldChange("category", e.target.value)}
>
  <option value="electronics">Electronics</option>
</select>

// Line 261-263: handleFieldChange
const handleFieldChange = (fieldName: string, value: any) => {
  handleFieldChangeInternal(fieldName, value);
};

// Inside useProductFieldHandler hook
export function useProductFieldHandler({ formData, setFormData, onCategoryChange }) {
  const handleFieldChangeInternal = (fieldName: string, value: any) => {
    // Update formData
    setFormData(prev => ({ ...prev, [fieldName]: value }));

    // Special handling for category field
    if (fieldName === 'category') {
      console.log('[FieldHandler] Category changed to:', value);
      onCategoryChange(value);  // Trigger schema reload
    }
  };

  return { handleFieldChangeInternal, ... };
}

// Line 185-191: Category change callback
const handleCategoryChange = useCallback((category: string) => {
  loadCategoryFieldsSmooth(category);  // Load electronics fields
}, [loadCategoryFieldsSmooth]);
```

**What happens:**
1. User selects "Electronics"
2. `formData.category` updates to "electronics"
3. `handleFieldChange` detects category change
4. Calls `onCategoryChange("electronics")`
5. Triggers `loadCategoryFieldsSmooth("electronics")`

---

### Step 6: Load Electronics-Specific Schema

```typescript
// Inside useProductFormSchema hook
const loadCategoryFieldsSmooth = async (category: string) => {
  setIsAddingCategoryFields(true);  // Show loading indicator

  const context = {
    userId: "user-123",
    organizationId: "org-abc-123",
    userRole: "BUSINESS_USER",
    targetChannels: ["shopify", "amazon"],
    productCategory: "electronics",  // NOW HAS CATEGORY
    permissions: []
  };

  // API Call with category
  const schemaData = await ProductService.generateFormSchema(context);
  // POST http://localhost:8888/labamap/api/v1/ecommerce/form-schema/generate

  setSchema(schemaData);
  setFormStage('category-specific');
  setIsAddingCategoryFields(false);
};
```

**Backend now returns:**
```json
{
  "fields": [
    // Essential fields (same as before)
    { "fieldName": "name", "displayLevel": "ESSENTIAL", ... },
    { "fieldName": "sku", "displayLevel": "ESSENTIAL", ... },
    { "fieldName": "category", "displayLevel": "ESSENTIAL", ... },
    { "fieldName": "price", "displayLevel": "ESSENTIAL", ... },

    // Basic fields
    { "fieldName": "description", "displayLevel": "BASIC", ... },
    { "fieldName": "cost", "displayLevel": "BASIC", ... },

    // Electronics-specific fields (NEW!)
    {
      "fieldName": "brand",
      "label": "Brand",
      "fieldType": "TEXT",
      "required": true,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 20,
      "conditionalVisibility": {
        "field": "category",
        "operator": "equals",
        "value": "electronics"
      }
    },
    {
      "fieldName": "model",
      "label": "Model Number",
      "fieldType": "TEXT",
      "required": true,
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 21
    },
    {
      "fieldName": "warranty",
      "label": "Warranty",
      "fieldType": "SELECT",
      "displayLevel": "CATEGORY-SPECIFIC",
      "section": "specifications",
      "order": 22,
      "options": [
        { "value": "no_warranty", "label": "No Warranty" },
        { "value": "1_year", "label": "1 Year" },
        { "value": "2_years", "label": "2 Years" }
      ]
    },

    // Variant dimension fields (conditionally visible)
    {
      "fieldName": "storageCapacity",
      "label": "Storage Capacity",
      "fieldType": "SELECT",
      "section": "variant_dimensions",
      "order": 100,
      "options": [
        { "value": "64gb", "label": "64 GB" },
        { "value": "128gb", "label": "128 GB" },
        { "value": "256gb", "label": "256 GB" }
      ],
      "conditionalVisibility": {
        "field": "hasVariants",
        "operator": "equals",
        "value": true
      }
    },
    {
      "fieldName": "color",
      "label": "Color",
      "fieldType": "SELECT",
      "section": "variant_dimensions",
      "order": 101,
      "options": [
        { "value": "black", "label": "Black", "color": "#000000" },
        { "value": "silver", "label": "Silver", "color": "#C0C0C0" }
      ],
      "conditionalVisibility": {
        "field": "hasVariants",
        "operator": "equals",
        "value": true
      }
    }
  ]
}
```

---

### Step 7: Filter & Render Complete Form

```typescript
// Line 325-364: useMemo recalculates with new schema
const sortedSections = useMemo(() => {
  // formStage is now 'category-specific'
  // formData.category is now 'electronics'

  // Step 1: Get visible fields
  const visibleFields = getVisibleFields(schema.fields, formData);

  // This applies conditional visibility rules:
  // - "brand" field has conditionalVisibility: { field: "category", value: "electronics" }
  // - formData.category === "electronics" ✓
  // - Field is visible!

  // Step 2: Filter by displayLevel
  const filteredFields = visibleFields.filter((field: any) => {
    const displayLevel = (field.displayLevel || '').toLowerCase();

    // Now in 'category-specific' stage, show all applicable fields
    const isEssential = displayLevel === 'essential';
    const isBasic = displayLevel === 'basic';
    const isCategorySpecific = displayLevel === 'category-specific';

    return isEssential || isBasic || isCategorySpecific;
  });

  // filteredFields now includes:
  // - name, sku, category, price (essential)
  // - description, cost, compareAtPrice (basic)
  // - brand, model, warranty, batteryLife (category-specific)
  // - mainImage, galleryImages (media)
  // - hasVariants (variant control)

  // Step 3: Sort by order
  // Step 4: Group by section
  // Step 5: Sort sections

  return sections;
}, [schema, formData, formStage]);
```

**Result:**
```javascript
sortedSections = [
  ["basic", [
    { fieldName: "name", order: 1, ... },
    { fieldName: "sku", order: 2, ... },
    { fieldName: "category", order: 3, ... },
    { fieldName: "description", order: 4, ... }
  ]],
  ["pricing", [
    { fieldName: "price", order: 10, ... },
    { fieldName: "cost", order: 11, ... },
    { fieldName: "compareAtPrice", order: 12, ... }
  ]],
  ["specifications", [
    { fieldName: "brand", order: 20, ... },
    { fieldName: "model", order: 21, ... },
    { fieldName: "warranty", order: 22, ... },
    { fieldName: "batteryLife", order: 23, ... }
  ]],
  ["media", [
    { fieldName: "mainImage", order: 30, ... },
    { fieldName: "galleryImages", order: 31, ... }
  ]]
]
```

**Rendered Form (Electronics-specific):**
```html
<!-- Basic Information Section -->
<Card>
  <CardHeader>Basic Information</CardHeader>
  <CardContent>
    <input type="text" name="name" placeholder="Product Name" />
    <input type="text" name="sku" placeholder="SKU" />
    <select name="category">
      <option value="electronics" selected>Electronics</option>
    </select>
    <textarea name="description" placeholder="Description" />
  </CardContent>
</Card>

<!-- Pricing Section -->
<Card>
  <CardHeader>Pricing</CardHeader>
  <CardContent>
    <input type="number" name="price" placeholder="Price" />
    <input type="number" name="cost" placeholder="Cost" />
    <input type="number" name="compareAtPrice" placeholder="Compare at Price" />
  </CardContent>
</Card>

<!-- Specifications Section (ELECTRONICS-SPECIFIC!) -->
<Card>
  <CardHeader>Specifications</CardHeader>
  <CardContent>
    <input type="text" name="brand" placeholder="Brand" />
    <input type="text" name="model" placeholder="Model Number" />
    <select name="warranty">
      <option value="1_year">1 Year</option>
      <option value="2_years">2 Years</option>
    </select>
    <input type="text" name="batteryLife" placeholder="Battery Life" />
  </CardContent>
</Card>

<!-- Media Section -->
<Card>
  <CardHeader>Media</CardHeader>
  <CardContent>
    <ImageUploadField name="mainImage" label="Main Image" />
    <ImageUploadField name="galleryImages" label="Gallery Images" multiple />
  </CardContent>
</Card>
```

---

## Variant-Specific Generation

### Step 8: User Enables Variants

```typescript
// Line 605-748: Special variant section rendering
{(() => {
  // Find hasVariants field in schema
  const hasVariantsField = schema.fields.find((field: any) => {
    return (field.name || field.fieldName) === 'hasVariants';
  });

  // Find variantConfigurator field in schema
  const variantField = schema.fields.find((field: any) => {
    const fieldType = (field.fieldType || '').toLowerCase();
    return fieldType === 'variant_configurator';
  });

  // Only render if variantConfigurator exists in schema
  if (!variantField) return null;

  const hasVariantsEnabled = formData['hasVariants'] || false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Variants</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Checkbox to enable variants */}
        <input
          type="checkbox"
          id="hasVariants"
          checked={hasVariantsEnabled}
          onChange={(e) => handleFieldChange('hasVariants', e.target.checked)}
        />
        <label htmlFor="hasVariants">This product has variants</label>

        {/* Variant Configurator Component */}
        {variantField && (
          <VariantConfiguratorDynamic
            value={formData.variantConfigurator}
            onChange={handleVariantConfiguratorChange}
            schema={schema}  // Pass full schema
            formData={formData}
            organizationId={organization.organizationId}
            productId={formData.id || `temp_${Date.now()}`}
          />
        )}
      </CardContent>
    </Card>
  );
})()}
```

**User Action:**
1. User checks "This product has variants" checkbox
2. `formData.hasVariants` updates to `true`
3. Component re-renders
4. Conditional visibility rules re-evaluate

---

### Step 9: Auto-Detect Variant Dimensions (Intelligent Discovery)

The VariantConfiguratorDynamic component **automatically discovers** variant dimensions from the schema using intelligent pattern matching. It does NOT rely on a specific section name.

```typescript
// Inside VariantConfiguratorDynamic component - Line 71-180
// 🚀 AUTOMATICALLY DETECT ALL VARIANT DIMENSIONS FROM BACKEND SCHEMA

const { variantDimensions, variantConfig } = useMemo(() => {
  if (!schema?.fields) {
    return { variantDimensions: [], variantConfig: [] };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: DISCOVER DIMENSION FIELDS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const dimensionFields = schema.fields.filter((field: any) => {
    const fieldName = field.fieldName || field.name || '';

    // ✅ REQUIREMENT 1: Must be a SELECT field with options
    const hasOptions =
      (field.fieldType === 'SELECT' || field.fieldType === 'select') &&
      field.options &&
      Array.isArray(field.options) &&
      field.options.length > 0;

    if (!hasOptions) return false;

    // ✅ REQUIREMENT 2: Must match variant dimension patterns
    const fieldNameLower = fieldName.toLowerCase();
    const isCommonVariantField =
      fieldNameLower.includes('color') ||       // Color, productColor, variantColor
      fieldNameLower.includes('size') ||        // Size, clothingSize, shoeSize
      fieldNameLower.includes('material') ||    // Material, fabricMaterial
      fieldNameLower.includes('style') ||       // Style, neckStyle
      fieldNameLower.includes('pattern') ||     // Pattern, printPattern
      fieldNameLower.includes('finish') ||      // Finish, surfaceFinish
      fieldNameLower.includes('texture') ||     // Texture, fabricTexture
      fieldNameLower.includes('fabric') ||      // Fabric, fabricType
      fieldNameLower.includes('type') ||        // Type, connectivityType, storageType
      fieldNameLower.includes('variant') ||     // Variant, variantOption
      fieldNameLower.includes('capacity') ||    // Capacity, storageCapacity
      fieldNameLower.includes('connectivity');  // Connectivity, connectivityType

    // ✅ REQUIREMENT 3: OR explicitly marked as variant dimension
    const isExplicitVariantDimension =
      field.validationRules?.isVariantDimension ||
      field.businessContext?.variantDimension ||
      field.metadata?.variantDimension;

    const isVariantField = isCommonVariantField || isExplicitVariantDimension;

    // ✅ REQUIREMENT 4: Must pass conditional visibility check
    const isVisible = isFieldVisible(field, formData);

    return isVariantField && isVisible;
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: TRANSFORM TO DIMENSION STRUCTURE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const dimensions: VariantDimension[] = dimensionFields.map((field: any) => ({
    name: field.fieldName || field.name,
    label: field.label,
    options: field.options.map((opt: any) =>
      typeof opt === 'string' ? opt : opt.value || opt.label || opt
    )
  }));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: GET VARIANT TABLE CONFIGURATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const getVariantFields = () => {
    // Check if backend provides explicit variant table config
    const variantField = schema.fields.find((f: any) =>
      (f.fieldName === 'variantConfigurator' || f.name === 'variantConfigurator')
    );

    if (variantField?.validationRules?.variantFields) {
      // Use backend-defined configuration
      return variantField.validationRules.variantFields;
    }

    // Auto-generate table configuration from detected dimensions
    const autoConfig = [
      ...dimensions.map(dim => ({
        name: dim.name,
        label: dim.label,
        type: 'select'
      })),
      { name: 'variantImages', label: 'Images', type: 'images' },
      { name: 'price', label: 'Price', type: 'number' },
      { name: 'cost', label: 'Cost', type: 'number' },
      { name: 'comparePrice', label: 'Compare Price', type: 'number' },
      { name: 'stock', label: 'Stock', type: 'number' },
      { name: 'sku', label: 'SKU', type: 'text' },
      { name: 'weight', label: 'Weight', type: 'number' },
      { name: 'barcode', label: 'Barcode', type: 'text' }
    ];

    return autoConfig;
  };

  return {
    variantDimensions: dimensions,
    variantConfig: getVariantFields()
  };
}, [schema, formData]);
```

**What happens for Electronics category:**

```javascript
Input Schema Fields (SELECT fields only):
[
  {
    fieldName: "storageCapacity",
    label: "Storage Capacity",
    fieldType: "SELECT",
    options: [
      { value: "64gb", label: "64 GB" },
      { value: "128gb", label: "128 GB" },
      { value: "256gb", label: "256 GB" }
    ],
    conditionalVisibility: {
      showWhen: "hasVariants === true"
    }
  },
  {
    fieldName: "color",
    label: "Color",
    fieldType: "SELECT",
    options: [
      { value: "black", label: "Black", color: "#000000" },
      { value: "silver", label: "Silver", color: "#C0C0C0" }
    ],
    conditionalVisibility: {
      showWhen: "hasVariants === true"
    }
  },
  {
    fieldName: "connectivityType",
    label: "Connectivity Type",
    fieldType: "SELECT",
    options: [
      { value: "wifi", label: "WiFi Only" },
      { value: "wifi_cellular", label: "WiFi + Cellular" }
    ],
    conditionalVisibility: {
      showWhen: "hasVariants === true"
    }
  },
  {
    fieldName: "warranty",  // ❌ NOT a dimension
    label: "Warranty",
    fieldType: "SELECT",
    options: [...],
    conditionalVisibility: {
      showWhen: "category === 'electronics'"  // Different condition
    }
  }
]

Detection Process:
─────────────────

Field: "storageCapacity"
  ✓ Has SELECT type with options (3 options)
  ✓ Field name contains "capacity" → Matches pattern
  ✓ conditionalVisibility check: hasVariants === true ✓
  → DETECTED AS DIMENSION

Field: "color"
  ✓ Has SELECT type with options (2 options)
  ✓ Field name contains "color" → Matches pattern
  ✓ conditionalVisibility check: hasVariants === true ✓
  → DETECTED AS DIMENSION

Field: "connectivityType"
  ✓ Has SELECT type with options (2 options)
  ✓ Field name contains "type" → Matches pattern
  ✓ conditionalVisibility check: hasVariants === true ✓
  → DETECTED AS DIMENSION

Field: "warranty"
  ✓ Has SELECT type with options
  ✗ Field name "warranty" → No pattern match
  ✗ No explicit variant dimension marker
  → NOT DETECTED AS DIMENSION

Output Dimensions:
──────────────────
[
  {
    name: "storageCapacity",
    label: "Storage Capacity",
    options: ["64gb", "128gb", "256gb"]
  },
  {
    name: "color",
    label: "Color",
    options: ["black", "silver"]
  },
  {
    name: "connectivityType",
    label: "Connectivity Type",
    options: ["wifi", "wifi_cellular"]
  }
]

Output Table Config:
────────────────────
[
  { name: "storageCapacity", label: "Storage Capacity", type: "select" },
  { name: "color", label: "Color", type: "select" },
  { name: "connectivityType", label: "Connectivity Type", type: "select" },
  { name: "variantImages", label: "Images", type: "images" },
  { name: "price", label: "Price", type: "number" },
  { name: "cost", label: "Cost", type: "number" },
  { name: "comparePrice", label: "Compare Price", type: "number" },
  { name: "stock", label: "Stock", type: "number" },
  { name: "sku", label: "SKU", type: "text" },
  { name: "weight", label: "Weight", type: "number" },
  { name: "barcode", label: "Barcode", type: "text" }
]
```

**Key Insights:**

1. **No Section-Based Detection:** The component does NOT look for `section === 'variant_dimensions'`. It uses intelligent pattern matching on field names.

2. **Conditional Visibility with Expression Evaluation:** Uses `showWhen` expressions that are evaluated dynamically:
   ```typescript
   conditionalVisibility: {
     showWhen: "hasVariants === true && category === 'electronics'"
   }
   // Gets evaluated by replacing variables with actual values
   ```

3. **Automatic vs Explicit Marking:**
   - **Automatic:** Field name matches patterns (color, size, material, etc.)
   - **Explicit:** Backend sets `validationRules.isVariantDimension = true`

4. **Why Warranty is NOT a Dimension:**
   - It's a SELECT field with options ✓
   - But "warranty" doesn't match any dimension patterns ✗
   - Not explicitly marked as variant dimension ✗
   - Therefore, excluded from dimensions

---

### Step 10: Render Variant UI with State Management

```typescript
// Inside VariantConfiguratorDynamic component - Line 216-410

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATE MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Track selected options for each dimension
const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
// Example: { storageCapacity: ["128gb", "256gb"], color: ["black"], connectivityType: [] }

// Track generated variants
const [variants, setVariants] = useState<VariantOption[]>([]);

// Track last category to detect category changes
const [lastCategory, setLastCategory] = useState<string | undefined>(formData?.category);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CATEGORY CHANGE DETECTION & RESET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

React.useEffect(() => {
  const currentCategory = formData?.category;
  const categoryChanged = currentCategory !== lastCategory;

  // CRITICAL: Only reset when category actually changes
  if (categoryChanged && variantDimensions.length > 0) {
    console.log('🔄 Category changed - Resetting all selections and variants');

    // Reset all selections to empty
    const resetSelections: Record<string, string[]> = {};
    variantDimensions.forEach(dim => {
      resetSelections[dim.name] = [];
    });

    setSelectedOptions(resetSelections);
    setVariants([]);
    setLastCategory(currentCategory);
  }
}, [formData?.category, variantDimensions, lastCategory]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPTION CHANGE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const handleOptionChange = (dimensionName: string, optionValue: string, checked: boolean) => {
  const newSelections = { ...selectedOptions };

  if (checked) {
    // Add option to selected list
    newSelections[dimensionName] = [...(newSelections[dimensionName] || []), optionValue];
  } else {
    // Remove option from selected list
    newSelections[dimensionName] = (newSelections[dimensionName] || []).filter(v => v !== optionValue);
  }

  setSelectedOptions(newSelections);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VARIANT GENERATION (CARTESIAN PRODUCT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const generateVariants = () => {
  // Get dimensions that have at least one selected option
  const activeDimensions = variantDimensions.filter(dim =>
    selectedOptions[dim.name] && selectedOptions[dim.name].length > 0
  );

  if (activeDimensions.length === 0) {
    console.log('No dimensions selected - cannot generate variants');
    return;
  }

  // 🔥 RECURSIVE CARTESIAN PRODUCT - Works for ANY number of dimensions
  const generateCombinations = (
    dimensions: VariantDimension[],
    currentCombination: Record<string, string> = {}
  ): Record<string, string>[] => {
    if (dimensions.length === 0) {
      return [currentCombination];
    }

    const [firstDimension, ...restDimensions] = dimensions;
    const selectedValues = selectedOptions[firstDimension.name] || [];

    const combinations: Record<string, string>[] = [];

    selectedValues.forEach(value => {
      const newCombination = { ...currentCombination, [firstDimension.name]: value };
      const subCombinations = generateCombinations(restDimensions, newCombination);
      combinations.push(...subCombinations);
    });

    return combinations;
  };

  const allCombinations = generateCombinations(activeDimensions);
  console.log('Generated combinations:', allCombinations);

  // Create variants from combinations
  const newVariants: VariantOption[] = allCombinations.map(combination => {
    // Create unique ID from all dimension values
    const idParts = activeDimensions.map(dim => combination[dim.name]).join('-');
    const id = idParts.toLowerCase().replace(/\s+/g, '-');

    // Find existing variant to preserve user inputs (images, prices, etc.)
    const existing = variants.find(v => v.id === id);

    // Create variant with all dimension values + preserved data
    const variant: VariantOption = {
      id,
      ...combination, // All dimension values (storageCapacity, color, connectivityType)
      variantImages: existing?.variantImages || [],  // Preserve uploaded images
      price: existing?.price || 0,
      cost: existing?.cost || 0,
      comparePrice: existing?.comparePrice || 0,
      stock: existing?.stock || 0,
      weight: existing?.weight || 0,
      sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
      barcode: existing?.barcode || ''
    };

    return variant;
  });

  console.log('Created variants:', newVariants);

  // Update local state (does NOT update parent immediately)
  setVariants(newVariants);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VARIANT UPDATE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const updateVariant = (id: string, field: string, newValue: any) => {
  const updatedVariants = variants.map(variant =>
    variant.id === id ? { ...variant, [field]: newValue } : variant
  );
  setVariants(updatedVariants);

  // Notify parent component of changes
  updateParent(updatedVariants, selectedOptions);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RENDER UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Calculate total possible combinations
const totalCombinations = variantDimensions.reduce((total, dim) => {
  const selectedCount = selectedOptions[dim.name]?.length || 0;
  return selectedCount > 0 ? total * selectedCount : total;
}, 1);

return (
  <div className="space-y-6">
    {/* 🚀 DYNAMIC DIMENSION SELECTORS */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {variantDimensions.map(dimension => (
        <div key={dimension.name}>
          <h4 className="font-medium mb-3">
            {dimension.label} ({dimension.options.length} available)
          </h4>
          <div className="flex flex-wrap gap-2">
            {dimension.options.map(option => (
              <label key={option} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(selectedOptions[dimension.name] || []).includes(option)}
                  onChange={(e) => handleOptionChange(dimension.name, option, e.target.checked)}
                />
                <span className="text-sm px-2 py-1 bg-gray-100 rounded">{option}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Selected: {selectedOptions[dimension.name]?.length || 0} of {dimension.options.length}
          </div>
        </div>
      ))}
    </div>

    {/* 🚀 GENERATE BUTTON */}
    <div className="flex gap-4 items-center">
      <button
        type="button"
        onClick={generateVariants}
        disabled={totalCombinations === 1}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        Generate Variants
        {variantDimensions.length > 0 && (
          <span className="ml-2">
            ({variantDimensions.map(dim => selectedOptions[dim.name]?.length || 0).join(' × ')} = {totalCombinations})
          </span>
        )}
      </button>
    </div>

    {/* 🚀 DYNAMIC VARIANTS TABLE */}
    {variants.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead className="bg-gray-50">
            <tr>
              {/* Columns from variantConfig (dimensions + standard fields) */}
              {variantConfig.map((field: any) => (
                <th key={field.name} className="border border-gray-300 px-3 py-2 text-left">
                  {field.label}
                </th>
              ))}
              <th className="border border-gray-300 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {variants.map(variant => (
              <tr key={variant.id} className="hover:bg-gray-50">
                {variantConfig.map((field: any) => (
                  <td key={field.name} className="border border-gray-300 px-3 py-2">
                    {/* Type-based rendering */}
                    {field.type === 'images' ? (
                      <VariantMultiImageUpload
                        variantId={variant.id}
                        currentImages={variant[field.name] || []}
                        onImagesChange={(urls) => updateVariant(variant.id, field.name, urls)}
                        organizationId={organizationId}
                        productId={productId}
                        maxImages={5}
                      />
                    ) : field.type === 'number' ? (
                      <input
                        type="number"
                        value={variant[field.name] || 0}
                        onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
                        className="w-20 p-1 border rounded"
                      />
                    ) : field.type === 'text' ? (
                      <input
                        type="text"
                        value={variant[field.name] || ''}
                        onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
                        className="w-24 p-1 border rounded"
                      />
                    ) : (
                      <span>{variant[field.name] || '-'}</span>
                    )}
                  </td>
                ))}
                <td className="border border-gray-300 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newVariants = variants.filter(v => v.id !== variant.id);
                      setVariants(newVariants);
                      updateParent(newVariants, selectedOptions);
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
```

**Rendered UI (Electronics Example):**

```html
<!-- Dimension Selectors (Dynamically Generated) -->
<div class="grid grid-cols-3 gap-6">
  <!-- Dimension 1: Storage Capacity -->
  <div>
    <h4>Storage Capacity (5 available)</h4>
    <div class="flex flex-wrap gap-2">
      <label><input type="checkbox" /> <span>64gb</span></label>
      <label><input type="checkbox" /> <span>128gb</span></label>
      <label><input type="checkbox" /> <span>256gb</span></label>
      <label><input type="checkbox" /> <span>512gb</span></label>
      <label><input type="checkbox" /> <span>1tb</span></label>
    </div>
    <div class="text-xs">Selected: 0 of 5</div>
  </div>

  <!-- Dimension 2: Color -->
  <div>
    <h4>Color (2 available)</h4>
    <div class="flex flex-wrap gap-2">
      <label><input type="checkbox" /> <span>black</span></label>
      <label><input type="checkbox" /> <span>silver</span></label>
    </div>
    <div class="text-xs">Selected: 0 of 2</div>
  </div>

  <!-- Dimension 3: Connectivity Type -->
  <div>
    <h4>Connectivity Type (2 available)</h4>
    <div class="flex flex-wrap gap-2">
      <label><input type="checkbox" /> <span>wifi</span></label>
      <label><input type="checkbox" /> <span>wifi_cellular</span></label>
    </div>
    <div class="text-xs">Selected: 0 of 2</div>
  </div>
</div>

<!-- Generate Button (shows calculation) -->
<button class="bg-green-600 text-white px-4 py-2 rounded">
  Generate Variants (0 × 0 × 0 = 1)
</button>

<!-- After user selects: 2 storage × 2 colors × 2 connectivity -->
<button class="bg-green-600 text-white px-4 py-2 rounded">
  Generate Variants (2 × 2 × 2 = 8)
</button>

<!-- Variant Table (appears after clicking Generate) -->
<table class="w-full border-collapse">
  <thead>
    <tr>
      <th>Storage Capacity</th>
      <th>Color</th>
      <th>Connectivity Type</th>
      <th>Images</th>
      <th>Price</th>
      <th>Cost</th>
      <th>Compare Price</th>
      <th>Stock</th>
      <th>SKU</th>
      <th>Weight</th>
      <th>Barcode</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <!-- Variant 1: 128gb-black-wifi -->
    <tr>
      <td>128gb</td>
      <td>black</td>
      <td>wifi</td>
      <td>[+] 0/5</td>
      <td><input type="number" value="0" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="text" value="SKU-128GB-BLACK-WIFI" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="text" value="" /></td>
      <td><button>🗑️</button></td>
    </tr>

    <!-- Variant 2: 128gb-black-wifi_cellular -->
    <tr>
      <td>128gb</td>
      <td>black</td>
      <td>wifi_cellular</td>
      <td>[+] 0/5</td>
      <td><input type="number" value="0" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="text" value="SKU-128GB-BLACK-WIFI_CELLULAR" /></td>
      <td><input type="number" value="0" /></td>
      <td><input type="text" value="" /></td>
      <td><button>🗑️</button></td>
    </tr>

    <!-- ... 6 more rows for remaining combinations -->
  </tbody>
</table>
```

**Key Implementation Details:**

1. **State Reset on Category Change:** When user switches from "Electronics" to "Apparel", all selections and variants are cleared automatically.

2. **Preserved Data on Regeneration:** If user already uploaded images to "128gb-black-wifi" variant and clicks "Generate Variants" again (maybe after adding more options), the images are preserved because variant IDs match.

3. **Dynamic Table Columns:** Table columns come from `variantConfig`, which is either backend-defined or auto-generated from detected dimensions.

4. **Parent Update Timing:** Parent form is NOT updated when clicking "Generate Variants". It's updated when user edits individual variant fields (images, price, SKU, etc.).

5. **Variant ID Generation:**
   ```
   Combination: { storageCapacity: "128gb", color: "black", connectivityType: "wifi" }
   ID: "128gb-black-wifi"
   ```
   This ID enables matching during regeneration.

---

## Field Type Mapping

### How fieldType Determines Input Rendering

```typescript
// Line 518-577: Field type rendering logic
const fieldType = (field.fieldType || '').toLowerCase();

if (fieldType === 'textarea') {
  // TEXTAREA → <textarea>
  return <textarea name={fieldName} ... />;

} else if (fieldType === 'select') {
  // SELECT → <select> with <option>s
  return (
    <select name={fieldName} ...>
      <option value="">Select...</option>
      {field.options?.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

} else if (fieldType === 'checkbox') {
  // CHECKBOX → <input type="checkbox">
  return <input type="checkbox" name={fieldName} ... />;

} else if (fieldType === 'image' || fieldType === 'file' || fieldType === 'media') {
  // IMAGE/FILE/MEDIA → Custom ImageUploadField component
  return (
    <ImageUploadField
      fieldName={fieldName}
      value={formData[fieldName] || []}
      onChange={(value) => handleFieldChange(fieldName, value)}
      multiple={fieldType === 'media' || fieldType === 'file'}
      maxImages={field.validationRules?.maxItems || 5}
      organizationId={organizationId}
      productId={formData.id}
    />
  );

} else if (fieldType === 'number') {
  // NUMBER → <input type="number">
  return <input type="number" name={fieldName} ... />;

} else {
  // Default: TEXT → <input type="text">
  return <input type="text" name={fieldName} ... />;
}
```

### Complete Field Type Reference

| fieldType | Rendered As | Example Fields |
|-----------|-------------|----------------|
| `TEXT` | `<input type="text">` | name, sku, brand, model |
| `TEXTAREA` | `<textarea>` | description, notes |
| `SELECT` | `<select>` + `<option>`s | category, warranty, size |
| `MULTISELECT` | Multiple checkboxes | tags, connectivity options |
| `CHECKBOX` | `<input type="checkbox">` | hasVariants, isActive |
| `NUMBER` | `<input type="number">` | price, cost, stock, weight |
| `IMAGE` | `ImageUploadField` (single) | mainImage, thumbnail |
| `MEDIA` | `ImageUploadField` (multiple) | galleryImages |
| `FILE` | `ImageUploadField` (files) | documents, certifications |
| `VARIANT_CONFIGURATOR` | `VariantConfiguratorDynamic` | variantConfigurator |

---

## Conditional Visibility System

The system supports **two types** of conditional visibility: **Simple Operator-Based** (used in main form) and **Expression-Based** (used in VariantConfiguratorDynamic).

### Type 1: Simple Operator-Based (Main Form)

```typescript
// Inside useFieldVisibility hook
export function useFieldVisibility() {
  const getVisibleFields = (fields: any[], formData: any) => {
    return fields.filter((field: any) => {
      // If no conditional visibility, always visible
      if (!field.conditionalVisibility) return true;

      const { field: checkField, operator, value } = field.conditionalVisibility;
      const currentValue = formData[checkField];

      // Evaluate condition
      switch (operator) {
        case 'equals':
          return currentValue === value;
        case 'notEquals':
          return currentValue !== value;
        case 'contains':
          return Array.isArray(currentValue) && currentValue.includes(value);
        case 'greaterThan':
          return Number(currentValue) > Number(value);
        case 'lessThan':
          return Number(currentValue) < Number(value);
        default:
          return true;
      }
    });
  };

  return { getVisibleFields };
}
```

**Examples:**

**Example 1: Show field when category is electronics**
```json
{
  "fieldName": "warranty",
  "conditionalVisibility": {
    "field": "category",
    "operator": "equals",
    "value": "electronics"
  }
}
```

**Logic:**
- Check `formData.category`
- If `formData.category === "electronics"` → Show field
- Otherwise → Hide field

**Example 2: Show dimensions when hasVariants is true**
```json
{
  "fieldName": "color",
  "conditionalVisibility": {
    "field": "hasVariants",
    "operator": "equals",
    "value": true
  }
}
```

**Logic:**
- Check `formData.hasVariants`
- If `formData.hasVariants === true` → Show field
- Otherwise → Hide field

---

### Type 2: Expression-Based (VariantConfiguratorDynamic)

**More Powerful:** Supports JavaScript expressions with multiple conditions.

```typescript
// Inside VariantConfiguratorDynamic component - Line 42-68
const isFieldVisible = (field: any, currentFormData: any): boolean => {
  if (!field.conditionalVisibility) {
    return true;
  }

  const { showWhen } = field.conditionalVisibility;

  if (showWhen) {
    try {
      // Replace variables in expression with actual values from formData
      let expression = showWhen;
      Object.keys(currentFormData).forEach(key => {
        const value = currentFormData[key];
        const valueStr = typeof value === 'string' ? `'${value}'` : value;
        expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), valueStr);
      });

      // Evaluate the expression dynamically
      return new Function(`return ${expression}`)();
    } catch (error) {
      console.warn(`Failed to evaluate conditional visibility:`, error);
      return true; // Default to visible if evaluation fails
    }
  }

  return true;
};
```

**How It Works:**

```
Step 1: Backend provides expression
────────────────────────────────────
{
  "fieldName": "storageCapacity",
  "conditionalVisibility": {
    "showWhen": "hasVariants === true && category === 'electronics'"
  }
}

Step 2: Component gets current form data
────────────────────────────────────────
formData = {
  hasVariants: true,
  category: "electronics",
  price: 999.99
}

Step 3: Replace variables with values
────────────────────────────────────────
Original expression:
  "hasVariants === true && category === 'electronics'"

After variable replacement:
  "true === true && 'electronics' === 'electronics'"

Step 4: Evaluate expression
────────────────────────────────────────
new Function("return true === true && 'electronics' === 'electronics'")()
→ Returns: true

Result: Field is VISIBLE ✓
```

**Advanced Examples:**

**Example 1: Complex AND condition**
```json
{
  "fieldName": "premiumFeatures",
  "conditionalVisibility": {
    "showWhen": "category === 'electronics' && price > 500 && hasVariants === true"
  }
}
```

**Evaluation:**
```javascript
formData = { category: "electronics", price: 999.99, hasVariants: true }

Expression: "category === 'electronics' && price > 500 && hasVariants === true"
After replacement: "'electronics' === 'electronics' && 999.99 > 500 && true === true"
Result: true ✓ → Field visible
```

**Example 2: OR condition**
```json
{
  "fieldName": "specialShipping",
  "conditionalVisibility": {
    "showWhen": "category === 'electronics' || category === 'jewelry'"
  }
}
```

**Evaluation:**
```javascript
formData = { category: "electronics" }

Expression: "category === 'electronics' || category === 'jewelry'"
After replacement: "'electronics' === 'electronics' || 'electronics' === 'jewelry'"
Result: true ✓ → Field visible
```

**Example 3: Negation**
```json
{
  "fieldName": "bulkPricing",
  "conditionalVisibility": {
    "showWhen": "hasVariants === false"
  }
}
```

**Evaluation:**
```javascript
formData = { hasVariants: false }

Expression: "hasVariants === false"
After replacement: "false === false"
Result: true ✓ → Field visible
```

**Example 4: Multiple field checks**
```json
{
  "fieldName": "extendedWarranty",
  "conditionalVisibility": {
    "showWhen": "category === 'electronics' && price > 1000 && brand === 'Apple'"
  }
}
```

**Evaluation:**
```javascript
formData = { category: "electronics", price: 1299.99, brand: "Apple" }

Expression: "category === 'electronics' && price > 1000 && brand === 'Apple'"
After replacement: "'electronics' === 'electronics' && 1299.99 > 1000 && 'Apple' === 'Apple'"
Result: true ✓ → Field visible
```

---

### Comparison: Operator-Based vs Expression-Based

| Feature                   | Operator-Based                                        | Expression-Based                    |
|---------------------------|-------------------------------------------------------|-------------------------------------|
| Syntax                    | Object with operator                                  | JavaScript expression string        |
| Single Condition.         | ✅ `{field: "x", operator: "equals", value: "y"}`     | ✅ `"x === 'y'"`                     |
| Multiple Conditions (AND) | ❌ Not supported                                      | ✅ `"x === 'a' && y === 'b'"`        |
| Multiple Conditions (OR)  | ❌ Not supported                                      | ✅ `"x === 'a' || y === 'b'"`        |
| Negation                  | ⚠️ Via `notEquals` operator                           | ✅ `"x !== 'a'"` or `"!(x === 'a')"` |
| Numeric Comparison        | ✅ `greaterThan`, `lessThan`                          | ✅ `>`, `<`, `>=`, `<=`              |
| Complex Logic             | ❌ Limited                                            | ✅ Full JavaScript expressions       |
| Safety                    | ✅ Safe (no code execution)                           | ⚠️ Uses `new Function()`             |
| Used In                   | Main form fields                                      | Variant dimensions only             |

### Why Two Systems?

**Main Form (Operator-Based):**
- Simpler and safer
- Easier to serialize/validate
- Sufficient for most use cases

**Variant Configurator (Expression-Based):**
- Needs complex multi-condition logic
- Variant dimensions have interdependencies
- More flexibility for category-specific rules
- Example: "Show storage capacity dimension IF hasVariants=true AND category=electronics AND NOT refurbished"

### Security Consideration

The expression-based system uses `new Function()` which can execute arbitrary code. However:
- ✅ Only evaluates backend-provided expressions (not user input)
- ✅ Wrapped in try-catch with fallback to visible
- ✅ Only accesses formData variables (sandboxed)
- ⚠️ Backend should validate expressions before storing in schema

---

## Section Organization

### Section Metadata

```typescript
// From productFormUtils.ts - getSectionMetadata()
const SECTION_METADATA = {
  basic: {
    label: "Basic Information",
    icon: Package,
    iconColor: "text-blue-600",
    order: 1,
    description: "Essential product details"
  },
  pricing: {
    label: "Pricing & Cost",
    icon: DollarSign,
    iconColor: "text-green-600",
    order: 2,
    description: "Price, cost, and profit margins"
  },
  specifications: {
    label: "Specifications",
    icon: Settings,
    iconColor: "text-purple-600",
    order: 3,
    description: "Technical specifications and features"
  },
  media: {
    label: "Images & Media",
    icon: Image,
    iconColor: "text-pink-600",
    order: 4,
    description: "Product images and videos"
  },
  inventory: {
    label: "Inventory & Stock",
    icon: Package,
    iconColor: "text-orange-600",
    order: 5,
    description: "Stock levels and tracking"
  },
  seo: {
    label: "SEO & Marketing",
    icon: Tag,
    iconColor: "text-indigo-600",
    order: 6,
    description: "Search engine optimization"
  },
  shipping: {
    label: "Shipping",
    icon: Truck,
    iconColor: "text-teal-600",
    order: 7,
    description: "Shipping dimensions and options"
  },
  variants: {
    label: "Product Variants",
    icon: Grid,
    iconColor: "text-purple-600",
    order: 8,
    description: "Product variations and options"
  }
};
```

### How Fields Are Grouped

```typescript
// From productFormUtils.ts - groupFieldsBySection()
export function groupFieldsBySection(fields: any[], excludeFields: string[] = []) {
  const grouped: Record<string, any[]> = {};

  for (const field of fields) {
    const fieldName = field.name || field.fieldName;

    // Skip excluded fields
    if (excludeFields.includes(fieldName)) continue;

    // Get section key
    const sectionKey = normalizeSectionKey(field.section || 'basic');

    // Add to section
    if (!grouped[sectionKey]) {
      grouped[sectionKey] = [];
    }
    grouped[sectionKey].push(field);
  }

  return grouped;
}
```

**Example:**
```javascript
Input fields:
[
  { fieldName: "name", section: "basic", order: 1 },
  { fieldName: "sku", section: "basic", order: 2 },
  { fieldName: "price", section: "pricing", order: 10 },
  { fieldName: "cost", section: "pricing", order: 11 },
  { fieldName: "brand", section: "specifications", order: 20 }
]

Output grouped:
{
  "basic": [
    { fieldName: "name", section: "basic", order: 1 },
    { fieldName: "sku", section: "basic", order: 2 }
  ],
  "pricing": [
    { fieldName: "price", section: "pricing", order: 10 },
    { fieldName: "cost", section: "pricing", order: 11 }
  ],
  "specifications": [
    { fieldName: "brand", section: "specifications", order: 20 }
  ]
}
```

---

## State Management

### Form Data Structure

```typescript
// Type definition
interface DynamicFormData {
  // Essential fields
  name?: string;
  sku?: string;
  category?: string;
  price?: number;

  // Basic fields
  description?: string;
  cost?: number;
  compareAtPrice?: number;

  // Category-specific (electronics)
  brand?: string;
  model?: string;
  warranty?: string;
  batteryLife?: string;

  // Media
  mainImage?: string;
  galleryImages?: string[];

  // Variants
  hasVariants?: boolean;
  variantConfigurator?: string;  // JSON string

  // Dynamic fields can be anything
  [key: string]: any;
}
```

### State Flow Diagram

```
┌─────────────────────────────────────────────────┐
│ Component State (useProductFormState hook)      │
│                                                 │
│ formData: {                                     │
│   name: "iPhone 15 Pro",                        │
│   sku: "PHONE-15PRO",                           │
│   category: "electronics",                      │
│   price: 999.99,                                │
│   brand: "Apple",                               │
│   model: "A2848",                               │
│   warranty: "1_year",                           │
│   hasVariants: true,                            │
│   variantConfigurator: "{...}"  // JSON string  │
│ }                                               │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ User Interaction                                │
│ - User types in "name" input                    │
│ - Triggers: onChange={(e) =>                    │
│     handleFieldChange("name", e.target.value)}  │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ handleFieldChange("name", "iPhone 15 Pro")      │
│                                                 │
│ setFormData(prev => ({                          │
│   ...prev,                                      │
│   name: "iPhone 15 Pro"                         │
│ }))                                             │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ State Updated → Component Re-renders            │
│                                                 │
│ formData.name now shows "iPhone 15 Pro" in UI   │
└─────────────────────────────────────────────────┘
```

### Variant State Management

```typescript
// Variant configurator has its own state
// Line 734-741: Passing props to VariantConfiguratorDynamic
<VariantConfiguratorDynamic
  value={formData.variantConfigurator}  // JSON string
  onChange={handleVariantConfiguratorChange}
  schema={schema}
  formData={formData}
  organizationId={organization.organizationId}
  productId={formData.id || `temp_${Date.now()}`}
/>

// Inside VariantConfiguratorDynamic component:
// - Parses JSON string to get variant data
// - Manages variants as local state
// - When variants change, calls onChange(JSON.stringify(variants))
// - Parent receives JSON string and stores in formData.variantConfigurator

// Data flow:
// 1. Parent: formData.variantConfigurator = "{variants:[...]}"
// 2. Child: variants = JSON.parse(props.value)
// 3. Child: User uploads image to variant
// 4. Child: updateVariant(id, "variantImages", [...])
// 5. Child: props.onChange(JSON.stringify(newVariants))
// 6. Parent: formData.variantConfigurator = "{variants:[...updated...]}"
```

---

## Real-World Example Walkthrough

### Complete Flow: Creating an Electronics Product

```
TIME: 00:00 - Component Mounts
─────────────────────────────────────────────────
User:       Navigates to /products/create
System:     Loads authentication context
            userId: "user-123"
            organizationId: "org-abc"
            userRole: "BUSINESS_USER"
            targetChannels: ["shopify"]

TIME: 00:01 - Load Essential Schema
─────────────────────────────────────────────────
System:     POST /api/v1/ecommerce/form-schema/generate
            Body: { ...context, productCategory: "" }
Backend:    Returns essential fields only
System:     Sets formStage = 'essential'
UI:         Renders 4 fields:
            - Name (text)
            - SKU (text)
            - Category (select)
            - Price (number)

TIME: 00:10 - User Fills Essential Fields
─────────────────────────────────────────────────
User:       Types "iPhone 15 Pro" in Name field
System:     formData.name = "iPhone 15 Pro"

User:       Types "PHONE-15PRO" in SKU field
System:     formData.sku = "PHONE-15PRO"

User:       Types "999.99" in Price field
System:     formData.price = 999.99

TIME: 00:20 - User Selects Category
─────────────────────────────────────────────────
User:       Selects "Electronics" from Category dropdown
System:     formData.category = "electronics"
Trigger:    handleCategoryChange("electronics")
            loadCategoryFieldsSmooth("electronics")

TIME: 00:21 - Load Electronics Schema
─────────────────────────────────────────────────
System:     Shows loading indicator
API:        POST /api/v1/ecommerce/form-schema/generate
            Body: { ...context, productCategory: "electronics" }
Backend:    Returns 30+ fields including:
            - Essential (name, sku, price)
            - Basic (description, cost)
            - Electronics-specific (brand, model, warranty, batteryLife)
            - Media (mainImage, galleryImages)
            - Variants (hasVariants, variantConfigurator)
            - Dimensions (storageCapacity, color, connectivityType)
System:     Merges with existing formData
            Sets formStage = 'category-specific'
            Hides loading indicator

TIME: 00:22 - Render Complete Form
─────────────────────────────────────────────────
System:     Filters fields by conditional visibility
            brand: conditionalVisibility.field = "category"
                   formData.category = "electronics" ✓
                   Field is visible!

            Groups fields by section:
            - basic: [name, sku, category, description]
            - pricing: [price, cost, compareAtPrice]
            - specifications: [brand, model, warranty, batteryLife]
            - media: [mainImage, galleryImages]
            - variants: [hasVariants, variantConfigurator]

            Sorts sections by order

UI:         Renders 6 collapsible sections
            All sections expanded by default

TIME: 00:30 - User Fills Electronics Fields
─────────────────────────────────────────────────
User:       Types "Apple" in Brand field
System:     formData.brand = "Apple"

User:       Types "A2848" in Model field
System:     formData.model = "A2848"

User:       Selects "1 Year" from Warranty dropdown
System:     formData.warranty = "1_year"

User:       Types "Up to 29 hours video playback" in Battery Life
System:     formData.batteryLife = "Up to 29 hours video playback"

TIME: 01:00 - User Uploads Main Image
─────────────────────────────────────────────────
User:       Clicks "Upload" in Main Image field
            Selects "iphone-15-pro-main.jpg"
Component:  ImageUploadField
            Calls MediaUploadService.uploadImage()
API:        POST /api/v1/media/upload
            Body: FormData with file
Backend:    Uploads to GCP Storage
            Returns { publicUrl: "https://storage.googleapis.com/..." }
System:     formData.mainImage = "https://storage.googleapis.com/..."
UI:         Shows image thumbnail

TIME: 02:00 - User Enables Variants
─────────────────────────────────────────────────
User:       Checks "This product has variants" checkbox
System:     formData.hasVariants = true
            Component re-renders

            Re-evaluates conditional visibility:
            storageCapacity: conditionalVisibility.field = "hasVariants"
                            formData.hasVariants = true ✓
                            Field is now visible!
            color: conditionalVisibility.field = "hasVariants"
                   formData.hasVariants = true ✓
                   Field is now visible!
            connectivityType: conditionalVisibility.field = "hasVariants"
                              formData.hasVariants = true ✓
                              Field is now visible!

UI:         VariantConfiguratorDynamic component renders
            Shows dimension selectors:
            - Storage Capacity (64GB, 128GB, 256GB, 512GB, 1TB)
            - Color (Black, White, Silver, Gold, Blue)
            - Connectivity Type (WiFi Only, WiFi+Cellular)

TIME: 02:30 - User Selects Dimension Values
─────────────────────────────────────────────────
User:       Storage Capacity:
            ✓ 128GB
            ✓ 256GB
            ✓ 512GB

User:       Color:
            ✓ Black
            ✓ Silver

User:       Connectivity Type:
            ✓ WiFi Only
            ✓ WiFi+Cellular

System:     selectedDimensions = {
              storageCapacity: ["128gb", "256gb", "512gb"],
              color: ["black", "silver"],
              connectivityType: ["wifi", "wifi_cellular"]
            }

TIME: 02:45 - User Clicks "Generate Variants"
─────────────────────────────────────────────────
System:     Cartesian product calculation:
            3 storage × 2 colors × 2 connectivity = 12 variants

            Generated variants:
            1.  128gb-black-wifi
            2.  128gb-black-wifi_cellular
            3.  128gb-silver-wifi
            4.  128gb-silver-wifi_cellular
            5.  256gb-black-wifi
            6.  256gb-black-wifi_cellular
            7.  256gb-silver-wifi
            8.  256gb-silver-wifi_cellular
            9.  512gb-black-wifi
            10. 512gb-black-wifi_cellular
            11. 512gb-silver-wifi
            12. 512gb-silver-wifi_cellular

UI:         Renders variant table with 12 rows
            Columns: Storage | Color | Connectivity | Images | Price | SKU | Stock

TIME: 03:00 - User Uploads Variant Images
─────────────────────────────────────────────────
User:       Row 1 (128gb-black-wifi):
            Clicks [+] button
            Selects 3 images:
            - iphone-128-black-front.jpg
            - iphone-128-black-back.jpg
            - iphone-128-black-detail.jpg

Component:  VariantMultiImageUpload
            Uploads sequentially:
            File 1: 0% → 33% → Done ✓
            File 2: 33% → 66% → Done ✓
            File 3: 66% → 100% → Done ✓

System:     variants[0].variantImages = [
              "https://storage.googleapis.com/.../front.jpg",
              "https://storage.googleapis.com/.../back.jpg",
              "https://storage.googleapis.com/.../detail.jpg"
            ]

UI:         Shows [📷][📷][📷][+] 3/5

User:       Repeats for 5 more variants...

TIME: 04:00 - User Sets Variant Prices
─────────────────────────────────────────────────
User:       128GB variants: $999.99
            256GB variants: $1099.99
            512GB variants: $1299.99
            WiFi+Cellular: +$100

System:     Updates each variant.price accordingly

TIME: 05:00 - User Submits Form
─────────────────────────────────────────────────
User:       Clicks "Create Product" button
System:     Triggers handleSubmit()

            Step 1: Validate form
            - Required fields filled? ✓
            - Variant data complete? ✓

            Step 2: Generate MasterProduct
            product = generateMasterProduct({
              formData,
              schema,
              organizationId,
              userId
            });

            Result:
            {
              "name": "iPhone 15 Pro",
              "sku": "PHONE-15PRO",
              "category": "electronics",
              "price": 999.99,
              "brand": "Apple",
              "model": "A2848",
              "warranty": "1_year",
              "batteryLife": "Up to 29 hours video playback",
              "mainImage": "https://storage.googleapis.com/.../main.jpg",
              "hasVariants": true,
              "variants": [
                {
                  "id": "128gb-black-wifi",
                  "storageCapacity": "128GB",
                  "color": "Black",
                  "connectivityType": "WiFi Only",
                  "variantImages": [
                    "https://storage.googleapis.com/.../front.jpg",
                    "https://storage.googleapis.com/.../back.jpg",
                    "https://storage.googleapis.com/.../detail.jpg"
                  ],
                  "price": 999.99,
                  "sku": "PHONE-15PRO-128-BLK-W",
                  "stock": 100
                },
                // ... 11 more variants
              ]
            }

            Step 3: Submit to backend
API:        POST /api/v1/ecommerce/products
            Body: product object
Backend:    Creates product in database
            Returns created product with ID

System:     Calls onProductCreated(product, ["shopify"])

UI:         Shows success message
            Redirects to product list
```

---

## Summary

### Key Takeaways

1. **No Hardcoding:** Everything is driven by schema from backend
2. **Two-Stage Loading:** Essential fields first, then category-specific
3. **Conditional Visibility:** Fields show/hide based on other field values
4. **Dynamic Sections:** Fields grouped by section property
5. **Field Type Mapping:** fieldType determines input rendering
6. **Variant System:** Separate component that reads schema dimensions
7. **State Management:** Form data in parent, variants in child
8. **Image Handling:** Custom components integrated with GCP storage

### Why This Architecture?

**Benefits:**
- ✅ No frontend deploys for new fields - just update backend schema
- ✅ Category-specific fields without code changes
- ✅ Role-based field visibility (admin sees more than user)
- ✅ Channel-specific fields (Shopify vs Amazon requirements)
- ✅ Easy A/B testing of form layouts
- ✅ Multi-tenant: different schemas per organization
- ✅ Validation rules defined once in schema

**Trade-offs:**
- ⚠️ More complex initial setup
- ⚠️ Backend schema management is critical
- ⚠️ Harder to debug (no static code to read)
- ⚠️ Need good error handling for schema issues

---

## IMPORTANT: Corrected Implementation Details

This section clarifies how the actual implementation differs from common assumptions:

### ❌ MISCONCEPTION → ✅ ACTUAL IMPLEMENTATION

**1. Dimension Discovery**
- ❌ **WRONG:** Dimensions come from fields with `section === "variant_dimensions"`
- ✅ **CORRECT:** Dimensions are auto-detected by:
  - `fieldType === 'SELECT'` with options
  - Field name patterns (color, size, material, capacity, connectivity, type, etc.)
  - OR explicit marker: `validationRules.isVariantDimension = true`
  - Must pass conditional visibility evaluation

**2. Conditional Visibility Format**
- ❌ **WRONG:** All conditional visibility uses `{field, operator, value}` format
- ✅ **CORRECT:** Two formats exist:
  - **Main form:** `{field: "category", operator: "equals", value: "electronics"}`
  - **Variant configurator:** `{showWhen: "hasVariants === true && category === 'electronics'"}` (JavaScript expressions)

**3. Table Column Configuration**
- ❌ **WRONG:** Table columns are hardcoded
- ✅ **CORRECT:** Two sources:
  - **Backend-defined:** `variantConfigurator.validationRules.variantFields` in schema
  - **Auto-generated:** If not provided, builds from detected dimensions + standard fields (price, SKU, stock, etc.)

**4. Variant Generation Timing**
- ❌ **WRONG:** Parent form updates immediately when "Generate Variants" is clicked
- ✅ **CORRECT:** Variants stored in local state only. Parent updates when:
  - User edits individual variant fields (images, price, SKU)
  - User deletes a variant
  - Not when clicking "Generate Variants" button

**5. Category Change Behavior**
- ❌ **WRONG:** Selections persist when category changes
- ✅ **CORRECT:** All selections and variants are **cleared** when category changes (line 221-248)
  - Tracks `lastCategory` to detect changes
  - Resets `selectedOptions` to empty for all dimensions
  - Clears `variants` array
  - Prevents showing wrong dimensions for new category

**6. Dimension Field Requirements**
- ❌ **WRONG:** Any SELECT field becomes a dimension
- ✅ **CORRECT:** Must meet ALL criteria:
  - Has `fieldType === 'SELECT'` ✓
  - Has non-empty `options` array ✓
  - Field name matches pattern OR explicitly marked ✓
  - Passes conditional visibility check ✓
  - Example: "warranty" SELECT is NOT a dimension (no pattern match)

**7. Variant ID Generation**
- ❌ **WRONG:** Variant IDs are random or database-generated
- ✅ **CORRECT:** IDs generated from dimension values:
  ```
  Dimension values: { storageCapacity: "128gb", color: "black", connectivityType: "wifi" }
  ID: "128gb-black-wifi" (lowercase, hyphen-separated)
  ```
  - Enables matching during regeneration
  - Preserves images/prices when variants regenerated

**8. Image Field Name**
- ❌ **WRONG:** Field name is `variantImage` (singular)
- ✅ **CORRECT:** Field name is `variantImages` (plural, array)
  - Type: `string[]` (array of URLs)
  - Supports up to 5 images per variant
  - Component: `VariantMultiImageUpload`

### Key Files and Line Numbers

**VariantConfiguratorDynamic.tsx:**
- Line 71-180: Dimension discovery logic
- Line 42-68: Expression-based conditional visibility
- Line 221-248: Category change detection & reset
- Line 304-401: Cartesian product generation
- Line 418-575: UI rendering

**DynamicProductCreationFormRefactored.tsx:**
- Line 605-748: Variant section rendering
- Line 734-741: Props passed to VariantConfiguratorDynamic

**Real Data Flow:**
```
User enables hasVariants
  ↓
Schema fields re-evaluated with formData.hasVariants = true
  ↓
Dimension fields with conditionalVisibility.showWhen: "hasVariants === true" become visible
  ↓
VariantConfiguratorDynamic detects these SELECT fields as dimensions
  ↓
User selects dimension values (checkboxes)
  ↓
User clicks "Generate Variants" → Cartesian product calculated
  ↓
Variants stored in LOCAL state (not parent yet)
  ↓
User uploads images to variant → updateVariant() → NOW parent gets updated
  ↓
Form submission: parent has complete variant data
```

---

**Document Version:** 2.0 (Updated with actual implementation)
**Last Updated:** 2026-01-20
**Maintained By:** Frontend Team
**Reviewed Against:** VariantConfiguratorDynamic.tsx (latest)
