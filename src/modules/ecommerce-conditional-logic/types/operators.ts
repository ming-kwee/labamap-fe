/**
 * Operators for conditional logic rules
 */

// Comparison operators
export type ComparisonOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL';

// String operators
export type StringOperator =
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'REGEX';

// Existence operators
export type ExistenceOperator =
  | 'IS_NULL'
  | 'IS_NOT_NULL'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY';

// Set operators
export type SetOperator =
  | 'IN'
  | 'NOT_IN';

// All operators
export type ConditionOperator =
  | ComparisonOperator
  | StringOperator
  | ExistenceOperator
  | SetOperator;

// Data types for condition evaluation
export type DataType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE';

// Logical operators for combining multiple conditions
export type LogicalOperator = 'AND' | 'OR';

// Action types
export type ActionType =
  // Visibility
  | 'SHOW_FIELD'
  | 'HIDE_FIELD'
  // Requirement
  | 'REQUIRE_FIELD'
  | 'OPTIONAL_FIELD'
  // State
  | 'ENABLE_FIELD'
  | 'DISABLE_FIELD'
  // Value
  | 'SET_VALUE'
  | 'CLEAR_VALUE'
  // Options
  | 'SET_OPTIONS'
  | 'FILTER_OPTIONS'
  // Validation
  | 'VALIDATE_FIELD'
  | 'SKIP_VALIDATION'
  // Styling
  | 'ADD_CLASS'
  | 'REMOVE_CLASS';

// Condition types (for simple trigger-based rules)
export type ConditionType =
  | 'SHOW'
  | 'HIDE'
  | 'REQUIRE'
  | 'OPTIONAL'
  | 'VALIDATE'
  | 'TRANSFORM';

// Operator metadata for UI
export interface OperatorMetadata {
  value: ConditionOperator;
  label: string;
  description: string;
  category: 'comparison' | 'string' | 'existence' | 'set';
  compatibleTypes: DataType[];
  requiresValue: boolean;
}

// Operator definitions with metadata
export const OPERATORS: Record<ConditionOperator, OperatorMetadata> = {
  // Comparison
  EQUALS: {
    value: 'EQUALS',
    label: 'Equals',
    description: 'Value equals the specified value',
    category: 'comparison',
    compatibleTypes: ['STRING', 'NUMBER', 'BOOLEAN', 'DATE'],
    requiresValue: true
  },
  NOT_EQUALS: {
    value: 'NOT_EQUALS',
    label: 'Not Equals',
    description: 'Value does not equal the specified value',
    category: 'comparison',
    compatibleTypes: ['STRING', 'NUMBER', 'BOOLEAN', 'DATE'],
    requiresValue: true
  },
  GREATER_THAN: {
    value: 'GREATER_THAN',
    label: 'Greater Than',
    description: 'Value is greater than the specified value',
    category: 'comparison',
    compatibleTypes: ['NUMBER', 'DATE'],
    requiresValue: true
  },
  LESS_THAN: {
    value: 'LESS_THAN',
    label: 'Less Than',
    description: 'Value is less than the specified value',
    category: 'comparison',
    compatibleTypes: ['NUMBER', 'DATE'],
    requiresValue: true
  },
  GREATER_THAN_OR_EQUAL: {
    value: 'GREATER_THAN_OR_EQUAL',
    label: 'Greater Than or Equal',
    description: 'Value is greater than or equal to the specified value',
    category: 'comparison',
    compatibleTypes: ['NUMBER', 'DATE'],
    requiresValue: true
  },
  LESS_THAN_OR_EQUAL: {
    value: 'LESS_THAN_OR_EQUAL',
    label: 'Less Than or Equal',
    description: 'Value is less than or equal to the specified value',
    category: 'comparison',
    compatibleTypes: ['NUMBER', 'DATE'],
    requiresValue: true
  },

  // String
  CONTAINS: {
    value: 'CONTAINS',
    label: 'Contains',
    description: 'Text contains the specified substring',
    category: 'string',
    compatibleTypes: ['STRING'],
    requiresValue: true
  },
  NOT_CONTAINS: {
    value: 'NOT_CONTAINS',
    label: 'Does Not Contain',
    description: 'Text does not contain the specified substring',
    category: 'string',
    compatibleTypes: ['STRING'],
    requiresValue: true
  },
  STARTS_WITH: {
    value: 'STARTS_WITH',
    label: 'Starts With',
    description: 'Text starts with the specified prefix',
    category: 'string',
    compatibleTypes: ['STRING'],
    requiresValue: true
  },
  ENDS_WITH: {
    value: 'ENDS_WITH',
    label: 'Ends With',
    description: 'Text ends with the specified suffix',
    category: 'string',
    compatibleTypes: ['STRING'],
    requiresValue: true
  },
  REGEX: {
    value: 'REGEX',
    label: 'Matches Regex',
    description: 'Text matches the specified regular expression',
    category: 'string',
    compatibleTypes: ['STRING'],
    requiresValue: true
  },

  // Existence
  IS_NULL: {
    value: 'IS_NULL',
    label: 'Is Null',
    description: 'Value is null or undefined',
    category: 'existence',
    compatibleTypes: ['STRING', 'NUMBER', 'BOOLEAN', 'DATE'],
    requiresValue: false
  },
  IS_NOT_NULL: {
    value: 'IS_NOT_NULL',
    label: 'Is Not Null',
    description: 'Value is not null or undefined',
    category: 'existence',
    compatibleTypes: ['STRING', 'NUMBER', 'BOOLEAN', 'DATE'],
    requiresValue: false
  },
  IS_EMPTY: {
    value: 'IS_EMPTY',
    label: 'Is Empty',
    description: 'Value is empty (null, undefined, or empty string)',
    category: 'existence',
    compatibleTypes: ['STRING'],
    requiresValue: false
  },
  IS_NOT_EMPTY: {
    value: 'IS_NOT_EMPTY',
    label: 'Is Not Empty',
    description: 'Value is not empty',
    category: 'existence',
    compatibleTypes: ['STRING'],
    requiresValue: false
  },

  // Set
  IN: {
    value: 'IN',
    label: 'In List',
    description: 'Value is in the specified list',
    category: 'set',
    compatibleTypes: ['STRING', 'NUMBER'],
    requiresValue: true
  },
  NOT_IN: {
    value: 'NOT_IN',
    label: 'Not In List',
    description: 'Value is not in the specified list',
    category: 'set',
    compatibleTypes: ['STRING', 'NUMBER'],
    requiresValue: true
  }
};

