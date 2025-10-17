"use client";

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

  // Create truly stable context - no dependencies to prevent infinite loops
  const stableContext = useMemo(() => ({
    userId: 'user-123',
    organizationId: 'retail-division',
    userRole: 'BUSINESS_USER' as const,
    targetChannels: ['shopify', 'amazon', 'walmart', 'ebay'],
    productCategory: 'electronics',
    permissions: ['read', 'write', 'create']
  }), []); // Empty dependency array for true stability

  // Create truly stable initial data
  const enrichedInitialData = useMemo(() => ({
    category: 'electronics' // Ensure category is set for conditional visibility
  }), []); // Empty dependency array for true stability

  // Create a simple state-based approach to avoid infinite loop
  const [schema, setSchema] = useState<any>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formData, setFormData] = useState<DynamicFormData>(enrichedInitialData);

  // Load schema once on mount
  useEffect(() => {
    let mounted = true;
    
    const loadSchema = async () => {
      try {
        const { BackendAPIService, createBackendContext } = await import('@/lib/api/backendService');
        
        const backendContext = createBackendContext(
          'user-123',
          'retail-division',
          'BUSINESS_USER',
          ['shopify', 'amazon', 'walmart', 'ebay'],
          'electronics',
          ['read', 'write', 'create']
        );
        
        const result: any = await BackendAPIService.generateFormSchema(backendContext);
        const parsedSchema = result.formSchema ? result.formSchema : result;
        
        if (mounted) {
          console.log('[DynamicProductCreationFormClean] ✅ Schema loaded with', parsedSchema.fields?.length, 'fields');
          console.log('[DynamicProductCreationFormClean] 🔍 Setting schema:', parsedSchema);
          setSchema(parsedSchema);
          setIsLoadingSchema(false);
        }
        
      } catch (error) {
        if (mounted) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          setSchemaError(`Backend API error: ${errorMessage}`);
          console.error('[DynamicProductCreationFormClean] ❌ Error:', error);
          setIsLoadingSchema(false);
        }
      }
    };
    
    loadSchema();
    
    return () => {
      mounted = false;
    };
  }, []); // Only run once

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

  // Handle form data changes with local state
  const handleFormDataChange = useCallback((newData: DynamicFormData) => {
    console.log('[DynamicProductCreationFormClean] Form data changed:', newData);
    setCurrentFormData(newData);
    setFormData(newData);
  }, []);

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

  console.log('[DynamicProductCreationFormClean] RENDER STATE CHECK:', {
    isLoadingSchema,
    schemaError,
    hasSchema: !!schema,
    schemaFields: schema?.fields?.length || 0
  });

  // Loading state
  if (isLoadingSchema) {
    console.log('[DynamicProductCreationFormClean] 🔄 SHOWING LOADING STATE');
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
    console.log('[DynamicProductCreationFormClean] ❌ SHOWING ERROR STATE:', { schemaError, hasSchema: !!schema });
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

  console.log('[DynamicProductCreationFormClean] ✅ RENDERING FORM with schema:', schema?.fields?.length, 'fields');

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
        {/* Dynamic Form */}
        <div className={showJsonPreview ? 'lg:col-span-1' : ''}>
          {schema && schema.fields ? (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Product Information</h2>
              
              {/* Essential Fields */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-800">Essential Information</h3>
                {schema.fields
                  .filter((field: any) => field.group === 'essential' || ['name', 'description', 'price', 'category'].includes(field.fieldName))
                  .slice(0, 6)
                  .map((field: any) => (
                    <div key={field.fieldName} className="space-y-2">
                      <label className="block font-medium">{field.label}</label>
                      {field.fieldType.toLowerCase() === 'textarea' ? (
                        <textarea
                          placeholder={field.placeholder}
                          value={formData[field.fieldName] || ''}
                          onChange={(e) => handleFormDataChange({...formData, [field.fieldName]: e.target.value})}
                          className="w-full p-2 border rounded"
                          rows={3}
                        />
                      ) : field.fieldType.toLowerCase() === 'select' ? (
                        <select
                          value={formData[field.fieldName] || ''}
                          onChange={(e) => handleFormDataChange({...formData, [field.fieldName]: e.target.value})}
                          className="w-full p-2 border rounded"
                        >
                          <option value="">{field.placeholder}</option>
                          {field.options?.map((option: any) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.fieldType.toLowerCase() === 'text' ? 'text' : field.fieldType}
                          placeholder={field.placeholder}
                          value={formData[field.fieldName] || ''}
                          onChange={(e) => handleFormDataChange({...formData, [field.fieldName]: e.target.value})}
                          className="w-full p-2 border rounded"
                        />
                      )}
                      <p className="text-sm text-gray-600">{field.helpText}</p>
                    </div>
                  ))}
              </div>

              {/* Variants Section */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-800 mb-4">🎯 Product Variants</h3>
                {schema.fields
                  .filter((field: any) => field.fieldName === 'hasVariants' || field.fieldName === 'variantConfigurator')
                  .map((field: any) => {
                    if (field.fieldName === 'hasVariants') {
                      return (
                        <div key={field.fieldName} className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData[field.fieldName] || false}
                              onChange={(e) => {
                                console.log('hasVariants checkbox clicked:', e.target.checked);
                                handleFormDataChange({...formData, [field.fieldName]: e.target.checked});
                              }}
                              className="mr-3 w-4 h-4"
                            />
                            <span className="font-medium text-lg">{field.label}</span>
                          </label>
                          <p className="text-sm text-gray-600 mt-2">{field.helpText}</p>
                          <div className="mt-2 text-sm">
                            <strong>Current value:</strong> {formData[field.fieldName] ? 'TRUE ✅' : 'FALSE ❌'}
                          </div>
                        </div>
                      );
                    }
                    
                    if (field.fieldName === 'variantConfigurator') {
                      const hasVariantsEnabled = formData['hasVariants'] || false;
                      
                      return (
                        <div key={field.fieldName} className={`mb-6 p-4 border rounded-lg transition-all ${
                          hasVariantsEnabled ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300 opacity-60'
                        }`}>
                          <h4 className="font-medium text-lg mb-2">{field.label}</h4>
                          <p className="text-sm text-gray-600 mb-4">{field.helpText}</p>
                          
                          {!hasVariantsEnabled && (
                            <div className="p-3 bg-yellow-100 border border-yellow-300 rounded mb-4">
                              <strong>⚠️ Enable "Has Product Variants" checkbox above to activate this section</strong>
                            </div>
                          )}
                          
                          <div className="space-y-4">
                            <div className="p-3 bg-white rounded border">
                              <strong>✅ Variant Field Active!</strong>
                              <br />Type: {field.fieldType}
                              <br />Status: {hasVariantsEnabled ? '🟢 ACTIVE' : '🔴 INACTIVE'}
                            </div>
                            
                            {hasVariantsEnabled && (
                              <div className="space-y-3">
                                <div>
                                  <label className="block font-medium mb-2">Variant Configuration:</label>
                                  <textarea
                                    placeholder="Enter variant configuration as JSON... e.g. {&quot;colors&quot;: [&quot;red&quot;, &quot;blue&quot;], &quot;sizes&quot;: [&quot;S&quot;, &quot;M&quot;, &quot;L&quot;]}"
                                    value={formData[field.fieldName] || ''}
                                    onChange={(e) => handleFormDataChange({...formData, [field.fieldName]: e.target.value})}
                                    className="w-full p-3 border rounded"
                                    rows={6}
                                  />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block font-medium mb-1">Variant Price:</label>
                                    <input
                                      type="number"
                                      placeholder="0.00"
                                      step="0.01"
                                      className="w-full p-2 border rounded"
                                    />
                                  </div>
                                  <div>
                                    <label className="block font-medium mb-1">Variant Cost:</label>
                                    <input
                                      type="number"
                                      placeholder="0.00"
                                      step="0.01"
                                      className="w-full p-2 border rounded"
                                    />
                                  </div>
                                </div>
                                
                                <button 
                                  type="button"
                                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                  onClick={() => {
                                    const sampleVariants = JSON.stringify({
                                      "variants": [
                                        {"color": "red", "size": "S", "price": 29.99, "sku": "PROD-RED-S"},
                                        {"color": "red", "size": "M", "price": 29.99, "sku": "PROD-RED-M"},
                                        {"color": "blue", "size": "S", "price": 29.99, "sku": "PROD-BLUE-S"},
                                        {"color": "blue", "size": "M", "price": 29.99, "sku": "PROD-BLUE-M"}
                                      ],
                                      "options": {
                                        "color": ["red", "blue"],
                                        "size": ["S", "M", "L"]
                                      }
                                    }, null, 2);
                                    handleFormDataChange({...formData, [field.fieldName]: sampleVariants});
                                  }}
                                >
                                  Load Sample Variants
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>

              {/* Submit Button */}
              <div className="border-t pt-6">
                <button
                  type="button"
                  onClick={() => handleSubmit(formData)}
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating Product...' : 'Create Product'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No schema available
            </div>
          )}
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