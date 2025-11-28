/**
 * Conditional Logic Rule Types
 * Based on ecommerce_conditional_logic_rules MongoDB collection
 */

import {
  ConditionOperator,
  DataType,
  LogicalOperator,
  ActionType,
  ConditionType
} from './operators';

// Condition Expression (for complex multi-field conditions)
export interface ConditionExpression {
  field: string;              // Field name to evaluate
  operator: ConditionOperator; // Comparison operator
  value: any;                 // Expected value (can be literal or reference to another field)
  dataType: DataType;         // Data type for proper comparison
}

// Rule Action (what to do when conditions are met)
export interface RuleAction {
  actionType: ActionType;                   // Type of action to perform
  targetField: string;                      // Field to apply action to
  actionValue?: any;                        // Value for the action (optional)
  actionConfig?: Record<string, any>;       // Additional configuration
}

// Conditional Logic Rule Document
export interface ConditionalLogicRule {
  // MongoDB ID
  id?: string;

  // Core Identification
  ruleName: string;                         // Human-readable rule name
  description?: string;                     // Detailed rule description

  // Simple Condition (Single Field - Backward Compatibility)
  triggerField?: string;                    // Field that triggers the rule (indexed)
  triggerValue?: string;                    // Value that triggers the rule
  triggerOperator?: ConditionOperator;      // Operator for trigger evaluation
  conditionType?: ConditionType;            // Type of condition (SHOW, HIDE, REQUIRE, etc.)
  affectedFields?: string[];                // List of fields affected by the condition

  // Advanced Conditions (Multi-Field)
  conditions?: ConditionExpression[];       // List of condition expressions
  logicalOperator?: LogicalOperator;        // Combines conditions (AND, OR)

  // Actions
  actions: RuleAction[];                    // List of actions to execute

  // Execution Control
  priority?: number;                        // Execution order (lower = higher priority)
  enabled: boolean;                         // Enable/disable flag (indexed)

  // Scope & Context
  applicableCategories?: string[];          // Product categories this rule applies to
  supportedChannels?: string[];             // Sales channels this rule applies to
  applicableUserRoles?: string[];           // User roles that see this rule's effect
  requiredPermissions?: string[];           // Permissions needed for rule to apply

  // Multi-tenancy
  organizationId?: string;                  // Organization-specific rules (indexed)
  tenantSpecific?: boolean;                 // Indicates tenant-specific rule

  // Metadata
  metadata?: Record<string, any>;           // Additional metadata
  tags?: string[];                          // Categorization tags
  version?: string;                         // Version tracking

  // Statistics
  executionCount?: number;                  // How many times rule triggered
  lastExecutedAt?: string;                  // Last trigger timestamp (ISO string)

  // Audit Trail
  createdAt?: string;                       // Creation timestamp (ISO string)
  updatedAt?: string;                       // Last update timestamp (ISO string)
  createdBy?: string;                       // Creator user ID
  updatedBy?: string;                       // Last updater user ID
}

// Statistics Response
export interface ConditionalLogicStats {
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  rulesByConditionType: Record<ConditionType, number>;
  rulesByCategory: Record<string, number>;
  totalExecutions: number;
  averageExecutionsPerRule: number;
}

// Create Rule Request
export interface CreateRuleRequest {
  ruleName: string;
  description?: string;
  triggerField?: string;
  triggerValue?: string;
  triggerOperator?: ConditionOperator;
  conditionType?: ConditionType;
  affectedFields?: string[];
  conditions?: ConditionExpression[];
  logicalOperator?: LogicalOperator;
  actions: RuleAction[];
  priority?: number;
  enabled?: boolean;
  applicableCategories?: string[];
  supportedChannels?: string[];
  applicableUserRoles?: string[];
  requiredPermissions?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

// Update Rule Request
export interface UpdateRuleRequest extends Partial<CreateRuleRequest> {
  // All fields from CreateRuleRequest are optional for updates
}

// Validate Rule Request
export interface ValidateRuleRequest {
  rule: CreateRuleRequest;
}

// Validate Rule Response
export interface ValidateRuleResponse {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// Rule Evaluation Context (for client-side evaluation)
export interface RuleEvaluationContext {
  formData: Record<string, any>;          // Current form field values
  category?: string;                      // Product category
  channels?: string[];                    // Target channels
  userRole?: string;                      // Current user role
  permissions?: string[];                 // User permissions
  organizationId?: string;                // Organization ID
}

// Rule Evaluation Result
export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  actionsExecuted: RuleAction[];
  error?: string;
}

// Field State (managed by rule engine)
export interface FieldState {
  visible: boolean;
  required: boolean;
  enabled: boolean;
  value?: any;
  options?: any[];
  classes: string[];
}
