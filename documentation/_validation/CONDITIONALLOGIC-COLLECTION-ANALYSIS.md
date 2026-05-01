# ecommerce_conditional_logic_rules Collection - Complete Analysis & Recommendations

## Collection Overview

**MongoDB Collection**: `ecommerce_conditional_logic_rules`
**Document Class**: `ConditionalLogicRuleDocument.java`
**Purpose**: Stores conditional logic rules for dynamic form behavior and field interactions
**Primary Use**: Show/hide fields, make fields required/optional, set values, validate conditionally based on other field values

---

## 1. Current Documentation vs Actual Implementation

### 1.1 Currently Documented Fields (6 fields)

**From VALIDATION-RULES-IMPLEMENTATION.md (Lines 43-49)**:

| Field | Type | Current Description | Status |
|-------|------|---------------------|--------|
| `trigger_field` | String | Field that triggers the condition | ✅ Correct |
| `trigger_value` | String | Value that triggers the condition | ✅ Correct |
| `trigger_operator` | String | Operator for trigger evaluation | ✅ Correct |
| `condition_type` | String | SHOW, HIDE, REQUIRE, OPTIONAL, VALIDATE, TRANSFORM | ✅ Correct |
| `affected_fields` | List<String> | Fields affected by the condition | ✅ Correct |
| `conditions` | List<ConditionExpression> | Complex condition expressions | ❌ **INCORRECTLY CLAIMED TO NOT EXIST** |
| `actions` | List<RuleAction> | Actions to perform when conditions are met | ✅ Correct |

**Critical Documentation Error**:
> Line 48: "i dont see conditions field in mongodb."

**Reality**:
- `conditions` EXISTS at ConditionalLogicRuleDocument.java:66-67 as `List<ConditionExpression>`
- It's a nested class structure with full support for complex multi-field conditions

---

### 1.2 Field That EXISTS But Incorrectly Documented as Missing

#### CRITICAL CORRECTION NEEDED

**Field**: `conditions`
- **Location**: ConditionalLogicRuleDocument.java:66-67
- **Type**: `List<ConditionExpression>` (nested class)
- **Purpose**: Complex condition expressions supporting multi-field logic
- **Structure**:
```java
public static class ConditionExpression {
    private String field;      // Field to evaluate
    private String operator;   // Comparison operator
    private Object value;      // Expected value
    private String dataType;   // STRING, NUMBER, BOOLEAN, DATE
}
```

**Example**:
```json
{
  "conditions": [
    {
      "field": "hasVariants",
      "operator": "EQUALS",
      "value": true,
      "dataType": "BOOLEAN"
    },
    {
      "field": "price",
      "operator": "GREATER_THAN",
      "value": 100,
      "dataType": "NUMBER"
    }
  ],
  "logicalOperator": "AND"  // Both conditions must be true
}
```

**Note**: The `conditions` field supports ADVANCED multi-field logic, while `trigger_field`/`trigger_value` provide simple single-field triggers for backward compatibility.

---

### 1.3 Missing Fields Not Documented (15 fields)

#### Core Identification
1. **`rule_name`** (line 31)
   - **Type**: String
   - **Purpose**: Human-readable rule name
   - **Example**: "Show Variant Options When Has Variants"
   - **Impact**: HIGH - Used in UI and debugging

#### Advanced Conditional Logic
2. **`logical_operator`** (line 73)
   - **Type**: String (AND, OR)
   - **Purpose**: Combines multiple conditions
   - **Impact**: CRITICAL - Required for complex multi-condition rules
   - **Example**: "AND" - all conditions must be true, "OR" - any condition can be true

#### Execution Control
3. **`priority`** (line 50)
   - **Type**: Integer
   - **Purpose**: Execution order when multiple rules apply to same field
   - **Impact**: HIGH - Prevents rule conflicts
   - **Default**: 100

4. **`enabled`** (line 54)
   - **Type**: Boolean (indexed)
   - **Purpose**: Enable/disable rule without deletion
   - **Impact**: CRITICAL - Allows toggling rules
   - **Default**: true

5. **`description`** (line 63)
   - **Type**: String
   - **Purpose**: Detailed rule description
   - **Impact**: MEDIUM - Documentation and debugging

