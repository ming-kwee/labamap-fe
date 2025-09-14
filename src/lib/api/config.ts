/**
 * API Configuration
 * Centralized configuration for all API endpoints and settings
 */

export const API_CONFIG = {
  // Base URL for the API - can be configured via environment variables
  BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.example.com/v1',
  
  // API timeout in milliseconds
  TIMEOUT: 30000,
  
  // Default headers for all requests
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  
  // API endpoints
  ENDPOINTS: {
    // Product endpoints
    PRODUCTS: '/products',
    PRODUCT_BY_ID: '/products/:id',
    PRODUCT_UPLOAD: '/products/upload',
    PRODUCT_BULK: '/products/bulk',
    
    // Category endpoints
    CATEGORIES: '/categories',
    
    // Brand endpoints
    BRANDS: '/brands',
    
    // Media endpoints
    MEDIA_UPLOAD: '/media/upload',
    MEDIA_OPTIMIZE: '/media/optimize',
    
    // Channel sync endpoints
    CHANNELS: '/channels',
    CHANNEL_SYNC: '/channels/:platform/sync',
    
    // Analytics endpoints
    ANALYTICS: '/analytics/products',
    
    // Auth endpoints (if needed)
    AUTH_LOGIN: '/auth/login',
    AUTH_REFRESH: '/auth/refresh',
  },
  
  // OpenAPI schema URL
  OPENAPI_SCHEMA_URL: process.env.NEXT_PUBLIC_OPENAPI_SCHEMA_URL || 'https://api.example.com/openapi.json',
} as const;

export type ApiEndpoint = keyof typeof API_CONFIG.ENDPOINTS;