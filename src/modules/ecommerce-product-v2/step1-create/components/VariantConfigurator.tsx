"use client";

/**
 * VariantConfigurator
 * Fully dynamic variant configurator — detects dimensions from backend schema.
 * Phase 5: when productTypeDimensions is provided, those dimensions take
 * precedence over the heuristic schema detection (filtered + sorted by type order).
 */

import React, { useState, useMemo } from 'react';
import VariantMultiImageUpload from './VariantMultiImageUpload';
import SkuMatrixPreview from './SkuMatrixPreview';
import type { VariantDimension as ProductTypeVariantDimension } from '@/app/(admin)/omni-admin/product-types/_types/product-type';

// Module-level constant — must not be inside the component or a useMemo,
// because it is referenced by useState initializers that run before any hook.
const NON_DIMENSION_KEYS = new Set([
  'id', '_id', 'sku', 'SKU', 'price', 'comparePrice', 'compareAtPrice',
  'inventory', 'quantity', 'stock', 'stockQuantity', 'costPrice',
  'barcode', 'weight', 'variantImages', 'images', 'galleryImages',
  'variantLabel', 'variantOptions',
]);

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
  /**
   * Phase 5: ordered variant dimensions from the category's ProductType.
   * When provided, only schema fields whose name matches an attributeCode here
   * are used as dimensions, ordered by ProductType.variantDimension.order.
   * Falls back to heuristic schema detection when empty/undefined.
   */
  productTypeDimensions?: ProductTypeVariantDimension[];
  /**
   * Phase 5: options per dimension axis fetched from master attributes.
   * Maps attributeCode → string[] of selectable values (e.g. "color" → ["Red","Blue"]).
   * When provided alongside productTypeDimensions, bypasses schema-derived options entirely.
   */
  dimensionOptions?: Map<string, string[]>;
  /** Display name of the resolved ProductType (shown in banner). */
  productTypeName?: string | null;
  /** True while the ProductType + attribute options are being fetched. */
  isLoadingVariantOptions?: boolean;
}

