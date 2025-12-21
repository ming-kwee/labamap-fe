/**
 * Product Submission Hook
 * Manages 3-step product submission pipeline:
 * 1. Pre-processing (business rules transformation)
 * 2. Enhanced validation (backend validation)
 * 3. Product creation (final API call)
 */

import { useState, useCallback } from 'react';
import { MasterProduct } from '../types/product';
import { EnhancedValidationResult } from '../types/dynamicForm';

export interface UseProductSubmissionOptions {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  category: string;
  permissions?: string[];
}

export interface UseProductSubmissionReturn {
  isSubmitting: boolean;
  submitError: string | null;
  validationResult: EnhancedValidationResult | null;
  showValidation: boolean;
  submitProduct: (product: MasterProduct) => Promise<MasterProduct | null>;
  validateProduct: (product: MasterProduct) => Promise<EnhancedValidationResult>;
  clearSubmitError: () => void;
  setShowValidation: (show: boolean) => void;
}

/**
 * Custom hook for managing product submission
 */
export function useProductSubmission(
  options: UseProductSubmissionOptions
): UseProductSubmissionReturn {
  const { userId, organizationId, userRole, targetChannels, category, permissions = [] } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<EnhancedValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  /**
   * Validates product using backend enhanced validation
   * @param product - Product to validate
   * @returns Validation result
   */
  const validateProduct = useCallback(async (product: MasterProduct): Promise<EnhancedValidationResult> => {
    console.log('[Product Submission] Starting enhanced validation');

    try {
      // Dynamic import
      const { ProductService, createBackendContext } = await import('../services/productService');

      const context = createBackendContext(
        userId,
        organizationId,
        userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
        targetChannels,
        category,
        permissions
      );

      console.log('[Product Submission] Calling validateProductEnhanced with:', {
        productKeys: Object.keys(product),
        contextKeys: Object.keys(context),
        category: context.productCategory
      });

      const result = await ProductService.validateProductEnhanced(product, context);

      console.log('[Product Submission] ✓ Validation completed');
      console.log('[Product Submission] Result type:', typeof result);
      console.log('[Product Submission] Result keys:', result ? Object.keys(result) : 'null');
      console.log('[Product Submission] Full validation result:', JSON.stringify(result, null, 2));

      setValidationResult(result);
      return result;

    } catch (error) {
      console.error('[Product Submission] Validation error:', error);

      const fallbackResult: EnhancedValidationResult = {
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

      setValidationResult(fallbackResult);
      return fallbackResult;
    }
  }, [userId, organizationId, userRole, targetChannels, category, permissions]);

  /**
   * Submits product through complete 3-step pipeline
   * @param product - Product to submit
   * @returns Created product or null if failed
   */
  const submitProduct = useCallback(async (product: MasterProduct): Promise<MasterProduct | null> => {
    console.log('[Product Submission] ===== STARTING 3-STEP SUBMISSION PIPELINE =====');

    setIsSubmitting(true);
    setSubmitError(null);
    setValidationResult(null);

    try {
      // Dynamic import
      const { ProductService, createBackendContext } = await import('../services/productService');

      const context = createBackendContext(
        userId,
        organizationId,
        userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
        targetChannels,
        category,
        permissions
      );

      // ========================================================================
      // STEP 1: Pre-processing (Business Rules Transformation)
      // ========================================================================
      console.log('[Product Submission] STEP 1: Pre-processing with business rules');

      // NOTE: Business rules currently disabled in backend (returns 404)
      // Keeping this code for future enablement
      let processedProduct = product;

      // ========================================================================
      // STEP 2: Enhanced Validation
      // ========================================================================
      console.log('[Product Submission] STEP 2: Enhanced validation');

      const validation = await validateProduct(processedProduct);

      if (!validation.valid || !validation.canSubmit) {
        console.error('[Product Submission] Validation failed:', validation);
        setShowValidation(true);
        setIsSubmitting(false);
        return null;
      }

      console.log('[Product Submission] Validation passed');

      // ========================================================================
      // STEP 3: Product Creation
      // ========================================================================
      console.log('[Product Submission] STEP 3: Creating product');

      const createdProduct = await ProductService.createProduct(processedProduct, context);

      console.log('[Product Submission] ===== PRODUCT CREATED SUCCESSFULLY =====');
      console.log('[Product Submission] Created product:', createdProduct);

      setIsSubmitting(false);
      return createdProduct;

    } catch (error) {
      console.error('[Product Submission] ===== SUBMISSION FAILED =====');
      console.error('[Product Submission] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Failed to create product';
      setSubmitError(errorMessage);
      setIsSubmitting(false);

      return null;
    }
  }, [userId, organizationId, userRole, targetChannels, category, permissions, validateProduct]);

  /**
   * Clears submit error message
   */
  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

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
