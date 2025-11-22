"use client";

/**
 * Dynamic Form Component
 * Renders forms based on business-controlled schemas with conditional logic
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2 } from '@/components/ui/icons/Icons';
import {
  DynamicFormProps,
  DynamicFormData,
  FormField,
  FormValidationResult,
  DynamicFormSchema,
  FormLogic
} from '@/types/dynamicForm';

interface ImageFile {
  id: string;
  file?: File;
  url: string;
  name: string;
  size?: number;
  type?: string;
  isPrimary: boolean;
  altText?: string;
  description?: string;
}

const DynamicForm: React.FC<DynamicFormProps> = ({
  schema,
  data = {},
  onChange,
  onSubmit,
  onValidate,
  className = '',
  disabled = false,
  showBusinessContext = false,
  showGovernanceInfo = false
}) => {
  console.log('[DynamicForm] Component rendered with data:', data);
  const [formData, setFormData] = useState<DynamicFormData>(data);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [isValidating, setIsValidating] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [uploadedImages, setUploadedImages] = useState<Record<string, ImageFile[]>>({});
  const [dragActive, setDragActive] = useState(false);
  const [localVariants, setLocalVariants] = useState<Record<string, any[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize visible fields and expanded groups
  useEffect(() => {
    console.log('[DynamicForm] Schema loaded, initializing visibility with formData:', formData);
    updateFieldVisibility(formData);
    
    // Initialize expanded groups
    const defaultExpanded = new Set(
      schema.groups?.filter(g => g.defaultExpanded).map(g => g.groupName) || []
    );
    setExpandedGroups(defaultExpanded);
  }, [schema]);

  // Track if we're in the middle of an internal update to prevent circular updates
  const isInternalUpdateRef = useRef(false);
  
  // Update form data when data prop changes (avoid circular updates)
  useEffect(() => {
    console.log('[DynamicForm] Data prop changed to:', data);
    
    // Skip update if this is from our own internal change
    if (isInternalUpdateRef.current) {
      console.log('[DynamicForm] Skipping data prop update (internal change)');
      isInternalUpdateRef.current = false;
      return;
    }
    
    console.log('[DynamicForm] External data change, updating formData');
    setFormData(data);
  }, [data]);

  // Update visibility when form data changes
  useEffect(() => {
    console.log('[DynamicForm] Form data changed, updating visibility:', formData);
    updateFieldVisibility(formData);
  }, [formData]);

  // Notify parent of data changes
  useEffect(() => {
    onChange?.(formData);
  }, [formData, onChange]);

  // Initialize images from form data for all image fields
  useEffect(() => {
    // Safety check for schema
    if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
      console.log('[DynamicForm] Schema not available yet, skipping image initialization');
      return;
    }
    
    console.log('[DynamicForm] ALL FIELDS IN SCHEMA:', schema.fields.map(f => ({ name: f.fieldName, type: f.fieldType })));
    
    const imageFields = schema.fields.filter(field => {
      const normalizedType = field.fieldType.toLowerCase();
      return normalizedType === 'image' || normalizedType === 'file' || normalizedType === 'media';
    });
    
    console.log('[DynamicForm] Image fields found:', imageFields.map(f => f.fieldName));
    console.log('[DynamicForm] Image fields details:', imageFields);
    
    const updatedImages: Record<string, ImageFile[]> = {};
    
    imageFields.forEach(field => {
      const fieldValue = formData[field.fieldName];
      console.log(`[DynamicForm] Field ${field.fieldName} value:`, fieldValue);
      
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        const images: ImageFile[] = fieldValue.map((url: string, index: number) => ({
          id: `existing-${field.fieldName}-${index}`,
          url,
          name: `Image ${index + 1}`,
          isPrimary: index === 0,
          altText: `Product image ${index + 1}`
        }));
        updatedImages[field.fieldName] = images;
        console.log(`[DynamicForm] Initialized ${images.length} images for ${field.fieldName}`);
      } else {
        console.log(`[DynamicForm] No initial images for ${field.fieldName}`);
      }
    });
    
    if (Object.keys(updatedImages).length > 0) {
      setUploadedImages(prev => ({ ...prev, ...updatedImages }));
    }
  }, [schema.fields, formData]);

  // Initialize variants from form data only once when component mounts
  useEffect(() => {
    if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
      return;
    }
    
    const variantFields = schema.fields.filter(field => field.fieldType.toLowerCase() === 'variant-configurator');
    
    variantFields.forEach(field => {
      const variantData = formData[field.fieldName];
      if (variantData && !localVariants[field.fieldName]) {
        try {
          let initialVariants: any[] = [];
          
          if (Array.isArray(variantData)) {
            initialVariants = variantData;
          } else if (typeof variantData === 'string') {
            const parsed = JSON.parse(variantData);
            initialVariants = parsed.variants || [];
          } else if (typeof variantData === 'object') {
            initialVariants = variantData.variants || [variantData];
          }
          
          if (initialVariants.length > 0) {
            setLocalVariants(prev => ({
              ...prev,
              [field.fieldName]: initialVariants
            }));
          }
        } catch (error) {
          console.error('Error parsing variant data:', error);
        }
      }
    });
  }, [schema.fields]); // Only depend on schema.fields, not formData to prevent loops

  // Update form data when local variants change (debounced to prevent loops)
  // REMOVED: This was causing infinite loops with form data updates

  /**
   * Update field visibility based on conditional logic
   */
  const updateFieldVisibility = (currentData: DynamicFormData) => {
    console.log('[DynamicForm] updateFieldVisibility called with data:', currentData);
    
    if (!schema || !schema.fields) {
      console.log('[DynamicForm] No schema or fields available');
      return;
    }
    
    const visible = new Set<string>();
    
    schema.fields.forEach(field => {
      const isVisible = isFieldVisible(field, currentData);
      
      // Debug conditional fields
      if (field.conditionalVisibility) {
        console.log(`[DynamicForm] Field "${field.fieldName}" conditional check:`, {
          condition: field.conditionalVisibility,
          currentData: { category: currentData.category, hasVariants: currentData.hasVariants },
          isVisible
        });
      }
      
      if (isVisible) {
        visible.add(field.fieldName);
      }
    });
    
    console.log('[DynamicForm] Visible fields after update:', Array.from(visible));
    setVisibleFields(visible);
  };

  /**
   * Check if a field should be visible
   */
  const isFieldVisible = (field: FormField, data: DynamicFormData): boolean => {
    if (field.hidden) return false;
    
    // Special handling for variant configurator - always check its conditional logic
    if (field.fieldName === 'variantConfigurator') {
      if (!field.conditionalVisibility) return true;
      const { showWhen, hideWhen } = field.conditionalVisibility;
      if (showWhen && !evaluateCondition(showWhen, data)) return false;
      if (hideWhen && evaluateCondition(hideWhen, data)) return false;
      return true;
    }
    
    // Hide other variant-related fields when variants are enabled (they're now part of variant configurator)
    if (data.hasVariants) {
      const isVariantAttributeField = (
        // Fields in the variants group (except hasVariants and variantConfigurator)
        (field.group === 'variants' && field.fieldName !== 'hasVariants' && field.fieldName !== 'variantConfigurator') ||
        // Common variant attribute fields that show when hasVariants is true
        (['size', 'color', 'material', 'style', 'pattern', 'finish'].includes(field.fieldName) && 
         field.conditionalVisibility?.showWhen?.includes('hasVariants === true'))
      );
      
      if (isVariantAttributeField) {
        return false;
      }
    }
    
    if (!field.conditionalVisibility) return true;
    
    const { showWhen, hideWhen } = field.conditionalVisibility;
    
    if (showWhen && !evaluateCondition(showWhen, data)) return false;
    if (hideWhen && evaluateCondition(hideWhen, data)) return false;
    
    return true;
  };

  /**
   * Check if a field is required in current context
   */
  const isFieldRequired = (field: FormField, data: DynamicFormData): boolean => {
    if (field.required) return true;
    
    if (field.conditionalVisibility?.requiredWhen) {
      return evaluateCondition(field.conditionalVisibility.requiredWhen, data);
    }
    
    return false;
  };

  /**
   * Check if a field is disabled in current context
   */
  const isFieldDisabled = (field: FormField, data: DynamicFormData): boolean => {
    if (disabled || field.readOnly) return true;
    
    if (field.conditionalVisibility?.disabledWhen) {
      return evaluateCondition(field.conditionalVisibility.disabledWhen, data);
    }
    
    return false;
  };

  /**
   * Safely evaluate conditional expressions
   */
  const evaluateCondition = (condition: string, data: DynamicFormData): boolean => {
    try {
      // Create safe evaluation context
      const evalContext = {
        ...data,
        targetChannels: data.targetChannels || [],
        includes: (array: any[], item: any) => Array.isArray(array) && array.includes(item)
      };
      
      console.log(`[DynamicForm] Evaluating condition: "${condition}"`, {
        data: { category: data.category, hasVariants: data.hasVariants },
        fullData: data
      });
      
      
      // Simple expression evaluation for common patterns
      if (condition.includes('===')) {
        const [left, right] = condition.split('===').map(s => s.trim());
        const leftValue = getNestedValue(evalContext, left);
        
        // Handle boolean values
        if (right === 'true') {
          return leftValue === true;
        }
        if (right === 'false') {
          return leftValue === false;
        }
        
        // Handle string values
        const rightValue = right.replace(/['"]/g, '');
        const result = leftValue === rightValue;
        console.log(`[DynamicForm] === evaluation: "${leftValue}" === "${rightValue}" = ${result}`);
        return result;
      }
      
      if (condition.includes('includes(')) {
        const match = condition.match(/(\w+)\.includes\(['"]([^'"]+)['"]\)/);
        if (match) {
          const [, arrayName, value] = match;
          const array = (evalContext as any)[arrayName];
          return Array.isArray(array) && array.includes(value);
        }
      }
      
      if (condition.includes('!==')) {
        const [left, right] = condition.split('!==').map(s => s.trim());
        const leftValue = getNestedValue(evalContext, left);
        
        // Handle boolean values
        if (right === 'true') {
          return leftValue !== true;
        }
        if (right === 'false') {
          return leftValue !== false;
        }
        
        // Handle string values
        const rightValue = right.replace(/['"]/g, '');
        return leftValue !== rightValue;
      }
      
      // Handle OR conditions (||)
      if (condition.includes(' || ')) {
        const conditions = condition.split(' || ').map(c => c.trim());
        const result = conditions.some(cond => evaluateCondition(cond, data));
        console.log(`[DynamicForm] OR evaluation: "${condition}" = ${result}`);
        return result;
      }
      
      // Handle AND conditions (&&)
      if (condition.includes(' && ')) {
        const conditions = condition.split(' && ').map(c => c.trim());
        const result = conditions.every(cond => evaluateCondition(cond, data));
        console.log(`[DynamicForm] AND evaluation: "${condition}" = ${result}`);
        return result;
      }
      
      console.log(`[DynamicForm] Unhandled condition format: "${condition}"`);
      return false;
    } catch (error) {
      console.warn('Error evaluating condition:', condition, error);
      return false;
    }
  };

  /**
   * Get nested value from object using dot notation
   */
  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  /**
   * Handle field value changes
   */
  const handleFieldChange = (fieldName: string, value: any) => {
    console.log('Field changed:', fieldName, 'new value:', value, 'type:', typeof value);
    
    // Set flag to prevent circular update when parent updates data prop
    isInternalUpdateRef.current = true;
    
    // Update form data
    const newData = { ...formData, [fieldName]: value };
    setFormData(newData);
    
    // Update local variants if this is a variant configurator field (prevents circular dependency)
    const isVariantField = schema?.fields?.some(field => 
      field.fieldName === fieldName && field.fieldType.toLowerCase() === 'variant-configurator'
    ) || false;
    
    if (isVariantField && value) {
      setLocalVariants(prev => ({
        ...prev,
        [fieldName]: Array.isArray(value) ? value : []
      }));
    }
    
    // Special debugging for hasVariants
    if (fieldName === 'hasVariants') {
      console.log('hasVariants changed! Old data:', formData, 'New data:', newData);
      console.log('Will trigger visibility update...');
      console.log('Looking for variantConfigurator field in schema...');
      const variantConfigField = schema?.fields?.find(f => f.fieldName === 'variantConfigurator');
      if (variantConfigField) {
        console.log('Found variantConfigurator field:', variantConfigField);
        console.log('Conditional visibility:', variantConfigField.conditionalVisibility);
      } else {
        console.log('variantConfigurator field NOT found in schema!');
      }
    }
    
    // Clear validation errors for this field
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[fieldName];
        return updated;
      });
    }
    
    // Handle dependent field changes
    updateDependentFields(fieldName, value, newData);
  };

  /**
   * Update fields that depend on the changed field
   */
  const updateDependentFields = (triggerField: string, triggerValue: any, currentData: DynamicFormData) => {
    const dependency = schema.conditionalLogic.fieldDependencies.find(
      dep => dep.triggerField === triggerField
    );
    
    if (dependency && dependency.logic[triggerValue]) {
      const logic = dependency.logic[triggerValue];
      const updatedData = { ...currentData };
      
      // Hide fields and clear their data
      logic.hide?.forEach(fieldName => {
        if (updatedData[fieldName] !== undefined) {
          delete updatedData[fieldName];
        }
      });
      
      // Show fields (they will become visible through visibility calculation)
      // No action needed here as visibility is calculated automatically
      
      setFormData(updatedData);
    }
  };

  /**
   * Validate form data
   */
  const validateForm = async (): Promise<FormValidationResult> => {
    setIsValidating(true);
    
    const fieldErrors: Record<string, string[]> = {};
    const globalErrors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Validate each visible field
      for (const field of schema.fields) {
        if (!visibleFields.has(field.fieldName)) continue;
        
        const value = formData[field.fieldName];
        const errors = validateField(field, value, formData);
        
        if (errors.length > 0) {
          fieldErrors[field.fieldName] = errors;
        }
      }
      
      // Validate global rules
      if (schema.conditionalLogic.globalValidations) {
        for (const validation of schema.conditionalLogic.globalValidations) {
          if (!evaluateCondition(validation.expression, formData)) {
            if (validation.severity === 'error') {
              globalErrors.push(validation.message);
            } else {
              warnings.push(validation.message);
            }
          }
        }
      }
      
      const result: FormValidationResult = {
        isValid: Object.keys(fieldErrors).length === 0 && globalErrors.length === 0,
        fieldErrors,
        globalErrors,
        warnings
      };
      
      setValidationErrors(fieldErrors);
      onValidate?.(result);
      
      return result;
      
    } finally {
      setIsValidating(false);
    }
  };

  /**
   * Validate individual field
   */
  const validateField = (field: FormField, value: any, data: DynamicFormData): string[] => {
    const errors: string[] = [];
    const rules = field.validationRules;
    
    // Required validation
    if (isFieldRequired(field, data) && (value === undefined || value === null || value === '')) {
      errors.push(`${field.label} is required`);
      return errors; // Skip other validations if required field is empty
    }
    
    // Skip other validations if field is empty but not required
    if (value === undefined || value === null || value === '') {
      return errors;
    }
    
    // Type-specific validations
    if (field.fieldType.toLowerCase() === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`${field.label} must be a valid number`);
        return errors;
      }
      
      if (rules.min !== undefined && numValue < rules.min) {
        errors.push(`${field.label} must be at least ${rules.min}`);
      }
      
      if (rules.max !== undefined && numValue > rules.max) {
        errors.push(`${field.label} must be no more than ${rules.max}`);
      }
    }
    
    const normalizedType = field.fieldType.toLowerCase();
    if (normalizedType === 'text' || normalizedType === 'textarea') {
      const strValue = String(value);
      
      if (rules.minLength !== undefined && strValue.length < rules.minLength) {
        errors.push(`${field.label} must be at least ${rules.minLength} characters`);
      }
      
      if (rules.maxLength !== undefined && strValue.length > rules.maxLength) {
        errors.push(`${field.label} must be no more than ${rules.maxLength} characters`);
      }
      
      if (rules.pattern) {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(strValue)) {
          errors.push(`${field.label} format is invalid`);
        }
      }
    }
    
    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field.label} must be one of: ${rules.enum.join(', ')}`);
    }
    
    return errors;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = await validateForm();
    
    if (validation.isValid) {
      onSubmit?.(formData);
    }
  };

  /**
   * Toggle group expansion
   */
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const updated = new Set(prev);
      if (updated.has(groupName)) {
        updated.delete(groupName);
      } else {
        updated.add(groupName);
      }
      return updated;
    });
  };

  /**
   * Render field input based on type
   */
  const renderFieldInput = (field: FormField) => {
    const value = formData[field.fieldName] || '';
    const isRequired = isFieldRequired(field, formData);
    const isDisabled = isFieldDisabled(field, formData);
    const errors = validationErrors[field.fieldName] || [];
    
    const commonProps = {
      id: field.fieldName,
      name: field.fieldName,
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => 
        handleFieldChange(field.fieldName, e.target.value),
      required: isRequired,
      disabled: isDisabled,
      placeholder: field.placeholder,
      'aria-describedby': `${field.fieldName}-help ${field.fieldName}-error`,
      className: `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        errors.length > 0 ? 'border-red-500' : 'border-gray-300'
      } ${isDisabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`
    };

    // Normalize field type to lowercase for consistent handling
    const normalizedFieldType = field.fieldType.toLowerCase();
    
    switch (normalizedFieldType) {
      case 'text':
      case 'email':
      case 'url':
      case 'tel':
        return <input type={normalizedFieldType} {...commonProps} />;
      
      case 'number':
        return (
          <input 
            type="number" 
            {...commonProps}
            min={field.validationRules.min}
            max={field.validationRules.max}
            step={field.validationRules.precision ? `0.${'0'.repeat(field.validationRules.precision - 1)}1` : 'any'}
          />
        );
      
      case 'textarea':
        return (
          <textarea 
            {...commonProps}
            rows={4}
            className={commonProps.className + ' resize-vertical'}
          />
        );
      
      case 'select':
        return (
          <select {...commonProps}>
            <option value="">Select {field.label}</option>
            {field.options?.map(option => (
              <option 
                key={option.value} 
                value={option.value} 
                disabled={option.disabled}
                title={option.description}
              >
                {option.label}
              </option>
            ))}
          </select>
        );
      
      case 'checkbox':
        return (
          <input 
            type="checkbox" 
            {...commonProps}
            checked={value === true}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
        );
      
      case 'date':
      case 'datetime-local':
        return <input type={field.fieldType} {...commonProps} />;
      
      case 'variant-configurator':
      case 'variant_configurator':
        return renderVariantConfigurator(field);
      
      case 'channel-settings':
        return renderChannelSettings(field);
      
      case 'file':
      case 'image':
      case 'media':
        return renderImageGallery(field);
      
      default:
        return <input type="text" {...commonProps} />;
    }
  };

  /**
   * Render improved variant configurator with better UX
   */
  // Get all fields that should be available for variant creation
  const getVariantFields = React.useCallback(() => {
    if (!schema?.fields) return [];
    
    return schema.fields.filter(field => {
      // Exclude the configurator itself and hasVariants checkbox
      if (field.fieldName === 'variantConfigurator' || field.fieldName === 'hasVariants') {
        return false;
      }
      
      // Include fields that are variant attribute fields
      return (
        // Fields that show when hasVariants is true (like size, color)
        (field.conditionalVisibility?.showWhen?.includes('hasVariants === true')) ||
        // Fields in the variants group
        (field.group === 'variants') ||
        // Common variant attribute fields
        (['size', 'color', 'material', 'style', 'pattern', 'finish'].includes(field.fieldName))
      );
    });
  }, [schema.fields]);

  // Generate variants dynamically based on current form selections
  const generateDynamicVariants = React.useCallback(() => {
    const variantFields = getVariantFields();
    const variants: any[] = [];
    
    // Get current selections for variant fields
    const variantSelections: Record<string, any> = {};
    let hasAnySelection = false;
    
    variantFields.forEach(field => {
      const value = formData[field.fieldName];
      if (value && value !== '') {
        variantSelections[field.fieldName] = value;
        hasAnySelection = true;
      }
    });
    
    // Only create variant if there are selections
    if (!hasAnySelection) {
      return variants;
    }
    
    // Generate SKU from selections
    const skuParts = [formData.name || 'PRODUCT'];
    Object.entries(variantSelections).forEach(([fieldName, value]) => {
      skuParts.push(value);
    });
    const sku = skuParts.join('-').replace(/\s+/g, '-').toUpperCase();
    
    // Create variant object
    const variant = {
      ...variantSelections,
      sku,
      price: formData.price || 0,
      comparePrice: formData.comparePrice || 0,
      costPrice: formData.costPrice || 0,
      weight: formData.weight || 0,
      inventory: 0,
      lowStockAlert: formData.lowStockAlert || 5
    };
    
    variants.push(variant);
    return variants;
  }, [formData, getVariantFields]);

  // Remove automatic variant generation to prevent infinite loops
  // Variants will only be generated when user explicitly creates them

  /**
   * Render Channel Settings - Platform-specific configurations
   */
  const renderChannelSettings = (field: FormField) => {
    const channels = ['shopify', 'amazon', 'walmart', 'ebay', 'etsy', 'magento', 'woocommerce'];
    
    // Get current channel settings from form data
    const channelSettings = formData[field.fieldName] || {};
    
    // Update channel settings
    const updateChannelSettings = (channelName: string, settingKey: string, value: any) => {
      const newSettings = {
        ...channelSettings,
        [channelName]: {
          ...channelSettings[channelName],
          [settingKey]: value
        }
      };
      
      setFormData({ 
        ...formData, 
        [field.fieldName]: newSettings 
      });
    };
    
    // Toggle channel enabled/disabled
    const toggleChannel = (channelName: string, enabled: boolean) => {
      const newSettings = {
        ...channelSettings,
        [channelName]: {
          ...channelSettings[channelName],
          enabled,
          // Set default values when enabling
          ...(enabled && !channelSettings[channelName] ? {
            title: formData.name || '',
            description: formData.description || '',
            price: formData.price || '',
            status: 'draft',
            publishSchedule: 'immediate'
          } : {})
        }
      };
      
      setFormData({ 
        ...formData, 
        [field.fieldName]: newSettings 
      });
    };

    // Get channel-specific configuration
    const getChannelConfig = (channelName: string) => {
      const configs: Record<string, any> = {
        shopify: {
          icon: '🛍️',
          color: 'bg-green-100 border-green-500',
          fields: ['title', 'description', 'price', 'status', 'seo', 'inventory', 'publishSchedule']
        },
        amazon: {
          icon: '📦',
          color: 'bg-orange-100 border-orange-500',
          fields: ['title', 'description', 'price', 'asin', 'category', 'fulfillmentBy', 'keywords']
        },
        walmart: {
          icon: '🏪',
          color: 'bg-blue-100 border-blue-500',
          fields: ['title', 'description', 'price', 'upc', 'category', 'brand', 'publishSchedule']
        },
        ebay: {
          icon: '🔨',
          color: 'bg-yellow-100 border-yellow-500',
          fields: ['title', 'description', 'price', 'condition', 'shippingPolicy', 'returnPolicy']
        },
        etsy: {
          icon: '🎨',
          color: 'bg-purple-100 border-purple-500',
          fields: ['title', 'description', 'price', 'tags', 'materials', 'handmade', 'occasion']
        },
        magento: {
          icon: '🔧',
          color: 'bg-red-100 border-red-500',
          fields: ['title', 'description', 'price', 'status', 'visibility', 'categories', 'attributes']
        },
        woocommerce: {
          icon: '🌐',
          color: 'bg-indigo-100 border-indigo-500',
          fields: ['title', 'description', 'price', 'status', 'categories', 'tags', 'inventory']
        }
      };
      return configs[channelName] || { icon: '📊', color: 'bg-gray-100 border-gray-500', fields: ['title', 'description', 'price'] };
    };

    return (
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Channel Settings</h3>
            <p className="text-sm text-gray-500">Configure platform-specific settings for each sales channel</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                // Enable all channels with default settings
                const allChannelsEnabled = channels.reduce((acc, ch) => ({
                  ...acc,
                  [ch]: {
                    enabled: true,
                    title: formData.name || '',
                    description: formData.description || '',
                    price: formData.price || '',
                    status: 'draft',
                    publishSchedule: 'immediate'
                  }
                }), {});
                setFormData({ ...formData, [field.fieldName]: allChannelsEnabled });
              }}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Enable All
            </button>
            <button
              type="button"
              onClick={() => {
                // Disable all channels
                const allChannelsDisabled = channels.reduce((acc, ch) => ({
                  ...acc,
                  [ch]: { enabled: false }
                }), {});
                setFormData({ ...formData, [field.fieldName]: allChannelsDisabled });
              }}
              className="px-3 py-1 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Disable All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {channels.map((channelName) => {
            const config = getChannelConfig(channelName);
            const settings = channelSettings[channelName] || {};
            const isEnabled = settings.enabled || false;

            return (
              <div key={channelName} className={`border-2 rounded-lg p-4 transition-all ${
                isEnabled ? config.color + ' shadow-md' : 'bg-gray-50 border-gray-200'
              }`}>
                {/* Channel Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{config.icon}</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 capitalize">{channelName}</h4>
                      <p className="text-xs text-gray-500">
                        {isEnabled ? 'Active' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => toggleChannel(channelName, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Channel Settings - Only show when enabled */}
                {isEnabled && (
                  <div className="space-y-4">
                    {/* Common Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Title
                        </label>
                        <input
                          type="text"
                          value={settings.title || ''}
                          onChange={(e) => updateChannelSettings(channelName, 'title', e.target.value)}
                          placeholder={formData.name || 'Enter product title...'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>

                      <div className="md:col-span-2 xl:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          value={settings.description || ''}
                          onChange={(e) => updateChannelSettings(channelName, 'description', e.target.value)}
                          placeholder={formData.description || 'Enter channel-specific description...'}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Price
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={settings.price || ''}
                          onChange={(e) => updateChannelSettings(channelName, 'price', e.target.value)}
                          placeholder={formData.price || '0.00'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={settings.status || 'draft'}
                          onChange={(e) => updateChannelSettings(channelName, 'status', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>

                      {/* Channel-specific fields */}
                      {channelName === 'amazon' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              ASIN
                            </label>
                            <input
                              type="text"
                              value={settings.asin || ''}
                              onChange={(e) => updateChannelSettings(channelName, 'asin', e.target.value)}
                              placeholder="B01EXAMPLE"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Fulfillment
                            </label>
                            <select
                              value={settings.fulfillmentBy || 'merchant'}
                              onChange={(e) => updateChannelSettings(channelName, 'fulfillmentBy', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              <option value="merchant">Merchant</option>
                              <option value="amazon">Amazon FBA</option>
                            </select>
                          </div>
                        </>
                      )}

                      {channelName === 'walmart' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            UPC Code
                          </label>
                          <input
                            type="text"
                            value={settings.upc || ''}
                            onChange={(e) => updateChannelSettings(channelName, 'upc', e.target.value)}
                            placeholder="123456789012"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      )}

                      {channelName === 'etsy' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Tags
                            </label>
                            <input
                              type="text"
                              value={settings.tags || ''}
                              onChange={(e) => updateChannelSettings(channelName, 'tags', e.target.value)}
                              placeholder="handmade, unique, gift"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          <div className="flex items-center pt-6">
                            <label className="flex items-center space-x-2 text-sm">
                              <input
                                type="checkbox"
                                checked={settings.handmade || false}
                                onChange={(e) => updateChannelSettings(channelName, 'handmade', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>Handmade</span>
                            </label>
                          </div>
                        </>
                      )}

                      {/* Publish Schedule */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Publish Schedule
                        </label>
                        <select
                          value={settings.publishSchedule || 'immediate'}
                          onChange={(e) => updateChannelSettings(channelName, 'publishSchedule', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="immediate">Publish Immediately</option>
                          <option value="manual">Manual Approval</option>
                          <option value="scheduled">Schedule for Later</option>
                        </select>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            // Copy from main product data
                            updateChannelSettings(channelName, 'title', formData.name || '');
                            updateChannelSettings(channelName, 'description', formData.description || '');
                            updateChannelSettings(channelName, 'price', formData.price || '');
                          }}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          📋 Copy from Main
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newSettings = { ...channelSettings };
                            delete newSettings[channelName];
                            setFormData({ ...formData, [field.fieldName]: newSettings });
                          }}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                        >
                          🗑️ Reset
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">
                        Last updated: Now
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Channel Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Channel Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="text-blue-700">
              <span className="font-medium">Active:</span> {channels.filter(ch => channelSettings[ch]?.enabled).length}
            </div>
            <div className="text-blue-700">
              <span className="font-medium">Total:</span> {channels.length}
            </div>
            <div className="text-blue-700">
              <span className="font-medium">Configured:</span> {Object.keys(channelSettings).filter(ch => channelSettings[ch]?.title).length}
            </div>
            <div className="text-blue-700">
              <span className="font-medium">Ready to Publish:</span> {Object.keys(channelSettings).filter(ch => 
                channelSettings[ch]?.enabled && 
                channelSettings[ch]?.title && 
                channelSettings[ch]?.description && 
                channelSettings[ch]?.price
              ).length}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render Image Gallery with drag-and-drop upload
   */
  const renderImageGallery = (field: FormField) => {
    const maxImages = field.validationRules?.maxItems || 10;
    const acceptedTypes = 'image/*';
    const fieldImages = uploadedImages[field.fieldName] || [];
    
    console.log(`[renderImageGallery] ===== RENDERING IMAGE GALLERY =====`);
    console.log(`[renderImageGallery] Field: ${field.fieldName}, Type: ${field.fieldType}`);
    console.log(`[renderImageGallery] Field Images:`, fieldImages);
    console.log(`[renderImageGallery] All uploaded images:`, uploadedImages);
    console.log(`[renderImageGallery] Max Images: ${maxImages}`);

    const handleFileUpload = (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const newImages: ImageFile[] = [];

      fileArray.forEach((file, index) => {
        if (fieldImages.length + newImages.length < maxImages) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const newImage: ImageFile = {
              id: `upload-${Date.now()}-${index}`,
              file,
              url: e.target?.result as string,
              name: file.name,
              size: file.size,
              type: file.type,
              isPrimary: fieldImages.length === 0 && index === 0,
              altText: `Product image - ${file.name}`
            };
            
            setUploadedImages(prev => {
              const updatedFieldImages = [...(prev[field.fieldName] || []), newImage];
              const updated = { ...prev, [field.fieldName]: updatedFieldImages };
              // Update form data with URLs
              const urls = updatedFieldImages.map(img => img.url);
              handleFieldChange(field.fieldName, urls);
              return updated;
            });
          };
          reader.readAsDataURL(file);
        }
      });
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      
      const files = e.dataTransfer.files;
      if (files) {
        handleFileUpload(files);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        handleFileUpload(files);
      }
    };

    const removeImage = (imageId: string) => {
      setUploadedImages(prev => {
        const currentFieldImages = prev[field.fieldName] || [];
        const updated = currentFieldImages.filter(img => img.id !== imageId);
        // If we removed the primary image, make the first remaining image primary
        if (updated.length > 0 && !updated.some(img => img.isPrimary)) {
          updated[0].isPrimary = true;
        }
        // Update form data
        const urls = updated.map(img => img.url);
        handleFieldChange(field.fieldName, urls);
        return { ...prev, [field.fieldName]: updated };
      });
    };

    const setPrimaryImage = (imageId: string) => {
      setUploadedImages(prev => {
        const currentFieldImages = prev[field.fieldName] || [];
        const updated = currentFieldImages.map(img => ({
          ...img,
          isPrimary: img.id === imageId
        }));
        return { ...prev, [field.fieldName]: updated };
      });
    };

    const updateImageData = (imageId: string, updates: Partial<ImageFile>) => {
      setUploadedImages(prev => {
        const currentFieldImages = prev[field.fieldName] || [];
        const updated = currentFieldImages.map(img => img.id === imageId ? { ...img, ...updates } : img);
        return { ...prev, [field.fieldName]: updated };
      });
    };

    const reorderImages = (dragIndex: number, hoverIndex: number) => {
      setUploadedImages(prev => {
        const currentFieldImages = prev[field.fieldName] || [];
        const updated = [...currentFieldImages];
        const draggedImage = updated[dragIndex];
        updated.splice(dragIndex, 1);
        updated.splice(hoverIndex, 0, draggedImage);
        
        // Update form data
        const urls = updated.map(img => img.url);
        handleFieldChange(field.fieldName, urls);
        return { ...prev, [field.fieldName]: updated };
      });
    };

    return (
      <div className="w-full space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
        {/* Debug Info */}
        <div className="text-xs text-blue-600 mb-2">
          🖼️ Image Gallery Field: {field.fieldName} | Type: {field.fieldType} | Images: {fieldImages.length}
        </div>
        
        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer hover:border-blue-400 hover:bg-blue-50 ${
            dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes}
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="space-y-2">
            <div className="text-4xl">📸</div>
            <div className="text-lg font-medium text-gray-700">
              {fieldImages.length === 0 ? 'Upload Product Images' : 'Add More Images'}
            </div>
            <div className="text-sm text-gray-500">
              Drag and drop images here, or click to browse
            </div>
            <div className="text-xs text-gray-400">
              Maximum {maxImages} images • Supports JPG, PNG, GIF, WebP
            </div>
            {fieldImages.length > 0 && (
              <div className="text-xs text-blue-600">
                {fieldImages.length} of {maxImages} images uploaded
              </div>
            )}
          </div>
          
          {/* Test button for demo purposes - shown when no images */}
          {process.env.NODE_ENV === 'development' && fieldImages.length === 0 && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  const sampleImages: ImageFile[] = [
                    {
                      id: 'sample-1',
                      url: 'https://picsum.photos/400/400?random=1',
                      name: 'Sample Image 1',
                      isPrimary: true,
                      altText: 'Sample product image 1'
                    },
                    {
                      id: 'sample-2', 
                      url: 'https://picsum.photos/400/400?random=2',
                      name: 'Sample Image 2',
                      isPrimary: false,
                      altText: 'Sample product image 2'
                    }
                  ];
                  setUploadedImages(prev => ({
                    ...prev,
                    [field.fieldName]: sampleImages
                  }));
                  handleFieldChange(field.fieldName, sampleImages.map(img => img.url));
                }}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 shadow-sm"
              >
                📋 Add Sample Images (for testing)
              </button>
            </div>
          )}
        </div>

        {/* Image Gallery */}
        {fieldImages.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-700">Product Images</h4>
              <div className="text-sm text-gray-500">
                {fieldImages.length} image{fieldImages.length !== 1 ? 's' : ''}
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {fieldImages.map((image, index) => (
                <div
                  key={image.id}
                  className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', index.toString())}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    reorderImages(dragIndex, index);
                  }}
                >
                  {/* Primary Badge */}
                  {image.isPrimary && (
                    <div className="absolute top-2 left-2 z-10 bg-blue-600 text-white text-xs px-2 py-1 rounded">
                      Primary
                    </div>
                  )}
                  
                  {/* Image */}
                  <div className="aspect-square relative bg-gray-100 border border-gray-200">
                    <img
                      src={image.url}
                      alt={image.altText || image.name}
                      className="w-full h-full object-cover transition-opacity duration-200"
                      onLoad={(e) => {
                        console.log(`[Image] Successfully loaded: ${image.name}`, image.url);
                        e.currentTarget.style.opacity = '1';
                      }}
                      onError={(e) => {
                        console.error(`[Image] Failed to load: ${image.name}`, image.url);
                        // Show a fallback
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent && !parent.querySelector('.fallback-icon')) {
                          const fallback = document.createElement('div');
                          fallback.className = 'fallback-icon w-full h-full flex items-center justify-center text-gray-400 text-4xl bg-gray-50';
                          fallback.innerHTML = '🖼️';
                          parent.appendChild(fallback);
                        }
                      }}
                      style={{ opacity: 0 }}
                    />
                    
                    {/* Overlay Controls */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-all flex space-x-2">
                        {!image.isPrimary && (
                          <button
                            type="button"
                            onClick={() => setPrimaryImage(image.id)}
                            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 text-xs"
                            title="Set as primary image"
                          >
                            ⭐
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(image.id)}
                          className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700 text-xs"
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Image Info */}
                  <div className="p-3 space-y-2">
                    <div className="text-sm font-medium text-gray-700 truncate">
                      {image.name}
                    </div>
                    {image.size && (
                      <div className="text-xs text-gray-500">
                        {(image.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    )}
                    
                    {/* Alt Text Input */}
                    <input
                      type="text"
                      placeholder="Alt text..."
                      value={image.altText || ''}
                      onChange={(e) => updateImageData(image.id, { altText: e.target.value })}
                      className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  
                  {/* Drag Handle */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all bg-gray-700 text-white p-1 rounded cursor-move text-xs">
                    ⋮⋮
                  </div>
                </div>
              ))}
            </div>
            
            {/* Gallery Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={fieldImages.length >= maxImages}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                + Add Images
              </button>
              
              {fieldImages.length > 1 && (
                <div className="text-xs text-gray-500 flex items-center">
                  💡 Drag images to reorder • First image will be used as primary
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderVariantConfigurator = (field: FormField) => {
    // Get dynamic variant fields from schema
    const variantFields = getVariantFields();
    
    // Get variants for this specific field from component-level state
    const fieldVariants = localVariants[field.fieldName] || [];
    

    const handleGenerateVariant = () => {
      const newVariants = generateDynamicVariants();
      if (newVariants.length === 0) {
        alert('Please select at least one variant attribute first');
        return;
      }

      const newVariant = newVariants[0];
      
      // Check if variant already exists by comparing all variant attributes
      const exists = fieldVariants.some((existing: any) => {
        return variantFields.every(varField => {
          const newValue = newVariant[varField.fieldName];
          const existingValue = existing[varField.fieldName];
          return newValue === existingValue;
        });
      });

      if (exists) {
        alert('This variant combination already exists');
        return;
      }

      setLocalVariants(prev => {
        const updated = [...fieldVariants, ...newVariants];
        
        // Update main form data to trigger real-time JSON preview
        handleFieldChange(field.fieldName, updated);
        
        return {
          ...prev,
          [field.fieldName]: updated
        };
      });
    };

    const updateVariantField = (variantIndex: number, fieldName: string, value: any) => {
      setLocalVariants(prev => {
        const updated = [...fieldVariants];
        updated[variantIndex] = { 
          ...updated[variantIndex], 
          [fieldName]: value 
        };
        const newVariantData = {
          ...prev,
          [field.fieldName]: updated
        };
        
        // Update main form data to trigger real-time JSON preview
        handleFieldChange(field.fieldName, updated);
        
        return newVariantData;
      });
    };

    const removeVariant = (variantIndex: number) => {
      setLocalVariants(prev => {
        const updated = fieldVariants.filter((_: any, index: number) => index !== variantIndex);
        
        // Update main form data to trigger real-time JSON preview
        handleFieldChange(field.fieldName, updated);
        
        return {
          ...prev,
          [field.fieldName]: updated
        };
      });
    };

    // Render dynamic field input based on field type
    const renderVariantFieldInput = (varField: FormField, currentValue: any) => {
      const fieldId = `variant-${varField.fieldName}`;
      
      switch (varField.fieldType.toLowerCase()) {
        case 'select':
          return (
            <select
              id={fieldId}
              value={currentValue || ''}
              onChange={(e) => handleFieldChange(varField.fieldName, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select {varField.label}</option>
              {varField.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        
        case 'number':
          return (
            <input
              id={fieldId}
              type="number"
              value={currentValue || ''}
              onChange={(e) => handleFieldChange(varField.fieldName, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={varField.placeholder}
            />
          );
        
        case 'text':
        default:
          return (
            <input
              id={fieldId}
              type="text"
              value={currentValue || ''}
              onChange={(e) => handleFieldChange(varField.fieldName, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={varField.placeholder}
            />
          );
      }
    };

    return (
      <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        {/* Instructions */}
        <div className="bg-white p-3 rounded border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">✨ Product Variants</h4>
          <p className="text-sm text-blue-700 mb-2">
            Create different variations of your product (e.g., Small Red, Large Blue) by selecting combinations below.
          </p>
          <div className="text-xs text-blue-600">
            💡 <strong>Tip:</strong> Create one variant at a time by selecting size/color and clicking "Add Variant".
          </div>
        </div>

        {/* Dynamic Variant Creation */}
        <div className="bg-white p-4 rounded border border-gray-200">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Create New Variant:</h4>
            <p className="text-xs text-gray-600 mb-3">
              Configure variant attributes below and click "Add Variant" to create a new product variation.
            </p>
          </div>
          
          {/* Dynamic Variant Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {variantFields.map((varField) => (
              <div key={varField.fieldName}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {varField.label}
                  {varField.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderVariantFieldInput(varField, formData[varField.fieldName])}
                {varField.helpText && (
                  <div className="text-xs text-gray-500 mt-1">{varField.helpText}</div>
                )}
              </div>
            ))}
            
            {/* Add Variant Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleGenerateVariant}
                className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Add Variant
              </button>
            </div>
          </div>

          {/* Current Selection Preview */}
          {(() => {
            const currentVariants = generateDynamicVariants();
            const hasSelections = currentVariants.length > 0;
            
            return hasSelections && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-xs text-blue-700 mb-1">Preview:</div>
                <div className="text-sm font-medium text-blue-900">
                  {variantFields.map((varField, index) => {
                    const value = formData[varField.fieldName];
                    if (!value) return null;
                    return (
                      <span key={varField.fieldName}>
                        {index > 0 && ' • '}
                        {varField.label}: {value}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  SKU: {currentVariants[0]?.sku}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Created Variants */}
        {fieldVariants.length > 0 ? (
          <div className="bg-white rounded border border-gray-200">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h4 className="font-medium text-gray-900">
                Product Variants ({fieldVariants.length})
              </h4>
              <p className="text-xs text-gray-600">
                Manage pricing, inventory, and other variant-specific settings
              </p>
            </div>
            <div className="p-4">
              {/* Horizontal Scrollable Grid Container */}
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  {/* Grid Header */}
                  <div className="grid grid-cols-[40px_1fr_100px_100px_100px_100px_100px_100px_100px_60px] gap-2 py-2 px-2 bg-gray-100 rounded-t-lg border-b border-gray-200 text-xs font-medium text-gray-700">
                    <div className="text-center">⋮⋮</div>
                    <div>Variant</div>
                    <div>Price ($)</div>
                    <div>Compare ($)</div>
                    <div>Cost ($)</div>
                    <div>Inventory</div>
                    <div>Weight (lbs)</div>
                    <div>Low Alert</div>
                    <div>Track Inv.</div>
                    <div className="text-center">✕</div>
                  </div>

                  {/* Grid Rows */}
                  <div className="bg-white rounded-b-lg border border-t-0 border-gray-200">
                    {fieldVariants.map((variant: any, index: number) => (
                      <div
                        key={index}
                        draggable="true"
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', index.toString());
                          e.currentTarget.style.opacity = '0.5';
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                          const dropIndex = index;
                          
                          if (draggedIndex !== dropIndex) {
                            setLocalVariants(prev => {
                              const updated = [...fieldVariants];
                              const draggedItem = updated[draggedIndex];
                              updated.splice(draggedIndex, 1);
                              updated.splice(dropIndex, 0, draggedItem);
                              return {
                                ...prev,
                                [field.fieldName]: updated
                              };
                            });
                          }
                        }}
                        className={`grid grid-cols-[40px_1fr_100px_100px_100px_100px_100px_100px_100px_60px] gap-2 py-3 px-2 border-b border-gray-100 hover:bg-gray-50 transition-all cursor-move ${
                          index === fieldVariants.length - 1 ? 'border-b-0' : ''
                        }`}
                        title="Drag to reorder variants"
                      >
                        {/* Drag Handle */}
                        <div className="flex items-center justify-center">
                          <div className="text-gray-400 cursor-grab active:cursor-grabbing text-sm">
                            ⋮⋮
                          </div>
                        </div>

                        {/* Variant Info */}
                        <div className="flex flex-col justify-center min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">
                            {variantFields.map((varField, fieldIndex) => {
                              const value = variant[varField.fieldName];
                              if (!value) return null;
                              return (
                                <span key={varField.fieldName}>
                                  {fieldIndex > 0 && ' • '}
                                  {varField.label}: {value}
                                </span>
                              );
                            })}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            SKU: {variant.sku}
                          </div>
                        </div>

                        {/* Price */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.price || 0}
                            onChange={(e) => updateVariantField(index, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Compare Price */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.comparePrice || 0}
                            onChange={(e) => updateVariantField(index, 'comparePrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Cost Price */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.costPrice || 0}
                            onChange={(e) => updateVariantField(index, 'costPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Inventory */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            value={variant.inventory || 0}
                            onChange={(e) => updateVariantField(index, 'inventory', parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Weight */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.weight || 0}
                            onChange={(e) => updateVariantField(index, 'weight', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Low Stock Alert */}
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            value={variant.lowStockAlert || 5}
                            onChange={(e) => updateVariantField(index, 'lowStockAlert', parseInt(e.target.value) || 5)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {/* Track Inventory */}
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={variant.trackInventory !== false}
                            onChange={(e) => updateVariantField(index, 'trackInventory', e.target.checked)}
                            className="text-blue-600"
                          />
                        </div>

                        {/* Remove Button */}
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => removeVariant(index)}
                            className="w-6 h-6 text-xs text-red-600 hover:bg-red-50 rounded flex items-center justify-center"
                            title="Remove variant"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-4 rounded border border-gray-200 text-center">
            <div className="text-gray-400 mb-2">
              📦 No variants created yet
            </div>
            <p className="text-sm text-gray-600">
              Configure variant attributes above and click "Add Variant" to create product variations
            </p>
          </div>
        )}
      </div>
    );
  };

  /**
   * Render a single field
   */
  const renderField = (field: FormField) => {
    const errors = validationErrors[field.fieldName] || [];
    const isRequired = isFieldRequired(field, formData);
    
    // Debug: log hasVariants field rendering
    if (field.fieldName === 'hasVariants') {
      console.log('Rendering hasVariants field:', field, 'current value:', formData[field.fieldName]);
    }
    
    return (
      <div key={field.fieldName} className={`form-field ${field.width === 'full' || field.fieldName === 'variantConfigurator' ? 'col-span-2' : ''}`}>
        <label htmlFor={field.fieldName} className="block text-sm font-medium text-gray-700 mb-1">
          {field.label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
          {field.businessContext.requiresApproval && (
            <span className="ml-1 text-yellow-500" title="Changes require approval">⚠️</span>
          )}
        </label>
        
        {renderFieldInput(field)}
        
        {field.helpText && (
          <div id={`${field.fieldName}-help`} className="mt-1 text-xs text-gray-500">
            {field.helpText}
          </div>
        )}
        
        {errors.length > 0 && (
          <div id={`${field.fieldName}-error`} className="mt-1 text-xs text-red-600">
            {errors.map((error, index) => (
              <div key={index}>{error}</div>
            ))}
          </div>
        )}
        
        {showBusinessContext && field.businessContext && (
          <div className="mt-1 text-xs text-gray-400">
            Owner: {field.businessContext.businessOwner} | 
            Modified: {field.businessContext.lastModifiedBy}
          </div>
        )}
      </div>
    );
  };

  /**
   * Render fields grouped by sections
   */
  const renderGroupedFields = () => {
    // Safety check for schema and fields
    if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
      return null;
    }
    
    if (!schema.groups || schema.groups.length === 0) {
      const visibleFormFields = schema.fields.filter(f => visibleFields.has(f.fieldName));
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleFormFields.map(renderField)}
        </div>
      );
    }
    
    return (
      <div className="space-y-6">
        {schema.groups.map(group => {
          const groupFields = schema.fields.filter(f => group.fields.includes(f.fieldName));
          const visibleGroupFields = groupFields.filter(f => visibleFields.has(f.fieldName));
          
          // Debug variants group
          if (group.groupName === 'variants') {
            console.log('Variants group - all fields:', group.fields);
            console.log('Variants group - schema fields:', groupFields.map(f => f.fieldName));
            console.log('Variants group - visible fields:', visibleGroupFields.map(f => f.fieldName));
            console.log('Current visibleFields set:', Array.from(visibleFields));
          }
          
          if (visibleGroupFields.length === 0) return null;
          
          const isExpanded = expandedGroups.has(group.groupName);
          
          return (
            <Card key={group.groupName} className="border border-gray-200">
              <CardHeader 
                className={`cursor-pointer ${group.collapsible ? 'hover:bg-gray-50' : ''}`}
                onClick={() => group.collapsible && toggleGroup(group.groupName)}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <div>
                    {group.label}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({visibleGroupFields.length} fields)
                    </span>
                  </div>
                  {group.collapsible && (
                    <span className="text-sm">{isExpanded ? '▼' : '▶'}</span>
                  )}
                </CardTitle>
                {group.description && (
                  <p className="text-sm text-gray-600">{group.description}</p>
                )}
              </CardHeader>
              
              {(!group.collapsible || isExpanded) && (
                <CardContent key={`${group.groupName}-content`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleGroupFields.map(renderField)}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className={`dynamic-form ${className}`}>
      {/* Form Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{schema.title}</h2>
        <p className="text-gray-600">{schema.description}</p>
        
        <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
          <div>
            Form version: {schema.version} | 
            Generated: {new Date(schema.generatedAt).toLocaleString()} |
            Complexity: {schema.metadata.complexity}
          </div>
          <div>
            {schema.metadata.requiredFieldCount} required of {schema.metadata.fieldCount} fields
          </div>
        </div>
      </div>
      
      {/* Governance Information */}
      {showGovernanceInfo && schema.governanceInfo && (
        <Alert className="mb-6">
          <AlertDescription>
            <div className="space-y-2">
              <div><strong>Form Generated By:</strong> {schema.governanceInfo.formGeneratedBy}</div>
              <div><strong>Attributes Version:</strong> {schema.governanceInfo.attributesVersion}</div>
              {schema.governanceInfo.pendingApprovals.length > 0 && (
                <div className="text-yellow-700">
                  <strong>Pending Approvals:</strong> {schema.governanceInfo.pendingApprovals.length} field(s)
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Global Errors */}
      {Object.keys(validationErrors).length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Please fix the following errors before submitting:
            <ul className="mt-2 list-disc list-inside">
              {Object.entries(validationErrors).map(([field, errors]) => 
                errors.map((error, index) => (
                  <li key={`${field}-${index}`}>{error}</li>
                ))
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Form Fields */}
      {renderGroupedFields()}
      
      {/* Form Actions */}
      <div className="mt-8 flex justify-between items-center pt-6 border-t">
        <div className="text-sm text-gray-500">
          Estimated completion time: {Math.ceil((schema?.metadata?.estimatedCompletionTime || 300) / 60)} minutes
        </div>
        
        <div className="flex gap-3">
          <Button 
            type="button" 
            variant="outline"
            disabled={disabled}
          >
            Save Draft
          </Button>
          
          <Button 
            type="submit" 
            disabled={disabled || isValidating}
            className="min-w-[120px]"
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              'Create Product'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default DynamicForm;