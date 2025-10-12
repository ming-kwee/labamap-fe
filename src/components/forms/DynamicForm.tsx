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
   * Render variant configurator for managing product variants
   */
  const renderVariantConfigurator = (field: FormField) => {
    const variantConfig = formData[field.fieldName] ? JSON.parse(formData[field.fieldName] as string) : { options: [], variants: [] };
    
    const addVariantOption = () => {
      const optionName = prompt('Enter option name (e.g., Size, Color):');
      const optionValues = prompt('Enter option values separated by commas (e.g., S,M,L):');
      
      if (optionName && optionValues) {
        const newOption = {
          name: optionName.trim(),
          values: optionValues.split(',').map(v => v.trim()).filter(v => v)
        };
        
        const newConfig = {
          ...variantConfig,
          options: [...(variantConfig.options || []), newOption]
        };
        
        // Auto-generate variants when options change
        if (newConfig.options.length > 0) {
          newConfig.variants = generateVariantCombinations(newConfig.options);
        }
        
        handleFieldChange(field.fieldName, JSON.stringify(newConfig));
      }
    };

    const removeVariantOption = (index: number) => {
      const newOptions = variantConfig.options.filter((_: any, i: number) => i !== index);
      const newConfig = {
        ...variantConfig,
        options: newOptions,
        variants: newOptions.length > 0 ? generateVariantCombinations(newOptions) : []
      };
      handleFieldChange(field.fieldName, JSON.stringify(newConfig));
    };

    const generateVariantCombinations = (options: any[]): any[] => {
      if (options.length === 0) return [];
      if (options.length === 1) {
        return options[0].values.map((value: string) => ({ 
          [options[0].name]: value,
          sku: `${formData.name || 'PRODUCT'}-${value}`.replace(/\s+/g, '-').toUpperCase(),
          price: formData.price || 0,
          inventory: 0,
          weight: formData.weight || 0
        }));
      }

      const combinations: any[] = [];
      const generateCombos = (currentCombo: any, optionIndex: number) => {
        if (optionIndex === options.length) {
          const variantName = Object.values(currentCombo).join('-');
          combinations.push({
            ...currentCombo,
            sku: `${formData.name || 'PRODUCT'}-${variantName}`.replace(/\s+/g, '-').toUpperCase(),
            price: formData.price || 0,
            inventory: 0,
            weight: formData.weight || 0
          });
          return;
        }

        const option = options[optionIndex];
        option.values.forEach((value: string) => {
          generateCombos({ ...currentCombo, [option.name]: value }, optionIndex + 1);
        });
      };

      generateCombos({}, 0);
      return combinations;
    };

    const updateVariantData = (variantIndex: number, field: string, value: any) => {
      const newVariants = [...(variantConfig.variants || [])];
      newVariants[variantIndex] = { ...newVariants[variantIndex], [field]: value };
      
      const newConfig = {
        ...variantConfig,
        variants: newVariants
      };
      handleFieldChange(field.fieldName, JSON.stringify(newConfig));
    };

    return (
      <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
        {/* Variant Options Configuration */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Configure Variant Options</h4>
          
          {variantConfig.options?.map((option: any, index: number) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2">
              <div>
                <span className="font-medium">{option.name}:</span>
                <span className="ml-2 text-gray-600">{option.values.join(', ')}</span>
              </div>
              <button
                type="button"
                onClick={() => removeVariantOption(index)}
                className="text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
          
          <button
            type="button"
            onClick={addVariantOption}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Variant Option
          </button>
        </div>

        {/* Generated Variants Table */}
        {variantConfig.variants && variantConfig.variants.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Generated Variants ({variantConfig.variants.length})</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-200 px-3 py-2 text-left">Combination</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">SKU</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Price</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Inventory</th>
                    <th className="border border-gray-200 px-3 py-2 text-left">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {variantConfig.variants.map((variant: any, index: number) => {
                    const variantOptions = variantConfig.options?.map((opt: any) => `${opt.name}: ${variant[opt.name]}`).join(' | ') || '';
                    
                    return (
                      <tr key={index}>
                        <td className="border border-gray-200 px-3 py-2">{variantOptions}</td>
                        <td className="border border-gray-200 px-3 py-2">
                          <input
                            type="text"
                            value={variant.sku || ''}
                            onChange={(e) => updateVariantData(index, 'sku', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="border border-gray-200 px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={variant.price || 0}
                            onChange={(e) => updateVariantData(index, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="border border-gray-200 px-3 py-2">
                          <input
                            type="number"
                            value={variant.inventory || 0}
                            onChange={(e) => updateVariantData(index, 'inventory', parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="border border-gray-200 px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={variant.weight || 0}
                            onChange={(e) => updateVariantData(index, 'weight', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
      <div key={field.fieldName} className={`form-field ${field.width === 'full' ? 'col-span-2' : ''}`}>
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