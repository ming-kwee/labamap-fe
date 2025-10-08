/**
 * Price Validation Rule
 * Validates price against business rules and channel requirements
 */

import { BusinessRule, RuleContext, RuleResult, RuleType, ProductInput } from '@/types/rules';

export class PriceValidationRule implements BusinessRule<ProductInput, ProductInput> {
  readonly id = 'PRICE_VALIDATION';
  readonly type = RuleType.BUSINESS_LOGIC;
  readonly priority = 200;

  canApply(input: ProductInput, context: RuleContext): boolean {
    return Boolean(input.price !== undefined);
  }

  async execute(input: ProductInput, context: RuleContext): Promise<RuleResult<ProductInput>> {
    return this.validate(input, context);
  }

  async validate(input: ProductInput, context: RuleContext): Promise<RuleResult<boolean>> {
    if (input.price === undefined || input.price === null) {
      return {
        success: false,
        data: false,
        violations: [{
          field: 'price',
          code: 'PRICE_REQUIRED',
          message: 'Price is required',
          severity: 'error',
          suggestedAction: 'Provide a valid price for the product'
        }],
        warnings: []
      };
    }

    const config = this.getConfiguration();
    const violations = [];
    const warnings = [];
    const price = Number(input.price);

    if (isNaN(price) || price < 0) {
      violations.push({
        field: 'price',
        code: 'INVALID_PRICE',
        message: 'Price must be a valid positive number',
        severity: 'error' as const,
        suggestedAction: 'Enter a valid price greater than or equal to 0'
      });
    }

    // Category-based price validation
    if (input.category && config.categoryLimits[input.category]) {
      const limits = config.categoryLimits[input.category];
      
      if (price < limits.minPrice) {
        violations.push({
          field: 'price',
          code: 'PRICE_BELOW_CATEGORY_MINIMUM',
          message: `Price $${price} is below the minimum of $${limits.minPrice} for category ${input.category}`,
          severity: 'error' as const,
          suggestedAction: `Set price to at least $${limits.minPrice}`
        });
      }

      if (price > limits.maxPrice) {
        violations.push({
          field: 'price',
          code: 'PRICE_ABOVE_CATEGORY_MAXIMUM',
          message: `Price $${price} exceeds the maximum of $${limits.maxPrice} for category ${input.category}`,
          severity: 'error' as const,
          suggestedAction: `Set price to no more than $${limits.maxPrice}`
        });
      }
    }

    // Channel-specific validation
    if (context.channel && config.channelRules[context.channel]) {
      const channelRule = config.channelRules[context.channel];
      
      if (price < channelRule.minPrice) {
        violations.push({
          field: 'price',
          code: 'PRICE_BELOW_CHANNEL_MINIMUM',
          message: `Price $${price} is below the minimum of $${channelRule.minPrice} for ${context.channel}`,
          severity: 'error' as const,
          suggestedAction: `Set price to at least $${channelRule.minPrice} for ${context.channel}`
        });
      }

      // Channel-specific requirements
      if (channelRule.requiresGTIN && !input.attributes?.gtin) {
        violations.push({
          field: 'attributes.gtin',
          code: 'GTIN_REQUIRED_FOR_CHANNEL',
          message: `GTIN is required for ${context.channel}`,
          severity: 'error' as const,
          suggestedAction: 'Provide a valid GTIN for this channel'
        });
      }
    }

    // Competitive pricing check
    if (config.competitivePricing?.enabled) {
      const variance = config.competitivePricing.varianceThreshold;
      // This would typically check against competitor prices
      // For now, we'll simulate a competitive price range
      const estimatedMarketPrice = this.estimateMarketPrice(input);
      
      if (estimatedMarketPrice && Math.abs(price - estimatedMarketPrice) / estimatedMarketPrice > variance) {
        const severity = config.competitivePricing.warningOnly ? 'warning' : 'error';
        const message = price > estimatedMarketPrice 
          ? `Price may be too high compared to market average of $${estimatedMarketPrice}`
          : `Price may be too low compared to market average of $${estimatedMarketPrice}`;
        
        if (severity === 'warning') {
          warnings.push({
            field: 'price',
            code: 'COMPETITIVE_PRICING_VARIANCE',
            message,
            suggestion: 'Review pricing strategy against competitors'
          });
        } else {
          violations.push({
            field: 'price',
            code: 'COMPETITIVE_PRICING_VARIANCE',
            message,
            severity: 'error' as const,
            suggestedAction: 'Adjust pricing to be competitive'
          });
        }
      }
    }

    const success = violations.length === 0;

    return {
      success,
      data: success,
      violations,
      warnings
    };
  }

  private estimateMarketPrice(input: ProductInput): number | null {
    // Simplified market price estimation
    // In a real implementation, this would query external pricing APIs
    if (input.category === 'electronics') {
      return (input.price || 0) * 0.95; // Simulate 5% lower market price
    }
    if (input.category === 'clothing') {
      return (input.price || 0) * 1.1; // Simulate 10% higher market price
    }
    return null;
  }

  getConfiguration() {
    return {
      categoryLimits: {
        electronics: { minPrice: 1.0, maxPrice: 50000.0 },
        clothing: { minPrice: 5.0, maxPrice: 2000.0 },
        books: { minPrice: 0.99, maxPrice: 500.0 },
        jewelry: { minPrice: 10.0, maxPrice: 100000.0 }
      },
      channelRules: {
        amazon: { minPrice: 1.0, currency: 'USD', requiresGTIN: false },
        walmart: { minPrice: 0.50, currency: 'USD', requiresGTIN: true },
        shopify: { minPrice: 0.01, currency: 'USD', allowsComparePrice: true },
        ebay: { minPrice: 0.99, currency: 'USD', supportsBidding: true }
      },
      competitivePricing: {
        enabled: true,
        varianceThreshold: 0.25,
        warningOnly: true
      }
    };
  }
}