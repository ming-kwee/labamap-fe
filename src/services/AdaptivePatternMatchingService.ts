import { ChannelMappingResult, FieldMapping, Transformation } from '@/types/channel';

/**
 * Adaptive Pattern Matching Service
 * Implements intelligent field mapping using multiple strategies:
 * - Exact field matching
 * - Semantic field matching with AI
 * - Platform-specific field mappings
 * - Pattern-based transformations
 */
export class AdaptivePatternMatchingService {
  private baseUrl = '/api/v1/mapping';

  /**
   * Generate channel payload using adaptive pattern matching
   */
  async generateChannelPayload(productId: string, channelId: string): Promise<ChannelMappingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId, channelId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate payload: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error generating channel payload:', error);
      throw error;
    }
  }

  /**
   * Find best field matches using semantic analysis
   */
  async findSemanticMatches(
    sourceFields: string[], 
    targetFields: string[], 
    channelId: string
  ): Promise<SemanticMatchResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/semantic-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceFields, targetFields, channelId }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error finding semantic matches:', error);
      throw error;
    }
  }

  /**
   * Get platform-specific field mappings
   */
  async getPlatformMappings(channelId: string): Promise<PlatformMapping[]> {
    try {
      const response = await fetch(`${this.baseUrl}/platform-mappings/${channelId}`);
      return await response.json();
    } catch (error) {
      console.error('Error getting platform mappings:', error);
      throw error;
    }
  }

  /**
   * Validate field mapping configuration
   */
  async validateMapping(
    sourceData: any, 
    targetSchema: any, 
    mappings: FieldMapping[]
  ): Promise<MappingValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceData, targetSchema, mappings }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error validating mapping:', error);
      throw error;
    }
  }

  /**
   * Generate JOLT transformation specification
   */
  async generateJoltSpec(mappings: FieldMapping[], channelId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/jolt-spec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mappings, channelId }),
      });

      const result = await response.json();
      return result.joltSpec;
    } catch (error) {
      console.error('Error generating JOLT spec:', error);
      throw error;
    }
  }

  /**
   * Apply transformations to source data
   */
  async applyTransformations(
    sourceData: any, 
    transformations: Transformation[]
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceData, transformations }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error applying transformations:', error);
      throw error;
    }
  }

  /**
   * Learn from successful mappings to improve future suggestions
   */
  async submitMappingFeedback(
    mappingId: string, 
    feedback: MappingFeedback
  ): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mappingId, feedback }),
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  /**
   * Get mapping confidence score for a field combination
   */
  async getConfidenceScore(
    sourceField: string, 
    targetField: string, 
    channelId: string,
    context?: any
  ): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/confidence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceField, targetField, channelId, context }),
      });

      const result = await response.json();
      return result.confidence;
    } catch (error) {
      console.error('Error getting confidence score:', error);
      return 0;
    }
  }

  /**
   * Get similar successful mappings for reference
   */
  async getSimilarMappings(
    productData: any, 
    channelId: string, 
    limit: number = 10
  ): Promise<SimilarMapping[]> {
    try {
      const response = await fetch(`${this.baseUrl}/similar-mappings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productData, channelId, limit }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error getting similar mappings:', error);
      return [];
    }
  }

  /**
   * Auto-suggest field mappings based on field names and data types
   */
  async autoSuggestMappings(
    sourceSchema: any, 
    targetSchema: any, 
    channelId: string
  ): Promise<FieldMapping[]> {
    try {
      const response = await fetch(`${this.baseUrl}/auto-suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceSchema, targetSchema, channelId }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error auto-suggesting mappings:', error);
      return [];
    }
  }

  /**
   * Optimize mapping performance by analyzing field usage patterns
   */
  async optimizeMappings(mappings: FieldMapping[]): Promise<OptimizedMapping[]> {
    try {
      const response = await fetch(`${this.baseUrl}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mappings }),
      });

      return await response.json();
    } catch (error) {
      console.error('Error optimizing mappings:', error);
      return mappings.map(m => ({ ...m, optimized: false }));
    }
  }

  /**
   * Get mapping analytics and performance metrics
   */
  async getMappingAnalytics(channelId?: string, timeframe?: string): Promise<MappingAnalytics> {
    try {
      const params = new URLSearchParams();
      if (channelId) params.append('channelId', channelId);
      if (timeframe) params.append('timeframe', timeframe);

      const response = await fetch(`${this.baseUrl}/analytics?${params.toString()}`);
      return await response.json();
    } catch (error) {
      console.error('Error getting mapping analytics:', error);
      throw error;
    }
  }
}

// Type definitions for adaptive pattern matching
export interface SemanticMatchResult {
  sourceField: string;
  targetField: string;
  confidence: number;
  semanticType: string;
  reasoning: string;
  alternatives: Array<{
    field: string;
    confidence: number;
    reason: string;
  }>;
}

export interface PlatformMapping {
  sourceField: string;
  targetField: string;
  transformation?: string;
  required: boolean;
  confidence: number;
  notes?: string;
}

export interface MappingValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  warnings: string[];
  suggestions: Array<{
    field: string;
    suggestion: string;
    confidence: number;
  }>;
  completeness: {
    mappedFields: number;
    totalFields: number;
    percentage: number;
    missingRequired: string[];
  };
}

export interface MappingFeedback {
  accurate: boolean;
  confidence: number;
  issues?: string[];
  suggestions?: string[];
  actualMapping?: {
    sourceField: string;
    targetField: string;
    transformation?: string;
  };
}

export interface SimilarMapping {
  productId: string;
  productName: string;
  similarity: number;
  mappings: FieldMapping[];
  success: boolean;
  confidence: number;
  createdAt: string;
}

export interface OptimizedMapping extends FieldMapping {
  optimized: boolean;
  optimizationReason?: string;
  performanceGain?: number;
  alternativeMapping?: FieldMapping;
}

export interface MappingAnalytics {
  totalMappings: number;
  successRate: number;
  averageConfidence: number;
  commonErrors: Array<{
    error: string;
    count: number;
    affectedFields: string[];
  }>;
  fieldPopularity: Array<{
    field: string;
    usage: number;
    successRate: number;
  }>;
  channelPerformance: Array<{
    channelId: string;
    mappings: number;
    successRate: number;
    averageConfidence: number;
  }>;
  improvementSuggestions: Array<{
    type: 'FIELD_MAPPING' | 'TRANSFORMATION' | 'VALIDATION';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    impact: string;
  }>;
  performanceTrends: Array<{
    date: string;
    mappings: number;
    successRate: number;
    averageConfidence: number;
  }>;
}

// Client-side adaptive matching utilities
export class ClientSidePatternMatching {
  /**
   * Calculate field similarity using string matching algorithms
   */
  static calculateFieldSimilarity(field1: string, field2: string): number {
    // Normalize field names
    const normalize = (str: string) => str.toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/\s+/g, ' ');

    const norm1 = normalize(field1);
    const norm2 = normalize(field2);

    // Exact match
    if (norm1 === norm2) return 100;

    // Calculate Levenshtein distance
    const levenshtein = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    const similarity = ((maxLength - levenshtein) / maxLength) * 100;

    // Boost similarity for common patterns
    if (this.hasCommonSemanticType(norm1, norm2)) {
      return Math.min(100, similarity + 20);
    }

    return similarity;
  }

  /**
   * Check if two fields have common semantic types
   */
  private static hasCommonSemanticType(field1: string, field2: string): boolean {
    const semanticTypes = {
      price: ['price', 'cost', 'amount', 'value', 'fee'],
      name: ['name', 'title', 'label', 'heading'],
      description: ['description', 'summary', 'details', 'content'],
      image: ['image', 'photo', 'picture', 'img', 'thumbnail'],
      category: ['category', 'type', 'class', 'group'],
      brand: ['brand', 'manufacturer', 'maker', 'vendor'],
      sku: ['sku', 'code', 'id', 'identifier', 'number'],
      weight: ['weight', 'mass', 'kg', 'lb', 'pounds'],
      quantity: ['quantity', 'qty', 'stock', 'inventory', 'count'],
      status: ['status', 'state', 'condition', 'available']
    };

    for (const [type, keywords] of Object.entries(semanticTypes)) {
      const field1Match = keywords.some(keyword => field1.includes(keyword));
      const field2Match = keywords.some(keyword => field2.includes(keyword));
      
      if (field1Match && field2Match) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Generate automatic field mappings based on similarity
   */
  static generateAutoMappings(
    sourceFields: string[], 
    targetFields: string[], 
    confidenceThreshold: number = 70
  ): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    const usedTargetFields = new Set<string>();

    for (const sourceField of sourceFields) {
      let bestMatch: { field: string; confidence: number } | null = null;

      for (const targetField of targetFields) {
        if (usedTargetFields.has(targetField)) continue;

        const confidence = this.calculateFieldSimilarity(sourceField, targetField);
        
        if (confidence >= confidenceThreshold && 
            (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { field: targetField, confidence };
        }
      }

      if (bestMatch) {
        mappings.push({
          sourceField,
          targetField: bestMatch.field,
          confidence: bestMatch.confidence,
          transformationType: bestMatch.confidence >= 90 ? 'DIRECT' : 'SEMANTIC'
        });
        usedTargetFields.add(bestMatch.field);
      }
    }

    return mappings.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Suggest transformations based on field types and patterns
   */
  static suggestTransformations(
    sourceField: string, 
    targetField: string, 
    sourceValue: any, 
    targetSchema?: any
  ): Transformation[] {
    const transformations: Transformation[] = [];

    // Price transformations
    if (this.isPriceField(sourceField) && this.isPriceField(targetField)) {
      if (typeof sourceValue === 'string' && !isNaN(parseFloat(sourceValue))) {
        transformations.push({
          type: 'CONVERT',
          sourceFields: [sourceField],
          targetField,
          rule: 'string_to_number',
          parameters: { type: 'float' }
        });
      }
    }

    // Date transformations
    if (this.isDateField(sourceField) && this.isDateField(targetField)) {
      transformations.push({
        type: 'FORMAT',
        sourceFields: [sourceField],
        targetField,
        rule: 'date_format',
        parameters: { outputFormat: 'ISO8601' }
      });
    }

    // Boolean transformations
    if (this.isBooleanField(targetField) && typeof sourceValue === 'string') {
      transformations.push({
        type: 'CONVERT',
        sourceFields: [sourceField],
        targetField,
        rule: 'string_to_boolean',
        parameters: { 
          trueValues: ['true', 'yes', '1', 'active', 'enabled'],
          falseValues: ['false', 'no', '0', 'inactive', 'disabled']
        }
      });
    }

    return transformations;
  }

  private static isPriceField(field: string): boolean {
    return /price|cost|amount|value|fee/i.test(field);
  }

  private static isDateField(field: string): boolean {
    return /date|time|created|updated|published/i.test(field);
  }

  private static isBooleanField(field: string): boolean {
    return /active|enabled|visible|published|available|required/i.test(field);
  }
}

// Singleton instance
export const adaptivePatternMatchingService = new AdaptivePatternMatchingService();