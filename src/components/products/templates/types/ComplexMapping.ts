// Complex Field Mapping Types and Interfaces

export type MappingType = 
  | 'simple'           // 1:1 direct mapping
  | 'many-to-one'      // Multiple fields → Single field (concatenation)
  | 'one-to-many'      // Single field → Multiple fields (decomposition)
  | 'conditional'      // Conditional mapping based on rules
  | 'computed'         // Computed from multiple fields with formula
  | 'structural'       // Transform data structure (array, object)
  | 'templated';       // Template-based transformation

export type DataType = 
  | 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'html' | 'json' | 'currency';

export type OperatorType = 
  | 'concat' | 'add' | 'subtract' | 'multiply' | 'divide'
  | 'equals' | 'not_equals' | 'greater_than' | 'less_than'
  | 'contains' | 'starts_with' | 'ends_with' | 'regex'
  | 'length' | 'uppercase' | 'lowercase' | 'trim'
  | 'split' | 'join' | 'replace' | 'format';

// Base Complex Mapping Interface
export interface ComplexFieldMapping {
  id: string;
  name: string;
  type: MappingType;
  description?: string;
  priority: number;
  enabled: boolean;
  
  // Source fields (master data)
  sourceFields: SourceField[];
  
  // Target field (channel-specific)
  targetField: TargetField;
  
  // Transformation configuration
  transformation: TransformationConfig;
  
  // Validation rules
  validation?: ValidationConfig;
  
  // Testing and preview
  testCases?: TestCase[];
}

// Source Field Configuration
export interface SourceField {
  fieldPath: string;        // e.g., 'masterAttributes.brand', 'variantData.price'
  displayName: string;
  dataType: DataType;
  required: boolean;
  defaultValue?: unknown;
  
  // Field processing options
  preprocessing?: PreprocessingRule[];
}

// Target Field Configuration  
export interface TargetField {
  channelId: string;
  fieldPath: string;        // e.g., 'title', 'bulletPoints[0]', 'dimensions.length'
  displayName: string;
  dataType: DataType;
  maxLength?: number;
  format?: string;
  required: boolean;
  
  // Post-processing options
  postprocessing?: PostprocessingRule[];
}

// Transformation Configuration
export interface TransformationConfig {
  type: MappingType;
  
  // Many-to-One (Concatenation)
  concatenation?: ConcatenationConfig;
  
  // One-to-Many (Decomposition)  
  decomposition?: DecompositionConfig;
  
  // Conditional Mapping
  conditional?: ConditionalConfig;
  
  // Computed Fields
  computation?: ComputationConfig;
  
  // Structural Transformation
  structural?: StructuralConfig;
  
  // Template-based
  template?: TemplateConfig;
}

// Concatenation Configuration (Many-to-One)
export interface ConcatenationConfig {
  fields: ConcatenationField[];
  separator?: string;
  template?: string;        // e.g., "{brand} - {name} ({model})"
  outputFormat?: 'plain' | 'html' | 'markdown';
  maxLength?: number;
  truncateMethod?: 'end' | 'middle' | 'start' | 'smart';
  truncateIndicator?: string;
  
  // Advanced features for real-world scenarios
  fallbackTemplate?: string;    // Template when main exceeds max length
  validation?: ConcatenationValidation;
  wordBoundaryTruncation?: boolean;
}

export interface ConcatenationValidation {
  requiredFields: string[];         // Fields that must exist
  forbiddenWords: string[];         // Words that will cause validation to fail
  forbiddenPatterns?: string[];     // Regex patterns to avoid
  minLength?: number;
  customRules?: ValidationRule[];
}

export interface ConcatenationField {
  sourceField: string;
  prefix?: string;
  suffix?: string;
  transform?: string;       // 'uppercase', 'lowercase', 'capitalize'
  required?: boolean;
  fallback?: string;
}

// Decomposition Configuration (One-to-Many)
export interface DecompositionConfig {
  sourceField: string;
  targets: DecompositionTarget[];
  method: 'split' | 'extract' | 'parse' | 'regex' | 'object_properties';
  
  // Split method
  delimiter?: string;
  
  // Extract method
  extractionRules?: ExtractionRule[];
  
  // Parse method (for structured data)
  parseFormat?: 'json' | 'xml' | 'csv' | 'dimensions' | 'custom';
  
  // Regex method
  regexPattern?: string;
  regexGroups?: string[];
  
  // Object properties method (new for real-world scenarios)
  objectMapping?: ObjectPropertyMapping;
  
  // Unit conversion and transformations
  transformations?: FieldTransformation[];
}

export interface ObjectPropertyMapping {
  properties: {
    [sourceProperty: string]: string;  // source property -> target field
  };
  preserveStructure?: boolean;
}

export interface FieldTransformation {
  targetField: string;
  transformation: 'unit_conversion' | 'format_change' | 'computation';
  parameters: {
    from?: string;
    to?: string;
    formula?: string;
    condition?: string;
  };
}

export interface DecompositionTarget {
  targetField: string;
  index?: number;           // For split/array results
  key?: string;             // For object/parsed results
  regexGroup?: string;      // For regex results
  fallback?: string;
  transform?: string;
}

