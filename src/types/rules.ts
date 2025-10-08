/**
 * Comprehensive Business Rules Type System
 * Based on the Rules Implementation Architecture v4
 */

// Core Rule Types
export enum RuleType {
  PRE_PROCESSING = 'PRE_PROCESSING',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC', 
  DATA_ENHANCEMENT = 'DATA_ENHANCEMENT'
}

export enum RuleStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  TESTING = 'testing'
}

// Rule Execution Context
export interface RuleContext {
  userId?: string;
  requestId: string;
  timestamp: number;
  channel?: string;
  category?: string;
  environment: 'development' | 'testing' | 'production';
  metadata?: Record<string, unknown>;
}

// Rule Results
export interface RuleViolation {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  suggestedAction?: string;
}

export interface RuleWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

export interface RuleResult<T = unknown> {
  success: boolean;
  data?: T;
  violations: RuleViolation[];
  warnings: RuleWarning[];
  metadata?: Record<string, unknown>;
  executionTime?: number;
}

// Rule Configuration
export interface RuleConfiguration {
  ruleId: string;
  ruleType: RuleType;
  priority: number;
  enabled: boolean;
  applicableFields: string[];
  implementation: string;
  description: string;
  configuration: Record<string, unknown>;
  applicableCategories: string[];
  supportedChannels: string[];
}

// Business Rule Interface
export interface BusinessRule<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly type: RuleType;
  readonly priority: number;
  
  canApply(input: TInput, context: RuleContext): boolean;
  execute(input: TInput, context: RuleContext): Promise<RuleResult<TOutput>>;
  validate?(input: TInput, context: RuleContext): Promise<RuleResult<boolean>>;
  getConfiguration?(): Record<string, unknown>;
}

// Rules Engine Interface
export interface RulesEngine {
  registerRule<T extends BusinessRule>(rule: T): void;
  executeRules<TInput, TOutput>(
    input: TInput, 
    context: RuleContext, 
    ruleType?: RuleType
  ): Promise<RuleResult<TOutput>>;
  validateRules<TInput>(
    input: TInput, 
    context: RuleContext
  ): Promise<RuleResult<boolean>>;
  getRulesByType(ruleType: RuleType): BusinessRule[];
  getApplicableRules<TInput>(
    input: TInput, 
    context: RuleContext, 
    ruleType?: RuleType
  ): BusinessRule[];
}

// Product-specific Types
export interface ProductInput {
  id?: string;
  name?: string;
  description?: string;
  shortDescription?: string;
  sku?: string;
  price?: number;
  comparePrice?: number;
  brand?: string;
  category?: string;
  tags?: string[];
  images?: string[];
  attributes?: Record<string, unknown>;
  inventory?: {
    quantity?: number;
    tracked?: boolean;
  };
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
  channel?: string;
  [key: string]: unknown;
}

export interface ProductOutput extends ProductInput {
  id: string;
  sku: string;
  name: string;
  price: number;
  category: string;
  createdAt?: string;
  updatedAt?: string;
  validationScore?: number;
  enhancementApplied?: string[];
}

// Rule Execution Monitoring
export interface RuleExecutionStats {
  ruleId: string;
  executionCount: number;
  averageExecutionTime: number;
  successRate: number;
  lastExecuted: string;
  errorCount: number;
  warningCount: number;
}

export interface RuleExecutionMonitor {
  recordExecution(ruleId: string, executionTime: number, success: boolean): void;
  getStats(ruleId?: string): RuleExecutionStats[];
  resetStats(ruleId?: string): void;
}

// Rule Registry Types
export interface RuleRegistryEntry {
  ruleId: string;
  ruleType: RuleType;
  priority: number;
  enabled: boolean;
  applicableFields: string[];
  implementation: string;
  description: string;
  configuration: Record<string, unknown>;
  applicableCategories: string[];
  supportedChannels: string[];
}

export interface RuleRegistry {
  version: string;
  lastUpdated: string;
  rules: RuleRegistryEntry[];
}

// Advanced Rule Features
export interface ConditionalRule extends BusinessRule {
  conditions: RuleCondition[];
  executeWhen(input: unknown, context: RuleContext): boolean;
}

export interface RuleCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: unknown;
  logical?: 'AND' | 'OR';
}

// Rule Testing Support
export interface RuleTestCase {
  name: string;
  input: ProductInput;
  context: RuleContext;
  expectedOutput: Partial<ProductOutput>;
  expectedViolations?: RuleViolation[];
  expectedWarnings?: RuleWarning[];
}

export interface RuleTestResult {
  testCase: string;
  success: boolean;
  actualOutput?: ProductOutput;
  actualViolations?: RuleViolation[];
  actualWarnings?: RuleWarning[];
  differences?: string[];
  executionTime: number;
}