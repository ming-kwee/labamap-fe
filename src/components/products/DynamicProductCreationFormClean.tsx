/**
 * Clean Dynamic Product Creation Form
 * 
 * Simplified version focusing on user experience like ProductCreateForm
 * - No complex business rules panels
 * - No governance/approval workflows
 * - Clean, simple UI
 * - Fast product creation
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { Loader2, AlertCircle } from '@/components/ui/icons/Icons';
import DynamicForm from '@/components/forms/DynamicForm';
import { useDynamicForm } from '@/hooks/useDynamicForm';
import { DynamicFormData, FormValidationResult } from '@/types/dynamicForm';
import { MasterProduct } from '@/types/product';

interface DynamicProductCreationFormCleanProps {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Partial<DynamicFormData>;
  targetChannels?: string[];
  productCategory?: string;
  userRole?: 'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY';
  organizationId?: string;
  complianceMode?: 'STRICT' | 'STANDARD' | 'FLEXIBLE';
  workflowStep?: 'DRAFT' | 'REVIEW' | 'APPROVAL' | 'PUBLISH';
  debugMode?: boolean;
}

export default function DynamicProductCreationFormClean({
  onProductCreated,
  initialData = {},
  targetChannels = ['shopify', 'amazon', 'walmart', 'ebay'],
  productCategory = 'electronics',
  userRole = 'BUSINESS_USER',
  organizationId = 'retail-division',
  complianceMode = 'STANDARD',
  workflowStep = 'DRAFT',
  debugMode = false
}: DynamicProductCreationFormCleanProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Stable context object to prevent infinite loops
  const stableContext = useMemo(() => ({
    userId: 'user-123',
    organizationId,
    userRole,
    targetChannels,
    productCategory,
    permissions: ['read', 'write', 'create']
  }), [organizationId, userRole, targetChannels.join(','), productCategory]);

  // Prepare initial data with category from context
  const enrichedInitialData = useMemo(() => ({
    ...initialData,
    category: productCategory // Ensure category is set for conditional visibility
  }), [initialData, productCategory]);

  // Use the dynamic form hook for schema generation
  console.log('[DynamicProductCreationFormClean] Using context:', stableContext);
  console.log('[DynamicProductCreationFormClean] Initial data with category:', enrichedInitialData);
  
  const {
    schema,
    formData,
    isLoadingSchema,
    schemaError,
    updateFormData
  } = useDynamicForm({
    context: stableContext,
    initialData: enrichedInitialData
  });

  // Debug schema
  React.useEffect(() => {
    if (schema) {
      console.log('[DynamicProductCreationFormClean] Schema loaded with', schema.fields.length, 'fields');
      console.log('[DynamicProductCreationFormClean] Conditional fields:', 
        schema.fields.filter(f => f.conditionalVisibility).map(f => ({
          name: f.fieldName,
          showWhen: f.conditionalVisibility?.showWhen,
          hideWhen: f.conditionalVisibility?.hideWhen
        }))
      );
    }
  }, [schema]);

  // Handle form data changes
  const handleFormDataChange = useCallback((newData: DynamicFormData) => {
    updateFormData(newData);
  }, [updateFormData]);

  // Handle validation changes
  const handleValidationChange = useCallback((result: FormValidationResult) => {
    // Handle validation results if needed
  }, []);

  // Handle form submission
  const handleSubmit = async (submissionData: DynamicFormData) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Create master product from form data
      const masterProduct: MasterProduct = {
        id: `prod_${Date.now()}`,
        name: submissionData.name as string || '',
        description: submissionData.description as string || '',
        sku: submissionData.sku as string || `SKU_${Date.now()}`,
        price: Number(submissionData.price) || 0,
        category: submissionData.category as string || productCategory,
        brand: submissionData.brand as string || '',
        tags: submissionData.tags as string[] || [],
        weight: Number(submissionData.weight) || 0,
        galleryImages: submissionData.images as string[] || [],
        quantity: Number(submissionData.inventory) || 0,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Success - notify parent
      onProductCreated?.(masterProduct, targetChannels);
      
    } catch (error) {
      console.error('Failed to create product:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoadingSchema) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading form schema...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (schemaError || !schema) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {schemaError || 'Failed to load form schema. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Submit Error */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Clean Dynamic Form */}
      <DynamicForm
        schema={schema}
        data={formData}
        onChange={handleFormDataChange}
        onSubmit={handleSubmit}
        onValidate={handleValidationChange}
        disabled={isSubmitting}
        showBusinessContext={false}
        showGovernanceInfo={false}
      />

      {/* Debug Info (development only) */}
      {debugMode && (
        <div className="p-4 bg-gray-50 rounded-lg text-xs">
          <h4 className="font-medium mb-2">Debug Info</h4>
          <div className="space-y-1">
            <div>Target Channels: {targetChannels.join(', ')}</div>
            <div>Product Category: {productCategory}</div>
            <div>User Role: {userRole}</div>
            <div>Form Fields: {schema?.fields?.length || 0}</div>
            <div>Form Data Keys: {Object.keys(formData).length}</div>
            <div>Schema Title: {schema?.title}</div>
          </div>
        </div>
      )}


    </div>
  );
}