/**
 * Simple Dynamic Form - Stable implementation without infinite loops
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Textarea from '@/components/ui/textarea/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select/Select';
import { Loader2, AlertCircle } from '@/components/ui/icons/Icons';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';

interface FormField {
  fieldName: string;
  label: string;
  description?: string;
  fieldType: string;
  required: boolean;
  validationRules: {
    enum?: string[];
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

interface SimpleFormData {
  [key: string]: any;
}

interface DynamicFormSimpleProps {
  onSubmit?: (data: SimpleFormData) => void;
  disabled?: boolean;
}

export default function DynamicFormSimple({ onSubmit, disabled = false }: DynamicFormSimpleProps) {
  const [formData, setFormData] = useState<SimpleFormData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Static form fields for ecommerce (simplified)
  const fields: FormField[] = [
    {
      fieldName: 'name',
      label: 'Product Name',
      description: 'Enter the product name',
      fieldType: 'text',
      required: true,
      validationRules: { minLength: 3, maxLength: 200 }
    },
    {
      fieldName: 'description',
      label: 'Description',
      description: 'Product description',
      fieldType: 'textarea',
      required: true,
      validationRules: { minLength: 10, maxLength: 2000 }
    },
    {
      fieldName: 'sku',
      label: 'SKU',
      description: 'Stock Keeping Unit',
      fieldType: 'text',
      required: true,
      validationRules: { maxLength: 50 }
    },
    {
      fieldName: 'price',
      label: 'Price',
      description: 'Selling price',
      fieldType: 'number',
      required: true,
      validationRules: { min: 0.01 }
    },
    {
      fieldName: 'comparePrice',
      label: 'Compare Price',
      description: 'Original price for comparison',
      fieldType: 'number',
      required: false,
      validationRules: { min: 0 }
    },
    {
      fieldName: 'category',
      label: 'Category',
      description: 'Product category',
      fieldType: 'select',
      required: true,
      validationRules: {
        enum: ['electronics', 'clothing', 'home', 'books', 'sports', 'beauty', 'automotive', 'jewelry', 'toys', 'health']
      }
    },
    {
      fieldName: 'brand',
      label: 'Brand',
      description: 'Product brand',
      fieldType: 'text',
      required: false,
      validationRules: { maxLength: 100 }
    },
    {
      fieldName: 'weight',
      label: 'Weight (lbs)',
      description: 'Product weight',
      fieldType: 'number',
      required: false,
      validationRules: { min: 0 }
    },
    {
      fieldName: 'inventory',
      label: 'Stock Quantity',
      description: 'Available inventory',
      fieldType: 'number',
      required: true,
      validationRules: { min: 0 }
    },
    {
      fieldName: 'hasVariants',
      label: 'Has Variants',
      description: 'Product has variations',
      fieldType: 'checkbox',
      required: false,
      validationRules: {}
    }
  ];

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    
    // Clear error for this field
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    fields.forEach(field => {
      const value = formData[field.fieldName];
      
      if (field.required && (!value || value === '')) {
        newErrors[field.fieldName] = `${field.label} is required`;
      }
      
      if (value && field.validationRules.minLength && value.length < field.validationRules.minLength) {
        newErrors[field.fieldName] = `${field.label} must be at least ${field.validationRules.minLength} characters`;
      }
      
      if (value && field.validationRules.min && value < field.validationRules.min) {
        newErrors[field.fieldName] = `${field.label} must be at least ${field.validationRules.min}`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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

  const renderField = (field: FormField) => {
    const error = errors[field.fieldName];
    
    return (
      <div key={field.fieldName} className="space-y-2">
        <Label htmlFor={field.fieldName}>
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        
        {field.fieldType === 'textarea' ? (
          <Textarea
            id={field.fieldName}
            value={formData[field.fieldName] || ''}
            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
            placeholder={field.description}
            rows={4}
            className={error ? 'border-red-500' : ''}
          />
        ) : field.fieldType === 'select' && field.validationRules.enum ? (
          <Select 
            value={formData[field.fieldName] || ''} 
            onValueChange={(value) => handleFieldChange(field.fieldName, value)}
          >
            <SelectTrigger className={error ? 'border-red-500' : ''}>
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
              onChange={(e) => handleFieldChange(field.fieldName, e.target.checked)}
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
            step={field.fieldType === 'number' ? '0.01' : undefined}
            min={field.fieldType === 'number' ? '0' : undefined}
            value={formData[field.fieldName] || ''}
            onChange={(e) => handleFieldChange(field.fieldName, 
              field.fieldType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
            )}
            placeholder={field.description}
            className={error ? 'border-red-500' : ''}
          />
        )}
        
        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}
      </div>
    );
  };

  // Group fields by section
  const basicFields = fields.filter(f => ['name', 'description', 'sku'].includes(f.fieldName));
  const pricingFields = fields.filter(f => ['price', 'comparePrice'].includes(f.fieldName));
  const classificationFields = fields.filter(f => ['category', 'brand'].includes(f.fieldName));
  const inventoryFields = fields.filter(f => ['inventory', 'weight'].includes(f.fieldName));
  const variantFields = fields.filter(f => ['hasVariants'].includes(f.fieldName));

  return (
    <div className="max-w-4xl mx-auto">
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
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Product Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {basicFields.map(renderField)}
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Pricing</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pricingFields.map(renderField)}
              </div>
            </div>

            {/* Classification */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classificationFields.map(renderField)}
              </div>
            </div>

            {/* Inventory */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Inventory & Shipping</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inventoryFields.map(renderField)}
              </div>
            </div>

            {/* Variants */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Product Variants</h3>
              <div className="grid grid-cols-1 gap-4">
                {variantFields.map(renderField)}
                {formData.hasVariants && (
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-600">
                      Variant configuration is available in the Master Form for now.
                    </p>
                  </div>
                )}
              </div>
            </div>

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