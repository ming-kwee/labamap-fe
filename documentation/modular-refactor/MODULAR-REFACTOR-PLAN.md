# Modular Refactoring Plan - Domain-Based Modules

## Goal
Split the monolithic component structure into clean, maintainable domain-based modules while ensuring everything runs smoothly.

## New Structure

```
/free-nextjs-admin-dashboard
├─ src/
│   ├─ app/
│   │   └─ (admin)/
│   │       ├─ products/         ← routes (unchanged)
│   │       ├─ business-rules/   ← routes (unchanged)
│   │       └─ ...
│   │
│   ├─ modules/                  ← NEW: Domain modules
│   │   ├─ ecommerce-product/
│   │   │   ├─ components/
│   │   │   │   ├─ DynamicProductCreationFormClean.tsx
│   │   │   │   ├─ ProductCreationPageWrapper.tsx
│   │   │   │   ├─ VariantConfiguratorDynamic.tsx
│   │   │   │   ├─ ValidationResultDisplay.tsx
│   │   │   │   ├─ ChannelSelectionInterface.tsx
│   │   │   │   ├─ ChannelPayloadReview.tsx
│   │   │   │   ├─ form/
│   │   │   │   │   ├─ EnhancedField.tsx
│   │   │   │   │   └─ TagsSection.tsx
│   │   │   │   └─ templates/
│   │   │   │       ├─ TemplatesList.tsx
│   │   │   │       ├─ TemplatePreview.tsx
│   │   │   │       ├─ TemplateCreationWizard.tsx
│   │   │   │       ├─ ChannelTemplateManager.tsx
│   │   │   │       ├─ MappingBuilder.tsx
│   │   │   │       ├─ TemplateEntrySelector.tsx
│   │   │   │       ├─ QuickStartTemplateSelector.tsx
│   │   │   │       └─ builders/
│   │   │   │           ├─ TemplateBuilder.tsx
│   │   │   │           ├─ ComputedFieldsBuilder.tsx
│   │   │   │           ├─ ConditionalBuilder.tsx
│   │   │   │           ├─ OneToManyBuilder.tsx
│   │   │   │           ├─ ManyToOneBuilder.tsx
│   │   │   │           └─ StructuralTransformBuilder.tsx
│   │   │   ├─ services/
│   │   │   │   ├─ productService.ts          (extracted from backendService)
│   │   │   │   ├─ channelMappingService.ts   (move from src/services)
│   │   │   │   └─ templateService.ts         (if exists)
│   │   │   ├─ types/
│   │   │   │   ├─ product.ts                 (move from src/types)
│   │   │   │   ├─ dynamicForm.ts             (move from src/types)
│   │   │   │   ├─ channel.ts                 (move from src/types)
│   │   │   │   └─ index.ts                   (barrel export)
│   │   │   ├─ hooks/
│   │   │   │   └─ useProductForm.ts          (if any product-specific hooks)
│   │   │   └─ index.ts                       (barrel export for module)
│   │   │
│   │   ├─ ecommerce-business-rules/
│   │   │   ├─ components/
│   │   │   │   ├─ BusinessRulesManager.tsx
│   │   │   │   ├─ RuleForm.tsx
│   │   │   │   ├─ RulesList.tsx
│   │   │   │   ├─ RuleStatistics.tsx
│   │   │   │   ├─ SchemaBasedConfigurationForm.tsx
│   │   │   │   ├─ ValidationRuleBuilder.tsx
│   │   │   │   ├─ TransformationRuleBuilder.tsx
│   │   │   │   └─ EnhancementRuleBuilder.tsx
│   │   │   ├─ services/
│   │   │   │   ├─ businessRulesService.ts    (extracted from backendService)
│   │   │   │   └─ configurationSchemaService.ts (move from src/services)
│   │   │   ├─ types/
│   │   │   │   ├─ businessRules.ts           (extract from types)
│   │   │   │   ├─ configurationSchema.ts
│   │   │   │   └─ index.ts                   (barrel export)
│   │   │   └─ index.ts                       (barrel export for module)
│   │   │
│   │   └─ README.md                          (module documentation)
│   │
│   ├─ shared/                                ← NEW: Shared resources
│   │   ├─ ui/                                (move from src/components/ui)
│   │   │   ├─ card/
│   │   │   ├─ button/
│   │   │   ├─ alert/
│   │   │   ├─ badge/
│   │   │   ├─ icons/
│   │   │   └─ ...
│   │   ├─ contexts/                          (move from src/context)
│   │   │   ├─ AuthContext.tsx
│   │   │   ├─ OrganizationContext.tsx
│   │   │   └─ index.ts
│   │   ├─ hooks/                             (shared hooks)
│   │   │   └─ index.ts
│   │   ├─ services/                          (shared API services)
│   │   │   ├─ apiClient.ts                   (base API client)
│   │   │   └─ index.ts
│   │   ├─ utils/                             (shared utilities)
│   │   │   └─ index.ts
│   │   ├─ types/                             (shared types only)
│   │   │   └─ common.ts
│   │   └─ index.ts                           (barrel export)
│   │
│   └─ components/                            ← DEPRECATED (to be removed)
│       ├─ auth/                              (keep - auth is shared)
│       └─ ...
```

