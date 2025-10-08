/**
 * Business Rules Hook
 * Provides integration with the business rules engine for product forms
 */

import { useState, useCallback } from 'react';
import { RuleResult, RuleViolation, RuleWarning, RuleType, ProductInput, ProductOutput } from '@/types/rules';

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
  const [isExecuting, setIsExecuting] = useState(false);
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [warnings, setWarnings] = useState<RuleWarning[]>([]);

  const executeRules = useCallback(async (
    productData: ProductInput, 
    ruleType?: RuleType
  ): Promise<RuleResult<ProductOutput>> => {
    setIsExecuting(true);
    
    try {
      const response = await fetch('/api/v1/rules/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productData,
          ruleType,
          context: {
            userId: 'current-user', // This would come from auth context
            channel: productData.channel,
            category: productData.category
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Rules execution failed: ${response.statusText}`);
      }

      const result: RuleResult<ProductOutput> = await response.json();
      
      setViolations(result.violations || []);
      setWarnings(result.warnings || []);
      
      return result;
      
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
  }, []);

  const validateRules = useCallback(async (
    productData: ProductInput
  ): Promise<RuleResult<boolean>> => {
    setIsExecuting(true);
    
    try {
      const response = await fetch('/api/v1/rules/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productData,
          context: {
            userId: 'current-user',
            channel: productData.channel,
            category: productData.category
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Rules validation failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      setViolations(result.violations || []);
      setWarnings(result.warnings || []);
      
      return {
        success: result.valid,
        data: result.valid,
        violations: result.violations || [],
        warnings: result.warnings || []
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
  }, []);

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