# API Reference — Conditional Logic

Base path: `/labamap/api/v1/ecommerce`

Service: `src/modules/ecommerce-conditional-logic/services/conditionalLogicService.ts`

---

## MongoDB Collection: `ecommerce_conditional_logic_rules`

```json
{
  "_id":         "65f1a2b3c4d5e6f7a8b9c0d1",
  "ruleName":    "Show variants when hasVariants is true",
  "description": "Shows the variant configurator when the merchant toggles variants on",

  "triggerField":    "hasVariants",
  "triggerOperator": "EQUALS",
  "triggerValue":    "true",
  "conditionType":   "SHOW",
  "affectedFields":  ["variantConfigurator"],

  "conditions": null,
  "logicalOperator": null,

  "actions": [
    { "actionType": "SHOW_FIELD", "targetField": "variantConfigurator" }
  ],

  "priority":  50,
  "enabled":   true,

  "applicableCategories": [],
  "supportedChannels":    [],
  "applicableUserRoles":  [],
  "organizationId":       null,
  "tenantSpecific":       false,

  "executionCount": 842,
  "lastExecutedAt": "2026-04-29T09:15:00Z",

  "tags":      ["variants", "product-form"],
  "version":   "1.0",
  "createdAt": "2026-01-20T10:00:00Z",
  "updatedAt": "2026-04-01T12:00:00Z"
}
```

**Index fields:** `triggerField`, `enabled`, `organizationId`

---

## POST `/ecommerce/conditional-rules`

Creates a new rule.

**Request body:** `CreateRuleRequest`
```json
{
  "ruleName":        "Require dimensions for heavy items",
  "description":     "When weight > 5kg, dimensions become required",
  "conditions": [
    { "field": "weight", "operator": "GREATER_THAN", "value": 5, "dataType": "NUMBER" }
  ],
  "logicalOperator": "AND",
  "actions": [
    { "actionType": "REQUIRE_FIELD", "targetField": "dimensions" },
    { "actionType": "SHOW_FIELD",    "targetField": "shippingClass" }
  ],
  "priority":             80,
  "enabled":              true,
  "applicableCategories": ["electronics", "home-goods"]
}
```

**Response:**
```json
{ "success": true, "rule": { ...ConditionalLogicRule } }
```

---

## GET `/ecommerce/conditional-rules`

Returns all rules.

**Response:**
```json
{ "success": true, "count": 12, "rules": [ ...ConditionalLogicRule[] ] }
```

---

## GET `/ecommerce/conditional-rules/{id}`

Returns a single rule by MongoDB `_id`.

**Response:**
```json
{ "success": true, "rule": { ...ConditionalLogicRule } }
```

---

## PUT `/ecommerce/conditional-rules/{id}`

Full update of a rule.

**Request body:** `UpdateRuleRequest` — all fields from `CreateRuleRequest` are optional.

**Response:** `{ "success": true, "rule": { ...ConditionalLogicRule } }`

---

## DELETE `/ecommerce/conditional-rules/{id}`

Permanently deletes the rule. Returns `204 No Content`.

---

## GET `/ecommerce/conditional-rules/trigger/{field}`

Returns all rules whose `triggerField` matches `field`.

```
GET /ecommerce/conditional-rules/trigger/hasVariants
```

**Response:** `{ "success": true, "rules": [...] }`

---

## GET `/ecommerce/conditional-rules/trigger/{field}/value/{value}`

Returns rules matching both trigger field and trigger value.

```
GET /ecommerce/conditional-rules/trigger/hasVariants/value/true
```

---

## GET `/ecommerce/conditional-rules/condition-type/{type}`

Returns rules by `conditionType`.

`type` values: `SHOW` | `HIDE` | `REQUIRE` | `OPTIONAL` | `VALIDATE` | `TRANSFORM`

---

## GET `/ecommerce/conditional-rules/category`

Returns rules applicable to the given categories.

```
GET /ecommerce/conditional-rules/category?categories=electronics,home-goods
```

An empty `applicableCategories` array on a rule means "applies to all categories" — those rules are always included.

---

## GET `/ecommerce/conditional-rules/stats`

Returns aggregated rule statistics.

**Response:** `ConditionalLogicStats`
```json
{
  "totalRules":               12,
  "enabledRules":             10,
  "disabledRules":            2,
  "rulesByConditionType":     { "SHOW": 5, "HIDE": 2, "REQUIRE": 3, "OPTIONAL": 2 },
  "rulesByCategory":          { "electronics": 4, "all": 8 },
  "totalExecutions":          4200,
  "averageExecutionsPerRule": 350
}
```

---

## PATCH `/ecommerce/conditional-rules/{id}/toggle`

Toggles `enabled` between `true` and `false`.

**Response:** `{ "success": true, "rule": { ...updated rule } }`

