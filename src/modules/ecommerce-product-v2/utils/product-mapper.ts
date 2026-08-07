/**
 * Product Mapper Utilities
 * Pure transforms: form data → MasterProduct, MasterProduct → sourceSchema
 */

import { MasterProduct, ProductVariant } from '../types/product';
import { DynamicFormData } from '../types/form-schema';
import { convertValueByType } from './form-utils';

export interface ProductGenerationOptions {
  formData: DynamicFormData;
  schema: any;
  organizationId: string;
  userId: string;
  /** Client-assigned UUID v4 — passed to backend as context.productId so master_product_data._id
   *  matches channel_product_data.masterProductId across create and edit flows. */
  productId?: string;
}

/**
 * Normalize any image-field value into a clean array of URL strings.
 *
 * Guards the create/update payload so images always leave the frontend as a real
 * JSON array — never a bracketed string ("[https://a.jpg, https://b.jpg]", the
 * artifact of a Java List.toString()) and never a comma-joined string. Handles:
 *   - a proper array of URLs (flattened + trimmed, empties dropped)
 *   - a single URL string
 *   - a JSON-array string:    '["https://a.jpg","https://b.jpg"]'
 *   - a Java List.toString():  '[https://a.jpg, https://b.jpg]'
 *   - a comma-joined string:   'https://a.jpg, https://b.jpg'
 */
export function normalizeImageUrls(value: unknown): string[] {
  if (value == null) return [];

  // Recurse so a stray stringified entry inside the array is also cleaned.
  if (Array.isArray(value)) return value.flatMap(normalizeImageUrls);

  if (typeof value !== 'string') return [];

  let s = value.trim();
  if (!s) return [];

  if (s.startsWith('[') && s.endsWith(']')) {
    // Prefer strict JSON (handles quoted entries); fall back to stripping the
    // surrounding brackets left by List.toString().
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return normalizeImageUrls(parsed);
    } catch { /* not JSON — strip brackets below */ }
    s = s.slice(1, -1);
  }

  // Split any remaining comma-joined tokens. GCS/marketplace image URLs contain no
  // unencoded commas, so this stays safe on the corrupt-data recovery path.
  return s.split(',').map((t) => t.trim()).filter(Boolean);
}

/** First clean URL from any image-field value, or '' — for single-image fields (mainImage). */
export function normalizeSingleImageUrl(value: unknown): string {
  return normalizeImageUrls(value)[0] ?? '';
}

/**
 * Generates a MasterProduct object from form data using schema configuration
 */
export function generateMasterProduct(options: ProductGenerationOptions): MasterProduct {
  const { formData, schema, organizationId, userId, productId } = options;

  if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
    throw new Error('Invalid schema provided to product generation - no fields found');
  }

  const now = new Date().toISOString();
  const product: Partial<MasterProduct> = {
    id: productId || `prod_${Date.now()}`,
    sku: formData.sku as string || `SKU_${Date.now()}`,
    name: formData.name as string || '',
    price: Number(formData.price) || 0,
    createdAt: now,
    updatedAt: now,
    customAttributes: {
      _organizationId: organizationId,
      _createdBy: userId,
      _updatedBy: userId
    }
  };

  const mappedFields = new Set<string>(['sku', 'name', 'price']);

  for (const field of schema.fields) {
    const { fieldName, name, backendFieldPath, fieldType } = field;
    const actualFieldName = fieldName || name;
    const value = formData[actualFieldName];

    if (value === null || value === undefined || value === '') continue;

    // NOTE: length / width / height / dimensionUnit are NOT special-cased — they flow
    // through as flat fields (like weight/weightUnit). The backend and the pattern-match
    // analyzer both consume them flat, so nesting them here would only be undone downstream.

    if (actualFieldName === 'variantConfigurator') {
      try {
        const variantConfig = typeof value === 'string' ? JSON.parse(value) : value;
        if (variantConfig?.variants) {
          (product as any).variants = variantConfig.variants;
          mappedFields.add(actualFieldName);
        }
      } catch {
        // skip invalid JSON
      }
      continue;
    }

    if (actualFieldName === 'images' || actualFieldName === 'galleryImages') {
      // Always emit a clean array of URL strings (never a bracketed/comma-joined string).
      (product as any)[actualFieldName] = normalizeImageUrls(value);
      mappedFields.add(actualFieldName);
      continue;
    }

    if (actualFieldName === 'mainImage') {
      // mainImage is a single URL string. If the backend configured it multi
      // (multiple:true / maxItems>1) the first URL is featured and the rest seed the gallery.
      const urls = normalizeImageUrls(value);
      (product as any).mainImage = urls[0] || '';
      if (Array.isArray(value) && urls.length > 1) {
        (product as any).galleryImages = urls;
      }
      mappedFields.add(actualFieldName);
      continue;
    }

    if (actualFieldName === 'channelSettings') {
      (product as any).channelSettings = value;
      mappedFields.add(actualFieldName);
      continue;
    }

    if (backendFieldPath) {
      const pathParts = backendFieldPath.split('.');
      if (pathParts.length === 1) {
        (product as any)[backendFieldPath] = convertValueByType(value, fieldType);
        mappedFields.add(actualFieldName);
      } else {
        let current: any = product;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        current[pathParts[pathParts.length - 1]] = convertValueByType(value, fieldType);
        mappedFields.add(actualFieldName);
      }
    } else {
      (product as any)[actualFieldName] = convertValueByType(value, fieldType);
      mappedFields.add(actualFieldName);
    }
  }

  for (const [key, value] of Object.entries(formData)) {
    if (!mappedFields.has(key) && value !== null && value !== undefined && value !== '') {
      if (key.startsWith('_') || key === 'hasVariants') continue;

      // variantConfigurator may not be in schema.fields (backend doesn't generate it as an
      // attribute field) so it never enters mappedFields. Extract variants here as a fallback
      // so they reach product.variants regardless of whether the schema included the field.
      if (key === 'variantConfigurator') {
        try {
          const cfg = typeof value === 'string' ? JSON.parse(value as string) : value;
          if (cfg?.variants && Array.isArray(cfg.variants) && cfg.variants.length > 0) {
            (product as any).variants = cfg.variants;
          }
        } catch { /**/ }
        continue; // never store the raw JSON string in customAttributes
      }

      (product.customAttributes as any)[key] = value;
    }
  }

  return product as MasterProduct;
}

