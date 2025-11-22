/**
 * Brand Service
 * CRUD operations for product brands
 */

import { apiClient } from '../client';
import { API_CONFIG } from '../config';
import { Brand, ApiResponse } from '../types';

export class BrandService {
  /**
   * Get all brands
   */
  async getBrands(): Promise<ApiResponse<Brand[]>> {
    return apiClient.get<Brand[]>(API_CONFIG.ENDPOINTS.BRANDS);
  }

  /**
   * Get brand by ID
   */
  async getBrand(id: string): Promise<ApiResponse<Brand>> {
    return apiClient.get<Brand>(`${API_CONFIG.ENDPOINTS.BRANDS}/${id}`);
  }

  /**
   * Create brand
   */
  async createBrand(brand: Omit<Brand, 'id'>): Promise<ApiResponse<Brand>> {
    return apiClient.post<Brand>(API_CONFIG.ENDPOINTS.BRANDS, brand);
  }

  /**
   * Update brand
   */
  async updateBrand(id: string, updates: Partial<Brand>): Promise<ApiResponse<Brand>> {
    return apiClient.put<Brand>(`${API_CONFIG.ENDPOINTS.BRANDS}/${id}`, updates);
  }

  /**
   * Delete brand
   */
  async deleteBrand(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(`${API_CONFIG.ENDPOINTS.BRANDS}/${id}`);
  }
}

export const brandService = new BrandService();