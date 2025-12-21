/**
 * Product Service - Product-related API calls
 * Extracted from backendService.ts for modular architecture
 */

import { DynamicFormSchema, DynamicFormData } from '../types/dynamicForm';
import { MasterProduct } from '../types/product';

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
  metadata?: Record<string, any>;
}

export class ProductService {
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
   * Form Schema APIs
   */

  // POST /api/v1/ecommerce/form-schema/generate
  static async generateFormSchema(context: BackendContext): Promise<DynamicFormSchema> {
    const response = await fetch(`${BACKEND_BASE_URL}/form-schema/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context }), // Backend expects { context: {...} }
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
      throw new Error(`Failed to generate form schema: ${errorMessage}`);
    }

    return response.json();
  }

  // GET /api/v1/ecommerce/form-schema/generate (query params version)
  static async generateFormSchemaByParams(params: {
    category: string;
    userRole: string;
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
      body: JSON.stringify({ context }), // Backend expects { context: {...} }
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh form schema: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Product CRUD APIs
   */

  // POST /api/v1/ecommerce/dynamic-products/create
  static async createProduct(productData: DynamicFormData, context: BackendContext): Promise<MasterProduct> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/create`, {
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
      throw new Error(`Failed to create product: ${response.statusText}`);
    }

    const backendResponse = await response.json();

    console.log('[ProductService] Backend response:', backendResponse);

    // Transform backend response to MasterProduct format
    // Backend returns: { productId, productData, masterProduct, createdProduct, ... }
    // We need to extract and flatten the data

    const transformedProduct: MasterProduct = {
      // Use productId from response
      id: backendResponse.productId || backendResponse.masterProduct?.id,

      // Extract flat product data
      sku: backendResponse.productData?.sku || '',
      name: backendResponse.productData?.name || '',
      description: backendResponse.productData?.description,
      price: typeof backendResponse.productData?.price === 'number'
        ? backendResponse.productData.price
        : parseFloat(backendResponse.productData?.price) || 0,

      // Map additional fields
      category: backendResponse.productData?.category,
      quantity: backendResponse.productData?.inventory
        ? (typeof backendResponse.productData.inventory === 'number'
            ? backendResponse.productData.inventory
            : parseFloat(backendResponse.productData.inventory))
        : undefined,

      // Include any other fields from productData
      ...backendResponse.productData
    };

    console.log('[ProductService] Transformed product:', transformedProduct);

    return transformedProduct;
  }

  // POST /api/v1/ecommerce/dynamic-products/validate
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
  ): Promise<import('../types/dynamicForm').EnhancedValidationResult> {
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



    console.log('coba masukin',JSON.stringify({
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
      }))

    console.log('[ProductService] Enhanced validation response:', {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });

    // Get response text first for debugging
    const responseText = await response.text();
    console.log('[ProductService] Raw response text:', responseText);
    console.log('[ProductService] Response text length:', responseText.length);

    if (!response.ok) {
      // Try to parse error from response text
      let errorMessage = response.statusText;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        // If parsing fails, use raw text or statusText
        errorMessage = responseText || response.statusText;
      }
      throw new Error(`Enhanced validation failed: ${errorMessage}`);
    }

    // Parse response body with error handling
    try {
      // If empty response, handle based on status code
      if (!responseText || responseText.trim() === '') {
        console.log('[ProductService] Empty response body detected');
        if (response.status === 204 || response.status === 200) {
          return {
            valid: true,
            message: 'Validation passed (empty response)',
            violations: [],
            warnings: [],
            rulesExecuted: 0,
            executionTimeMs: 0,
            validationScore: 100,
            canSubmit: true
          };
        }
      }

      const result = JSON.parse(responseText);
      console.log('[ProductService] Parsed validation result:', result);
      console.log('[ProductService] Result type:', typeof result);
      console.log('[ProductService] Result keys:', result ? Object.keys(result) : 'null');

      // If backend returns empty object, treat as validation passed
      if (result && typeof result === 'object' && Object.keys(result).length === 0) {
        console.warn('[ProductService] Backend returned empty object {}. Treating as validation passed.');
        return {
          valid: true,
          message: 'Validation passed (backend returned empty object)',
          violations: [],
          warnings: [],
          rulesExecuted: 0,
          executionTimeMs: 0,
          validationScore: 100,
          canSubmit: true
        };
      }

      // Transform backend response to EnhancedValidationResult format
      // Backend returns: { requestMetadata, validation: { valid, errors, warnings, ... } }
      // We need: { valid, message, violations, warnings, ... }
      if (result.validation) {
        console.log('[ProductService] Transforming backend validation response');

        const backendValidation = result.validation;
        const errors = backendValidation.errors || [];
        const warnings = backendValidation.warnings || [];

        // Transform errors array to violations array
        const violations = errors.map((error: string, index: number) => ({
          ruleId: `VALIDATION_ERROR_${index + 1}`,
          severity: 'ERROR' as const,
          message: error,
          affectedFields: [], // Backend doesn't provide this
          violationType: 'SCHEMA_VALIDATION' as const
        }));

        // Transform warnings array to warning objects
        const transformedWarnings = warnings.map((warning: string, index: number) => ({
          ruleId: `VALIDATION_WARNING_${index + 1}`,
          severity: 'WARNING' as const,
          message: warning,
          affectedFields: [],
          suggestion: undefined
        }));

        const transformed = {
          valid: backendValidation.valid,
          message: backendValidation.valid
            ? 'Validation passed'
            : errors.length > 0
              ? errors[0]
              : 'Validation failed',
          violations,
          warnings: transformedWarnings,
          rulesExecuted: backendValidation.metadata?.fieldsValidated || 0,
          executionTimeMs: backendValidation.metadata?.processedAt
            ? Date.now() - backendValidation.metadata.processedAt
            : 0,
          validationScore: backendValidation.valid ? 100 : 0,
          canSubmit: backendValidation.valid && violations.length === 0
        };

        console.log('[ProductService] Transformed validation result:', transformed);
        return transformed;
      }

      return result;
    } catch (parseError) {
      console.error('[ProductService] Failed to parse validation response:', parseError);
      console.error('[ProductService] Response text was:', responseText);
      throw new Error(`Failed to parse validation response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
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

/**
 * Helper function to create backend context
 */
export function createBackendContext(
  userId: string,
  organizationId: string,
  userRole: 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
  targetChannels: string[],
  productCategory: string,
  permissions: string[]
): BackendContext {
  return {
    userId,
    organizationId,
    userRole,
    targetChannels,
    productCategory,
    permissions,
    requestId: `req_${Date.now()}`,
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
  };
}

// Re-export for convenience
export { ProductService as BackendAPIService };
export type { BackendContext as ProductBackendContext };
