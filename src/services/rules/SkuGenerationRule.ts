/**
 * SKU Generation Rule
 * Auto-generates SKU when missing using brand-category-hash pattern
 */

import { BusinessRule, RuleContext, RuleResult, RuleType, ProductInput } from '@/types/rules';

export class SkuGenerationRule implements BusinessRule<ProductInput, ProductInput> {
  readonly id = 'SKU_GENERATION';
  readonly type = RuleType.PRE_PROCESSING;
  readonly priority = 100;

  canApply(input: ProductInput, context: RuleContext): boolean {
    // Apply only when SKU is missing or empty
    return !input.sku || input.sku.trim() === '';
  }

  async execute(input: ProductInput, context: RuleContext): Promise<RuleResult<ProductInput>> {
    try {
      if (input.sku && input.sku.trim() !== '') {
        return {
          success: true,
          data: input,
          violations: [],
          warnings: []
        };
      }

      const config = this.getConfiguration();
      const brandCode = this.generateBrandCode(input.brand || 'UNK', config.brandCodeLength);
      const categoryCode = this.generateCategoryCode(input.category || 'MISC', config.categoryCodeLength);
      const hash = this.generateHash(config.hashLength);

      const sku = config.pattern
        .replace('{brandCode}', brandCode)
        .replace('{categoryCode}', categoryCode)
        .replace('{hash}', hash);

      return {
        success: true,
        data: {
          ...input,
          sku: sku
        },
        violations: [],
        warnings: input.brand && input.category ? [] : [{
          field: 'sku',
          code: 'SKU_GENERATED_WITH_DEFAULTS',
          message: 'SKU generated with default values due to missing brand or category',
          suggestion: 'Provide brand and category for more meaningful SKU'
        }]
      };

    } catch (error) {
      return {
        success: false,
        data: input,
        violations: [{
          field: 'sku',
          code: 'SKU_GENERATION_FAILED',
          message: `Failed to generate SKU: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
          suggestedAction: 'Provide manual SKU or check rule configuration'
        }],
        warnings: []
      };
    }
  }

  private generateBrandCode(brand: string, length: number): string {
    return brand
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .substring(0, length)
      .padEnd(length, 'X');
  }

  private generateCategoryCode(category: string, length: number): string {
    return category
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .substring(0, length)
      .padEnd(length, 'X');
  }

  private generateHash(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  getConfiguration() {
    return {
      pattern: '{brandCode}-{categoryCode}-{hash}',
      brandCodeLength: 3,
      categoryCodeLength: 4,
      hashLength: 6,
      condition: 'sku_missing',
      overwriteExisting: false
    };
  }
}