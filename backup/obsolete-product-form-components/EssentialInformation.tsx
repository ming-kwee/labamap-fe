import React from 'react';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Textarea from '@/components/ui/textarea/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select/Select';
import { Loader2 } from '@/components/ui/icons/Icons';
import EnhancedField from '../../src/components/products/form/EnhancedField';
import { SmartSuggestions, RequiredFieldsNotice } from '../../src/components/products/form/SmartPanels';

interface EssentialInformationProps {
  formData: any;
  handleFieldChange: (field: string, value: any) => void;
  handleSmartFieldChange: (field: string, value: any) => void;
  getFieldEnhancement: (field: string) => any;
  getFieldError: (field: string) => string | undefined;
  isLoading: boolean;
  fieldSuggestions: Record<string, string>;
  categoryRequiredFields: string[];
  categoryConfig: any;
  availableCategories: string[];
}

export default function EssentialInformation({
  formData,
  handleFieldChange,
  handleSmartFieldChange,
  getFieldEnhancement,
  getFieldError,
  isLoading,
  fieldSuggestions,
  categoryRequiredFields,
  categoryConfig,
  availableCategories
}: EssentialInformationProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Essential Information</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <EnhancedField
            fieldName="sku"
            enhancement={getFieldEnhancement('sku')}
            error={getFieldError('sku')}
          >
            <Input
              id="sku"
              value={formData.sku || ''}
              onChange={(e) => handleFieldChange('sku', e.target.value)}
              placeholder="Product SKU"
            />
          </EnhancedField>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Product Name</Label>
          <EnhancedField
            fieldName="name"
            enhancement={getFieldEnhancement('name')}
            error={getFieldError('name')}
          >
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => handleSmartFieldChange('name', e.target.value)}
              placeholder="Product name"
            />
          </EnhancedField>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <EnhancedField
            fieldName="price"
            enhancement={getFieldEnhancement('price')}
            error={getFieldError('price')}
          >
            <Input
              id="price"
              type="number"
              step="0.01"
              value={formData.price || ''}
              onChange={(e) => handleSmartFieldChange('price', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </EnhancedField>
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
              {availableCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Smart Field Suggestions */}
      <SmartSuggestions fieldSuggestions={fieldSuggestions} />

      {/* Category-Specific Required Fields Notice */}
      <RequiredFieldsNotice
        categoryRequiredFields={categoryRequiredFields}
        categoryConfig={categoryConfig}
        category={formData.category}
      />

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <EnhancedField
          fieldName="description"
          enhancement={getFieldEnhancement('description')}
          error={getFieldError('description')}
        >
          <Textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="Product description"
            rows={3}
          />
        </EnhancedField>
      </div>
    </div>
  );
}