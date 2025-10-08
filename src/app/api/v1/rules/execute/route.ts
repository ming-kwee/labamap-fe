/**
 * Rules Execution API Endpoint
 * Executes business rules on product data
 */

import { NextRequest, NextResponse } from 'next/server';
import { rulesEngine } from '@/services/RulesEngineService';
import { SkuGenerationRule } from '@/services/rules/SkuGenerationRule';
import { NameNormalizationRule } from '@/services/rules/NameNormalizationRule';
import { PriceValidationRule } from '@/services/rules/PriceValidationRule';
import { RuleType, RuleContext, ProductInput } from '@/types/rules';

// Initialize rules engine with default rules
const initializeRulesEngine = async () => {
  if (rulesEngine.getAllRules().length === 0) {
    await rulesEngine.loadRuleConfigurations();
    
    // Register default rules
    rulesEngine.registerRule(new SkuGenerationRule());
    rulesEngine.registerRule(new NameNormalizationRule());
    rulesEngine.registerRule(new PriceValidationRule());
    
    console.log('[API] Rules engine initialized with default rules');
  }
};

export async function POST(request: NextRequest) {
  try {
    await initializeRulesEngine();
    
    const body = await request.json();
    const { productData, ruleType, context } = body;

    if (!productData) {
      return NextResponse.json(
        { error: 'Product data is required' },
        { status: 400 }
      );
    }

    // Create rule context
    const ruleContext: RuleContext = {
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      environment: process.env.NODE_ENV as 'development' | 'testing' | 'production' || 'development',
      ...context
    };

    // Execute rules
    const result = await rulesEngine.executeRules(
      productData as ProductInput,
      ruleContext,
      ruleType ? (ruleType as RuleType) : undefined
    );

    return NextResponse.json({
      success: result.success,
      data: result.data,
      violations: result.violations,
      warnings: result.warnings,
      metadata: result.metadata,
      executionTime: result.executionTime
    });

  } catch (error) {
    console.error('[API] Rules execution error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute rules',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await initializeRulesEngine();
    
    const { searchParams } = new URL(request.url);
    const ruleType = searchParams.get('type') as RuleType | null;
    
    let rules;
    if (ruleType) {
      rules = rulesEngine.getRulesByType(ruleType);
    } else {
      rules = rulesEngine.getAllRules();
    }
    
    const ruleInfo = rules.map(rule => ({
      id: rule.id,
      type: rule.type,
      priority: rule.priority,
      configuration: rule.getConfiguration?.()
    }));
    
    return NextResponse.json({
      rules: ruleInfo,
      count: ruleInfo.length
    });
    
  } catch (error) {
    console.error('[API] Rules listing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list rules',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}