const VariantConfigurator: React.FC<VariantConfiguratorProps> = ({
  value,
  onChange,
  schema,
  formData = {},
  organizationId = 'org-default',
  productId = 'temp-product',
  productTypeDimensions = [],
  dimensionOptions,
  productTypeName,
  isLoadingVariantOptions = false,
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
        { name: 'comparePrice', label: 'Compare Price', type: 'number' },
        { name: 'inventory', label: 'Inventory', type: 'number' },
        { name: 'sku', label: 'SKU', type: 'text' },
        { name: 'barcode', label: 'Barcode', type: 'text' },
        { name: 'weight', label: 'Weight', type: 'number' }
      ];
    };

    return { variantDimensions: dimensions, variantConfig: getVariantFields() };
  }, [schema, formData]);

  // Phase 5: when productTypeDimensions + dimensionOptions are provided, build dimensions
  // directly from the ProductType — bypasses schema-derived options entirely.
  // This fixes the case where the schema endpoint doesn't return SELECT options.
  const activeDimensions = useMemo(() => {
    if (productTypeDimensions.length > 0 && dimensionOptions && dimensionOptions.size > 0) {
      // Primary path: type-driven with fetched options
      return productTypeDimensions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(dim => ({
          name: dim.attributeCode,
          label: dim.attributeName,
          options: dimensionOptions.get(dim.attributeCode) ?? [],
        }))
        .filter(dim => dim.options.length > 0);
    }

    if (productTypeDimensions.length > 0) {
      // Type-driven but options not yet loaded — filter + sort schema-derived dims as fallback
      const normalize = (s: string) => s.toLowerCase().replace(/[_-]/g, '');
      const codeToOrder = new Map(productTypeDimensions.map(d => [normalize(d.attributeCode), d.order]));
      const filtered = variantDimensions.filter(dim => codeToOrder.has(normalize(dim.name)));
      filtered.sort((a, b) => {
        const orderA = codeToOrder.get(normalize(a.name)) ?? 999;
        const orderB = codeToOrder.get(normalize(b.name)) ?? 999;
        return orderA - orderB;
      });
      return filtered;
    }

    // Heuristic fallback: use schema-derived dimensions (no productType assigned)
    return variantDimensions;
  }, [variantDimensions, productTypeDimensions, dimensionOptions]);

  // Parse value prop once synchronously so variants and selectedOptions are available
  // on the FIRST render (avoiding the effect-delay that caused derivedDimensions to be
  // empty until after the first paint).
  function parseValue(v: string | undefined): { variants: VariantOption[]; options: Record<string, string[]> | null } {
    if (!v) return { variants: [], options: null };
    try {
      const parsed = typeof v === 'string' ? JSON.parse(v) : v;
      const rawArr = Array.isArray(parsed?.variants) ? parsed.variants as VariantOption[] : [];
      // Normalise: ensure every variant has an `id` so React keys and updateVariant() work.
      const variantArr = rawArr.map((variant, idx) => {
        if (variant.id) return variant;
        // Derive id from sku, or from dimension values, or index fallback
        const skuVal = variant.sku as string | undefined;
        const dimId = Object.entries(variant)
          .filter(([k]) => !NON_DIMENSION_KEYS.has(k))
          .map(([, val]) => String(val).toLowerCase().replace(/\s+/g, '-'))
          .join('-');
        return { ...variant, id: dimId || skuVal || `variant-${idx}` };
      });
      return { variants: variantArr, options: parsed?.options ?? null };
    } catch {
      return { variants: [], options: null };
    }
  }

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(() => {
    const { variants: initVars, options } = parseValue(value);
    if (options) return options;
    // Derive from variants when options not explicitly stored (edit mode)
    const derived: Record<string, string[]> = {};
    for (const v of initVars) {
      for (const [key, val] of Object.entries(v)) {
        if (NON_DIMENSION_KEYS.has(key)) continue;
        if (val == null || typeof val !== 'string' || !val.trim()) continue;
        if (!derived[key]) derived[key] = [];
        if (!derived[key].includes(val as string)) derived[key].push(val as string);
      }
    }
    return derived;
  });
  const [variants, setVariants] = useState<VariantOption[]>(() => parseValue(value).variants);
  const [lastCategory, setLastCategory] = useState<string | undefined>(formData?.category);

  // Derive dimensions from existing variant data when schema/ProductType don't provide them.
  // This is the edit-mode path: essential schema has no type-specific SELECT fields, but the
  // backend GET now returns the saved variants with dimension values at the top level (color,
  // size, etc.). Collecting unique values per non-standard field reconstructs the option axes.
  const derivedDimensions = useMemo((): VariantDimension[] => {
    if (activeDimensions.length > 0 || variants.length === 0) return [];
    const dimMap = new Map<string, Set<string>>();
    for (const variant of variants) {
      for (const [key, val] of Object.entries(variant)) {
        if (NON_DIMENSION_KEYS.has(key)) continue;
        if (val == null || typeof val !== 'string' || !val.trim()) continue;
        if (!dimMap.has(key)) dimMap.set(key, new Set());
        dimMap.get(key)!.add(val as string);
      }
    }
    return Array.from(dimMap.entries()).map(([name, values]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      options: Array.from(values),
    }));
  }, [activeDimensions, variants]);

  // Effective dimensions: prefer schema/ProductType; fall back to variant-derived.
  const effectiveDimensions = activeDimensions.length > 0 ? activeDimensions : derivedDimensions;

  // Effective variant table columns — inject dimension columns when schema didn't include them.
  // In edit mode, schema is essential (no type-specific fields), so variantConfig has no
  // dimension columns (Color, Size, Material). effectiveDimensions derives them from variant
  // data. We prepend them here so the table shows the correct columns.
  const effectiveVariantConfig = useMemo(() => {
    if (effectiveDimensions.length === 0) return variantConfig;
    const existingDimNames = new Set(
      (variantConfig as Array<{ name: string; label: string; type: string }>)
        .filter(f => effectiveDimensions.some(d => d.name === f.name))
        .map(f => f.name)
    );
    // Already has dimension columns — schema provided them
    if (existingDimNames.size > 0) return variantConfig;
    // Prepend dimension columns before the non-dimension columns
    const dimCols = effectiveDimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' }));
    const nonDimCols = (variantConfig as Array<{ name: string; label: string; type: string }>)
      .filter(f => !effectiveDimensions.some(d => d.name === f.name));
    return [...dimCols, ...nonDimCols];
  }, [variantConfig, effectiveDimensions]);

  React.useEffect(() => {
    const currentCategory = formData?.category;
    if (currentCategory !== lastCategory && activeDimensions.length > 0) {
      const resetSelections: Record<string, string[]> = {};
      activeDimensions.forEach(dim => { resetSelections[dim.name] = []; });
      setSelectedOptions(resetSelections);
      setVariants([]);
      setLastCategory(currentCategory);
    }
  }, [formData?.category, activeDimensions, lastCategory]);

  React.useEffect(() => {
    if (!value) return;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed?.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
        setVariants(parsed.variants);
        if (parsed.options) {
          // Stored options (from original create flow)
          setSelectedOptions(parsed.options);
        } else {
          // Edit mode: options not in stored JSON — derive selected values from variant data.
          // Each dimension key holds the set of values actually used across all variants.
          const derived: Record<string, string[]> = {};
          for (const variant of parsed.variants as VariantOption[]) {
            for (const [key, val] of Object.entries(variant)) {
              if (NON_DIMENSION_KEYS.has(key)) continue;
              if (val == null || typeof val !== 'string' || !val.trim()) continue;
              if (!derived[key]) derived[key] = [];
              if (!derived[key].includes(val as string)) derived[key].push(val as string);
            }
          }
          if (Object.keys(derived).length > 0) setSelectedOptions(derived);
        }
      }
    } catch {
      // ignore malformed JSON
    }
  // NON_DIMENSION_KEYS is a stable Set created in useMemo — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateParent = (newVariants: VariantOption[], selections: Record<string, string[]>) => {
    const config = {
      variants: newVariants,
      options: selections,
      totalVariants: newVariants.length,
      dimensions: activeDimensions.map(dim => ({
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
    const dimsWithSelections = effectiveDimensions.filter(dim =>
      selectedOptions[dim.name] && selectedOptions[dim.name].length > 0
    );
    if (dimsWithSelections.length === 0) return;

    const generateCombinations = (dims: VariantDimension[], current: Record<string, string> = {}): Record<string, string>[] => {
      if (dims.length === 0) return [current];
      const [first, ...rest] = dims;
      const selected = selectedOptions[first.name] || [];
      return selected.flatMap(val =>
        generateCombinations(rest, { ...current, [first.name]: val })
      );
    };

    const allCombinations = generateCombinations(dimsWithSelections);

    const newVariants: VariantOption[] = allCombinations.map(combination => {
      const idParts = dimsWithSelections.map(dim => combination[dim.name]).join('-');
      const id = idParts.toLowerCase().replace(/\s+/g, '-');
      const existing = variants.find(v => v.id === id);

      const variant: VariantOption = {
        id,
        ...combination,
        variantImages: existing?.variantImages || [],
        price: existing?.price || 0,
        comparePrice: existing?.comparePrice || 0,
        inventory: existing?.inventory || 0,
        sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
        barcode: existing?.barcode || '',
        weight: existing?.weight || 0
      };

      effectiveVariantConfig.forEach((field: any) => {
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

  const totalCombinations = effectiveDimensions.reduce((total, dim) => {
    const selectedCount = selectedOptions[dim.name]?.length || 0;
    return selectedCount > 0 ? total * selectedCount : total;
  }, 1);

  // Dimensions shaped for SkuMatrixPreview
  const matrixDimensions = effectiveDimensions.map(dim => ({
    name: dim.name,
    label: dim.label,
    selectedOptions: selectedOptions[dim.name] ?? [],
  }));

  const isTypeDriven = productTypeDimensions.length > 0;

  return (
    <div className="space-y-6">
      {/* Phase 5: ProductType banner */}
      {isTypeDriven && productTypeName && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 dark:text-brand-400 flex-shrink-0">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="text-xs text-brand-700 dark:text-brand-300">
            Variant axes driven by <strong>{productTypeName}</strong> product type
            {effectiveDimensions.length > 0 && (
              <span className="ml-1 font-normal text-brand-600 dark:text-brand-400">
                — {effectiveDimensions.map(d => d.label).join(' × ')}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Option selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {effectiveDimensions.map(dimension => (
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

      {/* SKU matrix live preview */}
      {totalCombinations > 1 && (
        <SkuMatrixPreview dimensions={matrixDimensions} totalSkus={totalCombinations} />
      )}

      {/* Generate button */}
      <div className="flex gap-4 items-center">
        <button
          type="button"
          onClick={generateVariants}
          disabled={totalCombinations === 1}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Confirm Variants
          {effectiveDimensions.length > 0 && (
            <span className="ml-2">
              ({effectiveDimensions.map(dim => selectedOptions[dim.name]?.length || 0).join(' × ')} = {totalCombinations} SKUs)
            </span>
          )}
        </button>
        {effectiveDimensions.length > 0 && (
          <div className="text-sm text-gray-600">
            {effectiveDimensions.length} option{effectiveDimensions.length !== 1 ? 's' : ''} available
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
                  {effectiveVariantConfig.map((field: any) => (
                    <th key={field.name} className="border border-gray-300 px-3 py-2 text-left">{field.label}</th>
                  ))}
                  <th className="border border-gray-300 px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, idx) => (
                  <tr key={variant.id ?? variant.sku ?? idx} className="hover:bg-gray-50">
                    {effectiveVariantConfig.map((field: any) => (
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
                            step={['price', 'comparePrice'].includes(field.name) ? '0.01' : '1'}
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
              {variants.length} SKU{variants.length !== 1 ? 's' : ''} · {effectiveDimensions.length} option{effectiveDimensions.length !== 1 ? 's' : ''} ({effectiveDimensions.map(d => d.label).join(', ')})
            </div>
          </div>
        </div>
      )}

      {effectiveDimensions.length === 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded dark:bg-gray-800 dark:border-gray-700">
          {isLoadingVariantOptions ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Loading variant options…
            </div>
          ) : isTypeDriven && productTypeDimensions.length === 0 ? (
            <div className="text-sm text-amber-700 dark:text-amber-400">
              The product type assigned to this category has no variant dimensions configured.
              Ask your admin to add dimensions (e.g. Color, Size) to the <strong>{productTypeName}</strong> product type.
            </div>
          ) : isTypeDriven && productTypeDimensions.length > 0 ? (
            <div className="text-sm text-amber-700 dark:text-amber-400">
              Variant dimensions are configured but no selectable options were found.
              Ask your admin to add options to the variant attributes (Color, Size, etc.) for the <strong>{productTypeName}</strong> product type.
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Select a product category to see available variant options (e.g. Size, Color).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VariantConfigurator;
