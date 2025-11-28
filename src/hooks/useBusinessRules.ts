/**
 * Business Rules Hook
 * Provides integration with the backend business rules engine for product forms
 */

import { useState, useCallback } from 'react';
import { RuleResult, RuleViolation, RuleWarning, RuleType, ProductInput, ProductOutput } from '@/types/rules';
import { BackendAPIService } from '@/lib/api/backendService';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useOrganization } from '@/shared/contexts/OrganizationContext';

interface UseBusinessRulesReturn {
  isExecuting: boolean;
  violations: RuleViolation[];
  warnings: RuleWarning[];
  executeRules: (productData: ProductInput, ruleType?: RuleType) => Promise<RuleResult<ProductOutput>>;
  validateRules: (productData: ProductInput) => Promise<RuleResult<boolean>>;
  clearViolations: () => void;
  hasBlockingViolations: boolean;
  getViolationsByField: (field: string) => RuleViolation[];
  getWarningsByField: (field: string) => RuleWarning[];
}

export function useBusinessRules(): UseBusinessRulesReturn {
  const { user, organization } = useAuth();
  const { getAssignedChannels } = useOrganization();

  const [isExecuting, setIsExecuting] = useState(false);
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [warnings, setWarnings] = useState<RuleWarning[]>([]);

  const executeRules = useCallback(async (
    productData: ProductInput,
    ruleType?: RuleType
  ): Promise<RuleResult<ProductOutput>> => {
    setIsExecuting(true);

    try {
      // Use backend API service instead of local routes
      const ruleExecutionRequest = {
        ruleType: ruleType || 'VALIDATION',
        productData,
        context: {
          userId: user?.userId || 'anonymous',
          organizationId: organization?.organizationId || '',
          userRole: user?.role || 'BUSINESS_USER',
          targetChannels: getAssignedChannels() || [productData.channel].filter(Boolean),
          productCategory: productData.category,
          permissions: [],
        },
        fieldName: 'all',
        formData: productData
      };

      const result = await BackendAPIService.executeBusinessRules(
        organization?.organizationId || '',
        ruleExecutionRequest
      );

      // Map backend response to expected format
      const ruleResult: RuleResult<ProductOutput> = {
        success: result.success || result.ruleExecutionResult?.success || false,
        data: result.ruleExecutionResult?.enhancedData || productData,
        violations: result.ruleExecutionResult?.violations || result.violations || [],
        warnings: result.ruleExecutionResult?.warnings || result.warnings || [],
        metadata: result.ruleExecutionResult?.metadata || {}
      };

      setViolations(ruleResult.violations);
      setWarnings(ruleResult.warnings);

      return ruleResult;
      
    } catch (error) {
      console.error('Failed to execute rules:', error);
      
      const errorResult: RuleResult<ProductOutput> = {
        success: false,
        violations: [{
          field: 'system',
          code: 'RULES_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          severity: 'error',
          suggestedAction: 'Check your connection and try again'
        }],
        warnings: []
      };
      
      setViolations(errorResult.violations);
      setWarnings([]);
      
      return errorResult;

    } finally {
      setIsExecuting(false);
    }
  }, [user, organization, getAssignedChannels]);

  const validateRules = useCallback(async (
    productData: ProductInput
  ): Promise<RuleResult<boolean>> => {
    setIsExecuting(true);

    try {
      // Use executeRules with VALIDATION type instead of separate endpoint
      const ruleResult = await executeRules(productData, 'VALIDATION');

      const isValid = ruleResult.success && !ruleResult.violations.some(v => v.severity === 'error');

      return {
        success: isValid,
        data: isValid,
        violations: ruleResult.violations,
        warnings: ruleResult.warnings
      };
      
    } catch (error) {
      console.error('Failed to validate rules:', error);
      
      const errorResult: RuleResult<boolean> = {
        success: false,
        data: false,
        violations: [{
          field: 'system',
          code: 'RULES_VALIDATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          severity: 'error',
          suggestedAction: 'Check your connection and try again'
        }],
        warnings: []
      };
      
      setViolations(errorResult.violations);
      setWarnings([]);
      
      return errorResult;

    } finally {
      setIsExecuting(false);
    }
  }, [executeRules]);

  const clearViolations = useCallback(() => {
    setViolations([]);
    setWarnings([]);
  }, []);

  const hasBlockingViolations = violations.some(v => v.severity === 'error');

  const getViolationsByField = useCallback((field: string): RuleViolation[] => {
    return violations.filter(v => v.field === field);
  }, [violations]);

  const getWarningsByField = useCallback((field: string): RuleWarning[] => {
    return warnings.filter(w => w.field === field);
  }, [warnings]);

  return {
    isExecuting,
    violations,
    warnings,
    executeRules,
    validateRules,
    clearViolations,
    hasBlockingViolations,
    getViolationsByField,
    getWarningsByField
  };
}