#### Scope & Context
6. **`applicable_categories`** (line 57)
   - **Type**: List<String>
   - **Purpose**: Product categories this rule applies to
   - **Example**: ["electronics", "clothing"]
   - **Impact**: HIGH - Category-specific behavior

7. **`supported_channels`** (line 60)
   - **Type**: List<String>
   - **Purpose**: Sales channels this rule applies to
   - **Example**: ["shopify", "lazada"]
   - **Impact**: HIGH - Channel-specific behavior

8. **`applicable_user_roles`** (line 85)
   - **Type**: List<String>
   - **Purpose**: User roles that see this rule's effect
   - **Example**: ["BUSINESS_USER", "ADMIN"]
   - **Impact**: HIGH - Role-based field visibility

9. **`required_permissions`** (line 88)
   - **Type**: List<String>
   - **Purpose**: Permissions needed for rule to apply
   - **Example**: ["EDIT_VARIANTS", "VIEW_ADVANCED_OPTIONS"]
   - **Impact**: HIGH - Permission-based field access

#### Multi-tenancy
10. **`organization_id`** (line 78)
    - **Type**: String (indexed)
    - **Purpose**: Organization-specific rules
    - **Impact**: HIGH - Multi-tenant rule isolation

11. **`tenant_specific`** (line 81)
    - **Type**: Boolean
    - **Purpose**: Indicates tenant-specific rule
    - **Impact**: MEDIUM - Rule inheritance logic

#### Metadata
12. **`metadata`** (line 92)
    - **Type**: Map<String, Object>
    - **Purpose**: Additional metadata
    - **Impact**: MEDIUM

13. **`tags`** (line 95)
    - **Type**: List<String>
    - **Purpose**: Categorization tags
    - **Example**: ["variants", "conditional-visibility", "pricing"]
    - **Impact**: MEDIUM - Rule discovery and organization

14. **`version`** (line 98)
    - **Type**: String
    - **Purpose**: Version tracking
    - **Impact**: MEDIUM - Change management

#### Statistics
15. **`execution_count`** (line 115)
    - **Type**: Long
    - **Purpose**: How many times rule triggered
    - **Impact**: MEDIUM - Usage analytics

16. **`last_executed_at`** (line 118)
    - **Type**: LocalDateTime
    - **Purpose**: Last trigger timestamp
    - **Impact**: MEDIUM - Activity monitoring

#### Audit Trail
17. **`created_at`** (line 102)
    - **Type**: LocalDateTime
    - **Purpose**: Creation timestamp
    - **Impact**: HIGH - Audit

18. **`updated_at`** (line 105)
    - **Type**: LocalDateTime
    - **Purpose**: Last update timestamp
    - **Impact**: HIGH - Audit

19. **`created_by`** (line 108)
    - **Type**: String
    - **Purpose**: Creator user ID
    - **Impact**: HIGH - Audit

20. **`updated_by`** (line 111)
    - **Type**: String
    - **Purpose**: Last updater user ID
    - **Impact**: HIGH - Audit

---

## 2. Nested Class Structures (Not Documented)

### 2.1 ConditionExpression Class

**Location**: ConditionalLogicRuleDocument.java:125-130

**Structure**:
```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public static class ConditionExpression {
    private String field;      // Field name to evaluate
    private String operator;   // Comparison operator
    private Object value;      // Expected value (can be literal or reference to another field)
    private String dataType;   // Data type: STRING, NUMBER, BOOLEAN, DATE
}
```

