"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProductNavigation from "./ProductNavigation";
import ProductBasics from "./sections/ProductBasics";
import PricingInventory from "./sections/PricingInventory";
import ImagesMedia from "./sections/ImagesMedia";
import ProductVariants from "./sections/ProductVariants";
import ShippingDetails from "./sections/ShippingDetails";
import SEOMarketing from "./sections/SEOMarketing";
import ChannelSync from "./sections/ChannelSync";
import PublishSettings from "./sections/PublishSettings";
import ProductAnalytics from "./sections/ProductAnalytics";
import ProductReviews from "./sections/ProductReviews";
import ProductBundles from "./sections/ProductBundles";
import ProductSidebar from "./ProductSidebar";
import { useCreateProduct, useUpdateProduct, useCategories, useBrands } from "@/lib/api/hooks/useProducts";

export interface ProductData {
  masterAttributes: {
    id: string;
    product_unique_id: string;
    product_id: string;
    product_name: string;
    description: string;
    category: string;
    brand: string;
    sku: string;
    barcode: string;
    status: "draft" | "active" | "inactive";
    tags: string[];
    basePrice: number;
    currency: string;
    costPrice: number;
    comparePrice: number;
    taxable: boolean;
    trackInventory: boolean;
    stockQuantity: number;
    lowStockThreshold: number;
    weight: number;
    dimensions: {
      length: number;
      width: number;
      height: number;
    };
    shippingClass: string;
    seoTitle: string;
    seoDescription: string;
    seoKeywords: string[];
    metaImage: string;
    channels: Array<{
      platform: string;
      storeId: string;
      enabled: boolean;
      customMapping: Record<string, unknown>;
    }>;
    publishedAt: Date | null;
    scheduledPublish: Date | null;
    autoPublish: boolean;
    product_images: Array<{
      src: string;
    }>;
    videos: Array<{
      id: string;
      url: string;
      title: string;
    }>;
  };
  variantGroups: Array<{
    channel_variant_option1_key: string;
    channel_variant_option1_value: string;
    channel_variant_option2_key: string;
    channel_variant_option2_value: string;
  }>;
  optionGroups: Array<{
    channel_option_name: string;
    channel_option_values: Array<{
      channel_option_value: string;
      channel_option_description: string;
    }>;
  }>;
  enhancedVariants?: Array<{
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
      visibility?: boolean;
      tags?: string[];
      images?: string[];
      customFields?: Record<string, unknown>;
      platformSpecific?: Record<string, unknown>;
      seo?: {
        title?: string;
        description?: string;
        keywords?: string[];
        slug?: string;
      };
      inventoryManagement?: {
        trackInventory?: boolean;
        lowStockThreshold?: number;
        allowBackorders?: boolean;
        reservedQuantity?: number;
      };
      lastSynced?: Date;
      syncStatus?: 'pending' | 'synced' | 'error';
      syncErrors?: string[];
    }>;
    globalSettings?: {
      requiresShipping?: boolean;
      hsCode?: string;
      countryOfOrigin?: string;
      notes?: string;
    };
  }>;
}

const initialProductData: ProductData = {
  masterAttributes: {
    id: "",
    product_unique_id: "",
    product_id: "",
    product_name: "",
    description: "",
    category: "",
    brand: "",
    sku: "",
    barcode: "",
    status: "draft",
    tags: [],
    basePrice: 0,
    currency: "USD",
    costPrice: 0,
    comparePrice: 0,
    taxable: true,
    trackInventory: true,
    stockQuantity: 0,
    lowStockThreshold: 5,
    weight: 0,
    dimensions: {
      length: 0,
      width: 0,
      height: 0,
    },
    shippingClass: "standard",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: [],
    metaImage: "",
    channels: [],
    publishedAt: null,
    scheduledPublish: null,
    autoPublish: false,
    product_images: [],
    videos: [],
  },
  variantGroups: [],
  optionGroups: [],
  enhancedVariants: [],
};

interface ProductCreateFormProps {
  productId?: string; // For editing existing products
}

