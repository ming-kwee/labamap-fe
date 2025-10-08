/**
 * Rules Validation API Endpoint
 * Validates product data against business rules without transformation
 */

import { NextRequest, NextResponse } from 'next/server';
import { rulesEngine } from '@/services/RulesEngineService';
import { SkuGenerationRule } from '@/services/rules/SkuGenerationRule';
import { NameNormalizationRule } from '@/services/rules/NameNormalizationRule';
import { PriceValidationRule } from '@/services/rules/PriceValidationRule';
import { RuleContext, ProductInput } from '@/types/rules';

// Initialize rules engine
const initializeRulesEngine = async () => {
  if (rulesEngine.getAllRules().length === 0) {
    await rulesEngine.loadRuleConfigurations();
    rulesEngine.registerRule(new SkuGenerationRule());
    rulesEngine.registerRule(new NameNormalizationRule());
    rulesEngine.registerRule(new PriceValidationRule());
  }
};

export async function POST(request: NextRequest) {
  try {
    await initializeRulesEngine();
    
    const body = await request.json();
    const { productData, context } = body;

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

    // Validate against business rules only
    const result = await rulesEngine.validateRules(
      productData as ProductInput,
      ruleContext
    );

    return NextResponse.json({
      valid: result.success,
      violations: result.violations,
      warnings: result.warnings,
      metadata: {
        validationTimestamp: new Date().toISOString(),
        context: ruleContext
      }
    });

  } catch (error) {
    console.error('[API] Rules validation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to validate rules',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}