/**
 * useChannelPublish Hook
 * Manages channel publishing workflow with adaptive pattern matching
 *
 * Features:
 * - Load available channels
 * - Analyze pattern matching (5-tier strategy)
 * - Preview JOLT transformation
 * - Publish to channel
 * - Track publish status
 */

import { useState, useEffect, useCallback } from 'react';
import { MasterProduct } from '../types/product';
import {
  AdaptivePatternMatchingResponse,
  ChannelConfiguration,
  ChannelPublishResponse
} from '../types/channelMapping';
import { channelMappingService } from '../services/channelMappingService';
import {
  transformMasterProductToSourceSchema,
  generateMappingRequest,
  checkChannelReadiness,
  ChannelReadinessResult
} from '../services/productGenerationService';

export interface UseChannelPublishOptions {
  product: MasterProduct;
  organizationId?: string;
  userId?: string;
}

export interface UseChannelPublishReturn {
  // State
  availableChannels: ChannelConfiguration[];
  selectedChannel: string;
  isLoadingChannels: boolean;
  isAnalyzing: boolean;
  isPublishing: boolean;
  mappingResult: AdaptivePatternMatchingResponse | null;
  publishResult: ChannelPublishResponse | null;
  error: string | null;
  joltPreviewData: any | null;
  channelReadiness: ChannelReadinessResult | null;

  // Actions
  setSelectedChannel: (channelId: string) => void;
  analyzePatternMatching: () => Promise<void>;
  previewTransformation: () => Promise<void>;
  publishToChannel: (dryRun?: boolean) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

/**
 * Custom hook for managing channel publish workflow
 */
export function useChannelPublish(
  options: UseChannelPublishOptions
): UseChannelPublishReturn {
  const {
    product,
    organizationId = product.customAttributes?._organizationId as string,
    userId = product.customAttributes?._createdBy as string
  } = options;

  // State
  const [availableChannels, setAvailableChannels] = useState<ChannelConfiguration[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [mappingResult, setMappingResult] = useState<AdaptivePatternMatchingResponse | null>(null);
  const [publishResult, setPublishResult] = useState<ChannelPublishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joltPreviewData, setJoltPreviewData] = useState<any | null>(null);
  const [channelReadiness, setChannelReadiness] = useState<ChannelReadinessResult | null>(null);

  /**
   * Load available channels on mount
   */
  useEffect(() => {
    async function loadChannels() {
      setIsLoadingChannels(true);
      setError(null);

      try {
        console.log('[useChannelPublish] Loading available channels');
        const channels = await channelMappingService.getAvailableChannels();
        console.log('[useChannelPublish] ✓ Channels loaded:', channels.length);
        setAvailableChannels(channels);
      } catch (err) {
        console.error('[useChannelPublish] ✗ Failed to load channels:', err);

        // Set fallback channels for development
        const fallbackChannels: ChannelConfiguration[] = [
          {
            channelId: 'shopify',
            channelName: 'Shopify',
            requiredFields: ['title', 'price', 'inventory_quantity'],
            optionalFields: ['description', 'vendor', 'product_type', 'tags'],
            fieldConstraints: {
              title: { maxLength: 255, required: true },
              price: { type: 'decimal', min: 0.01, required: true }
            },
            variantSupport: true,
            maxVariants: 100
          },
          {
            channelId: 'amazon',
            channelName: 'Amazon Seller Central',
            requiredFields: ['title', 'brand', 'price', 'quantity', 'product_id'],
            optionalFields: ['bullet_point_1', 'bullet_point_2', 'description'],
            fieldConstraints: {
              title: { maxLength: 200, required: true },
              brand: { maxLength: 50, required: true },
              price: { type: 'decimal', min: 0.01, required: true }
            },
            variantSupport: true,
            maxVariants: 2000
          },
          {
            channelId: 'walmart',
            channelName: 'Walmart Marketplace',
            requiredFields: ['productName', 'brand', 'price', 'sku', 'upc'],
            optionalFields: ['productDescription', 'mainImageUrl'],
            fieldConstraints: {
              productName: { maxLength: 200, required: true },
              brand: { required: true },
              price: { type: 'decimal', min: 0.01, required: true }
            },
            variantSupport: false
          },
          {
            channelId: 'ebay',
            channelName: 'eBay',
            requiredFields: ['Title', 'StartPrice', 'Quantity', 'CategoryID'],
            optionalFields: ['Description', 'PictureURL'],
            fieldConstraints: {
              Title: { maxLength: 80, required: true },
              StartPrice: { type: 'decimal', min: 0.01, required: true }
            },
            variantSupport: false
          }
        ];

        console.warn('[useChannelPublish] Using fallback channels');
        setAvailableChannels(fallbackChannels);
        setError('Using offline channel data');
      } finally {
        setIsLoadingChannels(false);
      }
    }

    loadChannels();
  }, []);

  /**
   * Reset mapping result when channel changes
   */
  useEffect(() => {
    if (mappingResult) {
      console.log('[useChannelPublish] Channel changed, resetting mapping result');
      setMappingResult(null);
      setPublishResult(null);
      setJoltPreviewData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel]);

  /**
   * Check channel readiness when channel changes (Step 2: Backend-driven)
   */
  useEffect(() => {
    async function checkReadiness() {
      if (!selectedChannel) {
        setChannelReadiness(null);
        return;
      }

      try {
        console.log('[useChannelPublish] 📡 Checking channel readiness (Step 2)...');
        const readiness = await checkChannelReadiness(product, selectedChannel);
        console.log('[useChannelPublish] ✅ Channel readiness:', readiness);
        setChannelReadiness(readiness);
      } catch (err) {
        console.error('[useChannelPublish] Failed to check channel readiness:', err);
        setChannelReadiness(null);
      }
    }

    checkReadiness();
  }, [product, selectedChannel]);

  /**
   * Analyze pattern matching for selected channel
   */
  const analyzePatternMatching = useCallback(async () => {
    if (!selectedChannel) {
      setError('Please select a channel first');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setMappingResult(null);
    setPublishResult(null);

    try {
      console.log('[useChannelPublish] ===== STARTING PATTERN MATCHING ANALYSIS =====');
      console.log('[useChannelPublish] Product:', product.name);
      console.log('[useChannelPublish] Channel:', selectedChannel);

      // STEP 2: Fetch target schema from MongoDB apiSchema field
      const request = await generateMappingRequest(product, selectedChannel, {
        confidenceThreshold: 70,
        organizationId,
        userId,
        categoryId: product.category || 'default',
        persistJolt: true,
        persistConfidenceThreshold: 80,
      });

      console.log('[useChannelPublish] Request:', {
        sourceFields: Object.keys(request.sourceSchema).length,
        targetFields: Object.keys(request.targetSchema).length,
        confidenceThreshold: request.confidenceThreshold
      });

      const result = await channelMappingService.analyzePatternMatching(request);

      console.log('[useChannelPublish] ===== ANALYSIS COMPLETE =====');
      console.log('[useChannelPublish] Confidence:', result.overallConfidence);
      console.log('[useChannelPublish] Mappings:', result.fieldMappings.length);
      console.log('[useChannelPublish] Unmapped source:', result.unmappedSourceFields.length);
      console.log('[useChannelPublish] Unmapped target:', result.unmappedTargetFields.length);

      setMappingResult(result);

    } catch (err) {
      console.error('[useChannelPublish] ===== ANALYSIS FAILED =====');
      console.error('[useChannelPublish] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze pattern matching');
    } finally {
      setIsAnalyzing(false);
    }
  }, [product, selectedChannel, organizationId, userId]);

  /**
   * Preview JOLT transformation
   */
  const previewTransformation = useCallback(async () => {
    if (!mappingResult) {
      setError('Please analyze pattern matching first');
      return;
    }

    try {
      console.log('[useChannelPublish] Previewing JOLT transformation');
      const sourceData = transformMasterProductToSourceSchema(product);

      const transformed = await channelMappingService.previewJoltTransformation(
        sourceData,
        mappingResult.joltSpec
      );

      console.log('[useChannelPublish] ✓ Transformation preview generated');
      setJoltPreviewData(transformed);

    } catch (err) {
      console.error('[useChannelPublish] ✗ Transformation preview failed:', err);
      setError('Failed to preview transformation');
    }
  }, [product, mappingResult]);

  /**
   * Publish product to selected channel
   */
  const publishToChannel = useCallback(async (dryRun: boolean = false) => {
    if (!selectedChannel) {
      setError('Please select a channel first');
      return;
    }

    if (!mappingResult) {
      setError('Please analyze pattern matching first');
      return;
    }

    if (!channelReadiness?.ready) {
      setError('Product is not ready for publishing. Please fix blockers first.');
      return;
    }

    setIsPublishing(true);
    setError(null);
    setPublishResult(null);

    try {
      console.log('[useChannelPublish] ===== PUBLISHING TO CHANNEL =====');
      console.log('[useChannelPublish] Channel:', selectedChannel);
      console.log('[useChannelPublish] Dry run:', dryRun);

      const sourceData = transformMasterProductToSourceSchema(product);

      const result = await channelMappingService.publishToChannel({
        masterProductId: product.id,
        masterProductData: sourceData,
        channelId: selectedChannel,
        fieldMappings: mappingResult.fieldMappings,
        joltSpec: mappingResult.joltSpec,
        categoryId: product.category || 'default',
        organizationId,
        dryRun
      });

      console.log('[useChannelPublish] ===== PUBLISH RESULT =====');
      console.log('[useChannelPublish] Success:', result.success);
      console.log('[useChannelPublish] Channel Product ID:', result.channelProductId);
      console.log('[useChannelPublish] Sync Status:', result.syncStatus);

      setPublishResult(result);

      if (!result.success) {
        setError(`Publishing failed: ${result.errors?.join(', ')}`);
      } else {
        console.log('[useChannelPublish] ✓ Published successfully');
      }

    } catch (err) {
      console.error('[useChannelPublish] ===== PUBLISH FAILED =====');
      console.error('[useChannelPublish] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to publish to channel');
    } finally {
      setIsPublishing(false);
    }
  }, [product, selectedChannel, mappingResult, channelReadiness]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setSelectedChannel('');
    setMappingResult(null);
    setPublishResult(null);
    setError(null);
    setJoltPreviewData(null);
  }, []);

  return {
    // State
    availableChannels,
    selectedChannel,
    isLoadingChannels,
    isAnalyzing,
    isPublishing,
    mappingResult,
    publishResult,
    error,
    joltPreviewData,
    channelReadiness,

    // Actions
    setSelectedChannel,
    analyzePatternMatching,
    previewTransformation,
    publishToChannel,
    clearError,
    reset
  };
}
