/**
 * Variant Scope Utilities
 * Handles field classification and value transitions when toggling hasVariants
 */

import { FormField } from '../types/form-schema';

interface ClassifiedFields {
  productFields: FormField[];
  variantFields: FormField[];
}

/**
 * Field-name accessor tolerant of the `fieldName ?? name` alias.
 */
function fieldNameOf(field: { fieldName?: string; name?: string }): string {
  return field.fieldName || field.name || '';
}

/**
 * Names of `both`-scope fields: product-level AND per-variant simultaneously, with
 * independent values (e.g. WIX `product.sku` vs `variants[*].sku`). Resolved from the
 * explicit backend list `metadata.productAndVariantFields`, or by scanning fields for
 * `variantScope === "both"`. These stay product-level even when hasVariants=true, so they
 * must NOT be treated as dual — see {@link resolveDualFieldNames}.
 */
export function resolveBothFieldNames(schema: any): string[] {
  const fromMeta = schema?.metadata?.productAndVariantFields;
  if (Array.isArray(fromMeta) && fromMeta.length > 0) return fromMeta;
  return (schema?.fields || [])
    .filter((f: any) => f.variantScope === 'both')
    .map((f: any) => fieldNameOf(f))
    .filter(Boolean);
}

/**
 * Names of `dual`-scope fields (product-level XOR variant-level): hidden at product level
 * and migrated to the first variant when hasVariants flips true. Resolved from the explicit
 * backend list `metadata.variantScopedFields`, or by scanning for `variantScope === "dual"`.
 * `both`-scope fields are always excluded — a transitional backend that still lists sku/price/
 * weight under variantScopedFields must not cause them to be hidden/migrated.
 */
export function resolveDualFieldNames(schema: any): string[] {
  const bothNames = new Set(resolveBothFieldNames(schema));
  const fromMeta = schema?.metadata?.variantScopedFields;
  const names: string[] = Array.isArray(fromMeta) && fromMeta.length > 0
    ? fromMeta
    : (schema?.fields || [])
        .filter((f: any) => f.variantScope === 'dual')
        .map((f: any) => fieldNameOf(f));
  return names.filter((n: string) => Boolean(n) && !bothNames.has(n));
}

/**
 * Splits fields into product-level and variant-level based on variantScope + hasVariants toggle.
 *
 * `both`-scope fields land in BOTH buckets when hasVariants=true — they keep their product-level
 * slot AND gain a per-variant column (independent values), unlike `dual` which is either/or.
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
    } else if (scope === 'both' && hasVariants) {
      // Present at both levels at once — product-level value coexists with per-variant values.
      productFields.push(field);
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

  if (!variants || variants.length === 0) return restoredValues;

  const firstVariant = variants[0];

  for (const fieldName of dualFieldNames) {
    const value = firstVariant[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      restoredValues[fieldName] = value;
    }
  }

  return restoredValues;
}
