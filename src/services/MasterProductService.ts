import { MasterProduct, CreateMasterProductRequest, ProductCreationResponse, ValidationResult } from '@/types/product';
import { log } from 'node:console';

/**
 * Master Product Service - Backend API Integration
 * Handles product creation, validation, and management
 */
export class MasterProductService {
  private baseUrl = 'http://localhost:8888/labamap/api/v1/master-product'; //'/api/v1/products';

  /**
   * Create a new master product
   */
  async createMasterProduct(request: CreateMasterProductRequest): Promise<ProductCreationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to create product: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating master product:', error);
      throw error;
    }
  }

  /**
   * Validate master product data
   */
  async validateMasterProduct(request: CreateMasterProductRequest): Promise<ValidationResult> {
    try {
      console.log('test', request)
      const response = await fetch(`${this.baseUrl}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      return await response.json();
    } catch (error) {
      console.error('Error validating master product:', error);
      throw error;
    }
  }

  /**
   * Get field definitions for dynamic form rendering
   */
  async getFieldDefinitions(): Promise<FieldDefinition[]> {
    try {
      console.log("test", `${this.baseUrl}/field-definitions`);
      const response = await fetch(`${this.baseUrl}/field-definitions`);

      return await response.json();
    } catch (error) {
      console.error('Error loading field definitions:', error);
      throw error;
    }
  }

  /**
   * Get user's connected channels only
   */
  async getUserConnectedChannels(userId?: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/../user/connected-channels`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Fallback to mock data if API not available
        console.warn('Connected channels API not available, using mock data');
        return ['shopify', 'amazon']; // Mock connected channels
      }

      return await response.json();
    } catch (error) {
      console.error('Error loading user connected channels:', error);
      // Fallback to mock data
      return ['shopify', 'amazon']; // Mock connected channels
    }
  }

  /**
   * Get category configuration for smart form
   */
  async getCategoryConfiguration(categoryName: string): Promise<CategoryConfiguration> {
    try {
      const response = await fetch(`${this.baseUrl}/../category-configuration/${categoryName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch category configuration: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error loading category configuration:', error);
      throw error;
    }
  }

  /**
   * Update master product
   */
  async updateMasterProduct(productId: string, updates: Partial<MasterProduct>): Promise<MasterProduct> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update product: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating master product:', error);
      throw error;
    }
  }

  /**
   * Get master product by ID
   */
  async getMasterProduct(productId: string): Promise<MasterProduct> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get product: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting master product:', error);
      throw error;
    }
  }

  /**
   * Delete master product
   */
  async deleteMasterProduct(productId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/${productId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete product: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting master product:', error);
      throw error;
    }
  }

  /**
   * Search products
   */
  async searchProducts(query: string, filters?: any): Promise<MasterProduct[]> {
    try {
      const params = new URLSearchParams();
      params.append('q', query);
      
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          params.append(key, String(value));
        });
      }

      const response = await fetch(`${this.baseUrl}/search?${params.toString()}`);
      return await response.json();
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }
}

export interface FieldDefinition {
  fieldName: string;
  description: string;
  dataType: string;
  required: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface CategoryConfiguration {
  categoryName: string;
  categoryPath?: string;
  requiredFields: string[];
  suggestedFields: string[];
  optionalFields?: string[];
  validationRules: { [key: string]: any };
  fieldSuggestions?: { [key: string]: string };
  autoPopulateFields?: { [key: string]: any };
  channelOverrides?: { [key: string]: any };
  confidenceScore?: number;
  source?: string;
  lastUpdated?: string;
}

// Singleton instance
export const masterProductService = new MasterProductService();