**Supported Operators**:
- **Equality**: `EQUALS`, `NOT_EQUALS`
- **Comparison**: `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`
- **String**: `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `REGEX`
- **Existence**: `IS_NULL`, `IS_NOT_NULL`, `IS_EMPTY`, `IS_NOT_EMPTY`
- **Set**: `IN`, `NOT_IN`

**Example Usage**:
```json
{
  "field": "price",
  "operator": "GREATER_THAN",
  "value": 100,
  "dataType": "NUMBER"
}
```

**Advanced - Field References**:
```json
{
  "field": "compareAtPrice",
  "operator": "GREATER_THAN",
  "value": "price",  // Reference to another field (not a literal value)
  "dataType": "NUMBER"
}
```

---

### 2.2 RuleAction Class

**Location**: ConditionalLogicRuleDocument.java:136-141

**Structure**:
```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public static class RuleAction {
    private String actionType;              // Type of action to perform
    private String targetField;             // Field to apply action to
    private Object actionValue;             // Value for the action (optional)
    private Map<String, Object> actionConfig; // Additional configuration
}
```

**Supported Action Types**:
- **Visibility**: `SHOW_FIELD`, `HIDE_FIELD`
- **Requirement**: `REQUIRE_FIELD`, `OPTIONAL_FIELD`
- **State**: `ENABLE_FIELD`, `DISABLE_FIELD`
- **Value**: `SET_VALUE`, `CLEAR_VALUE`
- **Options**: `SET_OPTIONS`, `FILTER_OPTIONS`
- **Validation**: `VALIDATE_FIELD`, `SKIP_VALIDATION`
- **Styling**: `ADD_CLASS`, `REMOVE_CLASS`

**Example - Show Field**:
```json
{
  "actionType": "SHOW_FIELD",
  "targetField": "variantOptions",
  "actionConfig": {
    "animated": true,
    "duration": 300
  }
}
```

**Example - Set Value**:
```json
{
  "actionType": "SET_VALUE",
  "targetField": "hasVariants",
  "actionValue": true
}
```

**Example - Filter Options**:
```json
{
  "actionType": "FILTER_OPTIONS",
  "targetField": "subcategory",
  "actionConfig": {
    "filterBy": "category",
    "sourceField": "category"
  }
}
```

---

## 3. What Needs to Change?

### 3.1 Critical Documentation Corrections

#### FIX 1: Remove False Claim

**DELETE**:
```markdown
❌ DELETE:
Line 48: "i dont see conditions field in mongodb."
```

**REPLACE WITH**:
```markdown
✅ CORRECT DOCUMENTATION:

**Advanced Conditional Logic**:
- `conditions`: Complex condition expressions (List<ConditionExpression>)
  - Supports multi-field conditional logic
  - Each condition evaluates a field against a value using an operator
  - Structure:
    - `field`: Field name to evaluate
    - `operator`: Comparison operator (EQUALS, GREATER_THAN, CONTAINS, etc.)
    - `value`: Expected value (can be literal value or reference to another field)
    - `dataType`: Data type for proper comparison (STRING, NUMBER, BOOLEAN, DATE)
  - See section 2.1 for complete structure and operators

- `logical_operator`: Combines multiple conditions (AND, OR)
  - "AND": All conditions must be true
  - "OR": At least one condition must be true
  - Default: "AND"

**Simple Trigger (Backward Compatibility)**:
- `trigger_field`: Single field that triggers the rule
- `trigger_value`: Value that triggers the rule
- `trigger_operator`: Operator for trigger evaluation
  - Note: For simple single-field conditions, use trigger_* fields
  - For complex multi-field conditions, use `conditions` array

**Actions**:
- `actions`: Actions to perform when conditions are met (List<RuleAction>)
  - Supports multiple actions per rule
  - Structure:
    - `actionType`: Type of action (SHOW_FIELD, HIDE_FIELD, REQUIRE_FIELD, etc.)
    - `targetField`: Field to apply action to
    - `actionValue`: Optional value for SET_VALUE actions
    - `actionConfig`: Additional configuration parameters
  - See section 2.2 for complete structure and action types
```

### 3.2 Complete Field Documentation

```markdown
### 3. ecommerce_conditional_logic_rules Collection

**Purpose**: Stores conditional logic rules for dynamic form behavior and field interactions

**Core Identification**:
- `rule_name`: Human-readable rule name
- `description`: Detailed rule description

**Simple Condition (Single Field)**:
- `trigger_field`: Field that triggers the rule (indexed)
- `trigger_value`: Value that triggers the rule
- `trigger_operator`: Operator for trigger evaluation
- `condition_type`: Type of condition (SHOW, HIDE, REQUIRE, OPTIONAL, VALIDATE, TRANSFORM)
- `affected_fields`: List of fields affected by the condition

**Advanced Conditions (Multi-Field)**:
- `conditions`: List of condition expressions (ConditionExpression[])
  - Supports complex multi-field logic
  - See section 2.1 for detailed structure
- `logical_operator`: Combines conditions (AND, OR)

**Actions**:
- `actions`: List of actions to execute (RuleAction[])
  - See section 2.2 for detailed structure
  - Supports multiple actions per rule

