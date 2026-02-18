/**
 * Product Form Schema Hook
 * Manages dynamic schema loading from backend with caching
 */

import { useState, useCallback, useRef } from 'react';
import { ProductService, createBackendContext } from '../services/productService';

export type FormStage = 'essential' | 'category-specific';

export interface UseProductFormSchemaOptions {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  permissions?: string[];
}

export interface UseProductFormSchemaReturn {
  schema: any;
  isLoadingSchema: boolean;
  schemaError: string | null;
  formStage: FormStage;
  isAddingCategoryFields: boolean;
  loadSchema: (category?: string) => Promise<void>;
  loadCategoryFieldsSmooth: (category: string) => Promise<void>;
  clearSchemaCache: () => void;
}

/**
 * Custom hook for managing product form schema
 * Handles loading essential and category-specific fields from backend
 * Implements caching to prevent unnecessary API calls
 */
export function useProductFormSchema(
  options: UseProductFormSchemaOptions
): UseProductFormSchemaReturn {
  const { userId, organizationId, userRole, targetChannels, permissions = [] } = options;

  // State
  const [schema, setSchema] = useState<any>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formStage, setFormStage] = useState<FormStage>('essential');
  const [isAddingCategoryFields, setIsAddingCategoryFields] = useState(false);

  // Cache to prevent redundant API calls
  const schemaCache = useRef<Map<string, any>>(new Map());

  // Inflight request tracking to prevent duplicate simultaneous requests
  const inflightRequests = useRef<Map<string, Promise<any>>>(new Map());

  /**
   * Loads form schema from backend
   * @param category - Optional category for category-specific fields
   */
  const loadSchema = useCallback(async (category?: string) => {
    console.log('[useProductFormSchema] ===================================');
    console.log('[useProductFormSchema] loadSchema CALLED');
    console.log('[useProductFormSchema] Category:', category);
    console.log('[useProductFormSchema] Call stack:', new Error().stack);
    console.log('[useProductFormSchema] ===================================');

    try {
      setIsLoadingSchema(true);
      setSchemaError(null);

      // Check cache first
      const cacheKey = category || 'essential';
      console.log('[useProductFormSchema] Cache key:', cacheKey);
      console.log('[useProductFormSchema] Cache has key?', schemaCache.current.has(cacheKey));
      console.log('[useProductFormSchema] Cache size:', schemaCache.current.size);

      if (schemaCache.current.has(cacheKey)) {
        console.log('[useProductFormSchema] ✓ Using cached schema for:', cacheKey);
        const cachedSchema = schemaCache.current.get(cacheKey);
        setSchema(cachedSchema);
        setFormStage(category ? 'category-specific' : 'essential');
        setIsLoadingSchema(false);
        return;
      }

      // Check if there's already a request in-flight for this cache key
      if (inflightRequests.current.has(cacheKey)) {
        console.log('[useProductFormSchema] ⚠️ Request already in-flight for:', cacheKey);
        console.log('[useProductFormSchema] Waiting for existing request to complete...');
        const existingRequest = inflightRequests.current.get(cacheKey)!;
        const schemaData = await existingRequest;
        console.log('[useProductFormSchema] ✓ Existing request completed, using result');
        setSchema(schemaData);
        setFormStage(category ? 'category-specific' : 'essential');
        setIsLoadingSchema(false);
        return;
      }

      // Create the request promise
      const requestPromise = (async () => {
        console.log('[useProductFormSchema] 🚀 Making NEW API request for:', cacheKey);

        // Create backend context
        const context = createBackendContext(
          userId,
          organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels,
          category || '',
          permissions
        );

        console.log('[useProductFormSchema] Calling generateFormSchema with context:', context);

        // Call backend API
        const schemaData: any = await ProductService.generateFormSchema(context);

        console.log('[useProductFormSchema] Received schema:', schemaData);
        console.log('[useProductFormSchema] Schema type:', typeof schemaData);
        console.log('[useProductFormSchema] Schema keys:', schemaData ? Object.keys(schemaData) : 'null');

        // Backend might return a wrapper object with { success, formSchema, ... }
        // Extract the actual schema if wrapped
        let actualSchema: any = schemaData;
        if (schemaData && schemaData.formSchema) {
          console.log('[useProductFormSchema] Unwrapping formSchema from response');
          actualSchema = schemaData.formSchema;
        }

        // Validate schema format - backend can return either 'sections' or 'fields' structure
        if (!actualSchema || (!actualSchema.sections && !actualSchema.fields)) {
          console.error('[useProductFormSchema] Invalid schema structure. Full response:', schemaData);
          throw new Error('Invalid schema format received from backend - missing both sections and fields');
        }

        // Normalize: if backend sends sections[] but not fields[], flatten into fields[]
        // Stamp each field with its section key so groupFieldsBySection can use it
        if (actualSchema.sections && !actualSchema.fields) {
          console.log('[useProductFormSchema] Flattening sections[] into fields[]');
          const flatFields: any[] = [];
          for (const section of actualSchema.sections) {
            if (section.fields && Array.isArray(section.fields)) {
              for (const field of section.fields) {
                flatFields.push({ ...field, section: field.section || section.key });
              }
            }
          }
          actualSchema = { ...actualSchema, fields: flatFields };
          console.log('[useProductFormSchema] Flattened', flatFields.length, 'fields from sections');
        }

        // Cache the unwrapped schema
        schemaCache.current.set(cacheKey, actualSchema);

        console.log('[useProductFormSchema] ✓ Schema cached for:', cacheKey);
        return actualSchema;
      })();

      // Store the inflight request
      inflightRequests.current.set(cacheKey, requestPromise);

      // Await the request
      const actualSchema = await requestPromise;

      // Clean up inflight request
      inflightRequests.current.delete(cacheKey);

      // Detect form stage from schema metadata
      const stage = actualSchema.metadata?.formStage || (category ? 'category-specific' : 'essential');

      setSchema(actualSchema);
      setFormStage(stage);

      console.log('[useProductFormSchema] Schema loaded successfully. Stage:', stage);

    } catch (error) {
      console.error('[useProductFormSchema] Error loading schema:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load form schema';
      setSchemaError(errorMessage);
      setSchema(null);

      // Clean up inflight request on error
      const cacheKey = category || 'essential';
      inflightRequests.current.delete(cacheKey);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  /**
   * Loads category-specific fields without full page refresh
   * Merges new fields with existing essential fields
   * @param category - Product category
   */
  const loadCategoryFieldsSmooth = useCallback(async (category: string) => {
    console.log('[useProductFormSchema] ═══════════════════════════════════════');
    console.log('[useProductFormSchema] 🔄 loadCategoryFieldsSmooth called');
    console.log('[useProductFormSchema] Category:', category);

    if (!category || category.trim() === '') {
      console.log('[useProductFormSchema] ✗ No category provided, skipping');
      console.log('[useProductFormSchema] ═══════════════════════════════════════');
      return;
    }

    const cacheKey = category.toLowerCase().trim();
    console.log('[useProductFormSchema] Cache key:', cacheKey);

    // Check cache first
    if (schemaCache.current.has(cacheKey)) {
      console.log('[useProductFormSchema] ✓ Using cached schema for:', cacheKey);
      const cachedSchema = schemaCache.current.get(cacheKey);
      console.log('[useProductFormSchema] Cached schema fields:', cachedSchema?.fields?.length || 0);

      console.log('[useProductFormSchema] 🔧 Calling setSchema with', cachedSchema?.fields?.length, 'fields');
      setSchema(cachedSchema);

      console.log('[useProductFormSchema] 🔧 Calling setFormStage with: category-specific');
      setFormStage('category-specific');

      console.log('[useProductFormSchema] ✓ State updates called - waiting for React to re-render');
      console.log('[useProductFormSchema] ═══════════════════════════════════════');
      return;
    }

    // Check if there's already a request in-flight for this cache key
    if (inflightRequests.current.has(cacheKey)) {
      console.log('[useProductFormSchema] ⚠️ Category request already in-flight for:', cacheKey);
      console.log('[useProductFormSchema] Waiting for existing request to complete...');
      try {
        const existingRequest = inflightRequests.current.get(cacheKey)!;
        const categorySchema = await existingRequest;
        console.log('[useProductFormSchema] ✓ Existing category request completed, using result');
        setSchema(categorySchema);
        setFormStage('category-specific');
        console.log('[useProductFormSchema] ═══════════════════════════════════════');
        return;
      } catch (error) {
        console.error('[useProductFormSchema] Existing request failed:', error);
        // Continue to make a new request
      }
    }

    try {
      console.log('[useProductFormSchema] ⏳ Making NEW API call to load category-specific fields');
      setIsAddingCategoryFields(true);
      setSchemaError(null);

      // Create the request promise
      const requestPromise = (async () => {

        // Create context with category
        const context = createBackendContext(
          userId,
          organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels,
          category,
          permissions
        );

        console.log('[useProductFormSchema] Refreshing schema with category context:', context);

        // Call backend to get category-specific schema
        const categorySchema: any = await ProductService.refreshFormSchema(context);

        console.log('[useProductFormSchema] ✓ API call completed');
        console.log('[useProductFormSchema] Response type:', typeof categorySchema);
        console.log('[useProductFormSchema] Response keys:', categorySchema ? Object.keys(categorySchema) : 'null');

        // Backend might return a wrapper object with { success, formSchema, ... }
        // Extract the actual schema if wrapped
        let actualCategorySchema: any = categorySchema;
        if (categorySchema && categorySchema.formSchema) {
          console.log('[useProductFormSchema] Unwrapping formSchema from response wrapper');
          actualCategorySchema = categorySchema.formSchema;
        }

        console.log('[useProductFormSchema] Actual schema type:', typeof actualCategorySchema);
        console.log('[useProductFormSchema] Actual schema keys:', actualCategorySchema ? Object.keys(actualCategorySchema) : 'null');

        // Validate schema format - backend can return either 'sections' or 'fields' structure
        if (!actualCategorySchema || (!actualCategorySchema.sections && !actualCategorySchema.fields)) {
          console.error('[useProductFormSchema] ✗ Invalid schema structure. Full response:', categorySchema);
          throw new Error('Invalid category schema received from backend - missing both sections and fields');
        }

        // Normalize: if backend sends sections[] but not fields[], flatten into fields[]
        if (actualCategorySchema.sections && !actualCategorySchema.fields) {
          console.log('[useProductFormSchema] Flattening category sections[] into fields[]');
          const flatFields: any[] = [];
          for (const section of actualCategorySchema.sections) {
            if (section.fields && Array.isArray(section.fields)) {
              for (const field of section.fields) {
                flatFields.push({ ...field, section: field.section || section.key });
              }
            }
          }
          actualCategorySchema = { ...actualCategorySchema, fields: flatFields };
        }

        const fieldCount = actualCategorySchema.fields?.length || 0;
        console.log('[useProductFormSchema] ✓ Schema validated - Fields count:', fieldCount);

        // Cache the unwrapped category schema
        schemaCache.current.set(cacheKey, actualCategorySchema);
        console.log('[useProductFormSchema] ✓ Schema cached with key:', cacheKey);

        return actualCategorySchema;
      })();

      // Store the inflight request
      inflightRequests.current.set(cacheKey, requestPromise);

      // Await the request
      const actualCategorySchema = await requestPromise;

      // Clean up inflight request
      inflightRequests.current.delete(cacheKey);

      setSchema(actualCategorySchema);
      setFormStage('category-specific');

      console.log('[useProductFormSchema] ✓ Form stage changed to: category-specific');
      console.log('[useProductFormSchema] ✓ Category fields loaded successfully');
      console.log('[useProductFormSchema] ═══════════════════════════════════════');

    } catch (error) {
      console.error('[useProductFormSchema] ✗ ERROR loading category fields');
      console.error('[useProductFormSchema] Error details:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load category fields';
      console.error('[useProductFormSchema] Error message:', errorMessage);
      setSchemaError(errorMessage);

      // Clean up inflight request on error
      inflightRequests.current.delete(cacheKey);

      console.log('[useProductFormSchema] ═══════════════════════════════════════');
    } finally {
      setIsAddingCategoryFields(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  /**
   * Clears all cached schemas
   * Useful when organization settings change
   */
  const clearSchemaCache = useCallback(() => {
    console.log('[useProductFormSchema] Clearing schema cache and inflight requests');
    schemaCache.current.clear();
    inflightRequests.current.clear();
  }, []);

  return {
    schema,
    isLoadingSchema,
    schemaError,
    formStage,
    isAddingCategoryFields,
    loadSchema,
    loadCategoryFieldsSmooth,
    clearSchemaCache
  };
}
