"use client";

/**
 * Simplified Variant Configurator - Avoids infinite loops with simpler state management
 */

import React, { useState, useMemo } from 'react';

interface VariantOption {
  id: string;
  color: string;
  size: string;
  price: number;
  cost: number;
  sku: string;
  stock: number;
  comparePrice?: number;
  weight?: number;
  barcode?: string;
  [key: string]: any;
}

interface VariantConfiguratorSimpleProps {
  value?: string;
  onChange: (value: string) => void;
  schema?: any;
}

const VariantConfiguratorSimple: React.FC<VariantConfiguratorSimpleProps> = ({ 
  value, 
  onChange, 
  schema 
}) => {
  // Extract options from schema once, with fallbacks
  const { colorOptions, sizeOptions, variantConfig } = useMemo(() => {
    const getOptionsFromField = (fieldName: string): string[] => {
      if (!schema?.fields) return [];
      
      const field = schema.fields.find((f: any) => 
        f.fieldName === fieldName || 
        f.fieldName.toLowerCase().includes(fieldName.toLowerCase())
      );
      
      if (field?.options && Array.isArray(field.options)) {
        return field.options.map((opt: any) => 
          typeof opt === 'string' ? opt : opt.value || opt.label || opt
        );
      }
      
      return [];
    };

    const getVariantFields = () => {
      const variantField = schema?.fields?.find((f: any) => f.fieldName === 'variantConfigurator');
      
      if (variantField?.validationRules?.variantFields) {
        return variantField.validationRules.variantFields;
      }
      
      // Default fields
      return [
        { name: 'color', label: 'Color', type: 'select' },
        { name: 'size', label: 'Size', type: 'select' },
        { name: 'price', label: 'Price', type: 'number' },
        { name: 'cost', label: 'Cost', type: 'number' },
        { name: 'comparePrice', label: 'Compare Price', type: 'number' },
        { name: 'stock', label: 'Stock', type: 'number' },
        { name: 'sku', label: 'SKU', type: 'text' },
        { name: 'weight', label: 'Weight', type: 'number' },
        { name: 'barcode', label: 'Barcode', type: 'text' }
      ];
    };

    const colors = getOptionsFromField('color');
    const sizes = getOptionsFromField('size');
    
    return {
      colorOptions: colors.length > 0 ? colors : ['red', 'blue', 'green', 'black', 'white'],
      sizeOptions: sizes.length > 0 ? sizes : ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      variantConfig: getVariantFields()
    };
  }, [schema]);

  // Parse initial value once
  const initialData = useMemo(() => {
    if (!value) return { variants: [], selectedColors: [], selectedSizes: [] };
    
    try {
      const parsed = JSON.parse(value);
      return {
        variants: parsed.variants || [],
        selectedColors: parsed.options?.color || [],
        selectedSizes: parsed.options?.size || []
      };
    } catch {
      return { variants: [], selectedColors: [], selectedSizes: [] };
    }
  }, [value]);

  const [selectedColors, setSelectedColors] = useState<string[]>(initialData.selectedColors);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(initialData.selectedSizes);
  const [variants, setVariants] = useState<VariantOption[]>(initialData.variants);

  // Update parent immediately when variants change
  const updateParent = (newVariants: VariantOption[], colors: string[], sizes: string[]) => {
    const config = {
      variants: newVariants,
      options: { color: colors, size: sizes },
      totalVariants: newVariants.length
    };
    const jsonString = JSON.stringify(config, null, 2);
    console.log('[VariantConfiguratorSimple] Updating parent with:', jsonString);
    onChange(jsonString);
  };

  const generateVariants = () => {
    const newVariants: VariantOption[] = [];
    
    selectedColors.forEach(color => {
      selectedSizes.forEach(size => {
        const id = `${color}-${size}`.toLowerCase();
        const existingVariant = variants.find(v => v.color === color && v.size === size);
        
        const variant: VariantOption = {
          id,
          color,
          size,
          price: existingVariant?.price || 0,
          cost: existingVariant?.cost || 0,
          sku: existingVariant?.sku || `SKU-${color.toUpperCase()}-${size}`,
          stock: existingVariant?.stock || 0
        };
        
        // Add dynamic fields
        variantConfig.forEach((field: any) => {
          if (!['color', 'size', 'price', 'cost', 'sku', 'stock'].includes(field.name)) {
            const existingValue = existingVariant ? (existingVariant as any)[field.name] : undefined;
            (variant as any)[field.name] = field.type === 'number' ? (existingValue || 0) : (existingValue || '');
          }
        });
        
        newVariants.push(variant);
      });
    });
    
    setVariants(newVariants);
    updateParent(newVariants, selectedColors, selectedSizes);
  };

  const updateVariant = (id: string, field: string, newValue: any) => {
    const updatedVariants = variants.map(variant => 
      variant.id === id ? { ...variant, [field]: newValue } : variant
    );
    setVariants(updatedVariants);
    updateParent(updatedVariants, selectedColors, selectedSizes);
  };

  const handleColorChange = (color: string, checked: boolean) => {
    const newColors = checked 
      ? [...selectedColors, color]
      : selectedColors.filter(c => c !== color);
    setSelectedColors(newColors);
  };

  const handleSizeChange = (size: string, checked: boolean) => {
    const newSizes = checked 
      ? [...selectedSizes, size]
      : selectedSizes.filter(s => s !== size);
    setSelectedSizes(newSizes);
  };

  return (
    <div className="space-y-6">
      {/* Color & Size Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium mb-3">Colors ({colorOptions.length} available)</h4>
          <div className="flex flex-wrap gap-2">
            {colorOptions.map(color => (
              <label key={color} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedColors.includes(color)}
                  onChange={(e) => handleColorChange(color, e.target.checked)}
                />
                <span className="text-sm px-2 py-1 bg-gray-100 rounded">{color}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3">Sizes ({sizeOptions.length} available)</h4>
          <div className="flex flex-wrap gap-2">
            {sizeOptions.map(size => (
              <label key={size} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSizes.includes(size)}
                  onChange={(e) => handleSizeChange(size, e.target.checked)}
                />
                <span className="text-sm px-2 py-1 bg-gray-100 rounded">{size}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={generateVariants}
          disabled={selectedColors.length === 0 || selectedSizes.length === 0}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Generate Variants ({selectedColors.length} × {selectedSizes.length} = {selectedColors.length * selectedSizes.length})
        </button>
      </div>

      {/* Variants Table */}
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
                        {field.name === 'color' ? (
                          <div className="flex items-center">
                            <div 
                              className="w-6 h-6 rounded border inline-block mr-2"
                              style={{ backgroundColor: (variant as any)[field.name] }}
                            />
                            {(variant as any)[field.name]}
                          </div>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={(variant as any)[field.name] || 0}
                            onChange={(e) => updateVariant(variant.id, field.name, Number(e.target.value))}
                            className="w-20 p-1 border rounded"
                            step={['price', 'cost', 'comparePrice'].includes(field.name) ? "0.01" : "1"}
                            min="0"
                          />
                        ) : field.type === 'text' ? (
                          <input
                            type="text"
                            value={(variant as any)[field.name] || ''}
                            onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
                            className="w-24 p-1 border rounded text-xs"
                          />
                        ) : (
                          <span>{(variant as any)[field.name] || '-'}</span>
                        )}
                      </td>
                    ))}
                    <td className="border border-gray-300 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newVariants = variants.filter(v => v.id !== variant.id);
                          setVariants(newVariants);
                          updateParent(newVariants, selectedColors, selectedSizes);
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

          {/* Summary */}
          <div className="p-3 bg-blue-50 rounded border">
            <div className="text-sm space-y-1">
              <div><strong>Total Variants:</strong> {variants.length}</div>
              <div><strong>Schema Fields:</strong> {variantConfig.length} configured</div>
              {variants.length > 0 && (
                <>
                  <div><strong>Price Range:</strong> ${Math.min(...variants.map(v => v.price))} - ${Math.max(...variants.map(v => v.price))}</div>
                  <div><strong>Total Stock:</strong> {variants.reduce((sum, v) => sum + v.stock, 0)} units</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariantConfiguratorSimple;