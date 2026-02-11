/**
 * Channel Mapping Types
 * Based on Adaptive Pattern Matching Architecture
 */

// ============================================================================
// MATCH STRATEGIES (5-Tier System)
// ============================================================================

export type MatchStrategy =
  | 'KNOWLEDGE_BASED'      // 95%+ confidence - Learned from production
  | 'SEMANTIC_MATCH'       // 85%+ confidence - Semantic equivalence
  | 'SIMILARITY_MATCH'     // 60-90% confidence - Levenshtein distance
  | 'PATTERN_MATCH'        // 75% confidence - Regex patterns
  | 'SEMANTIC_WITH_BOOST'  // Semantic + channel-specific boost
  | 'EXACT_MATCH';         // 100% confidence

// ============================================================================
// FIELD MAPPING
// ============================================================================

export interface FieldMapping {
  sourcePath: string;          // e.g., "product_name"
  targetPath: string;          // e.g., "title"
  confidence: number;          // 0-100 confidence score
  matchStrategy: MatchStrategy;
  usageCount?: number;         // How many times this mapping was used successfully
  successRate?: number;        // Success rate percentage
  dataTransformation?: string; // Optional transformation logic
  channelBoost?: number;       // Channel-specific confidence boost
}

// ============================================================================
// ADAPTIVE PATTERN MATCHING REQUEST/RESPONSE
// ============================================================================

export interface AdaptivePatternMatchingRequest {
  sourceSchema: Record<string, any>;    // Master product data
  targetSchema: Record<string, any>;    // Channel schema template
  channelId: string;                    // e.g., "amazon", "shopify"
  confidenceThreshold: number;          // Minimum confidence (default: 70)
  organizationId?: string;              // For custom mappings
  userId?: string;                      // For audit trail
  categoryId?: string;                  // Product category for JOLT persistence key
  persistJolt?: boolean;                // Save JOLT to MongoDB (default: false)
  persistConfidenceThreshold?: number;  // Min confidence to allow save (default: 80)
  forceReanalyze?: boolean;             // Force regeneration even if cached
}

export interface AdaptivePatternMatchingResponse {
  fieldMappings: FieldMapping[];
  joltSpec: any[];                      // JOLT transformation specification
  overallConfidence: number;            // Average confidence across all mappings
  unmappedSourceFields: string[];       // Fields that couldn't be mapped
  unmappedTargetFields: string[];       // Required target fields missing
  status?: string;                      // Response status from backend
  message?: string;                     // Status message
  matchingMetadata: {
    knowledgeBasedMatches: number;
    semanticMatches: number;
    similarityMatches: number;
    patternMatches: number;
    totalMatches: number;
    processingTimeMs: number;
    warnings?: string[];                // e.g., "JOLT spec persisted to category 'clothing'"
  };
}

// ============================================================================
// CHANNEL CONFIGURATION
// ============================================================================

// Backend response format (actual API)
export interface ChannelConfigurationBackend {
  id: string;                                // MongoDB _id
  channelId: string;
  channelName: string;
  description: string;
  apiSchema: any | null;
  requiredFieldObjects: any | null;
  recommendedFields: any | null;
  fieldBoosts: any | null;
  confidenceThresholds: any | null;
  confidenceThreshold: any | null;
  autoApprovalThreshold: any | null;
  defaultMappingStrategies: any | null;
  validationRules: any | null;
  transformationDefaults: any | null;
  isActive: boolean;
  version: string;
  metadata: {
    variantSupport?: boolean;
    apiVersion?: string;
    maxVariants?: number;
    documentation?: string;
  };
  requiredFields: string[];
  optionalFields: string[];
  fieldMappingPreferences: any | null;
  customSettings: any | null;
  createdAt: string;
  updatedAt: string;
}

// Frontend-friendly format (normalized)
export interface ChannelConfiguration {
  channelId: string;
  channelName: string;
  description?: string;
  apiEndpoint?: string;
  requiredFields: string[];
  optionalFields: string[];
  fieldConstraints?: Record<string, {
    maxLength?: number;
    minLength?: number;
    required?: boolean;
    type?: string;
    min?: number;
    max?: number;
    pattern?: string;
  }>;
  variantSupport: boolean;
  maxVariants?: number;
  rateLimit?: {
    requestsPerSecond: number;
    requestsPerDay: number;
  };
  isActive?: boolean;
  metadata?: Record<string, any>;
}

// ============================================================================
// CHANNEL PUBLISH
// ============================================================================

export interface ChannelPublishRequest {
  masterProductId: string;
  masterProductData: Record<string, any>;
  channelId: string;
  fieldMappings: FieldMapping[];
  joltSpec?: any[];
  skipValidation?: boolean;
  dryRun?: boolean;              // Preview only, don't actually publish
  categoryId?: string;           // Category for JOLT lookup (must match analyze)
  organizationId?: string;       // Multi-tenant support
  publishOptions?: {             // Extended publish options
    skipValidation?: boolean;
    autoPublish?: boolean;
    syncInventory?: boolean;
  };
}

export interface ChannelPublishResponse {
  success: boolean;
  publishId?: string;
  channelProductId?: string;
  channelUrl?: string;
  publishedData: Record<string, any>;
  warnings?: string[];
  errors?: string[];
  publishedAt?: string;
  syncStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  transformationApplied?: {
    fieldsTransformed: number;
    fieldsDropped: number;
    fieldsAdded: number;
  };
  isDryRun?: boolean;
  performanceMetrics?: {
    transformationTimeMs: number;
    channelApiCallTimeMs: number;
    totalTimeMs: number;
  };
}

// ============================================================================
// MAPPING PREVIEW (UI State)
// ============================================================================

export interface MappingPreviewState {
  masterProduct: Record<string, any>;
  selectedChannel: string;
  channelConfig?: ChannelConfiguration;
  mappingResult?: AdaptivePatternMatchingResponse;
  isAnalyzing: boolean;
  analysisError?: string;
  userOverrides: Record<string, string>; // User can override suggested mappings
  validationErrors: string[];
}

// ============================================================================
// CHANNEL SYNC STATUS
// ============================================================================

export interface ChannelSyncStatus {
  masterProductId: string;
  channelId: string;
  channelProductId?: string;
  status: 'NOT_SYNCED' | 'SYNCED' | 'SYNC_FAILED' | 'OUTDATED';
  lastSyncedAt?: string;
  lastSyncError?: string;
  syncAttempts: number;
  fieldMappingsUsed: FieldMapping[];
}

// ============================================================================
// LEARNED MAPPING (For ML Enhancement)
// ============================================================================

export interface LearnedMapping {
  id: string;
  channelId: string;
  sourceField: string;
  targetField: string;
  confidence: number;
  successRate: number;
  usageCount: number;
  lastUsed: string;
  createdBy: string;
  validated: boolean;
  organizationId?: string;  // Org-specific learned mapping
}
