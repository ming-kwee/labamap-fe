/**
 * Dynamic Product Creation API
 * Creates products using the business rules engine and dynamic validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { rulesEngine } from '@/services/RulesEngineService';
import { SkuGenerationRule } from '@/services/rules/SkuGenerationRule';
import { NameNormalizationRule } from '@/services/rules/NameNormalizationRule';
import { PriceValidationRule } from '@/services/rules/PriceValidationRule';
import { RuleContext, ProductInput, ProductOutput } from '@/types/rules';

// Initialize rules engine
const initializeRulesEngine = async () => {
  if (rulesEngine.getAllRules().length === 0) {
    await rulesEngine.loadRuleConfigurations();
    rulesEngine.registerRule(new SkuGenerationRule());
    rulesEngine.registerRule(new NameNormalizationRule());
    rulesEngine.registerRule(new PriceValidationRule());
    console.log('[API] Rules engine initialized for product creation');
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

    // Create rule execution context
    const ruleContext: RuleContext = {
      userId: context?.userId || 'anonymous',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      environment: process.env.NODE_ENV as 'development' | 'testing' | 'production' || 'development',
      channel: productData.channel,
      category: productData.category,
      metadata: {
        targetChannels: context?.targetChannels || [],
        formSchema: context?.formSchema,
        apiVersion: 'v1'
      }
    };

    console.log(`[API] Processing product creation for user: ${ruleContext.userId}`);

    // Step 1: Process product through complete rules pipeline
    const rulesResult = await rulesEngine.processProduct(
      productData as ProductInput,
      ruleContext
    );

    if (!rulesResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Product validation failed',
        violations: rulesResult.violations,
        warnings: rulesResult.warnings,
        metadata: rulesResult.metadata
      }, { status: 400 });
    }

    // Step 2: Create the product (simulated - in real implementation, this would save to database)
    const processedProduct = rulesResult.data as ProductOutput;
    
    // Simulate product creation with additional metadata
    const createdProduct = {
      ...processedProduct,
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      createdBy: ruleContext.userId,
      rulesApplied: rulesResult.metadata?.rulesExecuted || [],
      validationScore: calculateValidationScore(rulesResult),
      enhancementsSummary: generateEnhancementsSummary(rulesResult)
    };

    // Step 3: Determine available channels based on product data and rules
    const availableChannels = determineAvailableChannels(createdProduct, ruleContext);

    console.log(`[API] Product created successfully: ${createdProduct.id}`);

    return NextResponse.json({
      success: true,
      product: createdProduct,
      availableChannels,
      rulesMetadata: {
        rulesExecuted: rulesResult.metadata?.rulesExecuted || [],
        executionTime: rulesResult.executionTime,
        enhancementsApplied: rulesResult.metadata?.enhancementStats,
        warningsCount: rulesResult.warnings.length,
        violationsResolved: rulesResult.violations.filter(v => v.severity !== 'error').length
      },
      processingDetails: {
        totalProcessingTime: rulesResult.executionTime,
        stagesCompleted: rulesResult.metadata?.stages || [],
        dataQualityScore: calculateDataQualityScore(processedProduct),
        channelCompatibilityScore: calculateChannelCompatibilityScore(processedProduct, availableChannels)
      }
    });

  } catch (error) {
    console.error('[API] Product creation error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create product',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate validation score based on rules execution results
 */
function calculateValidationScore(rulesResult: any): number {
  const totalRules = rulesResult.metadata?.rulesExecuted?.length || 1;
  const violations = rulesResult.violations.length;
  const warnings = rulesResult.warnings.length;
  
  // Start with 100% and deduct points for issues
  let score = 100;
  score -= (violations * 10); // -10 points per violation
  score -= (warnings * 2);    // -2 points per warning
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Generate enhancement summary
 */
function generateEnhancementsSummary(rulesResult: any): string[] {
  const enhancements: string[] = [];
  
  if (rulesResult.metadata?.rulesExecuted?.includes('SKU_GENERATION')) {
    enhancements.push('Auto-generated SKU based on brand and category');
  }
  
  if (rulesResult.metadata?.rulesExecuted?.includes('NAME_NORMALIZATION')) {
    enhancements.push('Normalized product name formatting');
  }
  
  if (rulesResult.metadata?.rulesExecuted?.includes('PRICE_VALIDATION')) {
    enhancements.push('Validated pricing against business rules');
  }
  
  return enhancements;
}

/**
 * Determine available channels based on product data
 */
function determineAvailableChannels(product: ProductOutput, context: RuleContext): string[] {
  const allChannels = ['shopify', 'amazon', 'walmart', 'ebay', 'facebook', 'google'];
  const availableChannels: string[] = [];
  
  for (const channel of allChannels) {
    if (isProductCompatibleWithChannel(product, channel)) {
      availableChannels.push(channel);
    }
  }
  
  return availableChannels;
}

/**
 * Check if product is compatible with a specific channel
 */
function isProductCompatibleWithChannel(product: ProductOutput, channel: string): boolean {
  switch (channel) {
    case 'walmart':
      // Walmart requires GTIN and brand
      return Boolean(product.attributes?.gtin && product.brand);
    
    case 'amazon':
      // Amazon requires name, price, and category
      return Boolean(product.name && product.price && product.category);
    
    case 'shopify':
      // Shopify is flexible, just needs basic info
      return Boolean(product.name && product.price);
    
    case 'ebay':
      // eBay needs name, price, and description
      return Boolean(product.name && product.price && product.description);
    
    case 'facebook':
    case 'google':
      // Social channels need image and description
      return Boolean(product.name && product.price && product.images?.length);
    
    default:
      return true;
  }
}

/**
 * Calculate data quality score
 */
function calculateDataQualityScore(product: ProductOutput): number {
  let score = 0;
  let maxScore = 0;
  
  // Required fields
  const requiredFields = ['name', 'price', 'category'];
  requiredFields.forEach(field => {
    maxScore += 20;
    if (product[field as keyof ProductOutput]) {
      score += 20;
    }
  });
  
  // Optional but important fields
  const optionalFields = ['description', 'brand', 'images', 'tags'];
  optionalFields.forEach(field => {
    maxScore += 10;
    const value = product[field as keyof ProductOutput];
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      score += 10;
    }
  });
  
  return Math.round((score / maxScore) * 100);
}

/**
 * Calculate channel compatibility score
 */
function calculateChannelCompatibilityScore(product: ProductOutput, availableChannels: string[]): number {
  const totalChannels = 6; // Total number of supported channels
  return Math.round((availableChannels.length / totalChannels) * 100);
}