/**
 * Transforms a MasterProduct to flat sourceSchema format for pattern matching
 * POST /api/v1/adaptive-pattern-matching/analyze
 */
export function transformMasterProductToSourceSchema(
  product: MasterProduct
): Record<string, any> {
  const sourceSchema: Record<string, any> = {};

  const skipFields = new Set([
    'id',
    'channelMappings',
    'publishedChannels',
    'createdAt',
    'updatedAt',
    'publishedAt',
  ]);

  Object.entries(product).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (skipFields.has(key)) return;

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      if (typeof value[0] === 'string') {
        sourceSchema[key] = value.join(', ');
        if (key === 'galleryImages' || key === 'images') {
          value.forEach((item, index) => {
            sourceSchema[`${key}_${index + 1}`] = item;
          });
        }
      } else {
        sourceSchema[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      return; // handled below
    } else {
      sourceSchema[key] = value;
    }
  });

  // weight / weightUnit and length / width / height / dimensionUnit are all flat scalar
  // fields on the product, so the generic scalar loop above already copies them into
  // sourceSchema verbatim (as `weightUnit`/`dimensionUnit`, matching the flat field names —
  // no hardcoded unit default, no snake_case alias).

  if (product.variantOptions && product.variantOptions.length > 0) {
    sourceSchema['variant_options'] = product.variantOptions.map(opt => opt.name).join(', ');
    product.variantOptions.forEach((option, index) => {
      sourceSchema[`variant_option_${index + 1}_name`] = option.name;
      sourceSchema[`variant_option_${index + 1}_values`] = option.values.join(', ');
    });
  }

  if (product.variants && product.variants.length > 0) {
    sourceSchema['variant_count'] = product.variants.length;

    const firstVariant = product.variants[0];
    if (firstVariant) {
      Object.entries(firstVariant).forEach(([vKey, vVal]) => {
        if (vVal !== null && vVal !== undefined && vVal !== '') {
          sourceSchema[`variant_${vKey}`] = vVal;
        }
      });
    }

    sourceSchema['variants'] = product.variants;
  }

  if (product.customAttributes) {
    Object.entries(product.customAttributes).forEach(([key, value]) => {
      if (key.startsWith('_')) return;
      if (value === null || value === undefined || value === '') return;
      sourceSchema[key] = value;
    });
  }

  return sourceSchema;
}

export interface GenerateMappingRequestOptions {
  confidenceThreshold?: number;
  organizationId?: string;
  userId?: string;
  categoryId?: string;
  persistJolt?: boolean;
  persistConfidenceThreshold?: number;
  forceReanalyze?: boolean;
}

/**
 * Generates a complete mapping request for the pattern matching API.
 * Fetches the target channel schema from backend.
 */
