/**
 * API Integration System - Main Export
 * Centralized exports for the complete API integration system
 */

// Core API utilities
export { apiClient, ApiClient } from './client';
export { API_CONFIG } from './config';

// Type definitions
export type {
  ApiResponse,
  ApiError,
  Pagination,
  RequestOptions,
  ProductCreateRequest,
  ProductUpdateRequest,
  ProductResponse,
  ProductListRequest,
  ProductListResponse,
  MediaUploadRequest,
  MediaUploadResponse,
  Category,
  Brand,
  Channel,
  ChannelSyncRequest,
  ChannelSyncResponse,
  ProductAnalytics,
  BulkOperation,
  BulkOperationResponse,
  OpenApiSchema,
} from './types';

// Services
export {
  productService,
  categoryService,
  brandService,
} from './services';

// React Hooks
export {
  useApi,
  useMutation,
  useQuery,
  useInfiniteQuery,
} from './hooks/useApi';

export {
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useProduct,
  useProducts,
  useProductSearch,
  useMediaUpload,
  useGenerateSKU,
  useGenerateBarcode,
  useGenerateContent,
  useChannelSync,
  useProductAnalytics,
  useCategories,
  useBrands,
  useBulkOperations,
  useProductImportExport,
  useAvailabilityCheck,
} from './hooks/useProducts';

// Example components (for development/testing)
export {
  CompleteAPIExamples,
  SimpleProductCreation,
  ProductListWithSearch,
  AdvancedProductForm,
  BulkOperationsExample,
  RealTimeProductUpdates,
} from './examples/ExampleUsage';