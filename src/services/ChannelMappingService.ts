import { 
  ChannelRecommendation, 
  ChannelMappingRequest, 
  ChannelMappingResponse, 
  ChannelMappingResult,
  ChannelAvailabilityResponse 
} from '@/types/channel';

/**
 * Channel Mapping Service - Handles channel selection, mapping, and publishing
 * Integrates with adaptive pattern matching for intelligent field mapping
 */
export class ChannelMappingService {
  // private baseUrl = '/api/v1/products';
  private baseUrl = 'http://localhost:8888/labamap/api/v1/master-product'; 

  /**
   * Get available channels with recommendations for a product
   */
  async getAvailableChannels(productId: string): Promise<ChannelAvailabilityResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/available`);
      
      if (!response.ok) {
        throw new Error(`Failed to get available channels: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting available channels:', error);
      throw error;
    }
  }

  /**
   * Map product to selected channels using adaptive pattern matching
   */
  async mapToChannels(productId: string, request: ChannelMappingRequest): Promise<ChannelMappingResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/map`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to map to channels: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error mapping to channels:', error);
      throw error;
    }
  }

  /**
   * Get channel-specific payload preview
   */
  async getChannelPayloadPreview(productId: string, channelId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/${channelId}/preview`);
      
      if (!response.ok) {
        throw new Error(`Failed to get payload preview: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting payload preview:', error);
      throw error;
    }
  }

  /**
   * Publish product to specific channel
   */
  async publishToChannel(productId: string, channelId: string, payload?: any): Promise<PublishResult> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/${channelId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload || {}),
      });

      if (!response.ok) {
        throw new Error(`Failed to publish to channel: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error publishing to channel:', error);
      throw error;
    }
  }

  /**
   * Bulk publish to multiple channels
   */
  async bulkPublishToChannels(productId: string, channelIds: string[]): Promise<BulkPublishResult> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/bulk-publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelIds }),
      });

      if (!response.ok) {
        throw new Error(`Failed to bulk publish: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error bulk publishing:', error);
      throw error;
    }
  }

  /**
   * Get channel schema for validation
   */
  async getChannelSchema(channelId: string): Promise<any> {
    try {
      const response = await fetch(`/api/v1/channels/${channelId}/schema`);
      
      if (!response.ok) {
        throw new Error(`Failed to get channel schema: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting channel schema:', error);
      throw error;
    }
  }

  /**
   * Validate payload against channel requirements
   */
  async validateChannelPayload(channelId: string, payload: any): Promise<ValidationResult> {
    try {
      const response = await fetch(`/api/v1/channels/${channelId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return await response.json();
    } catch (error) {
      console.error('Error validating channel payload:', error);
      throw error;
    }
  }

  /**
   * Re-map product to channel (for updates)
   */
  async remapToChannel(productId: string, channelId: string): Promise<ChannelMappingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/${channelId}/remap`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to remap to channel: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error remapping to channel:', error);
      throw error;
    }
  }

  /**
   * Get mapping history for a product-channel combination
   */
  async getMappingHistory(productId: string, channelId: string): Promise<MappingHistoryEntry[]> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}/channels/${channelId}/history`);
      
      if (!response.ok) {
        throw new Error(`Failed to get mapping history: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting mapping history:', error);
      throw error;
    }
  }

  /**
   * Get channel performance analytics
   */
  async getChannelAnalytics(channelId: string, timeframe?: string): Promise<ChannelAnalytics> {
    try {
      const params = timeframe ? `?timeframe=${timeframe}` : '';
      const response = await fetch(`/api/v1/channels/${channelId}/analytics${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get channel analytics: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting channel analytics:', error);
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

export interface ValidationResult {
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

// Singleton instance
export const channelMappingService = new ChannelMappingService();