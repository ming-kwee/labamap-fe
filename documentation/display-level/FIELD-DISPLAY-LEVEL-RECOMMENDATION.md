# Field Display Level Property Recommendation

**Date**: 2025-11-20
**Issue**: `group` property conflicts with backend usage ('attribute' | 'variant')
**Need**: Alternative property name for field importance/display categorization

## Recommended Property Names

### Option 1: `displayLevel` ✅ RECOMMENDED

**Why Best**:
- ✅ Clear that it's for UI display purposes
- ✅ Won't conflict with backend's `group`
- ✅ Semantic: "level" implies hierarchy
- ✅ Common in UI frameworks

```typescript
displayLevel?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific'
```

### Option 2: `importance`

**Pros**:
- Clear semantic meaning
- Business-friendly term

**Cons**:
- Might be confused with priority/order

```typescript
importance?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific'
```

### Option 3: `fieldTier`

**Pros**:
- Implies hierarchy
- Tier is commonly used in product categorization

```typescript
fieldTier?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific'
```

### Option 4: `uiLevel`

**Pros**:
- Very explicit that it's for UI
- Won't conflict with anything

**Cons**:
- More technical, less business-friendly

```typescript
uiLevel?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific'
```

---

## Recommended: `displayLevel`

**Final Choice**: `displayLevel`

**Reasons**:
1. ✅ Clear UI purpose
2. ✅ No backend conflicts
3. ✅ Business-friendly
4. ✅ Semantic hierarchy
5. ✅ Common pattern

---

## Display Levels Explained

### Level: `'essential'`

**Meaning**: Critical fields that MUST show on initial form load

**Characteristics**:
- Always visible from the start
- Required for minimum viable product creation
- Cannot create product without these
- Show before category selection

**Examples**:
- `name` - Product name (required)
- `price` - Product price (required)
- `sku` - Stock keeping unit (required)
- `category` - Product category (required for schema generation)

**Use Case**:
```
User opens product creation form
→ Shows ONLY essential fields (4-6 fields)
→ Clean, simple initial experience
→ User can start immediately
```

**Backend Schema**:
```json
{
  "fieldName": "name",
  "displayLevel": "essential",
  "order": 1,
  "required": true,
  "group": "attribute"  // ← Backend's group stays as 'attribute'
}
```

---

### Level: `'basic'`

**Meaning**: Common fields that show after category is selected

**Characteristics**:
- Show after user selects category
- Common to most products
- Not strictly required but highly recommended
- Part of standard product information

**Examples**:
- `description` - Product description
- `brand` - Product brand
- `inventory` - Stock quantity
- `status` - Draft/Active/Archived
- `images` - Product images
- `weight` - Shipping weight

**Use Case**:
```
User selects category: "Electronics"
→ Essential fields still visible
→ Basic fields NOW appear
→ Form expands to show 10-15 fields
→ Still manageable, not overwhelming
```

**Backend Schema**:
```json
{
  "fieldName": "description",
  "displayLevel": "basic",
  "order": 6,
  "required": false,
  "group": "attribute"
}
```

---

### Level: `'advanced'`

**Meaning**: Specialized fields for power users or specific use cases

**Characteristics**:
- Show in collapsed "Advanced Options" section
- Not needed for most products
- Used for compliance, taxes, customs
- Optional but important for certain scenarios

**Examples**:
- `customs_code` - Harmonized tariff code
- `country_of_origin` - Manufacturing country
- `tax_code` - Tax classification
- `hazmat_info` - Hazardous materials info
- `regulatory_certifications` - CE, FCC, etc.

**Use Case**:
```
User creates standard product
→ Essential + Basic fields visible
→ "Advanced Options" collapsed
→ User clicks "Show Advanced" if needed
→ Advanced fields expand
```

**Backend Schema**:
```json
{
  "fieldName": "customs_code",
  "displayLevel": "advanced",
  "order": 50,
  "required": false,
  "group": "attribute"
}
```

---

### Level: `'optional'`

**Meaning**: Nice-to-have fields that enhance the product but aren't critical

**Characteristics**:
- Show based on user preference or settings
- Can be toggled on/off
- Marketing and SEO related
- Improve discoverability but not required

**Examples**:
- `seo_title` - Custom SEO title
- `seo_description` - Meta description
- `meta_keywords` - SEO keywords
- `social_share_image` - Open Graph image
- `promotional_text` - Marketing copy

**Use Case**:
```
User creating product
→ Basic product info filled
→ User wants better SEO
→ Toggles "Show SEO Fields"
→ Optional SEO fields appear
```

**Backend Schema**:
```json
{
  "fieldName": "seo_title",
  "displayLevel": "optional",
  "order": 60,
  "required": false,
  "group": "attribute"
}
```

---

### Level: `'category-specific'`

**Meaning**: Fields that only apply to specific product categories

**Characteristics**:
- Only show when relevant category is selected
- Highly specific to category
- May be required for that category
- Automatically hidden for other categories

