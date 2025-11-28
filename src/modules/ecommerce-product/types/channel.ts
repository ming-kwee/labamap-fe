/**
 * Channel Management Types
 * For channel selection, mapping, and publishing functionality
 */

export interface ChannelRecommendation {
  channelId: string;
  channelName: string;
  compatibilityScore: number;
  recommendation: 'HIGHLY_RECOMMENDED' | 'RECOMMENDED' | 'NEEDS_IMPROVEMENT' | 'NOT_SUITABLE';
  reasons: string[];
  missingFields: string[];
  estimatedSetupTime: string;
  platformSpecificInfo?: {
    logo?: string;
    description?: string;
    websiteUrl?: string;
    supportedCategories?: string[];
    commission?: number;
    features?: string[];
  };
}

export interface ChannelAvailabilityResponse {
  masterProduct: any; // Reference to master product
  channelRecommendations: ChannelRecommendation[];
  supportedChannels: string[];
}

export interface ChannelMappingRequest {
  selectedChannels: string[];
  options?: {
    autoPublish?: boolean;
    validateOnly?: boolean;
    customMappings?: { [channelId: string]: { [fieldName: string]: string } };
  };
}

export interface ChannelMappingResponse {
  mappingResults: ChannelMappingResult[];
  nextStep: string;
  overallSuccess: boolean;
  summary: {
    totalChannels: number;
    successfulMappings: number;
    failedMappings: number;
    averageConfidence: number;
  };
}

export interface ChannelMappingResult {
  channelId: string;
  channelName?: string;
  success: boolean;
  mappedFields: number;
  totalFields: number;
  confidence: number;
  payload?: any;
  validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  joltSpec?: string;
  error?: string;
  warnings?: string[];
  fieldMappings?: FieldMapping[];
  transformations?: Transformation[];
  estimatedPublishTime?: string;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  confidence: number;
  transformationType: 'DIRECT' | 'SEMANTIC' | 'PLATFORM_SPECIFIC' | 'COMPUTED' | 'DEFAULT';
  transformation?: string;
  notes?: string;
}

export interface Transformation {
  type: 'FORMAT' | 'CONVERT' | 'SPLIT' | 'MERGE' | 'LOOKUP' | 'CALCULATE';
  sourceFields: string[];
  targetField: string;
  rule: string;
  parameters?: { [key: string]: any };
}

export interface ChannelConfig {
  channelId: string;
  name: string;
  type: 'MARKETPLACE' | 'SOCIAL' | 'ADVERTISING' | 'ECOMMERCE' | 'COMPARISON';
  status: 'active' | 'inactive' | 'maintenance';
  configuration: {
    apiEndpoint?: string;
    authType?: 'API_KEY' | 'OAUTH' | 'TOKEN';
    credentials?: any;
    rateLimits?: {
      requestsPerMinute: number;
      requestsPerHour: number;
      requestsPerDay: number;
    };
    fieldMappings?: { [field: string]: string };
    defaultValues?: { [field: string]: any };
    requiredFields?: string[];
    optionalFields?: string[];
  };
  features: {
    supportsImages: boolean;
    supportsVariants: boolean;
    supportsInventory: boolean;
    supportsPricing: boolean;
    supportsReviews: boolean;
    supportsBulkOperations: boolean;
    maxImageCount?: number;
    maxVariantCount?: number;
    supportedImageFormats?: string[];
    supportedCurrencies?: string[];
  };
  metadata: {
    logo?: string;
    description?: string;
    websiteUrl?: string;
    documentationUrl?: string;
    supportUrl?: string;
    category: string;
    tags: string[];
    popularity: number;
  };
}

export interface ChannelSchema {
  channelId: string;
  version: string;
  lastUpdated: string;
  schema: {
    type: 'object';
    properties: { [fieldName: string]: FieldSchema };
    required?: string[];
  };
  examples?: any[];
  validationRules?: ValidationRule[];
}

