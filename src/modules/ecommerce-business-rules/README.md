# Ecommerce Business Rules Module

## Overview
Handles business rules management, configuration, and execution for the ecommerce system.

## Components
- **BusinessRulesManager**: Main business rules management interface
- **RuleForm**: Form for creating/editing rules
- **RulesList**: List view of all rules
- **RuleStatistics**: Statistics and analytics for rules
- **SchemaBasedConfigurationForm**: Dynamic configuration form based on schema
- **ValidationRuleBuilder**: Builder for validation rules
- **TransformationRuleBuilder**: Builder for transformation rules
- **EnhancementRuleBuilder**: Builder for enhancement rules

## Services
- **businessRulesService**: Business rules execution and management
- **configurationSchemaService**: Schema-based configuration handling

## Types
- **businessRules.ts**: Business rule types and interfaces
- **configurationSchema.ts**: Configuration schema types

## Usage
```typescript
import {
  BusinessRulesManager,
  RuleForm,
  BusinessRulesService
} from '@/modules/ecommerce-business-rules';

// Or use module alias:
import {
  BusinessRulesManager
} from '@/ecommerce-business-rules';
```

## Dependencies
- `@/shared/ui` - Shared UI components
- `@/shared/services` - Base API client

## Routes
- `/business-rules` - Business rules management page
