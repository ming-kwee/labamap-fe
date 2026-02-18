/**
 * Field Visibility Hook
 * Evaluates conditional visibility rules for form fields
 */

import { useCallback, useMemo } from 'react';
import { FormField } from '../types/dynamicForm';

export interface UseFieldVisibilityReturn {
  isFieldVisible: (field: FormField, formData: Record<string, any>) => boolean;
  getVisibleFields: (fields: FormField[], formData: Record<string, any>) => FormField[];
}

/**
 * Custom hook for managing field visibility based on conditional rules
 */
export function useFieldVisibility(): UseFieldVisibilityReturn {
  /**
   * Evaluates conditional visibility for a field
   * Supports both expression-based and object-based conditions
   *
   * @param field - Field configuration
   * @param formData - Current form data
   * @returns True if field should be visible
   */
  const isFieldVisible = useCallback((field: FormField, formData: Record<string, any>): boolean => {
    // Variant scope checks — hide fields that belong to variant rows
    if (field.variantScope === 'variant_only') {
      return false; // Always hidden from product form — handled by variant configurator
    }
    if (field.variantScope === 'dual' && formData['hasVariants']) {
      return false; // Moved to variant rows when hasVariants is on
    }

    // No conditional logic? Always visible
    if (!field.conditionalVisibility) {
      return true;
    }

    const condition = field.conditionalVisibility;

    try {
      // Handle empty conditional object (e.g., { showWhen: null, hideWhen: null, requiredWhen: null })
      if (typeof condition === 'object' && condition !== null) {
        // Check if it's a backend conditional object with showWhen/hideWhen/requiredWhen
        const backendCondition = condition as any;
        if ('showWhen' in backendCondition || 'hideWhen' in backendCondition || 'requiredWhen' in backendCondition) {
          // If all properties are null/undefined, treat as always visible
          if (!backendCondition.showWhen && !backendCondition.hideWhen && !backendCondition.requiredWhen) {
            return true;
          }
          // TODO: Implement full backend conditional logic support
          // For now, if showWhen exists and is not null, we'd need to evaluate it
          console.log(`[Field Visibility] Backend conditional object for ${field.name} - defaulting to visible`);
          return true;
        }
      }

      // Handle JavaScript expression string (e.g., "formData.hasVariants === true")
      if (typeof condition === 'string') {
        console.log(`[Field Visibility] Evaluating expression for ${field.name}:`, condition);

        // Create evaluation function with formData in scope
        const evalFunc = new Function('formData', `
          try {
            return ${condition};
          } catch (e) {
            console.error('[Field Visibility] Expression error:', e.message);
            return true;
          }
        `);

        const result = evalFunc(formData);
        console.log(`[Field Visibility] ${field.name} visibility result:`, result);
        return Boolean(result);
      }

      // Handle object-based condition (e.g., { field: "hasVariants", operator: "equals", value: true })
      if (typeof condition === 'object' && condition !== null) {
        const { field: conditionField, operator, value } = condition as {
          field: string;
          operator: string;
          value: any;
        };

        if (!conditionField || !operator) {
          // Silently default to visible for malformed conditions
          return true;
        }

        const fieldValue = formData[conditionField];

        console.log(`[Field Visibility] Checking ${field.name}: ${conditionField} ${operator} ${value}`, {
          fieldValue,
          expectedValue: value
        });

        switch (operator.toLowerCase()) {
          case 'equals':
          case '===':
          case '==':
            return fieldValue === value;

          case 'not_equals':
          case 'notequals':
          case '!==':
          case '!=':
            return fieldValue !== value;

          case 'greater_than':
          case '>':
            return Number(fieldValue) > Number(value);

          case 'less_than':
          case '<':
            return Number(fieldValue) < Number(value);

          case 'greater_than_or_equal':
          case '>=':
            return Number(fieldValue) >= Number(value);

          case 'less_than_or_equal':
          case '<=':
            return Number(fieldValue) <= Number(value);

          case 'contains':
            return String(fieldValue).includes(String(value));

          case 'not_contains':
            return !String(fieldValue).includes(String(value));

          case 'in':
            return Array.isArray(value) && value.includes(fieldValue);

          case 'not_in':
            return Array.isArray(value) && !value.includes(fieldValue);

          case 'is_empty':
            return !fieldValue || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);

          case 'is_not_empty':
            return fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);

          default:
            console.warn(`[Field Visibility] Unknown operator '${operator}' for ${field.name}`);
            return true;
        }
      }

      // Unknown condition type
      console.warn(`[Field Visibility] Unknown condition type for ${field.name}:`, typeof condition);
      return true;

    } catch (error) {
      console.error(`[Field Visibility] Error evaluating visibility for ${field.name}:`, error);
      // On error, default to visible to prevent hiding fields unintentionally
      return true;
    }
  }, []);

  /**
   * Filters an array of fields to only visible ones
   *
   * @param fields - Array of field configurations
   * @param formData - Current form data
   * @returns Array of visible fields
   */
  const getVisibleFields = useCallback((fields: FormField[], formData: Record<string, any>): FormField[] => {
    if (!Array.isArray(fields)) {
      console.warn('[Field Visibility] getVisibleFields called with non-array:', fields);
      return [];
    }

    return fields.filter(field => isFieldVisible(field, formData));
  }, [isFieldVisible]);

  return {
    isFieldVisible,
    getVisibleFields
  };
}
