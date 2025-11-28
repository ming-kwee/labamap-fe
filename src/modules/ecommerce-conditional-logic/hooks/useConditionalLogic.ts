/**
 * useConditionalLogic Hook
 * React hook for integrating conditional logic into forms
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConditionalLogicService } from '../services/conditionalLogicService';
import { getRuleEvaluationEngine } from '../services/ruleEvaluationEngine';
import {
  ConditionalLogicRule,
  RuleEvaluationContext,
  RuleEvaluationResult,
  FieldState
} from '../types/conditionalLogic';

export interface UseConditionalLogicOptions {
  category?: string;
  channels?: string[];
  userRole?: string;
  organizationId?: string;
  autoEvaluate?: boolean; // Auto-evaluate on field changes
}

export interface UseConditionalLogicReturn {
  // Rules
  rules: ConditionalLogicRule[];
  isLoading: boolean;
  error: string | null;

  // Evaluation
  evaluateRules: (formData: Record<string, any>) => RuleEvaluationResult[];
  onFieldChange: (fieldName: string, value: any, formData: Record<string, any>) => RuleEvaluationResult[];

  // Field States
  getFieldState: (fieldName: string) => FieldState;
  subscribeToField: (fieldName: string, callback: (state: FieldState) => void) => void;
  unsubscribeFromField: (fieldName: string, callback: (state: FieldState) => void) => void;

  // Utils
  reset: () => void;
  reload: () => Promise<void>;
}

export function useConditionalLogic(options: UseConditionalLogicOptions = {}): UseConditionalLogicReturn {
  const {
    category,
    channels,
    userRole,
    organizationId,
    autoEvaluate = true
  } = options;

  const [rules, setRules] = useState<ConditionalLogicRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef(getRuleEvaluationEngine());
  const engine = engineRef.current;

  /**
   * Load rules from backend
   */
  const loadRules = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const context = {
        category,
        channels,
        userRole,
        organizationId
      };

      const loadedRules = await ConditionalLogicService.getRulesForContext(context);
      setRules(loadedRules);

      // Load rules into evaluation engine
      await engine.loadRules(loadedRules);

      console.log(`[useConditionalLogic] Loaded ${loadedRules.length} rules for context:`, context);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conditional logic rules';
      setError(errorMessage);
      console.error('[useConditionalLogic] Error loading rules:', err);
    } finally {
      setIsLoading(false);
    }
  }, [category, channels, userRole, organizationId, engine]);

  /**
   * Load rules on mount and when context changes
   */
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  /**
   * Evaluate all rules with current form data
   */
  const evaluateRules = useCallback((formData: Record<string, any>): RuleEvaluationResult[] => {
    const context: RuleEvaluationContext = {
      formData,
      category,
      channels,
      userRole,
      organizationId
    };

    return engine.evaluateAllRules(context);
  }, [engine, category, channels, userRole, organizationId]);

  /**
   * Handle field change
   */
  const onFieldChange = useCallback((
    fieldName: string,
    value: any,
    formData: Record<string, any>
  ): RuleEvaluationResult[] => {
    if (!autoEvaluate) {
      return [];
    }

    const context: RuleEvaluationContext = {
      formData,
      category,
      channels,
      userRole,
      organizationId
    };

    return engine.onFieldChange(fieldName, value, context);
  }, [engine, autoEvaluate, category, channels, userRole, organizationId]);

  /**
   * Get field state
   */
  const getFieldState = useCallback((fieldName: string): FieldState => {
    return engine.getFieldState(fieldName);
  }, [engine]);

  /**
   * Subscribe to field state changes
   */
  const subscribeToField = useCallback((
    fieldName: string,
    callback: (state: FieldState) => void
  ) => {
    engine.subscribe(fieldName, callback);
  }, [engine]);

  /**
   * Unsubscribe from field state changes
   */
  const unsubscribeFromField = useCallback((
    fieldName: string,
    callback: (state: FieldState) => void
  ) => {
    engine.unsubscribe(fieldName, callback);
  }, [engine]);

  /**
   * Reset engine state
   */
  const reset = useCallback(() => {
    engine.reset();
  }, [engine]);

  /**
   * Reload rules
   */
  const reload = useCallback(async () => {
    await loadRules();
  }, [loadRules]);

  return {
    rules,
    isLoading,
    error,
    evaluateRules,
    onFieldChange,
    getFieldState,
    subscribeToField,
    unsubscribeFromField,
    reset,
    reload
  };
}

export default useConditionalLogic;
