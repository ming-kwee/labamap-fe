/**
 * Category Service
 * CRUD operations for product categories
 */

import { apiClient } from '../client';
import { API_CONFIG } from '../config';
import { Category, ApiResponse } from '../types';

export class CategoryService {
  /**
   * Get all categories
   */
  async getCategories(): Promise<ApiResponse<Category[]>> {
    return apiClient.get<Category[]>(API_CONFIG.ENDPOINTS.CATEGORIES);
  }

  /**
   * Get category by ID
   */
  async getCategory(id: string): Promise<ApiResponse<Category>> {
    return apiClient.get<Category>(`${API_CONFIG.ENDPOINTS.CATEGORIES}/${id}`);
  }

  /**
   * Create category
   */
  async createCategory(category: Omit<Category, 'id'>): Promise<ApiResponse<Category>> {
    return apiClient.post<Category>(API_CONFIG.ENDPOINTS.CATEGORIES, category);
  }

  /**
   * Update category
   */
  async updateCategory(id: string, updates: Partial<Category>): Promise<ApiResponse<Category>> {
    return apiClient.put<Category>(`${API_CONFIG.ENDPOINTS.CATEGORIES}/${id}`, updates);
  }

  /**
   * Delete category
   */
  async deleteCategory(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete<void>(`${API_CONFIG.ENDPOINTS.CATEGORIES}/${id}`);
  }
}

export const categoryService = new CategoryService();