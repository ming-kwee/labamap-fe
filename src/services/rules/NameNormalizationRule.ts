/**
 * Name Normalization Rule
 * Normalizes product name formatting and structure
 */

import { BusinessRule, RuleContext, RuleResult, RuleType, ProductInput } from '@/types/rules';

export class NameNormalizationRule implements BusinessRule<ProductInput, ProductInput> {
  readonly id = 'NAME_NORMALIZATION';
  readonly type = RuleType.PRE_PROCESSING;
  readonly priority = 90;

  canApply(input: ProductInput, context: RuleContext): boolean {
    return Boolean(input.name);
  }

  async execute(input: ProductInput, context: RuleContext): Promise<RuleResult<ProductInput>> {
    if (!input.name) {
      return {
        success: true,
        data: input,
        violations: [],
        warnings: []
      };
    }

    try {
      const config = this.getConfiguration();
      let normalizedName = input.name;
      const warnings = [];

      // Trim spaces
      if (config.trimSpaces) {
        normalizedName = normalizedName.trim().replace(/\s+/g, ' ');
      }

      // Check for prohibited words
      if (config.prohibitedWords) {
        const prohibitedFound = config.prohibitedWords.filter(word => 
          normalizedName.toLowerCase().includes(word.toLowerCase())
        );
        
        if (prohibitedFound.length > 0) {
          return {
            success: false,
            data: input,
            violations: [{
              field: 'name',
              code: 'PROHIBITED_WORDS_FOUND',
              message: `Product name contains prohibited words: ${prohibitedFound.join(', ')}`,
              severity: 'error',
              suggestedAction: 'Remove prohibited words from product name'
            }],
            warnings: []
          };
        }
      }

      // Capitalize words
      if (config.capitalizeWords) {
        normalizedName = this.capitalizeWords(normalizedName);
      }

      // Remove special characters (if configured)
      if (config.removeSpecialChars) {
        normalizedName = normalizedName.replace(/[^\w\s-]/g, '');
      }

      // Length validation
      if (normalizedName.length < config.minLength) {
        return {
          success: false,
          data: input,
          violations: [{
            field: 'name',
            code: 'NAME_TOO_SHORT',
            message: `Product name must be at least ${config.minLength} characters`,
            severity: 'error',
            suggestedAction: 'Provide a more descriptive product name'
          }],
          warnings: []
        };
      }

      if (normalizedName.length > config.maxLength) {
        normalizedName = normalizedName.substring(0, config.maxLength);
        warnings.push({
          field: 'name',
          code: 'NAME_TRUNCATED',
          message: `Product name was truncated to ${config.maxLength} characters`,
          suggestion: 'Consider shortening the product name'
        });
      }

      return {
        success: true,
        data: {
          ...input,
          name: normalizedName
        },
        violations: [],
        warnings
      };

    } catch (error) {
      return {
        success: false,
        data: input,
        violations: [{
          field: 'name',
          code: 'NAME_NORMALIZATION_FAILED',
          message: `Failed to normalize name: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
          suggestedAction: 'Check name format and try again'
        }],
        warnings: []
      };
    }
  }

  private capitalizeWords(text: string): string {
    return text.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  getConfiguration() {
    return {
      trimSpaces: true,
      capitalizeWords: true,
      removeSpecialChars: false,
      maxLength: 500,
      minLength: 3,
      prohibitedWords: ['test', 'sample', 'lorem', 'ipsum']
    };
  }
}