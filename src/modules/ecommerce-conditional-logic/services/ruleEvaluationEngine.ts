/**
 * Rule Evaluation Engine
 * Client-side evaluation and execution of conditional logic rules
 */

import {
  ConditionalLogicRule,
  ConditionExpression,
  RuleAction,
  RuleEvaluationContext,
  RuleEvaluationResult,
  FieldState
} from '../types/conditionalLogic';
import { ConditionOperator } from '../types/operators';

export class RuleEvaluationEngine {
  private rules: ConditionalLogicRule[] = [];
  private fieldStates: Map<string, FieldState> = new Map();
  private evaluationCallbacks: Map<string, Set<(state: FieldState) => void>> = new Map();

  /**
   * Initialize the engine with rules
   */
  async loadRules(rules: ConditionalLogicRule[]) {
    this.rules = rules.filter(rule => rule.enabled).sort((a, b) => (a.priority || 100) - (b.priority || 100));
    console.log(`[RuleEvaluationEngine] Loaded ${this.rules.length} enabled rules`);
  }

  /**
   * Subscribe to field state changes
   */
  subscribe(fieldName: string, callback: (state: FieldState) => void) {
    if (!this.evaluationCallbacks.has(fieldName)) {
      this.evaluationCallbacks.set(fieldName, new Set());
    }
    this.evaluationCallbacks.get(fieldName)!.add(callback);
  }

  /**
   * Unsubscribe from field state changes
   */
  unsubscribe(fieldName: string, callback: (state: FieldState) => void) {
    this.evaluationCallbacks.get(fieldName)?.delete(callback);
  }

  /**
   * Notify subscribers of field state changes
   */
  private notifySubscribers(fieldName: string, state: FieldState) {
    this.evaluationCallbacks.get(fieldName)?.forEach(callback => callback(state));
  }

  /**
   * Get current field state
   */
  getFieldState(fieldName: string): FieldState {
    return this.fieldStates.get(fieldName) || {
      visible: true,
      required: false,
      enabled: true,
      classes: []
    };
  }

  /**
   * Update field state
   */
  private updateFieldState(fieldName: string, updates: Partial<FieldState>) {
    const currentState = this.getFieldState(fieldName);
    const newState = { ...currentState, ...updates };
    this.fieldStates.set(fieldName, newState);
    this.notifySubscribers(fieldName, newState);
  }

  /**
   * Evaluate a single condition expression
   */
  private evaluateCondition(condition: ConditionExpression, formData: Record<string, any>): boolean {
    const fieldValue = formData[condition.field];
    const expectedValue = condition.value;
    const operator = condition.operator;

    try {
      switch (operator) {
        // Equality
        case 'EQUALS':
          return fieldValue == expectedValue;
        case 'NOT_EQUALS':
          return fieldValue != expectedValue;

        // Comparison
        case 'GREATER_THAN':
          return parseFloat(fieldValue) > parseFloat(expectedValue);
        case 'LESS_THAN':
          return parseFloat(fieldValue) < parseFloat(expectedValue);
        case 'GREATER_THAN_OR_EQUAL':
          return parseFloat(fieldValue) >= parseFloat(expectedValue);
        case 'LESS_THAN_OR_EQUAL':
          return parseFloat(fieldValue) <= parseFloat(expectedValue);

        // String operations
        case 'CONTAINS':
          return String(fieldValue).toLowerCase().includes(String(expectedValue).toLowerCase());
        case 'NOT_CONTAINS':
          return !String(fieldValue).toLowerCase().includes(String(expectedValue).toLowerCase());
        case 'STARTS_WITH':
          return String(fieldValue).toLowerCase().startsWith(String(expectedValue).toLowerCase());
        case 'ENDS_WITH':
          return String(fieldValue).toLowerCase().endsWith(String(expectedValue).toLowerCase());
        case 'REGEX':
          return new RegExp(expectedValue).test(String(fieldValue));

        // Existence
        case 'IS_NULL':
          return fieldValue == null || fieldValue === undefined;
        case 'IS_NOT_NULL':
          return fieldValue != null && fieldValue !== undefined;
        case 'IS_EMPTY':
          return fieldValue == null || fieldValue === undefined || String(fieldValue).trim() === '';
        case 'IS_NOT_EMPTY':
          return fieldValue != null && fieldValue !== undefined && String(fieldValue).trim() !== '';

        // Set operations
        case 'IN':
          return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
        case 'NOT_IN':
          return Array.isArray(expectedValue) && !expectedValue.includes(fieldValue);

        default:
          console.warn(`[RuleEvaluationEngine] Unknown operator: ${operator}`);
          return false;
      }
    } catch (error) {
      console.error(`[RuleEvaluationEngine] Error evaluating condition:`, error);
      return false;
    }
  }