export default function ProductCreateForm({ productId }: ProductCreateFormProps = {}) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("basics");
  const [productData, setProductData] = useState<ProductData>(initialProductData);
  const [currentProductId, setCurrentProductId] = useState<string | undefined>(productId);
  const [channelSyncFunctions, setChannelSyncFunctions] = useState<{
    validateChannelsForSync: () => { isValid: boolean; errors: string[] };
    triggerAutoSync: () => Promise<unknown>;
    syncAllChannels: () => Promise<unknown>;
    handleChannelSync: (channelId: string, storeId?: string) => Promise<void>;
  } | null>(null);
  const [channelSyncStatus, setChannelSyncStatus] = useState<Record<string, {
    status: 'pending' | 'synced' | 'error';
    errors?: string[];
  }>>({});
  
  // API hooks
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { data: categories } = useCategories();
  const { data: brands } = useBrands();

  // Loading and error states
  const isSaving = createProduct.loading || updateProduct.loading;
  const isEditing = Boolean(productId);

  const updateProductData = (updates: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...updates }));
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    // Simple notification - you can replace with your preferred toast library
    console.log(`${type.toUpperCase()}: ${message}`);
    // For now, we'll use a simple alert - replace with proper toast notifications
    if (type === 'error') {
      alert(`Error: ${message}`);
    }
  };

  const validateProduct = (includeChannelValidation = false): string[] => {
    const errors: string[] = [];
    
    if (!productData.masterAttributes.product_name.trim()) {
      errors.push('Product name is required');
    }
    
    if (!productData.masterAttributes.category) {
      errors.push('Category is required');
    }
    
    if (!productData.masterAttributes.sku.trim()) {
      errors.push('SKU is required');
    }
    
    if (productData.masterAttributes.basePrice <= 0) {
      errors.push('Base price must be greater than 0');
    }
    
    if (!productData.masterAttributes.description.trim()) {
      errors.push('Product description is required');
    }

    // Enhanced: Channel validation for publish operations
    if (includeChannelValidation && channelSyncFunctions) {
      const channelValidation = channelSyncFunctions.validateChannelsForSync();
      if (!channelValidation.isValid) {
        errors.push(...channelValidation.errors.map(err => `Channel: ${err}`));
      }
    }

    return errors;
  };

  const handleSave = async (publish = false, autoSync = false) => {
    // Enhanced validation with channel checks for publish operations
    const validationErrors = validateProduct(publish);
    
    if (validationErrors.length > 0) {
      showNotification(`Please fix the following errors:\n${validationErrors.join('\n')}`, 'error');
      return;
    }

    try {
      const dataToSave = {
        ...productData,
        masterAttributes: {
          ...productData.masterAttributes,
          status: publish ? "active" as const : productData.masterAttributes.status,
          publishedAt: publish ? new Date() : productData.masterAttributes.publishedAt,
        }
      };

      let result;
      if (isEditing && productId) {
        result = await updateProduct.mutate(productId, dataToSave);
      } else {
        result = await createProduct.mutate(dataToSave);
      }

      if (result?.success) {
        // Update the current product ID for channel sync operations
        const savedProductId = result.data?.id || productId;
        setCurrentProductId(savedProductId);
        
        showNotification(
          isEditing 
            ? `Product updated ${publish ? 'and published' : ''} successfully!` 
            : `Product created ${publish ? 'and published' : ''} successfully!`
        );
        
        // Enhanced: Auto-sync to channels after successful save/publish
        if (publish && autoSync && channelSyncFunctions && savedProductId) {
          const enabledChannels = productData.masterAttributes.channels?.filter(c => c.enabled) || [];
          
          if (enabledChannels.length > 0) {
            showNotification('Starting automatic channel sync...', 'success');
            
            try {
              const syncResults = await channelSyncFunctions.triggerAutoSync();
              if (syncResults && Array.isArray(syncResults)) {
                const successCount = syncResults.filter((r: unknown) => (r as { success: boolean }).success).length;
                const failCount = syncResults.length - successCount;
                
                if (failCount === 0) {
                  showNotification(`Product successfully synced to ${successCount} channel(s)!`, 'success');
                } else {
                  showNotification(`Product synced to ${successCount} channel(s), ${failCount} failed. Check channel status for details.`, 'error');
                }
              }
            } catch (syncError) {
              showNotification('Channel sync failed. You can retry from the Channel Sync section.', 'error');
              console.error('Auto-sync failed:', syncError);
            }
          }
        }
        
        // Redirect to product list or product detail page
        if (!isEditing && savedProductId) {
          router.push(`/products/${savedProductId}`);
        }
      }
      
      return result;
    } catch (error) {
      showNotification(
        `Failed to ${isEditing ? 'update' : 'create'} product: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      throw error;
    }
  };

  // Enhanced: Channel sync status tracking
  const handleChannelSyncStatusChange = (channelId: string, status: 'pending' | 'synced' | 'error', errors?: string[]) => {
    setChannelSyncStatus(prev => ({
      ...prev,
      [channelId]: { status, errors }
    }));
    
    // Show notifications for sync status changes
    switch (status) {
      case 'pending':
        showNotification(`Syncing to ${channelId}...`, 'success');
        break;
      case 'synced':
        showNotification(`Successfully synced to ${channelId}!`, 'success');
        break;
      case 'error':
        showNotification(`Failed to sync to ${channelId}: ${errors?.[0] || 'Unknown error'}`, 'error');
        break;
    }
  };

  // Enhanced: Save and publish with auto-sync
  const handleSaveAndSync = async () => {
    return await handleSave(true, true); // publish = true, autoSync = true
  };

  const handleDuplicate = async () => {
    if (!isEditing) return;
    
    try {
      const duplicatedData = {
        ...productData,
        masterAttributes: {
          ...productData.masterAttributes,
          product_name: `${productData.masterAttributes.product_name} (Copy)`,
          sku: `${productData.masterAttributes.sku}-copy-${Date.now()}`,
          status: "draft" as const,
          publishedAt: null,
        }
      };
      
      const result = await createProduct.mutate(duplicatedData);
      
      if (result?.success) {
        showNotification('Product duplicated successfully!');
        if (result.data?.id) {
          router.push(`/products/${result.data.id}/edit`);
        }
      }
    } catch {
      showNotification('Failed to duplicate product', 'error');
    }
  };

  // Load existing product data if editing
  useEffect(() => {
    if (productId && isEditing) {
      // You would fetch the product data here
      // For now, we'll leave this as a placeholder
      // const { data: existingProduct } = useProduct(productId);
      // if (existingProduct) {
      //   setProductData(existingProduct);
      // }
    }
  }, [productId, isEditing]);

  // Provide categories and brands data to child components
  const enhancedProductData = {
    ...productData,
    _categories: categories || [],
    _brands: brands || [],
  };

  const renderSection = () => {
    switch (activeSection) {
      case "basics":
        return <ProductBasics data={enhancedProductData} onUpdate={updateProductData} />;
      case "pricing":
        return <PricingInventory data={enhancedProductData} onUpdate={updateProductData} />;
      case "media":
        return <ImagesMedia data={enhancedProductData} onUpdate={updateProductData} />;
      case "variants":
        return <ProductVariants data={enhancedProductData} onUpdate={updateProductData} />;
      case "shipping":
        return <ShippingDetails data={enhancedProductData} onUpdate={updateProductData} />;
      case "seo":
        return <SEOMarketing data={enhancedProductData} onUpdate={updateProductData} />;
      case "channels":
        return (
          <ChannelSync 
            data={enhancedProductData} 
            onUpdate={updateProductData}
            productId={currentProductId}
            onSyncStatusChange={handleChannelSyncStatusChange}
            autoSyncEnabled={true}
            onSyncFunctionsReady={setChannelSyncFunctions}
          />
        );
      case "publishing":
        return <PublishSettings data={enhancedProductData} onUpdate={updateProductData} />;
      case "analytics":
        return <ProductAnalytics data={enhancedProductData} />;
      case "reviews":
        return <ProductReviews data={enhancedProductData} />;
      case "bundles":
        return <ProductBundles data={enhancedProductData} onUpdate={updateProductData} />;
      default:
        return <ProductBasics data={enhancedProductData} onUpdate={updateProductData} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {isEditing ? 'Edit Product' : 'Create Product'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Manage your product across all channels and stores
              </p>
              {(createProduct.error || updateProduct.error) && (
                <p className="text-sm text-red-500 mt-1">
                  {createProduct.error || updateProduct.error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isEditing && (
                <button 
                  onClick={handleDuplicate}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Duplicate
                </button>
              )}
              <button 
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
              <button 
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {isSaving ? "Publishing..." : "Save & Publish"}
              </button>
              
              {/* Enhanced: Save, Publish & Auto-Sync Button */}
              {productData.masterAttributes.channels?.some(c => c.enabled) && (
                <button 
                  onClick={handleSaveAndSync}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-brand-500 to-purple-600 rounded-lg hover:from-brand-600 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? "Publishing & Syncing..." : "Publish & Sync All"}
                  <span className="text-xs">🔄</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <ProductSidebar 
          productData={productData}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {/* Main Content */}
        <div className="flex-1 px-6 py-6">
          <div className="max-w-4xl mx-auto">
            {/* Navigation Tabs */}
            <ProductNavigation 
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />

            {/* Section Content */}
            <div className="mt-6">
              {renderSection()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}