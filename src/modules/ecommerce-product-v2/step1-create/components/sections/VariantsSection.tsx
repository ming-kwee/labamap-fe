'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import VariantConfigurator from '../VariantConfigurator';
import { onVariantsEnabled, onVariantsDisabled } from '../../../utils/variant-scope';
import type { VariantDimension } from '@/app/omni-admin/product-types/_types/product-type';

interface VariantsSectionProps {
  schema: any;
  formData: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  onVariantChange: (value: string) => void;
  organizationId: string;
  productId: string;
  /** Phase 5: ordered dimensions from the category's ProductType. */
  productTypeDimensions?: VariantDimension[];
  /** Phase 5: options per axis fetched from master attributes. */
  dimensionOptions?: Map<string, string[]>;
  productTypeName?: string | null;
  /** True while useProductTypeVariants is fetching dimensions + options. */
  isLoadingVariantOptions?: boolean;
}

export default function VariantsSection({
  schema,
  formData,
  onChange,
  onVariantChange,
  organizationId,
  productId,
  productTypeDimensions,
  dimensionOptions,
  productTypeName,
  isLoadingVariantOptions,
}: VariantsSectionProps) {
  if (!schema?.fields) return null;

  const variantField = schema.fields.find((f: any) => {
    const ft = (f.fieldType || '').toLowerCase();
    return ft === 'variant_configurator' || ft === 'variant-configurator';
  });

  if (!variantField) return null;

  const hasVariantsEnabled = !!formData['hasVariants'];

  const handleHasVariantsChange = (enabled: boolean) => {
    const dualFieldNames: string[] =
      schema?.metadata?.variantScopedFields ||
      schema?.fields
        ?.filter((f: any) => f.variantScope === 'dual')
        .map((f: any) => f.fieldName || f.name) ||
      [];

    if (enabled && dualFieldNames.length > 0) {
      const variantDefaults = onVariantsEnabled(formData, dualFieldNames);
      onChange('_variantDefaults', variantDefaults);
    } else if (!enabled && dualFieldNames.length > 0) {
      try {
        const variantData = formData.variantConfigurator
          ? JSON.parse(formData.variantConfigurator)
          : null;
        if (variantData?.variants?.length > 0) {
          const restored = onVariantsDisabled(variantData.variants, dualFieldNames);
          Object.entries(restored).forEach(([key, val]) => onChange(key, val));
        }
      } catch {
        // ignore parse errors
      }
    }

    onChange('hasVariants', enabled);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <span>Product Options &amp; Variants</span>
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Define the options (size, color, material) that create unique product variants
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* hasVariants toggle */}
        <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div>
            <label htmlFor="hasVariants" className="font-medium text-base cursor-pointer text-gray-800 dark:text-gray-100">
              This product has multiple options
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              e.g. sizes, colors, or materials — each combination becomes a separate SKU
            </p>
          </div>
          <button
            type="button"
            id="hasVariants"
            role="switch"
            aria-checked={hasVariantsEnabled}
            onClick={() => handleHasVariantsChange(!hasVariantsEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              hasVariantsEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                hasVariantsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Variant Configurator — only rendered when enabled */}
        {hasVariantsEnabled && (
          <VariantConfigurator
            value={formData.variantConfigurator}
            onChange={onVariantChange}
            schema={schema}
            formData={formData}
            organizationId={organizationId}
            productId={productId}
            productTypeDimensions={productTypeDimensions}
            dimensionOptions={dimensionOptions}
            productTypeName={productTypeName}
            isLoadingVariantOptions={isLoadingVariantOptions}
          />
        )}
      </CardContent>
    </Card>
  );
}
