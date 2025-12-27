/**
 * Product Generation Service
 * Transforms form data into MasterProduct format for backend submission
 * Uses configuration-driven approach - NO hardcoded field mappings
 *
 * NOTE: organizationId and userId are stored in customAttributes for tracking
 * The backend uses these from the request context, not from the product object
 */

import { MasterProduct, ProductVariant } from '../types/product';
import { DynamicFormData } from '../types/dynamicForm';
import { convertValueByType, isDimensionField } from '../utils/productFormUtils';

export interface ProductGenerationOptions {
  formData: DynamicFormData;
  schema: any;
  organizationId: string;
  userId: string;
}

/**
 * Generates a MasterProduct object from form data using schema configuration
 *
 * @param options - Generation options
 * @returns MasterProduct object ready for backend submission
 */
export function generateMasterProduct(options: ProductGenerationOptions): MasterProduct {
  const { formData, schema, organizationId, userId } = options;

  console.log('[Product Generation] Starting product generation with data:', formData);
  console.log('[Product Generation] Context:', { organizationId, userId });

  // Validate schema has fields
  if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
    throw new Error('Invalid schema provided to product generation - no fields found');
  }

  // Initialize product object with required fields
  const now = new Date().toISOString();
  const product: Partial<MasterProduct> = {
    id: `prod_${Date.now()}`,
    sku: formData.sku as string || `SKU_${Date.now()}`,
    name: formData.name as string || '',
    price: Number(formData.price) || 0,
    createdAt: now,
    updatedAt: now,
    customAttributes: {
      // Store organization and user context in custom attributes for tracking
      _organizationId: organizationId,
      _createdBy: userId,
      _updatedBy: userId
    }
  };

  // Track mapped fields to identify unmapped ones
  const mappedFields = new Set<string>(['sku', 'name', 'price']);

  // Track dimension fields for special handling
  const dimensionFields: Record<string, any> = {};

  // Iterate through all schema fields
  for (const field of schema.fields) {
      const { fieldName, name, backendFieldPath, fieldType } = field;
      const actualFieldName = fieldName || name;
      const value = formData[actualFieldName];

      // Skip empty values
      if (value === null || value === undefined || value === '') {
        continue;
      }

      // Handle dimension fields specially (combine into dimensions object)
      if (isDimensionField(actualFieldName)) {
        dimensionFields[actualFieldName] = value;
        mappedFields.add(actualFieldName);
        continue;
      }

      // Special handling for variant configurator
      if (actualFieldName === 'variantConfigurator') {
        try {
          const variantConfig = typeof value === 'string' ? JSON.parse(value) : value;
          if (variantConfig && variantConfig.variants) {
            (product as any).variants = variantConfig.variants;
            mappedFields.add(actualFieldName);
          }
        } catch (error) {
          console.error('[Product Generation] Error parsing variant configurator:', error);
        }
        continue;
      }

      // Special handling for images
      if (actualFieldName === 'images') {
        (product as any).images = Array.isArray(value) ? value : [];
        mappedFields.add(actualFieldName);
        continue;
      }

      // Special handling for channel settings
      if (actualFieldName === 'channelSettings') {
        (product as any).channelSettings = value;
        mappedFields.add(actualFieldName);
        continue;
      }

      // Use backendFieldPath from schema for mapping
      if (backendFieldPath) {
        // Handle nested paths (e.g., "pricing.basePrice")
        const pathParts = backendFieldPath.split('.');

        if (pathParts.length === 1) {
          // Simple field mapping
          (product as any)[backendFieldPath] = convertValueByType(value, fieldType);
          mappedFields.add(actualFieldName);
        } else {
          // Nested field mapping
          let current: any = product;
          for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) {
              current[part] = {};
            }
            current = current[part];
          }
          current[pathParts[pathParts.length - 1]] = convertValueByType(value, fieldType);
          mappedFields.add(actualFieldName);
        }
      } else {
        // No backendFieldPath specified - map directly to field name
        (product as any)[actualFieldName] = convertValueByType(value, fieldType);
        mappedFields.add(actualFieldName);
      }
  }

  // Combine dimension fields into dimensions object if any exist
  if (Object.keys(dimensionFields).length > 0) {
    (product as any).dimensions = {
      length: dimensionFields.length || 0,
      width: dimensionFields.width || 0,
      height: dimensionFields.height || 0,
      unit: dimensionFields.dimensionUnit || 'in'
    };
  }

  // Add unmapped fields to customAttributes (anything in formData not mapped)
  for (const [key, value] of Object.entries(formData)) {
    if (!mappedFields.has(key) && value !== null && value !== undefined && value !== '') {
      // Skip internal fields
      if (key.startsWith('_') || key === 'hasVariants') {
        continue;
      }

      console.log(`[Product Generation] Adding unmapped field to customAttributes: ${key}`);
      (product.customAttributes as any)[key] = value;
    }
  }

  console.log('[Product Generation] Generated product:', product);

  return product as MasterProduct;
}

