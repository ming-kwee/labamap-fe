'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2, AlertCircle } from '@/components/ui/icons/Icons';
import { MasterProduct } from '@/types/product';

// Custom Hooks
import { useProductForm } from '@/hooks/useProductForm';
import { useSmartForm } from '@/hooks/useSmartForm';
import { useProductVariants } from '@/hooks/useProductVariants';

// Form Components
import EssentialInformation from './form/EssentialInformation';
import TagsSection from './form/TagsSection';
import AdvancedOptions from './form/AdvancedOptions';
import ProductVariantsSection from './form/ProductVariantsSection';
import RulesValidationPanel from './form/RulesValidationPanel';

interface MasterProductCreationFormProps {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: any;
}

export default function MasterProductCreationForm({ 
  onProductCreated, 
  initialData 
}: MasterProductCreationFormProps) {
  const router = useRouter();
  
  // Main form hook
  const {
    formData,
    isLoading,
    isValidating,
    showAdvanced,
    tags,
    newTag,
    availableCategories,
    businessRulesViolations,
    businessRulesWarnings,
    isExecutingRules,
    hasBlockingViolations,
    setShowAdvanced,
    setNewTag,
    handleFieldChange,
    handleSubmit,
    handleTagAdd,
    handleTagRemove,
    applyPreProcessingRules,
    clearBusinessRulesViolations,
    getFieldError,
    getGeneralErrors
  } = useProductForm({ onProductCreated, initialData });
  
  // Smart form hook
  const {
    categoryRequiredFields,
    fieldSuggestions,
    categoryConfig,
    isLoading: isSmartFormLoading,
    getFieldEnhancement,
    handleSmartFieldChange
  } = useSmartForm(formData.category);
  
  // Variants hook
  const {
    hasVariants,
    variantOptions,
    variants,
    toggleVariantsMode,
    addVariantOption,
    removeVariantOption,
    updateVariant,
    updateVariantsFromFormData
  } = useProductVariants();

  // Update variants when form data changes
  useEffect(() => {
    if (hasVariants) {
      updateVariantsFromFormData(
        formData.sku || 'PROD',
        formData.price || 0,
        formData.quantity,
        formData.weight
      );
    }
  }, [formData.sku, formData.price, formData.quantity, formData.weight, hasVariants]);

  // Enhanced field change handler that integrates smart form
  const enhancedHandleFieldChange = (field: string, value: any) => {
    handleSmartFieldChange(field, value, handleFieldChange);
  };

  // Enhanced field enhancement getter
  const enhancedGetFieldEnhancement = (field: string) => {
    return getFieldEnhancement(field, formData.category || '');
  };

  // Form submission handler
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(hasVariants, variantOptions, variants);
  };

  // General errors for display
  const generalErrors = getGeneralErrors();

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create New Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            {/* General Errors */}
            {generalErrors.map((error, index) => (
              <Alert key={index} variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ))}

            {/* Business Rules Validation */}
            <RulesValidationPanel
              violations={businessRulesViolations}
              warnings={businessRulesWarnings}
              isExecuting={isExecutingRules}
              hasBlockingViolations={hasBlockingViolations}
              onRetry={applyPreProcessingRules}
              onClear={clearBusinessRulesViolations}
              showRuleType={true}
            />

            {/* Essential Information */}
            <EssentialInformation
              formData={formData}
              handleFieldChange={handleFieldChange}
              handleSmartFieldChange={enhancedHandleFieldChange}
              getFieldEnhancement={enhancedGetFieldEnhancement}
              getFieldError={getFieldError}
              isLoading={isSmartFormLoading}
              fieldSuggestions={fieldSuggestions}
              categoryRequiredFields={categoryRequiredFields}
              categoryConfig={categoryConfig}
              availableCategories={availableCategories}
            />

            {/* Tags */}
            <TagsSection
              tags={tags}
              newTag={newTag}
              setNewTag={setNewTag}
              handleTagAdd={handleTagAdd}
              handleTagRemove={handleTagRemove}
            />

            {/* Advanced Options */}
            <AdvancedOptions
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              formData={formData}
              handleFieldChange={handleFieldChange}
              handleSmartFieldChange={enhancedHandleFieldChange}
              getFieldEnhancement={enhancedGetFieldEnhancement}
              getFieldError={getFieldError}
            />

            {/* Product Variants */}
            <ProductVariantsSection
              hasVariants={hasVariants}
              variantOptions={variantOptions}
              variants={variants}
              toggleVariantsMode={(enabled) => toggleVariantsMode(enabled, formData.category)}
              addVariantOption={addVariantOption}
              removeVariantOption={removeVariantOption}
              updateVariant={updateVariant}
            />

            {/* Actions */}
            <div className="flex justify-between pt-6">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={applyPreProcessingRules}
                  disabled={isExecutingRules}
                >
                  {isExecutingRules ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enhancing...
                    </>
                  ) : (
                    'Auto-Enhance'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  disabled={isValidating}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    'Save Draft'
                  )}
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || isValidating}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Product'
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