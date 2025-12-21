/**
 * Field Validation Hook
 * Manages client-side field validation and error states
 */

import { useState, useCallback } from 'react';
import { FormField } from '../types/dynamicForm';
import { isValidEmail } from '../utils/productFormUtils';

export interface UseFieldValidationReturn {
  fieldErrors: Record<string, string>;
  touchedFields: Set<string>;
  validateField: (field: FormField, value: any) => string | null;
  handleFieldBlur: (field: FormField, value: any) => void;
  setFieldError: (fieldName: string, error: string | null) => void;
  clearFieldErrors: () => void;
  clearFieldError: (fieldName: string) => void;
  markFieldTouched: (fieldName: string) => void;
  hasErrors: () => boolean;
}

/**
 * Custom hook for managing field validation
 */
export function useFieldValidation(): UseFieldValidationReturn {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  /**
   * Validates a single field based on its schema rules
   * @param field - Field configuration
   * @param value - Current field value
   * @returns Error message or null if valid
   */
  const validateField = useCallback((field: FormField, value: any): string | null => {
    const { fieldName, name, label, required, validationRules, fieldType } = field;
    const displayName = fieldName || name || 'Field';

    // Required field validation
    if (required && (value === null || value === undefined || value === '')) {
      return `${label || displayName} is required`;
    }

    // Skip further validation if field is empty and not required
    if (!value || value === '') {
      return null;
    }

    // No validation rules specified
    if (!validationRules) {
      return null;
    }

    // Min/Max value validation (for numbers)
    if (fieldType === 'number') {
      const numValue = Number(value);

      if (validationRules.min !== undefined && numValue < validationRules.min) {
        return `${label || displayName} must be at least ${validationRules.min}`;
      }

      if (validationRules.max !== undefined && numValue > validationRules.max) {
        return `${label || displayName} must be at most ${validationRules.max}`;
      }
    }

    // MinLength/MaxLength validation (for strings)
    if (typeof value === 'string') {
      if (validationRules.minLength && value.length < validationRules.minLength) {
        return `${label || displayName} must be at least ${validationRules.minLength} characters`;
      }

      if (validationRules.maxLength && value.length > validationRules.maxLength) {
        return `${label || displayName} must be at most ${validationRules.maxLength} characters`;
      }
    }

    // Pattern (regex) validation
    if (validationRules.pattern) {
      try {
        const regex = new RegExp(validationRules.pattern);
        if (!regex.test(String(value))) {
          return `${label || displayName} format is invalid`;
        }
      } catch (error) {
        console.error(`[Field Validation] Invalid regex pattern for ${displayName}:`, validationRules.pattern);
      }
    }

    // Email validation
    if (fieldType === 'email' && !isValidEmail(value)) {
      return `${label || displayName} must be a valid email address`;
    }

    // URL validation
    if (fieldType === 'url') {
      try {
        new URL(value);
      } catch {
        return `${label || displayName} must be a valid URL`;
      }
    }

    return null;
  }, []);

  /**
   * Handles field blur event - marks field as touched and validates
   * @param field - Field configuration
   * @param value - Current field value
   */
  const handleFieldBlur = useCallback((field: FormField, value: any) => {
    const fieldName = field.fieldName || field.name || '';
    console.log(`[Field Validation] Field blurred: ${fieldName}`, value);

    // Mark field as touched
    setTouchedFields(prev => new Set(prev).add(fieldName));

    // Validate field
    const error = validateField(field, value);

    // Update errors
    setFieldErrors(prev => {
      if (error) {
        return { ...prev, [fieldName]: error };
      } else {
        const { [fieldName]: removed, ...rest } = prev;
        return rest;
      }
    });
  }, [validateField]);

  /**
   * Manually set an error for a field
   * @param fieldName - Field name
   * @param error - Error message or null to clear
   */
  const setFieldError = useCallback((fieldName: string, error: string | null) => {
    setFieldErrors(prev => {
      if (error) {
        return { ...prev, [fieldName]: error };
      } else {
        const { [fieldName]: removed, ...rest } = prev;
        return rest;
      }
    });
  }, []);

  /**
   * Clears all field errors
   */
  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  /**
   * Clears error for a specific field
   * @param fieldName - Field name
   */
  const clearFieldError = useCallback((fieldName: string) => {
    setFieldErrors(prev => {
      const { [fieldName]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Marks a field as touched
   * @param fieldName - Field name
   */
  const markFieldTouched = useCallback((fieldName: string) => {
    setTouchedFields(prev => new Set(prev).add(fieldName));
  }, []);

  /**
   * Checks if there are any validation errors
   * @returns True if errors exist
   */
  const hasErrors = useCallback((): boolean => {
    return Object.keys(fieldErrors).length > 0;
  }, [fieldErrors]);

  return {
    fieldErrors,
    touchedFields,
    validateField,
    handleFieldBlur,
    setFieldError,
    clearFieldErrors,
    clearFieldError,
    markFieldTouched,
    hasErrors
  };
}
