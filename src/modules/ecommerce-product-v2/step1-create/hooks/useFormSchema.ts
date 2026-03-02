/**
 * Form Schema Hook
 * Manages dynamic schema loading from backend with caching
 */

import { useState, useCallback, useRef } from 'react';
import { generateFormSchema, refreshFormSchema, createBackendContext } from '../../services/schema-api.service';

export type FormStage = 'essential' | 'category-specific';

export interface UseFormSchemaOptions {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  permissions?: string[];
}

export interface UseFormSchemaReturn {
  schema: any;
  isLoadingSchema: boolean;
  schemaError: string | null;
  formStage: FormStage;
  isAddingCategoryFields: boolean;
  loadSchema: (category?: string) => Promise<void>;
  loadCategoryFieldsSmooth: (category: string) => Promise<void>;
  clearSchemaCache: () => void;
}

export function useFormSchema(options: UseFormSchemaOptions): UseFormSchemaReturn {
  const { userId, organizationId, userRole, targetChannels, permissions = [] } = options;

  const [schema, setSchema] = useState<any>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formStage, setFormStage] = useState<FormStage>('essential');
  const [isAddingCategoryFields, setIsAddingCategoryFields] = useState(false);

  const schemaCache = useRef<Map<string, any>>(new Map());
  const inflightRequests = useRef<Map<string, Promise<any>>>(new Map());

  function flattenSections(schemaData: any): any {
    if (schemaData.sections && !schemaData.fields) {
      const flatFields: any[] = [];
      for (const section of schemaData.sections) {
        if (section.fields && Array.isArray(section.fields)) {
          for (const field of section.fields) {
            flatFields.push({ ...field, section: field.section || section.key });
          }
        }
      }
      return { ...schemaData, fields: flatFields };
    }
    return schemaData;
  }

  function unwrapSchema(rawResponse: any): any {
    const schemaData = rawResponse?.formSchema ?? rawResponse;
    if (!schemaData || (!schemaData.sections && !schemaData.fields)) {
      throw new Error('Invalid schema format received from backend - missing both sections and fields');
    }
    return flattenSections(schemaData);
  }

  const loadSchema = useCallback(async (category?: string) => {
    const cacheKey = category || 'essential';

    try {
      setIsLoadingSchema(true);
      setSchemaError(null);

      if (schemaCache.current.has(cacheKey)) {
        const cached = schemaCache.current.get(cacheKey);
        setSchema(cached);
        setFormStage(category ? 'category-specific' : 'essential');
        setIsLoadingSchema(false);
        return;
      }

      if (inflightRequests.current.has(cacheKey)) {
        const existing = inflightRequests.current.get(cacheKey)!;
        const result = await existing;
        setSchema(result);
        setFormStage(category ? 'category-specific' : 'essential');
        setIsLoadingSchema(false);
        return;
      }

      const requestPromise = (async () => {
        const context = createBackendContext(
          userId,
          organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels,
          category || '',
          permissions
        );
        const raw = await generateFormSchema(context);
        const actual = unwrapSchema(raw);
        schemaCache.current.set(cacheKey, actual);
        return actual;
      })();

      inflightRequests.current.set(cacheKey, requestPromise);
      const actualSchema = await requestPromise;
      inflightRequests.current.delete(cacheKey);

      const stage = actualSchema.metadata?.formStage || (category ? 'category-specific' : 'essential');
      setSchema(actualSchema);
      setFormStage(stage);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load form schema';
      setSchemaError(msg);
      setSchema(null);
      inflightRequests.current.delete(cacheKey);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  const loadCategoryFieldsSmooth = useCallback(async (category: string) => {
    if (!category || category.trim() === '') return;

    const cacheKey = category.toLowerCase().trim();

    if (schemaCache.current.has(cacheKey)) {
      setSchema(schemaCache.current.get(cacheKey));
      setFormStage('category-specific');
      return;
    }

    if (inflightRequests.current.has(cacheKey)) {
      try {
        const result = await inflightRequests.current.get(cacheKey)!;
        setSchema(result);
        setFormStage('category-specific');
      } catch {
        // fall through to new request
      }
      return;
    }

    try {
      setIsAddingCategoryFields(true);
      setSchemaError(null);

      const requestPromise = (async () => {
        const context = createBackendContext(
          userId,
          organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels,
          category,
          permissions
        );
        const raw = await refreshFormSchema(context);
        const actual = unwrapSchema(raw);
        schemaCache.current.set(cacheKey, actual);
        return actual;
      })();

      inflightRequests.current.set(cacheKey, requestPromise);
      const actualSchema = await requestPromise;
      inflightRequests.current.delete(cacheKey);

      setSchema(actualSchema);
      setFormStage('category-specific');

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load category fields';
      setSchemaError(msg);
      inflightRequests.current.delete(cacheKey);
    } finally {
      setIsAddingCategoryFields(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  const clearSchemaCache = useCallback(() => {
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