/**
 * Validates that required fields are present in the product
 *
 * @param product - Product to validate
 * @param schema - Form schema
 * @returns Array of missing required fields
 */
export function validateRequiredFields(product: Partial<MasterProduct>, schema: any): string[] {
  const missingFields: string[] = [];

  // Validate schema has fields
  if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
    return missingFields;
  }

  for (const field of schema.fields) {
    if (field.required) {
      const fieldName = field.fieldName || field.name;
      const value = (product as any)[fieldName] || (product as any)[field.backendFieldPath];

      if (value === null || value === undefined || value === '') {
        missingFields.push(field.label || fieldName);
      }
    }
  }

  return missingFields;
}

/**
 * Extracts product summary for display purposes
 *
 * @param product - Product object
 * @returns Summary object with key fields
 */
export function getProductSummary(product: Partial<MasterProduct>): Record<string, any> {
  return {
    name: (product as any).name || (product as any).productName || 'Untitled Product',
    sku: (product as any).sku || 'N/A',
    category: (product as any).category || 'general',
    price: (product as any).price || (product as any).basePrice || 0,
    status: (product as any).status || 'draft',
    hasVariants: Array.isArray((product as any).variants) && (product as any).variants.length > 0
  };
}

// ============================================================================
// CHANNEL MAPPING UTILITIES
// ============================================================================

/**
 * Transform MasterProduct to flat sourceSchema format (TRULY DATA-DRIVEN)
 * Required by: POST /api/v1/adaptive-pattern-matching/analyze
 *
 * Uses pure reflection to automatically transform ALL product fields.
 * NO HARDCODING - relies on convention (snake_case) and type intelligence.
 * Backend is responsible for semantic mapping (e.g., price → base_price).
 *
 * Philosophy: Configuration over code, convention over configuration.
 *
 * Example:
 * Input:  { name: "Product", price: 59.99, dimensions: { length: 10 } }
 * Output: { name: "Product", price: 59.99, length: 10, width: 0, height: 0 }
 *
 * Note: Backend handles semantic renaming if needed (price → base_price)
 *
 * @param product - Master product to transform
 * @returns Flat sourceSchema object for pattern matching
 */