**Execution Control**:
- `priority`: Execution order (Integer)
  - Lower number = higher priority
  - Default: 100
- `enabled`: Enable/disable flag (Boolean, indexed)
  - Default: true

**Scope & Context**:
- `applicable_categories`: Product categories (List<String>)
  - Empty/null = applies to all categories
- `supported_channels`: Sales channels (List<String>)
  - Empty/null = applies to all channels
- `applicable_user_roles`: User roles that see this rule (List<String>)
  - Example: ["BUSINESS_USER", "ADMIN"]
- `required_permissions`: Permissions needed (List<String>)
  - Example: ["EDIT_VARIANTS"]

**Multi-tenancy**:
- `organization_id`: Organization-specific rules (String, indexed)
- `tenant_specific`: Tenant isolation flag (Boolean)

**Metadata**:
- `metadata`: Additional metadata (Map<String, Object>)
- `tags`: Categorization tags (List<String>)
- `version`: Version tracking (String)

**Statistics**:
- `execution_count`: Trigger count (Long)
- `last_executed_at`: Last trigger timestamp (LocalDateTime)

**Audit Trail**:
- `created_at`, `updated_at`: Timestamps
- `created_by`, `updated_by`: User IDs
```

---

## 4. Service Layer Analysis

### 4.1 Available Service Methods (ConditionalLogicRuleSimpleService.java)

```java
// Query Methods
getRulesForTriggerField(String triggerField)                          // Get rules for trigger field
getRulesForFieldValue(String triggerField, String triggerValue)       // Get rules for specific value
getRulesByConditionType(String conditionType)                         // Get rules by condition type
getRulesForCategories(List<String> categories)                        // Get category-specific rules
getRuleById(String id)                                               // Get single rule by ID
getAllEnabledRules()                                                 // Get all enabled rules

// Mutation Methods
saveRule(ConditionalLogicRuleDocument rule)                          // Create or update rule
deleteRule(String ruleId)                                            // Delete rule
ruleExists(String ruleId)                                            // Check if rule exists
```

### 4.2 Missing REST API Endpoints

**Problem**: Service methods exist but NO REST controller!

**Recommendation**: Create `ConditionalLogicRulesController.java`

```java
@RestController
@RequestMapping("/api/v1/ecommerce/conditional-rules")
@RequiredArgsConstructor
@Slf4j
public class ConditionalLogicRulesController {

    private final ConditionalLogicRuleSimpleService ruleService;