export interface FieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  description?: string;
  required?: boolean;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: FieldSchema;
  properties?: { [key: string]: FieldSchema };
  examples?: any[];
}

export interface ValidationRule {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ChannelSyncStatus {
  channelId: string;
  productId: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'ERROR' | 'CONFLICT';
  lastSyncAt?: string;
  lastErrorAt?: string;
  error?: string;
  syncDetails: {
    fieldsUpdated: string[];
    fieldsSynced: number;
    fieldsSkipped: number;
    conflictingFields?: Array<{
      field: string;
      localValue: any;
      remoteValue: any;
      resolution?: 'LOCAL' | 'REMOTE' | 'MANUAL';
    }>;
  };
  nextSyncAt?: string;
  autoSyncEnabled: boolean;
}

export interface ChannelProduct {
  channelId: string;
  channelProductId: string;
  productUrl?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'ERROR';
  visibility: 'PUBLIC' | 'PRIVATE' | 'HIDDEN';
  lastPublishedAt?: string;
  lastModifiedAt?: string;
  channelSpecificData: any;
  performance?: {
    views: number;
    clicks: number;
    conversions: number;
    revenue: number;
    rating?: number;
    reviewCount?: number;
  };
}

export interface ChannelConflict {
  productId: string;
  channelId: string;
  field: string;
  localValue: any;
  remoteValue: any;
  conflictType: 'VALUE_MISMATCH' | 'FIELD_DELETED' | 'SCHEMA_CHANGE' | 'PERMISSION_DENIED';
  detectedAt: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  autoResolvable: boolean;
  suggestedResolution?: 'KEEP_LOCAL' | 'ACCEPT_REMOTE' | 'MERGE' | 'MANUAL_REVIEW';
}

export interface ChannelPerformanceMetrics {
  channelId: string;
  timeframe: string;
  metrics: {
    totalProducts: number;
    publishedProducts: number;
    draftProducts: number;
    errorProducts: number;
    totalViews: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    conversionRate: number;
    averageOrderValue: number;
    topPerformingProducts: Array<{
      productId: string;
      views: number;
      clicks: number;
      conversions: number;
      revenue: number;
    }>;
    categoryPerformance: Array<{
      category: string;
      products: number;
      views: number;
      clicks: number;
      conversions: number;
      revenue: number;
    }>;
    errorAnalysis: Array<{
      errorType: string;
      count: number;
      affectedProducts: string[];
    }>;
  };
}

export interface ChannelIntegrationHealth {
  channelId: string;
  status: 'HEALTHY' | 'WARNING' | 'ERROR' | 'DISCONNECTED';
  lastHealthCheck: string;
  healthScore: number; // 0-100
  issues: Array<{
    type: 'API_ERROR' | 'RATE_LIMIT' | 'AUTH_FAILURE' | 'SCHEMA_MISMATCH' | 'QUOTA_EXCEEDED';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    affectedFeatures: string[];
    suggestedAction: string;
    occurredAt: string;
  }>;
  metrics: {
    apiSuccessRate: number;
    averageResponseTime: number;
    totalRequests: number;
    failedRequests: number;
    rateLimitHits: number;
  };
  nextHealthCheck: string;
}

export interface ChannelWebhook {
  id: string;
  channelId: string;
  event: string;
  url: string;
  secret?: string;
  active: boolean;
  lastTriggered?: string;
  successCount: number;
  failureCount: number;
  retryPolicy: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
  };
}

export interface ChannelBulkOperation {
  id: string;
  channelId: string;
  operation: 'PUBLISH' | 'UPDATE' | 'DELETE' | 'SYNC';
  productIds: string[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  };
  results?: Array<{
    productId: string;
    success: boolean;
    channelProductId?: string;
    error?: string;
  }>;
  startedAt: string;
  completedAt?: string;
  estimatedCompletion?: string;
  createdBy: string;
}