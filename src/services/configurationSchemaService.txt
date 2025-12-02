/**
 * Configuration Schema Service
 * Interacts with backend schema endpoints to get configuration field definitions
 */

export interface ValidationRules {
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface FieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConfigurationField {
  fieldName: string;
  displayLabel: string;
  description?: string;
  fieldType: 'string' | 'number' | 'boolean' | 'enum' | 'array';
  required: boolean;
  defaultValue?: any;
  validation?: ValidationRules;
  options?: FieldOption[];
  placeholder?: string;
  helpText?: string;
  displayOrder?: number;
}

export interface RuleConfigurationSchema {
  schemaId: string;
  schemaName: string;
  description: string;
  ruleType: string;
  fields: ConfigurationField[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  message: string;
}

const SCHEMA_ENDPOINT = '/api/business-rules/schemas';

/**
 * Get all available configuration schemas
 */
export async function getAllSchemas(): Promise<RuleConfigurationSchema[]> {
  try {
    const response = await fetch(SCHEMA_ENDPOINT);
    const data = await response.json();

    if (data.success) {
      return data.schemas || [];
    }

    return [];
  } catch (error) {
    console.error('Failed to fetch schemas:', error);
    return [];
  }
}

/**
 * Get specific schema by ID
 */
export async function getSchema(schemaId: string): Promise<RuleConfigurationSchema | null> {
  try {
    const response = await fetch(`${SCHEMA_ENDPOINT}/${schemaId}`);
    const data = await response.json();

    if (data.success && data.schema) {
      return data.schema;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch schema ${schemaId}:`, error);
    return null;
  }
}

/**
 * Get schema suggestion based on rule type and purpose
 */
export async function suggestSchema(
  ruleType: string,
  purpose?: string
): Promise<RuleConfigurationSchema | null> {
  try {
    const params = new URLSearchParams({ ruleType });
    if (purpose) {
      params.append('purpose', purpose);
    }

    const response = await fetch(`${SCHEMA_ENDPOINT}/suggest?${params.toString()}`);
    const data = await response.json();

    if (data.success && data.schema) {
      return data.schema;
    }

    return null;
  } catch (error) {
    console.error('Failed to get schema suggestion:', error);
    return null;
  }
}

/**
 * Validate configuration against schema
 */
export async function validateConfiguration(
  schemaId: string,
  configuration: Record<string, any>
): Promise<ValidationResult> {
  try {
    const response = await fetch(`${SCHEMA_ENDPOINT}/${schemaId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configuration),
    });

    const data = await response.json();

    return {
      valid: data.valid || false,
      errors: data.errors || [],
      warnings: data.warnings || [],
      message: data.message || '',
    };
  } catch (error) {
    console.error('Failed to validate configuration:', error);
    return {
      valid: false,
      errors: ['Failed to validate configuration'],
      warnings: [],
      message: 'Validation service unavailable',
    };
  }
}

/**
 * Extract configuration from form data based on schema
 */
export function extractConfigurationFromSchema(
  schema: RuleConfigurationSchema,
  formData: FormData
): Record<string, any> {
  const configuration: Record<string, any> = {};

  schema.fields.forEach((field) => {
    const value = formData.get(field.fieldName);

    if (value === null || value === '') {
      return; // Skip empty values
    }

    switch (field.fieldType) {
      case 'boolean':
        configuration[field.fieldName] = value === 'true' || value === 'on';
        break;

      case 'number':
        configuration[field.fieldName] = parseFloat(value.toString());
        break;

      case 'array':
        // For multi-select
        const arrayValue = formData.getAll(field.fieldName);
        configuration[field.fieldName] = arrayValue;
        break;

      case 'string':
      case 'enum':
      default:
        configuration[field.fieldName] = value.toString();
        break;
    }
  });

  return configuration;
}
