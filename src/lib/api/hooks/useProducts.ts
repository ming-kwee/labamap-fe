/**
 * Product-specific API hooks
 * Specialized hooks for product operations with proper typing
 */

import { useCallback } from 'react';
import { productService } from '../services/productService';
import { categoryService } from '../services/categoryService';
import { brandService } from '../services/brandService';
import { ProductData } from '@/types/product';
import type { ProductListRequest, ChannelSpecificData, VariantChannelSyncResponse } from '../types';
import { useApi, useMutation, useQuery } from './useApi';

/**
 * Hook for creating products
 */
export function useCreateProduct() {
  return useMutation(
    (...args: unknown[]) => {
      const [productData] = args as [Omit<ProductData, 'id' | 'createdAt' | 'updatedAt'>];
      return productService.createProduct(productData);
    },
    {
      onSuccess: () => {
        console.log('Product created successfully');
      },
      onError: (error) => {
        console.error('Failed to create product:', error);
      },
    }
  );
}

/**
 * Hook for updating products
 */
export function useUpdateProduct() {
  return useMutation(
    (...args: unknown[]) => {
      const [id, updates] = args as [string, Partial<ProductData>];
      return productService.updateProduct(id, updates);
    },
    {
      onSuccess: () => {
        console.log('Product updated successfully');
      },
      onError: (error) => {
        console.error('Failed to update product:', error);
      },
    }
  );
}

/**
 * Hook for deleting products
 */
export function useDeleteProduct() {
  return useMutation(
    (...args: unknown[]) => {
      const [id] = args as [string];
      return productService.deleteProduct(id);
    },
    {
      onSuccess: () => {
        console.log('Product deleted successfully');
      },
      onError: (error) => {
        console.error('Failed to delete product:', error);
      },
    }
  );
}

/**
 * Hook for fetching a single product
 */
export function useProduct(id: string) {
  return useQuery(
    () => productService.getProduct(id),
    [id],
    {
      onError: (error) => {
        console.error('Failed to fetch product:', error);
      },
    }
  );
}

/**
 * Hook for fetching products list
 */
export function useProducts(request: ProductListRequest = {}) {
  return useQuery(
    () => productService.getProducts(request),
    [request],
    {
      onError: (error) => {
        console.error('Failed to fetch products:', error);
      },
    }
  );
}

/**
 * Hook for searching products
 */
export function useProductSearch() {
  return useApi((...args: unknown[]) => {
    const [query, filters] = args as [string, Partial<ProductListRequest>?];
    return productService.searchProducts(query, filters);
  });
}

/**
 * Hook for uploading media
 */
export function useMediaUpload() {
  return useMutation(
    (file: File, productId?: string, alt?: string) =>
      productService.uploadMedia(file, productId, alt),
    {
      onSuccess: (data) => {
        console.log('Media uploaded successfully:', data);
      },
      onError: (error) => {
        console.error('Failed to upload media:', error);
      },
    }
  );
}

/**
 * Hook for generating SKU
 */
export function useGenerateSKU() {
  return useMutation(
    (category?: string) => productService.generateSKU(category),
    {
      onError: (error) => {
        console.error('Failed to generate SKU:', error);
      },
    }
  );
}

/**
 * Hook for generating barcode
 */
export function useGenerateBarcode() {
  return useMutation(
    () => productService.generateBarcode(),
    {
      onError: (error) => {
        console.error('Failed to generate barcode:', error);
      },
    }
  );
}

/**
 * Hook for AI content generation
 */
export function useGenerateContent() {
  return useMutation(
    (productName: string, category?: string) =>
      productService.generateContent(productName, category),
    {
      onError: (error) => {
        console.error('Failed to generate content:', error);
      },
    }
  );
}

/**
 * Hook for enhanced channel sync with channel-specific data
 */
export function useChannelSync() {
  return useMutation(
    (...args: unknown[]) => {
      const [productId, channels, mapping, syncVariants] = args as [
        string,
        Array<{ platform: string; storeId: string; channelData?: ChannelSpecificData }>,
        Record<string, unknown>?,
        boolean?
      ];
      return productService.syncToChannels(productId, channels, mapping, syncVariants);
    },
    {
      onSuccess: (data) => {
        console.log('Product synced to channels:', data);
      },
      onError: (error) => {
        console.error('Failed to sync to channels:', error);
      },
    }
  );
}

/**
 * Hook for product analytics
 */
export function useProductAnalytics(productId: string, period?: { start: string; end: string }) {
  return useQuery(
    () => productService.getAnalytics(productId, period),
    [productId, period],
    {
      onError: (error) => {
        console.error('Failed to fetch analytics:', error);
      },
    }
  );
}

/**
 * Hook for categories
 */
export function useCategories() {
  return useQuery(
    () => categoryService.getCategories(),
    [],
    {
      onError: (error) => {
        console.error('Failed to fetch categories:', error);
      },
    }
  );
}

/**
 * Hook for brands
 */