// Action metadata for UI
export interface ActionMetadata {
  value: ActionType;
  label: string;
  description: string;
  category: 'visibility' | 'requirement' | 'state' | 'value' | 'options' | 'validation' | 'styling';
  requiresValue: boolean;
  requiresConfig: boolean;
}

// Action definitions with metadata
export const ACTIONS: Record<ActionType, ActionMetadata> = {
  // Visibility
  SHOW_FIELD: {
    value: 'SHOW_FIELD',
    label: 'Show Field',
    description: 'Make field visible',
    category: 'visibility',
    requiresValue: false,
    requiresConfig: false
  },
  HIDE_FIELD: {
    value: 'HIDE_FIELD',
    label: 'Hide Field',
    description: 'Hide field from view',
    category: 'visibility',
    requiresValue: false,
    requiresConfig: false
  },

  // Requirement
  REQUIRE_FIELD: {
    value: 'REQUIRE_FIELD',
    label: 'Make Required',
    description: 'Make field required',
    category: 'requirement',
    requiresValue: false,
    requiresConfig: false
  },
  OPTIONAL_FIELD: {
    value: 'OPTIONAL_FIELD',
    label: 'Make Optional',
    description: 'Make field optional',
    category: 'requirement',
    requiresValue: false,
    requiresConfig: false
  },

  // State
  ENABLE_FIELD: {
    value: 'ENABLE_FIELD',
    label: 'Enable Field',
    description: 'Enable field for input',
    category: 'state',
    requiresValue: false,
    requiresConfig: false
  },
  DISABLE_FIELD: {
    value: 'DISABLE_FIELD',
    label: 'Disable Field',
    description: 'Disable field (read-only)',
    category: 'state',
    requiresValue: false,
    requiresConfig: false
  },

  // Value
  SET_VALUE: {
    value: 'SET_VALUE',
    label: 'Set Value',
    description: 'Set field to a specific value',
    category: 'value',
    requiresValue: true,
    requiresConfig: false
  },
  CLEAR_VALUE: {
    value: 'CLEAR_VALUE',
    label: 'Clear Value',
    description: 'Clear field value',
    category: 'value',
    requiresValue: false,
    requiresConfig: false
  },

  // Options
  SET_OPTIONS: {
    value: 'SET_OPTIONS',
    label: 'Set Options',
    description: 'Set dropdown options',
    category: 'options',
    requiresValue: true,
    requiresConfig: false
  },
  FILTER_OPTIONS: {
    value: 'FILTER_OPTIONS',
    label: 'Filter Options',
    description: 'Filter dropdown options based on another field',
    category: 'options',
    requiresValue: false,
    requiresConfig: true
  },

  // Validation
  VALIDATE_FIELD: {
    value: 'VALIDATE_FIELD',
    label: 'Validate Field',
    description: 'Trigger field validation',
    category: 'validation',
    requiresValue: false,
    requiresConfig: false
  },
  SKIP_VALIDATION: {
    value: 'SKIP_VALIDATION',
    label: 'Skip Validation',
    description: 'Skip field validation',
    category: 'validation',
    requiresValue: false,
    requiresConfig: false
  },

  // Styling
  ADD_CLASS: {
    value: 'ADD_CLASS',
    label: 'Add CSS Class',
    description: 'Add CSS class to field',
    category: 'styling',
    requiresValue: false,
    requiresConfig: true
  },
  REMOVE_CLASS: {
    value: 'REMOVE_CLASS',
    label: 'Remove CSS Class',
    description: 'Remove CSS class from field',
    category: 'styling',
    requiresValue: false,
    requiresConfig: true
  }
};

// Helper functions
export const getOperatorsByCategory = (category: 'comparison' | 'string' | 'existence' | 'set'): OperatorMetadata[] => {
  return Object.values(OPERATORS).filter(op => op.category === category);
};

export const getOperatorsByDataType = (dataType: DataType): OperatorMetadata[] => {
  return Object.values(OPERATORS).filter(op => op.compatibleTypes.includes(dataType));
};

export const getActionsByCategory = (category: ActionMetadata['category']): ActionMetadata[] => {
  return Object.values(ACTIONS).filter(action => action.category === category);
};
