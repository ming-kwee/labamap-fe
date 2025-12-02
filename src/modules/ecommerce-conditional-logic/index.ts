/**
 * Conditional Logic Module - Barrel Export
 * Dynamic form behavior based on field values
 */

// Services
export { ConditionalLogicService } from './services/conditionalLogicService';
export { RuleEvaluationEngine, getRuleEvaluationEngine } from './services/ruleEvaluationEngine';

// Hooks
export { useConditionalLogic } from './hooks/useConditionalLogic';
export type { UseConditionalLogicOptions, UseConditionalLogicReturn } from './hooks/useConditionalLogic';

// Types
export type {
  ConditionalLogicRule,
  ConditionExpression,
  RuleAction,
  ConditionalLogicStats,
  CreateRuleRequest,
  UpdateRuleRequest,
  ValidateRuleRequest,
  ValidateRuleResponse,
  RuleEvaluationContext,
  RuleEvaluationResult,
  FieldState
} from './types/conditionalLogic';

export type {
  ConditionOperator,
  ComparisonOperator,
  StringOperator,
  ExistenceOperator,
  SetOperator,
  DataType,
  LogicalOperator,
  ActionType,
  ConditionType,
  OperatorMetadata,
  ActionMetadata
} from './types/operators';

export {
  OPERATORS,
  ACTIONS,
  getOperatorsByCategory,
  getOperatorsByDataType,
  getActionsByCategory
} from './types/operators';

// Components
export { default as ConditionalLogicManager } from './components/ConditionalLogicManager';
export { default as RuleBuilder } from './components/RuleBuilder';
