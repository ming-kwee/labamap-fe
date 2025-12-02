"use client";

import React, { useState } from 'react';
import type { RuleConfigurationSchema, ConfigurationField } from '@/services/configurationSchemaService';

interface SchemaBasedConfigurationFormProps {
  schema: RuleConfigurationSchema;
  configuration: Record<string, any>;
  onChange: (configuration: Record<string, any>) => void;
  errors?: Record<string, string>;
}

// Client-side validation function
function validateField(field: ConfigurationField, value: any): string | null {
  // Check required fields
  if (field.required && (value === undefined || value === null || value === '')) {
    return `${field.displayLabel} is required`;
  }

  // Skip validation for empty optional fields
  if (!field.required && (value === undefined || value === null || value === '')) {
    return null;
  }

  // Type-specific validation
  switch (field.fieldType) {
    case 'number':
      if (typeof value === 'string' && value !== '') {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          return `${field.displayLabel} must be a valid number`;
        }
        value = numValue;
      }

      if (typeof value === 'number') {
        if (field.validation?.minValue !== undefined && value < field.validation.minValue) {
          return `${field.displayLabel} must be at least ${field.validation.minValue}`;
        }
        if (field.validation?.maxValue !== undefined && value > field.validation.maxValue) {
          return `${field.displayLabel} must be at most ${field.validation.maxValue}`;
        }
      }
      break;

    case 'string':
      if (typeof value === 'string') {
        if (field.validation?.minLength && value.length < field.validation.minLength) {
          return `${field.displayLabel} must be at least ${field.validation.minLength} characters`;
        }
        if (field.validation?.maxLength && value.length > field.validation.maxLength) {
          return `${field.displayLabel} must be at most ${field.validation.maxLength} characters`;
        }
        if (field.validation?.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            return `${field.displayLabel} format is invalid`;
          }
        }
      }
      break;

    case 'enum':
      if (field.options && value) {
        const validValues = field.options.map(opt => opt.value);
        if (!validValues.includes(value)) {
          return `${field.displayLabel} must be one of: ${validValues.join(', ')}`;
        }
      }
      break;
  }

  return null;
}

const SchemaBasedConfigurationForm: React.FC<SchemaBasedConfigurationFormProps> = ({
  schema,
  configuration,
  onChange,
  errors = {},
}) => {
  // Local state for client-side validation errors
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  // Sort fields by display order
  const sortedFields = [...schema.fields].sort(
    (a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)
  );

  const handleFieldChange = (fieldName: string, value: any) => {
    onChange({
      ...configuration,
      [fieldName]: value,
    });

    // Clear local error when user starts typing
    if (localErrors[fieldName]) {
      setLocalErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const handleFieldBlur = (field: ConfigurationField) => {
    // Mark field as touched
    setTouchedFields(prev => new Set(prev).add(field.fieldName));

    // Get current value
    const value = field.fieldName in configuration
      ? configuration[field.fieldName]
      : field.defaultValue;

    // Validate on blur
    const error = validateField(field, value);
    if (error) {
      setLocalErrors(prev => ({ ...prev, [field.fieldName]: error }));
    } else {
      setLocalErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field.fieldName];
        return newErrors;
      });
    }
  };

  const renderField = (field: ConfigurationField) => {
    // Use defaultValue only if field has never been set (not in configuration object)
    const value = field.fieldName in configuration
      ? configuration[field.fieldName]
      : field.defaultValue;
    const errorMessage = errors[field.fieldName];
    const hasError = !!errorMessage;

    return (
      <div key={field.fieldName} className="space-y-2">
        {/* Label */}
        <label className="block text-sm font-medium text-gray-700">
          {field.displayLabel}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {/* Description */}
        {field.description && (
          <p className="text-xs text-gray-500">{field.description}</p>
        )}

        {/* Input Field */}
        {renderInputByType(field, value, hasError)}

        {/* Help Text */}
        {field.helpText && !hasError && (
          <p className="text-xs text-gray-500 italic">{field.helpText}</p>
        )}

        {/* Error Message */}
        {hasError && errorMessage && (
          <p className="text-xs text-red-600">{errorMessage}</p>
        )}
      </div>
    );
  };

  const renderInputByType = (field: ConfigurationField, value: any, hasError: boolean) => {
    const baseClassName = `w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
      hasError
        ? 'border-red-500 focus:ring-red-500'
        : 'border-gray-300 focus:ring-blue-500'
    }`;

    switch (field.fieldType) {
      case 'boolean':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handleFieldChange(field.fieldName, e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-600">
              {field.placeholder || 'Enable this option'}
            </span>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => {
              const newValue = e.target.value;
              // Allow empty string for clearing the field
              if (newValue === '') {
                handleFieldChange(field.fieldName, '');
              } else {
                // Parse to number for non-empty values
                const numValue = parseFloat(newValue);
                handleFieldChange(field.fieldName, isNaN(numValue) ? '' : numValue);
              }
            }}
            placeholder={field.placeholder}
            min={field.validation?.minValue}
            max={field.validation?.maxValue}
            step="any"
            required={field.required}
            className={baseClassName}
          />
        );

      case 'enum':
        return (
          <select
            value={value || ''}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            required={field.required}
            className={baseClassName}
          >
            <option value="">-- Select {field.displayLabel} --</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value} title={option.description}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'array':
        return (
          <select
            multiple
            size={Math.min(field.options?.length || 5, 5)}
            value={value || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
              handleFieldChange(field.fieldName, selected);
            }}
            className={`${baseClassName} h-auto`}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value} title={option.description}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'string':
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.validation?.maxLength}
            pattern={field.validation?.pattern}
            required={field.required}
            className={baseClassName}
          />
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Schema Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <h4 className="text-sm font-medium text-blue-800">{schema.schemaName}</h4>
        {schema.description && (
          <p className="text-xs text-blue-700 mt-1">{schema.description}</p>
        )}
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {sortedFields.map(renderField)}
      </div>

      {/* Field Count Info */}
      <div className="text-xs text-gray-500">
        {schema.fields.length} configuration {schema.fields.length === 1 ? 'field' : 'fields'} available
      </div>
    </div>
  );
};

export default SchemaBasedConfigurationForm;
