/**
 * Product Form State Hook
 * Manages form data and UI state (sections, preview, etc.)
 */

import { useState, useCallback, useEffect } from 'react';
import { DynamicFormData } from '../types/dynamicForm';

export interface UseProductFormStateOptions {
  initialData?: Partial<DynamicFormData>;
  organizationDefaultCategory?: string;
}

export interface UseProductFormStateReturn {
  formData: DynamicFormData;
  setFormData: React.Dispatch<React.SetStateAction<DynamicFormData>>;
  expandedSections: Set<string>;
  toggleSection: (sectionKey: string) => void;
  expandAllSections: () => void;
  collapseAllSections: () => void;
  showJsonPreview: boolean;
  setShowJsonPreview: (show: boolean) => void;
  resetForm: () => void;
  updateFormField: (fieldName: string, value: any) => void;
}

/**
 * Custom hook for managing product form state
 */
export function useProductFormState(
  options: UseProductFormStateOptions = {}
): UseProductFormStateReturn {
  const { initialData = {}, organizationDefaultCategory = 'general' } = options;

  // Form data state
  const [formData, setFormData] = useState<DynamicFormData>(() => ({
    category: initialData.category || organizationDefaultCategory,
    ...initialData
  }));

  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['basic-info', 'pricing'])
  );
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  /**
   * Toggles a section's expanded/collapsed state
   * @param sectionKey - Section identifier
   */
  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionKey)) {
        newSet.delete(sectionKey);
      } else {
        newSet.add(sectionKey);
      }
      return newSet;
    });
  }, []);

  /**
   * Expands all sections
   */
  const expandAllSections = useCallback(() => {
    // Get all section keys from somewhere - for now just add common ones
    setExpandedSections(new Set([
      'basic-info',
      'pricing',
      'media',
      'content',
      'shipping',
      'seo',
      'taxonomy',
      'variants'
    ]));
  }, []);

  /**
   * Collapses all sections
   */
  const collapseAllSections = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  /**
   * Resets form to initial state
   */
  const resetForm = useCallback(() => {
    setFormData({
      category: organizationDefaultCategory,
      ...initialData
    });
    setExpandedSections(new Set(['basic-info', 'pricing']));
    setShowJsonPreview(false);
  }, [initialData, organizationDefaultCategory]);

  /**
   * Updates a single form field
   * @param fieldName - Field name
   * @param value - New value
   */
  const updateFormField = useCallback((fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  }, []);

  // Apply schema default values when schema changes
  useEffect(() => {
    // This will be handled by the parent component
    // Just keeping the structure here
  }, []);

  return {
    formData,
    setFormData,
    expandedSections,
    toggleSection,
    expandAllSections,
    collapseAllSections,
    showJsonPreview,
    setShowJsonPreview,
    resetForm,
    updateFormField
  };
}
