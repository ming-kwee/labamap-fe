/**
 * Field Visibility Hook
 * Evaluates conditional visibility rules for form fields
 */

import { useCallback } from 'react';
import { FormField } from '../../types/form-schema';

// Expose every formData key as a bare variable so backend expressions like
// "category === 'electronics'" work alongside "formData.category === 'electronics'"
function buildVarDecls(formData: Record<string, any>): string {
  return Object.keys(formData)
    .filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k))
    .map(k => `var ${k} = formData[${JSON.stringify(k)}];`)
    .join(' ');
}

export interface UseFieldVisibilityReturn {
  isFieldVisible: (field: FormField, formData: Record<string, any>) => boolean;
  getVisibleFields: (fields: FormField[], formData: Record<string, any>) => FormField[];
}

export function useFieldVisibility(): UseFieldVisibilityReturn {
  const isFieldVisible = useCallback((field: FormField, formData: Record<string, any>): boolean => {
    // Fix 2: Respect backend hidden flag — internal/computed/legacy fields
    if (field.hidden === true) return false;

    if (field.variantScope === 'variant_only') return false;
    if (field.variantScope === 'dual' && formData['hasVariants']) return false;

    if (!field.conditionalVisibility) return true;

    const condition = field.conditionalVisibility;

    try {
      if (typeof condition === 'object' && condition !== null) {
        const bc = condition as any;
        if ('showWhen' in bc || 'hideWhen' in bc || 'requiredWhen' in bc) {
          // All three absent — no visibility constraint
          if (!bc.showWhen && !bc.hideWhen && !bc.requiredWhen) return true;

          // Fix 3: Evaluate showWhen — field visible only when condition is true
          if (bc.showWhen) {
            const fn = new Function(
              'formData',
              `${buildVarDecls(formData)} try { return !!(${bc.showWhen}); } catch(e) { return false; }`
            );
            return Boolean(fn(formData));
          }

          // Fix 3: Evaluate hideWhen — field visible only when condition is false
          if (bc.hideWhen) {
            const fn = new Function(
              'formData',
              `${buildVarDecls(formData)} try { return !(${bc.hideWhen}); } catch(e) { return true; }`
            );
            return Boolean(fn(formData));
          }

          // requiredWhen only affects validation, not visibility
          return true;
        }
      }

      if (typeof condition === 'string') {
        const evalFunc = new Function('formData', `${buildVarDecls(formData)} try { return ${condition}; } catch(e) { return true; }`);
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