---

## POST `/ecommerce/conditional-rules/validate`

Validates a rule definition before saving. Does not persist.

**Request body:**
```json
{ "rule": { ...CreateRuleRequest } }
```

**Response:** `ValidateRuleResponse`
```json
{
  "valid":    false,
  "errors":   ["actions array must not be empty"],
  "warnings": ["triggerField is set but triggerOperator is missing"]
}
```

---

## Context-aware rule loading (client helper)

`ConditionalLogicService.getRulesForContext()` is a client-side convenience method — it calls `getAllRules()` then filters in the browser. Use this when you need a context-specific subset without a dedicated backend query param.

```typescript
const rules = await ConditionalLogicService.getRulesForContext({
  category:       'electronics',
  channels:       ['shopify'],
  userRole:       'BUSINESS_USER',
  organizationId: 'org_123',
});
// Returns only enabled rules matching the context, sorted by priority asc
```

---

## TypeScript Types

```typescript
// src/modules/ecommerce-conditional-logic/types/operators.ts

type ConditionOperator =
  | 'EQUALS' | 'NOT_EQUALS'
  | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_THAN_OR_EQUAL' | 'LESS_THAN_OR_EQUAL'
  | 'CONTAINS' | 'NOT_CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH' | 'REGEX'
  | 'IS_NULL' | 'IS_NOT_NULL' | 'IS_EMPTY' | 'IS_NOT_EMPTY'
  | 'IN' | 'NOT_IN';

type DataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE';

type LogicalOperator = 'AND' | 'OR';

type ActionType =
  | 'SHOW_FIELD'  | 'HIDE_FIELD'
  | 'REQUIRE_FIELD' | 'OPTIONAL_FIELD'
  | 'ENABLE_FIELD'  | 'DISABLE_FIELD'
  | 'SET_VALUE'     | 'CLEAR_VALUE'
  | 'SET_OPTIONS'   | 'FILTER_OPTIONS'
  | 'VALIDATE_FIELD'| 'SKIP_VALIDATION'
  | 'ADD_CLASS'     | 'REMOVE_CLASS';

type ConditionType = 'SHOW' | 'HIDE' | 'REQUIRE' | 'OPTIONAL' | 'VALIDATE' | 'TRANSFORM';
```

```typescript
// src/modules/ecommerce-conditional-logic/types/conditionalLogic.ts

interface ConditionExpression {
  field:    string;
  operator: ConditionOperator;
  value:    any;
  dataType: DataType;
}

interface RuleAction {
  actionType:    ActionType;
  targetField:   string;
  actionValue?:  any;
  actionConfig?: Record<string, any>;
}

interface ConditionalLogicRule {
  id?:          string;
  ruleName:     string;
  description?: string;

  // Simple mode
  triggerField?:    string;
  triggerValue?:    string;
  triggerOperator?: ConditionOperator;
  conditionType?:   ConditionType;
  affectedFields?:  string[];

  // Complex mode
  conditions?:      ConditionExpression[];
  logicalOperator?: LogicalOperator;

  actions:   RuleAction[];
  priority?: number;
  enabled:   boolean;

  applicableCategories?: string[];
  supportedChannels?:    string[];
  applicableUserRoles?:  string[];
  requiredPermissions?:  string[];
  organizationId?:       string;
  tenantSpecific?:       boolean;

  executionCount?: number;
  lastExecutedAt?: string;
  createdAt?:      string;
  updatedAt?:      string;
}

interface FieldState {
  visible:  boolean;
  required: boolean;
  enabled:  boolean;
  value?:   any;
  options?: any[];
  classes:  string[];
}

interface RuleEvaluationContext {
  formData:        Record<string, any>;
  category?:       string;
  channels?:       string[];
  userRole?:       string;
  permissions?:    string[];
  organizationId?: string;
}

interface ConditionalLogicStats {
  totalRules:               number;
  enabledRules:             number;
  disabledRules:            number;
  rulesByConditionType:     Record<ConditionType, number>;
  rulesByCategory:          Record<string, number>;
  totalExecutions:          number;
  averageExecutionsPerRule: number;
}

interface CreateRuleRequest {
  ruleName:              string;
  description?:          string;
  triggerField?:         string;
  triggerValue?:         string;
  triggerOperator?:      ConditionOperator;
  conditionType?:        ConditionType;
  affectedFields?:       string[];
  conditions?:           ConditionExpression[];
  logicalOperator?:      LogicalOperator;
  actions:               RuleAction[];
  priority?:             number;
  enabled?:              boolean;
  applicableCategories?: string[];
  supportedChannels?:    string[];
  applicableUserRoles?:  string[];
  requiredPermissions?:  string[];
  tags?:                 string[];
  metadata?:             Record<string, any>;
}
```
