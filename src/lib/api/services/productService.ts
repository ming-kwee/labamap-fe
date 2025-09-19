/**
 * Product Service
 * Complete CRUD operations and business logic for products
 */

import { apiClient } from '../client';
import { API_CONFIG } from '../config';
import {
  ProductCreateRequest,
  ProductUpdateRequest,
  ProductResponse,
  ProductListRequest,
  ProductListResponse,
  MediaUploadResponse,
  ChannelSyncRequest,
  ChannelSyncResponse,
  VariantChannelSyncRequest,
  VariantChannelSyncResponse,
  EnhancedChannelConfig,
  ChannelSpecificData,
  ProductAnalytics,
  BulkOperation,
  BulkOperationResponse,
  ApiResponse,
  VariantUpdateRequest,
  VariantDetailsResponse,
  BulkVariantUpdateRequest,
  BulkVariantUpdateResponse,
} from '../types';
import { ProductData } from '@/components/products/ProductCreateForm';

export class ProductService {
  /**
   * Create a new product
   */
  async createProduct(productData: ProductData): Promise<ApiResponse<ProductResponse>> {
    return apiClient.post<ProductResponse>(API_CONFIG.ENDPOINTS.CREATE_PRODUCT, productData);
  }

  /**
   * Get product by ID
   */
  async getProduct(id: string): Promise<ApiResponse<ProductResponse>> {
    return apiClient.get<ProductResponse>(
      API_CONFIG.ENDPOINTS.PRODUCT_BY_ID,
      undefined,
      { params: { id } }
    );
  }

  /**
   * Update product
   */
  async updateProduct(id: string, updates: Partial<ProductData>): Promise<ApiResponse<ProductResponse>> {
    const request: ProductUpdateRequest = {
      id,
      product: updates,
    };
    
    return apiClient.put<ProductResponse>(
      API_CONFIG.ENDPOINTS.PRODUCT_BY_ID,
      request,
      { params: { id } }
    );
  }

  /**
   * Delete product
   */
  async deleteProduct(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(
      API_CONFIG.ENDPOINTS.PRODUCT_BY_ID,
      { params: { id } }
    );
  }

  /**
   * Get products list with filtering and pagination
   */
  async getProducts(request: ProductListRequest = {}): Promise<ApiResponse<ProductListResponse>> {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      brand,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = request;

    const params = {
      page,
      limit,
      ...(search && { search }),
      ...(category && { category }),
      ...(brand && { brand }),
      ...(status && { status }),
      sortBy,
      sortOrder,
    };

    return apiClient.get<ProductListResponse>(API_CONFIG.ENDPOINTS.PRODUCTS, params);
  }

  /**
   * Search products
   */
  async searchProducts(query: string, filters?: Partial<ProductListRequest>): Promise<ApiResponse<ProductListResponse>> {
    return this.getProducts({
      search: query,
      ...filters,
    });
  }

  /**
   * Upload product media
   */
  async uploadMedia(file: File, productId?: string, alt?: string): Promise<ApiResponse<MediaUploadResponse>> {
    const additionalData: Record<string, unknown> = {
      type: file.type.startsWith('image/') ? 'image' : 'video',
      ...(productId && { productId }),
      ...(alt && { alt }),
    };

    return apiClient.upload<MediaUploadResponse>(
      API_CONFIG.ENDPOINTS.MEDIA_UPLOAD,
      file,
      additionalData
    );
  }

  /**
   * Optimize media
   */
  async optimizeMedia(mediaId: string, options?: { quality?: number; format?: string }): Promise<ApiResponse<MediaUploadResponse>> {
    return apiClient.post<MediaUploadResponse>(
      API_CONFIG.ENDPOINTS.MEDIA_OPTIMIZE,
      { mediaId, options }
    );
  }

  /**
   * Generate product SKU
   */
  async generateSKU(category?: string): Promise<ApiResponse<{ sku: string }>> {
    return apiClient.post<{ sku: string }>('/products/generate-sku', { category });
  }

  /**
   * Generate product barcode
   */
  async generateBarcode(): Promise<ApiResponse<{ barcode: string }>> {
    return apiClient.post<{ barcode: string }>('/products/generate-barcode');
  }

  /**
   * AI content generation
   */
  async generateContent(productName: string, category?: string): Promise<ApiResponse<{
    description: string;
    seoTitle: string;
    seoDescription: string;
    tags: string[];
  }>> {
    return apiClient.post('/products/generate-content', {
      name: productName,
      category,
    });
  }

