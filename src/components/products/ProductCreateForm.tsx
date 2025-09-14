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
  // Product Basics
  name: string;
  description: string;
  category: string;
  brand: string;
  sku: string;
  barcode: string;
  status: "draft" | "active" | "inactive";
  tags: string[];
  
  // Pricing & Inventory
  basePrice: number;
  currency: string;
  costPrice: number;
  comparePrice: number;
  taxable: boolean;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  
  // Images & Media
  images: Array<{
    id: string;
    url: string;
    alt: string;
    isPrimary: boolean;
  }>;
  videos: Array<{
    id: string;
    url: string;
    title: string;
  }>;
  
  // Variants
  hasVariants: boolean;
  variantOptions: Array<{
    name: string;
    values: string[];
  }>;
  variants: Array<{
    id: string;
    sku: string;
    price: number;
    inventory: number;
    attributes: Record<string, string>;
  }>;
  
  // Shipping
  weight: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  shippingClass: string;
  
  // SEO & Marketing
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  metaImage: string;
  
  // Channel Sync
  channels: Array<{
    platform: string;
    storeId: string;
    enabled: boolean;
    customMapping: Record<string, unknown>;
  }>;
  
  // Publishing
  publishedAt: Date | null;
  scheduledPublish: Date | null;
  autoPublish: boolean;
}

const initialProductData: ProductData = {
  name: "",
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
  images: [],
  videos: [],
  hasVariants: false,
  variantOptions: [],
  variants: [],
  weight: 0,
  dimensions: { length: 0, width: 0, height: 0 },
  shippingClass: "",
  seoTitle: "",
  seoDescription: "",
  seoKeywords: [],
  metaImage: "",
  channels: [],
  publishedAt: null,
  scheduledPublish: null,
  autoPublish: false,
};

interface ProductCreateFormProps {
  productId?: string; // For editing existing products
}

export default function ProductCreateForm({ productId }: ProductCreateFormProps = {}) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("basics");
  const [productData, setProductData] = useState<ProductData>(initialProductData);
  
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

  const validateProduct = (): string[] => {
    const errors: string[] = [];
    
    if (!productData.name.trim()) {
      errors.push('Product name is required');
    }
    
    if (!productData.category) {
      errors.push('Category is required');
    }
    
    if (!productData.sku.trim()) {
      errors.push('SKU is required');
    }
    
    if (productData.basePrice <= 0) {
      errors.push('Base price must be greater than 0');
    }
    
    if (!productData.description.trim()) {
      errors.push('Product description is required');
    }

    return errors;
  };

  const handleSave = async (publish = false) => {
    const validationErrors = validateProduct();
    
    if (validationErrors.length > 0) {
      showNotification(`Please fix the following errors:\n${validationErrors.join('\n')}`, 'error');
      return;
    }

    try {
      const dataToSave = {
        ...productData,
        status: publish ? "active" as const : productData.status,
        publishedAt: publish ? new Date() : productData.publishedAt,
      };

      let result;
      if (isEditing && productId) {
        result = await updateProduct.mutate(productId, dataToSave);
      } else {
        result = await createProduct.mutate(dataToSave);
      }

      if (result?.success) {
        showNotification(
          isEditing 
            ? `Product updated ${publish ? 'and published' : ''} successfully!` 
            : `Product created ${publish ? 'and published' : ''} successfully!`
        );
        
        // Redirect to product list or product detail page
        if (!isEditing && result.data?.id) {
          router.push(`/products/${result.data.id}`);
        }
      }
    } catch (error) {
      showNotification(
        `Failed to ${isEditing ? 'update' : 'create'} product: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const handleDuplicate = async () => {
    if (!isEditing) return;
    
    try {
      const duplicatedData = {
        ...productData,
        name: `${productData.name} (Copy)`,
        sku: `${productData.sku}-copy-${Date.now()}`,
        status: "draft" as const,
        publishedAt: null,
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
    _categories: categories?.data || [],
    _brands: brands?.data || [],
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
        return <ChannelSync data={enhancedProductData} onUpdate={updateProductData} />;
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