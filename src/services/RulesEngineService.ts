/**
 * Production-Ready Business Rules Engine
 * Implements the configuration-driven rules architecture
 */

import {
  BusinessRule,
  RulesEngine,
  RuleContext,
  RuleResult,
  RuleType,
  RuleViolation,
  RuleWarning,
  RuleExecutionMonitor,
  RuleExecutionStats,
  ProductInput,
  ProductOutput,
  RuleConfiguration
} from '@/types/rules';

export class RuleExecutionMonitorImpl implements RuleExecutionMonitor {
  private stats = new Map<string, RuleExecutionStats>();

  recordExecution(ruleId: string, executionTime: number, success: boolean): void {
    const existing = this.stats.get(ruleId) || {
      ruleId,
      executionCount: 0,
      averageExecutionTime: 0,
      successRate: 0,
      lastExecuted: new Date().toISOString(),
      errorCount: 0,
      warningCount: 0
    };

    existing.executionCount++;
    existing.averageExecutionTime = 
      (existing.averageExecutionTime * (existing.executionCount - 1) + executionTime) / existing.executionCount;
    existing.lastExecuted = new Date().toISOString();
    
    if (!success) {
      existing.errorCount++;
    }
    
    existing.successRate = (existing.executionCount - existing.errorCount) / existing.executionCount;
    
    this.stats.set(ruleId, existing);
  }

  getStats(ruleId?: string): RuleExecutionStats[] {
    if (ruleId) {
      const stat = this.stats.get(ruleId);
      return stat ? [stat] : [];
    }
    return Array.from(this.stats.values());
  }

  resetStats(ruleId?: string): void {
    if (ruleId) {
      this.stats.delete(ruleId);
    } else {
      this.stats.clear();
    }
  }
}

export class RulesEngineService implements RulesEngine {
  private rules = new Map<string, BusinessRule>();
  private monitor: RuleExecutionMonitor;
  private configurations = new Map<string, RuleConfiguration>();

  constructor() {
    this.monitor = new RuleExecutionMonitorImpl();
  }

  /**
   * Register a business rule with the engine
   */
  registerRule<T extends BusinessRule>(rule: T): void {
    this.rules.set(rule.id, rule);
    console.log(`[RulesEngine] Registered rule: ${rule.id} (${rule.type})`);
  }

  /**
   * Load rule configurations from the registry
   */
  async loadRuleConfigurations(): Promise<void> {
    try {
      const response = await fetch('/business-rules-registry.json');
      const registry = await response.json();
      
      registry.ruleRegistry.rules.forEach((config: RuleConfiguration) => {
        this.configurations.set(config.ruleId, config);
      });
      
      console.log(`[RulesEngine] Loaded ${registry.ruleRegistry.rules.length} rule configurations`);
    } catch (error) {
      console.error('[RulesEngine] Failed to load rule configurations:', error);
    }
  }

