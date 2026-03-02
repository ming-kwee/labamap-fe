/**
 * Field Validation Hook
 * Manages client-side field validation and error states
 */

import { useState, useCallback } from 'react';
import { FormField } from '../../types/form-schema';
import { isValidEmail } from '../../utils/form-utils';

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

export function useFieldValidation(): UseFieldValidationReturn {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const validateField = useCallback((field: FormField, value: any): string | null => {
    const { fieldName, name, label, required, validationRules, fieldType } = field;
    const displayName = fieldName || name || 'Field';

    if (required && (value === null || value === undefined || value === '')) {
      return `${label || displayName} is required`;
    }

    if (!value || value === '') return null;
    if (!validationRules) return null;

    if (fieldType === 'number') {
      const numValue = Number(value);
      if (validationRules.min !== undefined && numValue < validationRules.min) {
        return `${label || displayName} must be at least ${validationRules.min}`;
      }
      if (validationRules.max !== undefined && numValue > validationRules.max) {
        return `${label || displayName} must be at most ${validationRules.max}`;
      }
    }

    if (typeof value === 'string') {
      if (validationRules.minLength && value.length < validationRules.minLength) {
        return `${label || displayName} must be at least ${validationRules.minLength} characters`;
      }
      if (validationRules.maxLength && value.length > validationRules.maxLength) {
        return `${label || displayName} must be at most ${validationRules.maxLength} characters`;
      }
    }

    if (validationRules.pattern) {
      try {
        const regex = new RegExp(validationRules.pattern);
        if (!regex.test(String(value))) {
          return `${label || displayName} format is invalid`;
        }
      } catch {
        // invalid regex pattern — skip
      }
    }

    if (fieldType === 'email' && !isValidEmail(value)) {
      return `${label || displayName} must be a valid email address`;
    }

    if (fieldType === 'url') {
      try {
        new URL(value);
      } catch {
        return `${label || displayName} must be a valid URL`;
      }
    }

    return null;
  }, []);

  const handleFieldBlur = useCallback((field: FormField, value: any) => {
    const fieldName = field.fieldName || field.name || '';
    setTouchedFields(prev => new Set(prev).add(fieldName));

    const error = validateField(field, value);
    setFieldErrors(prev => {
      if (error) return { ...prev, [fieldName]: error };
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
  }, [validateField]);

  const setFieldError = useCallback((fieldName: string, error: string | null) => {
    setFieldErrors(prev => {
      if (error) return { ...prev, [fieldName]: error };
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearFieldErrors = useCallback(() => setFieldErrors({}), []);

  const clearFieldError = useCallback((fieldName: string) => {
    setFieldErrors(prev => {
      const { [fieldName]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const markFieldTouched = useCallback((fieldName: string) => {
    setTouchedFields(prev => new Set(prev).add(fieldName));
  }, []);

  const hasErrors = useCallback((): boolean => Object.keys(fieldErrors).length > 0, [fieldErrors]);

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
