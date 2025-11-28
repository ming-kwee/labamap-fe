# Import Update Guide - Modular Refactoring

## Overview
This guide shows exactly what import statements need to be updated after running the migration script.

## Update Pattern

### General Pattern
```typescript
// ❌ Before (Old Structure)
import Component from '@/components/module-name/Component';
import { Type } from '@/types/type-file';
import Service from '@/services/service-file';

// ✅ After (Modular Structure)
import { Component } from '@/modules/module-name';
import { Type } from '@/modules/module-name';
import { Service } from '@/modules/module-name';
```

---

## 1. Route Files (app/ folder)

### `/src/app/(admin)/products/create/page.tsx`

```typescript
// ❌ Before
import ProductCreationPageWrapper from '@/components/products/ProductCreationPageWrapper';
import { MasterProduct } from '@/types/product';

// ✅ After
import { ProductCreationPageWrapper, MasterProduct } from '@/modules/ecommerce-product';

// Or split by concern:
import { ProductCreationPageWrapper } from '@/modules/ecommerce-product/components';
import { MasterProduct } from '@/modules/ecommerce-product/types';
```

### `/src/app/(admin)/business-rules/page.tsx`

```typescript
// ❌ Before
import BusinessRulesManager from '@/components/business-rules/BusinessRulesManager';

// ✅ After
import { BusinessRulesManager } from '@/modules/ecommerce-business-rules';
```

---

## 2. Product Module Components

### `DynamicProductCreationFormClean.tsx`

```typescript
// ❌ Before
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2, AlertCircle, Package } from '@/components/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { DynamicFormData, FormValidationResult, FormField } from '@/types/dynamicForm';
import { MasterProduct, ProductVariant } from '@/types/product';
import VariantConfiguratorDynamic from './VariantConfiguratorDynamic';
import ValidationResultDisplay from './ValidationResultDisplay';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';

// ✅ After
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import { Loader2, AlertCircle, Package } from '@/shared/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import { DynamicFormData, FormValidationResult, FormField } from '../types/dynamicForm';
import { MasterProduct, ProductVariant } from '../types/product';
import VariantConfiguratorDynamic from './VariantConfiguratorDynamic';
import ValidationResultDisplay from './ValidationResultDisplay';
import { useAuth, useOrganization } from '@/shared/contexts';
```

### `ProductCreationPageWrapper.tsx`

```typescript
// ❌ Before
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import DynamicProductCreationFormClean from './DynamicProductCreationFormClean';
import { MasterProduct } from '@/types/product';

// ✅ After
import { useAuth, useOrganization } from '@/shared/contexts';
import DynamicProductCreationFormClean from './DynamicProductCreationFormClean';
import { MasterProduct } from '../types/product';
```

### `VariantConfiguratorDynamic.tsx`

```typescript
// ❌ Before
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';

// ✅ After
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
```

### `ValidationResultDisplay.tsx`

```typescript
// ❌ Before
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { CheckCircle, XCircle, AlertTriangle } from '@/components/ui/icons/Icons';

// ✅ After
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import { CheckCircle, XCircle, AlertTriangle } from '@/shared/ui/icons/Icons';
```

### `ChannelSelectionInterface.tsx`

```typescript
// ❌ Before
import { Card } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { MasterProduct } from '@/types/product';
import { ChannelMappingResult } from '@/types/channel';

// ✅ After
import { Card } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import { MasterProduct } from '../types/product';
import { ChannelMappingResult } from '../types/channel';
```

### `ChannelPayloadReview.tsx`

```typescript
// ❌ Before
import { Card } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { ChannelMappingResult } from '@/types/channel';

// ✅ After
import { Card } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import { ChannelMappingResult } from '../types/channel';
```

---

## 3. Business Rules Module Components

### `BusinessRulesManager.tsx`

```typescript
// ❌ Before
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import RulesList from './RulesList';
import RuleForm from './RuleForm';

// ✅ After
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import RulesList from './RulesList';
import RuleForm from './RuleForm';
```

### `RuleForm.tsx`

```typescript
// ❌ Before
import { Card } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import SchemaBasedConfigurationForm from './SchemaBasedConfigurationForm';
import { getAllSchemas, getSchema } from '@/services/configurationSchemaService';

// ✅ After
import { Card } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import { Input } from '@/shared/ui/input/Input';
import SchemaBasedConfigurationForm from './SchemaBasedConfigurationForm';
import { getAllSchemas, getSchema } from '../services/configurationSchemaService';
```

