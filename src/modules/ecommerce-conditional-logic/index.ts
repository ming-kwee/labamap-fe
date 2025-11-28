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

// Components (will be added later)
// export { ConditionalLogicManager } from './components/ConditionalLogicManager';
// export { RuleBuilder } from './components/RuleBuilder';
// export { RulesList } from './components/RulesList';
