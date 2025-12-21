/**
 * Product Field Handler Hook
 * Manages field changes with special handling for category, variants, etc.
 */

import React, { useCallback, useRef } from 'react';

export interface UseProductFieldHandlerOptions {
  formData: Record<string, any>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onCategoryChange?: (category: string) => void;
  onVariantConfigChange?: (config: any) => void;
}

export interface UseProductFieldHandlerReturn {
  handleFieldChange: (fieldName: string, value: any) => void;
  handleVariantConfiguratorChange: (config: any) => void;
  getUserSelectedCategory: () => string | null;
}

/**
 * Custom hook for handling field changes
 */
export function useProductFieldHandler(
  options: UseProductFieldHandlerOptions
): UseProductFieldHandlerReturn {
  const { formData, setFormData, onCategoryChange, onVariantConfigChange } = options;

  // Track user's category selection to prevent unwanted overrides
  const userSelectedCategory = useRef<string | null>(null);

  /**
   * Central field change handler
   * @param fieldName - Name of the field being changed
   * @param value - New field value
   */
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    console.log(`[Field Handler] Field changed: ${fieldName}`, value);

    // Special handling for category changes
    if (fieldName === 'category') {
      const newCategory = String(value).toLowerCase().trim();

      console.log(`[Field Handler] ═══════════════════════════════════════`);
      console.log(`[Field Handler] 📂 CATEGORY CHANGE DETECTED`);
      console.log(`[Field Handler] New category: '${newCategory}'`);
      console.log(`[Field Handler] Previous category: '${formData.category}'`);
      console.log(`[Field Handler] Has onCategoryChange callback: ${!!onCategoryChange}`);

      // Always update form data first
      setFormData(prev => ({
        ...prev,
        category: newCategory
      }));

      // Track that user explicitly selected this category
      userSelectedCategory.current = newCategory;
      console.log(`[Field Handler] ✓ Form data updated with category: '${newCategory}'`);

      // Notify parent component to reload schema (even if same - might be first selection)
      if (onCategoryChange && newCategory) {
        console.log(`[Field Handler] ✓ Calling onCategoryChange('${newCategory}') to reload schema`);
        onCategoryChange(newCategory);
      } else {
        console.log(`[Field Handler] ✗ Cannot reload schema - missing callback or empty category`);
      }

      console.log(`[Field Handler] ═══════════════════════════════════════`);

      return;
    }

    // Special handling for hasVariants checkbox
    if (fieldName === 'hasVariants') {
      console.log(`[Field Handler] hasVariants changed to: ${value}`);

      setFormData(prev => {
        const updated: Record<string, any> = { ...prev, hasVariants: value };

        // If enabling variants and we have config, ensure it's in formData
        if (value && (prev as any).variantConfigurator) {
          updated.variantConfigurator = (prev as any).variantConfigurator;
        }

        // If disabling variants, optionally clear variant configurator
        // (Keeping it for now in case user re-enables)

        return updated;
      });

      return;
    }

    // Default field change handling
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  }, [formData.category, setFormData, onCategoryChange]);

  /**
   * Special handler for variant configurator changes
   * @param config - Variant configuration object
   */
  const handleVariantConfiguratorChange = useCallback((config: any) => {
    console.log('[Field Handler] Variant configurator changed:', config);

    setFormData(prev => ({
      ...prev,
      variantConfigurator: config,
      hasVariants: true // Auto-enable hasVariants when configurator changes
    }));

    if (onVariantConfigChange) {
      onVariantConfigChange(config);
    }
  }, [setFormData, onVariantConfigChange]);

  /**
   * Trigger category reload when hasVariants changes
   * This ensures variant dimension fields are loaded
   */
  React.useEffect(() => {
    const category = formData.category;
    console.log('[Field Handler] useEffect triggered:', {
      hasVariants: formData.hasVariants,
      category,
      hasOnCategoryChange: !!onCategoryChange
    });

    if (formData.hasVariants && category && onCategoryChange) {
      console.log('[Field Handler] ✓ Conditions met - Reloading schema for category:', category);
      onCategoryChange(category);
    } else {
      console.log('[Field Handler] ✗ Conditions not met - Skipping schema reload');
    }
  }, [formData.hasVariants, formData.category, onCategoryChange]);

  /**
   * Gets the user's explicitly selected category
   * @returns Category selected by user or null
   */
  const getUserSelectedCategory = useCallback((): string | null => {
    return userSelectedCategory.current;
  }, []);

  return {
    handleFieldChange,
    handleVariantConfiguratorChange,
    getUserSelectedCategory
  };
}
