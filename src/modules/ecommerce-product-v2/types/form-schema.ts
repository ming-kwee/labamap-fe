/**
 * Dynamic Form Schema Types
 * Supporting business-governed form generation
 */

// Form Generation Context
export interface FormGenerationContext {
  userId: string;
  organizationId: string;
  userRole: 'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY';
  targetChannels: string[];
  productCategory?: string;
  permissions: string[];
  requestId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Form Field Types
export type FormFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'url'
  | 'tel'
  | 'password'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'datetime-local'
  | 'file'
  | 'image'
  | 'media'
  | 'color'
  | 'range'
  | 'variant-configurator'
  | 'channel-settings';

// Field Options
export interface FormFieldOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: string;
}

// Validation Rules
export interface FormFieldValidationRules {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  precision?: number;
  enum?: string[];
  maxItems?: number;
  customValidators?: string[];
  isVariantDimension?: boolean;
  variantFields?: string[];
}

// Conditional Visibility
export interface ConditionalVisibility {
  showWhen?: string;
  hideWhen?: string;
  requiredWhen?: string;
  disabledWhen?: string;
}

// Business Context
export interface FieldBusinessContext {
  businessOwner: string;
  technicalOwner?: string;
  lastModifiedBy: string;
  modificationReason?: string;
  requiresApproval: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  addedByRule?: string;
  categorySpecific?: boolean;
  channelSpecific?: boolean;
  version: number;
  variantDimension?: boolean;
}

// Field Display Levels for UI categorization
export type FieldDisplayLevel =
  | 'essential'
  | 'basic'
  | 'advanced'
  | 'optional'
  | 'category-specific';

// Form Field Definition
export interface FormField {
  fieldName: string;
  name?: string;
  fieldType: FormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: any;

  validationRules: FormFieldValidationRules;

  conditionalVisibility?: ConditionalVisibility;
  conditionalLogic?: {
    triggersFieldChanges?: string[];
    affectedByFields?: string[];
  };

  options?: FormFieldOption[];

  readOnly: boolean;
  hidden: boolean;
  required: boolean;
  multiple?: boolean;

  businessContext: FieldBusinessContext;

  group?: string;
  section?: string;
  displayLevel?: FieldDisplayLevel;
  order?: number;
  width?: 'full' | 'half' | 'third' | 'quarter';
  appearance?: Record<string, any>;

  variantScope?: 'dual' | 'variant_only' | null;
}

// Field Dependencies
export interface FieldDependency {
  triggerField: string;
  affectedFields: string[];
  logic: Record<string, {
    show?: string[];
    hide?: string[];
    require?: string[];
    recommend?: string[];
    optional?: string[];
  }>;
}

// Validation Dependencies
export interface ValidationDependency {
  field: string;
  dependsOn: string[];
  validationRules: Record<string, FormFieldValidationRules>;
}

// Form Logic
export interface FormLogic {
  fieldDependencies: FieldDependency[];
  validationDependencies: ValidationDependency[];
  globalValidations?: {
    expression: string;
    message: string;
    severity: 'error' | 'warning';
  }[];
}

// Governance Information
export interface FormGovernanceInfo {
  formGeneratedBy: string;
  attributesVersion: string;
  lastAttributeUpdate: string;
  businessApprovals: {
    field: string;
    approvedBy: string;
    approvedAt: string;
    notes?: string;
  }[];
  pendingApprovals: {
    field: string;
    requestedBy: string;
    requestedAt: string;
    reason: string;
  }[];
  changeLog: {
    timestamp: string;
    changedBy: string;
    changeType: 'FIELD_ADDED' | 'FIELD_MODIFIED' | 'FIELD_REMOVED' | 'VALIDATION_CHANGED';
    fieldName: string;
    oldValue?: any;
    newValue?: any;
    reason: string;
  }[];
}

// Section structure for organizing fields
export interface FormSection {
  key: string;
  label: string;
  description?: string;
  fields: FormField[];
  order?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

// Dynamic Form Schema
export interface DynamicFormSchema {
  title: string;
  description: string;
  version: string;
  generatedAt: string;
  generatedFor: {
    userId: string;
    organizationId: string;
    userRole: string;
    permissions: string[];
  };

  fields?: FormField[];
  sections?: FormSection[];

  conditionalLogic?: FormLogic;
  governanceInfo?: FormGovernanceInfo;

  metadata?: {
    estimatedCompletionTime?: number;
    complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
    fieldCount: number;
    requiredFieldCount: number;
    conditionalFieldCount: number;
    formStage?: 'essential' | 'category-specific';
    variantScopedFields?: string[] | null;
    variantDimensions?: string[] | null;
  };
}

// Form Schema Request
export interface FormSchemaRequest {
  context: {
    userId?: string;
    organizationId?: string;
    userRole?: string;
    targetChannels?: string[];
    productCategory?: string;
    permissions?: string[];
  };
}

// Form Schema Response
export interface FormSchemaResponse {
  success: boolean;
  formSchema: DynamicFormSchema;
  metadata: {
    generatedAt: string;
    generatedFor: FormGenerationContext;
    schemaVersion: string;
  };
  error?: string;
  details?: string;
}

// Form Data
export interface DynamicFormData {
  [fieldName: string]: any;
}

// Form Validation Result
export interface FormValidationResult {
  isValid: boolean;
  fieldErrors: Record<string, string[]>;
  globalErrors: string[];
  warnings: string[];
}

// Enhanced Validation Types
export interface ValidationViolation {
  ruleId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  affectedFields: string[];
  violationType: 'BUSINESS_RULE' | 'FIELD_VALIDATION' | 'SCHEMA_VALIDATION';
  suggestion?: string;
}

export interface ValidationWarning {
  ruleId: string;
  message: string;
  affectedFields: string[];
  suggestion?: string;
}

export interface EnhancedValidationResult {
  valid: boolean;
  message: string;
  violations: ValidationViolation[];
  warnings: ValidationWarning[];
  rulesExecuted: number;
  executionTimeMs: number;
  validationScore: number;
  canSubmit: boolean;
}
