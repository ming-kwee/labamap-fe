/**
 * Backend API Service - Integration with real backend APIs
 * This replaces the mock Next.js APIs with actual backend endpoints
 */

import { DynamicFormSchema, DynamicFormData } from '@/types/dynamicForm';
import { MasterProduct } from '@/types/product';

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1/ecommerce';

export interface BackendContext {
  userId: string;
  organizationId: string;
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER';
  targetChannels: string[];
  productCategory: string;
  permissions: string[];
  requestId?: string;
  timestamp?: number;
  environment?: string;
  metadata?: {
    targetChannels: string[];
    apiVersion: string;
  };
}

export class BackendAPIService {
  /**
   * Master Attributes APIs
   */
  
  // GET /api/v1/ecommerce/master-attributes/all
  static async getAllMasterAttributes(): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/all`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get master attributes: ${response.statusText}`);
    }
    
    return response.json();
  }

  // GET /api/v1/ecommerce/master-attributes/categories
  static async getCategories(): Promise<string[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/categories`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get categories: ${response.statusText}`);
    }
    
    return response.json();
  }

  // GET /api/v1/ecommerce/master-attributes/form-fields?category=electronics
  static async getFormFields(category: string): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/form-fields?category=${category}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get form fields: ${response.statusText}`);
    }
    
    return response.json();
  }

  // GET /api/v1/ecommerce/master-attributes/category-config?category=electronics
  static async getCategoryConfig(category: string): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/category-config?category=${category}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get category config: ${response.statusText}`);
    }
    
    return response.json();
  }

  // GET /api/v1/ecommerce/master-attributes/validation?fieldName=price&category=electronics
  static async getFieldValidation(fieldName: string, category: string): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/validation?fieldName=${fieldName}&category=${category}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get field validation: ${response.statusText}`);
    }
    
    return response.json();
  }

  // GET /api/v1/ecommerce/master-attributes/channel-fields?channelId=shopify
  static async getChannelFields(channelId: string): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/channel-fields?channelId=${channelId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get channel fields: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Form Schema Generation APIs
   */
  
  // POST /api/v1/ecommerce/form-schema/generate
  static async generateFormSchema(context: BackendContext): Promise<DynamicFormSchema> {
    const response = await fetch(`${BACKEND_BASE_URL}/form-schema/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          ...context,
          requestId: context.requestId || `req_${Date.now()}`,
          timestamp: context.timestamp || Date.now(),
          environment: context.environment || 'development',
          metadata: {
            targetChannels: context.targetChannels,
            apiVersion: 'v1',
            ...context.metadata
          }
        }
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to generate form schema: ${response.statusText}`);
    }
    
    return response.json();
  }

  // GET /api/v1/ecommerce/form-schema/generate (alternative GET method)
  static async generateFormSchemaGet(params: {
    userId: string;
    organizationId: string;
    userRole: string;
    category: string;
    channels: string;
  }): Promise<DynamicFormSchema> {
    const queryParams = new URLSearchParams(params).toString();
    const response = await fetch(`${BACKEND_BASE_URL}/form-schema/generate?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to generate form schema: ${response.statusText}`);
    }

    return response.json();
  }

  // POST /api/v1/ecommerce/form-schema/refresh
  static async refreshFormSchema(context: BackendContext): Promise<DynamicFormSchema> {
    const response = await fetch(`${BACKEND_BASE_URL}/form-schema/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          ...context,
          requestId: context.requestId || `refresh_${Date.now()}`,
          timestamp: context.timestamp || Date.now(),
          environment: context.environment || 'development',
          metadata: {
            targetChannels: context.targetChannels,
            apiVersion: 'v1',
            refreshReason: 'category_change',
            ...context.metadata
          }
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh form schema: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Business Rules APIs
   */
  
  // POST /api/v1/ecommerce/business-rules/execute
  static async executeBusinessRules(organizationId: string, ruleExecutionRequest: any): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/business-rules/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId,
        ...ruleExecutionRequest
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to execute business rules: ${response.statusText}`);
    }
    
    return response.json();
  }

  /**
   * Product APIs
   */
  
  // POST /api/v1/ecommerce/products/create
  static async createProduct(productData: DynamicFormData, context: BackendContext): Promise<MasterProduct> {



    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productData,
        context: {
          ...context,
          requestId: context.requestId || `req_${Date.now()}`,
          timestamp: context.timestamp || Date.now(),
          environment: context.environment || 'development',
          channel: context.targetChannels[0] || 'shopify',
          category: context.productCategory,
          metadata: {
            targetChannels: context.targetChannels,
            apiVersion: 'v1',
            ...context.metadata
          }
        }
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create product: ${response.statusText}`);
    }
    
    return response.json();
  }

  // POST /api/v1/ecommerce/products/validate
  static async validateProduct(productData: DynamicFormData, context: BackendContext): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productData,
        context
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to validate product: ${response.statusText}`);
    }
    
    return response.json();
  }

  // POST /api/v1/ecommerce/dynamic-products/validate (enhanced validation)
  static async validateProductEnhanced(
    productData: DynamicFormData,
    context: BackendContext
  ): Promise<import('@/types/dynamicForm').EnhancedValidationResult> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productData,
        context: {
          ...context,
          requestId: context.requestId || `validate_${Date.now()}`,
          timestamp: context.timestamp || Date.now(),
          environment: context.environment || 'development',
          metadata: {
            targetChannels: context.targetChannels,
            apiVersion: 'v1',
            validationType: 'enhanced',
            ...context.metadata
          }
        }
      }),
    });

    if (!response.ok) {
      // Try to get detailed error message from response body
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        // If parsing fails, use statusText
      }
      throw new Error(`Enhanced validation failed: ${errorMessage}`);
    }

    return response.json();
  }

  // GET /api/v1/ecommerce/products/channels
  static async getProductChannels(): Promise<string[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/channels`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get product channels: ${response.statusText}`);
    }
    
    return response.json();
  }
}

// Helper function to create context
export const createBackendContext = (
  userId: string,
  organizationId: string,
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
  targetChannels: string[],
  productCategory: string,
  permissions: string[] = ['READ_ATTRIBUTES', 'WRITE_ATTRIBUTES']
): BackendContext => ({
  userId,
  organizationId,
  userRole,
  targetChannels,
  productCategory,
  permissions,
  requestId: `req_${Date.now()}`,
  timestamp: Date.now(),
  environment: 'development'
});