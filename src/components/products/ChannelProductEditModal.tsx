"use client";
import React, { useState, useEffect } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Switch from "@/components/form/switch/Switch";
import { getEnhancedChannelConfig } from "./channels/EnhancedChannelConfigs";
import { ChannelConfig, ChannelFieldConfig } from "./channels/ChannelTypes";

// Import variant types - in a real app, these would be in a shared types file
interface ProductVariant {
  id: string;
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
  channelData: Record<string, {
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
    trackInventory?: boolean;
    lowStockThreshold?: number;
    images?: string[];
    customFields?: Record<string, unknown>;
  }>;
  globalSettings: {
    position: number;
    createdAt: Date;
    updatedAt: Date;
  };
}

interface ChannelProduct {
  id: string;
  masterProductId: string;
  channelId: string;
  channelName: string;
  channelIcon: string;
  storeId: string;
  storeName: string;
  title: string;
  sku: string;
  barcode: string;
  description: string;
  price: number;
  comparePrice: number;
  costPrice: number;
  currency: string;
  stock: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  isActive: boolean;
  lastSynced: Date | null;
  syncStatus: 'pending' | 'synced' | 'error' | 'manual';
  syncErrors: string[];
  visibility: boolean;
  tags: string[];
  customFields: Record<string, unknown>;
  imageUrl: string;
}

interface ChannelProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ChannelProduct | null;
  variants?: ProductVariant[];
  selectedVariant?: ProductVariant | null; // NEW: specific variant to focus on when modal opens
  onSave: (productId: string, updates: Partial<ChannelProduct>) => void;
  onVariantUpdate?: (variantId: string, updates: Partial<ProductVariant>) => void;
  onOpenVariantDetails?: (variant: ProductVariant, channelId: string) => void;
  // To integrate with existing VariantDetailsModal, the parent component should:
  // 1. Import and manage the VariantDetailsModal state
  // 2. Pass a callback that opens the VariantDetailsModal for the specific variant and channel
  // 3. Handle the modal's onUpdate callback to sync changes back to the product variants
}

// Channel Variants List Component
interface ChannelVariantsListProps {
  variants: ProductVariant[];
  channelId: string;
  channelConfig: ChannelConfig;
  viewMode: 'unified' | 'variants';
  onVariantUpdate?: (variantId: string, updates: Partial<ProductVariant>) => void;
  onOpenVariantDetails?: (variant: ProductVariant, channelId: string) => void;
}

