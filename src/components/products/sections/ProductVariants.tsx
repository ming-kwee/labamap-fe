"use client";
import React, { useState, useEffect } from "react";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { ProductData } from "../ProductCreateForm";

interface ProductVariantsProps {
  data: ProductData;
  onUpdate: (updates: Partial<ProductData>) => void;
}

interface VariantOption {
  name: string;
  values: string[];
}

interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  inventory: number;
  attributes: Record<string, string>;
  images?: string[];
  barcode?: string;
  weight?: number;
  enabled: boolean;
}

const commonVariantTypes = [
  { name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] },
  { name: "Color", values: ["Red", "Blue", "Green", "Black", "White"] },
  { name: "Material", values: ["Cotton", "Polyester", "Wool", "Silk", "Leather"] },
  { name: "Style", values: ["Classic", "Modern", "Vintage", "Casual", "Formal"] },
];

export default function ProductVariants({ data, onUpdate }: ProductVariantsProps) {
  const [variants, setVariants] = useState<ProductVariant[]>(data.variants || []);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>(data.variantOptions || []);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionValues, setNewOptionValues] = useState("");
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  useEffect(() => {
    // Auto-generate variants when options change
    if (variantOptions.length > 0 && data.hasVariants) {
      generateVariantCombinations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantOptions, data.hasVariants]);

  const handleVariantToggle = (hasVariants: boolean) => {
    onUpdate({ 
      hasVariants,
      variantOptions: hasVariants ? variantOptions : [],
      variants: hasVariants ? variants : [],
    });
  };

  const addVariantOption = (optionName?: string, optionValues?: string[]) => {
    const name = optionName || newOptionName.trim();
    const values = optionValues || newOptionValues.split(",").map(v => v.trim()).filter(v => v);
    
    if (name && values.length > 0) {
      const newOptions = [...variantOptions, { name, values }];
      setVariantOptions(newOptions);
      onUpdate({ variantOptions: newOptions });
      setNewOptionName("");
      setNewOptionValues("");
    }
  };

  const removeVariantOption = (index: number) => {
    const newOptions = variantOptions.filter((_, i) => i !== index);
    setVariantOptions(newOptions);
    onUpdate({ variantOptions: newOptions });
  };

  const updateVariantOption = (index: number, field: "name" | "values", value: string | string[]) => {
    const newOptions = variantOptions.map((option, i) => 
      i === index ? { ...option, [field]: value } : option
    );
    setVariantOptions(newOptions);
    onUpdate({ variantOptions: newOptions });
  };

  const generateVariantCombinations = () => {
    if (variantOptions.length === 0) return;

    setIsGeneratingVariants(true);
    
    setTimeout(() => {
      const combinations = generateCombinations(variantOptions);
      const newVariants: ProductVariant[] = combinations.map((combo) => {
        // Check if variant already exists
        const existingVariant = variants.find(v => 
          Object.keys(combo).every(key => v.attributes[key] === combo[key])
        );

        if (existingVariant) {
          return existingVariant;
        }

        // Generate SKU from attributes
        const skuSuffix = Object.values(combo).map(v => v.substring(0, 2).toUpperCase()).join("-");
        const sku = `${data.sku || "PRD"}-${skuSuffix}`;

        return {
          id: Math.random().toString(36).substr(2, 9),
          sku,
          price: data.basePrice || 0,
          inventory: 0,
          attributes: combo,
          enabled: true,
        };
      });

      setVariants(newVariants);
      onUpdate({ variants: newVariants });
      setIsGeneratingVariants(false);
    }, 1000);
  };

  const generateCombinations = (options: VariantOption[]): Record<string, string>[] => {
    if (options.length === 0) return [];
    if (options.length === 1) {
      return options[0].values.map(value => ({ [options[0].name]: value }));
    }

    const [firstOption, ...remainingOptions] = options;
    const remainingCombinations = generateCombinations(remainingOptions);

    const combinations: Record<string, string>[] = [];
    firstOption.values.forEach(value => {
      remainingCombinations.forEach(combo => {
        combinations.push({ [firstOption.name]: value, ...combo });
      });
    });

    return combinations;
  };

  const updateVariant = (id: string, field: keyof ProductVariant, value: ProductVariant[keyof ProductVariant]) => {
    const newVariants = variants.map(v => 
      v.id === id ? { ...v, [field]: value } : v
    );
    setVariants(newVariants);
    onUpdate({ variants: newVariants });
  };

  const deleteVariant = (id: string) => {
    const newVariants = variants.filter(v => v.id !== id);
    setVariants(newVariants);
    onUpdate({ variants: newVariants });
  };

  const bulkUpdateVariants = (field: keyof ProductVariant, value: ProductVariant[keyof ProductVariant]) => {
    const newVariants = variants.map(v => 
      selectedVariants.includes(v.id) ? { ...v, [field]: value } : v
    );
    setVariants(newVariants);
    onUpdate({ variants: newVariants });
  };

  const toggleVariantSelection = (id: string) => {
    setSelectedVariants(prev => 
      prev.includes(id) 
        ? prev.filter(vid => vid !== id)
        : [...prev, id]
    );
  };

  const selectAllVariants = () => {
    setSelectedVariants(variants.map(v => v.id));
  };

  const clearVariantSelection = () => {
    setSelectedVariants([]);
  };

  return (
    <div className="space-y-8">
      {/* Variant Toggle */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Product Variants</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create variations of your product with different attributes
            </p>
          </div>
          <Switch
            checked={data.hasVariants}
            onChange={handleVariantToggle}
          />
        </div>

        {!data.hasVariants && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enable variants if your product has different options like size, color, or material.
              This helps customers choose exactly what they want and improves inventory management.
            </p>
          </div>
        )}
      </div>

      {data.hasVariants && (
        <>
          {/* Variant Options */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Variant Options</h3>
              <Button 
                onClick={() => generateVariantCombinations()}
                disabled={isGeneratingVariants || variantOptions.length === 0}
              >
                {isGeneratingVariants ? "🔄 Generating..." : "🔄 Generate Variants"}
              </Button>
            </div>

            {/* Quick Add Common Options */}
            <div className="mb-6">
              <Label>Quick Add Common Options</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {commonVariantTypes.map((type) => (
                  <button
                    key={type.name}
                    onClick={() => addVariantOption(type.name, type.values)}
                    disabled={variantOptions.some(o => o.name === type.name)}
                    className="px-3 py-1 text-sm bg-brand-100 text-brand-800 dark:bg-brand-900/20 dark:text-brand-400 rounded-full hover:bg-brand-200 dark:hover:bg-brand-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + {type.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Current Options */}
            {variantOptions.length > 0 && (
              <div className="space-y-4 mb-6">
                {variantOptions.map((option, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <input
                        type="text"
                        value={option.name}
                        onChange={(e) => updateVariantOption(index, "name", e.target.value)}
                        className="font-medium text-lg bg-transparent border-none outline-none text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() => removeVariantOption(index)}
                        className="text-red-500 hover:text-red-600"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {option.values.map((value, valueIndex) => (
                        <span
                          key={valueIndex}
                          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full"
                        >
                          {value}
                          <button
                            onClick={() => {
                              const newValues = option.values.filter((_, i) => i !== valueIndex);
                              updateVariantOption(index, "values", newValues);
                            }}
                            className="text-gray-400 hover:text-red-500 ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Add new value (press Enter)"
                      className="w-full mt-2 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          const input = e.target as HTMLInputElement;
                          const newValue = input.value.trim();
                          if (newValue && !option.values.includes(newValue)) {
                            updateVariantOption(index, "values", [...option.values, newValue]);
                            input.value = "";
                          }
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Add New Option */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Option Name</Label>
                <Input
                  type="text"
                  placeholder="e.g., Size, Color, Material"
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                />
              </div>
              <div>
                <Label>Option Values (comma-separated)</Label>
                <Input
                  type="text"
                  placeholder="e.g., Small, Medium, Large"
                  value={newOptionValues}
                  onChange={(e) => setNewOptionValues(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      addVariantOption();
                    }
                  }}
                />
              </div>
            </div>
            <Button 
              onClick={() => addVariantOption()} 
              disabled={!newOptionName.trim() || !newOptionValues.trim()}
              className="mt-4"
            >
              Add Option
            </Button>
          </div>

          {/* Generated Variants */}
          {variants.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Generated Variants ({variants.length})
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Manage individual variant details and pricing
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => setBulkEditMode(!bulkEditMode)}
                    variant="outline"
                    size="sm"
                  >
                    {bulkEditMode ? "Exit Bulk Edit" : "Bulk Edit"}
                  </Button>
                  {bulkEditMode && (
                    <>
                      <Button onClick={selectAllVariants} variant="outline" size="sm">
                        Select All
                      </Button>
                      <Button onClick={clearVariantSelection} variant="outline" size="sm">
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Bulk Edit Actions */}
              {bulkEditMode && selectedVariants.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 dark:text-blue-400 mb-3">
                    Bulk Edit ({selectedVariants.length} selected)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Set Price</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          id="bulk-price"
                        />
                        <Button 
                          onClick={() => {
                            const price = parseFloat((document.getElementById("bulk-price") as HTMLInputElement).value) || 0;
                            bulkUpdateVariants("price", price);
                          }}
                          size="sm"
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>Set Inventory</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          id="bulk-inventory"
                        />
                        <Button 
                          onClick={() => {
                            const inventory = parseInt((document.getElementById("bulk-inventory") as HTMLInputElement).value) || 0;
                            bulkUpdateVariants("inventory", inventory);
                          }}
                          size="sm"
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>Set Status</Label>
                      <div className="flex gap-2">
                        <select 
                          id="bulk-status"
                          className="flex-1 h-11 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm"
                        >
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                        <Button 
                          onClick={() => {
                            const enabled = (document.getElementById("bulk-status") as HTMLSelectElement).value === "true";
                            bulkUpdateVariants("enabled", enabled);
                          }}
                          size="sm"
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Variants Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      {bulkEditMode && (
                        <th className="text-left p-3">
                          <input
                            type="checkbox"
                            checked={selectedVariants.length === variants.length}
                            onChange={(e) => e.target.checked ? selectAllVariants() : clearVariantSelection()}
                          />
                        </th>
                      )}
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Variant</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">SKU</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Price</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Inventory</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((variant) => (
                      <tr key={variant.id} className="border-b border-gray-100 dark:border-gray-800">
                        {bulkEditMode && (
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedVariants.includes(variant.id)}
                              onChange={() => toggleVariantSelection(variant.id)}
                            />
                          </td>
                        )}
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(variant.attributes).map(([key, value]) => (
                              <span
                                key={key}
                                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                              >
                                {key}: {value}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <Input
                            type="text"
                            value={variant.sku}
                            onChange={(e) => updateVariant(variant.id, "sku", e.target.value)}
                            className="w-32"
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            step="0.01"
                            value={variant.price}
                            onChange={(e) => updateVariant(variant.id, "price", parseFloat(e.target.value) || 0)}
                            className="w-24"
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            min="0"
                            value={variant.inventory}
                            onChange={(e) => updateVariant(variant.id, "inventory", parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </td>
                        <td className="p-3">
                          <Switch
                            checked={variant.enabled}
                            onChange={(checked) => updateVariant(variant.id, "enabled", checked)}
                          />
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => deleteVariant(variant.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Variant Insights */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl p-6 border border-green-200 dark:border-green-800">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm">📊</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-green-900 dark:text-green-400 mb-2">Variant Insights</h3>
                <div className="space-y-2 text-sm text-green-800 dark:text-green-300">
                  <p>• Total variants: {variants.length}</p>
                  <p>• Enabled variants: {variants.filter(v => v.enabled).length}</p>
                  <p>• Average price: ${variants.length > 0 ? (variants.reduce((sum, v) => sum + v.price, 0) / variants.length).toFixed(2) : "0.00"}</p>
                  <p>• Total inventory: {variants.reduce((sum, v) => sum + v.inventory, 0)} units</p>
                  {variants.some(v => v.inventory === 0) && (
                    <p className="text-amber-700 dark:text-amber-400">⚠️ Some variants are out of stock</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}