export async function generateMappingRequest(
  product: MasterProduct,
  channelId: string,
  options: GenerateMappingRequestOptions = {}
) {
  const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1';

  const sourceSchema = transformMasterProductToSourceSchema(product);

  // A0: pass the category so the target schema is the base apiSchema MERGED with the per-category
  // extension (category-specific channel-unique fields become mapping targets). Without it the target
  // is base-only and category fields can never be matched. "default"/blank is treated as base-only by
  // the backend. Mirrors the product-aware analyze path (generateComplexTargetSchema(channelId, slug)).
  const category = options.categoryId?.trim();
  const schemaUrl =
    `${BACKEND_BASE_URL}/channels/${channelId}/schema/complex?format=nested` +
    (category ? `&categoryId=${encodeURIComponent(category)}` : '');

  const response = await fetch(schemaUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channel schema: ${response.statusText}`);
  }

  const result = await response.json();
  const targetSchema = result.schema || result;

  return {
    sourceSchema,
    targetSchema,
    channelId,
    confidenceThreshold: options.confidenceThreshold || 70,
    organizationId: options.organizationId,
    userId: options.userId,
    categoryId: options.categoryId,
    persistJolt: options.persistJolt,
    persistConfidenceThreshold: options.persistConfidenceThreshold,
    forceReanalyze: options.forceReanalyze,
  };
}

/**
 * Convert a products-module MasterProductDetail (from MasterProductService.getById)
 * into the ecommerce MasterProduct shape that generateMappingRequest expects.
 * Mirrors the inline conversion the merchant publish flow uses, so both paths feed
 * the analyzer identical products. `detail` is loosely typed to avoid a cross-module
 * type import.
 */
export function masterDetailToProduct(detail: Record<string, unknown>): MasterProduct {
  const status = String(detail.status ?? "draft").toLowerCase();
  return {
    id: String(detail.id ?? ""),
    name: String(detail.name ?? ""),
    sku: String(detail.sku ?? ""),
    price: Number(detail.basePrice ?? 0),
    category: (detail.category as string | undefined) ?? undefined,
    mainImage: (detail.imageUrl as string | undefined) ?? undefined,
    description: (detail.description as string | undefined) ?? undefined,
    tags: (detail.tags as string[] | undefined) ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants: (detail.variants ?? []) as any[],
    hasVariants: Number(detail.variantCount ?? 0) > 0,
    customAttributes: {
      _organizationId: String(detail.organizationId ?? ""),
      _createdBy: "",
      ...(detail.currency ? { currency: detail.currency } : {}),
    },
    status: (status === "active" || status === "archived" ? status : "draft") as "draft" | "active" | "archived",
    createdAt: String(detail.createdAt ?? ""),
    updatedAt: String(detail.updatedAt ?? ""),
  } as unknown as MasterProduct;
}

/** Step-2 per-store data merged into the analyze source schema. */
export interface StoreOverrideData {
  channelData?: Record<string, unknown>;
  masterOverrides?: Record<string, unknown>;
  variantOverrides?: Record<string, Record<string, unknown>>;
}

/**
 * Merge a store's Step-2 overrides into an analyze request's sourceSchema so the
 * matcher sees the exact publish picture: master fields + channel fields the user
 * filled + master overrides + variant overrides (variant_-prefixed). Mutates and
 * returns the request. Shared by the merchant publish flow AND Publish Diagnostics
 * so both replicate the identical source data.
 */
export function mergeStoreOverridesIntoRequest<T extends { sourceSchema: Record<string, unknown> }>(
  request: T,
  store: StoreOverrideData | null | undefined,
): T {
  if (!store) return request;

  const channelFields = store.channelData ?? {};
  if (Object.keys(channelFields).length > 0) {
    request.sourceSchema = { ...request.sourceSchema, ...channelFields };
  }

  const masterOverrides = store.masterOverrides ?? {};
  if (Object.keys(masterOverrides).length > 0) {
    request.sourceSchema = { ...request.sourceSchema, ...masterOverrides };
  }

  // Flatten variant overrides with a variant_ prefix; first non-null value wins per field.
  const variantOverrides = store.variantOverrides ?? {};
  const flatVariantFields: Record<string, unknown> = {};
  for (const skuOverrides of Object.values(variantOverrides)) {
    for (const [fieldName, value] of Object.entries(skuOverrides)) {
      if (value != null && !(fieldName in flatVariantFields)) {
        flatVariantFields[`variant_${fieldName}`] = value;
      }
    }
  }
  if (Object.keys(flatVariantFields).length > 0) {
    request.sourceSchema = { ...request.sourceSchema, ...flatVariantFields };
  }

  return request;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Deep-merge `add` into a copy of `base`. Objects recurse; arrays/primitives are leaves (add wins). */
function deepMergeObjects(
  base: Record<string, unknown>,
  add: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(add)) {
    const cur = out[k];
    out[k] = isPlainObject(cur) && isPlainObject(v) ? deepMergeObjects(cur, v) : v;
  }
  return out;
}

/**
 * A2: fold live channel (attributeConfig) fields into the analyze request's TARGET schema, so
 * category-live channel-unique fields become mapping TARGETS. These are TARGET-side (channel body
 * paths the channel expects for a category), the mirror of {@link mergeStoreOverridesIntoRequest}
 * which enriches the SOURCE. Deep-merged so nested subtrees extend the base rather than replace it.
 * Mutates and returns the request; empty/null is a no-op.
 */
export function mergeLiveChannelFieldsIntoTarget<T extends { targetSchema: Record<string, unknown> }>(
  request: T,
  liveFields: Record<string, unknown> | null | undefined,
): T {
  if (!liveFields || Object.keys(liveFields).length === 0) return request;
  request.targetSchema = deepMergeObjects(request.targetSchema, liveFields);
  return request;
}
