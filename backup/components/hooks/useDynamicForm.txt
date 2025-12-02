/**
 * Dynamic Form Hook
 * Manages dynamic form schema fetching and form state
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DynamicFormSchema,
  FormGenerationContext,
  DynamicFormData,
  FormValidationResult
} from '@/types/dynamicForm';

interface UseDynamicFormOptions {
  context: Partial<FormGenerationContext>;
  initialData?: DynamicFormData;
  autoRefresh?: boolean;
  onSchemaLoaded?: (schema: DynamicFormSchema) => void;
  onDataChange?: (data: DynamicFormData) => void;
  onValidationChange?: (result: FormValidationResult) => void;
}

interface UseDynamicFormReturn {
  // Schema state
  schema: DynamicFormSchema | null;
  isLoadingSchema: boolean;
  schemaError: string | null;
  
  // Form data state
  formData: DynamicFormData;
  
  // Validation state
  validationResult: FormValidationResult | null;
  isValidating: boolean;
  
  // Actions
  refreshSchema: () => Promise<void>;
  refreshSchemaForCategory: (newCategory: string) => Promise<void>;
  updateFormData: (data: DynamicFormData) => void;
  resetForm: () => void;
  validateForm: () => Promise<FormValidationResult>;

  // Computed properties
  hasUnsavedChanges: boolean;
  isFormValid: boolean;
}

export function useDynamicForm(options: UseDynamicFormOptions): UseDynamicFormReturn {
  console.log('[useDynamicForm] Hook called with options:', options);
  
  const {
    context,
    initialData = {},
    autoRefresh = false,
    onSchemaLoaded,
    onDataChange,
    onValidationChange
  } = options;

  // Schema state
  const [schema, setSchema] = useState<DynamicFormSchema | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false); // Start as not loading
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Form data state
  const [formData, setFormData] = useState<DynamicFormData>(initialData);
  const [originalData, setOriginalData] = useState<DynamicFormData>(initialData);

  // Validation state
  const [validationResult, setValidationResult] = useState<FormValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Prevent duplicate API calls
  const loadingRef = useRef(false);
  const hasInitialized = useRef(false);

  // Stable context to prevent infinite loops
  const stableContext = useMemo(() => ({
    userId: context.userId || 'current-user',
    organizationId: context.organizationId || 'default',
    userRole: context.userRole || 'BUSINESS_USER',
    targetChannels: context.targetChannels || [],
    productCategory: context.productCategory,
    permissions: context.permissions || []
  }), [
    context.userId,
    context.organizationId,
    context.userRole,
    context.targetChannels?.join(',') || '',
    context.productCategory,
    context.permissions?.join(',') || ''
  ]);

  /**
   * Fetch form schema from API
   */
  const fetchSchema = useCallback(async () => {
    console.log('[useDynamicForm] fetchSchema called');
    
    if (loadingRef.current) {
      console.log('[useDynamicForm] Skipping duplicate API call');
      return;
    }

    console.log('[useDynamicForm] Starting schema fetch with context:', stableContext);

    loadingRef.current = true;
    setIsLoadingSchema(true);
    setSchemaError(null);

    try {
      // Backend API only - no fallback
      console.log('[useDynamicForm] Fetching schema from backend API...');
      
      const { BackendAPIService, createBackendContext } = await import('@/lib/api/backendService');
      
      const backendContext = createBackendContext(
        stableContext.userId,
        stableContext.organizationId,
        stableContext.userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
        stableContext.targetChannels,
        stableContext.productCategory || 'general',
        stableContext.permissions
      );
      
      const result: any = await BackendAPIService.generateFormSchema(backendContext);
      
      // Parse nested schema structure from backend
      const parsedSchema = result.formSchema ? result.formSchema : result;
      
      console.log('[useDynamicForm] ✅ Schema loaded successfully from backend:', result);
      console.log('[useDynamicForm] 🔍 Raw result.formSchema:', result.formSchema);
      console.log('[useDynamicForm] 🔍 Parsed schema:', parsedSchema);
      console.log('[useDynamicForm] 🔍 Parsed schema fields:', parsedSchema.fields);
      console.log('[useDynamicForm] 📊 Schema has', parsedSchema.fields?.length || 0, 'fields total');
      
      console.log('[useDynamicForm] 🔥 SETTING SCHEMA in state with', parsedSchema.fields?.length, 'fields');
      setSchema(parsedSchema);
      console.log('[useDynamicForm] 🔥 Schema state updated');
      
      // Call onSchemaLoaded if provided
      if (onSchemaLoaded && typeof onSchemaLoaded === 'function') {
        try {
          onSchemaLoaded(result);
        } catch (error) {
          console.warn('[useDynamicForm] Error in onSchemaLoaded callback:', error);
        }
      }

    } catch (backendError) {
      // No fallback - backend is required
      const errorMessage = backendError instanceof Error ? backendError.message : 'Unknown error';
      setSchemaError(`Backend API required but unavailable: ${errorMessage}`);
      console.error('[useDynamicForm] ❌ Backend API failed:', backendError);
      console.error('[useDynamicForm] Please ensure backend server is running at http://localhost:8888');
    } finally {
      console.log('[useDynamicForm] 🏁 Setting isLoadingSchema to FALSE');
      setIsLoadingSchema(false);
      loadingRef.current = false;
    }
  }, [stableContext, onSchemaLoaded]);
  console.log('[useDynamicForm] fetchSchema callback created');

  // Simple one-time initialization
  useEffect(() => {
    if (!hasInitialized.current) {
      console.log('[useDynamicForm] 🔥 USEEFFECT INIT - calling fetchSchema');
      hasInitialized.current = true;
      
      // Call schema fetch directly with minimal dependencies
      const loadSchema = async () => {
        if (loadingRef.current) {
          return;
        }

        loadingRef.current = true;
        setIsLoadingSchema(true);
        setSchemaError(null);

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
          
          console.log('[useDynamicForm] ✅ Schema loaded with', parsedSchema.fields?.length, 'fields');
          setSchema(parsedSchema);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          setSchemaError(`Backend API error: ${errorMessage}`);
          console.error('[useDynamicForm] ❌ Error:', error);
        } finally {
          setIsLoadingSchema(false);
          loadingRef.current = false;
        }
      };
      
      loadSchema();
    }
  }, []); // No dependencies to prevent infinite loops

  /**
   * Refresh schema (full reload)
   */
  const refreshSchema = useCallback(async () => {
    await fetchSchema();
  }, [fetchSchema]);

  /**
   * Refresh schema for category change
   * Uses the backend's refresh endpoint which is optimized for category changes
   */
  const refreshSchemaForCategory = useCallback(async (newCategory: string) => {
    if (loadingRef.current) {
      console.log('[useDynamicForm] Skipping duplicate refresh call');
      return;
    }

    console.log('[useDynamicForm] Refreshing schema for category:', newCategory);

    loadingRef.current = true;
    setIsLoadingSchema(true);
    setSchemaError(null);

    try {
      const { BackendAPIService, createBackendContext } = await import('@/lib/api/backendService');

      const backendContext = createBackendContext(
        stableContext.userId,
        stableContext.organizationId,
        stableContext.userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
        stableContext.targetChannels,
        newCategory, // Updated category
        stableContext.permissions
      );

      const result: any = await BackendAPIService.refreshFormSchema(backendContext);
      const parsedSchema = result.formSchema ? result.formSchema : result;

      console.log('[useDynamicForm] ✅ Schema refreshed for category:', newCategory);
      console.log('[useDynamicForm] 📊 Refreshed schema has', parsedSchema.fields?.length || 0, 'fields');

      setSchema(parsedSchema);

      // Call onSchemaLoaded if provided
      if (onSchemaLoaded && typeof onSchemaLoaded === 'function') {
        try {
          onSchemaLoaded(result);
        } catch (error) {
          console.warn('[useDynamicForm] Error in onSchemaLoaded callback:', error);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSchemaError(`Schema refresh failed: ${errorMessage}`);
      console.error('[useDynamicForm] ❌ Schema refresh failed:', error);
    } finally {
      setIsLoadingSchema(false);
      loadingRef.current = false;
    }
  }, [stableContext, onSchemaLoaded]);

  /**
   * Update form data
   */
  const updateFormData = useCallback((data: DynamicFormData) => {
    setFormData(data);
    
    // Call onDataChange if provided
    if (onDataChange && typeof onDataChange === 'function') {
      try {
        onDataChange(data);
      } catch (error) {
        console.warn('[useDynamicForm] Error in onDataChange callback:', error);
      }
    }
  }, [onDataChange]);

  /**
   * Reset form to original data
   */
  const resetForm = useCallback(() => {
    setFormData(originalData);
    setValidationResult(null);
  }, [originalData]);

  /**
   * Validate form data against schema
   */
  const validateForm = useCallback(async (): Promise<FormValidationResult> => {
    if (!schema) {
      const result: FormValidationResult = {
        isValid: false,
        fieldErrors: {},
        globalErrors: ['Form schema not loaded'],
        warnings: []
      };
      return result;
    }

    setIsValidating(true);

    try {
      const fieldErrors: Record<string, string[]> = {};
      const globalErrors: string[] = [];
      const warnings: string[] = [];

      // Basic validation - can be expanded
      const result: FormValidationResult = {
        isValid: Object.keys(fieldErrors).length === 0 && globalErrors.length === 0,
        fieldErrors,
        globalErrors,
        warnings
      };

      setValidationResult(result);
      
      // Call onValidationChange if provided
      if (onValidationChange && typeof onValidationChange === 'function') {
        try {
          onValidationChange(result);
        } catch (error) {
          console.warn('[useDynamicForm] Error in onValidationChange callback:', error);
        }
      }

      return result;

    } finally {
      setIsValidating(false);
    }
  }, [schema, formData, onValidationChange]);


  // Computed properties
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalData);
  const isFormValid = validationResult?.isValid ?? false;

  console.log('[useDynamicForm] 📤 RETURNING schema to parent:', schema ? `${schema.fields?.length || 0} fields` : 'null');

  return {
    // Schema state
    schema,
    isLoadingSchema,
    schemaError,
    
    // Form data state
    formData,
    
    // Validation state
    validationResult,
    isValidating,
    
    // Actions
    refreshSchema,
    refreshSchemaForCategory,
    updateFormData,
    resetForm,
    validateForm,

    // Computed properties
    hasUnsavedChanges,
    isFormValid
  };
}