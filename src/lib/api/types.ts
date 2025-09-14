/**
 * API Types and Interfaces
 * Comprehensive type definitions for API requests and responses
 */

import { ProductData } from '@/components/products/ProductCreateForm';

// Base API response structure
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    pagination?: Pagination;
    total?: number;
    timestamp?: string;
  };
}

// Error structure
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  field?: string;
}

// Pagination structure
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Request options
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number>;
  timeout?: number;
  retries?: number;
}

// Product API types
export interface ProductCreateRequest {
  product: Omit<ProductData, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface ProductUpdateRequest {
  id: string;
  product: Partial<ProductData>;
}

export interface ProductResponse extends ProductData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListRequest {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  status?: ProductData['status'];
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'price';
  sortOrder?: 'asc' | 'desc';
}

export interface ProductListResponse {
  products: ProductResponse[];
  pagination: Pagination;
}

// Media upload types
export interface MediaUploadRequest {
  file: File;
  type: 'image' | 'video';
  productId?: string;
  alt?: string;
}

export interface MediaUploadResponse {
  id: string;
  url: string;
  type: 'image' | 'video';
  size: number;
  dimensions?: {
    width: number;
    height: number;
  };
  optimized?: {
    url: string;
    size: number;
  };
}

// Category and brand types
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
}

// Channel sync types
export interface Channel {
  id: string;
  platform: string;
  name: string;
  storeId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastSync?: string;
}

export interface ChannelSyncRequest {
  productId: string;
  channels: string[];
  mapping?: Record<string, unknown>;
}

export interface ChannelSyncResponse {
  success: boolean;
  results: Array<{
    channel: string;
    status: 'success' | 'error';
    message?: string;
    externalId?: string;
  }>;
}

// Analytics types
export interface ProductAnalytics {
  productId: string;
  views: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  period: {
    start: string;
    end: string;
  };
  breakdown: {
    daily: Array<{
      date: string;
      views: number;
      conversions: number;
      revenue: number;
    }>;
  };
}

// Bulk operations
export interface BulkOperation<T = unknown> {
  operation: 'create' | 'update' | 'delete';
  data: T[];
}

export interface BulkOperationResponse {
  success: boolean;
  processed: number;
  errors: Array<{
    index: number;
    error: ApiError;
  }>;
}

// OpenAPI schema types
export interface OpenApiSchema {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}