  /**
   * Evaluate a rule's conditions
   */
  private evaluateRule(rule: ConditionalLogicRule, context: RuleEvaluationContext): boolean {
    const { formData } = context;

    // Simple trigger-based rule (backward compatibility)
    if (rule.triggerField && !rule.conditions) {
      const condition: ConditionExpression = {
        field: rule.triggerField,
        operator: rule.triggerOperator || 'EQUALS',
        value: rule.triggerValue,
        dataType: 'STRING'
      };
      return this.evaluateCondition(condition, formData);
    }

    // Complex conditions-based rule
    if (rule.conditions && rule.conditions.length > 0) {
      const results = rule.conditions.map(cond => this.evaluateCondition(cond, formData));

      if (rule.logicalOperator === 'OR') {
        return results.some(r => r === true);
      } else {
        // Default to AND
        return results.every(r => r === true);
      }
    }

    // No conditions defined - rule is always triggered
    console.warn(`[RuleEvaluationEngine] Rule "${rule.ruleName}" has no conditions`);
    return false;
  }

  /**
   * Execute actions for a rule
   */
  private executeActions(actions: RuleAction[]): void {
    actions.forEach(action => {
      const { actionType, targetField, actionValue, actionConfig } = action;

      const currentState = this.getFieldState(targetField);

      switch (actionType) {
        // Visibility
        case 'SHOW_FIELD':
          this.updateFieldState(targetField, { visible: true });
          break;
        case 'HIDE_FIELD':
          this.updateFieldState(targetField, { visible: false });
          break;

        // Requirement
        case 'REQUIRE_FIELD':
          this.updateFieldState(targetField, { required: true });
          break;
        case 'OPTIONAL_FIELD':
          this.updateFieldState(targetField, { required: false });
          break;

        // State
        case 'ENABLE_FIELD':
          this.updateFieldState(targetField, { enabled: true });
          break;
        case 'DISABLE_FIELD':
          this.updateFieldState(targetField, { enabled: false });
          break;

        // Value
        case 'SET_VALUE':
          this.updateFieldState(targetField, { value: actionValue });
          break;
        case 'CLEAR_VALUE':
          this.updateFieldState(targetField, { value: undefined });
          break;

        // Options
        case 'SET_OPTIONS':
          this.updateFieldState(targetField, { options: actionValue });
          break;
        case 'FILTER_OPTIONS':
          // Filtering logic would be handled by the consuming component
          console.log(`[RuleEvaluationEngine] FILTER_OPTIONS for ${targetField}`, actionConfig);
          break;

        // Styling
        case 'ADD_CLASS':
          if (actionConfig?.className) {
            const classes = [...currentState.classes];
            if (!classes.includes(actionConfig.className)) {
              classes.push(actionConfig.className);
              this.updateFieldState(targetField, { classes });
            }
          }
          break;
        case 'REMOVE_CLASS':
          if (actionConfig?.className) {
            const classes = currentState.classes.filter(c => c !== actionConfig.className);
            this.updateFieldState(targetField, { classes });
          }
          break;

        // Validation
        case 'VALIDATE_FIELD':
        case 'SKIP_VALIDATION':
          // Validation would be handled by the form validation system
          console.log(`[RuleEvaluationEngine] ${actionType} for ${targetField}`);
          break;

        default:
          console.warn(`[RuleEvaluationEngine] Unknown action type: ${actionType}`);
      }
    });
  }

  /**
   * Evaluate all rules for current context
   */
  evaluateAllRules(context: RuleEvaluationContext): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];

    this.rules.forEach(rule => {
      try {
        const triggered = this.evaluateRule(rule, context);

        if (triggered && rule.actions) {
          this.executeActions(rule.actions);

          results.push({
            ruleId: rule.id || '',
            ruleName: rule.ruleName,
            triggered: true,
            actionsExecuted: rule.actions
          });

          console.log(`[RuleEvaluationEngine] Rule triggered: "${rule.ruleName}"`);
        }
      } catch (error) {
        console.error(`[RuleEvaluationEngine] Error evaluating rule "${rule.ruleName}":`, error);
        results.push({
          ruleId: rule.id || '',
          ruleName: rule.ruleName,
          triggered: false,
          actionsExecuted: [],
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    return results;
  }

  /**
   * Handle field change and re-evaluate rules
   */
  onFieldChange(fieldName: string, value: any, context: RuleEvaluationContext): RuleEvaluationResult[] {
    // Update form data in context
    const updatedContext: RuleEvaluationContext = {
      ...context,
      formData: {
        ...context.formData,
        [fieldName]: value
      }
    };

    console.log(`[RuleEvaluationEngine] Field changed: ${fieldName} = ${value}`);

    // Re-evaluate all rules with updated context
    return this.evaluateAllRules(updatedContext);
  }

  /**
   * Reset all field states
   */
  reset() {
    this.fieldStates.clear();
    console.log('[RuleEvaluationEngine] Field states reset');
  }

  /**
   * Get evaluation summary
   */
  getSummary(): {
    totalRules: number;
    fieldStates: number;
    subscribers: number;
  } {
    let totalSubscribers = 0;
    this.evaluationCallbacks.forEach(callbacks => {
      totalSubscribers += callbacks.size;
    });

    return {
      totalRules: this.rules.length,
      fieldStates: this.fieldStates.size,
      subscribers: totalSubscribers
    };
  }
}

// Singleton instance
let engineInstance: RuleEvaluationEngine | null = null;

export const getRuleEvaluationEngine = (): RuleEvaluationEngine => {
  if (!engineInstance) {
    engineInstance = new RuleEvaluationEngine();
  }
  return engineInstance;
};

export default RuleEvaluationEngine;