**Examples**:

**Electronics**:
- `warranty` - Warranty period
- `power_requirements` - Voltage, wattage
- `battery_type` - Battery specifications
- `screen_size` - Display size

**Clothing**:
- `size` - S, M, L, XL
- `color` - Product color
- `material` - Fabric composition
- `care_instructions` - Washing instructions

**Food**:
- `expiration_date` - Best before date
- `ingredients` - Ingredient list
- `nutritional_info` - Calories, vitamins
- `allergens` - Allergy warnings

**Use Case**:
```
User selects category: "Electronics"
→ Shows: warranty, power_requirements, battery_type
→ Hides: size, color, material (clothing fields)

User changes to category: "Clothing"
→ Hides: warranty, power_requirements
→ Shows: size, color, material
```

**Backend Schema**:
```json
{
  "fieldName": "warranty",
  "displayLevel": "category-specific",
  "order": 11,
  "required": false,
  "category": "electronics",  // ← Only for electronics
  "group": "attribute"
}
```

---

## Visual Hierarchy

```
┌─────────────────────────────────────────┐
│ INITIAL LOAD (No Category)              │
├─────────────────────────────────────────┤
│ ✅ Essential Fields (4-6 fields)        │
│   • name                                 │
│   • price                                │
│   • sku                                  │
│   • category                             │
└─────────────────────────────────────────┘

           ↓ User selects category

┌─────────────────────────────────────────┐
│ AFTER CATEGORY SELECTED                  │
├─────────────────────────────────────────┤
│ ✅ Essential Fields (still visible)     │
│   • name                                 │
│   • price                                │
│   • sku                                  │
│   • category                             │
│                                          │
│ ✅ Basic Fields (now visible)           │
│   • description                          │
│   • brand                                │
│   • inventory                            │
│   • status                               │
│   • images                               │
│                                          │
│ ✅ Category-Specific Fields              │
│   • warranty (for electronics)           │
│   • power_requirements (for electronics) │
│                                          │
│ [▼ Show Advanced Options]                │
│                                          │
│ [▼ Show SEO Fields]                      │
└─────────────────────────────────────────┘

           ↓ User clicks "Show Advanced"

┌─────────────────────────────────────────┐
│ ADVANCED SECTION EXPANDED                │
├─────────────────────────────────────────┤
│ ✅ Advanced Fields                       │
│   • customs_code                         │
│   • country_of_origin                    │
│   • tax_code                             │
│   • hazmat_info                          │
└─────────────────────────────────────────┘
```

---

## Updated Type Definition

**File**: `src/types/dynamicForm.ts`

```typescript
// Field Display Levels
export type FieldDisplayLevel =
  | 'essential'           // Always show on initial load
  | 'basic'               // Show after category selected
  | 'advanced'            // Show in advanced section
  | 'optional'            // Show on demand
  | 'category-specific';  // Show only for specific category

// Form Field Definition
export interface FormField {
  fieldName: string;
  fieldType: FormFieldType;
  label: string;

  // ✅ NEW: Display level for UI purposes
  displayLevel?: FieldDisplayLevel;

  // ✅ Display order within level
  order?: number;

  // ✅ Backend's original group (attribute | variant)
  group?: 'attribute' | 'variant';  // Backend purpose

  // ... other properties
}
```

---

## Updated Implementation Code

**File**: `src/components/products/DynamicProductCreationFormClean.tsx`

```typescript
// ✅ UPDATED: Use displayLevel instead of group
const filteredFields = visibleFields.filter((field: any) => {
  const fieldName = field.name || field.fieldName;

  // ✅ Use displayLevel metadata instead of group
  const isEssential = field.displayLevel === 'essential';
  const isBasic = field.displayLevel === 'basic';
  const isAdvanced = field.displayLevel === 'advanced';
  const isOptional = field.displayLevel === 'optional';
  const isCategorySpecific = field.displayLevel === 'category-specific';

  const isRequired = field.required || field.validationRules?.required;
  const isConditionalField = field.conditionalVisibility !== null;

  // Check business context metadata
  const markedAsEssential = field.businessContext?.isEssential === true;
  const showOnInitialLoad = field.businessContext?.showOnInitialLoad === true;

  // Use priority/order for initial load
  const isHighPriority = (field.order !== undefined && field.order <= 10);

  // For initial load (no category selected), show essential + basic fields
  if (formStage === 'essential') {
    return isEssential || isBasic || markedAsEssential || showOnInitialLoad || (isRequired && isHighPriority);
  }

  // After category selected, show all applicable fields
  return isEssential || isBasic || isCategorySpecific || isRequired || isConditionalField || isHighPriority;
});

// Sort fields by order metadata from schema
const sortedFields = filteredFields.sort((a: any, b: any) => {
  const orderA = a.order ?? 999;
  const orderB = b.order ?? 999;
  return orderA - orderB;
});
```

---

## Backend Schema Examples