const ChannelVariantsList: React.FC<ChannelVariantsListProps> = ({
  variants,
  channelId,
  channelConfig,
  viewMode,
  onVariantUpdate,
  onOpenVariantDetails
}) => {
  const [editingVariant, setEditingVariant] = useState<string | null>(null);

  const getVariantDisplayData = (variant: ProductVariant) => {
    const channelData = variant.channelData[channelId] || {};
    return {
      sku: channelData.sku || variant.masterData.sku,
      title: channelData.title || variant.masterData.title || 'Untitled Variant',
      price: channelData.price !== undefined ? channelData.price : variant.masterData.price,
      inventory: channelData.inventory !== undefined ? channelData.inventory : variant.masterData.inventory,
      enabled: channelData.enabled !== undefined ? channelData.enabled : variant.masterData.enabled,
    };
  };

  const handleQuickEdit = (variantId: string, field: string, value: unknown) => {
    if (onVariantUpdate) {
      onVariantUpdate(variantId, {
        channelData: {
          [channelId]: {
            [field]: value
          }
        }
      });
    }
  };

  const formatAttributeDisplay = (attributes: Record<string, string>) => {
    return Object.entries(attributes)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' / ');
  };

  if (variants.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-400 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <h3 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          No Variants Found
        </h3>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          This product doesn&apos;t have any variants to configure for {channelConfig.displayName}.
        </p>
      </div>
    );
  }

  // Variants View Mode: Render each variant as a unique product row
  const renderVariantsView = () => (
    <div className="p-6">
      <div className="space-y-6">
        {variants.map((variant) => {
          const displayData = getVariantDisplayData(variant);
          const hasChannelOverrides = variant.channelData[channelId] && Object.keys(variant.channelData[channelId]).length > 0;
          
          return (
            <div key={variant.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* Variant Header */}
              <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-theme-sm font-medium text-gray-900 dark:text-white">
                        {formatAttributeDisplay(variant.attributes)}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        displayData.enabled 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      }`}>
                        {displayData.enabled ? 'Active' : 'Inactive'}
                      </span>
                      {hasChannelOverrides && (
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                          Channel Override
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenVariantDetails?.(variant, channelId)}
                  >
                    Edit Details
                  </Button>
                </div>
              </div>

              {/* Variant Content */}
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">SKU</span>
                    <div className="font-medium text-gray-900 dark:text-white mt-1">{displayData.sku}</div>
                    {variant.channelData[channelId]?.sku && (
                      <div className="text-theme-xs text-blue-600 dark:text-blue-400">Override: {variant.channelData[channelId].sku}</div>
                    )}
                  </div>
                  <div>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Price</span>
                    <div className="font-medium text-gray-900 dark:text-white mt-1">${displayData.price}</div>
                    {variant.channelData[channelId]?.price !== undefined && (
                      <div className="text-theme-xs text-blue-600 dark:text-blue-400">Override: ${variant.channelData[channelId].price}</div>
                    )}
                  </div>
                  <div>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Inventory</span>
                    <div className="font-medium text-gray-900 dark:text-white mt-1">{displayData.inventory}</div>
                    {variant.channelData[channelId]?.inventory !== undefined && (
                      <div className="text-theme-xs text-blue-600 dark:text-blue-400">Override: {variant.channelData[channelId].inventory}</div>
                    )}
                  </div>
                  <div>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Title</span>
                    <div className="font-medium text-gray-900 dark:text-white mt-1 truncate">{displayData.title}</div>
                    {variant.channelData[channelId]?.title && (
                      <div className="text-theme-xs text-blue-600 dark:text-blue-400 truncate">Override: {variant.channelData[channelId].title}</div>
                    )}
                  </div>
                </div>

                {/* Additional Channel Data */}
                {hasChannelOverrides && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="text-blue-500 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-theme-xs font-medium text-blue-900 dark:text-blue-300">
                          Channel-specific overrides active
                        </div>
                        <div className="text-theme-xs text-blue-800 dark:text-blue-400 mt-1">
                          Fields: {Object.keys(variant.channelData[channelId]).join(', ')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {variants.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
              No Variants Found
            </h3>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              This product doesn&apos;t have any variants to configure for {channelConfig.displayName}.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Unified View Mode: Original compact view
  const renderUnifiedView = () => (
    <div className="p-6">
      <div className="space-y-4">
        {variants.map((variant) => {
          const displayData = getVariantDisplayData(variant);
          const isEditing = editingVariant === variant.id;
          
          return (
            <div key={variant.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                    {formatAttributeDisplay(variant.attributes)}
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    displayData.enabled 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                  }`}>
                    {displayData.enabled ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingVariant(isEditing ? null : variant.id)}
                >
                  {isEditing ? 'Done' : 'Quick Edit'}
                </Button>
              </div>

              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Price ({variant.masterData.price ? '$' : ''})</Label>
                    <Input
                      type="number"
                      step={0.01}
                      defaultValue={displayData.price}
                      onChange={(e) => handleQuickEdit(variant.id, 'price', parseFloat(e.target.value) || 0)}
                      placeholder={`Master: ${variant.masterData.price}`}
                    />
                  </div>
                  <div>
                    <Label>Inventory</Label>
                    <Input
                      type="number"
                      defaultValue={displayData.inventory}
                      onChange={(e) => handleQuickEdit(variant.id, 'inventory', parseInt(e.target.value) || 0)}
                      placeholder={`Master: ${variant.masterData.inventory}`}
                    />
                  </div>
                  <div>
                    <Label>SKU</Label>
                    <Input
                      type="text"
                      defaultValue={displayData.sku}
                      onChange={(e) => handleQuickEdit(variant.id, 'sku', e.target.value)}
                      placeholder={`Master: ${variant.masterData.sku}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-theme-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">SKU:</span>
                    <div className="font-medium">{displayData.sku}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Price:</span>
                    <div className="font-medium">${displayData.price}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Inventory:</span>
                    <div className="font-medium">{displayData.inventory}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Title:</span>
                    <div className="font-medium">{displayData.title}</div>
                  </div>
                </div>
              )}

              {/* Channel Override Indicator */}
              {variant.channelData[channelId] && Object.keys(variant.channelData[channelId]).length > 0 && (
                <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-theme-xs text-blue-800 dark:text-blue-400">
                  <span className="font-medium">Channel Overrides:</span> {
                    Object.keys(variant.channelData[channelId]).join(', ')
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="text-blue-500 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-1">
              Channel Override Information
            </h4>
            <p className="text-theme-xs text-gray-600 dark:text-gray-400">
              Values you set here will override the master variant data for {channelConfig.displayName} only. 
              Leave fields empty to use the master values.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Return the appropriate view based on viewMode
  return viewMode === 'variants' ? renderVariantsView() : renderUnifiedView();
};

const ChannelProductEditModal: React.FC<ChannelProductEditModalProps> = ({
  isOpen,
  onClose,
  product,
  variants = [],
  selectedVariant = null, // NEW: specific variant to focus on
  onSave,
  onVariantUpdate,
  onOpenVariantDetails,
}) => {
  const [formData, setFormData] = useState<Partial<ChannelProduct>>({});
  const [channelConfig, setChannelConfig] = useState<ChannelConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'product' | 'variants'>('product');
  const [variantViewMode, setVariantViewMode] = useState<'unified' | 'variants'>('unified');

  useEffect(() => {
    if (product) {
      setFormData({ ...product });
      const config = getEnhancedChannelConfig(product.channelId);
      setChannelConfig(config || null);
    }
  }, [product]);

  // NEW: Handle selectedVariant - switch to variants tab and set up data
  useEffect(() => {
    if (selectedVariant && isOpen) {
      setActiveTab('variants');
      setVariantViewMode('variants');
      
      // Pre-populate form data with variant-specific information
      const channelData = selectedVariant.channelData[product?.channelId || ''] || {};
      const variantTitle = channelData.title || selectedVariant.masterData.title || 
        `${product?.title} - ${Object.entries(selectedVariant.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}`;
      
      setFormData(prev => ({
        ...prev,
        title: variantTitle,
        sku: channelData.sku || selectedVariant.masterData.sku,
        price: channelData.price !== undefined ? channelData.price : selectedVariant.masterData.price,
        stock: channelData.inventory !== undefined ? channelData.inventory : selectedVariant.masterData.inventory,
        // Keep other product data as is
      }));
    } else if (!selectedVariant && isOpen) {
      // Reset to product tab when no specific variant is selected
      setActiveTab('product');
      setVariantViewMode('unified');
    }
  }, [selectedVariant, isOpen, product?.channelId, product?.title]);

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      customFields: {
        ...prev.customFields,
        [field]: field.startsWith('custom_') ? value : prev.customFields?.[field]
      }
    }));
  };

  const handleCustomFieldChange = (fieldName: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      customFields: {
        ...prev.customFields,
        [fieldName]: value
      }
    }));
  };

  const handleSave = () => {
    if (product && formData) {
      onSave(product.id, formData);
      onClose();
    }
  };

  const renderField = (field: ChannelFieldConfig) => {
    const value = formData.customFields?.[field.fieldName] || '';

    switch (field.type) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <Input
            type={field.type}
            defaultValue={String(value)}
            placeholder={field.placeholder}
            onChange={(e) => handleCustomFieldChange(field.fieldName, e.target.value)}
            hint={field.helpText}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            defaultValue={String(value)}
            placeholder={field.placeholder}
            onChange={(e) => handleCustomFieldChange(field.fieldName, parseFloat(e.target.value) || 0)}
            hint={field.helpText}
            min={field.validation?.min?.toString()}
            max={field.validation?.max?.toString()}
          />
        );

      case 'textarea':
        return (
          <textarea
            className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            defaultValue={String(value)}
            placeholder={field.placeholder}
            onChange={(e) => handleCustomFieldChange(field.fieldName, e.target.value)}
            rows={3}
          />
        );

      case 'select':
        return (
          <select
            className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            value={String(value)}
            onChange={(e) => handleCustomFieldChange(field.fieldName, e.target.value)}
          >
            <option value="">Select {field.displayName}</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <Switch
            label=""
            defaultChecked={Boolean(value)}
            onChange={(checked) => handleCustomFieldChange(field.fieldName, checked)}
          />
        );

      default:
        return (
          <Input
            type="text"
            defaultValue={String(value)}
            onChange={(e) => handleCustomFieldChange(field.fieldName, e.target.value)}
          />
        );
    }
  };

  if (!isOpen || !product || !channelConfig) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[999999] flex items-center justify-center p-4"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999 }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{channelConfig.icon}</span>
            <div>
              <h2 className="text-title-md font-semibold text-gray-900 dark:text-white">
                Edit {channelConfig.displayName} {selectedVariant ? 'Variant' : 'Product'}
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                {selectedVariant ? (
                  <span>
                    {Object.entries(selectedVariant.attributes).map(([k, v]) => `${k}: ${v}`).join(' / ')} • 
                    SKU: {selectedVariant.channelData[product.channelId]?.sku || selectedVariant.masterData.sku}
                  </span>
                ) : (
                  <span>{product.title} • {product.sku}</span>
                )}
              </p>
              {selectedVariant && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded-full">
                    Variant Editing Mode
                  </span>
                  {selectedVariant.channelData[product.channelId] && Object.keys(selectedVariant.channelData[product.channelId]).length > 0 && (
                    <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 rounded-full">
                      Channel Override
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-title-md"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('product')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'product'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Product Details
            </button>
            <button
              onClick={() => setActiveTab('variants')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'variants'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Variants ({variants.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'product' ? (
            <div className="p-6 space-y-6">

            {/* Variant Information (when editing a specific variant) */}
            {selectedVariant && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="text-blue-500 mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                      Editing Variant: {Object.entries(selectedVariant.attributes).map(([k, v]) => `${k}: ${v}`).join(' / ')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-theme-xs">
                      <div>
                        <span className="text-blue-800 dark:text-blue-400 font-medium">Master SKU:</span>
                        <div className="text-blue-900 dark:text-blue-300">{selectedVariant.masterData.sku}</div>
                      </div>
                      <div>
                        <span className="text-blue-800 dark:text-blue-400 font-medium">Master Price:</span>
                        <div className="text-blue-900 dark:text-blue-300">${selectedVariant.masterData.price}</div>
                      </div>
                      <div>
                        <span className="text-blue-800 dark:text-blue-400 font-medium">Master Inventory:</span>
                        <div className="text-blue-900 dark:text-blue-300">{selectedVariant.masterData.inventory}</div>
                      </div>
                    </div>
                    <p className="text-theme-xs text-blue-800 dark:text-blue-400 mt-2">
                      The fields below will override the master variant data for {channelConfig?.displayName} only.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Basic Product Fields */}
            <div className="space-y-4">
              <h3 className="text-title-sm font-medium text-gray-900 dark:text-white">
                {selectedVariant ? `${channelConfig?.displayName} Variant Override Settings` : 'Basic Product Information'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{selectedVariant ? 'Variant Title (Override)' : 'Product Title'}</Label>
                  <Input
                    type="text"
                    defaultValue={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={selectedVariant ? `Master: ${selectedVariant.masterData.title}` : undefined}
                  />
                </div>
                <div>
                  <Label>{selectedVariant ? 'Variant SKU (Override)' : 'SKU'}</Label>
                  <Input
                    type="text"
                    defaultValue={formData.sku}
                    onChange={(e) => handleInputChange('sku', e.target.value)}
                    placeholder={selectedVariant ? `Master: ${selectedVariant.masterData.sku}` : undefined}
                  />
                </div>
                <div>
                  <Label>{selectedVariant ? 'Variant Price (Override)' : `Price (${formData.currency})`}</Label>
                  <Input
                    type="number"
                    defaultValue={formData.price}
                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                    step={0.01}
                    placeholder={selectedVariant ? `Master: $${selectedVariant.masterData.price}` : undefined}
                  />
                </div>
                <div>
                  <Label>{selectedVariant ? 'Compare Price (Override)' : `Compare Price (${formData.currency})`}</Label>
                  <Input
                    type="number"
                    defaultValue={formData.comparePrice}
                    onChange={(e) => handleInputChange('comparePrice', parseFloat(e.target.value) || 0)}
                    step={0.01}
                    placeholder={selectedVariant ? `Master: $${selectedVariant.masterData.comparePrice}` : undefined}
                  />
                </div>
                <div>
                  <Label>{selectedVariant ? 'Stock Quantity (Override)' : 'Stock Quantity'}</Label>
                  <Input
                    type="number"
                    defaultValue={formData.stock}
                    onChange={(e) => handleInputChange('stock', parseInt(e.target.value) || 0)}
                    placeholder={selectedVariant ? `Master: ${selectedVariant.masterData.inventory}` : undefined}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    label="Product Active"
                    defaultChecked={formData.isActive}
                    onChange={(checked) => handleInputChange('isActive', checked)}
                  />
                </div>
              </div>
            </div>

            {/* Channel-Specific Required Fields */}
            {channelConfig.requiredFields.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-title-sm font-medium text-gray-900 dark:text-white">
                  Required {channelConfig.displayName} Fields
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {channelConfig.requiredFields.map((field) => (
                    <div key={field.fieldName}>
                      <Label>
                        {field.displayName}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      {renderField(field)}
                      {field.helpText && (
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Channel-Specific Optional Fields */}
            {channelConfig.optionalFields.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-title-sm font-medium text-gray-900 dark:text-white">
                  Optional {channelConfig.displayName} Fields
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {channelConfig.optionalFields.map((field) => (
                    <div key={field.fieldName}>
                      <Label>{field.displayName}</Label>
                      {renderField(field)}
                      {field.helpText && (
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Channel Limitations Info */}
            {channelConfig.limitations.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 className="text-theme-sm font-medium text-yellow-900 dark:text-yellow-200 mb-2">
                  {channelConfig.displayName} Platform Limitations
                </h4>
                <ul className="text-theme-xs text-yellow-800 dark:text-yellow-300 space-y-1">
                  {channelConfig.limitations.map((limitation, index) => (
                    <li key={index}>• {limitation.description}</li>
                  ))}
                </ul>
              </div>
            )}
            </div>
          ) : (
            <div>
              {/* View Mode Toggle */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-title-sm font-medium text-gray-900 dark:text-white">
                      {channelConfig.displayName} Variants ({variants.length})
                    </h3>
                    <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
                      Configure variant-specific settings for {channelConfig.displayName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-theme-sm text-gray-700 dark:text-gray-300">View:</span>
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                      <button
                        onClick={() => setVariantViewMode('unified')}
                        className={`px-3 py-1 text-theme-sm rounded-md transition-colors ${
                          variantViewMode === 'unified'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        Unified
                      </button>
                      <button
                        onClick={() => setVariantViewMode('variants')}
                        className={`px-3 py-1 text-theme-sm rounded-md transition-colors ${
                          variantViewMode === 'variants'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        Variants
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <ChannelVariantsList 
                variants={variants}
                channelId={product.channelId}
                channelConfig={channelConfig}
                viewMode={variantViewMode}
                onVariantUpdate={onVariantUpdate}
                onOpenVariantDetails={onOpenVariantDetails}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelProductEditModal;