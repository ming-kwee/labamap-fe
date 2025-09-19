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
  // Master variant data (fallback values)
  masterData: {
    sku: string;
    title?: string;
    description?: string;
    price: number;
    inventory: number;
    costPrice?: number;
    comparePrice?: number;
    weight?: number;
    barcode?: string;
    enabled: boolean;
    taxable?: boolean;
    trackInventory?: boolean;
    lowStockThreshold?: number;
    dimensions?: {
      length: number;
      width: number;
      height: number;
    };
    images?: string[];
  };
  attributes: Record<string, string>;
  // Channel-specific overrides and configurations
  channelData: Record<string, {
    // Basic channel variant data
    sku?: string;
    title?: string;
    description?: string;
    price?: number;
    inventory?: number;
    costPrice?: number;
    comparePrice?: number;
    weight?: number;
    barcode?: string;
    enabled?: boolean;
    taxable?: boolean;
    
    // Channel-specific fields
    visibility?: boolean;
    tags?: string[];
    images?: string[];
    customFields?: Record<string, unknown>;
    
    // Channel-specific requirements (like Shopify vendor, Amazon ASIN, etc.)
    platformSpecific?: Record<string, unknown>;
    
    // SEO per channel
    seo?: {
      title?: string;
      description?: string;
      keywords?: string[];
      slug?: string;
    };
    
    // Inventory management per channel
    inventoryManagement?: {
      trackInventory?: boolean;
      lowStockThreshold?: number;
      allowBackorders?: boolean;
      reservedQuantity?: number;
    };
    
    // Last sync info
    lastSynced?: Date;
    syncStatus?: 'pending' | 'synced' | 'error';
    syncErrors?: string[];
  }>;
  
  // Global settings that apply to all channels
  globalSettings?: {
    requiresShipping?: boolean;
    hsCode?: string;
    countryOfOrigin?: string;
    notes?: string;
  };
}

const commonVariantTypes = [
  { name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] },
  { name: "Color", values: ["Red", "Blue", "Green", "Black", "White"] },
  { name: "Material", values: ["Cotton", "Polyester", "Wool", "Silk", "Leather"] },
  { name: "Style", values: ["Classic", "Modern", "Vintage", "Casual", "Formal"] },
];

