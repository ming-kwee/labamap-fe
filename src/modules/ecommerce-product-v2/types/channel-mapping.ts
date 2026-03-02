/**
 * Channel Mapping Types
 * Based on Adaptive Pattern Matching Architecture
 */

// ============================================================================
// MATCH STRATEGIES (5-Tier System)
// ============================================================================

export type MatchStrategy =
  | 'KNOWLEDGE_BASED'
  | 'SEMANTIC_MATCH'
  | 'SIMILARITY_MATCH'
  | 'PATTERN_MATCH'
  | 'SEMANTIC_WITH_BOOST'
  | 'EXACT_MATCH';

// ============================================================================
// FIELD MAPPING
// ============================================================================

export interface FieldMapping {
  sourcePath: string;
  targetPath: string;
  confidence: number;
  matchStrategy: MatchStrategy;
  usageCount?: number;
  successRate?: number;
  dataTransformation?: string;
  channelBoost?: number;
}

// ============================================================================
// ADAPTIVE PATTERN MATCHING REQUEST/RESPONSE
// ============================================================================

export interface AdaptivePatternMatchingRequest {
  sourceSchema: Record<string, any>;
  targetSchema: Record<string, any>;
  channelId: string;
  confidenceThreshold: number;
  organizationId?: string;
  userId?: string;
  categoryId?: string;
  persistJolt?: boolean;
  persistConfidenceThreshold?: number;
  forceReanalyze?: boolean;
}

export interface AdaptivePatternMatchingResponse {
  fieldMappings: FieldMapping[];
  joltSpec: any[];
  overallConfidence: number;
  unmappedSourceFields: string[];
  unmappedTargetFields: string[];
  status?: string;
  message?: string;
  matchingMetadata: {
    knowledgeBasedMatches: number;
    semanticMatches: number;
    similarityMatches: number;
    patternMatches: number;
    totalMatches: number;
    processingTimeMs: number;
    warnings?: string[];
  };
}

// ============================================================================
// CHANNEL CONFIGURATION
// ============================================================================

export interface ChannelConfigurationBackend {
  id: string;
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
  dryRun?: boolean;
  categoryId?: string;
  organizationId?: string;
  publishOptions?: {
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
  organizationId?: string;
}
