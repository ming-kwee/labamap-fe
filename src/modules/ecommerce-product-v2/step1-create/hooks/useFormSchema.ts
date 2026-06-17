/**
 * Form Schema Hook
 * Manages dynamic schema loading from backend with caching
 */

import { useState, useCallback, useRef } from 'react';
import { generateFormSchema, refreshFormSchema, createBackendContext } from '../../services/schema-api.service';

export type FormStage = 'essential' | 'type-specific';

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
  selectedCategory: string | null;
  productTypeId: string | null;
  productTypeName: string | null;
  loadSchema: (productTypeId?: string) => Promise<void>;
  loadCategoryFieldsSmooth: (productTypeId: string) => Promise<void>;
  clearSchemaCache: () => void;
}

export function useFormSchema(options: UseFormSchemaOptions): UseFormSchemaReturn {
  const { userId, organizationId, userRole, targetChannels, permissions = [] } = options;

  const [schema, setSchema] = useState<any>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formStage, setFormStage] = useState<FormStage>('essential');
  const [isAddingCategoryFields, setIsAddingCategoryFields] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productTypeId, setProductTypeId] = useState<string | null>(null);
  const [productTypeName, setProductTypeName] = useState<string | null>(null);

  const schemaCache = useRef<Map<string, any>>(new Map());
  const inflightRequests = useRef<Map<string, Promise<any>>>(new Map());

  function buildCacheKey(ptId: string | null | undefined): string {
    const channels = [...targetChannels].sort().join(',');
    return ptId ? `type:${ptId}:${channels}` : `essential:${channels}`;
  }

  function flattenSections(schemaData: any): any {
    // Only extract from sections when the top-level fields array is absent or empty.
    // If the backend already populated fields, trust it and leave it untouched.
    if (schemaData.sections && (!schemaData.fields || schemaData.fields.length === 0)) {
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

  // Returns { schema, topMeta } — schema is the flattened formSchema, topMeta is the merged metadata.
  // Merges outer response.metadata with inner formSchema.metadata so productTypeId is found
  // regardless of which level the backend embeds it in.
  function unwrapSchema(rawResponse: any): { schema: any; topMeta: any } {
    const outerMeta = rawResponse?.metadata ?? {};
    const schemaData = rawResponse?.formSchema ?? rawResponse;
    if (!schemaData || (!schemaData.sections && !schemaData.fields)) {
      throw new Error('Invalid schema format received from backend - missing both sections and fields');
    }
    const innerMeta = schemaData.metadata ?? {};
    // Outer response metadata takes precedence; inner fills any gaps
    const topMeta = {
      ...innerMeta,
      ...outerMeta,
      productTypeId: outerMeta.productTypeId ?? innerMeta.productTypeId ?? null,
      productTypeName: outerMeta.productTypeName ?? innerMeta.productTypeName ?? null,
    };
    return { schema: flattenSections(schemaData), topMeta };
  }

  const loadSchema = useCallback(async (ptId?: string) => {
    const cacheKey = buildCacheKey(ptId ?? null);

    try {
      setIsLoadingSchema(true);
      setSchemaError(null);

      if (schemaCache.current.has(cacheKey)) {
        const cached = schemaCache.current.get(cacheKey);
        const cachedTopMeta = cached?._topMeta ?? {};
        setSchema(cached);
        setFormStage(ptId ? 'type-specific' : 'essential');
        setProductTypeId(cachedTopMeta.productTypeId ?? ptId ?? null);
        setProductTypeName(cachedTopMeta.productTypeName ?? null);
        setSelectedCategory(cachedTopMeta.selectedCategory ?? null);
        setIsLoadingSchema(false);
        return;
      }

      if (inflightRequests.current.has(cacheKey)) {
        const result = await inflightRequests.current.get(cacheKey)!;
        const cachedTopMeta = result?._topMeta ?? {};
        setSchema(result);
        setFormStage(ptId ? 'type-specific' : 'essential');
        setProductTypeId(cachedTopMeta.productTypeId ?? ptId ?? null);
        setProductTypeName(cachedTopMeta.productTypeName ?? null);
        setSelectedCategory(cachedTopMeta.selectedCategory ?? null);
        setIsLoadingSchema(false);
        return;
      }

      const requestPromise = (async () => {
        const context = createBackendContext(
          userId, organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels, '', permissions, ptId,
        );
        const raw = await generateFormSchema(context);
        const { schema: actual, topMeta } = unwrapSchema(raw);
        actual._topMeta = topMeta;
        schemaCache.current.set(cacheKey, actual);
        return actual;
      })();

      inflightRequests.current.set(cacheKey, requestPromise);
      const actualSchema = await requestPromise;
      inflightRequests.current.delete(cacheKey);

      const schemaMeta = actualSchema.metadata ?? {};
      const topMeta = actualSchema._topMeta ?? {};
      const stage: FormStage = ptId
        ? (schemaMeta.formStage === 'essential' ? 'essential' : 'type-specific')
        : 'essential';
      setSchema(actualSchema);
      setFormStage(stage);
      setProductTypeId(topMeta.productTypeId ?? ptId ?? null);
      setProductTypeName(topMeta.productTypeName ?? null);
      setSelectedCategory(schemaMeta.selectedCategory ?? topMeta.selectedCategory ?? null);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load form schema';
      setSchemaError(msg);
      setSchema(null);
      inflightRequests.current.delete(cacheKey);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  // Smooth loader — sets isAddingCategoryFields for skeleton animation, then delegates to loadSchema.
  const loadCategoryFieldsSmooth = useCallback(async (ptId: string) => {
    if (!ptId || ptId.trim() === '') return;
    setIsAddingCategoryFields(true);
    try {
      await loadSchema(ptId);
    } finally {
      setIsAddingCategoryFields(false);
    }
  }, [loadSchema]);

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
    selectedCategory,
    productTypeId,
    productTypeName,
    loadSchema,
    loadCategoryFieldsSmooth,
    clearSchemaCache
  };
}