  /**
   * Enhanced sync product to channels with channel-specific data
   */
  async syncToChannels(
    productId: string, 
    channels: Array<{ platform: string; storeId: string; channelData?: ChannelSpecificData }>,
    mapping?: Record<string, unknown>,
    syncVariants = false
  ): Promise<ApiResponse<ChannelSyncResponse>> {
    const request: ChannelSyncRequest = {
      productId,
      channels,
      mapping,
      syncVariants,
    };

    return apiClient.post<ChannelSyncResponse>(
      API_CONFIG.ENDPOINTS.CHANNEL_SYNC.replace(':platform', 'all'),
      request
    );
  }

  /**
   * Sync specific variant to a channel
   */
  async syncVariantToChannel(
    productId: string,
    variantId: string,
    channel: string,
    storeId: string,
    channelData: ChannelSpecificData
  ): Promise<ApiResponse<VariantChannelSyncResponse>> {
    const request: VariantChannelSyncRequest = {
      productId,
      variantId,
      channel,
      storeId,
      channelData,
    };

    return apiClient.post<VariantChannelSyncResponse>(
      `/products/${productId}/variants/${variantId}/sync/${channel}`,
      request
    );
  }

  /**
   * Get available channel configurations
   */
  async getChannelConfigs(): Promise<ApiResponse<EnhancedChannelConfig[]>> {
    return apiClient.get<EnhancedChannelConfig[]>('/channels/configs');
  }

  /**
   * Update channel-specific data for a variant
   */
  async updateVariantChannelData(
    productId: string,
    variantId: string,
    channel: string,
    storeId: string,
    channelData: Partial<ChannelSpecificData>
  ): Promise<ApiResponse<ChannelSpecificData>> {
    return apiClient.patch<ChannelSpecificData>(
      `/products/${productId}/variants/${variantId}/channels/${channel}/${storeId}`,
      channelData
    );
  }

  /**
   * Get channel-specific data for a variant
   */
  async getVariantChannelData(
    productId: string,
    variantId: string,
    channel: string,
    storeId: string
  ): Promise<ApiResponse<ChannelSpecificData>> {
    return apiClient.get<ChannelSpecificData>(
      `/products/${productId}/variants/${variantId}/channels/${channel}/${storeId}`
    );
  }

  /**
   * Bulk sync variants to channels
   */
  async bulkSyncVariants(
    productId: string,
    variants: Array<{
      variantId: string;
      channels: Array<{
        platform: string;
        storeId: string;
        channelData: ChannelSpecificData;
      }>;
    }>
  ): Promise<ApiResponse<{
    success: boolean;
    results: Array<{
      variantId: string;
      results: VariantChannelSyncResponse[];
    }>;
  }>> {
    return apiClient.post<{
      success: boolean;
      results: Array<{
        variantId: string;
        results: VariantChannelSyncResponse[];
      }>;
    }>(
      `/products/${productId}/variants/bulk-sync`,
      { variants }
    );
  }

  /**
   * Get product analytics
   */
  async getAnalytics(productId: string, period?: { start: string; end: string }): Promise<ApiResponse<ProductAnalytics>> {
    const params = {
      productId,
      ...(period && { startDate: period.start, endDate: period.end }),
    };

    return apiClient.get<ProductAnalytics>(API_CONFIG.ENDPOINTS.ANALYTICS, params);
  }

