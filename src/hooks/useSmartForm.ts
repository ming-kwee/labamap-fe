import { useState, useEffect } from 'react';
import { masterProductService, CategoryConfiguration } from '@/services/MasterProductService';

export function useSmartForm(category?: string) {
  // Smart Form State
  const [categoryRequiredFields, setCategoryRequiredFields] = useState<string[]>([]);
  const [categorySuggestedFields, setCategorySuggestedFields] = useState<string[]>([]);
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, string>>({});
  const [showCategorySpecificFields, setShowCategorySpecificFields] = useState(false);
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Category-based field adaptation
  useEffect(() => {
    if (category) {
      adaptFormToCategory(category);
    }
  }, [category]);

  const adaptFormToCategory = async (selectedCategory: string) => {
    try {
      setIsLoading(true);
      
      const config = await getCategoryConfiguration(selectedCategory);
      
      setCategoryConfig(config);
      setCategoryRequiredFields(config.requiredFields || []);
      setCategorySuggestedFields(config.suggestedFields || []);
      setFieldSuggestions(config.fieldSuggestions || {});
      
      // Generate additional suggestions if API doesn't provide them
      const additionalSuggestions = generateCategorySuggestions(selectedCategory);
      setFieldSuggestions(prev => ({ ...additionalSuggestions, ...prev }));
      
      setShowCategorySpecificFields(true);
    } catch (error) {
      console.error('Error adapting form to category:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryConfiguration = async (categoryName: string): Promise<CategoryConfiguration> => {
    try {
      const config = await masterProductService.getCategoryConfiguration(categoryName);
      
      return {
        categoryName: config.categoryName || categoryName,
        requiredFields: config.requiredFields || [],
        suggestedFields: config.suggestedFields || [],
        validationRules: config.validationRules || {},
        fieldSuggestions: config.fieldSuggestions || {},
        autoPopulateFields: config.autoPopulateFields || {},
        channelOverrides: config.channelOverrides || {},
        confidenceScore: config.confidenceScore,
        source: config.source,
        lastUpdated: config.lastUpdated
      };
    } catch (error) {
      console.error('Error fetching category configuration:', error);
      return getFallbackCategoryConfiguration(categoryName);
    }
  };

  const getFallbackCategoryConfiguration = (categoryName: string): CategoryConfiguration => {
    const fallbackConfigs: Record<string, Partial<CategoryConfiguration>> = {
      'electronics': {
        requiredFields: ['brand', 'weight'],
        suggestedFields: ['model', 'warranty'],
        validationRules: {
          weight: { min: 0.1, max: 50 },
          price: { min: 1, max: 100000 }
        }
      },
      'clothing': {
        requiredFields: ['brand', 'weight'],
        suggestedFields: ['material', 'color'],
        validationRules: {
          weight: { min: 0.01, max: 10 }
        }
      },
      'books': {
        requiredFields: ['brand', 'weight'],
        suggestedFields: ['barcode'],
        validationRules: {}
      }
    };
    
    const fallback = fallbackConfigs[categoryName] || { 
      requiredFields: ['brand'], 
      suggestedFields: [], 
      validationRules: {} 
    };

    return {
      categoryName,
      requiredFields: fallback.requiredFields || [],
      suggestedFields: fallback.suggestedFields || [],
      validationRules: fallback.validationRules || {},
      fieldSuggestions: {},
      autoPopulateFields: {},
      channelOverrides: {},
      source: 'fallback'
    };
  };

  const generateCategorySuggestions = (categoryName: string) => {
    const suggestions: Record<string, string> = {};
    
    suggestions.name = 'Enter a descriptive product name';
    suggestions.description = 'Provide detailed product information';
    
    if (categoryName === 'electronics') {
      suggestions.weight = 'Weight is typically required for electronics';
    } else if (categoryName === 'clothing') {
      suggestions.weight = 'Weight helps with shipping calculations';
    } else if (categoryName === 'books') {
      suggestions.weight = 'Weight affects shipping costs';
    }
    
    return suggestions;
  };

  const getFieldEnhancement = (fieldName: string, selectedCategory: string) => {
    const isRequired = categoryRequiredFields.includes(fieldName);
    const isSuggested = categorySuggestedFields.includes(fieldName);
    const suggestion = fieldSuggestions[fieldName];
    
    let relevance: 'high' | 'medium' | 'low' = 'low';
    if (isRequired) relevance = 'high';
    else if (isSuggested) relevance = 'medium';
    
    let className = '';
    if (relevance === 'high') className = 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
    else if (relevance === 'medium') className = 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    
    return {
      relevance,
      required: isRequired,
      placeholder: suggestion,
      helper: suggestion,
      className
    };
  };

  const handleSmartFieldChange = (fieldName: string, value: any, handleFieldChange: (field: string, val: any) => void) => {
    handleFieldChange(fieldName, value);
    applyFieldDependencies(fieldName, value, handleFieldChange);
  };

  const applyFieldDependencies = (fieldName: string, value: any, handleFieldChange: (field: string, val: any) => void) => {
    if (fieldName === 'price' && value && categoryConfig?.autoPopulateFields?.profitMargin) {
      const suggestedMargin = categoryConfig.autoPopulateFields.profitMargin;
      if (suggestedMargin) {
        handleFieldChange('profitMargin', suggestedMargin);
      }
    }
    
    if (fieldName === 'brand' && value && categoryConfig?.autoPopulateFields) {
      const autoValues: any = {};
      
      if (value === 'Apple' && !categoryConfig.autoPopulateFields.warranty) {
        autoValues.warranty = '1 year';
      } else if (value === 'Samsung' && !categoryConfig.autoPopulateFields.warranty) {
        autoValues.warranty = '2 years';
      }
      
      Object.entries(autoValues).forEach(([key, val]) => {
        handleFieldChange(key, val);
      });
    }
  };

  return {
    // State
    categoryRequiredFields,
    categorySuggestedFields,
    fieldSuggestions,
    showCategorySpecificFields,
    categoryConfig,
    isLoading,
    
    // Actions
    adaptFormToCategory,
    getFieldEnhancement,
    handleSmartFieldChange,
    
    // Helpers
    getCategoryConfiguration,
    generateCategorySuggestions
  };
}