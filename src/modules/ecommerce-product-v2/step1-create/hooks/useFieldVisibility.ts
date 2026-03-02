/**
 * Field Visibility Hook
 * Evaluates conditional visibility rules for form fields
 */

import { useCallback } from 'react';
import { FormField } from '../../types/form-schema';

export interface UseFieldVisibilityReturn {
  isFieldVisible: (field: FormField, formData: Record<string, any>) => boolean;
  getVisibleFields: (fields: FormField[], formData: Record<string, any>) => FormField[];
}

export function useFieldVisibility(): UseFieldVisibilityReturn {
  const isFieldVisible = useCallback((field: FormField, formData: Record<string, any>): boolean => {
    if (field.variantScope === 'variant_only') return false;
    if (field.variantScope === 'dual' && formData['hasVariants']) return false;

    if (!field.conditionalVisibility) return true;

    const condition = field.conditionalVisibility;

    try {
      if (typeof condition === 'object' && condition !== null) {
        const bc = condition as any;
        if ('showWhen' in bc || 'hideWhen' in bc || 'requiredWhen' in bc) {
          if (!bc.showWhen && !bc.hideWhen && !bc.requiredWhen) return true;
          return true; // TODO: full backend conditional logic
        }
      }

      if (typeof condition === 'string') {
        const evalFunc = new Function('formData', `try { return ${condition}; } catch(e) { return true; }`);
        return Boolean(evalFunc(formData));
      }

      if (typeof condition === 'object' && condition !== null) {
        const { field: conditionField, operator, value } = condition as {
          field: string; operator: string; value: any;
        };

        if (!conditionField || !operator) return true;

        const fieldValue = formData[conditionField];

        switch (operator.toLowerCase()) {
          case 'equals': case '===': case '==':
            return fieldValue === value;
          case 'not_equals': case 'notequals': case '!==': case '!=':
            return fieldValue !== value;
          case 'greater_than': case '>':
            return Number(fieldValue) > Number(value);
          case 'less_than': case '<':
            return Number(fieldValue) < Number(value);
          case 'greater_than_or_equal': case '>=':
            return Number(fieldValue) >= Number(value);
          case 'less_than_or_equal': case '<=':
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
            return !!fieldValue && fieldValue !== '' && (!Array.isArray(fieldValue) || fieldValue.length > 0);
          default:
            return true;
        }
      }

      return true;
    } catch {
      return true;
    }
  }, []);

  const getVisibleFields = useCallback((fields: FormField[], formData: Record<string, any>): FormField[] => {
    if (!Array.isArray(fields)) return [];
    return fields.filter(field => isFieldVisible(field, formData));
  }, [isFieldVisible]);

  return { isFieldVisible, getVisibleFields };
}