  /**
   * Bulk operations
   */
  async bulkCreate(products: Omit<ProductData, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<ApiResponse<BulkOperationResponse>> {
    const operation: BulkOperation = {
      operation: 'create',
      data: products,
    };

    return apiClient.post<BulkOperationResponse>(API_CONFIG.ENDPOINTS.PRODUCT_BULK, operation);
  }

  async bulkUpdate(updates: Array<{ id: string; data: Partial<ProductData> }>): Promise<ApiResponse<BulkOperationResponse>> {
    const operation: BulkOperation = {
      operation: 'update',
      data: updates,
    };

    return apiClient.post<BulkOperationResponse>(API_CONFIG.ENDPOINTS.PRODUCT_BULK, operation);
  }

  async bulkDelete(ids: string[]): Promise<ApiResponse<BulkOperationResponse>> {
    const operation: BulkOperation = {
      operation: 'delete',
      data: ids.map(id => ({ id })),
    };

    return apiClient.post<BulkOperationResponse>(API_CONFIG.ENDPOINTS.PRODUCT_BULK, operation);
  }

  /**
   * Import products from CSV/Excel
   */
  async importProducts(file: File, mapping?: Record<string, string>): Promise<ApiResponse<BulkOperationResponse>> {
    const additionalData = {
      ...(mapping && { mapping: JSON.stringify(mapping) }),
    };

    return apiClient.upload<BulkOperationResponse>(
      '/products/import',
      file,
      additionalData
    );
  }

  /**
   * Export products to CSV/Excel
   */
  async exportProducts(filters?: ProductListRequest, format: 'csv' | 'excel' = 'csv'): Promise<ApiResponse<{ downloadUrl: string }>> {
    const params = {
      format,
      ...filters,
    };

    return apiClient.get<{ downloadUrl: string }>('/products/export', params);
  }

  /**
   * Duplicate product
   */
  async duplicateProduct(id: string, newName?: string): Promise<ApiResponse<ProductResponse>> {
    return apiClient.post<ProductResponse>(
      `/products/${id}/duplicate`,
      { newName }
    );
  }

  /**
   * Archive product (soft delete)
   */
  async archiveProduct(id: string): Promise<ApiResponse<void>> {
    return apiClient.patch<void>(
      API_CONFIG.ENDPOINTS.PRODUCT_BY_ID,
      { status: 'archived' },
      { params: { id } }
    );
  }

  /**
   * Restore archived product
   */
  async restoreProduct(id: string): Promise<ApiResponse<ProductResponse>> {
    return apiClient.patch<ProductResponse>(
      API_CONFIG.ENDPOINTS.PRODUCT_BY_ID,
      { status: 'draft' },
      { params: { id } }
    );
  }

  /**
   * Get product variant groups
   */
  async getVariants(productId: string): Promise<ApiResponse<ProductResponse['variantGroups']>> {
    return apiClient.get<ProductResponse['variantGroups']>(`/products/${productId}/variants`);
  }

  /**
   * Update individual variant details (from Enhanced Modal)
   */
  async updateVariant(
    productId: string,
    variantId: string,
    updates: {
      masterData?: Partial<{
        title: string;
        barcode: string;
        description: string;
        price: number;
        costPrice: number;
        comparePrice: number;
        weight: number;
        dimensions: { length: number; width: number; height: number };
        inventory: number;
        lowStockThreshold: number;
        enabled: boolean;
      }>;
      seoData?: Partial<{
        title: string;
        description: string;
        keywords: string[];
        slug: string;
      }>;
      channelData?: Record<string, Partial<ChannelSpecificData>>;
    }
  ): Promise<ApiResponse<VariantDetailsResponse>> {
    return apiClient.patch<VariantDetailsResponse>(
      `/products/${productId}/variants/${variantId}`,
      updates
    );
  }

  /**
   * Get detailed variant data for the Enhanced Modal
   */
  async getVariantDetails(
    productId: string,
    variantId: string
  ): Promise<ApiResponse<VariantDetailsResponse>> {
    return apiClient.get<VariantDetailsResponse>(
      `/products/${productId}/variants/${variantId}/details`
    );
  }

  /**
   * Generate product variants based on option groups
   */
  async generateVariants(productId: string, options: ProductData['optionGroups']): Promise<ApiResponse<ProductResponse['variantGroups']>> {
    return apiClient.post<ProductResponse['variantGroups']>(
      `/products/${productId}/variants/generate`,
      { options }
    );
  }

  /**
   * Bulk update multiple variants (Enhanced Modal support)
   */
  async bulkUpdateVariants(
    productId: string,
    updates: Array<{
      variantId: string;
      data: {
        masterData?: Partial<Record<string, unknown>>;
        channelData?: Record<string, Partial<ChannelSpecificData>>;
        seoData?: Partial<Record<string, unknown>>;
      };
    }>
  ): Promise<ApiResponse<BulkVariantUpdateResponse>> {
    return apiClient.post<BulkVariantUpdateResponse>(
      `/products/${productId}/variants/bulk-update`,
      { updates }
    );
  }

  /**
   * Delete individual variant
   */
  async deleteVariant(productId: string, variantId: string): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(`/products/${productId}/variants/${variantId}`);
  }

  /**
   * Check product name availability
   */
  async checkNameAvailability(name: string, excludeId?: string): Promise<ApiResponse<{ available: boolean; suggestions?: string[] }>> {
    const params = {
      name,
      ...(excludeId && { excludeId }),
    };

    return apiClient.get<{ available: boolean; suggestions?: string[] }>('/products/check-name', params);
  }

  /**
   * Check SKU availability
   */
  async checkSKUAvailability(sku: string, excludeId?: string): Promise<ApiResponse<{ available: boolean }>> {
    const params = {
      sku,
      ...(excludeId && { excludeId }),
    };

    return apiClient.get<{ available: boolean }>('/products/check-sku', params);
  }
}

// Export singleton instance
export const productService = new ProductService();