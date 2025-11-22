import { 
  BulkEditRequest, 
  BulkEditResponse, 
  BulkEditResult,
  BulkEditOperation,
  BulkChannelSyncRequest,
  BulkChannelSyncResponse,
  ProductChannelSyncResult,
  BulkOperationTemplate
} from '@/types/bulk';

/**
 * Bulk Operations Service - Handles mass product management and channel synchronization
 * Supports parallel processing for enterprise-scale operations
 */
export class BulkOperationsService {
  private baseUrl = '/api/v1/products/bulk';

  /**
   * Execute bulk edit operations on multiple products
   */
  async bulkEditProducts(request: BulkEditRequest): Promise<BulkEditResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute bulk edit: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing bulk edit:', error);
      throw error;
    }
  }

  /**
   * Bulk synchronize products to multiple channels
   */
  async bulkSyncToChannels(request: BulkChannelSyncRequest): Promise<BulkChannelSyncResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/channels/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute bulk sync: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing bulk sync:', error);
      throw error;
    }
  }

  /**
   * Bulk delete products
   */
  async bulkDeleteProducts(productIds: string[]): Promise<BulkDeleteResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productIds }),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute bulk delete: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing bulk delete:', error);
      throw error;
    }
  }

  /**
   * Bulk duplicate products
   */
  async bulkDuplicateProducts(productIds: string[], options?: BulkDuplicateOptions): Promise<BulkDuplicateResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productIds, ...options }),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute bulk duplicate: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing bulk duplicate:', error);
      throw error;
    }
  }

  /**
   * Bulk export products
   */
  async bulkExportProducts(productIds: string[], format: 'CSV' | 'JSON' | 'XLSX'): Promise<BulkExportResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productIds, format }),
      });

      if (!response.ok) {
        throw new Error(`Failed to execute bulk export: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing bulk export:', error);
      throw error;
    }
  }

  /**
   * Bulk import products from file
   */
  async bulkImportProducts(file: File, options?: BulkImportOptions): Promise<BulkImportResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (options) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await fetch(`${this.baseUrl}/import`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to execute bulk import: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error executing bulk import:', error);
      throw error;
    }
  }

  /**
   * Get bulk operation status
   */
  async getBulkOperationStatus(operationId: string): Promise<BulkOperationStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/operations/${operationId}/status`);
      
      if (!response.ok) {
        throw new Error(`Failed to get operation status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting operation status:', error);
      throw error;
    }
  }

  /**
   * Cancel bulk operation
   */
  async cancelBulkOperation(operationId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/operations/${operationId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel operation: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error cancelling operation:', error);
      throw error;
    }
  }

  /**
   * Get bulk operation history
   */
  async getBulkOperationHistory(limit?: number): Promise<BulkOperationHistoryEntry[]> {
    try {
      const params = limit ? `?limit=${limit}` : '';
      const response = await fetch(`${this.baseUrl}/operations/history${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get operation history: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting operation history:', error);
      throw error;
    }
  }

  /**
   * Validate bulk operation before execution
   */
  async validateBulkOperation(request: any): Promise<BulkValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      return await response.json();
    } catch (error) {
      console.error('Error validating bulk operation:', error);
      throw error;
    }
  }

  /**
   * Get bulk operation templates
   */
  async getBulkOperationTemplates(): Promise<BulkOperationTemplate[]> {
    try {
      const response = await fetch(`${this.baseUrl}/templates`);
      
      if (!response.ok) {
        throw new Error(`Failed to get operation templates: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting operation templates:', error);
      // Return mock data for development
      return [
        {
          id: 'template-1',
          name: 'Price Update - 10% Increase',
          description: 'Increase all product prices by 10%',
          type: 'PRICE_UPDATE',
          operations: [
            {
              field: 'price',
              operation: 'MULTIPLY',
              value: '1.1'
            }
          ],
          selectionCriteria: {
            includeIds: [],
            excludeIds: [],
            filters: []
          },
          channelIds: ['shopify', 'amazon'],
          tags: ['pricing', 'increase'],
          isPublic: true,
          createdBy: 'admin',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          usageCount: 5,
          lastUsed: new Date().toISOString(),
          version: 1
        },
        {
          id: 'template-2',
          name: 'Inventory Sync All Channels',
          description: 'Sync inventory levels across all sales channels',
          type: 'INVENTORY_SYNC',
          operations: [
            {
              field: 'inventory.quantity',
              operation: 'SYNC',
              value: 'source'
            }
          ],
          selectionCriteria: {
            includeIds: [],
            excludeIds: [],
            filters: [
              {
                field: 'status',
                operator: 'equals',
                value: 'active'
              }
            ]
          },
          channelIds: ['shopify', 'amazon', 'google', 'facebook'],
          tags: ['inventory', 'sync'],
          isPublic: true,
          createdBy: 'admin',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          usageCount: 12,
          lastUsed: new Date().toISOString(),
          version: 1
        }
      ];
    }
  }

  /**
   * Save bulk operation template
   */
  async saveBulkOperationTemplate(template: Omit<BulkOperationTemplate, 'id' | 'createdAt'>): Promise<BulkOperationTemplate> {
    try {
      const response = await fetch(`${this.baseUrl}/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(template),
      });

      if (!response.ok) {
        throw new Error(`Failed to save operation template: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error saving operation template:', error);
      throw error;
    }
  }
}

// Additional types for bulk operations
export interface BulkDeleteResponse {
  totalProducts: number;
  successfulDeletes: number;
  results: Array<{
    productId: string;
    success: boolean;
    error?: string;
  }>;
}

export interface BulkDuplicateOptions {
  namePrefix?: string;
  nameSuffix?: string;
  clearInventory?: boolean;
  updateSku?: boolean;
}

export interface BulkDuplicateResponse {
  totalProducts: number;
  successfulDuplicates: number;
  results: Array<{
    originalProductId: string;
    newProductId?: string;
    success: boolean;
    error?: string;
  }>;
}

export interface BulkExportResponse {
  downloadUrl: string;
  fileName: string;
  totalRecords: number;
  expiresAt: string;
}

export interface BulkImportOptions {
  skipDuplicates?: boolean;
  updateExisting?: boolean;
  validationMode?: 'STRICT' | 'LENIENT';
  fieldMappings?: { [key: string]: string };
}

export interface BulkImportResponse {
  operationId: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errors: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
}

export interface BulkOperationStatus {
  operationId: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  };
  startedAt: string;
  completedAt?: string;
  estimatedTimeRemaining?: number;
  errors?: string[];
}

export interface BulkOperationHistoryEntry {
  operationId: string;
  type: string;
  status: string;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface BulkValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedDuration: number;
  resourceRequirements: {
    memoryMb: number;
    processingTime: number;
  };
}


// Singleton instance
export const bulkOperationsService = new BulkOperationsService();