export default function ProductVariants({ data, onUpdate }: ProductVariantsProps) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);

  // Helper function to transform optionGroups to internal VariantOption format
  const transformOptionGroupsToVariantOptions = (optionGroups: ProductData['optionGroups']): VariantOption[] => {
    return optionGroups.map(group => ({
      name: group.channel_option_name,
      values: group.channel_option_values.map(val => val.channel_option_value)
    }));
  };

  // Helper function to transform internal VariantOption format to optionGroups
  const transformVariantOptionsToOptionGroups = (options: VariantOption[]): ProductData['optionGroups'] => {
    return options.map(option => ({
      channel_option_name: option.name,
      channel_option_values: option.values.map(value => ({
        channel_option_value: value,
        channel_option_description: ""
      }))
    }));
  };

  // Helper function to transform internal ProductVariant format to variantGroups
  const transformVariantsToVariantGroups = (variants: ProductVariant[]): ProductData['variantGroups'] => {
    return variants.map(variant => {
      const attributeKeys = Object.keys(variant.attributes);
      return {
        channel_variant_option1_key: attributeKeys[0] || "",
        channel_variant_option1_value: variant.attributes[attributeKeys[0]] || "",
        channel_variant_option2_key: attributeKeys[1] || "",
        channel_variant_option2_value: variant.attributes[attributeKeys[1]] || "",
      };
    });
  };

  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionValues, setNewOptionValues] = useState("");
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [bulkEditMode, setBulkEditMode] = useState(false);

  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [variantsEnabled, setVariantsEnabled] = useState(data.variantGroups.length > 0 || data.optionGroups.length > 0);
  const [selectedChannel, setSelectedChannel] = useState<string>('master');
  const [viewMode, setViewMode] = useState<'unified' | 'channel-specific'>('unified');

  // Initialize internal state from ProductData
  useEffect(() => {
    if (data.optionGroups.length > 0) {
      setVariantOptions(transformOptionGroupsToVariantOptions(data.optionGroups));
    }
  }, [data.optionGroups]);

  // Initialize variants from existing enhancedVariants or variantGroups data
  useEffect(() => {
    if (variantsEnabled) {
      // Use enhancedVariants if available, otherwise fall back to variantGroups
      if (data.enhancedVariants && data.enhancedVariants.length > 0) {
        setVariants(data.enhancedVariants);
      } else if (variantOptions.length > 0 && data.variantGroups.length > 0) {
        // Transform existing variantGroups back to internal format for editing
        const existingVariants: ProductVariant[] = data.variantGroups.map((group, index) => {
          const attributes: Record<string, string> = {};
          if (group.channel_variant_option1_key && group.channel_variant_option1_value) {
            attributes[group.channel_variant_option1_key] = group.channel_variant_option1_value;
          }
          if (group.channel_variant_option2_key && group.channel_variant_option2_value) {
            attributes[group.channel_variant_option2_key] = group.channel_variant_option2_value;
          }
          
          return {
            id: `variant-${index}`,
            attributes,
            masterData: {
              sku: `${data.masterAttributes.sku || "PRD"}-${Object.values(attributes).join("-")}`,
              price: data.masterAttributes.basePrice || 0,
              inventory: 0,
              enabled: true,
              taxable: data.masterAttributes.taxable,
              trackInventory: data.masterAttributes.trackInventory,
              lowStockThreshold: data.masterAttributes.lowStockThreshold,
              costPrice: data.masterAttributes.costPrice,
              weight: data.masterAttributes.weight,
              dimensions: data.masterAttributes.dimensions,
            },
            channelData: {},
            globalSettings: {
              requiresShipping: true,
            }
          };
        });
        setVariants(existingVariants);
      }
    }
  }, [data.enhancedVariants, data.variantGroups, data.masterAttributes.sku, data.masterAttributes.basePrice, variantOptions, variantsEnabled]);


  useEffect(() => {
    // Auto-generate variants when options change
    if (variantOptions.length > 0 && variantsEnabled) {
      generateVariantCombinations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantOptions, variantsEnabled]);

  const handleVariantToggle = (hasVariants: boolean) => {
    setVariantsEnabled(hasVariants);
    
    if (hasVariants) {
      // Enable variants - initialize with empty arrays to show the variant creation UI
      onUpdate({ 
        variantGroups: [],
        optionGroups: [],
        enhancedVariants: [],
      });
    } else {
      // Disable variants - clear all variant data
      setVariants([]);
      setVariantOptions([]);
      onUpdate({ 
        variantGroups: [],
        optionGroups: [],
        enhancedVariants: [],
      });
    }
  };

  const addVariantOption = (optionName?: string, optionValues?: string[]) => {
    const name = optionName || newOptionName.trim();
    const values = optionValues || newOptionValues.split(",").map(v => v.trim()).filter(v => v);
    
    if (name && values.length > 0) {
      const newOptions = [...variantOptions, { name, values }];
      setVariantOptions(newOptions);
      onUpdate({ optionGroups: transformVariantOptionsToOptionGroups(newOptions) });
      setNewOptionName("");
      setNewOptionValues("");
    }
  };

  const removeVariantOption = (index: number) => {
    const newOptions = variantOptions.filter((_, i) => i !== index);
    setVariantOptions(newOptions);
    onUpdate({ optionGroups: transformVariantOptionsToOptionGroups(newOptions) });
  };

  const updateVariantOption = (index: number, field: "name" | "values", value: string | string[]) => {
    const newOptions = variantOptions.map((option, i) => 
      i === index ? { ...option, [field]: value } : option
    );
    setVariantOptions(newOptions);
    onUpdate({ optionGroups: transformVariantOptionsToOptionGroups(newOptions) });
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
        const sku = `${data.masterAttributes.sku || "PRD"}-${skuSuffix}`;

        return {
          id: Math.random().toString(36).substr(2, 9),
          attributes: combo,
          masterData: {
            sku,
            price: data.masterAttributes.basePrice || 0,
            inventory: 0,
            enabled: true,
            taxable: data.masterAttributes.taxable,
            trackInventory: data.masterAttributes.trackInventory,
            lowStockThreshold: data.masterAttributes.lowStockThreshold,
            costPrice: data.masterAttributes.costPrice,
            weight: data.masterAttributes.weight,
            dimensions: data.masterAttributes.dimensions,
          },
          channelData: {},
          globalSettings: {
            requiresShipping: true,
          }
        };
      });

      setVariants(newVariants);
      onUpdate({ 
        enhancedVariants: newVariants,
        variantGroups: transformVariantsToVariantGroups(newVariants) 
      });
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

  const updateVariant = (id: string, field: string, value: string | number | boolean) => {
    // Map old field names to new structure
    const fieldMap: Record<string, string> = {
      'sku': 'sku',
      'price': 'price',
      'inventory': 'inventory',
      'enabled': 'enabled',
      'barcode': 'barcode',
      'weight': 'weight'
    };
    
    const mappedField = fieldMap[field] || field;
    updateMasterVariantData(id, mappedField, value);
  };

  const deleteVariant = (id: string) => {
    const newVariants = variants.filter(v => v.id !== id);
    setVariants(newVariants);
    onUpdate({ 
      enhancedVariants: newVariants,
      variantGroups: transformVariantsToVariantGroups(newVariants) 
    });
  };

  const bulkUpdateVariants = (field: keyof ProductVariant['masterData'], value: any) => {
    const newVariants = variants.map(v => 
      selectedVariants.includes(v.id) ? { 
        ...v, 
        masterData: { ...v.masterData, [field]: value }
      } : v
    );
    setVariants(newVariants);
    onUpdate({ 
      enhancedVariants: newVariants,
      variantGroups: transformVariantsToVariantGroups(newVariants) 
    });
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



  // Helper functions to get effective variant values (channel-specific or master fallback)
  const getVariantValue = (variant: ProductVariant, field: string, channel: string = 'master') => {
    if (channel === 'master') {
      return variant.masterData[field as keyof typeof variant.masterData];
    }
    return variant.channelData[channel]?.[field as keyof typeof variant.channelData[string]] ?? 
           variant.masterData[field as keyof typeof variant.masterData];
  };

  const getActiveChannels = () => {
    return data.masterAttributes.channels?.map(c => c.platform) || [];
  };

  const updateChannelVariantData = (variantId: string, channel: string, field: string, value: string | number | boolean) => {
    const newVariants = variants.map(v => {
      if (v.id === variantId) {
        const updatedChannelData = { ...v.channelData };
        if (!updatedChannelData[channel]) {
          updatedChannelData[channel] = {};
        }
        updatedChannelData[channel] = {
          ...updatedChannelData[channel],
          [field]: value
        };
        return { ...v, channelData: updatedChannelData };
      }
      return v;
    });
    setVariants(newVariants);
    onUpdate({ 
      enhancedVariants: newVariants,
      variantGroups: transformVariantsToVariantGroups(newVariants) 
    });
  };

  const updateMasterVariantData = (variantId: string, field: string, value: string | number | boolean) => {
    const newVariants = variants.map(v => {
      if (v.id === variantId) {
        return { 
          ...v, 
          masterData: { ...v.masterData, [field]: value } 
        };
      }
      return v;
    });
    setVariants(newVariants);
    onUpdate({ 
      enhancedVariants: newVariants,
      variantGroups: transformVariantsToVariantGroups(newVariants) 
    });
  };

  const getVariantCompletionScore = (variant: ProductVariant, channel: string = 'master'): number => {
    if (channel === 'master') {
      const fields = [
        variant.masterData.sku,
        variant.masterData.price > 0,
        variant.masterData.title,
        variant.masterData.description,
        variant.masterData.costPrice,
        variant.masterData.images && variant.masterData.images.length > 0,
      ];
      const filledFields = fields.filter(Boolean).length;
      return Math.round((filledFields / fields.length) * 100);
    } else {
      const channelData = variant.channelData[channel];
      if (!channelData) return 0;
      
      const fields = [
        channelData.sku || variant.masterData.sku,
        (channelData.price ?? variant.masterData.price) > 0,
        channelData.title || variant.masterData.title,
        channelData.description || variant.masterData.description,
        channelData.seo?.title,
        channelData.seo?.description,
        channelData.images?.length || variant.masterData.images?.length,
        channelData.customFields && Object.keys(channelData.customFields).length > 0,
      ];
      const filledFields = fields.filter(Boolean).length;
      return Math.round((filledFields / fields.length) * 100);
    }
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
            key={`variants-toggle-${variantsEnabled}`}
            label="Enable Variants"
            defaultChecked={variantsEnabled}
            onChange={handleVariantToggle}
          />
        </div>

        {!(variantsEnabled) && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enable variants if your product has different options like size, color, or material.
              This helps customers choose exactly what they want and improves inventory management.
            </p>
          </div>
        )}
      </div>

      {variantsEnabled && (
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
                      onKeyDown={(e) => {
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
                  defaultValue={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                />
              </div>
              <div>
                <Label>Option Values (comma-separated)</Label>
                <Input
                  type="text"
                  placeholder="e.g., Small, Medium, Large"
                  defaultValue={newOptionValues}
                  onChange={(e) => setNewOptionValues(e.target.value)}
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
              {/* Channel Selector */}
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-blue-900 dark:text-blue-400">Channel-Specific Configuration</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('unified')}
                      className={`px-3 py-1 rounded-full text-sm ${
                        viewMode === 'unified'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      Unified View
                    </button>
                    <button
                      onClick={() => setViewMode('channel-specific')}
                      className={`px-3 py-1 rounded-full text-sm ${
                        viewMode === 'channel-specific'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      Channel-Specific
                    </button>
                  </div>
                </div>
                
                {viewMode === 'channel-specific' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Viewing:</span>
                    <select
                      value={selectedChannel}
                      onChange={(e) => setSelectedChannel(e.target.value)}
                      className="px-3 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 text-sm"
                    >
                      <option value="master">🏠 Master Data (Fallback)</option>
                      {getActiveChannels().map(channel => (
                        <option key={channel} value={channel}>
                          📱 {channel.charAt(0).toUpperCase() + channel.slice(1)}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                      {selectedChannel === 'master' 
                        ? 'Editing master values that serve as fallbacks for all channels'
                        : `Editing channel-specific overrides for ${selectedChannel}`
                      }
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Generated Variants ({variants.length})
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {viewMode === 'unified' 
                      ? 'Manage master variant data across all channels'
                      : `Configure variants specifically for ${selectedChannel === 'master' ? 'master data' : selectedChannel}`
                    }
                  </p>
                  {/* Debug Info */}
                  <div className="text-xs text-blue-500 mt-1">
                    Active Channels: {getActiveChannels().length > 0 ? getActiveChannels().join(', ') : 'None'} | 
                    View Mode: {viewMode} | 
                    Selected Channel: {selectedChannel}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Test button to add channels for demonstration */}
                  <Button 
                    onClick={() => {
                      const currentChannels = data.masterAttributes.channels || [];
                      
                      // Check if demo channels already exist
                      const hasShopify = currentChannels.some(c => c.platform === 'shopify' && c.storeId === 'demo-store');
                      const hasAmazon = currentChannels.some(c => c.platform === 'amazon' && c.storeId === 'demo-amazon');
                      
                      // Check for all demo channels
                      const hasShopee = currentChannels.some(c => c.platform === 'shopee' && c.storeId === 'demo-shopee');
                      const hasWix = currentChannels.some(c => c.platform === 'wix' && c.storeId === 'demo-wix');
                      const hasBlibli = currentChannels.some(c => c.platform === 'blibli' && c.storeId === 'demo-blibli');
                      
                      const channelsToAdd = [];
                      if (!hasShopify) {
                        channelsToAdd.push({ platform: 'shopify', storeId: 'demo-store', enabled: true, customMapping: {} });
                      }
                      if (!hasAmazon) {
                        channelsToAdd.push({ platform: 'amazon', storeId: 'demo-amazon', enabled: true, customMapping: {} });
                      }
                      if (!hasShopee) {
                        channelsToAdd.push({ platform: 'shopee', storeId: 'demo-shopee', enabled: true, customMapping: {} });
                      }
                      if (!hasWix) {
                        channelsToAdd.push({ platform: 'wix', storeId: 'demo-wix', enabled: true, customMapping: {} });
                      }
                      if (!hasBlibli) {
                        channelsToAdd.push({ platform: 'blibli', storeId: 'demo-blibli', enabled: true, customMapping: {} });
                      }
                      
                      if (channelsToAdd.length > 0) {
                        const newChannels = [...currentChannels, ...channelsToAdd];
                        onUpdate({ 
                          masterAttributes: { 
                            ...data.masterAttributes, 
                            channels: newChannels 
                          } 
                        });
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={getActiveChannels().includes('shopify') && getActiveChannels().includes('amazon')}
                  >
                    {getActiveChannels().includes('shopify') && getActiveChannels().includes('amazon') 
                      ? '✓ Demo Channels Added' 
                      : '+ Demo Channels'
                    }
                  </Button>
                  
                  {/* Remove demo channels button */}
                  {getActiveChannels().length > 0 && (
                    <Button 
                      onClick={() => {
                        const currentChannels = data.masterAttributes.channels || [];
                        const newChannels = currentChannels.filter(c => 
                          !(c.platform === 'shopify' && c.storeId === 'demo-store') &&
                          !(c.platform === 'amazon' && c.storeId === 'demo-amazon') &&
                          !(c.platform === 'shopee' && c.storeId === 'demo-shopee') &&
                          !(c.platform === 'wix' && c.storeId === 'demo-wix') &&
                          !(c.platform === 'blibli' && c.storeId === 'demo-blibli')
                        );
                        onUpdate({ 
                          masterAttributes: { 
                            ...data.masterAttributes, 
                            channels: newChannels 
                          } 
                        });
                      }}
                      variant="outline"
                      size="sm"
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      🗑️ Clear Demo
                    </Button>
                  )}
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
                          step={0.01}
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
                      <th className="text-left p-3 text-sm font-medium text-gray-500 dark:text-gray-400">Details</th>
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
                          <div className="relative">
                            <Input
                              type="text"
                              defaultValue={getVariantValue(variant, 'sku', viewMode === 'channel-specific' ? selectedChannel : 'master') as string || ''}
                              onChange={(e) => {
                                if (viewMode === 'channel-specific' && selectedChannel !== 'master') {
                                  updateChannelVariantData(variant.id, selectedChannel, 'sku', e.target.value);
                                } else {
                                  updateMasterVariantData(variant.id, "sku", e.target.value);
                                }
                              }}
                              className="w-32"
                            />
                            {viewMode === 'channel-specific' && selectedChannel !== 'master' && 
                             variant.channelData[selectedChannel]?.sku && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" 
                                    title="Channel override active"></span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="relative">
                            <Input
                              type="number"
                              step={0.01}
                              defaultValue={(getVariantValue(variant, 'price', viewMode === 'channel-specific' ? selectedChannel : 'master') as number)?.toString() || '0'}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                if (viewMode === 'channel-specific' && selectedChannel !== 'master') {
                                  updateChannelVariantData(variant.id, selectedChannel, 'price', value);
                                } else {
                                  updateMasterVariantData(variant.id, "price", value);
                                }
                              }}
                              className="w-24"
                            />
                            {viewMode === 'channel-specific' && selectedChannel !== 'master' && 
                             variant.channelData[selectedChannel]?.price !== undefined && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" 
                                    title="Channel override active"></span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              defaultValue={(getVariantValue(variant, 'inventory', viewMode === 'channel-specific' ? selectedChannel : 'master') as number)?.toString() || '0'}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                if (viewMode === 'channel-specific' && selectedChannel !== 'master') {
                                  updateChannelVariantData(variant.id, selectedChannel, 'inventory', value);
                                } else {
                                  updateMasterVariantData(variant.id, "inventory", value);
                                }
                              }}
                              className="w-20"
                            />
                            {viewMode === 'channel-specific' && selectedChannel !== 'master' && 
                             variant.channelData[selectedChannel]?.inventory !== undefined && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" 
                                    title="Channel override active"></span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <div className={`w-3 h-3 rounded-full ${
                                getVariantCompletionScore(variant, viewMode === 'channel-specific' ? selectedChannel : 'master') >= 80 ? 'bg-green-500' :
                                getVariantCompletionScore(variant, viewMode === 'channel-specific' ? selectedChannel : 'master') >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}></div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {getVariantCompletionScore(variant, viewMode === 'channel-specific' ? selectedChannel : 'master')}%
                              </span>
                              {viewMode === 'channel-specific' && selectedChannel !== 'master' && (
                                <span className="text-xs text-blue-500">
                                  ({Object.keys(variant.channelData[selectedChannel] || {}).length} overrides)
                                </span>
                              )}
                            </div>
                            <Button
                              onClick={() => openVariantDetails(variant)}
                              variant="outline"
                              size="sm"
                              className="text-xs px-2 py-1"
                            >
                              ⚙️ Edit
                            </Button>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="relative">
                            <Switch
                              label="Enabled"
                              defaultChecked={getVariantValue(variant, 'enabled', viewMode === 'channel-specific' ? selectedChannel : 'master') as boolean || false}
                              onChange={(checked) => {
                                if (viewMode === 'channel-specific' && selectedChannel !== 'master') {
                                  updateChannelVariantData(variant.id, selectedChannel, 'enabled', checked);
                                } else {
                                  updateMasterVariantData(variant.id, "enabled", checked);
                                }
                              }}
                            />
                            {viewMode === 'channel-specific' && selectedChannel !== 'master' && 
                             variant.channelData[selectedChannel]?.enabled !== undefined && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" 
                                    title="Channel override active"></span>
                            )}
                          </div>
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

          {/* Enhanced Variant Insights */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl p-6 border border-green-200 dark:border-green-800">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm">📊</span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-green-900 dark:text-green-400 mb-2">Enhanced Variant Insights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 text-sm text-green-800 dark:text-green-300">
                    <p>• Total variants: {variants.length}</p>
                    <p>• Enabled variants: {variants.filter(v => v.masterData.enabled).length}</p>
                    <p>• Average price: ${variants.length > 0 ? (variants.reduce((sum, v) => sum + v.masterData.price, 0) / variants.length).toFixed(2) : "0.00"}</p>
                    <p>• Total inventory: {variants.reduce((sum, v) => sum + v.masterData.inventory, 0)} units</p>
                    {variants.some(v => v.masterData.inventory === 0) && (
                      <p className="text-amber-700 dark:text-amber-400">⚠️ Some variants are out of stock</p>
                    )}
                  </div>
                  <div className="space-y-2 text-sm text-green-800 dark:text-green-300">
                    {viewMode === 'unified' ? (
                      <>
                        <p>• Variants with channel overrides: {variants.filter(v => Object.keys(v.channelData).length > 0).length}</p>
                        <p>• Average master completion: {variants.length > 0 ? Math.round(variants.reduce((sum, v) => sum + getVariantCompletionScore(v, 'master'), 0) / variants.length) : 0}%</p>
                        <p>• Active channels: {getActiveChannels().length}</p>
                        <p>• Total channel configurations: {variants.reduce((sum, v) => sum + Object.keys(v.channelData).length, 0)}</p>
                      </>
                    ) : (
                      <>
                        <p>• Channel: {selectedChannel === 'master' ? 'Master Data' : selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)}</p>
                        <p>• Average completion: {variants.length > 0 ? Math.round(variants.reduce((sum, v) => sum + getVariantCompletionScore(v, selectedChannel), 0) / variants.length) : 0}%</p>
                        <p>• Variants with overrides: {selectedChannel !== 'master' ? variants.filter(v => v.channelData[selectedChannel] && Object.keys(v.channelData[selectedChannel]).length > 0).length : 'N/A'}</p>
                        <p>• Optimized variants: {variants.filter(v => getVariantCompletionScore(v, selectedChannel) >= 80).length}</p>
                      </>
                    )}
                    {variants.some(v => getVariantCompletionScore(v, selectedChannel) < 50) && (
                      <p className="text-amber-700 dark:text-amber-400">⚠️ Some variants need more details</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Variant Details Modal - Temporarily disabled pending channel structure update */}
      {false && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Variant Details: {Object.values(editingVariant.attributes).join(" / ")}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Configure special fields and channel-specific settings
                  </p>
                </div>
                <button
                  onClick={closeVariantDetails}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Variant Title</Label>
                    <Input
                      type="text"
                      defaultValue={editingVariant.specialFields?.variantTitle || ''}
                      placeholder="Custom variant title"
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          variantTitle: e.target.value
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Barcode/GTIN</Label>
                    <Input
                      type="text"
                      defaultValue={editingVariant.barcode || ''}
                      placeholder="123456789012"
                      onChange={(e) => updateVariant(editingVariant.id, "barcode", e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label>Variant Description</Label>
                  <textarea
                    className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                    defaultValue={editingVariant.specialFields?.variantDescription || ''}
                    placeholder="Detailed description for this variant..."
                    onChange={(e) => {
                      updateVariantSpecialFields(editingVariant.id, {
                        ...editingVariant.specialFields,
                        variantDescription: e.target.value
                      });
                    }}
                  />
                </div>
              </div>

              {/* Pricing & Costs */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Pricing & Costs</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Cost Price</Label>
                    <Input
                      type="number"
                      step={0.01}
                      defaultValue={editingVariant.specialFields?.costPrice?.toString() || ''}
                      placeholder="0.00"
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          costPrice: parseFloat(e.target.value) || 0
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Compare Price</Label>
                    <Input
                      type="number"
                      step={0.01}
                      defaultValue={editingVariant.specialFields?.comparePrice?.toString() || ''}
                      placeholder="0.00"
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          comparePrice: parseFloat(e.target.value) || 0
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center">
                    <Switch
                      label="Taxable"
                      defaultChecked={editingVariant.specialFields?.taxable ?? true}
                      onChange={(checked) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          taxable: checked
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Inventory & Shipping */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Inventory & Shipping</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center">
                    <Switch
                      label="Track Inventory"
                      defaultChecked={editingVariant.specialFields?.trackInventory ?? true}
                      onChange={(checked) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          trackInventory: checked
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center">
                    <Switch
                      label="Requires Shipping"
                      defaultChecked={editingVariant.specialFields?.requiresShipping ?? true}
                      onChange={(checked) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          requiresShipping: checked
                        });
                      }}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Low Stock Threshold</Label>
                    <Input
                      type="number"
                      min="0"
                      defaultValue={editingVariant.specialFields?.lowStockThreshold?.toString() || ''}
                      placeholder="10"
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          lowStockThreshold: parseInt(e.target.value) || 0
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input
                      type="number"
                      step={0.01}
                      defaultValue={editingVariant.weight?.toString() || ''}
                      placeholder="0.00"
                      onChange={(e) => updateVariant(editingVariant.id, "weight", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {/* Dimensions */}
                <div className="mt-4">
                  <Label>Dimensions (cm)</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Input
                      type="number"
                      step={0.1}
                      placeholder="Length"
                      defaultValue={editingVariant.specialFields?.dimensions?.length?.toString() || ''}
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          dimensions: {
                            ...editingVariant.specialFields?.dimensions,
                            length: parseFloat(e.target.value) || 0,
                            width: editingVariant.specialFields?.dimensions?.width || 0,
                            height: editingVariant.specialFields?.dimensions?.height || 0,
                          }
                        });
                      }}
                    />
                    <Input
                      type="number"
                      step={0.1}
                      placeholder="Width"
                      defaultValue={editingVariant.specialFields?.dimensions?.width?.toString() || ''}
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          dimensions: {
                            ...editingVariant.specialFields?.dimensions,
                            width: parseFloat(e.target.value) || 0,
                            length: editingVariant.specialFields?.dimensions?.length || 0,
                            height: editingVariant.specialFields?.dimensions?.height || 0,
                          }
                        });
                      }}
                    />
                    <Input
                      type="number"
                      step={0.1}
                      placeholder="Height"
                      defaultValue={editingVariant.specialFields?.dimensions?.height?.toString() || ''}
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          dimensions: {
                            ...editingVariant.specialFields?.dimensions,
                            height: parseFloat(e.target.value) || 0,
                            length: editingVariant.specialFields?.dimensions?.length || 0,
                            width: editingVariant.specialFields?.dimensions?.width || 0,
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* SEO Settings */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">SEO Settings</h4>
                <div className="space-y-4">
                  <div>
                    <Label>SEO Title</Label>
                    <Input
                      type="text"
                      defaultValue={editingVariant.specialFields?.seo?.title || ''}
                      placeholder="Variant-specific SEO title"
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          seo: {
                            ...editingVariant.specialFields?.seo,
                            title: e.target.value,
                            description: editingVariant.specialFields?.seo?.description || '',
                            keywords: editingVariant.specialFields?.seo?.keywords || [],
                          }
                        });
                      }}
                    />
                  </div>
                  <div>
                    <Label>SEO Description</Label>
                    <textarea
                      className="w-full h-20 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                      defaultValue={editingVariant.specialFields?.seo?.description || ''}
                      placeholder="SEO meta description for this variant..."
                      onChange={(e) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          seo: {
                            ...editingVariant.specialFields?.seo,
                            description: e.target.value,
                            title: editingVariant.specialFields?.seo?.title || '',
                            keywords: editingVariant.specialFields?.seo?.keywords || [],
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Visibility Settings */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Visibility Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center">
                    <Switch
                      label="Online Store"
                      defaultChecked={editingVariant.specialFields?.visibility?.online ?? true}
                      onChange={(checked) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          visibility: {
                            ...editingVariant.specialFields?.visibility,
                            online: checked,
                            pos: editingVariant.specialFields?.visibility?.pos ?? true,
                            marketplace: editingVariant.specialFields?.visibility?.marketplace ?? true,
                          }
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center">
                    <Switch
                      label="Point of Sale"
                      defaultChecked={editingVariant.specialFields?.visibility?.pos ?? true}
                      onChange={(checked) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          visibility: {
                            ...editingVariant.specialFields?.visibility,
                            pos: checked,
                            online: editingVariant.specialFields?.visibility?.online ?? true,
                            marketplace: editingVariant.specialFields?.visibility?.marketplace ?? true,
                          }
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center">
                    <Switch
                      label="Marketplaces"
                      defaultChecked={editingVariant.specialFields?.visibility?.marketplace ?? true}
                      onChange={(checked) => {
                        updateVariantSpecialFields(editingVariant.id, {
                          ...editingVariant.specialFields,
                          visibility: {
                            ...editingVariant.specialFields?.visibility,
                            marketplace: checked,
                            online: editingVariant.specialFields?.visibility?.online ?? true,
                            pos: editingVariant.specialFields?.visibility?.pos ?? true,
                          }
                        });
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Notes</h4>
                <textarea
                  className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  defaultValue={editingVariant.specialFields?.notes || ''}
                  placeholder="Internal notes for this variant..."
                  onChange={(e) => {
                    updateVariantSpecialFields(editingVariant.id, {
                      ...editingVariant.specialFields,
                      notes: e.target.value
                    });
                  }}
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6 rounded-b-xl">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Completion: {getVariantCompletionScore(editingVariant)}%
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={closeVariantDetails} variant="outline">
                    Cancel
                  </Button>
                  <Button onClick={closeVariantDetails} variant="primary">
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}