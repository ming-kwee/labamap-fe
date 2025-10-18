import React, { useState } from 'react';
import Input from '@/components/ui/input/Input';
import Button from '@/components/ui/button/Button';
import Badge from '@/components/ui/badge/Badge';
import { Plus, X } from '@/components/ui/icons/Icons';

interface VariantOptionEditorProps {
  onAdd: (name: string, values: string[]) => void;
}

function VariantOptionEditor({ onAdd }: VariantOptionEditorProps) {
  const [optionName, setOptionName] = useState('');
  const [optionValues, setOptionValues] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = () => {
    if (optionName.trim() && optionValues.trim()) {
      const values = optionValues.split(',').map(v => v.trim()).filter(v => v);
      onAdd(optionName.trim(), values);
      setOptionName('');
      setOptionValues('');
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setOptionName('');
    setOptionValues('');
    setIsAdding(false);
  };

  if (!isAdding) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsAdding(true)}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Variant Option
      </Button>
    );
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-dashed">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Option Name</label>
          <Input
            value={optionName}
            onChange={(e) => setOptionName(e.target.value)}
            placeholder="e.g., Size, Color, Material"
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Values (comma-separated)</label>
          <Input
            value={optionValues}
            onChange={(e) => setOptionValues(e.target.value)}
            placeholder="e.g., Small, Medium, Large or Red, Blue, Green"
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={handleAdd} size="sm">
            Add Option
          </Button>
          <Button type="button" variant="outline" onClick={handleCancel} size="sm">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ProductVariantsSectionProps {
  hasVariants: boolean;
  variantOptions: { name: string; values: string[] }[];
  variants: any[];
  toggleVariantsMode: (enabled: boolean) => void;
  addVariantOption: (name: string, values: string[]) => void;
  removeVariantOption: (index: number) => void;
  updateVariant: (index: number, field: string, value: any) => void;
}

export default function ProductVariantsSection({
  hasVariants,
  variantOptions,
  variants,
  toggleVariantsMode,
  addVariantOption,
  removeVariantOption,
  updateVariant
}: ProductVariantsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Product Variants</h3>
          <p className="text-sm text-gray-600">Create variations of this product (size, color, etc.)</p>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="hasVariants"
            checked={hasVariants}
            onChange={(e) => toggleVariantsMode(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="hasVariants" className="text-sm font-medium">
            This product has variants
          </label>
        </div>
      </div>

      {hasVariants && (
        <div className="space-y-6 border rounded-lg p-6 bg-gray-50 dark:bg-gray-800">
          {/* Variant Options */}
          <div className="space-y-4">
            <h4 className="font-medium">Variant Options</h4>
            
            {variantOptions.map((option, index) => (
              <div key={index} className="p-4 bg-white dark:bg-gray-700 rounded-lg border">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium">{option.name}</h5>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeVariantOption(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((value, valueIndex) => (
                      <Badge key={valueIndex} variant="light" color="light">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Add New Option */}
            <VariantOptionEditor onAdd={addVariantOption} />
          </div>

          {/* Generated Variants */}
          {variants.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Generated Variants ({variants.length})</h4>
                <Badge variant="light" color="success">
                  {variants.length} combinations
                </Badge>
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {variants.map((variant, index) => (
                  <div key={variant.id} className="p-4 bg-white dark:bg-gray-700 rounded-lg border">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                      <div>
                        <div className="font-medium text-sm">
                          {Object.entries(variant.options).map(([key, value]) => (
                            <span key={key} className="mr-2">
                              {key}: <strong>{String(value)}</strong>
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          SKU: {variant.sku}
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Price</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={variant.price || ''}
                          onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Quantity</label>
                        <Input
                          type="number"
                          value={variant.quantity || ''}
                          onChange={(e) => updateVariant(index, 'quantity', parseInt(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Weight</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={variant.weight || ''}
                          onChange={(e) => updateVariant(index, 'weight', parseFloat(e.target.value) || 0)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}