/**
 * Bulk Operations Types
 * For mass product management and channel synchronization
 */

export interface BulkEditOperation {
  fieldName: string;
  operation: 'SET' | 'APPEND' | 'PREPEND' | 'MULTIPLY' | 'INCREMENT' | 'CLEAR' | 'REPLACE';
  value: any;
  condition?: {
    field: string;
    operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS' | 'GREATER_THAN' | 'LESS_THAN' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
    value: any;
  };
  options?: {
    caseSensitive?: boolean;
    regex?: boolean;
    preserveFormatting?: boolean;
  };
}

export interface BulkEditRequest {
  productIds: string[];
  operations: BulkEditOperation[];
  options?: {
    validateOnly?: boolean;
    continueOnError?: boolean;
    batchSize?: number;
    maxParallel?: number;
  };
}

export interface BulkEditResponse {
  operationId: string;
  totalProducts: number;
  successfulUpdates: number;
  failedUpdates: number;
  results: BulkEditResult[];
  summary: {
    operationsApplied: number;
    averageProcessingTime: number;
    totalProcessingTime: number;
  };
}

export interface BulkEditResult {
  productId: string;
  success: boolean;
  appliedOperations: string[];
  failedOperations: string[];
  errors?: string[];
  warnings?: string[];
  fieldsModified: number;
  processingTime: number;
}

export interface BulkChannelSyncRequest {
  productIds: string[];
  channelIds: string[];
  options?: {
    forceUpdate?: boolean;
    validateOnly?: boolean;
    autoResolveConflicts?: boolean;
    batchSize?: number;
    maxParallel?: number;
    syncMode?: 'INCREMENTAL' | 'FULL';
  };
}

export interface BulkChannelSyncResponse {
  operationId: string;
  totalOperations: number;
  successfulSyncs: number;
  failedSyncs: number;
  results: ProductChannelSyncResult[];
  summary: {
    channelsProcessed: number;
    productsProcessed: number;
    averageConfidence: number;
    totalSyncTime: number;
  };
}

export interface ProductChannelSyncResult {
  productId: string;
  channelId: string;
  success: boolean;
  mappingConfidence?: number;
  publishedFields?: number;
  totalFields?: number;
  channelProductId?: string;
  syncType: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'ERROR';
  conflicts?: Array<{
    field: string;
    localValue: any;
    remoteValue: any;
    resolution: 'LOCAL' | 'REMOTE' | 'MERGED' | 'SKIPPED';
  }>;
  error?: string;
  warnings?: string[];
  processingTime: number;
}

export interface BulkSelectionCriteria {
  type: 'SPECIFIC_PRODUCTS' | 'FILTER_BASED' | 'CATEGORY' | 'BRAND' | 'TAG' | 'CUSTOM_QUERY';
  productIds?: string[];
  filters?: {
    category?: string[];
    brand?: string[];
    tags?: string[];
    status?: string[];
    priceRange?: { min: number; max: number };
    stockStatus?: string[];
    createdDateRange?: { from: string; to: string };
    lastModifiedRange?: { from: string; to: string };
    publishedToChannels?: string[];
    notPublishedToChannels?: string[];
    hasImages?: boolean;
    hasVariants?: boolean;
    customAttributes?: Array<{
      name: string;
      operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS';
      value: any;
    }>;
  };
  customQuery?: string;
  limit?: number;
}

export interface BulkOperationPreview {
  criteria: BulkSelectionCriteria;
  matchingProducts: number;
  sampleProducts: Array<{
    id: string;
    sku: string;
    name: string;
    currentValues: { [field: string]: any };
    previewValues: { [field: string]: any };
    changes: string[];
  }>;
  estimatedImpact: {
    fieldsToModify: string[];
    productsAffected: number;
    channelsAffected: string[];
    estimatedDuration: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    potentialIssues: string[];
  };
}

export interface BulkOperationSchedule {
  scheduleType: 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING';
  scheduledAt?: string;
  timezone?: string;
  recurringPattern?: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
    maxOccurrences?: number;
  };
  notifications?: {
    onStart?: boolean;
    onComplete?: boolean;
    onError?: boolean;
    recipients: string[];
  };
}

export interface BulkOperationTemplate {
  id: string;
  name: string;
  description: string;
  type: 'PRODUCT_EDIT' | 'CHANNEL_SYNC' | 'PRICE_UPDATE' | 'INVENTORY_SYNC' | 'CATEGORY_CHANGE' | 'CUSTOM';
  operations: BulkEditOperation[];
  selectionCriteria?: BulkSelectionCriteria;
  channelIds?: string[];
  tags: string[];
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  lastModified: string;
  usageCount: number;
  lastUsed?: string;
  version: number;
  changelog?: Array<{
    version: number;
    changes: string;
    modifiedBy: string;
    modifiedAt: string;
  }>;
}

export interface BulkOperationQueue {
  id: string;
  name?: string;
  status: 'WAITING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  type: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  progress: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    percentage: number;
    currentItem?: string;
    estimatedTimeRemaining?: number;
    itemsPerSecond?: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    peakMemoryUsage: number;
    averageCpuUsage: number;
  };
  dependencies?: string[];
  dependents?: string[];
  retryPolicy?: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
    retryOnFailures: string[];
  };
}

export interface BulkOperationLog {
  id: string;
  operationId: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: any;
  productId?: string;
  channelId?: string;
  operation?: string;
  duration?: number;
  stackTrace?: string;
}

export interface BulkOperationMetrics {
  operationId: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  throughput: {
    itemsPerSecond: number;
    peakItemsPerSecond: number;
    averageItemsPerSecond: number;
  };
  performance: {
    memoryUsage: {
      initial: number;
      peak: number;
      final: number;
      average: number;
    };
    cpuUsage: {
      average: number;
      peak: number;
    };
    networkUsage: {
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      averageResponseTime: number;
      totalDataTransferred: number;
    };
  };
  errorAnalysis: {
    totalErrors: number;
    errorsByType: { [type: string]: number };
    errorsByProduct: { [productId: string]: string[] };
    errorsByChannel: { [channelId: string]: string[] };
    mostCommonErrors: Array<{
      error: string;
      count: number;
      affectedItems: string[];
    }>;
  };
  successMetrics: {
    totalSuccess: number;
    successRate: number;
    partialSuccessCount: number;
    completeSuccessCount: number;
  };
}

export interface BulkOperationReport {
  operationId: string;
  operationType: string;
  executedBy: string;
  executedAt: string;
  summary: {
    totalItems: number;
    successfulItems: number;
    failedItems: number;
    skippedItems: number;
    duration: number;
    successRate: number;
  };
  details: {
    itemResults: Array<{
      itemId: string;
      itemType: 'PRODUCT' | 'CHANNEL' | 'OPERATION';
      status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PARTIAL';
      changes: string[];
      errors: string[];
      warnings: string[];
      processingTime: number;
    }>;
    metrics: BulkOperationMetrics;
    logs: BulkOperationLog[];
  };
  exportFormats?: Array<{
    format: 'PDF' | 'CSV' | 'XLSX' | 'JSON';
    downloadUrl: string;
    expiresAt: string;
  }>;
}