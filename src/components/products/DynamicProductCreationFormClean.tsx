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
import { MasterProduct, ProductVariant } from '@/types/product';

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
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [currentFormData, setCurrentFormData] = useState<DynamicFormData>(initialData || {});

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
    // Update current form data for real-time preview
    setCurrentFormData(newData);
    updateFormData(newData);
  }, [updateFormData]);

  // Handle validation changes
  const handleValidationChange = useCallback((result: FormValidationResult) => {
    // Handle validation results if needed
  }, []);

  // Generate dynamic masterProduct from form data
  const generateMasterProduct = (formData: DynamicFormData): MasterProduct => {
    const now = new Date().toISOString();
    
    // Base required fields
    const masterProduct: MasterProduct = {
      id: `prod_${Date.now()}`,
      sku: formData.sku as string || `SKU_${Date.now()}`,
      name: formData.name as string || '',
      price: Number(formData.price) || 0,
      createdAt: now,
      updatedAt: now
    };

    // Dynamically map ALL form data to masterProduct
    // Basic Information
    if (formData.description) masterProduct.description = formData.description as string;
    if (formData.shortDescription) masterProduct.shortDescription = formData.shortDescription as string;
    if (formData.comparePrice) masterProduct.compareAtPrice = Number(formData.comparePrice);
    if (formData.costPrice) masterProduct.costPerItem = Number(formData.costPrice);
    if (formData.brand) masterProduct.brand = formData.brand as string;
    if (formData.category) masterProduct.category = formData.category as string;
    if (formData.tags) masterProduct.tags = Array.isArray(formData.tags) ? formData.tags : [formData.tags as string];
    if (formData.barcode) masterProduct.barcode = formData.barcode as string;

    // Inventory
    if (formData.inventory) masterProduct.quantity = Number(formData.inventory);
    if (formData.trackInventory) masterProduct.trackQuantity = Boolean(formData.trackInventory);
    if (formData.lowStockAlert) masterProduct.lowStockThreshold = Number(formData.lowStockAlert);

    // Media
    if (formData.images) {
      const images = Array.isArray(formData.images) ? formData.images : [formData.images];
      masterProduct.galleryImages = images as string[];
      if (images.length > 0) masterProduct.mainImage = images[0] as string;
    }

    // Physical Properties
    if (formData.weight) masterProduct.weight = Number(formData.weight);
    if (formData.weightUnit) masterProduct.weightUnit = formData.weightUnit as 'kg' | 'lb' | 'g' | 'oz';
    
    // Create dimensions object if any dimension exists
    if (formData.length || formData.width || formData.height) {
      masterProduct.dimensions = {
        length: Number(formData.length) || 0,
        width: Number(formData.width) || 0,
        height: Number(formData.height) || 0,
        unit: (formData.dimensionUnit as 'cm' | 'in' | 'm' | 'ft') || 'in'
      };
    }

    // SEO
    if (formData.metaTitle) masterProduct.metaTitle = formData.metaTitle as string;
    if (formData.metaDescription) masterProduct.metaDescription = formData.metaDescription as string;
    if (formData.metaKeywords) masterProduct.metaKeywords = Array.isArray(formData.metaKeywords) ? formData.metaKeywords : [formData.metaKeywords as string];

    // Shipping
    if (formData.shippingClass) masterProduct.shippingClass = formData.shippingClass as string;
    if (formData.requiresShipping !== undefined) masterProduct.requiresShipping = Boolean(formData.requiresShipping);
    if (formData.freeShipping !== undefined) masterProduct.freeShipping = Boolean(formData.freeShipping);

    // Status
    if (formData.status) masterProduct.status = formData.status as 'draft' | 'active' | 'archived';
    if (formData.publishedScope) masterProduct.visibility = formData.publishedScope as 'public' | 'private' | 'hidden';

    // Variants
    if (formData.hasVariants !== undefined) masterProduct.hasVariants = Boolean(formData.hasVariants);
    if (formData.variantConfigurator) {
      // Extract variant data from configurator
      const variantData = formData.variantConfigurator;
      if (typeof variantData === 'object' && variantData) {
        masterProduct.variants = variantData as ProductVariant[];
      }
    }

    // Channel Settings
    if (formData.channelSettings) {
      masterProduct.channelMappings = [];
      const channelSettings = formData.channelSettings as Record<string, any>;
      
      Object.keys(channelSettings).forEach(channelName => {
        const settings = channelSettings[channelName];
        if (settings?.enabled) {
          masterProduct.channelMappings?.push({
            channelId: channelName,
            mappedAt: now,
            status: 'mapped',
            confidence: 0.95,
            mappedFields: Object.keys(settings).length - 1, // -1 for 'enabled' field
            totalFields: 10 // Approximate
          });
        }
      });
    }

    // Custom Attributes - capture any fields not explicitly mapped
    const knownFields = new Set([
      'sku', 'name', 'description', 'shortDescription', 'price', 'comparePrice', 'costPrice',
      'brand', 'category', 'tags', 'barcode', 'inventory', 'trackInventory', 'lowStockAlert',
      'images', 'weight', 'weightUnit', 'length', 'width', 'height', 'dimensionUnit',
      'metaTitle', 'metaDescription', 'metaKeywords', 'shippingClass', 'requiresShipping',
      'freeShipping', 'status', 'publishedScope', 'hasVariants', 'variantConfigurator',
      'channelSettings'
    ]);

    const customAttributes: { [key: string]: any } = {};
    Object.keys(formData).forEach(key => {
      if (!knownFields.has(key) && formData[key] !== undefined && formData[key] !== '') {
        customAttributes[key] = formData[key];
      }
    });

    if (Object.keys(customAttributes).length > 0) {
      masterProduct.customAttributes = customAttributes;
    }

    return masterProduct;
  };

  // Handle form submission
  const handleSubmit = async (submissionData: DynamicFormData) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Generate dynamic masterProduct from all form data
      const masterProduct = generateMasterProduct(submissionData);

      console.log('[DynamicProductCreationForm] Generated masterProduct:', masterProduct);

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

      {/* JSON Preview Toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowJsonPreview(!showJsonPreview)}
          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
        >
          {showJsonPreview ? '🙈 Hide' : '👁️ Show'} Real-time JSON Preview
        </button>
      </div>

      {/* Main Content Layout */}
      <div className={`${showJsonPreview ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
        {/* Clean Dynamic Form */}
        <div className={showJsonPreview ? 'lg:col-span-1' : ''}>
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
        </div>

        {/* Real-time JSON Preview */}
        {showJsonPreview && (
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              {/* Generated masterProduct JSON */}
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                  <h3 className="text-sm font-medium text-gray-100 flex items-center">
                    📋 Generated masterProduct
                    <span className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded">
                      Real-time
                    </span>
                  </h3>
                </div>
                <div className="p-4 overflow-auto max-h-96">
                  <pre className="text-xs text-green-400 font-mono leading-relaxed">
                    {JSON.stringify(generateMasterProduct(currentFormData), null, 2)}
                  </pre>
                </div>
              </div>

              {/* Raw Form Data JSON */}
              <div className="bg-gray-900 rounded-lg overflow-hidden mt-4">
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                  <h3 className="text-sm font-medium text-gray-100 flex items-center">
                    🔧 Raw Form Data
                    <span className="ml-2 px-2 py-1 text-xs bg-purple-600 text-white rounded">
                      Debug
                    </span>
                  </h3>
                </div>
                <div className="p-4 overflow-auto max-h-64">
                  <pre className="text-xs text-cyan-400 font-mono leading-relaxed">
                    {JSON.stringify(currentFormData, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Schema Info */}
              <div className="bg-gray-900 rounded-lg overflow-hidden mt-4">
                <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
                  <h3 className="text-sm font-medium text-gray-100">📊 Schema Info</h3>
                </div>
                <div className="p-4">
                  <div className="space-y-2 text-xs text-gray-300">
                    <div><span className="text-yellow-400">Fields:</span> {schema?.fields?.length || 0}</div>
                    <div><span className="text-yellow-400">Form Data Keys:</span> {Object.keys(currentFormData).length}</div>
                    <div><span className="text-yellow-400">Non-empty Fields:</span> {Object.values(currentFormData).filter(v => v !== undefined && v !== '').length}</div>
                    <div><span className="text-yellow-400">Custom Attributes:</span> {generateMasterProduct(currentFormData).customAttributes ? Object.keys(generateMasterProduct(currentFormData).customAttributes!).length : 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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