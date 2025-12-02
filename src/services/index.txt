/**
 * Omnichannel Product Management Services
 * 
 * This module exports all the services needed for the complete
 * master product creation to channel publishing workflow.
 */

// Core Product Management
// Note: MasterProductService moved to backup/obsolete-services - use BackendAPIService instead
// export {
//   MasterProductService,
//   masterProductService,
//   type FieldDefinition,
//   type ValidationError
// } from './MasterProductService';

// Channel Management and Mapping
export { 
  ChannelMappingService, 
  channelMappingService,
  type PublishResult,
  type BulkPublishResult,
  type ValidationResult,
  type MappingHistoryEntry,
  type ChannelAnalytics 
} from './ChannelMappingService';

// Bulk Operations
export { 
  BulkOperationsService, 
  bulkOperationsService,
  type BulkDeleteResponse,
  type BulkDuplicateOptions,
  type BulkDuplicateResponse,
  type BulkExportResponse,
  type BulkImportOptions,
  type BulkImportResponse,
  type BulkOperationStatus,
  type BulkOperationHistoryEntry,
  type BulkValidationResult,
  type BulkOperationTemplate 
} from './BulkOperationsService';

// Adaptive Pattern Matching and Semantic Field Mapping
export { 
  AdaptivePatternMatchingService, 
  adaptivePatternMatchingService,
  ClientSidePatternMatching,
  type SemanticMatchResult,
  type PlatformMapping,
  type MappingValidationResult,
  type MappingFeedback,
  type SimilarMapping,
  type OptimizedMapping,
  type MappingAnalytics 
} from './AdaptivePatternMatchingService';

// Service Configuration
export const ServiceConfig = {
  // API Base URLs
  apiBaseUrl: '/api/v1',
  
  // Service Endpoints
  endpoints: {
    products: '/api/v1/products',
    channels: '/api/v1/channels',
    mapping: '/api/v1/mapping',
    bulk: '/api/v1/products/bulk'
  },
  
  // Default Configuration
  defaults: {
    // Request timeouts in milliseconds
    requestTimeout: 30000,
    
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000,
    
    // Bulk operation limits
    maxBulkSize: 1000,
    defaultBatchSize: 50,
    
    // Confidence thresholds
    minMappingConfidence: 50,
    autoApplyThreshold: 90,
    
    // Validation settings
    validateMappings: true,
    requireConfirmation: true
  },
  
  // Feature Flags
  features: {
    semanticMapping: true,
    adaptivePatternMatching: true,
    bulkOperations: true,
    realTimeValidation: true,
    mappingAnalytics: true,
    channelRecommendations: true
  }
};

// Service Health Check
export const HealthCheckService = {
  async checkServiceHealth(): Promise<ServiceHealthStatus> {
    const services = [
      // Note: MasterProduct service removed - use BackendAPIService instead
      { name: 'ChannelMapping', service: channelMappingService },
      { name: 'BulkOperations', service: bulkOperationsService },
      { name: 'AdaptivePatternMatching', service: adaptivePatternMatchingService }
    ];

    const healthChecks = await Promise.allSettled(
      services.map(async ({ name, service }) => {
        try {
          // Perform a lightweight health check call
          const startTime = Date.now();
          
          // For demonstration - you would implement actual health check endpoints
          const response = await fetch(`${ServiceConfig.endpoints.products}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });
          
          const responseTime = Date.now() - startTime;
          
          return {
            service: name,
            status: response.ok ? 'healthy' : 'unhealthy',
            responseTime,
            lastChecked: new Date().toISOString()
          };
        } catch (error) {
          return {
            service: name,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            lastChecked: new Date().toISOString()
          };
        }
      })
    );

    const results = healthChecks.map((check, index) => ({
      ...services[index],
      ...(check.status === 'fulfilled' ? check.value : { 
        status: 'error', 
        error: 'Health check failed' 
      })
    }));

    const overallHealth = results.every(r => r.status === 'healthy') ? 'healthy' : 'degraded';

    return {
      overall: overallHealth,
      services: results,
      timestamp: new Date().toISOString()
    };
  }
};

// Types for health check
export interface ServiceHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: Array<{
    service: string;
    status: 'healthy' | 'unhealthy' | 'error';
    responseTime?: number;
    error?: string;
    lastChecked: string;
  }>;
  timestamp: string;
}

// Utility Functions
export const ServiceUtils = {
  /**
   * Format API errors for user display
   */
  formatError(error: any): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.message) {
      return error.message;
    }
    return 'An unexpected error occurred';
  },

  /**
   * Check if an error is a network error
   */
  isNetworkError(error: any): boolean {
    return error.code === 'NETWORK_ERROR' || 
           error.message?.includes('Network Error') ||
           error.name === 'NetworkError';
  },

  /**
   * Retry a failed request with exponential backoff
   */
  async retryRequest<T>(
    requestFn: () => Promise<T>, 
    maxRetries: number = ServiceConfig.defaults.maxRetries,
    baseDelay: number = ServiceConfig.defaults.retryDelay
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Only retry on network errors or 5xx status codes
        if (!this.isNetworkError(error) && 
            error.response?.status < 500) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  },

  /**
   * Validate product data before sending to API
   */
  validateProductData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.sku || typeof data.sku !== 'string') {
      errors.push('SKU is required and must be a string');
    }

    if (!data.name || typeof data.name !== 'string') {
      errors.push('Product name is required and must be a string');
    }

    if (typeof data.price !== 'number' || data.price < 0) {
      errors.push('Price must be a positive number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove < and > characters
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }
};

// Export default configuration
export default ServiceConfig;