### Complete Field Definition

```json
{
  "fieldName": "name",
  "dataType": "string",
  "required": true,

  "group": "attribute",              // ← Backend's group (attribute | variant)
  "displayLevel": "essential",        // ← UI display level
  "order": 1,                         // ← Display order

  "validationRules": {
    "required": true,
    "minLength": 3,
    "maxLength": 200
  },

  "businessContext": {
    "isEssential": true,
    "showOnInitialLoad": true,
    "categorySpecific": false,
    "channelSpecific": false
  },

  "supportedChannels": ["*"],
  "category": "all"
}
```

### Essential Field (name)

```json
{
  "fieldName": "name",
  "group": "attribute",
  "displayLevel": "essential",
  "order": 1,
  "required": true
}
```

### Basic Field (description)

```json
{
  "fieldName": "description",
  "group": "attribute",
  "displayLevel": "basic",
  "order": 6,
  "required": false
}
```

### Advanced Field (customs_code)

```json
{
  "fieldName": "customs_code",
  "group": "attribute",
  "displayLevel": "advanced",
  "order": 50,
  "required": false
}
```

### Optional Field (seo_title)

```json
{
  "fieldName": "seo_title",
  "group": "attribute",
  "displayLevel": "optional",
  "order": 60,
  "required": false
}
```

### Category-Specific Field (warranty)

```json
{
  "fieldName": "warranty",
  "group": "attribute",
  "displayLevel": "category-specific",
  "order": 11,
  "required": false,
  "category": "electronics"
}
```

### Variant Field (size)

```json
{
  "fieldName": "size",
  "group": "variant",                  // ← Backend's group = variant
  "displayLevel": "category-specific", // ← UI display level
  "order": 11,
  "required": false,
  "category": "clothing",
  "isVariantDimension": true
}
```

---

## Migration Path

### Step 1: Backend Adds `displayLevel` Property

```javascript
// MongoDB migration script
db.ecommerce_master_attributes.updateMany(
  { fieldName: { $in: ['name', 'price', 'sku', 'category'] } },
  { $set: { displayLevel: 'essential' }}
);

db.ecommerce_master_attributes.updateMany(
  { fieldName: { $in: ['description', 'brand', 'inventory', 'status'] } },
  { $set: { displayLevel: 'basic' }}
);

db.ecommerce_master_attributes.updateMany(
  { fieldName: { $in: ['customs_code', 'country_of_origin', 'tax_code'] } },
  { $set: { displayLevel: 'advanced' }}
);
```

### Step 2: Frontend Updated to Use `displayLevel`

```typescript
// Updated code (already shown above)
const isEssential = field.displayLevel === 'essential';
const isBasic = field.displayLevel === 'basic';
```

### Step 3: Backward Compatibility (During Migration)

```typescript
// Support both old 'group' and new 'displayLevel'
const isEssential =
  field.displayLevel === 'essential' ||
  (field.uiGroup === 'essential') ||  // Temporary fallback
  field.businessContext?.isEssential === true;
```

---

## Comparison Table

| Property Name | Pros | Cons | Score |
|---------------|------|------|-------|
| `displayLevel` ✅ | Clear UI purpose, semantic hierarchy | None | ⭐⭐⭐⭐⭐ |
| `importance` | Business-friendly | Might confuse with priority | ⭐⭐⭐⭐ |
| `fieldTier` | Implies hierarchy | Less common term | ⭐⭐⭐⭐ |
| `uiLevel` | Very explicit | Too technical | ⭐⭐⭐ |
| `fieldLevel` | Clear | Generic | ⭐⭐⭐ |
| `category` | Common | Conflicts with product category | ❌ |
| `type` | Short | Conflicts with fieldType | ❌ |
| `priority` | Clear | Conflicts with order number | ❌ |

**Winner**: `displayLevel` ✅

---

## Summary

### Recommended Property

```typescript
displayLevel?: 'essential' | 'basic' | 'advanced' | 'optional' | 'category-specific'
```

### Level Meanings

1. **essential** - Always show on initial load (4-6 critical fields)
2. **basic** - Show after category selected (10-15 common fields)
3. **advanced** - Show in advanced section (compliance, taxes)
4. **optional** - Show on demand (SEO, marketing)
5. **category-specific** - Show only for specific category (warranty, size, etc.)

### Backend Schema

```json
{
  "fieldName": "name",
  "group": "attribute",           // ← Backend's group (unchanged)
  "displayLevel": "essential",    // ← NEW: UI display level
  "order": 1,                     // ← Display order
  "required": true
}
```

### No Conflicts

- ✅ `group` stays as 'attribute' | 'variant' (backend purpose)
- ✅ `displayLevel` used for UI categorization (frontend purpose)
- ✅ Clear separation of concerns

---

**Date**: 2025-11-20
**Recommendation**: Use `displayLevel` property
**Status**: Ready for implementation
**Next**: Update frontend code to use `displayLevel` instead of `group`
