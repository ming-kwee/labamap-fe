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
  // Tracks the previous value of hasVariants so the effect below can detect the
  // specific false → true transition. Initialized to undefined (not false) so the
  // mount run is always skipped — undefined === false is never true.
  const prevHasVariantsRef = useRef<boolean | undefined>(undefined);

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
  }, [setFormData, onCategoryChange]);

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

  // Reload the category schema when the user enables variants while a category is already
  // selected — variant-aware category fields may differ from the non-variant schema.
  // Guards:
  //   - Mount is always skipped (prevHasVariantsRef starts as undefined, not false)
  //   - Only fires on the explicit false → true transition of hasVariants
  //   - onCategoryChange recreation does not trigger a spurious call because
  //     prevHasVariantsRef tracks hasVariants, not onCategoryChange
  //   - Category changes do not trigger a call (hasVariants was already true → no transition)
  React.useEffect(() => {
    const hasVariants = !!formData.hasVariants;
    const category = formData.category;

    const didEnableVariants =
      prevHasVariantsRef.current === false && hasVariants === true;

    // Always update the ref before any early return so the next run has the correct baseline
    prevHasVariantsRef.current = hasVariants;

    if (didEnableVariants && category && onCategoryChange) {
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
