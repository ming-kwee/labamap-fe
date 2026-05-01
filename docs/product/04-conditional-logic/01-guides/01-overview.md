# Conditional Logic — Overview

Module: `src/modules/ecommerce-conditional-logic/`

---

## What is conditional logic?

Conditional logic rules control form field behaviour at runtime — they show, hide, require, disable, or set values on fields based on other field values. Rules are stored in MongoDB and evaluated **client-side** in the browser; no server round-trip is needed when a user changes a field.

### How it differs from business rules

| | Conditional Logic | Business Rules |
|--|------------------|----------------|
| **Purpose** | Control field visibility/state | Validate/transform/enhance data |
| **When it runs** | On every field change (real-time) | On form submit only |
| **Where it runs** | Browser (client-side JS) | Backend (server-side Java) |
| **Who configures** | UX/product admins | Business/platform admins |
| **Collection** | `ecommerce_conditional_logic_rules` | `ecommerce_business_rules` |

---

## Two rule modes

### Simple — single trigger field

```json
{
  "ruleName": "Show variants when hasVariants is true",
  "triggerField":    "hasVariants",
  "triggerOperator": "EQUALS",
  "triggerValue":    "true",
  "actions": [
    { "actionType": "SHOW_FIELD", "targetField": "variantConfigurator" }
  ],
  "enabled": true
}
```

### Complex — multi-field conditions

```json
{
  "ruleName": "Require dimensions for heavy physical items",
  "conditions": [
    { "field": "weight",            "operator": "GREATER_THAN", "value": 5, "dataType": "NUMBER" },
    { "field": "requiresShipping",  "operator": "EQUALS",       "value": true, "dataType": "BOOLEAN" }
  ],
  "logicalOperator": "AND",
  "actions": [
    { "actionType": "REQUIRE_FIELD", "targetField": "dimensions" },
    { "actionType": "SHOW_FIELD",    "targetField": "shippingClass" }
  ],
  "priority": 80,
  "enabled": true
}
```

Both modes coexist on the same document — the engine uses `conditions[]` when present, falls back to `triggerField` otherwise.

---

## Condition operators (17 total)

| Category | Operators |
|----------|-----------|
| Comparison | `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL` |
| String | `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `REGEX` |
| Existence | `IS_NULL`, `IS_NOT_NULL`, `IS_EMPTY`, `IS_NOT_EMPTY` |
| Set | `IN`, `NOT_IN` |

---

## Action types (14 total)

| Category | Actions |
|----------|---------|
| Visibility | `SHOW_FIELD`, `HIDE_FIELD` |
| Required | `REQUIRE_FIELD`, `OPTIONAL_FIELD` |
| State | `ENABLE_FIELD`, `DISABLE_FIELD` |
| Value | `SET_VALUE`, `CLEAR_VALUE` |
| Options | `SET_OPTIONS`, `FILTER_OPTIONS` |
| Validation | `VALIDATE_FIELD`, `SKIP_VALIDATION` |
| Styling | `ADD_CLASS`, `REMOVE_CLASS` |

---

## Rule scope

Each rule can declare optional scope filters — the engine only applies the rule when the current context matches:

| Field | Type | Effect |
|-------|------|--------|
| `applicableCategories` | `string[]` | Rule only fires when product category matches |
| `supportedChannels` | `string[]` | Rule only fires for the listed channels |
| `applicableUserRoles` | `string[]` | Rule only fires for matching user roles |
| `organizationId` | `string` | Tenant-specific rule |
| `priority` | `number` | Execution order — lower number fires first |

---

## Client-side evaluation flow

The `ruleEvaluationEngine.ts` service:

1. Loads rules from backend via `GET /conditional-rules` filtered by context (category, channels, role)
2. On every `onFieldChange(field, value, formData)` call, re-evaluates all enabled rules
3. For each triggered rule, executes its actions to produce a new `FieldState`
4. Notifies subscribers (components) via the subscription system

`FieldState` per field:
```typescript
{
  visible:  boolean,
  required: boolean,
  enabled:  boolean,
  value?:   any,
  options?: any[],
  classes:  string[]
}
```

---

## `useConditionalLogic` hook

The primary React integration point:

```typescript
import { useConditionalLogic } from '@/modules/ecommerce-conditional-logic';

const {
  rules,
  isLoading,
  onFieldChange,      // call on every field change to trigger evaluation
  getFieldState,      // get current FieldState for a field name
  subscribeToField,   // subscribe to state changes for a field
  unsubscribeFromField,
} = useConditionalLogic({
  category:       'electronics',
  channels:       ['shopify', 'amazon'],
  userRole:       'BUSINESS_USER',
  organizationId: 'org_123',
  autoEvaluate:   true,
});
```

### Integration pattern with a form field

```typescript
function DynamicField({ fieldName }: { fieldName: string }) {
  const { getFieldState, subscribeToField, unsubscribeFromField } = useConditionalLogic();
  const [state, setState] = useState(() => getFieldState(fieldName));

  useEffect(() => {
    subscribeToField(fieldName, setState);
    return () => unsubscribeFromField(fieldName, setState);
  }, [fieldName]);

  if (!state.visible) return null;
  return <input required={state.required} disabled={!state.enabled} />;
}
```

### Wiring field changes

```typescript
const handleFieldChange = (field: string, value: any) => {
  setFormData(prev => ({ ...prev, [field]: value }));
  onFieldChange(field, value, formData);  // triggers rule re-evaluation
};
```

---

## Integration status

The `ecommerce-conditional-logic` module is built and production-ready, but **not yet wired into `ecommerce-product-v2`**. The product creation form (`ProductCreateForm.tsx`) uses `useFieldVisibility` (schema-driven `conditionalVisibility` from the form schema) rather than this module.

The conditional logic module is a superset — it can express everything `useFieldVisibility` does plus cross-field multi-condition rules that the schema cannot describe. Integration into Step 1 is a planned enhancement.

---

## Admin UI components

The module ships UI components for managing rules visually:

```
ConditionalLogicManager    ← main management interface
RuleBuilder                ← create/edit rules with condition and action builders
```

Route is not yet wired into the sidebar — rules can be created programmatically via the API or by adding a route to `app/(admin)/conditional-logic/page.tsx`.
