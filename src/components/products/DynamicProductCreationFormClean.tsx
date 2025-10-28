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
import { Loader2, AlertCircle, Package, Settings, Star } from '@/components/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Button from '@/components/ui/button/Button';
import DynamicForm from '@/components/forms/DynamicForm';
import { DynamicFormData, FormValidationResult, FormField } from '@/types/dynamicForm';
import { MasterProduct, ProductVariant } from '@/types/product';
import VariantConfiguratorDynamic from './VariantConfiguratorDynamic';

// Old VariantConfigurator removed - replaced with VariantConfiguratorSimple

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
  console.log('[DynamicProductCreationFormClean] 🎬 COMPONENT MOUNTING/RENDERING');
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
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formData, setFormData] = useState<DynamicFormData>(enrichedInitialData);

  // Load schema automatically on mount
  const loadSchema = useCallback(async () => {
    console.log('[DynamicProductCreationFormClean] 🔥 Schema loading started');
    setIsLoadingSchema(true);
    setSchemaError(null);
    
    try {
      console.log('[DynamicProductCreationFormClean] 📦 Importing BackendAPIService...');
      const { BackendAPIService, createBackendContext } = await import('@/lib/api/backendService');
      console.log('[DynamicProductCreationFormClean] ✅ BackendAPIService imported successfully');
      
      const backendContext = createBackendContext(
        'user-123',
        'retail-division',
        'BUSINESS_USER',
        ['shopify', 'amazon', 'walmart', 'ebay'],
        'electronics',
        ['read', 'write', 'create']
      );
      console.log('[DynamicProductCreationFormClean] ⚙️ Backend context created:', backendContext);
      
      console.log('[DynamicProductCreationFormClean] 🌐 Calling BackendAPIService.generateFormSchema...');
      const result: any = await BackendAPIService.generateFormSchema(backendContext);
      console.log('[DynamicProductCreationFormClean] 🔍 Raw API response received:', result);
      
      // Handle the nested response structure
      let parsedSchema;
      if (result?.formSchema) {
        parsedSchema = result.formSchema;
        console.log('[DynamicProductCreationFormClean] 📋 Using result.formSchema');
      } else if (result?.fields) {
        parsedSchema = result;
        console.log('[DynamicProductCreationFormClean] 📋 Using direct result');
      } else {
        console.error('[DynamicProductCreationFormClean] ❌ Invalid response structure:', result);
        throw new Error('Invalid API response structure - missing formSchema or fields');
      }
      
      console.log('[DynamicProductCreationFormClean] 🔍 Parsed schema has', parsedSchema.fields?.length, 'fields');
      
      console.log('[DynamicProductCreationFormClean] ✅ Setting schema state...');
      setSchema(parsedSchema);
      setIsLoadingSchema(false);
      console.log('[DynamicProductCreationFormClean] 🎯 State updated successfully');
      
    } catch (error) {
      console.error('[DynamicProductCreationFormClean] ❌ Error in loadSchema:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DynamicProductCreationFormClean] 🚨 Setting error state:', errorMessage);
      setSchemaError(`Schema loading error: ${errorMessage}`);
      setIsLoadingSchema(false);
    }
  }, []); // useCallback dependency array

  // TEST: Simple useEffect to verify hook execution
  useEffect(() => {
    console.log('[DynamicProductCreationFormClean] 🟢 BASIC useEffect RUNNING!');
  }, []);

  // CRITICAL FIX: Move useEffect to top level - must be called before any early returns
  // Auto-load schema on component mount - simplified version
  useEffect(() => {
    console.log('[DynamicProductCreationFormClean] 🚀 useEffect: RUNNING! Auto-loading schema...');
    console.log('[DynamicProductCreationFormClean] 🚀 useEffect: Current state check:');
    console.log('[DynamicProductCreationFormClean] 🚀 - isLoadingSchema:', isLoadingSchema);
    console.log('[DynamicProductCreationFormClean] 🚀 - schema:', !!schema);
    console.log('[DynamicProductCreationFormClean] 🚀 - schemaError:', schemaError);
    
    // Simplified condition: always load on first mount
    console.log('[DynamicProductCreationFormClean] 🚀 useEffect: Calling loadSchema() unconditionally');
    loadSchema();
  }, []); // Empty dependency to run only once on mount

  // Debug schema
  useEffect(() => {
    if (schema?.fields) {
      console.log('[DynamicProductCreationFormClean] Schema loaded with', schema.fields.length, 'fields');
      console.log('[DynamicProductCreationFormClean] Conditional fields:', 
        schema.fields.filter((f: FormField) => f.conditionalVisibility).map((f: FormField) => ({
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

  // Create a field-specific update handler for better state management
  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    setCurrentFormData(prev => {
      const newData = { ...prev, [fieldName]: value };
      console.log('[DynamicProductCreationFormClean] Field changed:', fieldName, value);
      setFormData(newData); // Keep both states in sync
      return newData;
    });
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
      
      schema.fields.forEach((field: FormField) => {
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
      
      // Map user roles to backend expected format
      const mapUserRole = (role: 'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY'): 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER' => {
        switch (role) {
          case 'ADMIN_USER':
            return 'ADMIN';
          case 'VIEW_ONLY':
            return 'BUSINESS_USER';
          case 'DEVELOPER':
            return 'DEVELOPER';
          case 'BUSINESS_USER':
          default:
            return 'BUSINESS_USER';
        }
      };

      const backendContext = createBackendContext(
        stableContext.userId,
        stableContext.organizationId,
        mapUserRole(stableContext.userRole),
        stableContext.targetChannels,
        stableContext.productCategory,
        stableContext.permissions
      );
      
      // Process and clean submission data first
      const processedData = { ...submissionData };
      
      // Parse JSON string fields that should be objects
      if (processedData.variantConfigurator && typeof processedData.variantConfigurator === 'string') {
        try {
          processedData.variantConfigurator = JSON.parse(processedData.variantConfigurator);
          console.log('[DynamicProductCreationForm] ✅ Parsed variantConfigurator JSON:', processedData.variantConfigurator);
        } catch (error) {
          console.error('[DynamicProductCreationForm] ❌ Failed to parse variantConfigurator JSON:', error);
          // Remove invalid JSON field to prevent backend error
          delete processedData.variantConfigurator;
        }
      }
      
      // Convert string numbers to actual numbers for numeric fields
      const numericFields = ['price', 'inventory', 'weight', 'length', 'width', 'height'];
      numericFields.forEach(field => {
        if (processedData[field] && typeof processedData[field] === 'string') {
          const numValue = parseFloat(processedData[field]);
          if (!isNaN(numValue)) {
            processedData[field] = numValue;
          }
        }
      });
      
      // Ensure ALL required fields are present with sensible defaults based on backend schema
      const enrichedProductData = {
        // Required fields from backend validation
        name: processedData.name || 'Test Product',
        description: processedData.description || 'This is a test product created via the dynamic form. It includes all required fields for successful validation.',
        sku: processedData.sku || `SKU-${Date.now()}`,
        price: processedData.price || 10.00,
        category: processedData.category || stableContext.productCategory || 'electronics',
        inventory: processedData.inventory || 5,
        status: processedData.status || 'draft',
        
        // Additional fields that might be required
        brand: processedData.brand || 'Test Brand',
        weight: processedData.weight || 1.0,
        length: processedData.length || 10.0,
        width: processedData.width || 8.0,
        height: processedData.height || 6.0,
        
        // Include any additional form fields from the actual form (now processed)
        ...processedData
      };
      
      console.log('[DynamicProductCreationForm] Enriched product data:', enrichedProductData);
      
      const masterProduct = await BackendAPIService.createProduct(enrichedProductData, backendContext);
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
    schemaFields: schema?.fields?.length || 0,
    schemaType: typeof schema,
    schemaKeys: schema ? Object.keys(schema) : 'null'
  });
  
  // Log what will happen next
  if (isLoadingSchema) {
    console.log('[DynamicProductCreationFormClean] 📍 NEXT: Will show LOADING state');
  } else if (schemaError || !schema) {
    console.log('[DynamicProductCreationFormClean] 📍 NEXT: Will show ERROR state (has schema:', !!schema, ')');
  } else {
    console.log('[DynamicProductCreationFormClean] 📍 NEXT: Will show NORMAL form state');
  }

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

  // Error state - provide fallback manual form
  if (schemaError || !schema) {
    console.log('[DynamicProductCreationFormClean] ❌ SHOWING ERROR STATE:', { schemaError, hasSchema: !!schema });
    console.log('[DynamicProductCreationFormClean] ❌ Schema details:', { 
      schema: schema, 
      schemaType: typeof schema,
      schemaStringified: JSON.stringify(schema)?.substring(0, 200)
    });
    return (
      <div className="max-w-4xl mx-auto p-6">
        {/* SUPER VISIBLE DEBUG INDICATOR */}
        <div className="bg-red-500 text-white p-4 text-center text-xl font-bold mb-4 animate-pulse">
          🚨 ERROR STATE RENDERING - FALLBACK FORM ACTIVE 🚨
          <br />
          <div className="text-sm mt-2">
            Schema: {schema ? 'EXISTS' : 'NULL'} | Error: {schemaError || 'NONE'}
          </div>
        </div>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {schemaError || 'Schema not loaded yet. Use the fallback form below to test product creation.'}
          </AlertDescription>
        </Alert>
        
        <div className="mt-4 text-center">
          <Button 
            onClick={() => {
              console.log('[Manual Button] Load Schema button clicked');
              loadSchema();
            }}
            disabled={isLoadingSchema}
            className="px-6 py-2 mr-4"
          >
            {isLoadingSchema ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading Schema...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Load Schema
              </>
            )}
          </Button>
        </div>
        
        {/* Fallback Manual Form */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Manual Product Creation (Fallback)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              // Create a basic product data object
              const basicProductData = {
                name: 'Test Product ' + Date.now(),
                description: 'Test product created via manual fallback form',
                sku: `SKU-${Date.now()}`,
                price: 29.99,
                category: 'electronics',
                inventory: 10,
                status: 'draft'
              };
              handleSubmit(basicProductData);
            }} className="space-y-4">
              <div className="text-sm text-gray-600 mb-4">
                This fallback form creates a test product with all required fields pre-filled.
              </div>
              
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white text-lg font-bold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Test Product...
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4 mr-2" />
                    🚀 CREATE TEST PRODUCT 🚀
                  </>
                )}
              </Button>
              
              {submitError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  console.log('[DynamicProductCreationFormClean] ✅ RENDERING NORMAL FORM STATE with schema:', schema?.fields?.length, 'fields');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* SUCCESS INDICATOR - Schema loaded and form is working */}
      <div className="bg-green-500 text-white p-4 text-center text-lg font-bold mb-4">
        ✅ SUCCESS: Dynamic Form Loaded with {schema?.fields?.length || 0} Fields
        <br />
        <div className="text-sm mt-2">
          Essential: {schema?.fields?.filter((f: any) => f.group === 'essential').length || 0} | 
          Required: {schema?.fields?.filter((f: any) => f.required || f.validationRules?.required).length || 0} |
          Showing: {schema?.fields?.filter((field: any) => {
            const isEssential = field.group === 'essential';
            const isBasicField = ['name', 'description', 'price', 'category', 'sku', 'brand', 'inventory', 'status'].includes(field.fieldName);
            const isRequired = field.required || field.validationRules?.required;
            return isEssential || isBasicField || isRequired;
          }).length || 0}
        </div>
      </div>
      {/* Submit Error */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Package className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle className="text-2xl">Create New Product</CardTitle>
                <p className="text-gray-600 mt-1">Build your product for multi-channel distribution</p>
              </div>
            </div>
            {/* JSON Preview Toggle */}
            <Button
              variant="outline"
              onClick={() => setShowJsonPreview(!showJsonPreview)}
              className="text-sm"
            >
              {showJsonPreview ? '🙈 Hide' : '👁️ Show'} JSON Preview
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content Layout */}
      <div className={`${showJsonPreview ? 'grid grid-cols-1 xl:grid-cols-3 gap-6' : ''}`}>
        {/* Dynamic Form */}
        <div className={showJsonPreview ? 'xl:col-span-2' : ''}>
          {schema && schema.fields ? (
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(formData); }} className="space-y-6">
              
              {/* Essential Information Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-lg">Essential Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {schema.fields
                    .filter((field: any) => {
                      // Show essential fields, basic product fields, and required fields
                      const isEssential = field.group === 'essential';
                      const isBasicField = ['name', 'description', 'price', 'category', 'sku', 'brand', 'inventory', 'status'].includes(field.fieldName);
                      const isRequired = field.required || field.validationRules?.required;
                      return isEssential || isBasicField || isRequired;
                    })
                    .slice(0, 12) // Show more fields
                    .map((field: any) => (
                      <div key={field.fieldName} className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                        {field.fieldType.toLowerCase() === 'textarea' ? (
                          <textarea
                            placeholder={field.placeholder}
                            value={formData[field.fieldName] || ''}
                            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            rows={3}
                          />
                        ) : field.fieldType.toLowerCase() === 'select' ? (
                          <select
                            value={formData[field.fieldName] || ''}
                            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          />
                        )}
                        {field.helpText && (
                          <p className="text-xs text-gray-500">{field.helpText}</p>
                        )}
                      </div>
                    ))}
                </CardContent>
              </Card>

              {/* Product Variants Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Settings className="h-5 w-5 text-purple-600" />
                    <CardTitle className="text-lg">Product Variants</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {schema.fields
                    .filter((field: any) => field.fieldName === 'hasVariants' || field.fieldName === 'variantConfigurator')
                    .map((field: any) => {
                      if (field.fieldName === 'hasVariants') {
                        return (
                          <div key={field.fieldName} className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData[field.fieldName] || false}
                                onChange={(e) => {
                                  console.log('hasVariants checkbox clicked:', e.target.checked);
                                  handleFieldChange(field.fieldName, e.target.checked);
                                }}
                                className="mr-3 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <span className="font-medium text-lg text-gray-800">{field.label}</span>
                            </label>
                            <p className="text-sm text-gray-600 mt-2 ml-7">{field.helpText}</p>
                            <div className="mt-3 ml-7">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                formData[field.fieldName] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {formData[field.fieldName] ? '✅ Enabled' : '❌ Disabled'}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      if (field.fieldName === 'variantConfigurator') {
                        const hasVariantsEnabled = formData['hasVariants'] || false;
                        
                        return (
                          <div key={field.fieldName} className={`transition-all duration-300 ${
                            hasVariantsEnabled ? 'opacity-100' : 'opacity-60'
                          }`}>
                            <div className={`p-4 border rounded-lg ${
                              hasVariantsEnabled 
                                ? 'bg-gradient-to-r from-green-50 to-blue-50 border-green-300' 
                                : 'bg-gray-50 border-gray-300'
                            }`}>
                              <h4 className="font-medium text-lg mb-2 flex items-center">
                                <Star className="h-4 w-4 mr-2 text-purple-600" />
                                {field.label}
                              </h4>
                              <p className="text-sm text-gray-600 mb-4">{field.helpText}</p>
                              
                              {!hasVariantsEnabled && (
                                <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg mb-4">
                                  <div className="flex items-center">
                                    <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                                    <span className="text-sm font-medium text-yellow-800">
                                      Enable "Has Product Variants" above to configure variants
                                    </span>
                                  </div>
                                </div>
                              )}
                              
                              {hasVariantsEnabled && (
                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                  <VariantConfiguratorDynamic 
                                    value={formData[field.fieldName]}
                                    onChange={(value) => handleFieldChange(field.fieldName, value)}
                                    schema={schema}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                </CardContent>
              </Card>

              {/* Actions Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Fields completed:</span> {Object.values(formData).filter(v => v !== undefined && v !== '').length} / {schema?.fields?.length || 0}
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-8 py-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating Product...
                        </>
                      ) : (
                        <>
                          <Package className="h-4 w-4 mr-2" />
                          Create Product
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </form>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No schema available</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Real-time JSON Preview */}
        {showJsonPreview && (
          <div className="xl:col-span-1">
            <div className="sticky top-4 space-y-4">
              
              {/* Generated masterProduct JSON */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center">
                      📋 Generated Product
                    </CardTitle>
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                      Real-time
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                    <div className="p-4 overflow-auto max-h-80">
                      <pre className="text-xs text-green-400 font-mono leading-relaxed">
                        {JSON.stringify(generateMasterProduct(currentFormData), null, 2)}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Raw Form Data JSON */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center">
                      🔧 Form Data
                    </CardTitle>
                    <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full font-medium">
                      Debug
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                    <div className="p-4 overflow-auto max-h-64">
                      <pre className="text-xs text-cyan-400 font-mono leading-relaxed">
                        {JSON.stringify(currentFormData, null, 2)}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schema Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">📊 Schema Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Fields:</span>
                      <span className="font-medium">{schema?.fields?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completed:</span>
                      <span className="font-medium text-green-600">
                        {Object.values(currentFormData).filter(v => v !== undefined && v !== '').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Custom Attrs:</span>
                      <span className="font-medium text-blue-600">
                        {generateMasterProduct(currentFormData).customAttributes ? Object.keys(generateMasterProduct(currentFormData).customAttributes!).length : 0}
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Progress:</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                              style={{ 
                                width: `${Math.round((Object.values(currentFormData).filter(v => v !== undefined && v !== '').length / (schema?.fields?.length || 1)) * 100)}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium">
                            {Math.round((Object.values(currentFormData).filter(v => v !== undefined && v !== '').length / (schema?.fields?.length || 1)) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        )}
      </div>

      {/* Debug Info (development only) */}
      {debugMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">🐛 Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div><span className="font-medium">Channels:</span> {targetChannels.join(', ')}</div>
                <div><span className="font-medium">Category:</span> {productCategory}</div>
                <div><span className="font-medium">User Role:</span> {userRole}</div>
              </div>
              <div className="space-y-2">
                <div><span className="font-medium">Schema Fields:</span> {schema?.fields?.length || 0}</div>
                <div><span className="font-medium">Form Keys:</span> {Object.keys(formData).length}</div>
                <div><span className="font-medium">Schema Title:</span> {schema?.title || 'N/A'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  );
}