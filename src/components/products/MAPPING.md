# Master Data to Channel Payload Transformation System

## Overview

The transformation from master data to channel payload is a sophisticated multi-layer system that combines template-based mappings with field inclusion mechanisms and channel-specific extensions. This document details how the system handles the transformation process and addresses the key questions about field inclusion and channel-specific fields.

## Core Transformation Architecture

### 1. Template-Based Foundation

**Yes, the transformation is primarily template-based**, but it's much more sophisticated than simple field mapping:

```typescript
// From ComplexMapping.ts:575-593
export interface TemplateConfig {
  template?: string;          // Simple template string
  variables?: TemplateVariable[];
  helpers?: TemplateHelper[];
  outputFormat: 'plain' | 'html' | 'markdown' | 'json';
  
  // Block-based template system (alternative to simple template)
  blocks?: TemplateBlock[];
}
```

The system supports multiple transformation types:
- **Simple 1:1 mappings** - Direct field mappings
- **Many-to-One concatenation** - Multiple master fields → single channel field
- **One-to-Many decomposition** - Single master field → multiple channel fields  
- **Conditional mappings** - Rule-based transformations
- **Computed fields** - Formula-based calculations
- **Structural transformations** - Object/array restructuring
- **Template-based** - Complex formatting with variables and helpers

### 2. Multi-Layer Mapping System

The transformation operates through several layers:

```typescript
// Template Creation Flow (TemplateCreationWizard.tsx:568-592)
const sampleSourceFields: SourceField[] = [
  { fieldPath: 'masterAttributes.brand', displayName: 'Brand', dataType: 'string', required: true },
  { fieldPath: 'masterAttributes.product_name', displayName: 'Product Name', dataType: 'string', required: true },
  { fieldPath: 'pricingData.price', displayName: 'Price', dataType: 'number', required: true },
  // ... more fields
];

const sampleTargetFields: TargetField[] = [
  { channelId: 'amazon', fieldPath: 'title', displayName: 'Amazon Title', dataType: 'string', maxLength: 200, required: true },
  { channelId: 'shopify', fieldPath: 'shipping_length', displayName: 'Shopify Shipping Length', dataType: 'number', required: false },
  // ... channel-specific fields
];
```

## Field Inclusion Mechanisms

### How Fields Get Included in Payloads

Fields are included in channel payloads through a hierarchical system:

#### 1. **Master Field Selection** 
```typescript
// From TemplateCreationWizard.tsx:409-447
{masterFields.map((field) => (
  <div
    key={field.id}
    className={`p-3 border rounded-lg cursor-pointer transition-all ${
      selectedMasterFields.includes(field.id)
        ? 'border-brand-500 bg-brand-50'
        : 'border-gray-200 hover:border-gray-300'
    }`}
    onClick={() => handleMasterFieldToggle(field.id)}
  >
    // Field selection UI
  </div>
))}
```

#### 2. **Mapping Configuration**
```typescript
// ComplexMapping.ts:47-71
export interface SourceField {
  fieldPath: string;        // e.g., 'masterAttributes.brand', 'variantData.price'
  displayName: string;
  dataType: DataType;
  required: boolean;
  defaultValue?: unknown;
  preprocessing?: PreprocessingRule[];
}

export interface TargetField {
  channelId: string;
  fieldPath: string;        // e.g., 'title', 'bulletPoints[0]', 'dimensions.length'
  displayName: string;
  dataType: DataType;
  maxLength?: number;
  format?: string;
  required: boolean;
  postprocessing?: PostprocessingRule[];
}
```

#### 3. **Transformation Rules**
```typescript
// ComplexMapping.ts:74-94
export interface TransformationConfig {
  type: MappingType;
  concatenation?: ConcatenationConfig;     // Many-to-One
  decomposition?: DecompositionConfig;     // One-to-Many  
  conditional?: ConditionalConfig;         // Rule-based
  computation?: ComputationConfig;         // Formula-based
  structural?: StructuralConfig;           // Object transformation
  template?: TemplateConfig;               // Template-based
}
```

### Field Priority and Processing Order

Fields are processed in priority order with cascading rules:

```typescript
// ComplexMapping.ts:22-45
export interface ComplexFieldMapping {
  id: string;
  name: string;
  type: MappingType;
  priority: number;          // Higher priority = processed first
  enabled: boolean;
  sourceFields: SourceField[];
  targetField: TargetField;
  transformation: TransformationConfig;
  validation?: ValidationConfig;
}
```

## Channel-Specific Fields Not in Master Data

### The Custom Fields System

**Yes, channel-specific fields that don't exist in master data can be included in payloads** through the custom fields mechanism:

```typescript
// From ChannelSync.tsx:294-295, ChannelProductEditModal.tsx:466-467, 489
// Channel data includes custom fields that are channel-specific
const value = channelData.customFields?.[field.fieldName];
const fieldValue = channelData.customFields?.[field.fieldName] || field.defaultValue || '';
```

