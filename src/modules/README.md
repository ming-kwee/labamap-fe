# Domain Modules

This directory contains domain-based modules following a clean architecture pattern.

## Module Structure

Each module follows this structure:
```
module-name/
├─ components/     # React components specific to this domain
├─ services/       # API services and business logic
├─ types/          # TypeScript types and interfaces
├─ hooks/          # Custom React hooks (optional)
├─ index.ts        # Barrel export for the module
└─ README.md       # Module documentation
```

## Available Modules

### ecommerce-product
Product management, creation, validation, and channel publishing.

### ecommerce-business-rules
Business rules configuration and execution.

## Usage

Import from modules using barrel exports:
```typescript
// Import entire module
import * as ProductModule from '@/modules/ecommerce-product';

// Import specific exports
import {
  DynamicProductCreationFormClean,
  ProductService,
  MasterProduct
} from '@/modules/ecommerce-product';

// Using path alias
import { BusinessRulesManager } from '@/ecommerce-business-rules';
```

## Adding New Modules

1. Create folder structure: `modules/new-module/{components,services,types,hooks}`
2. Add components, services, and types
3. Create barrel exports in `index.ts`
4. Add module documentation in `README.md`
5. Update `tsconfig.json` paths if using module alias

## Best Practices

- Keep modules focused on a single domain
- Use shared resources from `@/shared` for cross-cutting concerns
- Document public APIs in module README
- Use barrel exports for clean imports
- Follow naming conventions (components: PascalCase, services: camelCase)
