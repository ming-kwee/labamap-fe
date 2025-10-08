import { useState } from 'react';

export function useProductVariants() {
  // Variants State
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<{ name: string; values: string[] }[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [showVariants, setShowVariants] = useState(false);

  const addVariantOption = (name: string, values: string[]) => {
    const newOption = { name: name.trim(), values: values.filter(v => v.trim()) };
    if (newOption.name && newOption.values.length > 0) {
      setVariantOptions(prev => [...prev, newOption]);
      generateVariantCombinations([...variantOptions, newOption]);
    }
  };

  const removeVariantOption = (index: number) => {
    const newOptions = variantOptions.filter((_, i) => i !== index);
    setVariantOptions(newOptions);
    generateVariantCombinations(newOptions);
  };

  const updateVariantOption = (index: number, name: string, values: string[]) => {
    const newOptions = [...variantOptions];
    newOptions[index] = { name: name.trim(), values: values.filter(v => v.trim()) };
    setVariantOptions(newOptions);
    generateVariantCombinations(newOptions);
  };

  const generateVariantCombinations = (options: { name: string; values: string[] }[], baseSku?: string, basePrice?: number, baseQuantity?: number, baseWeight?: number) => {
    if (options.length === 0) {
      setVariants([]);
      return;
    }

    const combinations: any[] = [];
    const generateCombos = (current: any, optionIndex: number) => {
      if (optionIndex >= options.length) {
        const sku = `${baseSku || 'PROD'}-${Object.values(current).join('-').toUpperCase()}`;
        combinations.push({
          id: `variant-${combinations.length + 1}`,
          sku,
          price: basePrice || 0,
          quantity: baseQuantity || 0,
          options: { ...current },
          barcode: '',
          weight: baseWeight || 0,
          image: ''
        });
        return;
      }

      const option = options[optionIndex];
      option.values.forEach(value => {
        generateCombos({ ...current, [option.name]: value }, optionIndex + 1);
      });
    };

    generateCombos({}, 0);
    setVariants(combinations);
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  };

  const toggleVariantsMode = (enabled: boolean, category?: string) => {
    setHasVariants(enabled);
    setShowVariants(enabled);
    
    if (enabled) {
      // Auto-suggest common variant options based on category
      if (category === 'clothing' && variantOptions.length === 0) {
        addVariantOption('Size', ['XS', 'S', 'M', 'L', 'XL']);
        addVariantOption('Color', ['Black', 'White', 'Blue']);
      } else if (category === 'electronics' && variantOptions.length === 0) {
        addVariantOption('Color', ['Black', 'White', 'Silver']);
        addVariantOption('Storage', ['64GB', '128GB', '256GB']);
      }
    } else {
      setVariantOptions([]);
      setVariants([]);
    }
  };

  // Regenerate variants when form data changes
  const updateVariantsFromFormData = (sku: string, price: number, quantity?: number, weight?: number) => {
    if (variantOptions.length > 0) {
      generateVariantCombinations(variantOptions, sku, price, quantity, weight);
    }
  };

  return {
    // State
    hasVariants,
    variantOptions,
    variants,
    showVariants,
    
    // Actions
    addVariantOption,
    removeVariantOption,
    updateVariantOption,
    updateVariant,
    toggleVariantsMode,
    updateVariantsFromFormData,
    generateVariantCombinations
  };
}