### `SchemaBasedConfigurationForm.tsx`

```typescript
// ❌ Before
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { AlertCircle, HelpCircle } from '@/components/ui/icons/Icons';

// ✅ After
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import { AlertCircle, HelpCircle } from '@/shared/ui/icons/Icons';
```

---

## 4. Service Files

### Product Service (NEW - Extract from backendService.ts)

Create `/src/modules/ecommerce-product/services/productService.ts`:

```typescript
import { DynamicFormSchema, DynamicFormData } from '../types/dynamicForm';
import { MasterProduct } from '../types/product';

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1/ecommerce';

export interface BackendContext {
  userId: string;
  organizationId: string;
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER';
  targetChannels: string[];
  productCategory: string;
  permissions: string[];
  requestId?: string;
  timestamp?: number;
  environment?: string;
  metadata?: Record<string, any>;
}

export const ProductService = {
  // GET /api/v1/ecommerce/master-attributes/all
  async getAllMasterAttributes(): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/all`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`Failed to get master attributes: ${response.statusText}`);
    return response.json();
  },

  // GET /api/v1/ecommerce/master-attributes/categories
  async getCategories(): Promise<string[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/categories`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`Failed to get categories: ${response.statusText}`);
    return response.json();
  },

  // POST /api/v1/ecommerce/form-schema/generate
  async generateFormSchema(context: BackendContext): Promise<DynamicFormSchema> {
    const response = await fetch(`${BACKEND_BASE_URL}/form-schema/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    if (!response.ok) throw new Error(`Failed to generate form schema: ${response.statusText}`);
    return response.json();
  },

  // POST /api/v1/ecommerce/dynamic-products/create
  async createProduct(productData: DynamicFormData, context: BackendContext): Promise<MasterProduct> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productData, context }),
    });
    if (!response.ok) throw new Error(`Failed to create product: ${response.statusText}`);
    return response.json();
  },

  // POST /api/v1/ecommerce/dynamic-products/validate
  async validateProduct(productData: DynamicFormData, context: BackendContext): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productData, context }),
    });
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        // If parsing fails, use statusText
      }
      throw new Error(`Enhanced validation failed: ${errorMessage}`);
    }
    return response.json();
  },

  // More product-related methods...
};

// Helper function
export function createBackendContext(
  userId: string,
  organizationId: string,
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
  targetChannels: string[],
  productCategory: string,
  permissions: string[]
): BackendContext {
  return {
    userId,
    organizationId,
    userRole,
    targetChannels,
    productCategory,
    permissions,
    requestId: `req_${Date.now()}`,
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
  };
}
```

### Business Rules Service (NEW - Extract from backendService.ts)

Create `/src/modules/ecommerce-business-rules/services/businessRulesService.ts`:

```typescript
const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1/ecommerce';

