# Ecommerce Product Module

## Overview
Handles all product-related functionality including creation, editing, validation, and channel mapping.

## Components
- **DynamicProductCreationFormClean**: Main product creation form with validation
- **ProductCreationPageWrapper**: Wrapper component with authentication
- **VariantConfiguratorDynamic**: Product variant configuration
- **ValidationResultDisplay**: Displays validation results
- **ChannelSelectionInterface**: Channel selection for product publishing
- **ChannelPayloadReview**: Review channel payloads before publishing
- **form/**: Form-specific components (EnhancedField, TagsSection)
- **templates/**: Template management components

## Services
- **productService**: Product CRUD operations, validation, schema generation
- **channelMappingService**: Channel mapping and transformation logic

## Types
- **product.ts**: Product, variant, and master product types
- **dynamicForm.ts**: Dynamic form schema and validation types
- **channel.ts**: Channel mapping and publishing types

## Usage
```typescript
import {
  DynamicProductCreationFormClean,
  ProductService,
  MasterProduct,
  DynamicFormData
} from '@/modules/ecommerce-product';

// Or use module alias:
import {
  DynamicProductCreationFormClean
} from '@/ecommerce-product';
```

## Dependencies
- `@/shared/ui` - Shared UI components
- `@/shared/contexts` - AuthContext, OrganizationContext
- `@/shared/services` - Base API client

## Routes
- `/products/create` - Product creation page
- `/products/channel-templates` - Channel template management
- `/products/channel-list` - Channel list view
