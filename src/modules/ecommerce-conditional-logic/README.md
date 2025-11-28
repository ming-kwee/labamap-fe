# Ecommerce Conditional Logic Module

Dynamic form behavior and field interactions based on conditional rules.

## Overview

This module provides conditional logic capabilities for dynamic forms. It allows you to:
- Show/hide fields based on other field values
- Make fields required/optional conditionally
- Set field values automatically
- Filter dropdown options dynamically
- Execute UI actions when conditions are met

## Features

- ✅ **Client-side Rule Evaluation** - Fast, reactive form behavior
- ✅ **Complex Conditions** - Multi-field logic with AND/OR operators
- ✅ **Multiple Actions** - Execute multiple actions per rule
- ✅ **Priority System** - Control execution order
- ✅ **Context-aware** - Category, channel, and role-based rules
- ✅ **React Hook** - Easy integration with React components
- ✅ **TypeScript** - Fully typed for better DX

## Architecture

```
src/modules/ecommerce-conditional-logic/
├── components/              # UI components (to be added)
├── services/
│   ├── conditionalLogicService.ts    # Backend API integration
│   └── ruleEvaluationEngine.ts       # Client-side rule execution
├── types/
│   ├── conditionalLogic.ts           # Core types
│   └── operators.ts                  # Operator definitions
├── hooks/
│   └── useConditionalLogic.ts        # React hook
└── index.ts                          # Barrel export
```

## Quick Start

### 1. Load and Evaluate Rules

```typescript
import { useConditionalLogic } from '@/modules/ecommerce-conditional-logic';

function ProductForm() {
  const {
    rules,
    isLoading,
    evaluateRules,
    onFieldChange,
    getFieldState
  } = useConditionalLogic({
    category: 'electronics',
    channels: ['shopify'],
    userRole: 'BUSINESS_USER',
    autoEvaluate: true
  });

  const handleFieldChange = (fieldName: string, value: any) => {
    // Update form data
    setFormData({ ...formData, [fieldName]: value });

    // Trigger rule evaluation
    onFieldChange(fieldName, value, formData);
  };

  return (
    // Your form JSX
  );
}
```

### 2. Use Field States

```typescript
import { useConditionalLogic } from '@/modules/ecommerce-conditional-logic';
import { useEffect, useState } from 'react';

function DynamicField({ fieldName, ...props }) {
  const { getFieldState, subscribeToField, unsubscribeFromField } = useConditionalLogic();
  const [fieldState, setFieldState] = useState(() => getFieldState(fieldName));

  useEffect(() => {
    const handleStateChange = (newState) => {
      setFieldState(newState);
    };

    subscribeToField(fieldName, handleStateChange);
    return () => unsubscribeFromField(fieldName, handleStateChange);
  }, [fieldName]);

  if (!fieldState.visible) return null;

  return (
    <input
      {...props}
      required={fieldState.required}
      disabled={!fieldState.enabled}
      className={fieldState.classes.join(' ')}
    />
  );
}
```

## API Integration

### Backend Endpoints

All endpoints are prefixed with `/api/v1/ecommerce/conditional-rules`:

**CRUD Operations:**
- `POST /` - Create rule
- `GET /` - List all rules
- `GET /:id` - Get rule by ID
- `PUT /:id` - Update rule
- `DELETE /:id` - Delete rule

**Filtering:**
- `GET /trigger/:field` - Filter by trigger field
- `GET /trigger/:field/value/:value` - Filter by field & value
- `GET /condition-type/:type` - Filter by condition type
- `GET /category?categories=electronics,clothing` - Filter by categories

**Utilities:**
- `GET /stats` - Get statistics
- `PATCH /:id/toggle` - Toggle enabled/disabled
- `POST /validate` - Validate rule

## Rule Structure

### Simple Rule (Single Condition)

```typescript
{
  ruleName: "Show Variant Options When Has Variants",
  triggerField: "hasVariants",
  triggerValue: "true",
  triggerOperator: "EQUALS",
  enabled: true,
  actions: [
    {
      actionType: "SHOW_FIELD",
      targetField: "variantOptions"
    },
    {
      actionType: "REQUIRE_FIELD",
      targetField: "variantOptions"
    }
  ]
}
```

### Complex Rule (Multiple Conditions)

```typescript
{
  ruleName: "Show Discount for Premium Products",
  conditions: [
    {
      field: "category",
      operator: "IN",
      value: ["electronics", "jewelry"],
      dataType: "STRING"
    },
    {
      field: "price",
      operator: "GREATER_THAN",
      value: 1000,
      dataType: "NUMBER"
    }
  ],
  logicalOperator: "AND",
  priority: 50,
  enabled: true,
  actions: [
    {
      actionType: "SHOW_FIELD",
      targetField: "discountPercent"
    }
  ]
}
```