  /**
   * Execute rules of a specific type on input data
   */
  async executeRules<TInput, TOutput>(
    input: TInput,
    context: RuleContext,
    ruleType?: RuleType
  ): Promise<RuleResult<TOutput>> {
    const startTime = Date.now();
    const applicableRules = this.getApplicableRules(input, context, ruleType);
    
    // Sort rules by priority (lower number = higher priority)
    applicableRules.sort((a, b) => a.priority - b.priority);
    
    let processedData = input as unknown as TOutput;
    const allViolations: RuleViolation[] = [];
    const allWarnings: RuleWarning[] = [];
    const metadata: Record<string, unknown> = {
      rulesExecuted: [],
      executionOrder: []
    };

    console.log(`[RulesEngine] Executing ${applicableRules.length} rules for type: ${ruleType || 'ALL'}`);

    for (const rule of applicableRules) {
      const ruleStartTime = Date.now();
      
      try {
        console.log(`[RulesEngine] Executing rule: ${rule.id}`);
        
        const result = await rule.execute(processedData as unknown, context);
        const ruleExecutionTime = Date.now() - ruleStartTime;
        
        this.monitor.recordExecution(rule.id, ruleExecutionTime, result.success);
        
        if (result.success && result.data) {
          processedData = result.data as TOutput;
        }
        
        allViolations.push(...result.violations);
        allWarnings.push(...result.warnings);
        
        (metadata.rulesExecuted as string[]).push(rule.id);
        (metadata.executionOrder as Array<{ruleId: string, executionTime: number}>).push({
          ruleId: rule.id,
          executionTime: ruleExecutionTime
        });
        
        // Stop execution if there are blocking violations
        const blockingViolations = result.violations.filter(v => v.severity === 'error');
        if (blockingViolations.length > 0) {
          console.log(`[RulesEngine] Stopping execution due to blocking violations in rule: ${rule.id}`);
          break;
        }
        
      } catch (error) {
        const ruleExecutionTime = Date.now() - ruleStartTime;
        this.monitor.recordExecution(rule.id, ruleExecutionTime, false);
        
        console.error(`[RulesEngine] Error executing rule ${rule.id}:`, error);
        allViolations.push({
          field: 'system',
          code: 'RULE_EXECUTION_ERROR',
          message: `Rule ${rule.id} failed to execute: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
          suggestedAction: 'Check rule configuration and input data'
        });
      }
    }
    
    const totalExecutionTime = Date.now() - startTime;
    metadata.totalExecutionTime = totalExecutionTime;
    
    const hasBlockingErrors = allViolations.some(v => v.severity === 'error');
    
    return {
      success: !hasBlockingErrors,
      data: processedData,
      violations: allViolations,
      warnings: allWarnings,
      metadata,
      executionTime: totalExecutionTime
    };
  }

  /**
   * Validate input data against business rules without transformation
   */
  async validateRules<TInput>(
    input: TInput,
    context: RuleContext
  ): Promise<RuleResult<boolean>> {
    const businessRules = this.getRulesByType(RuleType.BUSINESS_LOGIC);
    const applicableRules = businessRules.filter(rule => rule.canApply(input, context));
    
    const allViolations: RuleViolation[] = [];
    const allWarnings: RuleWarning[] = [];
    
    for (const rule of applicableRules) {
      if (rule.validate) {
        const result = await rule.validate(input, context);
        allViolations.push(...result.violations);
        allWarnings.push(...result.warnings);
      }
    }
    
    const isValid = allViolations.filter(v => v.severity === 'error').length === 0;
    
    return {
      success: isValid,
      data: isValid,
      violations: allViolations,
      warnings: allWarnings
    };
  }

  /**
   * Get all rules of a specific type
   */
  getRulesByType(ruleType: RuleType): BusinessRule[] {
    return Array.from(this.rules.values()).filter(rule => rule.type === ruleType);
  }

  /**
   * Get rules applicable to the given input and context
   */
  getApplicableRules<TInput>(
    input: TInput,
    context: RuleContext,
    ruleType?: RuleType
  ): BusinessRule[] {
    let rules = Array.from(this.rules.values());
    
    if (ruleType) {
      rules = rules.filter(rule => rule.type === ruleType);
    }
    
    return rules.filter(rule => {
      // Check if rule is enabled in configuration
      const config = this.configurations.get(rule.id);
      if (config && !config.enabled) {
        return false;
      }
      
      // Check if rule can apply to this input
      return rule.canApply(input, context);
    });
  }

  /**
   * Get rule execution statistics
   */
  getRuleStats(ruleId?: string): RuleExecutionStats[] {
    return this.monitor.getStats(ruleId);
  }

  /**
   * Get rule configuration
   */
  getRuleConfiguration(ruleId: string): RuleConfiguration | undefined {
    return this.configurations.get(ruleId);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): BusinessRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Process product through complete rules pipeline
   */
  async processProduct(
    input: ProductInput,
    context: RuleContext
  ): Promise<RuleResult<ProductOutput>> {
    console.log(`[RulesEngine] Processing product through complete rules pipeline`);
    
    // Step 1: Pre-processing rules (data cleaning and enhancement)
    const preProcessingResult = await this.executeRules<ProductInput, ProductInput>(
      input,
      context,
      RuleType.PRE_PROCESSING
    );
    
    if (!preProcessingResult.success) {
      return {
        success: false,
        violations: preProcessingResult.violations,
        warnings: preProcessingResult.warnings,
        metadata: { stage: 'pre_processing', ...preProcessingResult.metadata }
      };
    }
    
    const enhancedInput = preProcessingResult.data || input;
    
    // Step 2: Business logic validation
    const validationResult = await this.validateRules(enhancedInput, context);
    
    if (!validationResult.success) {
      return {
        success: false,
        violations: [
          ...preProcessingResult.violations,
          ...validationResult.violations
        ],
        warnings: [
          ...preProcessingResult.warnings, 
          ...validationResult.warnings
        ],
        metadata: { stage: 'business_validation' }
      };
    }
    
    // Step 3: Data enhancement rules
    const enhancementResult = await this.executeRules<ProductInput, ProductOutput>(
      enhancedInput,
      context,
      RuleType.DATA_ENHANCEMENT
    );
    
    const finalResult: RuleResult<ProductOutput> = {
      success: enhancementResult.success,
      data: enhancementResult.data || enhancedInput as ProductOutput,
      violations: [
        ...preProcessingResult.violations,
        ...validationResult.violations,
        ...enhancementResult.violations
      ],
      warnings: [
        ...preProcessingResult.warnings,
        ...validationResult.warnings,
        ...enhancementResult.warnings
      ],
      metadata: {
        stages: ['pre_processing', 'business_validation', 'data_enhancement'],
        preProcessingStats: preProcessingResult.metadata,
        enhancementStats: enhancementResult.metadata
      }
    };
    
    console.log(`[RulesEngine] Product processing completed. Success: ${finalResult.success}`);
    
    return finalResult;
  }
}

// Singleton instance
export const rulesEngine = new RulesEngineService();