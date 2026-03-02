/**
 * Field Handler Hook
 * Manages field changes with special handling for category, variants, etc.
 */

import React, { useCallback, useRef } from 'react';

export interface UseFieldHandlerOptions {
  formData: Record<string, any>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onCategoryChange?: (category: string) => void;
  onVariantConfigChange?: (config: any) => void;
}

export interface UseFieldHandlerReturn {
  handleFieldChange: (fieldName: string, value: any) => void;
  handleVariantConfiguratorChange: (config: any) => void;
  getUserSelectedCategory: () => string | null;
}

export function useFieldHandler(options: UseFieldHandlerOptions): UseFieldHandlerReturn {
  const { formData, setFormData, onCategoryChange, onVariantConfigChange } = options;

  const userSelectedCategory = useRef<string | null>(null);

  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    if (fieldName === 'category') {
      const newCategory = String(value).toLowerCase().trim();
      setFormData(prev => ({ ...prev, category: newCategory }));
      userSelectedCategory.current = newCategory;
      if (onCategoryChange && newCategory) {
        onCategoryChange(newCategory);
      }
      return;
    }

    if (fieldName === 'hasVariants') {
      setFormData(prev => {
        const updated: Record<string, any> = { ...prev, hasVariants: value };
        if (value && (prev as any).variantConfigurator) {
          updated.variantConfigurator = (prev as any).variantConfigurator;
        }
        return updated;
      });
      return;
    }

    setFormData(prev => ({ ...prev, [fieldName]: value }));
  }, [formData.category, setFormData, onCategoryChange]);

  const handleVariantConfiguratorChange = useCallback((config: any) => {
    setFormData(prev => ({
      ...prev,
      variantConfigurator: config,
      hasVariants: true
    }));

    if (onVariantConfigChange) {
      onVariantConfigChange(config);
    }
  }, [setFormData, onVariantConfigChange]);

  React.useEffect(() => {
    const category = formData.category;
    if (formData.hasVariants && category && onCategoryChange) {
      onCategoryChange(category);
    }
  }, [formData.hasVariants, formData.category, onCategoryChange]);

  const getUserSelectedCategory = useCallback((): string | null => {
    return userSelectedCategory.current;
  }, []);

  return {
    handleFieldChange,
    handleVariantConfiguratorChange,
    getUserSelectedCategory
  };
}