## Operators

### Comparison Operators
- `EQUALS`, `NOT_EQUALS`
- `GREATER_THAN`, `LESS_THAN`
- `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`

### String Operators
- `CONTAINS`, `NOT_CONTAINS`
- `STARTS_WITH`, `ENDS_WITH`
- `REGEX`

### Existence Operators
- `IS_NULL`, `IS_NOT_NULL`
- `IS_EMPTY`, `IS_NOT_EMPTY`

### Set Operators
- `IN`, `NOT_IN`

## Action Types

### Visibility
- `SHOW_FIELD`, `HIDE_FIELD`

### Requirement
- `REQUIRE_FIELD`, `OPTIONAL_FIELD`

### State
- `ENABLE_FIELD`, `DISABLE_FIELD`

### Value
- `SET_VALUE`, `CLEAR_VALUE`

### Options
- `SET_OPTIONS`, `FILTER_OPTIONS`

### Validation
- `VALIDATE_FIELD`, `SKIP_VALIDATION`

### Styling
- `ADD_CLASS`, `REMOVE_CLASS`

## Advanced Usage

### Manual Rule Evaluation

```typescript
import { getRuleEvaluationEngine, ConditionalLogicService } from '@/modules/ecommerce-conditional-logic';

// Load rules
const rules = await ConditionalLogicService.getRulesForContext({
  category: 'electronics',
  channels: ['shopify']
});

// Get engine instance
const engine = getRuleEvaluationEngine();
await engine.loadRules(rules);

// Evaluate rules
const results = engine.evaluateAllRules({
  formData: { category: 'electronics', price: 1500 },
  category: 'electronics',
  channels: ['shopify']
});

console.log('Triggered rules:', results.filter(r => r.triggered));
```

### Creating Rules Programmatically

```typescript
import { ConditionalLogicService } from '@/modules/ecommerce-conditional-logic';

const newRule = await ConditionalLogicService.createRule({
  ruleName: "Require Shipping Dimensions for Heavy Items",
  conditions: [
    {
      field: "weight",
      operator: "GREATER_THAN",
      value: 5,
      dataType: "NUMBER"
    }
  ],
  actions: [
    {
      actionType: "REQUIRE_FIELD",
      targetField: "dimensions"
    },
    {
      actionType: "SHOW_FIELD",
      targetField: "shippingClass"
    }
  ],
  priority: 80,
  enabled: true
});
```

## Best Practices

1. **Use Priority** - Lower numbers execute first (e.g., 10 before 100)
2. **Test Rules** - Use validation endpoint before saving
3. **Keep It Simple** - Use simple trigger rules for basic cases
4. **Complex When Needed** - Use multi-condition rules for advanced logic
5. **Subscribe Wisely** - Only subscribe to fields that need reactive updates
6. **Clean Up** - Unsubscribe in component cleanup

## Common Patterns

### Show Field Based on Another

```typescript
{
  triggerField: "hasVariants",
  triggerValue: "true",
  triggerOperator: "EQUALS",
  actions: [{ actionType: "SHOW_FIELD", targetField: "variants" }]
}
```

### Require Field Conditionally

```typescript
{
  conditions: [{ field: "productType", operator: "EQUALS", value: "physical", dataType: "STRING" }],
  actions: [{ actionType: "REQUIRE_FIELD", targetField: "weight" }]
}
```

### Set Default Value

```typescript
{
  triggerField: "category",
  triggerOperator: "IS_NOT_EMPTY",
  actions: [{ actionType: "SET_VALUE", targetField: "status", actionValue: "draft" }]
}
```

### Filter Options

```typescript
{
  triggerField: "category",
  triggerOperator: "IS_NOT_NULL",
  actions: [{
    actionType: "FILTER_OPTIONS",
    targetField: "subcategory",
    actionConfig: {
      filterBy: "parentCategory",
      sourceField: "category"
    }
  }]
}
```

## Related Modules

- `ecommerce-product` - Product management (consumer of this module)
- `ecommerce-business-rules` - Business validation rules (different purpose)

## Future Enhancements

- [ ] Visual rule builder UI
- [ ] Rule testing interface
- [ ] Rule templates library
- [ ] Import/export rules
- [ ] Rule versioning
- [ ] Rule analytics dashboard

## Support

For issues or questions, see the main project documentation or contact the development team.
