/**
 * Dynamic Form Component
 * Renders forms based on business-controlled schemas with conditional logic
 */

import React, { useState, useEffect, useCallback } from 'react';
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

  // Update form data when data prop changes
  useEffect(() => {
    console.log('[DynamicForm] Data prop changed to:', data);
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
        // Fields in the variants category (except hasVariants and variantConfigurator)
        (field.category === 'variants' && field.fieldName !== 'hasVariants' && field.fieldName !== 'variantConfigurator') ||
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
          const array = evalContext[arrayName];
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
    const newData = { ...formData, [fieldName]: value };
    setFormData(newData);
    
    // Special debugging for hasVariants
    if (fieldName === 'hasVariants') {
      console.log('hasVariants changed! Old data:', formData, 'New data:', newData);
      console.log('Will trigger visibility update...');
      console.log('Looking for variantConfigurator field in schema...');
      const variantConfigField = schema.fields.find(f => f.fieldName === 'variantConfigurator');
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
    if (field.fieldType === 'number') {
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
    
    if (field.fieldType === 'text' || field.fieldType === 'textarea') {
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

    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'url':
      case 'tel':
        return <input type={field.fieldType} {...commonProps} />;
      
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
        return renderVariantConfigurator(field);
      
      default:
        return <input type="text" {...commonProps} />;
    }
  };

  /**
   * Render improved variant configurator with better UX
   */
  // Get all fields that should be available for variant creation
  const getVariantFields = React.useCallback(() => {
    return schema.fields.filter(field => {
      // Exclude the configurator itself and hasVariants checkbox
      if (field.fieldName === 'variantConfigurator' || field.fieldName === 'hasVariants') {
        return false;
      }
      
      // Include fields that are variant attribute fields
      return (
        // Fields that show when hasVariants is true (like size, color)
        (field.conditionalVisibility?.showWhen?.includes('hasVariants === true')) ||
        // Fields in the variants category 
        (field.category === 'variants') ||
        // Common variant attribute fields
        (['size', 'color', 'material', 'style', 'pattern', 'finish'].includes(field.fieldName))
      );
    });
  }, [schema.fields]);

  // Generate variants dynamically based on current form selections
  const generateDynamicVariants = React.useCallback(() => {
    const variantFields = getVariantFields();
    const variants = [];
    
    // Get current selections for variant fields
    const variantSelections = {};
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

  const renderVariantConfigurator = (field: FormField) => {
    // Get dynamic variant fields from schema
    const variantFields = getVariantFields();
    
    // Parse existing variants from form data
    let existingVariants = [];
    try {
      const variantData = formData[field.fieldName];
      if (variantData && typeof variantData === 'string') {
        const parsed = JSON.parse(variantData);
        existingVariants = parsed.variants || [];
      }
    } catch (error) {
      // Invalid JSON, start with empty array
      existingVariants = [];
    }

    const handleGenerateVariant = () => {
      const newVariants = generateDynamicVariants();
      if (newVariants.length === 0) {
        alert('Please select at least one variant attribute first');
        return;
      }

      const newVariant = newVariants[0];
      
      // Check if variant already exists by comparing all variant attributes
      const exists = existingVariants.some(existing => {
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

      const updatedVariants = [...existingVariants, ...newVariants];
      handleFieldChange(field.fieldName, JSON.stringify({ variants: updatedVariants }));
    };

    const updateVariantField = (variantIndex: number, fieldName: string, value: any) => {
      const updatedVariants = [...existingVariants];
      updatedVariants[variantIndex] = { 
        ...updatedVariants[variantIndex], 
        [fieldName]: value 
      };
      handleFieldChange(field.fieldName, JSON.stringify({ variants: updatedVariants }));
    };

    const removeVariant = (variantIndex: number) => {
      const updatedVariants = existingVariants.filter((_, index) => index !== variantIndex);
      handleFieldChange(field.fieldName, JSON.stringify({ variants: updatedVariants }));
    };

    // Render dynamic field input based on field type
    const renderVariantFieldInput = (varField: FormField, currentValue: any) => {
      const fieldId = `variant-${varField.fieldName}`;
      
      switch (varField.fieldType) {
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
        {existingVariants.length > 0 ? (
          <div className="bg-white rounded border border-gray-200">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h4 className="font-medium text-gray-900">
                Product Variants ({existingVariants.length})
              </h4>
              <p className="text-xs text-gray-600">
                Manage pricing, inventory, and other variant-specific settings
              </p>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {existingVariants.map((variant, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    {/* Variant Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">
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
                        <div className="text-xs text-gray-600 mt-1">
                          SKU: {variant.sku}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVariant(index)}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        title="Remove variant"
                      >
                        ✕ Remove
                      </button>
                    </div>

                    {/* Variant Management Fields */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Price ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.price || 0}
                          onChange={(e) => updateVariantField(index, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Compare Price ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.comparePrice || 0}
                          onChange={(e) => updateVariantField(index, 'comparePrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Inventory</label>
                        <input
                          type="number"
                          min="0"
                          value={variant.inventory || 0}
                          onChange={(e) => updateVariantField(index, 'inventory', parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Weight (lbs)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.weight || 0}
                          onChange={(e) => updateVariantField(index, 'weight', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Additional Variant Fields */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cost Price ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.costPrice || 0}
                          onChange={(e) => updateVariantField(index, 'costPrice', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Low Stock Alert</label>
                        <input
                          type="number"
                          min="0"
                          value={variant.lowStockAlert || 5}
                          onChange={(e) => updateVariantField(index, 'lowStockAlert', parseInt(e.target.value) || 5)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div className="flex items-center">
                        <label className="flex items-center text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={variant.trackInventory !== false}
                            onChange={(e) => updateVariantField(index, 'trackInventory', e.target.checked)}
                            className="mr-2 text-blue-600"
                          />
                          Track Inventory
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
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
          Estimated completion time: {Math.ceil(schema.metadata.estimatedCompletionTime / 60)} minutes
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