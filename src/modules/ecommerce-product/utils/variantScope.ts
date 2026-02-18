/**
 * Variant Scope Utilities
 * Handles field classification and value transitions when toggling hasVariants
 */

import { FormField } from '../types/dynamicForm';

interface ClassifiedFields {
  productFields: FormField[];
  variantFields: FormField[];
}

/**
 * Splits fields into product-level and variant-level based on variantScope + hasVariants toggle.
 *
 * - null/undefined → always product-level
 * - 'dual' + hasVariants=false → product-level; hasVariants=true → variant-level
 * - 'variant_only' → always variant-level (hidden from product form entirely)
 */
export function classifyFieldsByScope(
  fields: FormField[],
  hasVariants: boolean
): ClassifiedFields {
  const productFields: FormField[] = [];
  const variantFields: FormField[] = [];

  for (const field of fields) {
    const scope = field.variantScope;

    if (scope === 'variant_only') {
      variantFields.push(field);
    } else if (scope === 'dual' && hasVariants) {
      variantFields.push(field);
    } else {
      productFields.push(field);
    }
  }

  return { productFields, variantFields };
}

/**
 * Copies product-level dual field values as defaults for the first variant row
 * when user toggles hasVariants ON.
 */
export function onVariantsEnabled(
  productFormValues: Record<string, any>,
  dualFieldNames: string[]
): Record<string, any> {
  const variantDefaults: Record<string, any> = {};

  for (const fieldName of dualFieldNames) {
    const value = productFormValues[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      variantDefaults[fieldName] = value;
    }
  }

  return variantDefaults;
}

/**
 * Restores first variant's dual values back to product level
 * when user toggles hasVariants OFF.
 */
export function onVariantsDisabled(
  variants: Record<string, any>[],
  dualFieldNames: string[]
): Record<string, any> {
  const restoredValues: Record<string, any> = {};

  if (!variants || variants.length === 0) {
    return restoredValues;
  }

  const firstVariant = variants[0];

  for (const fieldName of dualFieldNames) {
    const value = firstVariant[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      restoredValues[fieldName] = value;
    }
  }

  return restoredValues;
}
