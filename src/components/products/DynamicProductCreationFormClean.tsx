/**
 * Clean Dynamic Product Creation Form
 * 
 * Simplified version focusing on user experience like ProductCreateForm
 * - No complex business rules panels
 * - No governance/approval workflows
 * - Clean, simple UI
 * - Fast product creation
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
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

  // Stable targetChannels to prevent infinite loops
  const stableTargetChannels = useMemo(() => targetChannels, [JSON.stringify(targetChannels)]);
  
  // Stable context object to prevent infinite loops
  const stableContext = useMemo(() => ({
    userId: 'user-123',
    organizationId,
    userRole,
    targetChannels: stableTargetChannels,
    productCategory,
    permissions: ['read', 'write', 'create']
  }), [organizationId, userRole, stableTargetChannels, productCategory]);

  // Stable initial data to prevent infinite loops
  const stableInitialData = useMemo(() => initialData, [JSON.stringify(initialData)]);
  
  // Prepare initial data with category from context
  const enrichedInitialData = useMemo(() => ({
    ...stableInitialData,
    category: productCategory // Ensure category is set for conditional visibility
  }), [stableInitialData, productCategory]);

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
  useEffect(() => {
    if (schema?.fields) {
      console.log('[DynamicProductCreationFormClean] Schema loaded with', schema.fields.length, 'fields');
      console.log('[DynamicProductCreationFormClean] Conditional fields:', 
        schema.fields.filter(f => f.conditionalVisibility).map(f => ({
          name: f.fieldName,
          showWhen: f.conditionalVisibility?.showWhen,
          hideWhen: f.conditionalVisibility?.hideWhen
        }))
      );
    } else {
      console.log('[DynamicProductCreationFormClean] Schema or fields not available yet');
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

  // Truly dynamic masterProduct generation with zero hardcoded field mappings
  const generateMasterProduct = (formData: DynamicFormData): MasterProduct => {
    const now = new Date().toISOString();
    
    // Base required fields (minimum needed for valid MasterProduct)
    const masterProduct: MasterProduct = {
      id: `prod_${Date.now()}`,
      sku: formData.sku as string || `SKU_${Date.now()}`,
      name: formData.name as string || '',
      price: Number(formData.price) || 0,
      createdAt: now,
      updatedAt: now
    };

    // Configuration-driven field mapping (no hardcoded switches!)
    const fieldMappingConfig = {
      // Direct property mappings (form field -> masterProduct property)
      directMappings: {
        'description': 'description',
        'shortDescription': 'shortDescription', 
        'brand': 'brand',
        'category': 'category',
        'barcode': 'barcode',
        'metaTitle': 'metaTitle',
        'metaDescription': 'metaDescription',
        'shippingClass': 'shippingClass',
        'weight': 'weight',
        'weightUnit': 'weightUnit',
        'status': 'status'
      },
      
      // Field name transformations (form field -> different masterProduct property)
      fieldTransforms: {
        'comparePrice': 'compareAtPrice',
        'costPrice': 'costPerItem', 
        'inventory': 'quantity',
        'lowStockAlert': 'lowStockThreshold',
        'trackInventory': 'trackQuantity',
        'publishedScope': 'visibility'
      },
      
      // Special complex field handlers
      specialFields: {
        'variantConfigurator': (value: any) => {
          if (Array.isArray(value)) {
            return { variants: value };
          } else if (typeof value === 'object' && value) {
            const variantData = value as any;
            if (variantData.variants && Array.isArray(variantData.variants)) {
              return { variants: variantData.variants };
            }
            return { variants: value };
          }
          return {};
        },
        
        'images': (value: any) => {
          const images = Array.isArray(value) ? value : [value];
          return {
            galleryImages: images,
            mainImage: images.length > 0 ? images[0] : undefined
          };
        },
        
        'channelSettings': (value: any) => {
          const channelMappings: any[] = [];
          const channelSettings = value as Record<string, any>;
          Object.keys(channelSettings).forEach(channelName => {
            const settings = channelSettings[channelName];
            if (settings?.enabled) {
              channelMappings.push({
                channelId: channelName,
                mappedAt: now,
                status: 'mapped',
                confidence: 0.95,
                mappedFields: Object.keys(settings).length - 1,
                totalFields: 10
              });
            }
          });
          return { channelMappings };
        }
      },
      
      // Array fields that need special handling
      arrayFields: ['tags', 'metaKeywords'],
      
      // Fields that combine into dimensions object
      dimensionFields: ['length', 'width', 'height', 'dimensionUnit']
    };

    // Process all form fields dynamically using configuration
    if (schema?.fields) {
      // Handle dimensions first (they need to be processed together)
      const hasDimensions = fieldMappingConfig.dimensionFields.some(dim => formData[dim]);
      if (hasDimensions) {
        masterProduct.dimensions = {
          length: Number(formData.length) || 0,
          width: Number(formData.width) || 0, 
          height: Number(formData.height) || 0,
          unit: (formData.dimensionUnit as 'cm' | 'in' | 'm' | 'ft') || 'in'
        };
      }
      
      schema.fields.forEach(field => {
        const fieldName = field.fieldName;
        const fieldValue = formData[fieldName];
        
        // Skip empty/undefined values and already processed core fields
        if (fieldValue === undefined || fieldValue === null || fieldValue === '' ||
            ['id', 'sku', 'name', 'price', 'createdAt', 'updatedAt'].includes(fieldName) ||
            fieldMappingConfig.dimensionFields.includes(fieldName)) {
          return;
        }

        // 1. Special field handlers (complex logic)
        if ((fieldMappingConfig.specialFields as any)[fieldName]) {
          const result = (fieldMappingConfig.specialFields as any)[fieldName](fieldValue);
          Object.assign(masterProduct, result);
          return;
        }

        // 2. Array fields
        if (fieldMappingConfig.arrayFields.includes(fieldName)) {
          (masterProduct as any)[fieldName] = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
          return;
        }

        // 3. Direct property mappings
        if ((fieldMappingConfig.directMappings as any)[fieldName]) {
          const targetProperty = (fieldMappingConfig.directMappings as any)[fieldName];
          (masterProduct as any)[targetProperty] = convertValueByType(fieldValue, field.fieldType);
          return;
        }

        // 4. Field name transformations  
        if ((fieldMappingConfig.fieldTransforms as any)[fieldName]) {
          const targetProperty = (fieldMappingConfig.fieldTransforms as any)[fieldName];
          (masterProduct as any)[targetProperty] = convertValueByType(fieldValue, field.fieldType);
          return;
        }

        // 5. All unmapped fields automatically go to customAttributes
        if (!masterProduct.customAttributes) {
          masterProduct.customAttributes = {};
        }
        masterProduct.customAttributes[fieldName] = convertValueByType(fieldValue, field.fieldType);
      });
    }

    return masterProduct;
  };

  // Helper function for automatic type conversion based on schema
  const convertValueByType = (value: any, fieldType: string): any => {
    switch (fieldType) {
      case 'number':
        return Number(value);
      case 'checkbox':
        return Boolean(value);
      case 'select':
      case 'text':
      case 'textarea':
      default:
        return value;
    }
  };

  // Handle form submission
  const handleSubmit = async (submissionData: DynamicFormData) => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      console.log('[DynamicProductCreationForm] Submitting to backend API:', submissionData);
      
      // Use backend API for product creation
      const { BackendAPIService, createBackendContext } = await import('@/lib/api/backendService');
      
      const backendContext = createBackendContext(
        stableContext.userId,
        stableContext.organizationId,
        stableContext.userRole === 'ADMIN_USER' ? 'ADMIN' : 
        stableContext.userRole === 'VIEW_ONLY' ? 'BUSINESS_USER' : 
        stableContext.userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
        stableContext.targetChannels,
        stableContext.productCategory,
        stableContext.permissions
      );
      
      const masterProduct = await BackendAPIService.createProduct(submissionData, backendContext);
      console.log('[DynamicProductCreationForm] ✅ Product created successfully via backend:', masterProduct);
      
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