/**
 * Channel Mapping Service
 * Implements 2-Phase Adaptive Pattern Matching Architecture:
 * Phase 1: Master Product Creation (Source of Truth) - Already handled by productService
 * Phase 2: Channel Mapping (On-Demand Transformation) - This service
 *
 * Uses 5-Tier Matching Strategy:
 * 1. Knowledge-Based (95%+) - Learned from production
 * 2. Semantic Matching (85%+) - Semantic equivalence
 * 3. Similarity Matching (60-90%) - Levenshtein distance
 * 4. Pattern Matching (75%) - Regex patterns
 * 5. Channel-Specific Boost - Platform intelligence
 */

import {
  AdaptivePatternMatchingRequest,
  AdaptivePatternMatchingResponse,
  ChannelPublishRequest,
  ChannelPublishResponse,
  ChannelConfiguration,
  ChannelConfigurationBackend,
  ChannelSyncStatus,
  LearnedMapping
} from '../types/channelMapping';

export class ChannelMappingService {
  private baseUrl = 'http://localhost:8888/labamap/api/v1';

  /**
   * Transform backend channel configuration to frontend-friendly format
   */
  private transformChannelConfig(backend: ChannelConfigurationBackend): ChannelConfiguration {
    return {
      channelId: backend.channelId,
      channelName: backend.channelName,
      description: backend.description,
      requiredFields: backend.requiredFields || [],
      optionalFields: backend.optionalFields || [],
      variantSupport: backend.metadata?.variantSupport ?? false,
      maxVariants: backend.metadata?.maxVariants,
      isActive: backend.isActive,
      metadata: backend.metadata,
      // fieldConstraints not provided by backend yet - would need to be built from requiredFields
      fieldConstraints: {}
    };
  } 

  /**
   * PHASE 2: Adaptive Pattern Matching
   * Core method that analyzes master product and generates field mappings
   * Endpoint: POST /api/v1/adaptive-pattern-matching/analyze
   *
   * Uses 5-Tier Matching Strategy:
   * 1. Knowledge-Based → Check learned mappings from production
   * 2. Semantic → Match based on semantic type (PRODUCT_NAME, PRICE, etc.)
   * 3. Similarity → Levenshtein distance for snake_case ↔ camelCase
   * 4. Pattern → Regex-based pattern detection
   * 5. Channel-Specific Boost → Platform intelligence (Amazon, Shopify, etc.)
   */
  async analyzePatternMatching(
    request: AdaptivePatternMatchingRequest
  ): Promise<AdaptivePatternMatchingResponse> {
    console.log('[ChannelMapping] 🔍 Starting adaptive pattern matching analysis');
    console.log('[ChannelMapping] Source schema fields:', Object.keys(request.sourceSchema));
    console.log('[ChannelMapping] Target channel:', request.channelId);
    console.log('[ChannelMapping] Confidence threshold:', request.confidenceThreshold);

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/adaptive-pattern-matching/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      console.log('[ChannelMapping] API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ChannelMapping] API error:', errorText);
        throw new Error(`Pattern matching failed: ${response.statusText}`);
      }

      const result = await response.json();
      const elapsed = Date.now() - startTime;

      // Check if backend returned an error status
      if (result.status === 'ERROR') {
        console.error('[ChannelMapping] ✗ Backend returned error:', result.message);
        throw new Error(`Backend error: ${result.message || 'Pattern matching failed'}`);
      }

      console.log('[ChannelMapping] ✓ Pattern matching completed in', elapsed, 'ms');
      console.log('[ChannelMapping] Field mappings found:', result.fieldMappings?.length || 0);
      console.log('[ChannelMapping] Overall confidence:', result.overallConfidence);
      console.log('[ChannelMapping] Unmapped source fields:', result.unmappedSourceFields);
      console.log('[ChannelMapping] Unmapped target fields:', result.unmappedTargetFields);

