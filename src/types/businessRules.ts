/**
 * Business Rules Type Definitions
 * Based on backend BusinessRuleDocument.java and MongoDB collection structure
 */

export type RuleType = 'PRE_PROCESSING' | 'BUSINESS_LOGIC' | 'DATA_ENHANCEMENT';

export type ValidationOperator =
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL'
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'LENGTH_BETWEEN'
  | 'REGEX'
  | 'NOT_REGEX'
  | 'REQUIRED'
  | 'NOT_NULL'
  | 'IN'
  | 'NOT_IN'
  | 'CONTAINS'
  | 'NOT_CONTAINS';

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type TransformationType =
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'CAPITALIZE'
  | 'TRIM'
  | 'TRIM_START'
  | 'TRIM_END'
  | 'ROUND'
  | 'FORMAT_DATE'
  | 'REMOVE_SPECIAL_CHARS'
  | 'REPLACE'
  | 'CONCATENATE';

export type EnhancementType =
  | 'AUTO_GENERATE_TAGS'
  | 'ADD_CATEGORY_HIERARCHY'
  | 'ENRICH_FROM_BARCODE'
  | 'SUGGEST_PRICING'
  | 'IMAGE_ANALYSIS'
  | 'SEO_OPTIMIZATION';

export interface ValidationRule {
  field: string;
  operator: ValidationOperator;
  value?: any;
  message: string;
  severity: ValidationSeverity;
  errorCode?: string;
}

export interface TransformationRule {
  field: string;
  transformation: TransformationType;
  order: number;
  parameters?: Record<string, any>;
}

export interface EnhancementRule {
  field: string;
  enhancement: EnhancementType;
  source?: string;
  parameters?: Record<string, any>;
}

export interface BusinessRule {
  // MongoDB ID
  id?: string;

  // Identification
  ruleId: string;
  ruleName: string;
  ruleDescription?: string;
  ruleType: RuleType;
  description?: string; // Legacy field name from backend
  implementation?: string; // Backend-specific implementation class

  // Status & Priority
  enabled: boolean;
  priority: number;

  // Backend Configuration
  configuration?: Record<string, any>; // Backend-specific configuration object

  // Rule Definitions
  validationRules?: ValidationRule[];
  transformationRules?: TransformationRule[];
  enhancementRules?: EnhancementRule[];

  // Applicability
  applicableFields?: string[];
  applicableCategories?: string[];
  supportedChannels?: string[];

  // Configuration
  errorMessage?: string;
  warningMessage?: string;
  allowOverride?: boolean;

  // Performance & SLA
  isCritical?: boolean;
  executionTimeoutMs?: number;
  performanceThresholdMs?: number;

  // Multi-tenancy
  organizationId?: string;
  tenantSpecific?: boolean;

  // Metadata
  metadata?: Record<string, any>;
  tags?: string[];
  version?: string;
  author?: string;

  // Statistics (auto-tracked)
  executionCount?: number;
  successCount?: number;
  failureCount?: number;
  avgExecutionTimeMs?: number;
  lastExecutedAt?: string;

  // Audit Trail
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface RuleStatistics {
  totalRules: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTimeMs: number;
}

export interface BusinessRulesResponse {
  success: boolean;
  message?: string;
  rule?: BusinessRule;
  rules?: BusinessRule[];
  count?: number;
  statistics?: RuleStatistics;
  enabled?: boolean;
}

export interface RuleFilter {
  type?: RuleType;
  fields?: string[];
  categories?: string[];
  channels?: string[];
  enabled?: boolean;
  search?: string;
}

// Request payload for creating a new rule (clean data only, no metadata)
export interface CreateRuleRequest {
  ruleId: string;
  ruleName: string;
  ruleDescription?: string;
  ruleType: RuleType;
  priority: number;
  enabled: boolean;
  validationRules?: ValidationRule[];
  transformationRules?: TransformationRule[];
  enhancementRules?: EnhancementRule[];
  applicableFields?: string[];
  applicableCategories?: string[];
  supportedChannels?: string[];
  isCritical?: boolean;
  executionTimeoutMs?: number;
  tags?: string[];
}

// Request payload for updating an existing rule (same as create, backend handles metadata)
export interface UpdateRuleRequest {
  ruleId: string;
  ruleName: string;
  ruleDescription?: string;
  ruleType: RuleType;
  priority: number;
  enabled: boolean;
  validationRules?: ValidationRule[];
  transformationRules?: TransformationRule[];
  enhancementRules?: EnhancementRule[];
  applicableFields?: string[];
  applicableCategories?: string[];
  supportedChannels?: string[];
  isCritical?: boolean;
  executionTimeoutMs?: number;
  tags?: string[];
}
