"use client";

/**
 * VariantConfigurator
 * Fully dynamic variant configurator — detects dimensions from backend schema
 */

import React, { useState, useMemo } from 'react';
import VariantMultiImageUpload from './VariantMultiImageUpload';

interface VariantOption {
  id: string;
  [key: string]: any;
}

interface VariantDimension {
  name: string;
  label: string;
  options: string[];
}

interface VariantConfiguratorProps {
  value?: string;
  onChange: (value: string) => void;
  schema?: any;
  formData?: any;
  organizationId?: string;
  productId?: string;
}

const VariantConfigurator: React.FC<VariantConfiguratorProps> = ({
  value,
  onChange,
  schema,
  formData = {},
  organizationId = 'org-default',
  productId = 'temp-product'
}) => {
  function isFieldVisible(field: any, currentFormData: any): boolean {
    if (!field.conditionalVisibility) return true;
    const { showWhen } = field.conditionalVisibility;
    if (showWhen) {
      try {
        let expression = showWhen;
        Object.keys(currentFormData).forEach(key => {
          const val = currentFormData[key];
          const valStr = typeof val === 'string' ? `'${val}'` : val;
          expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), valStr);
        });
        return new Function(`return ${expression}`)();
      } catch {
        return true;
      }
    }
    return true;
  }

  const { variantDimensions, variantConfig } = useMemo(() => {
    if (!schema?.fields) return { variantDimensions: [], variantConfig: [] };

    const dimensionFields = schema.fields.filter((field: any) => {
      const fieldName = field.fieldName || field.name || '';
      const isVariantOnly = field.variantScope === 'variant_only';
      const hasOptions = (field.fieldType === 'SELECT' || field.fieldType === 'select') &&
                        field.options && Array.isArray(field.options) && field.options.length > 0;

      if (!hasOptions) return false;
      if (isVariantOnly) return true;

      const fieldNameLower = fieldName.toLowerCase();
      const isCommonVariantField =
        fieldNameLower.includes('color') || fieldNameLower.includes('size') ||
        fieldNameLower.includes('material') || fieldNameLower.includes('style') ||
        fieldNameLower.includes('pattern') || fieldNameLower.includes('finish') ||
        fieldNameLower.includes('texture') || fieldNameLower.includes('fabric') ||
        fieldNameLower.includes('type') || fieldNameLower.includes('variant');

      const isExplicitVariantDimension =
        field.validationRules?.isVariantDimension ||
        field.businessContext?.variantDimension ||
        field.metadata?.variantDimension;

      return (isCommonVariantField || isExplicitVariantDimension) && isFieldVisible(field, formData);
    });

    const dimensions: VariantDimension[] = dimensionFields.map((field: any) => ({
      name: field.fieldName || field.name,
      label: field.label,
      options: field.options.map((opt: any) =>
        typeof opt === 'string' ? opt : opt.value || opt.label || opt
      )
    }));

    const getVariantFields = () => {
      const variantField = schema.fields.find((f: any) =>
        f.fieldName === 'variantConfigurator' || f.name === 'variantConfigurator'
      );

      if (variantField?.validationRules?.variantFields) {
        return variantField.validationRules.variantFields;
      }

      const dualFields = schema.fields.filter((f: any) => f.variantScope === 'dual');
      if (dualFields.length > 0) {
        return [
          ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
          { name: 'variantImages', label: 'Images', type: 'images' },
          ...dualFields.map((f: any) => ({
            name: f.fieldName || f.name,
            label: f.label,
            type: f.fieldType === 'NUMBER' || f.fieldType === 'number' ? 'number' : 'text'
          })),
        ];
      }

      return [
        ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
        { name: 'variantImages', label: 'Images', type: 'images' },
        { name: 'price', label: 'Price', type: 'number' },
        { name: 'cost', label: 'Cost', type: 'number' },
        { name: 'comparePrice', label: 'Compare Price', type: 'number' },
        { name: 'stock', label: 'Stock', type: 'number' },
        { name: 'sku', label: 'SKU', type: 'text' },
        { name: 'weight', label: 'Weight', type: 'number' },
        { name: 'barcode', label: 'Barcode', type: 'text' }
      ];
    };

    return { variantDimensions: dimensions, variantConfig: getVariantFields() };
  }, [schema, formData]);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [lastCategory, setLastCategory] = useState<string | undefined>(formData?.category);

  React.useEffect(() => {
    const currentCategory = formData?.category;
    if (currentCategory !== lastCategory && variantDimensions.length > 0) {
      const resetSelections: Record<string, string[]> = {};
      variantDimensions.forEach(dim => { resetSelections[dim.name] = []; });
      setSelectedOptions(resetSelections);
      setVariants([]);
      setLastCategory(currentCategory);
    }
  }, [formData?.category, variantDimensions, lastCategory]);

  React.useEffect(() => {
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
          setVariants(parsed.variants);
          if (parsed.options) setSelectedOptions(parsed.options);
        }
      } catch {
        // ignore
      }
    }
  }, [value]);

  const updateParent = (newVariants: VariantOption[], selections: Record<string, string[]>) => {
    const config = {
      variants: newVariants,
      options: selections,
      totalVariants: newVariants.length,
      dimensions: variantDimensions.map(dim => ({
        name: dim.name,
        label: dim.label,
        selectedCount: selections[dim.name]?.length || 0,
        totalOptions: dim.options.length
      }))
    };
    onChange(JSON.stringify(config, null, 2));
  };

  const handleOptionChange = (dimensionName: string, optionValue: string, checked: boolean) => {
    const newSelections = { ...selectedOptions };
    if (checked) {
      newSelections[dimensionName] = [...(newSelections[dimensionName] || []), optionValue];
    } else {
      newSelections[dimensionName] = (newSelections[dimensionName] || []).filter(v => v !== optionValue);
    }
    setSelectedOptions(newSelections);
  };

  const generateVariants = () => {
    const activeDimensions = variantDimensions.filter(dim =>
      selectedOptions[dim.name] && selectedOptions[dim.name].length > 0
    );
    if (activeDimensions.length === 0) return;

    const generateCombinations = (dims: VariantDimension[], current: Record<string, string> = {}): Record<string, string>[] => {
      if (dims.length === 0) return [current];
      const [first, ...rest] = dims;
      const selected = selectedOptions[first.name] || [];
      return selected.flatMap(val =>
        generateCombinations(rest, { ...current, [first.name]: val })
      );
    };

    const allCombinations = generateCombinations(activeDimensions);

    const newVariants: VariantOption[] = allCombinations.map(combination => {
      const idParts = activeDimensions.map(dim => combination[dim.name]).join('-');
      const id = idParts.toLowerCase().replace(/\s+/g, '-');
      const existing = variants.find(v => v.id === id);

      const variant: VariantOption = {
        id,
        ...combination,
        variantImages: existing?.variantImages || [],
        price: existing?.price || 0,
        cost: existing?.cost || 0,
        comparePrice: existing?.comparePrice || 0,
        stock: existing?.stock || 0,
        weight: existing?.weight || 0,
        sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
        barcode: existing?.barcode || ''
      };

      variantConfig.forEach((field: any) => {
        if (!Object.prototype.hasOwnProperty.call(variant, field.name)) {
          const existingValue = existing?.[field.name];
          variant[field.name] = field.type === 'number' ? (existingValue || 0) : (existingValue || '');
        }
      });

      return variant;
    });

    setVariants(newVariants);
  };

  const updateVariant = (id: string, field: string, newValue: any) => {
    const updated = variants.map(v => v.id === id ? { ...v, [field]: newValue } : v);
    setVariants(updated);
    updateParent(updated, selectedOptions);
  };

  const totalCombinations = variantDimensions.reduce((total, dim) => {
    const selectedCount = selectedOptions[dim.name]?.length || 0;
    return selectedCount > 0 ? total * selectedCount : total;
  }, 1);

  return (
    <div className="space-y-6">
      {/* Option selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {variantDimensions.map(dimension => (
          <div key={dimension.name}>
            <h4 className="font-medium mb-3">
              {dimension.label}
            </h4>
            <div className="flex flex-wrap gap-2">
              {dimension.options.map(option => (
                <label key={option} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(selectedOptions[dimension.name] || []).includes(option)}
                    onChange={(e) => handleOptionChange(dimension.name, option, e.target.checked)}
                  />
                  <span className="text-sm px-2 py-1 bg-gray-100 rounded">{option}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {selectedOptions[dimension.name]?.length || 0} of {dimension.options.length} selected
            </div>
          </div>
        ))}
      </div>

      {/* Generate button */}
      <div className="flex gap-4 items-center">
        <button
          type="button"
          onClick={generateVariants}
          disabled={totalCombinations === 1}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Preview Variants
          {variantDimensions.length > 0 && (
            <span className="ml-2">
              ({variantDimensions.map(dim => selectedOptions[dim.name]?.length || 0).join(' × ')} = {totalCombinations} SKUs)
            </span>
          )}
        </button>
        {variantDimensions.length > 0 && (
          <div className="text-sm text-gray-600">
            {variantDimensions.length} option{variantDimensions.length !== 1 ? 's' : ''} available
          </div>
        )}
      </div>

      {/* Variants table */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Generated SKUs ({variants.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  {variantConfig.map((field: any) => (
                    <th key={field.name} className="border border-gray-300 px-3 py-2 text-left">{field.label}</th>
                  ))}
                  <th className="border border-gray-300 px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map(variant => (
                  <tr key={variant.id} className="hover:bg-gray-50">
                    {variantConfig.map((field: any) => (
                      <td key={field.name} className="border border-gray-300 px-3 py-2">
                        {field.type === 'images' ? (
                          <VariantMultiImageUpload
                            variantId={variant.id}
                            currentImages={variant[field.name] || []}
                            onImagesChange={(imageUrls) => updateVariant(variant.id, field.name, imageUrls)}
                            organizationId={organizationId}
                            productId={productId}
                            maxImages={5}
                          />
                        ) : field.name.toLowerCase().includes('color') && typeof variant[field.name] === 'string' ? (
                          <div className="flex items-center">
                            <div className="w-6 h-6 rounded border inline-block mr-2" style={{ backgroundColor: variant[field.name] }} />
                            {variant[field.name]}
                          </div>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={variant[field.name] || 0}
                            onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
                            className="w-20 p-1 border rounded"
                            step={['price', 'cost', 'comparePrice'].includes(field.name) ? '0.01' : '1'}
                            min="0"
                          />
                        ) : field.type === 'text' ? (
                          <input
                            type="text"
                            value={variant[field.name] || ''}
                            onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
                            className="w-24 p-1 border rounded text-xs"
                          />
                        ) : (
                          <span>{variant[field.name] || '-'}</span>
                        )}
                      </td>
                    ))}
                    <td className="border border-gray-300 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = variants.filter(v => v.id !== variant.id);
                          setVariants(updated);
                          updateParent(updated, selectedOptions);
                        }}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-blue-50 rounded border">
            <div className="text-sm text-blue-800">
              {variants.length} SKU{variants.length !== 1 ? 's' : ''} · {variantDimensions.length} option{variantDimensions.length !== 1 ? 's' : ''} ({variantDimensions.map(d => d.label).join(', ')})
            </div>
          </div>
        </div>
      )}

      {variantDimensions.length === 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded dark:bg-gray-800 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            No options available for this product category. Select a category first to see available options like size or color.
          </div>
        </div>
      )}
    </div>
  );
};

export default VariantConfigurator;
