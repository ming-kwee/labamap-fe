/**
 * Form State Hook
 * Manages form data and UI state (sections, preview, etc.)
 */

import { useState, useCallback } from 'react';
import { DynamicFormData } from '../../types/form-schema';

export type ViewLevel = 'essential' | 'standard' | 'full';

export interface UseFormStateOptions {
  initialData?: Partial<DynamicFormData>;
  organizationDefaultCategory?: string;
}

export interface UseFormStateReturn {
  formData: DynamicFormData;
  setFormData: React.Dispatch<React.SetStateAction<DynamicFormData>>;
  expandedSections: Set<string>;
  setExpandedSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSection: (sectionKey: string) => void;
  expandAllSections: () => void;
  collapseAllSections: () => void;
  showJsonPreview: boolean;
  setShowJsonPreview: (show: boolean) => void;
  resetForm: () => void;
  updateFormField: (fieldName: string, value: any) => void;
  viewLevel: ViewLevel;
  setViewLevel: React.Dispatch<React.SetStateAction<ViewLevel>>;
  promoteToStandard: () => void;
}

export function useFormState(options: UseFormStateOptions = {}): UseFormStateReturn {
  const { initialData = {}, organizationDefaultCategory = 'general' } = options;

  const [formData, setFormData] = useState<DynamicFormData>(() => ({
    category: initialData.category || organizationDefaultCategory,
    ...initialData
  }));

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['product-info'])
  );
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [viewLevel, setViewLevel] = useState<ViewLevel>('essential');

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

  const expandAllSections = useCallback(() => {
    setExpandedSections(new Set([
      'basic-info', 'pricing', 'media', 'content',
      'shipping', 'seo', 'taxonomy', 'variants'
    ]));
  }, []);

  const collapseAllSections = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  const promoteToStandard = useCallback(() => {
    setViewLevel((prev) => (prev === 'essential' ? 'standard' : prev));
  }, []);

  const resetForm = useCallback(() => {
    setFormData({ category: organizationDefaultCategory, ...initialData });
    setExpandedSections(new Set(['product-info']));
    setShowJsonPreview(false);
    setViewLevel('essential');
  }, [initialData, organizationDefaultCategory]);

  const updateFormField = useCallback((fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  }, []);

  return {
    formData,
    setFormData,
    expandedSections,
    setExpandedSections,
    toggleSection,
    expandAllSections,
    collapseAllSections,
    showJsonPreview,
    setShowJsonPreview,
    resetForm,
    updateFormField,
    viewLevel,
    setViewLevel,
    promoteToStandard,
  };
}