export function useBrands() {
  return useQuery(
    () => brandService.getBrands(),
    [],
    {
      onError: (error) => {
        console.error('Failed to fetch brands:', error);
      },
    }
  );
}

/**
 * Hook for bulk operations
 */
export function useBulkOperations() {
  const bulkCreate = useMutation(
    (products: Omit<ProductData, 'id' | 'createdAt' | 'updatedAt'>[]) =>
      productService.bulkCreate(products)
  );

  const bulkUpdate = useMutation(
    (updates: Array<{ id: string; data: Partial<ProductData> }>) =>
      productService.bulkUpdate(updates)
  );

  const bulkDelete = useMutation(
    (ids: string[]) => productService.bulkDelete(ids)
  );

  return {
    bulkCreate,
    bulkUpdate,
    bulkDelete,
  };
}

/**
 * Hook for product import/export
 */
export function useProductImportExport() {
  const importProducts = useMutation(
    (file: File, mapping?: Record<string, string>) =>
      productService.importProducts(file, mapping),
    {
      onSuccess: (data) => {
        console.log('Products imported successfully:', data);
      },
      onError: (error) => {
        console.error('Failed to import products:', error);
      },
    }
  );

  const exportProducts = useMutation(
    (filters?: ProductListRequest, format: 'csv' | 'excel' = 'csv') =>
      productService.exportProducts(filters, format),
    {
      onSuccess: (data) => {
        console.log('Products exported successfully:', data);
      },
      onError: (error) => {
        console.error('Failed to export products:', error);
      },
    }
  );

  return {
    importProducts,
    exportProducts,
  };
}

/**
 * Hook for checking availability
 */
export function useAvailabilityCheck() {
  const checkName = useCallback(
    (name: string, excludeId?: string) =>
      productService.checkNameAvailability(name, excludeId),
    []
  );

  const checkSKU = useCallback(
    (sku: string, excludeId?: string) =>
      productService.checkSKUAvailability(sku, excludeId),
    []
  );

  return {
    checkName,
    checkSKU,
  };
}

/**
 * Hook for variant channel synchronization
 */
export function useVariantChannelSync() {
  return useMutation(
    (...args: unknown[]) => {
      const [productId, variantId, channel, storeId, channelData] = args as [
        string,
        string,
        string,
        string,
        ChannelSpecificData
      ];
      return productService.syncVariantToChannel(productId, variantId, channel, storeId, channelData);
    },
    {
      onSuccess: (data) => {
        console.log('Variant synced to channel:', data);
      },
      onError: (error) => {
        console.error('Failed to sync variant to channel:', error);
      },
    }
  );
}

/**
 * Hook for getting channel configurations
 */
export function useChannelConfigs() {
  return useQuery(
    () => productService.getChannelConfigs(),
    [],
    {
      onError: (error) => {
        console.error('Failed to fetch channel configs:', error);
      },
    }
  );
}

/**
 * Hook for managing variant channel data
 */
export function useVariantChannelData() {
  const updateChannelData = useMutation(
    (...args: unknown[]) => {
      const [productId, variantId, channel, storeId, channelData] = args as [
        string,
        string,
        string,
        string,
        Partial<ChannelSpecificData>
      ];
      return productService.updateVariantChannelData(productId, variantId, channel, storeId, channelData);
    },
    {
      onSuccess: (data) => {
        console.log('Variant channel data updated:', data);
      },
      onError: (error) => {
        console.error('Failed to update variant channel data:', error);
      },
    }
  );

  const getChannelData = useCallback(
    (productId: string, variantId: string, channel: string, storeId: string) =>
      productService.getVariantChannelData(productId, variantId, channel, storeId),
    []
  );

  return {
    updateChannelData,
    getChannelData,
  };
}

/**
 * Hook for bulk variant synchronization
 */
export function useBulkVariantSync() {
  return useMutation(
    (...args: unknown[]) => {
      const [productId, variants] = args as [
        string,
        Array<{
          variantId: string;
          channels: Array<{
            platform: string;
            storeId: string;
            channelData: ChannelSpecificData;
          }>;
        }>
      ];
      return productService.bulkSyncVariants(productId, variants);
    },
    {
      onSuccess: (data) => {
        console.log('Variants bulk synced:', data);
      },
      onError: (error) => {
        console.error('Failed to bulk sync variants:', error);
      },
    }
  );
}

/**
 * Hook for product variants management
 */
export function useProductVariants() {
  const getVariants = useCallback(
    (productId: string) => productService.getVariants(productId),
    []
  );

  const generateVariants = useMutation(
    (...args: unknown[]) => {
      const [productId, options] = args as [string, ProductData['optionGroups']];
      return productService.generateVariants(productId, options);
    },
    {
      onSuccess: (data) => {
        console.log('Variants generated:', data);
      },
      onError: (error) => {
        console.error('Failed to generate variants:', error);
      },
    }
  );

  return {
    getVariants,
    generateVariants,
  };
}