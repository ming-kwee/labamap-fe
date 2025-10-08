'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Textarea from '@/components/ui/textarea/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select/Select';
import Badge from '@/components/ui/badge/Badge';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2, Plus, X, AlertCircle, CheckCircle2 } from '@/components/ui/icons/Icons';
import { masterProductService, FieldDefinition, ValidationError, CategoryConfiguration } from '@/services/MasterProductService';
import { CreateMasterProductRequest, MasterProduct } from '@/types/product';

interface MasterProductCreationFormProps {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Partial<CreateMasterProductRequest>;
}

export default function MasterProductCreationForm({ 
  onProductCreated, 
  initialData 
}: MasterProductCreationFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<CreateMasterProductRequest>({
    sku: '',
    name: '',
    price: 0,
    ...initialData
  });

  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [newTag, setNewTag] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Smart Form State
  const [categoryRequiredFields, setCategoryRequiredFields] = useState<string[]>([]);
  const [categorySuggestedFields, setCategorySuggestedFields] = useState<string[]>([]);
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, string>>({});
  const [showCategorySpecificFields, setShowCategorySpecificFields] = useState(false);
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfiguration | null>(null);
  
  // Variants State
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<{ name: string; values: string[] }[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [showVariants, setShowVariants] = useState(false);

  useEffect(() => {
    loadFieldDefinitions();
  }, []);

  // Category-based field adaptation
  useEffect(() => {
    if (formData.category) {
      adaptFormToCategory(formData.category);
    }
  }, [formData.category]);


  const loadFieldDefinitions = async () => {
    try {
      const definitions = await masterProductService.getFieldDefinitions();
      console.log('Field definitions received:', definitions);
      setFieldDefinitions(Array.isArray(definitions) ? definitions : []);
    } catch (error) {
      console.error('Failed to load field definitions:', error);
      setFieldDefinitions([]);
    }
  };

  const validateField = (fieldName: string, value: any): string[] => {
    const fieldDef = fieldDefinitions.find(f => f.fieldName === fieldName);
    if (!fieldDef) return [];

    const errors: string[] = [];

    // Required field validation
    if (fieldDef.required && (!value || value === '')) {
      errors.push(`${fieldDef.description} is required`);
    }

    // Data type validation
    if (value && fieldDef.dataType) {
      if (fieldDef.dataType.startsWith('VARCHAR') && typeof value !== 'string') {
        errors.push(`${fieldDef.description} must be text`);
      } else if (fieldDef.dataType.startsWith('DECIMAL') && typeof value !== 'number') {
        errors.push(`${fieldDef.description} must be a number`);
      }
    }

    // Custom validation rules
    if (value && fieldDef.validation) {
      const validation = fieldDef.validation;
      
      if (validation.min && typeof value === 'number' && value < validation.min) {
        errors.push(`${fieldDef.description} must be at least ${validation.min}`);
      }
      
      if (validation.max && typeof value === 'number' && value > validation.max) {
        errors.push(`${fieldDef.description} must be at most ${validation.max}`);
      }
      
      if (validation.minLength && typeof value === 'string' && value.length < validation.minLength) {
        errors.push(`${fieldDef.description} must be at least ${validation.minLength} characters`);
      }
      
      if (validation.maxLength && typeof value === 'string' && value.length > validation.maxLength) {
        errors.push(`${fieldDef.description} must be at most ${validation.maxLength} characters`);
      }
      
      if (validation.pattern && typeof value === 'string' && !new RegExp(validation.pattern).test(value)) {
        errors.push(`${fieldDef.description} format is invalid`);
      }
      
      if (validation.enum && !validation.enum.includes(value)) {
        errors.push(`${fieldDef.description} must be one of: ${validation.enum.join(', ')}`);
      }
    }

    return errors;
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev, [fieldName]: value };
      return newData;
    });
    
    // Real-time validation
    const fieldErrors = validateField(fieldName, value);
    setValidationErrors(prev => [
      ...prev.filter(e => e.field !== fieldName),
      ...fieldErrors.map(error => ({ field: fieldName, message: error }))
    ]);
  };

  // Smart Form Intelligence Functions
  const adaptFormToCategory = async (category: string) => {
    try {
      // Show loading state while fetching configuration
      setIsLoading(true);
      
      const categoryConfig = await getCategoryConfiguration(category);
      setCategoryConfig(categoryConfig);
      setCategoryRequiredFields(categoryConfig.requiredFields);
      setCategorySuggestedFields(categoryConfig.suggestedFields);
      setShowCategorySpecificFields(true);
      
      // Apply category-specific field suggestions from API
      const apiSuggestions = categoryConfig.fieldSuggestions || {};
      const localSuggestions = generateCategorySuggestions(category);
      setFieldSuggestions(prev => ({ 
        ...prev, 
        ...localSuggestions,
        ...apiSuggestions  // API suggestions override local ones
      }));
      
      // Auto-populate fields based on category configuration from API
      if (categoryConfig.autoPopulateFields) {
        setFormData(prev => ({ 
          ...prev, 
          ...categoryConfig.autoPopulateFields 
        }));
      } else {
        // Fallback to local auto-population
        autoPopulateCategoryFields(category);
      }
    } catch (error) {
      console.error('Error adapting form to category:', error);
      // Form will still work with fallback configuration
    } finally {
      setIsLoading(false);
    }
  };


  const getCategoryConfiguration = async (category: string): Promise<CategoryConfiguration> => {
    try {
      // Use the service method to fetch from API
      const config = await masterProductService.getCategoryConfiguration(category);
      
      // Ensure all required fields are present with defaults
      return {
        categoryName: config.categoryName || category,
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
      
      alert("tes")
      // Fallback to basic configuration if API fails
      // return getFallbackCategoryConfiguration(category);
      return getFallbackCategoryConfiguration("test");

    }
  };

  const getFallbackCategoryConfiguration = (category: string): CategoryConfiguration => {
    // Minimal fallback configurations
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
    
    const fallback = fallbackConfigs[category] || { 
      requiredFields: ['brand'], 
      suggestedFields: [], 
      validationRules: {} 
    };

    return {
      categoryName: category,
      requiredFields: fallback.requiredFields || [],
      suggestedFields: fallback.suggestedFields || [],
      validationRules: fallback.validationRules || {},
      fieldSuggestions: {},
      autoPopulateFields: {},
      channelOverrides: {},
      source: 'fallback'
    };
  };

  const generateCategorySuggestions = (category: string) => {
    // Basic fallback suggestions when API doesn't provide them
    const suggestions: Record<string, string> = {};
    
    // Generic suggestions that apply to most categories
    suggestions.name = 'Enter a descriptive product name';
    suggestions.description = 'Provide detailed product information';
    
    // Category-specific basic suggestions (minimal fallback)
    if (category === 'electronics') {
      suggestions.weight = 'Weight is typically required for electronics';
    } else if (category === 'clothing') {
      suggestions.weight = 'Weight helps with shipping calculations';
    } else if (category === 'books') {
      suggestions.weight = 'Weight affects shipping costs';
    }
    
    return suggestions;
  };

  // Enhanced Field Intelligence System
  const getFieldRelevance = (fieldName: string, category: string): 'high' | 'medium' | 'low' => {
    if (!category) return 'medium';
    
    const relevanceMap: Record<string, Record<string, 'high' | 'medium' | 'low'>> = {
      'electronics': {
        'weight': 'high',
        'brand': 'high', 
        'model': 'high',
        'warranty': 'high',
        'barcode': 'medium',
        'material': 'low',
        'color': 'low'
      },
      'clothing': {
        'weight': 'high',
        'brand': 'high',
        'material': 'high', 
        'color': 'high',
        'model': 'low',
        'warranty': 'low',
        'barcode': 'medium'
      },
      'books': {
        'weight': 'high',
        'brand': 'medium',
        'barcode': 'high',
        'model': 'low',
        'warranty': 'low',
        'material': 'low',
        'color': 'low'
      }
    };
    
    return relevanceMap[category]?.[fieldName] || 'medium';
  };

  const getSmartPlaceholder = (fieldName: string, category: string): string => {
    if (!category) return '';
    
    const placeholders: Record<string, Record<string, string>> = {
      'electronics': {
        'brand': 'Electronics brand (e.g., Apple, Samsung)',
        'model': 'Model number (e.g., iPhone 15, Galaxy S24)',
        'weight': 'Weight in kg (required for shipping)',
        'warranty': 'Warranty period (e.g., "2 years", "90 days")',
        'barcode': 'UPC/EAN barcode for electronics',
        'name': 'Descriptive electronics product name',
        'description': 'Technical specifications and features'
      },
      'clothing': {
        'brand': 'Fashion brand (e.g., Nike, Adidas)',
        'material': 'Fabric composition (e.g., "100% Cotton")',
        'color': 'Primary color (e.g., "Navy Blue")',
        'weight': 'Weight in kg (for shipping costs)',
        'barcode': 'Style/SKU barcode',
        'name': 'Clothing item name with style details',
        'description': 'Material, fit, and care instructions'
      },
      'books': {
        'brand': 'Publisher name',
        'barcode': 'ISBN-10 or ISBN-13',
        'weight': 'Book weight in kg',
        'name': 'Book title and edition',
        'description': 'Book synopsis and details'
      }
    };
    
    return placeholders[category]?.[fieldName] || '';
  };

  const getFieldHelper = (fieldName: string, category: string): string => {
    if (!category) return '';
    
    const helpers: Record<string, Record<string, string>> = {
      'electronics': {
        'weight': 'Weight affects shipping costs and compliance requirements',
        'warranty': 'Include warranty details for customer confidence',
        'model': 'Specific model helps with inventory management',
        'brand': 'Brand is required for electronics categories'
      },
      'clothing': {
        'material': 'Material composition is required for clothing labels',
        'color': 'Accurate color description helps with customer satisfaction',
        'weight': 'Weight impacts shipping rates for clothing items',
        'brand': 'Brand information helps with sizing and fit guidance'
      },
      'books': {
        'barcode': 'ISBN helps with book identification and distribution',
        'weight': 'Book weight affects bulk shipping calculations'
      }
    };
    
    return helpers[category]?.[fieldName] || '';
  };

  const getFieldEnhancement = (fieldName: string, category: string) => {
    const relevance = getFieldRelevance(fieldName, category);
    const isRequired = categoryRequiredFields.includes(fieldName);
    const isRelevant = relevance !== 'low';
    const placeholder = getSmartPlaceholder(fieldName, category);
    const helper = getFieldHelper(fieldName, category);
    
    let className = '';
    if (isRequired) {
      className += 'border-amber-500 ring-amber-200 ';
    }
    if (!isRelevant) {
      className += 'opacity-50 ';
    }
    if (relevance === 'high') {
      className += 'ring-2 ring-blue-100 ';
    }
    
    return {
      required: isRequired,
      className: className.trim(),
      placeholder: placeholder || undefined,
      helper: helper || undefined,
      relevance
    };
  };

  const autoPopulateCategoryFields = (category: string) => {
    const autoValues: Record<string, any> = {};
    
    switch (category) {
      case 'electronics':
        if (!formData.weightUnit) autoValues.weightUnit = 'kg';
        break;
      case 'clothing':
        if (!formData.weightUnit) autoValues.weightUnit = 'kg';
        break;
    }
    
    if (Object.keys(autoValues).length > 0) {
      setFormData(prev => ({ ...prev, ...autoValues }));
    }
  };


  // Enhanced field change with smart dependencies
  const handleSmartFieldChange = (fieldName: string, value: any) => {
    handleFieldChange(fieldName, value);
    
    // Apply real-time field dependencies
    applyFieldDependencies(fieldName, value);
  };

  const applyFieldDependencies = (fieldName: string, value: any) => {
    const dependencies: Record<string, any> = {};
    
    switch (fieldName) {
      case 'weight':
        if (typeof value === 'number' && value > 10) {
          dependencies.shippingClass = 'heavy_item';
          setFieldSuggestions(prev => ({ 
            ...prev, 
            shippingClass: 'Consider freight shipping for heavy items'
          }));
        }
        break;
      case 'price':
        if (formData.costPerItem && typeof value === 'number') {
          const margin = ((value - formData.costPerItem) / value) * 100;
          dependencies.profitMargin = margin;
          if (margin < 20) {
            setFieldSuggestions(prev => ({ 
              ...prev, 
              price: 'Low profit margin detected - consider adjusting price'
            }));
          }
        }
        break;
      case 'category':
        // Category change triggers form adaptation (handled by useEffect)
        break;
    }
    
    if (Object.keys(dependencies).length > 0) {
      setFormData(prev => ({ ...prev, ...dependencies }));
    }
  };

  const handleTagAdd = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const updatedTags = [...tags, newTag.trim()];
      setTags(updatedTags);
      handleFieldChange('tags', updatedTags);
      setNewTag('');
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    const updatedTags = tags.filter(tag => tag !== tagToRemove);
    setTags(updatedTags);
    handleFieldChange('tags', updatedTags);
  };

  // Variant Management Functions
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

  const generateVariantCombinations = (options: { name: string; values: string[] }[]) => {
    if (options.length === 0) {
      setVariants([]);
      return;
    }

    const combinations: any[] = [];
    const generateCombos = (current: any, optionIndex: number) => {
      if (optionIndex >= options.length) {
        const sku = `${formData.sku || 'PROD'}-${Object.values(current).join('-').toUpperCase()}`;
        combinations.push({
          id: `variant-${combinations.length + 1}`,
          sku,
          price: formData.price,
          quantity: formData.quantity || 0,
          options: { ...current },
          barcode: '',
          weight: formData.weight,
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

  const toggleVariantsMode = (enabled: boolean) => {
    setHasVariants(enabled);
    setShowVariants(enabled);
    if (enabled) {
      // Auto-suggest common variant options based on category
      if (formData.category === 'clothing') {
        if (variantOptions.length === 0) {
          addVariantOption('Size', ['XS', 'S', 'M', 'L', 'XL']);
          addVariantOption('Color', ['Black', 'White', 'Blue']);
        }
      } else if (formData.category === 'electronics') {
        if (variantOptions.length === 0) {
          addVariantOption('Color', ['Black', 'White', 'Silver']);
          addVariantOption('Storage', ['64GB', '128GB', '256GB']);
        }
      }
    } else {
      setVariantOptions([]);
      setVariants([]);
    }
  };

  // Variant Option Editor Component
  const VariantOptionEditor = ({ onAdd }: { onAdd: (name: string, values: string[]) => void }) => {
    const [optionName, setOptionName] = useState('');
    const [optionValues, setOptionValues] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = () => {
      if (optionName.trim() && optionValues.trim()) {
        const values = optionValues.split(',').map(v => v.trim()).filter(v => v);
        onAdd(optionName.trim(), values);
        setOptionName('');
        setOptionValues('');
        setIsAdding(false);
      }
    };

    const handleCancel = () => {
      setOptionName('');
      setOptionValues('');
      setIsAdding(false);
    };

    if (!isAdding) {
      return (
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Variant Option
        </Button>
      );
    }

    return (
      <div className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-dashed">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Option Name</label>
            <Input
              value={optionName}
              onChange={(e) => setOptionName(e.target.value)}
              placeholder="e.g., Size, Color, Material"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Values (comma-separated)</label>
            <Input
              value={optionValues}
              onChange={(e) => setOptionValues(e.target.value)}
              placeholder="e.g., Small, Medium, Large or Red, Blue, Green"
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleAdd} size="sm">
              Add Option
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel} size="sm">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Field Component
  const EnhancedField = ({ fieldName, children, showHelper = true }: { 
    fieldName: string, 
    children: React.ReactElement<any>, 
    showHelper?: boolean 
  }) => {
    const enhancement = getFieldEnhancement(fieldName, formData.category || '');
    const error = getFieldError(fieldName);
    
    return (
      <div className="space-y-2">
        {React.cloneElement(children, {
          className: `${children.props?.className || ''} ${enhancement.className}`.trim(),
          placeholder: enhancement.placeholder || children.props?.placeholder,
          required: enhancement.required || children.props?.required
        })}
        
        {showHelper && enhancement.helper && !error && (
          <div className="flex items-start space-x-1">
            <div className={`w-2 h-2 rounded-full mt-1.5 ${
              enhancement.relevance === 'high' ? 'bg-blue-500' :
              enhancement.relevance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
            }`} />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {enhancement.helper}
            </p>
          </div>
        )}
        
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  };

  const validateForm = async () => {
    setIsValidating(true);
    
    try {
      const validation = await masterProductService.validateMasterProduct(formData);
      
      if (!validation.valid) {
        setValidationErrors(validation.errors.map(error => ({
          field: 'general',
          message: error
        })));
        return false;
      }
      
      setValidationErrors([]);
      return true;
    } catch (error) {
      console.error('API validation failed:', error);
      // Continue without API validation when service is unavailable
      console.log('Proceeding without server-side validation');
      setValidationErrors([]);
      return true;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!(await validateForm())) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await masterProductService.createMasterProduct({
        ...formData,
        tags,
        hasVariants,
        variantOptions: hasVariants ? variantOptions : undefined,
        variants: hasVariants ? variants : undefined
      });

      if (response.success && response.masterProduct) {
        if (onProductCreated) {
          onProductCreated(response.masterProduct, response.availableChannels || []);
        } else {
          router.push(`/products/${response.masterProduct.id}/channels`);
        }
      } else {
        setValidationErrors(response.errors?.map(error => ({
          field: 'general',
          message: error
        })) || [{ field: 'general', message: 'Failed to create product' }]);
      }
    } catch (error) {
      console.error('Failed to create master product:', error);
      setValidationErrors([{ field: 'general', message: 'Failed to create product. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getFieldError = (fieldName: string) => 
    validationErrors.find(e => e.field === fieldName)?.message;

  const hasErrors = validationErrors.length > 0;
  const generalErrors = validationErrors.filter(e => e.field === 'general');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Master Product
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* General Errors */}
            {generalErrors.map((error, index) => (
              <Alert key={index} variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ))}

            {/* Essential Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Essential Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => handleFieldChange('sku', e.target.value)}
                    placeholder="Product SKU (e.g., PROD-001)"
                    className={getFieldError('sku') ? 'border-red-500' : ''}
                    required
                  />
                  {getFieldError('sku') && (
                    <p className="text-sm text-red-600">{getFieldError('sku')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <EnhancedField fieldName="name">
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      placeholder="Product name"
                      required
                    />
                  </EnhancedField>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => handleSmartFieldChange('price', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className={getFieldError('price') ? 'border-red-500' : ''}
                    required
                  />
                  {getFieldError('price') && (
                    <p className="text-sm text-red-600">{getFieldError('price')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="category">Category</Label>
                    {isLoading && (
                      <div className="flex items-center space-x-1">
                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        <span className="text-xs text-blue-600">Loading configuration...</span>
                      </div>
                    )}
                  </div>
                  <Select value={formData.category || ''} onValueChange={(value) => handleSmartFieldChange('category', value)}>
                    <SelectTrigger id="category" name="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="electronics">Electronics</SelectItem>
                      <SelectItem value="clothing">Clothing</SelectItem>
                      <SelectItem value="home">Home & Garden</SelectItem>
                      <SelectItem value="books">Books</SelectItem>
                      <SelectItem value="sports">Sports & Outdoors</SelectItem>
                      <SelectItem value="beauty">Beauty & Personal Care</SelectItem>
                      <SelectItem value="automotive">Automotive</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                {/* Smart Field Suggestions */}
                {Object.keys(fieldSuggestions).length > 0 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">💡 Smart Suggestions</h4>
                    <div className="space-y-1">
                      {Object.entries(fieldSuggestions).map(([field, suggestion]) => (
                        <div key={field} className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>{field}:</strong> {suggestion}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category-Specific Required Fields Notice */}
                {categoryRequiredFields.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">⚠️ Required for {formData.category}</h4>
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      Fields: {categoryRequiredFields.join(', ')}
                    </div>
                    {categoryConfig && categoryConfig.confidenceScore && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center space-x-1">
                        <span>📊 {categoryConfig.confidenceScore.toFixed(1)}%</span>
                        {categoryConfig.source && (
                          <span className="bg-amber-200 dark:bg-amber-800 px-1 rounded text-xs">
                            {categoryConfig.source}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <EnhancedField fieldName="description">
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    placeholder="Product description"
                    rows={3}
                  />
                </EnhancedField>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortDescription">Short Description</Label>
                <Textarea
                  id="shortDescription"
                  value={formData.shortDescription || ''}
                  onChange={(e) => handleFieldChange('shortDescription', e.target.value)}
                  placeholder="Brief product summary"
                  rows={2}
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Tags</h3>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleTagAdd())}
                  />
                  <Button type="button" onClick={handleTagAdd} variant="outline">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, index) => (
                    <Badge key={index} variant="light" color="light" className="flex items-center gap-1">
                      {tag}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => handleTagRemove(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced Options */}
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'Hide' : 'Show'} Advanced Options
              </Button>

              {showAdvanced && (
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="brand">Brand</Label>
                      <EnhancedField fieldName="brand">
                        <Input
                          id="brand"
                          value={formData.brand || ''}
                          onChange={(e) => handleFieldChange('brand', e.target.value)}
                          placeholder="Brand name"
                        />
                      </EnhancedField>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="barcode">Barcode</Label>
                      <EnhancedField fieldName="barcode">
                        <Input
                          id="barcode"
                          value={formData.barcode || ''}
                          onChange={(e) => handleFieldChange('barcode', e.target.value)}
                          placeholder="Barcode/UPC"
                        />
                      </EnhancedField>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="compareAtPrice">Compare At Price</Label>
                      <Input
                        id="compareAtPrice"
                        type="number"
                        step="0.01"
                        value={formData.compareAtPrice || ''}
                        onChange={(e) => handleFieldChange('compareAtPrice', parseFloat(e.target.value) || undefined)}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="costPerItem">Cost Per Item</Label>
                      <Input
                        id="costPerItem"
                        type="number"
                        step="0.01"
                        value={formData.costPerItem || ''}
                        onChange={(e) => handleFieldChange('costPerItem', parseFloat(e.target.value) || undefined)}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="weight">Weight</Label>
                      <div className="flex gap-2">
                        <Input
                          id="weight"
                          type="number"
                          step="0.01"
                          value={formData.weight || ''}
                          onChange={(e) => handleSmartFieldChange('weight', parseFloat(e.target.value) || undefined)}
                          placeholder="0.0"
                        />
                        <Select onValueChange={(value) => handleFieldChange('weightUnit', value)}>
                          <SelectTrigger className="w-20">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="lb">lb</SelectItem>
                            <SelectItem value="g">g</SelectItem>
                            <SelectItem value="oz">oz</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quantity">Initial Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={formData.quantity || ''}
                        onChange={(e) => handleFieldChange('quantity', parseInt(e.target.value) || undefined)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metaTitle">SEO Title</Label>
                    <Input
                      id="metaTitle"
                      value={formData.metaTitle || ''}
                      onChange={(e) => handleFieldChange('metaTitle', e.target.value)}
                      placeholder="SEO optimized title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="metaDescription">SEO Description</Label>
                    <Textarea
                      id="metaDescription"
                      value={formData.metaDescription || ''}
                      onChange={(e) => handleFieldChange('metaDescription', e.target.value)}
                      placeholder="SEO meta description"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Product Variants */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Product Variants</h3>
                  <p className="text-sm text-gray-600">Create variations of this product (size, color, etc.)</p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hasVariants"
                    checked={hasVariants}
                    onChange={(e) => toggleVariantsMode(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="hasVariants" className="text-sm font-medium">
                    This product has variants
                  </label>
                </div>
              </div>

              {hasVariants && (
                <div className="space-y-6 border rounded-lg p-6 bg-gray-50 dark:bg-gray-800">
                  {/* Variant Options */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Variant Options</h4>
                    
                    {variantOptions.map((option, index) => (
                      <div key={index} className="p-4 bg-white dark:bg-gray-700 rounded-lg border">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium">{option.name}</h5>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeVariantOption(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {option.values.map((value, valueIndex) => (
                              <Badge key={valueIndex} variant="light" color="light">
                                {value}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add New Option */}
                    <VariantOptionEditor onAdd={addVariantOption} />
                  </div>

                  {/* Generated Variants */}
                  {variants.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Generated Variants ({variants.length})</h4>
                        <Badge variant="light" color="success">
                          {variants.length} combinations
                        </Badge>
                      </div>
                      
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {variants.map((variant, index) => (
                          <div key={variant.id} className="p-4 bg-white dark:bg-gray-700 rounded-lg border">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                              <div>
                                <div className="font-medium text-sm">
                                  {Object.entries(variant.options).map(([key, value]) => (
                                    <span key={key} className="mr-2">
                                      {key}: <strong>{String(value)}</strong>
                                    </span>
                                  ))}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  SKU: {variant.sku}
                                </div>
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-medium">Price</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={variant.price || ''}
                                  onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm"
                                />
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-medium">Quantity</label>
                                <Input
                                  type="number"
                                  value={variant.quantity || ''}
                                  onChange={(e) => updateVariant(index, 'quantity', parseInt(e.target.value) || 0)}
                                  className="h-8 text-sm"
                                />
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-xs font-medium">Weight</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={variant.weight || ''}
                                  onChange={(e) => updateVariant(index, 'weight', parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-6">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => handleFieldChange('status', 'draft')}
                >
                  Save as Draft
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || isValidating || hasErrors}
                  className="min-w-[200px]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Create & Continue to Channels
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}