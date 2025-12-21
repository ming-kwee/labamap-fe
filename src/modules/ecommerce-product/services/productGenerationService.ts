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
 * Transform MasterProduct to flat sourceSchema format
 * Required by: POST /api/v1/adaptive-pattern-matching/analyze
 *
 * Converts nested product structure to flat key-value pairs for pattern matching
 * Example:
 * { name: "Product", price: 59.99, dimensions: { length: 10 } }
 * → { product_name: "Product", base_price: 59.99, length: 10 }
 */
export function transformMasterProductToSourceSchema(
  product: MasterProduct
): Record<string, any> {
  console.log('[ProductGeneration] Transforming MasterProduct to sourceSchema');
  console.log('[ProductGeneration] Product ID:', product.id);

  const sourceSchema: Record<string, any> = {};

  // Basic fields - direct mapping
  if (product.name) sourceSchema['product_name'] = product.name;
  if (product.sku) sourceSchema['product_sku'] = product.sku;
  if (product.description) sourceSchema['product_description'] = product.description;
  if (product.shortDescription) sourceSchema['short_description'] = product.shortDescription;
  if (product.brand) sourceSchema['brand'] = product.brand;
  if (product.category) sourceSchema['category'] = product.category;
  if (product.barcode) sourceSchema['barcode'] = product.barcode;
  if (product.hsCode) sourceSchema['hs_code'] = product.hsCode;

  // Pricing fields
  if (product.price !== undefined) sourceSchema['base_price'] = product.price;
  if (product.compareAtPrice) sourceSchema['compare_at_price'] = product.compareAtPrice;
  if (product.costPerItem) sourceSchema['cost_per_item'] = product.costPerItem;

  // Inventory fields
  if (product.quantity !== undefined) sourceSchema['stock_quantity'] = product.quantity;
  if (product.trackQuantity !== undefined) sourceSchema['track_quantity'] = product.trackQuantity;
  if (product.stockStatus) sourceSchema['stock_status'] = product.stockStatus;
  if (product.lowStockThreshold) sourceSchema['low_stock_threshold'] = product.lowStockThreshold;
  if (product.allowBackorders !== undefined) sourceSchema['allow_backorders'] = product.allowBackorders;

  // Media fields
  if (product.mainImage) sourceSchema['main_image'] = product.mainImage;
  if (product.galleryImages && product.galleryImages.length > 0) {
    sourceSchema['gallery_images'] = product.galleryImages;
    product.galleryImages.forEach((img, index) => {
      sourceSchema[`image_${index + 1}`] = img;
    });
  }
  if (product.videos && product.videos.length > 0) {
    sourceSchema['videos'] = product.videos;
  }

  // Physical properties - flatten dimensions
  if (product.weight) {
    sourceSchema['weight'] = product.weight;
    sourceSchema['weight_unit'] = product.weightUnit || 'kg';
  }

  if (product.dimensions) {
    sourceSchema['length'] = product.dimensions.length;
    sourceSchema['width'] = product.dimensions.width;
    sourceSchema['height'] = product.dimensions.height;
    sourceSchema['dimension_unit'] = product.dimensions.unit;
  }

  // SEO fields
  if (product.metaTitle) sourceSchema['seo_title'] = product.metaTitle;
  if (product.metaDescription) sourceSchema['seo_description'] = product.metaDescription;
  if (product.metaKeywords && product.metaKeywords.length > 0) {
    sourceSchema['seo_keywords'] = product.metaKeywords.join(', ');
  }
  if (product.searchTerms && product.searchTerms.length > 0) {
    sourceSchema['search_terms'] = product.searchTerms.join(', ');
  }

  // Shipping fields
  if (product.shippingClass) sourceSchema['shipping_class'] = product.shippingClass;
  if (product.shippingWeight) sourceSchema['shipping_weight'] = product.shippingWeight;
  if (product.requiresShipping !== undefined) sourceSchema['requires_shipping'] = product.requiresShipping;
  if (product.freeShipping !== undefined) sourceSchema['free_shipping'] = product.freeShipping;

  // Tags - join array into comma-separated string
  if (product.tags && product.tags.length > 0) {
    sourceSchema['tags'] = product.tags.join(', ');
  }

  // Status fields
  if (product.status) sourceSchema['status'] = product.status;
  if (product.visibility) sourceSchema['visibility'] = product.visibility;

  // Variant fields
  if (product.hasVariants !== undefined) {
    sourceSchema['has_variants'] = product.hasVariants;
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
  }

  // Custom attributes - flatten all
  if (product.customAttributes) {
    Object.entries(product.customAttributes).forEach(([key, value]) => {
      // Skip internal fields
      if (key.startsWith('_')) return;
      // Convert camelCase to snake_case for consistency
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      sourceSchema[snakeKey] = value;
    });
  }

  // Timestamps
  if (product.createdAt) sourceSchema['created_at'] = product.createdAt;
  if (product.updatedAt) sourceSchema['updated_at'] = product.updatedAt;
  if (product.publishedAt) sourceSchema['published_at'] = product.publishedAt;

  console.log('[ProductGeneration] ✓ Transformation complete');
  console.log('[ProductGeneration] Source schema fields:', Object.keys(sourceSchema).length);

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
