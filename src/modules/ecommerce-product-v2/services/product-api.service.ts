/**
 * Product API Service
 * Handles product creation and validation API calls
 */

import { DynamicFormData, EnhancedValidationResult } from '../types/form-schema';
import { MasterProduct } from '../types/product';
import type { BackendContext } from './schema-api.service';

export type { BackendContext };

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1/ecommerce';

export class ProductApiService {
  // GET /api/v1/ecommerce/master-attributes/all
  static async getAllMasterAttributes(): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/master-attributes/all`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to get master attributes: ${response.statusText}`);
    }

    return response.json();
  }

  // POST /api/v1/ecommerce/dynamic-products/create
  static async createProduct(productData: DynamicFormData, context: BackendContext): Promise<MasterProduct> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productData, context }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create product: ${response.statusText}`);
    }

    const backendResponse = await response.json();

    const transformedProduct: MasterProduct = {
      id: backendResponse.productId || backendResponse.masterProduct?.id,
      sku: backendResponse.productData?.sku || '',
      name: backendResponse.productData?.name || '',
      description: backendResponse.productData?.description,
      price: typeof backendResponse.productData?.price === 'number'
        ? backendResponse.productData.price
        : parseFloat(backendResponse.productData?.price) || 0,
      category: backendResponse.productData?.category,
      quantity: backendResponse.productData?.inventory
        ? (typeof backendResponse.productData.inventory === 'number'
            ? backendResponse.productData.inventory
            : parseFloat(backendResponse.productData.inventory))
        : undefined,
      ...backendResponse.productData
    };

    return transformedProduct;
  }

  // PUT /api/v1/admin/master-products/{productId} — Phase 4 edit
  static async updateProduct(productId: string, productData: DynamicFormData, context: BackendContext): Promise<MasterProduct> {
    const response = await fetch(
      `http://localhost:8888/labamap/api/v1/admin/master-products/${encodeURIComponent(productId)}?organizationId=${encodeURIComponent(context.organizationId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productData, context }),
      }
    );

    if (!response.ok) {
      let msg = response.statusText;
      try { const b = await response.json(); msg = b.message ?? b.error ?? msg; } catch { /**/ }
      throw new Error(`Failed to update product: ${msg}`);
    }

    // Backend returns MasterProductData shape
    const r = await response.json() as Record<string, unknown>;
    const attrs = (r.productAttributes ?? {}) as Record<string, unknown>;
    return {
      id:          String(r.productId ?? r.id ?? productId),
      sku:         String(attrs.sku   ?? r.sku   ?? ''),
      name:        String(attrs.name  ?? r.name  ?? ''),
      description: attrs.description != null ? String(attrs.description) : undefined,
      price:       Number(attrs.price ?? r.basePrice ?? 0),
      category:    attrs.category != null ? String(attrs.category) : undefined,
      ...attrs,
    } as MasterProduct;
  }

  // POST /api/v1/ecommerce/dynamic-products/validate (enhanced)
  static async validateProductEnhanced(
    productData: DynamicFormData,
    context: BackendContext
  ): Promise<EnhancedValidationResult> {
    const response = await fetch(`${BACKEND_BASE_URL}/dynamic-products/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    const responseText = await response.text();

    // Parse body first — backend returns non-2xx (e.g. 400) when validation fails
    // but the body still contains the structured validation payload.
    // Only throw when there is no parseable validation result.
    let result: Record<string, unknown> | null = null;
    if (responseText && responseText.trim()) {
      try { result = JSON.parse(responseText); } catch { /* fall through to error */ }
    }

    if (!response.ok && !(result && result.validation)) {
      let errorMessage = response.statusText;
      if (result) {
        const r = result as Record<string, unknown>;
        errorMessage = (r.message as string) || (r.error as string) || response.statusText;
      } else {
        errorMessage = responseText || response.statusText;
      }
      throw new Error(`Enhanced validation failed: ${errorMessage}`);
    }

    if (!result) {
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

    if (Object.keys(result).length === 0) {
      return {
        valid: true,
        message: 'Validation passed',
        violations: [],
        warnings: [],
        rulesExecuted: 0,
        executionTimeMs: 0,
        validationScore: 100,
        canSubmit: true
      };
    }

    if (result.validation) {
      const backendValidation = result.validation;
      const errors = backendValidation.errors || [];
      const warnings = backendValidation.warnings || [];

      const violations = errors.map((error: string, index: number) => ({
        ruleId: `VALIDATION_ERROR_${index + 1}`,
        severity: 'ERROR' as const,
        message: error,
        affectedFields: [],
        violationType: 'SCHEMA_VALIDATION' as const
      }));

      // Strip all backend-internal system notices — merchants never need to see these.
      const SYSTEM_PATTERNS = [/system field/i, /processed without schema/i, /schema validation$/i];
      const merchantWarnings = (warnings as string[]).filter(
        (w: string) => !SYSTEM_PATTERNS.some(p => p.test(w))
      );
      const transformedWarnings = merchantWarnings.map((warning: string, index: number) => ({
        ruleId: `VALIDATION_WARNING_${index + 1}`,
        message: warning,
        affectedFields: [],
        suggestion: undefined
      }));

      const errorCount = errors.length;
      const message = backendValidation.valid
        ? 'Validation passed'
        : errorCount === 1
          ? errors[0]
          : `${errorCount} validation errors found`;

      return {
        valid: backendValidation.valid,
        message,
        violations,
        warnings: transformedWarnings,
        rulesExecuted: backendValidation.metadata?.fieldsValidated || 0,
        executionTimeMs: 0,
        validationScore: backendValidation.valid ? 100 : Math.max(0, 100 - errorCount * 20),
        canSubmit: backendValidation.valid && violations.length === 0
      };
    }

    return result;
  }
}