export interface ExtractionRule {
  pattern: string;
  targetField: string;
  dataType: DataType;
  required?: boolean;
}

// Conditional Configuration
export interface ConditionalConfig {
  rules: ConditionalRule[];
  defaultMapping?: SimpleMapping;
  fallbackValue?: unknown;
}

export interface ConditionalRule {
  id: string;
  condition: ConditionExpression;
  mapping: SimpleMapping;
  priority: number;
}

export interface ConditionExpression {
  field: string;
  operator: OperatorType;
  value: unknown;
  dataType: DataType;
  
  // Complex conditions
  and?: ConditionExpression[];
  or?: ConditionExpression[];
  not?: ConditionExpression;
}

export interface SimpleMapping {
  sourceField?: string;
  staticValue?: unknown;
  transformation?: string;
  
  // Mathematical computation support
  computationFormula?: string;    // e.g., "price * 0.95"
  computationType?: 'simple' | 'formula';
}

// Computation Configuration
export interface ComputationConfig {
  formula: string;           // e.g., "{weight} * {dimensions.length} * {dimensions.width}"
  variables: ComputationVariable[];
  functions: ComputationFunction[];
  outputDataType: DataType;
  precision?: number;        // For numbers
  units?: string;            // e.g., 'lbs', 'kg', 'inches'
}

export interface ComputationVariable {
  name: string;
  sourceField: string;
  dataType: DataType;
  defaultValue?: unknown;
  preprocessing?: PreprocessingRule[];
}

export interface ComputationFunction {
  name: string;
  definition: string;        // JavaScript function body
  parameters: string[];
  returnType: DataType;
}

// Structural Configuration
export interface StructuralConfig {
  sourceStructure: DataStructure;
  targetStructure: DataStructure;
  transformationRules: StructuralRule[];
}

export interface DataStructure {
  type: 'array' | 'object' | 'primitive';
  schema?: Record<string, DataType>;
  arrayItemType?: DataType;
}

export interface StructuralRule {
  sourcePath: string;
  targetPath: string;
  transformation?: string;
}

// Template Configuration
export interface TemplateConfig {
  template?: string;          // Simple template string
  variables?: TemplateVariable[];
  helpers?: TemplateHelper[];
  outputFormat: 'plain' | 'html' | 'markdown' | 'json';
  escapeHtml?: boolean;
  trimWhitespace?: boolean;
  
  // Block-based template system (alternative to simple template)
  blocks?: TemplateBlock[];
}

export interface TemplateBlock {
  type: 'text' | 'variable' | 'conditional' | 'loop';
  content?: string;
  variable?: string;
  condition?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'exists';
    value: string;
    trueTemplate: string;
    falseTemplate: string;
  };
  loop?: {
    field: string;
    itemTemplate: string;
    separator: string;
  };
}

export interface TemplateVariable {
  name: string;
  sourceField: string;
  dataType: DataType;
  formatting?: VariableFormatting;
}

export interface VariableFormatting {
  dateFormat?: string;
  numberFormat?: string;
  currencyCode?: string;
  decimalPlaces?: number;
  thousandsSeparator?: string;
}

export interface TemplateHelper {
  name: string;
  definition: string;        // JavaScript function
  parameters: string[];
}

// Processing Rules
export interface PreprocessingRule {
  type: OperatorType;
  parameters: Record<string, unknown>;
  order: number;
}

export interface PostprocessingRule {
  type: OperatorType;
  parameters: Record<string, unknown>;
  order: number;
}

// Validation Configuration
export interface ValidationConfig {
  rules: ValidationRule[];
  skipOnError?: boolean;
  errorHandling?: 'fail' | 'skip' | 'default' | 'log';
}

export interface ValidationRule {
  type: 'required' | 'length' | 'pattern' | 'range' | 'custom';
  parameters: Record<string, unknown>;
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
}

// Testing and Preview
export interface TestCase {
  id: string;
  name: string;
  description?: string;
  input: Record<string, unknown>;
  expectedOutput: unknown;
  actualOutput?: unknown;
  status?: 'pass' | 'fail' | 'pending';
  lastRun?: Date;
}

// Mapping Builder State
export interface MappingBuilderState {
  mappings: ComplexFieldMapping[];
  selectedMapping?: ComplexFieldMapping;
  previewData?: MappingPreviewData;
  validationErrors?: ValidationError[];
  isDirty: boolean;
}

export interface MappingPreviewData {
  sourceData: Record<string, unknown>;
  transformedData: Record<string, unknown>;
  processingSteps: ProcessingStep[];
  performance: PerformanceMetrics;
}

export interface ProcessingStep {
  step: number;
  description: string;
  input: unknown;
  output: unknown;
  duration: number;
  status: 'success' | 'error' | 'warning';
  error?: string;
}

export interface PerformanceMetrics {
  totalDuration: number;
  memoryUsage: number;
  complexityScore: number;
  optimizationSuggestions: string[];
}

export interface ValidationError {
  mappingId: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}