"use client";

/**
 * Fully Dynamic Variant Configurator
 * - Automatically detects ANY number of variant dimensions from backend schema
 * - No hardcoded color/size logic - completely data-driven
 * - Generates cartesian product of ALL dimensions automatically
 */

import React, { useState, useMemo } from 'react';

interface VariantOption {
  id: string;
  [key: string]: any; // Completely dynamic fields
}

interface VariantDimension {
  name: string;
  label: string;
  options: string[];
}

interface VariantConfiguratorDynamicProps {
  value?: string;
  onChange: (value: string) => void;
  schema?: any;
}

const VariantConfiguratorDynamic: React.FC<VariantConfiguratorDynamicProps> = ({ 
  value, 
  onChange, 
  schema 
}) => {
  // 🚀 AUTOMATICALLY DETECT ALL VARIANT DIMENSIONS FROM BACKEND SCHEMA
  const { variantDimensions, variantConfig } = useMemo(() => {
    if (!schema?.fields) return { variantDimensions: [], variantConfig: [] };
    
    // Find all fields that could be variant dimensions
    const dimensionFields = schema.fields.filter((field: any) => {
      // Check if field has selectable options
      const hasOptions = field.fieldType === 'SELECT' && 
                        field.options && 
                        Array.isArray(field.options) &&
                        field.options.length > 0;
      
      if (!hasOptions) return false;
      
      // Auto-detect common variant dimension patterns
      const fieldName = field.fieldName.toLowerCase();
      const isCommonVariantField = 
        fieldName.includes('color') ||
        fieldName.includes('size') ||
        fieldName.includes('material') ||
        fieldName.includes('style') ||
        fieldName.includes('pattern') ||
        fieldName.includes('finish') ||
        fieldName.includes('texture') ||
        fieldName.includes('fabric') ||
        fieldName.includes('type') ||
        fieldName.includes('variant');
      
      // Or explicitly marked as variant dimension in backend
      const isExplicitVariantDimension = 
        field.validationRules?.isVariantDimension ||
        field.businessContext?.variantDimension ||
        field.metadata?.variantDimension;
      
      return isCommonVariantField || isExplicitVariantDimension;
    });
    
    const dimensions: VariantDimension[] = dimensionFields.map((field: any) => ({
      name: field.fieldName,
      label: field.label,
      options: field.options.map((opt: any) => 
        typeof opt === 'string' ? opt : opt.value || opt.label || opt
      )
    }));
    
    // Get variant table configuration
    const getVariantFields = () => {
      const variantField = schema.fields.find((f: any) => f.fieldName === 'variantConfigurator');
      
      if (variantField?.validationRules?.variantFields) {
        return variantField.validationRules.variantFields;
      }
      
      // Auto-generate config from detected dimensions + standard fields
      const autoConfig = [
        ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
        { name: 'price', label: 'Price', type: 'number' },
        { name: 'cost', label: 'Cost', type: 'number' },
        { name: 'comparePrice', label: 'Compare Price', type: 'number' },
        { name: 'stock', label: 'Stock', type: 'number' },
        { name: 'sku', label: 'SKU', type: 'text' },
        { name: 'weight', label: 'Weight', type: 'number' },
        { name: 'barcode', label: 'Barcode', type: 'text' }
      ];
      
      return autoConfig;
    };
    
    console.log('[VariantConfiguratorDynamic] Detected dimensions:', dimensions);
    
    return {
      variantDimensions: dimensions,
      variantConfig: getVariantFields()
    };
  }, [schema]);

  // 🚀 DYNAMIC STATE FOR ALL DIMENSIONS - NO HARDCODED FIELDS
  const initialSelections = useMemo(() => {
    const selections: Record<string, string[]> = {};
    variantDimensions.forEach(dim => {
      selections[dim.name] = [];
    });
    
    if (value) {
      try {
        const parsed = JSON.parse(value);
        variantDimensions.forEach(dim => {
          selections[dim.name] = parsed.options?.[dim.name] || [];
        });
      } catch {
        // Keep empty selections
      }
    }
    
    return selections;
  }, [value, variantDimensions]);

  const initialVariants = useMemo(() => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return parsed.variants || [];
    } catch {
      return [];
    }
  }, [value]);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(initialSelections);
  const [variants, setVariants] = useState<VariantOption[]>(initialVariants);

  // 🚀 COMPLETELY DYNAMIC PARENT UPDATE - NO HARDCODED FIELDS
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
    
    const jsonString = JSON.stringify(config, null, 2);
    console.log('[VariantConfiguratorDynamic] Updating parent with:', config);
    onChange(jsonString);
  };

  // 🚀 DYNAMIC OPTION CHANGE HANDLER - WORKS FOR ANY DIMENSION
  const handleOptionChange = (dimensionName: string, optionValue: string, checked: boolean) => {
    const newSelections = { ...selectedOptions };
    
    if (checked) {
      newSelections[dimensionName] = [...(newSelections[dimensionName] || []), optionValue];
    } else {
      newSelections[dimensionName] = (newSelections[dimensionName] || []).filter(v => v !== optionValue);
    }
    
    setSelectedOptions(newSelections);
    console.log('[VariantConfiguratorDynamic] Updated selections:', newSelections);
  };

  // 🚀 COMPLETELY DYNAMIC CARTESIAN PRODUCT GENERATION
  const generateVariants = () => {
    console.log('[VariantConfiguratorDynamic] Generating variants with selections:', selectedOptions);
    
    // Get all dimension values that have selections
    const activeDimensions = variantDimensions.filter(dim => 
      selectedOptions[dim.name] && selectedOptions[dim.name].length > 0
    );
    
    if (activeDimensions.length === 0) {
      console.log('[VariantConfiguratorDynamic] No dimensions selected');
      return;
    }
    
    // 🔥 RECURSIVE CARTESIAN PRODUCT - WORKS FOR ANY NUMBER OF DIMENSIONS
    const generateCombinations = (dimensions: VariantDimension[], currentCombination: Record<string, string> = {}): Record<string, string>[] => {
      if (dimensions.length === 0) {
        return [currentCombination];
      }
      
      const [firstDimension, ...restDimensions] = dimensions;
      const selectedValues = selectedOptions[firstDimension.name] || [];
      
      const combinations: Record<string, string>[] = [];
      
      selectedValues.forEach(value => {
        const newCombination = { ...currentCombination, [firstDimension.name]: value };
        const subCombinations = generateCombinations(restDimensions, newCombination);
        combinations.push(...subCombinations);
      });
      
      return combinations;
    };
    
    const allCombinations = generateCombinations(activeDimensions);
    console.log('[VariantConfiguratorDynamic] Generated combinations:', allCombinations);
    
    // Create variants from combinations
    const newVariants: VariantOption[] = allCombinations.map(combination => {
      // Create unique ID from all dimension values
      const idParts = activeDimensions.map(dim => combination[dim.name]).join('-');
      const id = idParts.toLowerCase().replace(/\s+/g, '-');
      
      // Find existing variant to preserve user inputs
      const existing = variants.find(v => v.id === id);
      
      // Create variant with all dimension values
      const variant: VariantOption = {
        id,
        ...combination, // All dimension values (color, size, material, etc.)
        price: existing?.price || 0,
        cost: existing?.cost || 0,
        comparePrice: existing?.comparePrice || 0,
        stock: existing?.stock || 0,
        weight: existing?.weight || 0,
        sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
        barcode: existing?.barcode || ''
      };
      
      // Add any additional fields from variant config
      variantConfig.forEach((field: any) => {
        if (!variant.hasOwnProperty(field.name)) {
          const existingValue = existing?.[field.name];
          variant[field.name] = field.type === 'number' ? (existingValue || 0) : (existingValue || '');
        }
      });
      
      return variant;
    });
    
    console.log('[VariantConfiguratorDynamic] Created variants:', newVariants);
    setVariants(newVariants);
    updateParent(newVariants, selectedOptions);
  };

  // 🚀 DYNAMIC VARIANT UPDATE
  const updateVariant = (id: string, field: string, newValue: any) => {
    const updatedVariants = variants.map(variant => 
      variant.id === id ? { ...variant, [field]: newValue } : variant
    );
    setVariants(updatedVariants);
    updateParent(updatedVariants, selectedOptions);
  };

  // Calculate total possible combinations
  const totalCombinations = variantDimensions.reduce((total, dim) => {
    const selectedCount = selectedOptions[dim.name]?.length || 0;
    return selectedCount > 0 ? total * selectedCount : total;
  }, 1);

  return (
    <div className="space-y-6">
      {/* 🚀 DYNAMIC DIMENSION SELECTORS - NO HARDCODED COLOR/SIZE */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {variantDimensions.map(dimension => (
          <div key={dimension.name}>
            <h4 className="font-medium mb-3">
              {dimension.label} ({dimension.options.length} available)
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
            <div className="mt-2 text-xs text-gray-600">
              Selected: {selectedOptions[dimension.name]?.length || 0} of {dimension.options.length}
            </div>
          </div>
        ))}
      </div>

      {/* 🚀 DYNAMIC GENERATION BUTTON */}
      <div className="flex gap-4 items-center">
        <button
          type="button"
          onClick={generateVariants}
          disabled={totalCombinations === 1}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Generate Variants 
          {variantDimensions.length > 0 && (
            <span className="ml-2">
              ({variantDimensions.map(dim => selectedOptions[dim.name]?.length || 0).join(' × ')} = {totalCombinations})
            </span>
          )}
        </button>
        
        {variantDimensions.length > 0 && (
          <div className="text-sm text-gray-600">
            {variantDimensions.length} dimension{variantDimensions.length !== 1 ? 's' : ''} detected from backend schema
          </div>
        )}
      </div>

      {/* 🚀 DYNAMIC VARIANTS TABLE */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Generated Variants ({variants.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  {variantConfig.map((field: any) => (
                    <th key={field.name} className="border border-gray-300 px-3 py-2 text-left">
                      {field.label}
                    </th>
                  ))}
                  <th className="border border-gray-300 px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map(variant => (
                  <tr key={variant.id} className="hover:bg-gray-50">
                    {variantConfig.map((field: any) => (
                      <td key={field.name} className="border border-gray-300 px-3 py-2">
                        {/* Special handling for color display */}
                        {field.name.toLowerCase().includes('color') && typeof variant[field.name] === 'string' ? (
                          <div className="flex items-center">
                            <div 
                              className="w-6 h-6 rounded border inline-block mr-2"
                              style={{ backgroundColor: variant[field.name] }}
                            />
                            {variant[field.name]}
                          </div>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={variant[field.name] || 0}
                            onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
                            className="w-20 p-1 border rounded"
                            step={['price', 'cost', 'comparePrice'].includes(field.name) ? "0.01" : "1"}
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
                          const newVariants = variants.filter(v => v.id !== variant.id);
                          setVariants(newVariants);
                          updateParent(newVariants, selectedOptions);
                        }}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 🚀 DYNAMIC SUMMARY */}
          <div className="p-3 bg-blue-50 rounded border">
            <div className="text-sm space-y-1">
              <div><strong>Total Variants:</strong> {variants.length}</div>
              <div><strong>Dimensions:</strong> {variantDimensions.map(d => d.label).join(', ')}</div>
              <div><strong>Schema Fields:</strong> {variantConfig.length} configured</div>
              {variants.length > 0 && variants.some(v => v.price) && (
                <div><strong>Price Range:</strong> ${Math.min(...variants.filter(v => v.price).map(v => v.price))} - ${Math.max(...variants.filter(v => v.price).map(v => v.price))}</div>
              )}
              {variants.length > 0 && variants.some(v => v.stock) && (
                <div><strong>Total Stock:</strong> {variants.reduce((sum, v) => sum + (v.stock || 0), 0)} units</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Debug Info */}
      {variantDimensions.length === 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
          <div className="text-sm text-yellow-800">
            <strong>No variant dimensions detected.</strong> Make sure your backend schema includes SELECT fields for variant options (color, size, material, etc.).
          </div>
        </div>
      )}
    </div>
  );
};

export default VariantConfiguratorDynamic;