    @GetMapping
    public ResponseEntity<List<ConditionalLogicRuleDocument>> getRules(
            @RequestParam(required = false) String triggerField,
            @RequestParam(required = false) String conditionType,
            @RequestParam(required = false) List<String> categories) {

        if (triggerField != null) {
            return ResponseEntity.ok(ruleService.getRulesForTriggerField(triggerField));
        }
        if (conditionType != null) {
            return ResponseEntity.ok(ruleService.getRulesByConditionType(conditionType));
        }
        if (categories != null && !categories.isEmpty()) {
            return ResponseEntity.ok(ruleService.getRulesForCategories(categories));
        }

        return ResponseEntity.ok(ruleService.getAllEnabledRules());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConditionalLogicRuleDocument> getRule(@PathVariable String id) {
        return ruleService.getRuleById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<ConditionalLogicRuleDocument> createRule(
            @RequestBody ConditionalLogicRuleDocument rule) {
        ConditionalLogicRuleDocument saved = ruleService.saveRule(rule);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ConditionalLogicRuleDocument> updateRule(
            @PathVariable String id,
            @RequestBody ConditionalLogicRuleDocument rule) {

        if (!ruleService.ruleExists(id)) {
            return ResponseEntity.notFound().build();
        }

        rule.setId(id);
        ConditionalLogicRuleDocument updated = ruleService.saveRule(rule);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRule(@PathVariable String id) {
        if (!ruleService.ruleExists(id)) {
            return ResponseEntity.notFound().build();
        }

        ruleService.deleteRule(id);
        return ResponseEntity.noContent().build();
    }
}
```

---

## 5. Real-World Examples

### 5.1 Simple Rule: Show Variant Fields When Has Variants

```json
{
  "ruleName": "Show Variant Options When Has Variants",
  "triggerField": "hasVariants",
  "triggerValue": "true",
  "triggerOperator": "EQUALS",
  "conditionType": "SHOW",
  "affectedFields": ["variantOptions", "variants"],
  "priority": 100,
  "enabled": true,
  "actions": [
    {
      "actionType": "SHOW_FIELD",
      "targetField": "variantOptions"
    },
    {
      "actionType": "REQUIRE_FIELD",
      "targetField": "variantOptions"
    },
    {
      "actionType": "SHOW_FIELD",
      "targetField": "variants"
    }
  ],
  "applicableCategories": ["all"],
  "supportedChannels": ["all"]
}
```

### 5.2 Complex Rule: Show Discount Field for Premium Products

```json
{
  "ruleName": "Show Discount Field for Premium High-Value Products",
  "conditions": [
    {
      "field": "category",
      "operator": "IN",
      "value": ["electronics", "jewelry"],
      "dataType": "STRING"
    },
    {
      "field": "price",
      "operator": "GREATER_THAN",
      "value": 1000,
      "dataType": "NUMBER"
    }
  ],
  "logicalOperator": "AND",
  "priority": 50,
  "enabled": true,
  "actions": [
    {
      "actionType": "SHOW_FIELD",
      "targetField": "discountPercent",
      "actionConfig": {
        "animated": true,
        "duration": 300
      }
    },
    {
      "actionType": "SET_VALUE",
      "targetField": "allowsDiscount",
      "actionValue": true
    }
  ],
  "applicableUserRoles": ["ADMIN", "PRICING_MANAGER"],
  "requiredPermissions": ["EDIT_PRICING"]
}
```

### 5.3 Rule: Filter Subcategories by Category

```json
{
  "ruleName": "Filter Subcategories Based on Selected Category",
  "triggerField": "category",
  "triggerOperator": "NOT_NULL",
  "conditionType": "TRANSFORM",
  "priority": 90,
  "enabled": true,
  "actions": [
    {
      "actionType": "FILTER_OPTIONS",
      "targetField": "subcategory",
      "actionConfig": {
        "filterBy": "parentCategory",
        "sourceField": "category",
        "resetValue": true
      }
    }
  ]
}
```

### 5.4 Rule: Require Shipping Dimensions for Heavy Items

```json
{
  "ruleName": "Require Shipping Dimensions for Heavy Items",
  "conditions": [
    {
      "field": "weight",
      "operator": "GREATER_THAN",
      "value": 5,
      "dataType": "NUMBER"
    }
  ],
  "priority": 80,
  "enabled": true,
  "actions": [
    {
      "actionType": "REQUIRE_FIELD",
      "targetField": "dimensions"
    },
    {
      "actionType": "SHOW_FIELD",
      "targetField": "shippingClass"
    },
    {
      "actionType": "ADD_CLASS",
      "targetField": "weight",
      "actionConfig": {
        "className": "heavy-item-highlight"
      }
    }
  ]
}
```

---

## 6. Frontend Integration

### 6.1 Fetch and Apply Conditional Rules

```javascript
class ConditionalRuleEngine {
  constructor() {
    this.rules = [];
    this.fieldValues = {};
  }

  async loadRules(category, channels) {
    const response = await fetch(
      `/api/v1/ecommerce/conditional-rules?categories=${category}`
    );
    this.rules = await response.json();
  }

  evaluateCondition(condition, fieldValues) {
    const fieldValue = fieldValues[condition.field];
    const expectedValue = condition.value;

    switch (condition.operator) {
      case 'EQUALS':
        return fieldValue == expectedValue;
      case 'NOT_EQUALS':
        return fieldValue != expectedValue;
      case 'GREATER_THAN':
        return parseFloat(fieldValue) > parseFloat(expectedValue);
      case 'LESS_THAN':
        return parseFloat(fieldValue) < parseFloat(expectedValue);
      case 'CONTAINS':
        return String(fieldValue).includes(expectedValue);
      case 'IN':
        return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
      case 'IS_NULL':
        return fieldValue == null || fieldValue === '';
      case 'IS_NOT_NULL':
        return fieldValue != null && fieldValue !== '';
      default:
        return false;
    }
  }

  evaluateRule(rule, fieldValues) {
    // Simple trigger-based rule
    if (rule.triggerField && !rule.conditions) {
      const triggered = this.evaluateCondition({
        field: rule.triggerField,
        operator: rule.triggerOperator,
        value: rule.triggerValue
      }, fieldValues);
      return triggered;
    }

    // Complex conditions-based rule
    if (rule.conditions && rule.conditions.length > 0) {
      const results = rule.conditions.map(cond =>
        this.evaluateCondition(cond, fieldValues)
      );

      if (rule.logicalOperator === 'OR') {
        return results.some(r => r === true);
      } else {
        return results.every(r => r === true);
      }
    }

    return false;
  }

  executeActions(actions) {
    actions.forEach(action => {
      const fieldElement = document.getElementById(action.targetField);
      if (!fieldElement) return;

      switch (action.actionType) {
        case 'SHOW_FIELD':
          fieldElement.style.display = 'block';
          if (action.actionConfig?.animated) {
            fieldElement.classList.add('fade-in');
          }
          break;

        case 'HIDE_FIELD':
          fieldElement.style.display = 'none';
          break;

        case 'REQUIRE_FIELD':
          fieldElement.setAttribute('required', 'required');
          fieldElement.closest('.field-group')?.classList.add('required');
          break;

        case 'OPTIONAL_FIELD':
          fieldElement.removeAttribute('required');
          fieldElement.closest('.field-group')?.classList.remove('required');
          break;

        case 'SET_VALUE':
          fieldElement.value = action.actionValue;
          fieldElement.dispatchEvent(new Event('change', { bubbles: true }));
          break;

        case 'DISABLE_FIELD':
          fieldElement.disabled = true;
          break;

        case 'ENABLE_FIELD':
          fieldElement.disabled = false;
          break;
      }
    });
  }

  onFieldChange(fieldName, newValue) {
    this.fieldValues[fieldName] = newValue;

    // Find and execute applicable rules
    this.rules
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority)
      .forEach(rule => {
        const shouldExecute = this.evaluateRule(rule, this.fieldValues);
        if (shouldExecute && rule.actions) {
          this.executeActions(rule.actions);
        }
      });
  }
}

// Usage
const ruleEngine = new ConditionalRuleEngine();
await ruleEngine.loadRules('electronics', ['shopify']);

// Listen to field changes
document.querySelectorAll('.product-field').forEach(field => {
  field.addEventListener('change', (e) => {
    ruleEngine.onFieldChange(e.target.name, e.target.value);
  });
});
```

---

## 7. Summary of Required Changes

### Documentation Changes (CRITICAL)

1. **Remove false claim** about `conditions` field not existing
2. **Add comprehensive `conditions` documentation** with structure and operators
3. **Document `logical_operator`** field (AND/OR)
4. **Document nested classes** (ConditionExpression, RuleAction)
5. **Add all 15 missing fields** to documentation
6. **Add real-world examples** for simple and complex rules

### Code Changes (RECOMMENDED)

1. **Create REST controller** for Conditional Logic Rules CRUD
2. **Implement statistics tracking** (execution_count, last_executed_at)
3. **Add audit field population** (created_by, updated_by)

### API Documentation (HIGH PRIORITY)

1. **Document CRUD endpoints**
2. **Add examples** for simple and complex rules
3. **Document operators** and action types
4. **Add frontend integration guide**

---

**Document Status**: Complete Analysis
**Critical Issue**: Documentation incorrectly claims `conditions` field doesn't exist
**Recommended Priority**: IMMEDIATE correction needed



  What are Conditional Logic Rules?

  Purpose: Control dynamic form behavior based on field values
  - Show/hide fields conditionally
  - Make fields required/optional based on context
  - Set values automatically
  - Filter dropdown options
  - Execute UI actions when conditions are met

  Examples from the doc:
  - "Show variant options when hasVariants = true"
  - "Show discount field for electronics over $1000"
  - "Require shipping dimensions for heavy items (weight > 5kg)"
  - "Filter subcategories based on selected category"

  Key Differences: Business Rules vs Conditional Logic

  | Aspect    | Business Rules                   | Conditional Logic Rules       |
  |-----------|----------------------------------|-------------------------------|
  | Purpose   | Data validation & transformation | UI/UX behavior                |
  | Execution | Server-side (backend)            | Client-side (frontend)        |
  | Focus     | Business logic enforcement       | Form interactivity            |
  | Use Case  | "Is this data valid?"            | "Should this field be shown?" |
  | User      | Business logic owners            | UX designers/form admins      |

  ✅ My Recommendations

  1. Should You Develop UI? YES - HIGH PRIORITY

  Critical Reasons:
  1. No REST API exists - The service exists but has NO controller endpoints!
  2. Essential for UX - Dynamic forms are critical for good user experience
  3. Data Quality - Context-aware forms improve data accuracy
  4. Currently Missing - Your product form has NO conditional logic implementation
  5. Backend Ready - The backend service and data model are already complete

  Without this UI:
  - Users see ALL fields regardless of relevance (overwhelming)
  - No dynamic field requirements (error-prone)
  - Static forms only (poor UX)
  - Manual field management (inefficient)

  2. Module Placement? SEPARATE MODULE

  Create: src/modules/ecommerce-conditional-logic/

  Why Separate (Not with business-rules)?

  | Reason                 | Explanation                                                       |
  |------------------------|-------------------------------------------------------------------|
  | Different Domain       | Business rules = data validation, Conditional logic = UI behavior |
  | Different Stakeholders | Business users vs UX designers                                    |
  | Different Execution    | Backend vs Frontend                                               |
  | Single Responsibility  | Each module has clear, focused purpose                            |
  | Independent Evolution  | Can evolve UI logic without affecting business logic              |
  | Reusability            | Could extend to other forms beyond products                       |

  🏗️ Proposed Module Structure

  src/modules/
  ├── ecommerce-product/              (✅ Exists - Product management)
  ├── ecommerce-business-rules/       (✅ Exists - Validation/transformation)
  └── ecommerce-conditional-logic/    (🆕 NEW - Form behavior)
      ├── components/
      │   ├── ConditionalLogicManager.tsx      (Main management UI)
      │   ├── RuleBuilder.tsx                   (Create/edit rules)
      │   ├── ConditionBuilder.tsx              (Build conditions)
      │   ├── ActionBuilder.tsx                 (Define actions)
      │   ├── RulesList.tsx                     (List/manage rules)
      │   └── RuleEvaluationEngine.tsx          (Client-side rule evaluation)
      ├── services/
      │   ├── conditionalLogicService.ts        (API calls)
      │   └── ruleEvaluationEngine.ts           (Execute rules on form)
      ├── types/
      │   ├── conditionalLogic.ts               (Type definitions)
      │   └── operators.ts                      (Operator definitions)
      ├── hooks/
      │   ├── useConditionalLogic.ts            (Hook for forms)
      │   └── useRuleEvaluation.ts              (Evaluate rules)
      └── index.ts                              (Barrel export)

  📋 Implementation Priority

  Phase 1: Backend API (IMMEDIATE)

  Missing: REST Controller
  // Need to create (backend team):
  POST   /api/v1/ecommerce/conditional-rules       (Create rule)
  GET    /api/v1/ecommerce/conditional-rules       (List rules)
  GET    /api/v1/ecommerce/conditional-rules/:id   (Get rule)
  PUT    /api/v1/ecommerce/conditional-rules/:id   (Update rule)
  DELETE /api/v1/ecommerce/conditional-rules/:id   (Delete rule)
  GET    /api/v1/ecommerce/conditional-rules?category=electronics

  Phase 2: Rule Evaluation Engine (HIGH PRIORITY)

  Create client-side engine to evaluate and execute rules on the product form:
  // src/modules/ecommerce-conditional-logic/services/ruleEvaluationEngine.ts
  class RuleEvaluationEngine {
    - loadRules(category, channels)
    - evaluateRule(rule, formData)
    - executeActions(actions)
    - onFieldChange(fieldName, value)
  }

  Phase 3: Management UI (MEDIUM PRIORITY)

  Admin interface to create and manage conditional logic rules:
  - Rule builder with visual condition/action editor
  - Test rules before saving
  - Enable/disable rules
  - Priority management

  Phase 4: Integration (HIGH PRIORITY)

  Integrate rule engine into DynamicProductCreationFormClean.tsx:
  // Load rules on mount
  const conditionalRules = await loadRulesForCategory(category);

  // Evaluate on field change
  handleFieldChange(fieldName, value) => {
    evaluateRules(fieldName, value, allFormData);
  }