      // Log matching strategy breakdown
      if (result.matchingMetadata) {
        console.log('[ChannelMapping] Matching breakdown:', {
          knowledgeBased: result.matchingMetadata.knowledgeBasedMatches,
          semantic: result.matchingMetadata.semanticMatches,
          similarity: result.matchingMetadata.similarityMatches,
          pattern: result.matchingMetadata.patternMatches,
          total: result.matchingMetadata.totalMatches
        });
      }

      return result;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Pattern matching error:', error);
      throw error;
    }
  }

  /**
   * Get channel configuration (required fields, constraints, etc.)
   * MongoDB Collection: channel_configurations
   *
   * NOTE: Uses GET /channels endpoint and filters by channelId
   * (The /channels/{channelId}/configuration endpoint doesn't exist)
   */
  async getChannelConfiguration(channelId: string): Promise<ChannelConfiguration> {
    console.log('[ChannelMapping] Fetching configuration for channel:', channelId);

    try {
      // Fetch ALL channels and find the specific one
      const response = await fetch(`${this.baseUrl}/channels`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get channels: ${response.statusText}`);
      }

      const allChannels = await response.json();

      // Find the specific channel
      const backendConfig = allChannels.find((ch: any) => ch.channelId === channelId);

      if (!backendConfig) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      // Transform to frontend format
      const config = this.transformChannelConfig(backendConfig);

      console.log('[ChannelMapping] ✓ Channel configuration loaded');
      console.log('[ChannelMapping] Required fields:', config.requiredFields);
      console.log('[ChannelMapping] Variant support:', config.variantSupport);

      return config;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to load channel configuration:', error);
      throw error;
    }
  }

  /**
   * Get list of available channels for publishing
   */
  async getAvailableChannels(): Promise<ChannelConfiguration[]> {
    console.log('[ChannelMapping] Fetching available channels');

    try {
      const response = await fetch(`${this.baseUrl}/channels`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get channels: ${response.statusText}`);
      }

      const backendChannels: ChannelConfigurationBackend[] = await response.json();
      console.log('[ChannelMapping] ✓ Available channels from backend:', backendChannels.length);

      // Transform backend format to frontend-friendly format
      const channels = backendChannels
        .filter(channel => channel.isActive)
        .map(channel => this.transformChannelConfig(channel));

      console.log('[ChannelMapping] ✓ Transformed channels:', channels.length);
      channels.forEach(ch => {
        console.log(`  - ${ch.channelName} (${ch.channelId}): ${ch.requiredFields.length} required, ${ch.optionalFields.length} optional`);
      });

      return channels;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to load channels:', error);
      throw error;
    }
  }

  /**
   * Publish master product to channel using generated mappings
   * Applies JOLT transformation and pushes to channel API
   * Updates usage statistics for ML learning
   */
  async publishToChannel(
    request: ChannelPublishRequest
  ): Promise<ChannelPublishResponse> {
    console.log('[ChannelMapping] 🚀 Publishing product to channel');
    console.log('[ChannelMapping] Master product ID:', request.masterProductId);
    console.log('[ChannelMapping] Target channel:', request.channelId);
    console.log('[ChannelMapping] Field mappings count:', request.fieldMappings.length);
    console.log('[ChannelMapping] Dry run:', request.dryRun);

    try {
      const response = await fetch(`${this.baseUrl}/channels/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ChannelMapping] Publish error:', errorText);
        throw new Error(`Failed to publish to channel: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log('[ChannelMapping] ✓ Product published successfully');
        console.log('[ChannelMapping] Channel product ID:', result.channelProductId);
        console.log('[ChannelMapping] Channel URL:', result.channelUrl);

        // Mapping success recorded: usageCount++, successRate updated
        console.log('[ChannelMapping] ML learning: Mapping success recorded for future use');
      } else {
        console.error('[ChannelMapping] ✗ Publish failed');
        console.error('[ChannelMapping] Errors:', result.errors);
      }

      if (result.warnings && result.warnings.length > 0) {
        console.warn('[ChannelMapping] ⚠ Warnings:', result.warnings);
      }

      return result;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Publish error:', error);
      throw error;
    }
  }

  /**
   * Bulk publish to multiple channels
   */
  async bulkPublishToChannels(
    masterProductId: string,
    masterProductData: Record<string, any>,
    channelIds: string[]
  ): Promise<BulkPublishResult> {
    console.log('[ChannelMapping] Bulk publishing to channels:', channelIds);

    try {
      const response = await fetch(`${this.baseUrl}/channels/bulk-publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          masterProductId,
          masterProductData,
          channelIds
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to bulk publish: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[ChannelMapping] ✓ Bulk publish completed:', result);

      return result;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Bulk publish error:', error);
      throw error;
    }
  }

  /**
   * Get channel schema for validation
   */
  async getChannelSchema(channelId: string): Promise<Record<string, any>> {
    console.log('[ChannelMapping] Fetching schema for channel:', channelId);

    try {
      const response = await fetch(`${this.baseUrl}/channels/${channelId}/schema`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get channel schema: ${response.statusText}`);
      }

      const schema = await response.json();
      console.log('[ChannelMapping] ✓ Channel schema loaded');

      return schema;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to get channel schema:', error);
      throw error;
    }
  }

  /**
   * Validate payload against channel requirements
   */
  async validateChannelPayload(
    channelId: string,
    payload: Record<string, any>
  ): Promise<ChannelMappingValidationResult> {
    console.log('[ChannelMapping] Validating payload for channel:', channelId);

    try {
      const response = await fetch(`${this.baseUrl}/channels/${channelId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.valid) {
        console.log('[ChannelMapping] ✓ Payload validation passed');
      } else {
        console.warn('[ChannelMapping] ⚠ Payload validation failed:', result.errors);
      }

      return result;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Validation error:', error);
      throw error;
    }
  }

  /**
   * Re-map product to channel (for updates)
   * Used when master product changes and needs to be re-analyzed
   */
  async remapToChannel(
    masterProductId: string,
    masterProductData: Record<string, any>,
    channelId: string
  ): Promise<ChannelMappingResult> {
    console.log('[ChannelMapping] Re-mapping product to channel:', channelId);

    try {
      const response = await fetch(`${this.baseUrl}/channels/remap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          masterProductId,
          masterProductData,
          channelId
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to remap to channel: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[ChannelMapping] ✓ Re-mapping completed');

      return result;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Re-mapping error:', error);
      throw error;
    }
  }

  /**
   * Get mapping history for a product-channel combination
   */
  async getMappingHistory(masterProductId: string, channelId: string): Promise<MappingHistoryEntry[]> {
    console.log('[ChannelMapping] Fetching mapping history:', { masterProductId, channelId });

    try {
      const response = await fetch(
        `${this.baseUrl}/channels/history?masterProductId=${masterProductId}&channelId=${channelId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get mapping history: ${response.statusText}`);
      }

      const history = await response.json();
      console.log('[ChannelMapping] ✓ Mapping history loaded:', history.length, 'entries');

      return history;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to get mapping history:', error);
      throw error;
    }
  }

  /**
   * Get channel performance analytics
   */
  async getChannelAnalytics(channelId: string, timeframe?: string): Promise<ChannelAnalytics> {
    console.log('[ChannelMapping] Fetching analytics for channel:', channelId);

    try {
      const params = timeframe ? `?timeframe=${timeframe}` : '';
      const response = await fetch(`${this.baseUrl}/channels/${channelId}/analytics${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get channel analytics: ${response.statusText}`);
      }

      const analytics = await response.json();
      console.log('[ChannelMapping] ✓ Analytics loaded');

      return analytics;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to get analytics:', error);
      throw error;
    }
  }

  /**
   * Get learned mappings from ML system
   * Returns mappings that have been learned from successful publications
   */
  async getLearnedMappings(
    channelId: string,
    organizationId?: string
  ): Promise<LearnedMapping[]> {
    console.log('[ChannelMapping] Fetching learned mappings for channel:', channelId);

    try {
      const params = organizationId ? `?organizationId=${organizationId}` : '';
      const response = await fetch(
        `${this.baseUrl}/channels/${channelId}/learned-mappings${params}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get learned mappings: ${response.statusText}`);
      }

      const mappings = await response.json();
      console.log('[ChannelMapping] ✓ Learned mappings loaded:', mappings.length);

      return mappings;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to get learned mappings:', error);
      throw error;
    }
  }

  /**
   * Save custom mapping override for organization
   * Allows organizations to define custom field mappings that override ML suggestions
   */
  async saveCustomMapping(mapping: {
    channelId: string;
    sourceField: string;
    targetField: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    console.log('[ChannelMapping] Saving custom mapping:', mapping);

    try {
      const response = await fetch(`${this.baseUrl}/channels/custom-mappings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mapping),
      });

      if (!response.ok) {
        throw new Error(`Failed to save custom mapping: ${response.statusText}`);
      }

      console.log('[ChannelMapping] ✓ Custom mapping saved');
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to save custom mapping:', error);
      throw error;
    }
  }

  /**
   * Get channel sync status for a master product
   * Shows which channels the product is synced to and their status
   */
  async getSyncStatus(masterProductId: string): Promise<ChannelSyncStatus[]> {
    console.log('[ChannelMapping] Fetching sync status for product:', masterProductId);

    try {
      const response = await fetch(
        `${this.baseUrl}/channels/sync-status?masterProductId=${masterProductId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get sync status: ${response.statusText}`);
      }

      const statuses = await response.json();
      console.log('[ChannelMapping] ✓ Sync status loaded:', statuses.length, 'channels');

      return statuses;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Failed to get sync status:', error);
      throw error;
    }
  }

  /**
   * Apply JOLT transformation to preview transformed data
   * Shows what the data will look like in the target channel format
   */
  async previewJoltTransformation(
    sourceData: Record<string, any>,
    joltSpec: any[]
  ): Promise<Record<string, any>> {
    console.log('[ChannelMapping] Previewing JOLT transformation');

    try {
      const response = await fetch(`${this.baseUrl}/jolt/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceData,
          joltSpec
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to preview transformation: ${response.statusText}`);
      }

      const transformed = await response.json();
      console.log('[ChannelMapping] ✓ Transformation preview generated');

      return transformed;
    } catch (error) {
      console.error('[ChannelMapping] ✗ Transformation preview error:', error);
      throw error;
    }
  }
}

export interface PublishResult {
  success: boolean;
  channelProductId?: string;
  url?: string;
  error?: string;
  warnings?: string[];
}

export interface BulkPublishResult {
  totalChannels: number;
  successfulPublishes: number;
  results: Array<{
    channelId: string;
    success: boolean;
    channelProductId?: string;
    error?: string;
  }>;
}

export interface ChannelMappingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingFields: string[];
  invalidFields: string[];
}

export interface MappingHistoryEntry {
  timestamp: string;
  action: 'CREATED' | 'UPDATED' | 'PUBLISHED' | 'FAILED';
  confidence: number;
  mappedFields: number;
  totalFields: number;
  errors?: string[];
}

export interface ChannelAnalytics {
  channelId: string;
  totalProducts: number;
  successfulMappings: number;
  failedMappings: number;
  averageConfidence: number;
  commonErrors: Array<{
    error: string;
    count: number;
  }>;
  performanceMetrics: {
    averageMappingTime: number;
    averagePublishTime: number;
    successRate: number;
  };
}

export interface ChannelMappingResult {
  success: boolean;
  channelProductId?: string;
  channelUrl?: string;
  fieldMappings: Array<{
    sourcePath: string;
    targetPath: string;
    confidence: number;
    matchStrategy: string;
  }>;
  overallConfidence: number;
  mappedAt: string;
  errors?: string[];
  warnings?: string[];
}

// Singleton instance
export const channelMappingService = new ChannelMappingService();