export const BusinessRulesService = {
  // POST /api/v1/ecommerce/business-rules/execute
  async executeBusinessRules(organizationId: string, ruleExecutionRequest: any): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/business-rules/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId,
        ...ruleExecutionRequest
      }),
    });
    if (!response.ok) throw new Error(`Failed to execute business rules: ${response.statusText}`);
    return response.json();
  },

  // More business rules methods...
};
```

---

## 5. Update TypeScript Path Aliases

Update `/tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/modules/*": ["./src/modules/*"],
      "@/shared/*": ["./src/shared/*"],
      "@/ecommerce-product": ["./src/modules/ecommerce-product"],
      "@/ecommerce-product/*": ["./src/modules/ecommerce-product/*"],
      "@/ecommerce-business-rules": ["./src/modules/ecommerce-business-rules"],
      "@/ecommerce-business-rules/*": ["./src/modules/ecommerce-business-rules/*"]
    }
  }
}
```

---

## 6. Components Using backendService.ts

All components that import from `@/lib/api/backendService` need updates:

```typescript
// ❌ Before
import { BackendAPIService, createBackendContext } from '@/lib/api/backendService';

// ✅ After (in product components)
import { ProductService, createBackendContext } from '../services/productService';

// Or (for business rules components)
import { BusinessRulesService } from '../services/businessRulesService';
```

**Files to update:**
- `DynamicProductCreationFormClean.tsx`
- `ProductCreationPageWrapper.tsx`
- Any template components using backend services
- Business rules components using backend services

---

## 7. Quick Search & Replace Patterns

### For Product Module Files
```bash
# In src/modules/ecommerce-product/components/
find . -type f -name "*.tsx" -exec sed -i '' 's|@/components/ui|@/shared/ui|g' {} +
find . -type f -name "*.tsx" -exec sed -i '' 's|@/context/|@/shared/contexts/|g' {} +
find . -type f -name "*.tsx" -exec sed -i '' 's|@/types/product|../types/product|g' {} +
find . -type f -name "*.tsx" -exec sed -i '' 's|@/types/dynamicForm|../types/dynamicForm|g' {} +
find . -type f -name "*.tsx" -exec sed -i '' 's|@/types/channel|../types/channel|g' {} +
```

### For Business Rules Module Files
```bash
# In src/modules/ecommerce-business-rules/components/
find . -type f -name "*.tsx" -exec sed -i '' 's|@/components/ui|@/shared/ui|g' {} +
find . -type f -name "*.tsx" -exec sed -i '' 's|@/services/configurationSchemaService|../services/configurationSchemaService|g' {} +
```

---

## 8. Testing Checklist

After updating imports:

### Compile Check
```bash
npm run typecheck
```

### Build Check
```bash
npm run build
```

### Runtime Tests
- [ ] Navigate to `/products/create`
- [ ] Product form loads without errors
- [ ] Can fill out form fields
- [ ] Client-side validation works (onBlur)
- [ ] Can submit form
- [ ] Navigate to `/business-rules`
- [ ] Business rules manager loads
- [ ] Can create new rule
- [ ] Schema-based configuration loads
- [ ] Check browser console for errors

---

## 9. Automated Import Update Script

Create `update-imports.sh`:

```bash
#!/bin/bash

echo "🔄 Updating imports to modular structure..."

# Update product module components
cd src/modules/ecommerce-product/components
find . -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' \
  -e 's|@/components/ui|@/shared/ui|g' \
  -e 's|@/context/AuthContext|@/shared/contexts/AuthContext|g' \
  -e 's|@/context/OrganizationContext|@/shared/contexts/OrganizationContext|g' \
  -e 's|@/types/product|../types/product|g' \
  -e 's|@/types/dynamicForm|../types/dynamicForm|g' \
  -e 's|@/types/channel|../types/channel|g' \
  {} +

# Update business rules module components
cd ../../ecommerce-business-rules/components
find . -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' \
  -e 's|@/components/ui|@/shared/ui|g' \
  -e 's|@/services/configurationSchemaService|../services/configurationSchemaService|g' \
  {} +

# Update route files
cd ../../../app/(admin)/products/create
sed -i '' \
  -e 's|@/components/products/ProductCreationPageWrapper|@/modules/ecommerce-product|g' \
  -e 's|@/types/product|@/modules/ecommerce-product/types|g' \
  page.tsx

cd ../../business-rules
sed -i '' \
  -e 's|@/components/business-rules/BusinessRulesManager|@/modules/ecommerce-business-rules|g' \
  page.tsx

echo "✅ Imports updated!"
echo "⚠️  Please review changes and test thoroughly"
```

---

## Common Issues & Solutions

### Issue 1: "Module not found"
**Solution**: Check that barrel exports (`index.ts`) are created and exporting the component

### Issue 2: "Cannot find module '@/shared/ui'"
**Solution**: Update `tsconfig.json` paths to include `@/shared/*`

### Issue 3: Circular dependency warnings
**Solution**: Check that modules don't import from each other. Use `@/shared` for shared code.

### Issue 4: Types not found
**Solution**: Make sure types are exported in `types/index.ts` barrel export

---

## Summary

**Key Changes:**
1. ✅ UI components: `@/components/ui` → `@/shared/ui`
2. ✅ Contexts: `@/context/*` → `@/shared/contexts/*`
3. ✅ Product types: `@/types/product` → `../types/product` (relative in module)
4. ✅ Services: Extract from `backendService.ts` to module-specific services
5. ✅ Route imports: Import from modules using barrel exports

**After Updates:**
- Run `npm run typecheck`
- Run `npm run build`
- Test all functionality
- Check console for errors