## Migration Steps

### Phase 1: Setup Structure ✅
- [x] Create `src/modules/` folder
- [x] Create `src/modules/ecommerce-product/{components,services,types,hooks}`
- [x] Create `src/modules/ecommerce-business-rules/{components,services,types}`
- [x] Create `src/shared/{ui,contexts,hooks,services,utils,types}`

### Phase 2: Move Shared Resources
**Move UI Components:**
```bash
mv src/components/ui src/shared/ui
```

**Move Contexts:**
```bash
mv src/context/* src/shared/contexts/
```

**Create shared services base:**
- Extract base API client from backendService.ts

### Phase 3: Ecommerce Product Module

**3.1. Move Components:**
```
src/components/products/DynamicProductCreationFormClean.tsx
  → src/modules/ecommerce-product/components/DynamicProductCreationFormClean.tsx

src/components/products/ProductCreationPageWrapper.tsx
  → src/modules/ecommerce-product/components/ProductCreationPageWrapper.tsx

src/components/products/VariantConfiguratorDynamic.tsx
  → src/modules/ecommerce-product/components/VariantConfiguratorDynamic.tsx

src/components/products/ValidationResultDisplay.tsx
  → src/modules/ecommerce-product/components/ValidationResultDisplay.tsx

src/components/products/ChannelSelectionInterface.tsx
  → src/modules/ecommerce-product/components/ChannelSelectionInterface.tsx

src/components/products/ChannelPayloadReview.tsx
  → src/modules/ecommerce-product/components/ChannelPayloadReview.tsx

src/components/products/form/*
  → src/modules/ecommerce-product/components/form/*

src/components/products/templates/*
  → src/modules/ecommerce-product/components/templates/*
```

**3.2. Extract & Move Services:**
Create `src/modules/ecommerce-product/services/productService.ts`:
```typescript
// Extract these from backendService.ts:
- getAllMasterAttributes()
- getCategories()
- getFormFields()
- getCategoryConfig()
- getFieldValidation()
- getChannelFields()
- generateFormSchema()
- refreshFormSchema()
- createProduct()
- validateProduct()
- validateProductEnhanced()
- getProductChannels()
```

Move `src/services/ChannelMappingService.ts`:
```
→ src/modules/ecommerce-product/services/channelMappingService.ts
```

**3.3. Move Types:**
```
src/types/product.ts
  → src/modules/ecommerce-product/types/product.ts

src/types/dynamicForm.ts
  → src/modules/ecommerce-product/types/dynamicForm.ts

src/types/channel.ts
  → src/modules/ecommerce-product/types/channel.ts
```

**3.4. Create Barrel Exports:**

`src/modules/ecommerce-product/types/index.ts`:
```typescript
export * from './product';
export * from './dynamicForm';
export * from './channel';
```

`src/modules/ecommerce-product/services/index.ts`:
```typescript
export * from './productService';
export * from './channelMappingService';
```

`src/modules/ecommerce-product/components/index.ts`:
```typescript
export { default as DynamicProductCreationFormClean } from './DynamicProductCreationFormClean';
export { default as ProductCreationPageWrapper } from './ProductCreationPageWrapper';
export { default as VariantConfiguratorDynamic } from './VariantConfiguratorDynamic';
export { default as ValidationResultDisplay } from './ValidationResultDisplay';
export { default as ChannelSelectionInterface } from './ChannelSelectionInterface';
export { default as ChannelPayloadReview } from './ChannelPayloadReview';
```

`src/modules/ecommerce-product/index.ts`:
```typescript
// Barrel export for entire module
export * from './components';
export * from './services';
export * from './types';
```

### Phase 4: Ecommerce Business Rules Module

**4.1. Move Components:**
```
src/components/business-rules/BusinessRulesManager.tsx
  → src/modules/ecommerce-business-rules/components/BusinessRulesManager.tsx

src/components/business-rules/RuleForm.tsx
  → src/modules/ecommerce-business-rules/components/RuleForm.tsx

src/components/business-rules/RulesList.tsx
  → src/modules/ecommerce-business-rules/components/RulesList.tsx

src/components/business-rules/RuleStatistics.tsx
  → src/modules/ecommerce-business-rules/components/RuleStatistics.tsx

src/components/business-rules/SchemaBasedConfigurationForm.tsx
  → src/modules/ecommerce-business-rules/components/SchemaBasedConfigurationForm.tsx

src/components/business-rules/ValidationRuleBuilder.tsx
  → src/modules/ecommerce-business-rules/components/ValidationRuleBuilder.tsx

src/components/business-rules/TransformationRuleBuilder.tsx
  → src/modules/ecommerce-business-rules/components/TransformationRuleBuilder.tsx

src/components/business-rules/EnhancementRuleBuilder.tsx
  → src/modules/ecommerce-business-rules/components/EnhancementRuleBuilder.tsx
```

