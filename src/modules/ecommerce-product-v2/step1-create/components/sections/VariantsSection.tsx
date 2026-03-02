'use client';

import React from 'react';
import { AlertCircle } from '@/shared/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import VariantConfigurator from '../VariantConfigurator';
import { onVariantsEnabled, onVariantsDisabled } from '../../../utils/variant-scope';

interface VariantsSectionProps {
  schema: any;
  formData: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  onVariantChange: (value: string) => void;
  organizationId: string;
  productId: string;
}

export default function VariantsSection({
  schema,
  formData,
  onChange,
  onVariantChange,
  organizationId,
  productId,
}: VariantsSectionProps) {
  if (!schema?.fields) return null;

  const hasVariantsField = schema.fields.find(
    (f: any) => (f.name || f.fieldName) === 'hasVariants'
  );
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
          <span>{variantField?.label || 'Product Variants'}</span>
        </CardTitle>
        {variantField?.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {variantField.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* hasVariants toggle */}
        <div className="flex items-start p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
          <input
            type="checkbox"
            id="hasVariants"
            checked={hasVariantsEnabled}
            onChange={(e) => handleHasVariantsChange(e.target.checked)}
            className="mt-1 mr-3 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <div>
            <label htmlFor="hasVariants" className="font-medium text-lg cursor-pointer text-gray-800">
              {hasVariantsField?.label || 'This product has variants'}
            </label>
            <p className="text-sm text-gray-600 mt-1">
              {hasVariantsField?.helpText ||
                'Enable this to configure product variations (e.g., different sizes, colors, materials)'}
            </p>
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  hasVariantsEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {hasVariantsEnabled ? 'Variants Enabled' : 'Variants Disabled'}
              </span>
            </div>
          </div>
        </div>

        {/* Warning when disabled */}
        {!hasVariantsEnabled && (
          <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
              <span className="text-sm text-yellow-800">
                Enable the checkbox above to configure product variants.
              </span>
            </div>
          </div>
        )}

        {/* Variant Configurator */}
        <div className={`transition-all duration-300 ${hasVariantsEnabled ? 'opacity-100' : 'opacity-60'}`}>
          <VariantConfigurator
            value={formData.variantConfigurator}
            onChange={onVariantChange}
            schema={schema}
            formData={formData}
            organizationId={organizationId}
            productId={productId}
          />
        </div>
      </CardContent>
    </Card>
  );
}
