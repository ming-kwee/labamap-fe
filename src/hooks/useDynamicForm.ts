/**
 * Dynamic Form Hook
 * Manages dynamic form schema fetching and form state
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DynamicFormSchema,
  FormGenerationContext,
  DynamicFormData,
  FormValidationResult
} from '@/types/dynamicForm';

interface UseDynamicFormOptions {
  context: Partial<FormGenerationContext>;
  initialData?: DynamicFormData;
  autoRefresh?: boolean;
  onSchemaLoaded?: (schema: DynamicFormSchema) => void;
  onDataChange?: (data: DynamicFormData) => void;
  onValidationChange?: (result: FormValidationResult) => void;
}

interface UseDynamicFormReturn {
  // Schema state
  schema: DynamicFormSchema | null;
  isLoadingSchema: boolean;
  schemaError: string | null;
  
  // Form data state
  formData: DynamicFormData;
  
  // Validation state
  validationResult: FormValidationResult | null;
  isValidating: boolean;
  
  // Actions
  refreshSchema: () => Promise<void>;
  updateFormData: (data: DynamicFormData) => void;
  resetForm: () => void;
  validateForm: () => Promise<FormValidationResult>;
  
  // Computed properties
  hasUnsavedChanges: boolean;
  isFormValid: boolean;
}

export function useDynamicForm(options: UseDynamicFormOptions): UseDynamicFormReturn {
  const {
    context,
    initialData = {},
    autoRefresh = false,
    onSchemaLoaded,
    onDataChange,
    onValidationChange
  } = options;

  // Schema state
  const [schema, setSchema] = useState<DynamicFormSchema | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Form data state
  const [formData, setFormData] = useState<DynamicFormData>(initialData);
  const [originalData, setOriginalData] = useState<DynamicFormData>(initialData);

  // Validation state
  const [validationResult, setValidationResult] = useState<FormValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Prevent duplicate API calls
  const loadingRef = useRef(false);

  // Stable context to prevent infinite loops
  const stableContext = useMemo(() => ({
    userId: context.userId || 'current-user',
    organizationId: context.organizationId || 'default',
    userRole: context.userRole || 'BUSINESS_USER',
    targetChannels: context.targetChannels || [],
    productCategory: context.productCategory,
    permissions: context.permissions || []
  }), [
    context.userId,
    context.organizationId,
    context.userRole,
    context.targetChannels?.join(',') || '',
    context.productCategory,
    context.permissions?.join(',') || ''
  ]);

  /**
   * Fetch form schema from API
   */
  const fetchSchema = useCallback(async () => {
    if (loadingRef.current) {
      console.log('[useDynamicForm] Skipping duplicate API call');
      return;
    }

    console.log('[useDynamicForm] Starting schema fetch with context:', stableContext);

    loadingRef.current = true;
    setIsLoadingSchema(true);
    setSchemaError(null);

    try {
      const response = await fetch('/api/v1/master-attributes/form-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: stableContext
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch form schema: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate form schema');
      }

      setSchema(result.formSchema);
      
      console.log('[useDynamicForm] Schema loaded successfully:', result.formSchema);
      console.log('[useDynamicForm] Schema has', result.formSchema.fields?.length || 0, 'fields');
      console.log('[useDynamicForm] Conditional fields:', result.formSchema.fields?.filter((f: any) => f.conditionalVisibility).map((f: any) => f.fieldName) || []);
      
      // Call onSchemaLoaded if provided, but don't make it a dependency
      if (onSchemaLoaded && typeof onSchemaLoaded === 'function') {
        try {
          onSchemaLoaded(result.formSchema);
        } catch (error) {
          console.warn('[useDynamicForm] Error in onSchemaLoaded callback:', error);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSchemaError(errorMessage);
      console.error('[useDynamicForm] Error fetching schema:', error);
    } finally {
      setIsLoadingSchema(false);
      loadingRef.current = false;
    }
  }, [stableContext]);

  /**
   * Refresh schema
   */
  const refreshSchema = useCallback(async () => {
    await fetchSchema();
  }, [fetchSchema]);

  /**
   * Update form data
   */
  const updateFormData = useCallback((data: DynamicFormData) => {
    setFormData(data);
    
    // Call onDataChange if provided, but don't make it a dependency
    if (onDataChange && typeof onDataChange === 'function') {
      try {
        onDataChange(data);
      } catch (error) {
        console.warn('[useDynamicForm] Error in onDataChange callback:', error);
      }
    }
  }, []);

  /**
   * Reset form to original data
   */
  const resetForm = useCallback(() => {
    setFormData(originalData);
    setValidationResult(null);
  }, [originalData]);

  /**
   * Validate form data against schema
   */
  const validateForm = useCallback(async (): Promise<FormValidationResult> => {
    if (!schema) {
      const result: FormValidationResult = {
        isValid: false,
        fieldErrors: {},
        globalErrors: ['Form schema not loaded'],
        warnings: []
      };
      return result;
    }

    setIsValidating(true);

    try {
      // Simulate validation - in real implementation, this might call an API
      const fieldErrors: Record<string, string[]> = {};
      const globalErrors: string[] = [];
      const warnings: string[] = [];

      // Validate each field
      for (const field of schema.fields) {
        const value = formData[field.fieldName];
        const errors = validateField(field, value, formData);
        
        if (errors.length > 0) {
          fieldErrors[field.fieldName] = errors;
        }
      }

      // Validate global rules
      if (schema.conditionalLogic.globalValidations) {
        for (const validation of schema.conditionalLogic.globalValidations) {
          if (!evaluateCondition(validation.expression, formData)) {
            if (validation.severity === 'error') {
              globalErrors.push(validation.message);
            } else {
              warnings.push(validation.message);
            }
          }
        }
      }

      const result: FormValidationResult = {
        isValid: Object.keys(fieldErrors).length === 0 && globalErrors.length === 0,
        fieldErrors,
        globalErrors,
        warnings
      };

      setValidationResult(result);
      
      // Call onValidationChange if provided, but don't make it a dependency
      if (onValidationChange && typeof onValidationChange === 'function') {
        try {
          onValidationChange(result);
        } catch (error) {
          console.warn('[useDynamicForm] Error in onValidationChange callback:', error);
        }
      }

      return result;

    } finally {
      setIsValidating(false);
    }
  }, [schema, formData]);

  /**
   * Validate individual field
   */
  const validateField = (field: any, value: any, data: DynamicFormData): string[] => {
    const errors: string[] = [];
    const rules = field.validationRules;

    // Required validation
    const isRequired = field.required || 
      (field.conditionalVisibility?.requiredWhen && evaluateCondition(field.conditionalVisibility.requiredWhen, data));
    
    if (isRequired && (value === undefined || value === null || value === '')) {
      errors.push(`${field.label} is required`);
      return errors;
    }

    // Skip other validations if field is empty but not required
    if (value === undefined || value === null || value === '') {
      return errors;
    }

    // Type-specific validations
    if (field.fieldType === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`${field.label} must be a valid number`);
        return errors;
      }
      
      if (rules.min !== undefined && numValue < rules.min) {
        errors.push(`${field.label} must be at least ${rules.min}`);
      }
      
      if (rules.max !== undefined && numValue > rules.max) {
        errors.push(`${field.label} must be no more than ${rules.max}`);
      }
    }

    if (field.fieldType === 'text' || field.fieldType === 'textarea') {
      const strValue = String(value);
      
      if (rules.minLength !== undefined && strValue.length < rules.minLength) {
        errors.push(`${field.label} must be at least ${rules.minLength} characters`);
      }
      
      if (rules.maxLength !== undefined && strValue.length > rules.maxLength) {
        errors.push(`${field.label} must be no more than ${rules.maxLength} characters`);
      }
      
      if (rules.pattern) {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(strValue)) {
          errors.push(`${field.label} format is invalid`);
        }
      }
    }

    return errors;
  };

  /**
   * Evaluate conditional expressions
   */
  const evaluateCondition = (condition: string, data: DynamicFormData): boolean => {
    try {
      // Simple expression evaluation for common patterns
      if (condition.includes('===')) {
        const [left, right] = condition.split('===').map(s => s.trim());
        const leftValue = getNestedValue(data, left);
        const rightValue = right.replace(/['"]/g, '');
        return leftValue === rightValue;
      }
      
      if (condition.includes('includes(')) {
        const match = condition.match(/(\w+)\.includes\(['"]([^'"]+)['"]\)/);
        if (match) {
          const [, arrayName, value] = match;
          const array = data[arrayName];
          return Array.isArray(array) && array.includes(value);
        }
      }
      
      return false;
    } catch (error) {
      console.warn('Error evaluating condition:', condition, error);
      return false;
    }
  };

  /**
   * Get nested value from object
   */
  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  // Load schema on mount and when context changes
  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  // Auto-refresh schema if enabled (disabled to prevent infinite loops)
  // useEffect(() => {
  //   if (!autoRefresh) return;

  //   const interval = setInterval(() => {
  //     fetchSchema();
  //   }, 30000); // Refresh every 30 seconds

  //   return () => clearInterval(interval);
  // }, [autoRefresh, fetchSchema]);

  // Initialize form data once on mount
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    if (!isInitialized) {
      setOriginalData(initialData);
      setFormData(initialData);
      setIsInitialized(true);
    }
  }, []);

  // Computed properties
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalData);
  const isFormValid = validationResult?.isValid ?? false;

  return {
    // Schema state
    schema,
    isLoadingSchema,
    schemaError,
    
    // Form data state
    formData,
    
    // Validation state
    validationResult,
    isValidating,
    
    // Actions
    refreshSchema,
    updateFormData,
    resetForm,
    validateForm,
    
    // Computed properties
    hasUnsavedChanges,
    isFormValid
  };
}