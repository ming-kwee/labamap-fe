/**
 * Product Submit Hook
 * Manages 3-step product submission pipeline:
 * 1. Pre-processing
 * 2. Enhanced validation
 * 3. Product creation
 */

import { useState, useCallback } from 'react';
import { MasterProduct } from '../../types/product';
import { EnhancedValidationResult } from '../../types/form-schema';
import { ProductApiService, createBackendContext as _createBackendContext } from '../../services';

// Re-export helper used by this hook
function createBackendContext(
  userId: string,
  organizationId: string,
  userRole: string,
  targetChannels: string[],
  category: string,
  permissions: string[]
) {
  return _createBackendContext(
    userId,
    organizationId,
    userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
    targetChannels,
    category,
    permissions
  );
}

/**
 * The backend persists productTypeId from the `productData` map (NOT from context —
 * verified live 2026-07-04: context.productTypeId is ignored, productData.productTypeId
 * sticks). So we inject the selected product type into the productData payload.
 */
function withProductType(product: MasterProduct, productTypeId?: string): MasterProduct {
  if (!productTypeId) return product;
  return { ...product, productTypeId } as MasterProduct & { productTypeId: string };
}

export interface UseProductSubmitOptions {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  category: string;
  /** The selected product type — MUST be threaded into the backend context so the
   *  product persists productTypeId (Step 2 form schema depends on it). Without it
   *  the product saves with productTypeId=null and Channel Fields 422s. */
  productTypeId?: string;
  permissions?: string[];
  /** Phase 4: "edit" routes submitProduct through updateProduct instead of createProduct */
  mode?: 'create' | 'edit';
  /** Phase 4: required when mode === "edit" */
  productId?: string;
  /** Client-assigned UUID v4 — sent as context.productId so backend uses it as master_product_data._id,
   *  ensuring channel_product_data.masterProductId is consistent across create and edit flows. */
  clientProductId?: string;
}

export interface UseProductSubmitReturn {
  isSubmitting: boolean;
  submitError: string | null;
  validationResult: EnhancedValidationResult | null;
  showValidation: boolean;
  submitProduct: (product: MasterProduct) => Promise<MasterProduct | null>;
  validateProduct: (product: MasterProduct) => Promise<EnhancedValidationResult>;
  clearSubmitError: () => void;
  setShowValidation: (show: boolean) => void;
}

export function useProductSubmit(options: UseProductSubmitOptions): UseProductSubmitReturn {
  const { userId, organizationId, userRole, targetChannels, category, productTypeId, permissions = [], mode = 'create', productId, clientProductId } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<EnhancedValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const validateProduct = useCallback(async (product: MasterProduct): Promise<EnhancedValidationResult> => {
    try {
      const context = createBackendContext(userId, organizationId, userRole, targetChannels, category, permissions);
      const result = await ProductApiService.validateProductEnhanced(withProductType(product, productTypeId), context);
      setValidationResult(result);
      return result;
    } catch (error) {
      const fallback: EnhancedValidationResult = {
        valid: false,
        message: error instanceof Error ? error.message : 'Validation failed',
        violations: [{
          ruleId: 'VALIDATION_ERROR',
          severity: 'ERROR',
          message: error instanceof Error ? error.message : 'Validation failed',
          affectedFields: [],
          violationType: 'SCHEMA_VALIDATION'
        }],
        warnings: [],
        rulesExecuted: 0,
        executionTimeMs: 0,
        validationScore: 0,
        canSubmit: false
      };
      setValidationResult(fallback);
      return fallback;
    }
  }, [userId, organizationId, userRole, targetChannels, category, productTypeId, permissions]);

  const submitProduct = useCallback(async (product: MasterProduct): Promise<MasterProduct | null> => {
    setIsSubmitting(true);
    setSubmitError(null);
    setValidationResult(null);

    try {
      const context = createBackendContext(userId, organizationId, userRole, targetChannels, category, permissions);
      // Attach client-assigned UUID for create mode so backend uses it as master_product_data._id
      if (mode !== 'edit' && clientProductId) {
        context.productId = clientProductId;
      }

      const validation = await validateProduct(product);

      if (!validation.valid || !validation.canSubmit) {
        setShowValidation(true);
        setIsSubmitting(false);
        return null;
      }

      // Inject the selected product type into productData so it persists (backend
      // reads productTypeId from productData, not context).
      const productData = withProductType(product, productTypeId);
      const createdProduct = mode === 'edit' && productId
        ? await ProductApiService.updateProduct(productId, productData, context)
        : await ProductApiService.createProduct(productData, context);
      setIsSubmitting(false);
      return createdProduct;

    } catch (error) {
      const msg = error instanceof Error ? error.message : (mode === 'edit' ? 'Failed to update product' : 'Failed to create product');
      setSubmitError(msg);
      setIsSubmitting(false);
      return null;
    }
  }, [userId, organizationId, userRole, targetChannels, category, productTypeId, permissions, validateProduct]);

  const clearSubmitError = useCallback(() => setSubmitError(null), []);

  return {
    isSubmitting,
    submitError,
    validationResult,
    showValidation,
    submitProduct,
    validateProduct,
    clearSubmitError,
    setShowValidation
  };
}
