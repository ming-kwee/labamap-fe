/**
 * Dynamic Form Generation Types
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
  maxItems?: number; // For array fields like images
  customValidators?: string[];
  isVariantDimension?: boolean; // Marks field as variant dimension
  variantFields?: string[]; // For variant configurator fields
}

// Conditional Visibility
export interface ConditionalVisibility {
  showWhen?: string;  // JavaScript expression
  hideWhen?: string;  // JavaScript expression
  requiredWhen?: string;  // JavaScript expression
  disabledWhen?: string;  // JavaScript expression
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
  variantDimension?: boolean; // Marks field as variant dimension
}

// Form Field Definition
export interface FormField {
  fieldName: string;
  name?: string; // Backend compatibility - fields can have either fieldName or name
  fieldType: FormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: any;
  
  // Validation
  validationRules: FormFieldValidationRules;
  
  // Conditional Logic
  conditionalVisibility?: ConditionalVisibility;
  conditionalLogic?: {
    triggersFieldChanges?: string[];
    affectedByFields?: string[];
  };
  
  // Options (for select/radio fields)
  options?: FormFieldOption[];
  
  // Permissions and State
  readOnly: boolean;
  hidden: boolean;
  required: boolean;
  
  // Business Context
  businessContext: FieldBusinessContext;
  
  // UI Hints
  group?: string;
  order?: number;
  width?: 'full' | 'half' | 'third' | 'quarter';
  appearance?: Record<string, any>;
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
  
  // Form Structure
  fields: FormField[];
  groups?: {
    groupName: string;
    label: string;
    description?: string;
    fields: string[];
    collapsible?: boolean;
    defaultExpanded?: boolean;
  }[];
  
  // Form Logic
  conditionalLogic: FormLogic;
  
  // Business Governance
  governanceInfo: FormGovernanceInfo;
  
  // Metadata
  metadata: {
    estimatedCompletionTime?: number;
    complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
    fieldCount: number;
    requiredFieldCount: number;
    conditionalFieldCount: number;
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

// Dynamic Form Props
export interface DynamicFormProps {
  schema: DynamicFormSchema;
  data?: DynamicFormData;
  onChange?: (data: DynamicFormData) => void;
  onSubmit?: (data: DynamicFormData) => void;
  onValidate?: (result: FormValidationResult) => void;
  className?: string;
  disabled?: boolean;
  showBusinessContext?: boolean;
  showGovernanceInfo?: boolean;
}

// Form Generation Options
export interface FormGenerationOptions {
  includeHiddenFields?: boolean;
  includeBusinessContext?: boolean;
  includeGovernanceInfo?: boolean;
  applyUserPermissions?: boolean;
  optimizeForChannel?: string[];
  optimizeForCategory?: string;
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