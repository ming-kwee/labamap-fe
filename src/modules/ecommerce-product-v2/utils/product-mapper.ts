/**
 * Product Mapper Utilities
 * Pure transforms: form data → MasterProduct, MasterProduct → sourceSchema
 */

import { MasterProduct, ProductVariant } from '../types/product';
import { DynamicFormData } from '../types/form-schema';
import { convertValueByType, isDimensionField } from './form-utils';

export interface ProductGenerationOptions {
  formData: DynamicFormData;
  schema: any;
  organizationId: string;
  userId: string;
}

/**
 * Generates a MasterProduct object from form data using schema configuration
 */
export function generateMasterProduct(options: ProductGenerationOptions): MasterProduct {
  const { formData, schema, organizationId, userId } = options;

  if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
    throw new Error('Invalid schema provided to product generation - no fields found');
  }

  const now = new Date().toISOString();
  const product: Partial<MasterProduct> = {
    id: `prod_${Date.now()}`,
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
  const dimensionFields: Record<string, any> = {};

  for (const field of schema.fields) {
    const { fieldName, name, backendFieldPath, fieldType } = field;
    const actualFieldName = fieldName || name;
    const value = formData[actualFieldName];

    if (value === null || value === undefined || value === '') continue;

    if (isDimensionField(actualFieldName)) {
      dimensionFields[actualFieldName] = value;
      mappedFields.add(actualFieldName);
      continue;
    }

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

    if (actualFieldName === 'images') {
      (product as any).images = Array.isArray(value) ? value : [];
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

  if (Object.keys(dimensionFields).length > 0) {
    (product as any).dimensions = {
      length: dimensionFields.length || 0,
      width: dimensionFields.width || 0,
      height: dimensionFields.height || 0,
      unit: dimensionFields.dimensionUnit || 'in'
    };
  }

  for (const [key, value] of Object.entries(formData)) {
    if (!mappedFields.has(key) && value !== null && value !== undefined && value !== '') {
      if (key.startsWith('_') || key === 'hasVariants') continue;
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

  if (product.dimensions) {
    sourceSchema['length'] = product.dimensions.length || 0;
    sourceSchema['width'] = product.dimensions.width || 0;
    sourceSchema['height'] = product.dimensions.height || 0;
    sourceSchema['dimension_unit'] = product.dimensions.unit || 'cm';
  }

  if (product.weight !== undefined && product.weight !== null) {
    sourceSchema['weight'] = product.weight;
    sourceSchema['weight_unit'] = product.weightUnit || 'kg';
  }

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

  const response = await fetch(
    `${BACKEND_BASE_URL}/channels/${channelId}/schema/complex?format=nested`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );

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