### Channel-Specific Data Structure

```typescript
// ChannelTypes.ts (referenced in ChannelSync.tsx:7)
export interface ChannelSpecificData {
  customFields: Record<string, unknown>;  // Channel-only fields
  lastSynced?: Date;
  syncErrors?: string[];
  syncStatus?: 'pending' | 'synced' | 'error';
  pendingSync?: boolean;
}
```

### How Channel-Specific Fields Work

#### 1. **Field Definition**
Channel configurations define fields that may not exist in master data:

```typescript
// From ChannelSync.tsx:176-207
const getChannelFields = (channelId: string) => {
  const channelFieldsMap: Record<string, Array<{id: string, name: string, maxLength?: number}>> = {
    amazon: [
      { id: 'bullet_point_1', name: 'Bullet Point 1', maxLength: 255 },
      { id: 'search_terms', name: 'Search Terms', maxLength: 249 }
    ],
    shopify: [
      { id: 'vendor', name: 'Vendor' },
      { id: 'product_type', name: 'Product Type' }
    ]
    // ... more channel-specific fields
  };
  return channelFieldsMap[channelId] || [];
};
```

#### 2. **Data Collection & Override**
```typescript
// From ChannelProductEditModal.tsx:398-400
// "Values you set here will override the master variant data for {channelConfig.displayName} only. 
//  Leave fields empty to use the master values."
```

#### 3. **Payload Generation**
Channel-specific fields are merged into the final payload:

```typescript
// From ChannelSync.tsx:127-141
const channelPayload = {
  platform: channelId,
  storeId,
  channelData: {
    ...channelData,
    sku: data.masterAttributes.sku,           // From master
    title: data.masterAttributes.product_name, // From master
    price: data.masterAttributes.basePrice,    // From master
    ...channelData.customFields              // Channel-specific overrides
  }
};
```

## Complete Transformation Flow

### 1. **Template Selection & Configuration**
```typescript
// TemplateCreationWizard.tsx:634-645
<MappingBuilder
  availableSourceFields={sampleSourceFields}
  availableTargetFields={sampleTargetFields}
  onSave={(mappings) => {
    setComplexMappings(mappings);
  }}
  // ... configuration
/>
```

### 2. **Complex Mapping Processing**
The system processes each mapping based on its type:

```typescript
// MappingBuilder.tsx:196-212
switch (selectedMappingType) {
  case 'many-to-one':
    return <ManyToOneBuilder {...commonProps} />;
  case 'one-to-many':
    return <OneToManyBuilder {...commonProps} />;
  case 'conditional':
    return <ConditionalBuilder {...commonProps} />;
  case 'computed':
    return <ComputedFieldsBuilder {...commonProps} />;
  case 'templated':
    return <TemplateBuilder {...commonProps} />;
  case 'structural':
    return <StructuralTransformBuilder {...commonProps} />;
  default:
    return <SimpleFieldMapping {...commonProps} />;
}
```

### 3. **Channel-Specific Augmentation**
```typescript
// The final payload includes:
// 1. Master data (transformed via templates)
// 2. Channel-specific custom fields
// 3. Computed/derived fields
// 4. Validation and formatting applied
```

## Advanced Features

### Template-Based Content Generation

```typescript
// ComplexMapping.ts:280-319
export interface TemplateConfig {
  template?: string;          // "Discover {product_name} by {brand}. {features}"
  variables?: TemplateVariable[];
  helpers?: TemplateHelper[];
  blocks?: TemplateBlock[];   // Conditional blocks, loops
  outputFormat: 'plain' | 'html' | 'markdown' | 'json';
}

export interface TemplateBlock {
  type: 'text' | 'variable' | 'conditional' | 'loop';
  condition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'exists';
    trueTemplate: string;
    falseTemplate: string;
  };
}
```

### AI-Enhanced Content Generation

```typescript
// TemplateCreationWizard.tsx:648-758
// AI Content Generation Tab includes:
// - Target keywords for SEO
// - Content templates with variables
// - Enhancement levels (basic, advanced, premium)
// - Content tone configuration
```

### Dynamic Pricing Integration

```typescript
// TemplateCreationWizard.tsx:762-896
// Pricing strategy includes:
// - Base pricing methods (markup, competitive, value-based)
// - Channel-specific adjustments
// - Bulk pricing tiers
// - Competition factor considerations
```

## Summary

**The transformation system is template-based but highly sophisticated:**

1. **Templates define the core structure** - How master data fields map to channel fields
2. **Field inclusion is configurable** - Users select which master fields to include and how to transform them
3. **Channel-specific fields are fully supported** - Through the custom fields system that allows channels to have fields not present in master data
4. **Multiple transformation types** - From simple 1:1 mappings to complex computed fields and conditional logic
5. **Hierarchical processing** - Master data → template transformations → channel-specific augmentation → final payload

The system provides maximum flexibility while maintaining consistency across channels, allowing for both standardized transformations and channel-specific customizations.