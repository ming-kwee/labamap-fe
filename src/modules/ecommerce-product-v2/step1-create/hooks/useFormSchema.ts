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
  selectedCategory: string | null;
  productTypeId: string | null;
  productTypeName: string | null;
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productTypeId, setProductTypeId] = useState<string | null>(null);
  const [productTypeName, setProductTypeName] = useState<string | null>(null);

  const schemaCache = useRef<Map<string, any>>(new Map());
  const inflightRequests = useRef<Map<string, Promise<any>>>(new Map());
  // Maps category slug → productTypeId so subsequent same-type lookups hit the canonical cache key
  const categoryTypeMap = useRef<Map<string, string>>(new Map());

  // Canonical cache key: share a single entry across categories with the same ProductType
  function buildCacheKey(ptId: string | null | undefined, category: string): string {
    const channels = [...targetChannels].sort().join(',');
    return ptId
      ? `type:${ptId}:${channels}`
      : `cat:${category.toLowerCase().trim()}:${channels}`;
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

  // Returns { schema, topMeta } — schema is the flattened formSchema, topMeta is the outer response metadata
  function unwrapSchema(rawResponse: any): { schema: any; topMeta: any } {
    const topMeta = rawResponse?.metadata ?? {};
    const schemaData = rawResponse?.formSchema ?? rawResponse;
    if (!schemaData || (!schemaData.sections && !schemaData.fields)) {
      throw new Error('Invalid schema format received from backend - missing both sections and fields');
    }
    return { schema: flattenSections(schemaData), topMeta };
  }

  const loadSchema = useCallback(async (category?: string) => {
    // Use slug-based key for initial lookup; will re-store under canonical key after response
    const slugKey = category ? `cat:${category.toLowerCase().trim()}` : 'essential';
    // If we already know the productTypeId for this category, check the canonical key first
    const knownTypeId = category ? categoryTypeMap.current.get(category.toLowerCase().trim()) : undefined;
    const canonicalKey = category ? buildCacheKey(knownTypeId, category) : 'essential';
    const lookupKey = schemaCache.current.has(canonicalKey) ? canonicalKey : slugKey;

    try {
      setIsLoadingSchema(true);
      setSchemaError(null);

      if (schemaCache.current.has(lookupKey)) {
        const cached = schemaCache.current.get(lookupKey);
        const cachedTopMeta = cached?._topMeta ?? {};
        setSchema(cached);
        setFormStage(category ? 'category-specific' : 'essential');
        setSelectedCategory(cachedTopMeta.selectedCategory ?? (category || null));
        setProductTypeId(cachedTopMeta.productTypeId ?? null);
        setProductTypeName(cachedTopMeta.productTypeName ?? null);
        setIsLoadingSchema(false);
        return;
      }

      if (inflightRequests.current.has(lookupKey)) {
        const existing = inflightRequests.current.get(lookupKey)!;
        const result = await existing;
        const cachedTopMeta = result?._topMeta ?? {};
        setSchema(result);
        setFormStage(category ? 'category-specific' : 'essential');
        setSelectedCategory(cachedTopMeta.selectedCategory ?? (category || null));
        setProductTypeId(cachedTopMeta.productTypeId ?? null);
        setProductTypeName(cachedTopMeta.productTypeName ?? null);
        setIsLoadingSchema(false);
        return;
      }

      const requestPromise = (async () => {
        const context = createBackendContext(
          userId, organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels, category || '', permissions
        );
        const raw = await generateFormSchema(context);
        const { schema: actual, topMeta } = unwrapSchema(raw);
        // Attach top-level metadata to schema object for cache retrieval
        actual._topMeta = topMeta;
        // Store under canonical key; also alias slug key → canonical key for future lookups
        const ptId = topMeta.productTypeId ?? null;
        const cKey = buildCacheKey(ptId, category || '');
        schemaCache.current.set(cKey, actual);
        if (category && ptId) categoryTypeMap.current.set(category.toLowerCase().trim(), ptId);
        return actual;
      })();

      inflightRequests.current.set(lookupKey, requestPromise);
      const actualSchema = await requestPromise;
      inflightRequests.current.delete(lookupKey);

      const schemaMeta = actualSchema.metadata ?? {};
      const topMeta = actualSchema._topMeta ?? {};
      const stage: FormStage =
        schemaMeta.formStage ??
        (schemaMeta.isCategorySpecific ? 'category-specific' : schemaMeta.isInitialLoad ? 'essential' : category ? 'category-specific' : 'essential');
      setSchema(actualSchema);
      setFormStage(stage);
      setSelectedCategory(schemaMeta.selectedCategory ?? topMeta.selectedCategory ?? (category || null));
      setProductTypeId(topMeta.productTypeId ?? null);
      setProductTypeName(topMeta.productTypeName ?? null);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load form schema';
      setSchemaError(msg);
      setSchema(null);
      inflightRequests.current.delete(slugKey);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  const loadCategoryFieldsSmooth = useCallback(async (category: string) => {
    if (!category || category.trim() === '') return;

    const slugKey = category.toLowerCase().trim();
    const knownTypeId = categoryTypeMap.current.get(slugKey);
    const canonicalKey = buildCacheKey(knownTypeId, category);
    const lookupKey = schemaCache.current.has(canonicalKey) ? canonicalKey : slugKey;

    if (schemaCache.current.has(lookupKey)) {
      const cached = schemaCache.current.get(lookupKey);
      const schemaMeta = cached?.metadata ?? {};
      const topMeta = cached?._topMeta ?? {};
      setSchema(cached);
      setFormStage(schemaMeta.formStage ?? (schemaMeta.isCategorySpecific ? 'category-specific' : 'essential'));
      setSelectedCategory(schemaMeta.selectedCategory ?? topMeta.selectedCategory ?? category);
      setProductTypeId(topMeta.productTypeId ?? null);
      setProductTypeName(topMeta.productTypeName ?? null);
      return;
    }

    if (inflightRequests.current.has(lookupKey)) {
      try {
        const result = await inflightRequests.current.get(lookupKey)!;
        const schemaMeta = result?.metadata ?? {};
        const topMeta = result?._topMeta ?? {};
        setSchema(result);
        setFormStage(schemaMeta.formStage ?? 'category-specific');
        setSelectedCategory(schemaMeta.selectedCategory ?? topMeta.selectedCategory ?? category);
        setProductTypeId(topMeta.productTypeId ?? null);
        setProductTypeName(topMeta.productTypeName ?? null);
        return;
      } catch {
        inflightRequests.current.delete(lookupKey);
      }
    }

    try {
      setIsAddingCategoryFields(true);
      setSchemaError(null);

      const requestPromise = (async () => {
        const context = createBackendContext(
          userId, organizationId,
          userRole as 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER',
          targetChannels, category, permissions
        );
        const raw = await refreshFormSchema(context);
        const { schema: actual, topMeta } = unwrapSchema(raw);
        actual._topMeta = topMeta;
        const ptId = topMeta.productTypeId ?? null;
        const cKey = buildCacheKey(ptId, category);
        schemaCache.current.set(cKey, actual);
        if (ptId) categoryTypeMap.current.set(slugKey, ptId);
        return actual;
      })();

      inflightRequests.current.set(lookupKey, requestPromise);
      const actualSchema = await requestPromise;
      inflightRequests.current.delete(lookupKey);

      const schemaMeta = actualSchema.metadata ?? {};
      const topMeta = actualSchema._topMeta ?? {};
      const stage: FormStage = schemaMeta.formStage ?? (schemaMeta.isCategorySpecific ? 'category-specific' : 'essential');
      setSchema(actualSchema);
      setFormStage(stage);
      setSelectedCategory(schemaMeta.selectedCategory ?? topMeta.selectedCategory ?? category);
      setProductTypeId(topMeta.productTypeId ?? null);
      setProductTypeName(topMeta.productTypeName ?? null);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load category fields';
      setSchemaError(msg);
      inflightRequests.current.delete(lookupKey);
    } finally {
      setIsAddingCategoryFields(false);
    }
  }, [userId, organizationId, userRole, targetChannels, permissions]);

  const clearSchemaCache = useCallback(() => {
    schemaCache.current.clear();
    inflightRequests.current.clear();
    categoryTypeMap.current.clear();
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
