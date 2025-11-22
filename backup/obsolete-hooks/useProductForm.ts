import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { masterProductService, FieldDefinition, ValidationError } from '@/services/MasterProductService';
import { masterAttributesService, FormFieldDefinition } from '@/services/MasterAttributesService';
import { CreateMasterProductRequest, MasterProduct } from '@/types/product';
import { useBusinessRules } from './useBusinessRules';
import { RuleType, ProductInput } from '@/types/rules';

interface UseProductFormOptions {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Partial<CreateMasterProductRequest>;
}

export function useProductForm({ onProductCreated, initialData }: UseProductFormOptions = {}) {
  const router = useRouter();
  
  // Core form state
  const [formData, setFormData] = useState<CreateMasterProductRequest>({
    sku: '',
    name: '',
    price: 0,
    ...initialData
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Business rules integration
  const businessRules = useBusinessRules();
  
  // Tags state
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [newTag, setNewTag] = useState('');
  
  // Field definitions and validations
  const [fieldDefinitions, setFieldDefinitions] = useState<FormFieldDefinition[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  
  // Load field definitions on mount
  useEffect(() => {
    loadMasterAttributes();
  }, []);

  const loadMasterAttributes = async () => {
    try {
      // Load available categories from master attributes
      const categories = await masterAttributesService.getAvailableCategories();
      setAvailableCategories(categories);
      
      // Load field definitions for current category if available
      if (formData.category) {
        const definitions = await masterAttributesService.getFormFieldsForCategory(formData.category);
        setFieldDefinitions(definitions);
      }
    } catch (error) {
      console.error('Failed to load master attributes:', error);
      setFieldDefinitions([]);
      // Fallback to hardcoded categories
      setAvailableCategories(['electronics', 'clothing', 'home', 'books', 'sports', 'beauty', 'automotive', 'other']);
    }
  };

  // Load field definitions when category changes
  useEffect(() => {
    if (formData.category) {
      loadFieldDefinitionsForCategory(formData.category);
    }
  }, [formData.category]);

  const loadFieldDefinitionsForCategory = async (category: string) => {
    try {
      const definitions = await masterAttributesService.getFormFieldsForCategory(category);
      setFieldDefinitions(definitions);
    } catch (error) {
      console.error('Failed to load field definitions for category:', error);
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    
    // Real-time validation
    const fieldErrors = validateField(fieldName, value);
    setValidationErrors(prev => [
      ...prev.filter(e => e.field !== fieldName),
      ...fieldErrors.map(error => ({ field: fieldName, message: error }))
    ]);
  };

  // Apply pre-processing rules to enhance form data
  const applyPreProcessingRules = async (): Promise<void> => {
    try {
      const productInput: ProductInput = {
        ...formData,
        tags,
        category: formData.category,
        channel: formData.channel
      };
      
      const result = await businessRules.executeRules(productInput, RuleType.PRE_PROCESSING);
      
      if (result.success && result.data) {
        // Update form data with enhanced values
        setFormData(prev => ({
          ...prev,
          ...result.data,
          // Preserve any UI-specific fields that shouldn't be overwritten
          channel: prev.channel,
          hasVariants: prev.hasVariants
        }));
        
        // Update tags if they were processed
        if (result.data.tags) {
          setTags(result.data.tags);
        }
      }
    } catch (error) {
      console.error('Failed to apply pre-processing rules:', error);
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
      const dataType = fieldDef.dataType.toLowerCase();
      if ((dataType.includes('string') || dataType.includes('varchar')) && typeof value !== 'string') {
        errors.push(`${fieldDef.description} must be text`);
      } else if ((dataType.includes('number') || dataType.includes('decimal') || dataType.includes('integer')) && typeof value !== 'number') {
        errors.push(`${fieldDef.description} must be a number`);
      }
    }

    // Master attributes validation rules
    if (value && fieldDef.validationRules) {
      const validation = fieldDef.validationRules;
      
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

  const validateForm = async (): Promise<boolean> => {
    setIsValidating(true);
    
    try {
      // First, validate using business rules
      const productInput: ProductInput = {
        ...formData,
        tags,
        category: formData.category,
        channel: formData.channel
      };
      
      const rulesValidation = await businessRules.validateRules(productInput);
      
      if (!rulesValidation.success) {
        // Convert business rules violations to validation errors
        const rulesErrors = rulesValidation.violations.map(violation => ({
          field: violation.field,
          message: violation.message
        }));
        setValidationErrors(rulesErrors);
        return false;
      }
      
      // Then validate using legacy service for backwards compatibility
      const validation = await masterProductService.validateMasterProduct({
        ...formData,
        tags
      });
      
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
      console.error('Validation failed:', error);
      // Continue without API validation when service is unavailable
      console.log('Proceeding without server-side validation');
      setValidationErrors([]);
      return true;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (hasVariants: boolean, variantOptions: any[], variants: any[]) => {
    if (!(await validateForm())) {
      return false;
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
        return true;
      } else {
        setValidationErrors(response.errors?.map(error => ({
          field: 'general',
          message: error
        })) || [{ field: 'general', message: 'Failed to create product' }]);
        return false;
      }
    } catch (error) {
      console.error('Failed to create master product:', error);
      setValidationErrors([{
        field: 'general',
        message: 'Failed to create product. Please try again.'
      }]);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Tag management
  const handleTagAdd = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      const updatedTags = [...tags, trimmedTag];
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

  const getFieldError = (fieldName: string): string | undefined => {
    const error = validationErrors.find(e => e.field === fieldName);
    return error?.message;
  };

  const getGeneralErrors = () => {
    return validationErrors.filter(e => e.field === 'general');
  };

  return {
    // State
    formData,
    isLoading,
    isValidating,
    validationErrors,
    showAdvanced,
    tags,
    newTag,
    fieldDefinitions,
    availableCategories,
    
    // Business Rules State
    businessRulesViolations: businessRules.violations,
    businessRulesWarnings: businessRules.warnings,
    isExecutingRules: businessRules.isExecuting,
    hasBlockingViolations: businessRules.hasBlockingViolations,
    
    // State setters
    setShowAdvanced,
    setNewTag,
    
    // Actions
    handleFieldChange,
    handleSubmit,
    handleTagAdd,
    handleTagRemove,
    applyPreProcessingRules,
    
    // Business Rules Actions
    validateBusinessRules: businessRules.validateRules,
    executeBusinessRules: businessRules.executeRules,
    clearBusinessRulesViolations: businessRules.clearViolations,
    getViolationsByField: businessRules.getViolationsByField,
    getWarningsByField: businessRules.getWarningsByField,
    
    // Helpers
    getFieldError,
    getGeneralErrors,
    validateField
  };
}