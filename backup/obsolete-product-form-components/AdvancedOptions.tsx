import React from 'react';
import Input from '@/components/ui/input/Input';
import Label from '@/components/ui/label/Label';
import Textarea from '@/components/ui/textarea/Textarea';
import Button from '@/components/ui/button/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select/Select';
import EnhancedField from '../../src/components/products/form/EnhancedField';

interface AdvancedOptionsProps {
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  formData: any;
  handleFieldChange: (field: string, value: any) => void;
  handleSmartFieldChange: (field: string, value: any) => void;
  getFieldEnhancement: (field: string) => any;
  getFieldError: (field: string) => string | undefined;
}

export default function AdvancedOptions({
  showAdvanced,
  setShowAdvanced,
  formData,
  handleFieldChange,
  handleSmartFieldChange,
  getFieldEnhancement,
  getFieldError
}: AdvancedOptionsProps) {
  return (
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
              <EnhancedField
                fieldName="brand"
                enhancement={getFieldEnhancement('brand')}
                error={getFieldError('brand')}
              >
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
              <EnhancedField
                fieldName="barcode"
                enhancement={getFieldEnhancement('barcode')}
                error={getFieldError('barcode')}
              >
                <Input
                  id="barcode"
                  value={formData.barcode || ''}
                  onChange={(e) => handleFieldChange('barcode', e.target.value)}
                  placeholder="Product barcode"
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
  );
}