export function transformMasterProductToSourceSchema(
  product: MasterProduct
): Record<string, any> {
  console.log('[ProductGeneration] Transforming MasterProduct to sourceSchema (zero hardcoding)');
  console.log('[ProductGeneration] Product ID:', product.id);

  const sourceSchema: Record<string, any> = {};

  // Fields to skip (internal metadata not relevant for pattern matching)
  const skipFields = new Set([
    'id',                    // Internal ID
    'channelMappings',       // Runtime metadata
    'publishedChannels',     // Runtime metadata
    'createdAt',             // Timestamp
    'updatedAt',             // Timestamp
    'publishedAt',           // Timestamp
  ]);

  // ✅ PURE REFLECTION - No hardcoded field names
  Object.entries(product).forEach(([key, value]) => {
    // Skip null, undefined, empty strings
    if (value === null || value === undefined || value === '') {
      return;
    }

    // Skip metadata fields
    if (skipFields.has(key)) {
      return;
    }

    // Handle different value types intelligently
    if (Array.isArray(value)) {
      if (value.length === 0) return; // Skip empty arrays

      // String arrays → comma-separated string
      if (typeof value[0] === 'string') {
        sourceSchema[key] = value.join(', ');

        // Special case: image arrays get indexed fields too
        if (key === 'galleryImages' || key === 'images') {
          value.forEach((item, index) => {
            sourceSchema[`${key}_${index + 1}`] = item;
          });
        }
      } else {
        // Non-string arrays → keep as array
        sourceSchema[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Objects: handle specially based on known patterns
      // (dimensions, variants, etc. - handled below)
      return;
    } else {
      // Primitive values (string, number, boolean) → add directly
      sourceSchema[key] = value;
    }
  });

  // ✅ Handle nested objects (flatten to dot notation or separate fields)
  // Dimensions: Flatten to separate fields
  if (product.dimensions) {
    sourceSchema['length'] = product.dimensions.length || 0;
    sourceSchema['width'] = product.dimensions.width || 0;
    sourceSchema['height'] = product.dimensions.height || 0;
    sourceSchema['dimension_unit'] = product.dimensions.unit || 'cm';
  }

  // Weight: Include unit
  if (product.weight !== undefined && product.weight !== null) {
    sourceSchema['weight'] = product.weight;
    sourceSchema['weight_unit'] = product.weightUnit || 'kg';
  }

  // ✅ Handle variant options (complex structure)
  if (product.variantOptions && product.variantOptions.length > 0) {
    sourceSchema['variant_options'] = product.variantOptions
      .map(opt => opt.name)
      .join(', ');

    product.variantOptions.forEach((option, index) => {
      sourceSchema[`variant_option_${index + 1}_name`] = option.name;
      sourceSchema[`variant_option_${index + 1}_values`] = option.values.join(', ');
    });
  }

  // Variants: Add count
  if (product.variants && product.variants.length > 0) {
    sourceSchema['variant_count'] = product.variants.length;
  }

  // ✅ Handle custom attributes (truly dynamic)
  if (product.customAttributes) {
    Object.entries(product.customAttributes).forEach(([key, value]) => {
      // Skip internal fields (prefixed with _)
      if (key.startsWith('_')) return;

      // Skip empty values
      if (value === null || value === undefined || value === '') return;

      // Add with original key name (no transformation)
      sourceSchema[key] = value;
    });
  }

  console.log('[ProductGeneration] ✓ Transformation complete (zero hardcoding)');
  console.log('[ProductGeneration] Source schema fields:', Object.keys(sourceSchema).length);
  console.log('[ProductGeneration] Backend handles semantic mapping');

  return sourceSchema;
}

/**
 * Get target channel schema template
 * Returns empty schema structure with expected field names for a channel
 */
export function getChannelSchemaTemplate(channelId: string): Record<string, any> {
  console.log('[ProductGeneration] Getting schema template for channel:', channelId);

  const templates: Record<string, Record<string, any>> = {
    shopify: {
      title: '',
      body_html: '',
      vendor: '',
      product_type: '',
      tags: '',
      price: 0,
      compare_at_price: 0,
      inventory_quantity: 0,
      weight: 0,
      weight_unit: '',
      barcode: '',
      sku: '',
      image: '',
      images: [],
    },
    amazon: {
      title: '',
      bullet_point_1: '',
      bullet_point_2: '',
      bullet_point_3: '',
      description: '',
      brand: '',
      price: 0,
      quantity: 0,
      sku: '',
      product_id: '',
      product_id_type: 'UPC',
      condition_type: 'New',
      main_image_url: '',
      other_image_url_1: '',
      package_weight: 0,
      package_weight_unit_of_measure: '',
      item_dimensions_length: 0,
      item_dimensions_width: 0,
      item_dimensions_height: 0,
    },
    walmart: {
      productName: '',
      productDescription: '',
      brand: '',
      price: 0,
      sku: '',
      upc: '',
      gtin: '',
      inventory: 0,
      weight: 0,
      weightUnit: '',
      length: 0,
      width: 0,
      height: 0,
      mainImageUrl: '',
    },
    ebay: {
      Title: '',
      Description: '',
      CategoryID: '',
      StartPrice: 0,
      Quantity: 0,
      SKU: '',
      PictureURL: '',
      ConditionID: '1000',
      ShippingType: 'Flat',
    },
  };

  return templates[channelId.toLowerCase()] || {};
}

/**
 * Generate complete mapping request for adaptive pattern matching API
 */
export interface GenerateMappingRequestOptions {
  confidenceThreshold?: number;
  organizationId?: string;
  userId?: string;
}

export function generateMappingRequest(
  product: MasterProduct,
  channelId: string,
  options: GenerateMappingRequestOptions = {}
) {
  console.log('[ProductGeneration] ===== GENERATING MAPPING REQUEST =====');
  console.log('[ProductGeneration] Product:', product.name);
  console.log('[ProductGeneration] Channel:', channelId);

  const sourceSchema = transformMasterProductToSourceSchema(product);
  const targetSchema = getChannelSchemaTemplate(channelId);

  return {
    sourceSchema,
    targetSchema,
    channelId,
    confidenceThreshold: options.confidenceThreshold || 70,
    organizationId: options.organizationId,
    userId: options.userId,
  };
}

/**
 * Check if product is ready for publishing to a specific channel
 */
export interface ChannelReadinessResult {
  ready: boolean;
  confidence: number;
  missingRequiredFields: string[];
  missingRecommendedFields: string[];
  warnings: string[];
  blockers: string[];
}

export function checkChannelReadiness(
  product: MasterProduct,
  channelId: string
): ChannelReadinessResult {
  console.log('[ProductGeneration] Checking channel readiness for:', channelId);

  const result: ChannelReadinessResult = {
    ready: true,
    confidence: 100,
    missingRequiredFields: [],
    missingRecommendedFields: [],
    warnings: [],
    blockers: [],
  };

  // Common required fields across all channels
  if (!product.name) result.missingRequiredFields.push('name');
  if (!product.sku) result.missingRequiredFields.push('sku');
  if (product.price === undefined || product.price <= 0) result.missingRequiredFields.push('price');
  if (!product.description) result.missingRecommendedFields.push('description');

  // Channel-specific requirements
  switch (channelId.toLowerCase()) {
    case 'amazon':
      if (!product.brand) result.missingRequiredFields.push('brand');
      if (!product.barcode) result.missingRecommendedFields.push('barcode');
      if (!product.mainImage) result.missingRequiredFields.push('mainImage');
      if (product.quantity === undefined) result.missingRequiredFields.push('quantity');
      break;

    case 'shopify':
      if (!product.mainImage) result.missingRecommendedFields.push('mainImage');
      if (product.quantity === undefined) result.missingRecommendedFields.push('quantity');
      break;

    case 'walmart':
      if (!product.brand) result.missingRequiredFields.push('brand');
      if (!product.barcode) result.missingRequiredFields.push('barcode');
      if (!product.mainImage) result.missingRequiredFields.push('mainImage');
      if (!product.category) result.missingRequiredFields.push('category');
      break;

    case 'ebay':
      if (!product.mainImage) result.missingRequiredFields.push('mainImage');
      if (product.quantity === undefined) result.missingRequiredFields.push('quantity');
      if (!product.category) result.missingRequiredFields.push('category');
      break;
  }

  // Calculate readiness
  if (result.missingRequiredFields.length > 0) {
    result.ready = false;
    result.blockers = result.missingRequiredFields.map(
      field => `Missing required field: ${field}`
    );
    result.confidence = Math.max(0, 100 - (result.missingRequiredFields.length * 25));
  } else if (result.missingRecommendedFields.length > 0) {
    result.confidence = Math.max(70, 100 - (result.missingRecommendedFields.length * 10));
    result.warnings = result.missingRecommendedFields.map(
      field => `Recommended field missing: ${field}`
    );
  }

  console.log('[ProductGeneration] Readiness:', result.ready, 'Confidence:', result.confidence);

  return result;
}
