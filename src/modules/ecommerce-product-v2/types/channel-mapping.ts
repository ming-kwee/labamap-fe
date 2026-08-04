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
  // Heuristic-matcher inspector fields (APM analyze). `reasoning` explains WHY the match fired,
  // including the driving semanticType — turns a wrong match into an actionable KB fix (edit
  // field_semantic_knowledge). Contract: docs/FRONTEND-APM-INSPECTOR-REFRAME.md.
  sourceFieldName?: string;
  targetFieldName?: string;
  sourceSemanticType?: string | null;
  targetSemanticType?: string | null;
  reasoning?: string;
}

// ============================================================================
// SOURCE FIELD CLASSIFICATION (universal vs channel-specific)
// ============================================================================
// Per-source-field marker on the analyze response — lets the inspector colour which fields
// belong to the selected channel. Classification is RELATIVE to the selected channel: a field
// unique to channel A shows as UNIVERSAL when analysing channel B. Data-driven (read from
// ecommerce_master_attributes), name-based, best-effort (absent when uncomputable → treat as
// "no info", neutral). Contract: docs/FRONTEND-APM-SOURCE-FIELD-CLASSIFICATION.md.

export type SourceFieldScope = "UNIVERSAL" | "CHANNEL_SHARED" | "CHANNEL_UNIQUE";

export interface SourceFieldTag {
  scope: SourceFieldScope;
  isChannelField: boolean;
  supportedChannels?: string[]; // channels declaring this field (omitted when universal)
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
  // Per-source-field universal/channel-specific marker (best-effort, @JsonInclude(NON_NULL)).
  sourceFieldClassification?: Record<string, SourceFieldTag>;
  matchingMetadata: {
    // Count per matching strategy — Map<strategyName, count>, keyed by the SAME value as each
    // FieldMapping.matchStrategy (e.g. SEMANTIC_KNOWLEDGE, ALIAS_MAPPING, KEYWORD_SIMILARITY).
    // Render dynamically from whatever keys are present — do NOT hardcode a fixed tier set.
    // Contract: docs/FRONTEND-APM-STRATEGY-BREAKDOWN.md.
    matchStrategyCount?: Record<string, number>;
    matchedFields?: number;
    totalSourceFields?: number;
    totalTargetFields?: number;
    processingTimeMs?: number;
    warnings?: string[];
    [k: string]: unknown;
  };

  // ── Cascade block (APM → Agent) — addendum §4 (P1-M) ──────────────────────
  // Present when AI_CASCADE_ENABLED. Consumed by CascadeOutcomeBadge.
  escalatedToAgent?: boolean;
  agentStatus?: string; // AUTO_APPLIED | RECOMMENDATION_CREATED | MANUAL_REVIEW_REQUIRED | AGENT_FAILED | FALLBACK_APM
  agentJoltSpecId?: string;
  aiAgentSessionId?: string;
  // Phase-2 enrichment (when aiEnriched):
  aiEnriched?: boolean;
  aiConfidenceDelta?: number;
  aiCorrectedFields?: string[];
  aiGapsFilled?: string[];
  aiChannelRequiredUnmapped?: string[];
  aiWarnings?: string[];
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