**4.2. Extract & Move Services:**

Create `src/modules/ecommerce-business-rules/services/businessRulesService.ts`:
```typescript
// Extract from backendService.ts:
- executeBusinessRules()
```

Move `src/services/configurationSchemaService.ts`:
```
→ src/modules/ecommerce-business-rules/services/configurationSchemaService.ts
```

**4.3. Move Types:**
Extract business rules types from existing type files

**4.4. Create Barrel Exports:**
Similar to ecommerce-product module

### Phase 5: Update Imports

**Routes that need import updates:**

`src/app/(admin)/products/create/page.tsx`:
```typescript
// Before:
import ProductCreationPageWrapper from '@/components/products/ProductCreationPageWrapper';

// After:
import { ProductCreationPageWrapper } from '@/modules/ecommerce-product';
```

`src/app/(admin)/business-rules/page.tsx`:
```typescript
// Before:
import BusinessRulesManager from '@/components/business-rules/BusinessRulesManager';

// After:
import { BusinessRulesManager } from '@/modules/ecommerce-business-rules';
```

**Components that need import updates:**
- All product components importing from `@/components/ui/*` → `@/shared/ui/*`
- All components importing from `@/context/*` → `@/shared/contexts/*`
- All components importing from `@/types/*` → module-specific types
- All components importing from `@/services/*` → module-specific services

### Phase 6: Update tsconfig.json Paths

Add path aliases for cleaner imports:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/modules/*": ["./src/modules/*"],
      "@/shared/*": ["./src/shared/*"],
      "@/ecommerce-product/*": ["./src/modules/ecommerce-product/*"],
      "@/ecommerce-business-rules/*": ["./src/modules/ecommerce-business-rules/*"]
    }
  }
}
```

### Phase 7: Testing Checklist

- [ ] `/products/create` page loads without errors
- [ ] Product form renders correctly
- [ ] Product form validation works (onBlur + onSubmit)
- [ ] Product creation works
- [ ] Channel selection works
- [ ] `/business-rules` page loads without errors
- [ ] Business rules manager renders correctly
- [ ] Create new rule works
- [ ] Edit existing rule works
- [ ] Schema-based configuration works
- [ ] All imports resolve correctly
- [ ] No console errors
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` passes

## Benefits of Modular Structure

### 1. **Clear Separation of Concerns**
- Each module owns its domain logic
- Shared resources clearly identified
- Easy to understand what belongs where

### 2. **Better Maintainability**
- Changes to product features only affect `ecommerce-product` module
- Changes to business rules only affect `ecommerce-business-rules` module
- Reduced risk of breaking other features

### 3. **Easier Testing**
- Test modules in isolation
- Mock dependencies more easily
- Clear boundaries for unit vs integration tests

### 4. **Team Collaboration**
- Teams can own specific modules
- Less merge conflicts
- Clear ownership boundaries

### 5. **Code Reusability**
- Shared components in `src/shared/`
- Avoid duplication
- Consistent UI across features

### 6. **Scalability**
- Easy to add new modules (e.g., `inventory`, `sales`, `reporting`)
- Each module can have its own build optimization
- Potential for micro-frontends in future

## Migration Safety

### Incremental Approach
1. Create new structure alongside old
2. Copy files first (don't delete originals)
3. Update imports in new locations
4. Test thoroughly
5. Only delete old files once everything works

### Rollback Plan
- Keep old structure until fully tested
- Use git branches for migration
- Can revert imports if issues found

## Post-Migration Cleanup

After successful migration:
1. Delete old `src/components/products/` folder
2. Delete old `src/components/business-rules/` folder
3. Delete old `src/services/` files that were moved
4. Update documentation
5. Add README.md to each module explaining its purpose

## Module Documentation Template

Each module should have a README.md:

```markdown
# Ecommerce Product Module

## Overview
Handles all product-related functionality including creation, editing, validation, and channel mapping.

## Components
- **DynamicProductCreationFormClean**: Main product creation form
- **ProductCreationPageWrapper**: Wrapper with authentication
- **VariantConfiguratorDynamic**: Product variant configuration
- **ValidationResultDisplay**: Shows validation results
- **ChannelSelectionInterface**: Select channels for product
- **ChannelPayloadReview**: Review before publishing

## Services
- **productService**: Product CRUD operations
- **channelMappingService**: Channel mapping logic

## Types
- **product.ts**: Product data types
- **dynamicForm.ts**: Dynamic form types
- **channel.ts**: Channel types

## Usage
```typescript
import {
  DynamicProductCreationFormClean,
  ProductService,
  MasterProduct
} from '@/modules/ecommerce-product';
```

## Dependencies
- Shared UI components
- AuthContext
- OrganizationContext
```

---

**Status**: Ready to execute
**Estimated Time**: 2-3 hours
**Risk Level**: Medium (many imports to update, but incremental approach reduces risk)
