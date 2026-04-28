/**
 * Schema API Service
 * Handles form schema generation and category configuration API calls
 */

import { DynamicFormSchema } from '../types/form-schema';

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

// POST /api/v1/ecommerce/form-schema/generate
export async function generateFormSchema(context: BackendContext): Promise<DynamicFormSchema> {
  const response = await fetch(`${BACKEND_BASE_URL}/form-schema/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
    } catch {
      // use statusText
    }
    throw new Error(`Failed to generate form schema: ${errorMessage}`);
  }

  return response.json();
}

// POST /api/v1/ecommerce/form-schema/refresh
export async function refreshFormSchema(context: BackendContext): Promise<DynamicFormSchema> {
  const response = await fetch(`${BACKEND_BASE_URL}/form-schema/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
    } catch {
      // response body is not JSON — fall back to statusText
    }
    throw new Error(`Failed to refresh form schema: ${errorMessage}`);
  }

  return response.json();
}

// DELETE /api/v1/ecommerce/form-schema/cache/product-type/{productTypeId}
export async function invalidateSchemaByProductType(productTypeId: string): Promise<{
  success: boolean;
  deletedCount: number;
  productTypeId: string;
  message: string;
}> {
  const response = await fetch(
    `${BACKEND_BASE_URL}/form-schema/cache/product-type/${productTypeId}`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }
  );
  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const body = await response.json();
      errorMessage = body.message || body.error || errorMessage;
    } catch { /* ignore */ }
    throw new Error(`Failed to invalidate schema cache: ${errorMessage}`);
  }
  return response.json();
}

// DELETE /api/v1/ecommerce/form-schema/cache  (full wipe)
export async function invalidateAllSchemaCache(): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/form-schema/cache`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to invalidate all schema cache: ${response.statusText}`);
  }
}

// GET /api/v1/ecommerce/master-attributes/category-config?category=electronics
export async function getCategoryConfig(category: string): Promise<any> {
  const response = await fetch(
    `${BACKEND_BASE_URL}/master-attributes/category-config?category=${category}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get category config: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Creates a backend context object for API calls
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
