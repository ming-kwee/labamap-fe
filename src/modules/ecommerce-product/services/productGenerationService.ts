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
 * Validates that required fields are present in the product. ???
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
 * Extracts product summary for display purposes. ???
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
 * STEP 2: Get target channel schema from MongoDB apiSchema field
 * Fetches complex nested schema structure from backend (MongoDB migration 2025-12-27)
 *
 * Endpoint: GET /api/v1/channels/{channelId}/schema/complex?format=nested
 * MongoDB Field: channel_configurations.apiSchema
 *
 * Returns the actual API structure that the channel expects (nested objects, arrays, etc.)
 *
 * @param channelId - Channel identifier (shopify, amazon, walmart, ebay)
 * @returns Promise resolving to channel schema structure from MongoDB
 */
export async function getChannelSchemaTemplate(channelId: string): Promise<Record<string, any>> {
  console.log('[ProductGeneration] 📡 Fetching channel schema from backend (Step 2)');
  console.log('[ProductGeneration] Channel:', channelId);

  const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1';

  try {
    // Step 2: Use complex schema endpoint that reads from MongoDB apiSchema field
    const response = await fetch(
      `${BACKEND_BASE_URL}/channels/${channelId}/schema/complex?format=nested`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('[ProductGeneration] ❌ Failed to fetch channel schema:', response.statusText);
      throw new Error(`Failed to fetch channel schema: ${response.statusText}`);
    }

    const result = await response.json();

    // Backend returns: { schema: { product: {...} } } or { schema: {...} }
    const schema = result.schema || result;

    console.log('[ProductGeneration] ✅ Channel schema loaded from MongoDB (Step 2)');
    console.log('[ProductGeneration] Schema type:', typeof schema);
    console.log('[ProductGeneration] Schema keys:', Object.keys(schema));

    return schema;
  } catch (error) {
    console.error('[ProductGeneration] ❌ Error fetching channel schema:', error);

    // Re-throw error - no fallback templates!
    // Frontend should handle this error gracefully
    throw new Error(`Cannot load schema for channel ${channelId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate complete mapping request for adaptive pattern matching API
 */
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
 * STEP 2: Generate mapping request using backend schema (fully async)
 *
 * Fetches target schema from MongoDB apiSchema field instead of using hardcoded templates
 *
 * @param product - Master product to map
 * @param channelId - Target channel
 * @param options - Additional options (confidence threshold, org/user IDs)
 * @returns Promise resolving to mapping request object
 */
export async function generateMappingRequest(
  product: MasterProduct,
  channelId: string,
  options: GenerateMappingRequestOptions = {}
) {
  console.log('[ProductGeneration] ===== GENERATING MAPPING REQUEST (STEP 2) =====');
  console.log('[ProductGeneration] Product:', product.name);
  console.log('[ProductGeneration] Channel:', channelId);
  console.log('[ProductGeneration] Fetching target schema from backend...');

  // Transform master product to source schema (pure reflection - no hardcoding)
  const sourceSchema = transformMasterProductToSourceSchema(product);

  // Fetch target schema from backend (MongoDB apiSchema field)
  const targetSchema = await getChannelSchemaTemplate(channelId);

  console.log('[ProductGeneration] ✅ Mapping request generated');
  console.log('[ProductGeneration] Source fields:', Object.keys(sourceSchema).length);
  console.log('[ProductGeneration] Target schema keys:', Object.keys(targetSchema).length);

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

/**
 * STEP 2: Check channel readiness using backend channel configuration
 * Fetches required fields from MongoDB channel_configurations.requiredFields
 *
 * NO HARDCODED CHANNEL RULES - fully backend-driven!
 *
 * @param product - Master product to check
 * @param channelId - Target channel
 * @returns Promise resolving to readiness assessment
 */
export async function checkChannelReadiness(
  product: MasterProduct,
  channelId: string
): Promise<ChannelReadinessResult> {
  console.log('[ProductGeneration] 📡 Checking channel readiness (backend-driven)');
  console.log('[ProductGeneration] Channel:', channelId);

  const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1';

  const result: ChannelReadinessResult = {
    ready: true,
    confidence: 100,
    missingRequiredFields: [],
    missingRecommendedFields: [],
    warnings: [],
    blockers: [],
  };

  try {
    // Fetch ALL channels from backend (MongoDB)
    const response = await fetch(
      `${BACKEND_BASE_URL}/channels`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('[ProductGeneration] ❌ Failed to fetch channels:', response.statusText);
      // If we can't get channel config, we can't validate - but don't block
      result.warnings.push(`Unable to validate against channel requirements: ${response.statusText}`);
      result.confidence = 50;
      return result;
    }

    const allChannels = await response.json();

    // Find the specific channel configuration
    const channelConfig = allChannels.find((ch: any) => ch.channelId === channelId);

    if (!channelConfig) {
      console.error('[ProductGeneration] ❌ Channel not found:', channelId);
      result.warnings.push(`Channel configuration not found for: ${channelId}`);
      result.confidence = 50;
      return result;
    }

    console.log('[ProductGeneration] ✅ Channel configuration loaded from MongoDB');
    console.log('[ProductGeneration] Required fields:', channelConfig.requiredFields);
    console.log('[ProductGeneration] Optional fields:', channelConfig.optionalFields);

    // Check required fields from backend configuration
    const requiredFields = channelConfig.requiredFields || [];

    for (const requiredField of requiredFields) {
      // Convert channel field names to product property names
      // Backend fields like "title" might map to product.name, "price" to product.price, etc.
      const productValue = getProductFieldValue(product, requiredField);

      if (productValue === null || productValue === undefined || productValue === '') {
        result.missingRequiredFields.push(requiredField);
      }
    }

    // Check optional/recommended fields
    const optionalFields = channelConfig.optionalFields || [];
    const recommendedFields = optionalFields.slice(0, 5); // Consider first 5 optional fields as "recommended"

    for (const recommendedField of recommendedFields) {
      const productValue = getProductFieldValue(product, recommendedField);

      if (productValue === null || productValue === undefined || productValue === '') {
        result.missingRecommendedFields.push(recommendedField);
      }
    }

    // Calculate readiness based on backend requirements
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
    console.log('[ProductGeneration] Missing required:', result.missingRequiredFields);
    console.log('[ProductGeneration] Missing recommended:', result.missingRecommendedFields);

    return result;
  } catch (error) {
    console.error('[ProductGeneration] ❌ Error checking channel readiness:', error);

    // Don't block product creation on validation errors
    result.warnings.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.confidence = 50;
    return result;
  }
}

/**
 * Helper function to get product field value by channel field name
 * Handles common field name mappings (title → name, etc.)
 */
function getProductFieldValue(product: MasterProduct, channelFieldName: string): any {
  // Common field name mappings
  const fieldMappings: Record<string, string> = {
    'title': 'name',
    'body_html': 'description',
    'productName': 'name',
    'productDescription': 'description',
    'inventory_quantity': 'quantity',
    'stock_quantity': 'quantity',
    'base_price': 'price',
  };

  // Try direct field access
  const directValue = (product as any)[channelFieldName];
  if (directValue !== undefined) {
    return directValue;
  }

  // Try mapped field access
  const mappedFieldName = fieldMappings[channelFieldName];
  if (mappedFieldName) {
    return (product as any)[mappedFieldName];
  }

  // Try custom attributes
  if (product.customAttributes && product.customAttributes[channelFieldName] !== undefined) {
    return product.customAttributes[channelFieldName];
  }

  return undefined;
}
