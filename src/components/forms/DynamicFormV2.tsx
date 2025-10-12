/**
 * Dynamic Form V2 - Clean ProductCreateForm-style implementation
 * 
 * Key Features:
 * - Clean UI components matching ProductCreateForm
 * - Organized section components
 * - Enhanced field wrappers
 * - Schema-driven but user-friendly
 * - Responsive grid layouts
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Textarea from '@/components/ui/textarea/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select/Select';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2, AlertCircle } from '@/components/ui/icons/Icons';
import { DynamicFormSchema, DynamicFormData, FormField, FormValidationResult } from '@/types/dynamicForm';

// Enhanced Field Component (like ProductCreateForm)
interface EnhancedFieldProps {
  fieldName: string;
  error?: string;
  children: React.ReactNode;
}

function EnhancedField({ fieldName, error, children }: EnhancedFieldProps) {
  return (
    <div className="space-y-2">
      {children}
      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}

// Clean Form Section Component
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

function FormSection({ title, description, children, collapsible = false, defaultExpanded = true }: FormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-4">
      <div 
        className={`flex items-center gap-2 ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={collapsible ? () => setIsExpanded(!isExpanded) : undefined}
      >
        {collapsible && (
          <div className="h-4 w-4 flex items-center justify-center text-gray-400">
            {isExpanded ? '▼' : '▶'}
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-gray-600">{description}</p>}
        </div>
      </div>
      
      {(!collapsible || isExpanded) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Product Information Section
interface ProductInfoSectionProps {
  formData: DynamicFormData;
  fields: FormField[];
  errors: Record<string, string>;
  onChange: (fieldName: string, value: any) => void;
}

function ProductInfoSection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const infoFields = fields.filter(f => ['name', 'description', 'sku'].includes(f.fieldName));
  
  
  return (
    <FormSection title="Product Information" description="Essential product details">
      {infoFields.map(field => (
        <div key={field.fieldName} className="space-y-2">
          <Label htmlFor={field.fieldName}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <EnhancedField fieldName={field.fieldName} error={errors[field.fieldName]}>
            {field.fieldType === 'textarea' ? (
              <Textarea
                id={field.fieldName}
                value={formData[field.fieldName] || ''}
                onChange={(e) => onChange(field.fieldName, e.target.value)}
                placeholder={field.description}
                rows={4}
              />
            ) : (
              <Input
                id={field.fieldName}
                value={formData[field.fieldName] || ''}
                onChange={(e) => onChange(field.fieldName, e.target.value)}
                placeholder={field.description}
              />
            )}
          </EnhancedField>
        </div>
      ))}
    </FormSection>
  );
}

// Pricing Section
function PricingSection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const pricingFields = fields.filter(f => ['price', 'comparePrice', 'costPrice'].includes(f.fieldName));
  
  return (
    <FormSection title="Pricing" description="Product pricing and costs">
      {pricingFields.map(field => (
        <div key={field.fieldName} className="space-y-2">
          <Label htmlFor={field.fieldName}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <EnhancedField fieldName={field.fieldName} error={errors[field.fieldName]}>
            <Input
              id={field.fieldName}
              type="number"
              step="0.01"
              min="0"
              value={formData[field.fieldName] || ''}
              onChange={(e) => onChange(field.fieldName, parseFloat(e.target.value) || 0)}
              placeholder={field.description}
            />
          </EnhancedField>
        </div>
      ))}
    </FormSection>
  );
}

// Classification Section
function ClassificationSection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const classFields = fields.filter(f => ['category', 'brand', 'tags'].includes(f.fieldName));
  
  return (
    <FormSection title="Classification" description="Category, brand, and tags" collapsible defaultExpanded>
      {classFields.map(field => (
        <div key={field.fieldName} className="space-y-2">
          <Label htmlFor={field.fieldName}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <EnhancedField fieldName={field.fieldName} error={errors[field.fieldName]}>
            {field.fieldType === 'select' && field.validationRules.enum ? (
              <Select 
                value={formData[field.fieldName] || ''} 
                onValueChange={(value) => onChange(field.fieldName, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.validationRules.enum.map(option => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={field.fieldName}
                value={formData[field.fieldName] || ''}
                onChange={(e) => onChange(field.fieldName, e.target.value)}
                placeholder={field.description}
              />
            )}
          </EnhancedField>
        </div>
      ))}
    </FormSection>
  );
}

// Inventory Section
function InventorySection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const inventoryFields = fields.filter(f => ['inventory', 'trackInventory', 'lowStockAlert'].includes(f.fieldName));
  
  return (
    <FormSection title="Inventory" description="Stock management settings" collapsible defaultExpanded>
      {inventoryFields.map(field => (
        <div key={field.fieldName} className="space-y-2">
          <Label htmlFor={field.fieldName}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <EnhancedField fieldName={field.fieldName} error={errors[field.fieldName]}>
            {field.fieldType === 'checkbox' ? (
              <div className="flex items-center space-x-2">
                <input
                  id={field.fieldName}
                  type="checkbox"
                  checked={formData[field.fieldName] || false}
                  onChange={(e) => onChange(field.fieldName, e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <label htmlFor={field.fieldName} className="text-sm text-gray-700">
                  {field.description}
                </label>
              </div>
            ) : (
              <Input
                id={field.fieldName}
                type="number"
                min="0"
                value={formData[field.fieldName] || ''}
                onChange={(e) => onChange(field.fieldName, parseInt(e.target.value) || 0)}
                placeholder={field.description}
              />
            )}
          </EnhancedField>
        </div>
      ))}
    </FormSection>
  );
}

// Shipping Section
function ShippingSection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const shippingFields = fields.filter(f => ['weight', 'length', 'width', 'height', 'requiresShipping'].includes(f.fieldName));
  
  return (
    <FormSection title="Shipping" description="Dimensions and shipping settings" collapsible>
      {shippingFields.map(field => (
        <div key={field.fieldName} className="space-y-2">
          <Label htmlFor={field.fieldName}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <EnhancedField fieldName={field.fieldName} error={errors[field.fieldName]}>
            {field.fieldType === 'checkbox' ? (
              <div className="flex items-center space-x-2">
                <input
                  id={field.fieldName}
                  type="checkbox"
                  checked={formData[field.fieldName] || false}
                  onChange={(e) => onChange(field.fieldName, e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <label htmlFor={field.fieldName} className="text-sm text-gray-700">
                  {field.description}
                </label>
              </div>
            ) : (
              <Input
                id={field.fieldName}
                type="number"
                step="0.01"
                min="0"
                value={formData[field.fieldName] || ''}
                onChange={(e) => onChange(field.fieldName, parseFloat(e.target.value) || 0)}
                placeholder={field.description}
              />
            )}
          </EnhancedField>
        </div>
      ))}
    </FormSection>
  );
}

// Variants Section (Enhanced)
function VariantsSection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const hasVariants = formData.hasVariants;
  const variantFields = fields.filter(f => ['hasVariants', 'variantConfigurator'].includes(f.fieldName));
  
  return (
    <FormSection title="Product Variants" description="Size, color, and other variations" collapsible>
      {variantFields.map(field => {
        if (field.fieldName === 'hasVariants') {
          return (
            <div key={field.fieldName} className="col-span-2">
              <div className="flex items-center space-x-2">
                <input
                  id={field.fieldName}
                  type="checkbox"
                  checked={formData[field.fieldName] || false}
                  onChange={(e) => onChange(field.fieldName, e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <Label htmlFor={field.fieldName} className="font-medium">
                  This product has variants (size, color, etc.)
                </Label>
              </div>
            </div>
          );
        }
        
        if (field.fieldName === 'variantConfigurator' && hasVariants) {
          return (
            <div key={field.fieldName} className="col-span-2">
              <div className="p-4 border rounded-lg bg-gray-50">
                <p className="text-sm text-gray-600 mb-4">
                  Variant configuration will be enhanced in the next update. 
                  For now, variants are handled in the Master Form.
                </p>
              </div>
            </div>
          );
        }
        
        return null;
      })}
    </FormSection>
  );
}

// Additional Details Section
function AdditionalSection({ formData, fields, errors, onChange }: ProductInfoSectionProps) {
  const additionalFields = fields.filter(f => 
    !['name', 'description', 'sku', 'price', 'comparePrice', 'costPrice', 'category', 'brand', 'tags', 
      'inventory', 'trackInventory', 'lowStockAlert', 'weight', 'length', 'width', 'height', 'requiresShipping',
      'hasVariants', 'variantConfigurator', 'images', 'metaTitle', 'metaDescription', 'status'].includes(f.fieldName)
  );
  
  if (additionalFields.length === 0) return null;
  
  return (
    <FormSection title="Additional Details" description="Other product information" collapsible>
      {additionalFields.map(field => (
        <div key={field.fieldName} className="space-y-2">
          <Label htmlFor={field.fieldName}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <EnhancedField fieldName={field.fieldName} error={errors[field.fieldName]}>
            {field.fieldType === 'select' && field.validationRules.enum ? (
              <Select 
                value={formData[field.fieldName] || ''} 
                onValueChange={(value) => onChange(field.fieldName, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.validationRules.enum.map(option => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.fieldType === 'checkbox' ? (
              <div className="flex items-center space-x-2">
                <input
                  id={field.fieldName}
                  type="checkbox"
                  checked={formData[field.fieldName] || false}
                  onChange={(e) => onChange(field.fieldName, e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <label htmlFor={field.fieldName} className="text-sm text-gray-700">
                  {field.description}
                </label>
              </div>
            ) : (
              <Input
                id={field.fieldName}
                type={field.fieldType === 'number' ? 'number' : 'text'}
                value={formData[field.fieldName] || ''}
                onChange={(e) => onChange(field.fieldName, field.fieldType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                placeholder={field.description}
              />
            )}
          </EnhancedField>
        </div>
      ))}
    </FormSection>
  );
}

// Main Dynamic Form V2 Component
interface DynamicFormV2Props {
  schema: DynamicFormSchema;
  data?: DynamicFormData;
  onChange?: (data: DynamicFormData) => void;
  onSubmit?: (data: DynamicFormData) => void;
  className?: string;
  disabled?: boolean;
}

export default function DynamicFormV2({
  schema,
  data = {},
  onChange,
  onSubmit,
  className = '',
  disabled = false
}: DynamicFormV2Props) {
  const [formData, setFormData] = useState<DynamicFormData>(data);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle field changes
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    const newData = { ...formData, [fieldName]: value };
    setFormData(newData);
    
    // Clear validation error
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => {
        const updated = { ...prev };
        delete updated[fieldName];
        return updated;
      });
    }
    
    // Notify parent
    onChange?.(newData);
  }, [formData, validationErrors, onChange]);

  // Simple validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    schema.fields.forEach(field => {
      if (field.required && !formData[field.fieldName]) {
        errors[field.fieldName] = `${field.label} is required`;
      }
    });
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (disabled || isSubmitting) return;
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit?.(formData);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className={`max-w-4xl mx-auto ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle>Create Product</CardTitle>
          <p className="text-sm text-gray-600">
            Streamlined form for multi-channel ecommerce sync
          </p>
        </CardHeader>
        <CardContent>
          
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Product Information */}
            <ProductInfoSection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Pricing */}
            <PricingSection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Classification */}
            <ClassificationSection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Inventory */}
            <InventorySection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Shipping */}
            <ShippingSection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Variants */}
            <VariantsSection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Additional Details */}
            <AdditionalSection
              formData={formData}
              fields={schema.fields}
              errors={validationErrors}
              onChange={handleFieldChange}
            />

            {/* Submit Button */}
            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Button 
                type="submit" 
                disabled={disabled || isSubmitting}
                className="min-w-32"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Product'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}