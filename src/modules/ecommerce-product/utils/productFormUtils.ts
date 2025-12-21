/**
 * Product Form Utilities
 * Pure utility functions for product form operations
 * No side effects, fully testable
 */

import { Package, DollarSign, Image, FileText, Truck, Tag, Star, Settings } from '@/shared/ui/icons/Icons';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SectionMetadata {
  label: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  description?: string;
  order: number;
}

// ============================================================================
// SCHEMA UTILITIES
// ============================================================================

/**
 * Normalizes section keys to kebab-case
 * Example: basic_info → basic-info, BasicInfo → basic-info
 */
export function normalizeSectionKey(sectionKey: string): string {
  if (!sectionKey) return 'basic-info';

  // Convert basic_info to basic-info, or BasicInfo to basic-info
  return sectionKey
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Groups fields by their section property from backend
 * This is the correct approach - backend sends field.section, not schema.sections
 * @param fields - Array of form fields from backend
 * @param excludeFieldNames - Field names to exclude (like hasVariants, variantConfigurator)
 * @returns Record of section key to fields array
 */
export function groupFieldsBySection(
  fields: any[],
  excludeFieldNames: string[] = []
): Record<string, any[]> {
  const fieldsBySection: Record<string, any[]> = {};

  fields.forEach((field: any) => {
    const fieldName = field.name || field.fieldName;

    // Skip excluded fields
    if (excludeFieldNames.includes(fieldName)) {
      return;
    }

    // Get section from field, normalize it
    const rawSection = field.section || 'basic-info';
    const section = normalizeSectionKey(rawSection);

    if (!fieldsBySection[section]) {
      fieldsBySection[section] = [];
    }
    fieldsBySection[section].push(field);
  });

  return fieldsBySection;
}

export interface CategoryValidationResult {
  category: string;
  isValid: boolean;
  warning?: string;
}

export type BackendUserRole = 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER';

// ============================================================================
// ROLE MAPPING
// ============================================================================

/**
 * Maps application user roles to backend expected format
 * @param role - Application role from auth context
 * @returns Backend role format
 */
export const mapUserRole = (role: string): BackendUserRole => {
  switch (role) {
    case 'ADMIN_USER':
    case 'ORGANIZATION_OWNER':
    case 'ORGANIZATION_ADMIN':
      return 'ADMIN';
    case 'BUSINESS_MANAGER':
    case 'BUSINESS_USER':
      return 'BUSINESS_USER';
    case 'DEVELOPER':
      return 'DEVELOPER';
    case 'VIEW_ONLY':
    default:
      return 'BUSINESS_USER';
  }
};

// ============================================================================
// SECTION UTILITIES
// ============================================================================

/**
 * Section metadata configuration
 * Provides UI metadata for each form section
 * Backend can override with sectionLabel, sectionIcon, etc.
 */
const SECTION_METADATA: Record<string, SectionMetadata> = {
  'basic-info': {
    label: 'Basic Information',
    icon: Package,
    iconColor: 'text-blue-600',
    description: 'Essential product details',
    order: 1
  },
  'pricing': {
    label: 'Pricing & Inventory',
    icon: DollarSign,
    iconColor: 'text-green-600',
    description: 'Pricing, costs, and stock levels',
    order: 2
  },
  'media': {
    label: 'Images & Media',
    icon: Image,
    iconColor: 'text-purple-600',
    description: 'Product images, videos, and galleries',
    order: 3
  },
  'content': {
    label: 'Product Content',
    icon: FileText,
    iconColor: 'text-indigo-600',
    description: 'Descriptions, features, and specifications',
    order: 4
  },
  'shipping': {
    label: 'Shipping Details',
    icon: Truck,
    iconColor: 'text-orange-600',
    description: 'Weight, dimensions, and shipping options',
    order: 5
  },
  'seo': {
    label: 'SEO & Marketing',
    icon: Star,
    iconColor: 'text-yellow-600',
    description: 'Search optimization and metadata',
    order: 6
  },
  'taxonomy': {
    label: 'Categories & Tags',
    icon: Tag,
    iconColor: 'text-pink-600',
    description: 'Product classification and organization',
    order: 7
  },
  'variants': {
    label: 'Product Variants',
    icon: Settings,
    iconColor: 'text-gray-600',
    description: 'Size, color, and other variations',
    order: 8
  }
};

/**
 * Gets metadata for a specific section
 * Returns default metadata if section not found
 *
 * @param sectionKey - Section identifier
 * @returns Section metadata with UI properties
 */
export const getSectionMetadata = (sectionKey: string): SectionMetadata => {
  const normalized = normalizeSectionKey(sectionKey);

  return SECTION_METADATA[normalized] || {
    label: sectionKey.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    icon: Settings,
    iconColor: 'text-gray-600',
    description: undefined,
    order: 999
  };
};

/**
 * Gets all section metadata entries sorted by order
 * @returns Array of [key, metadata] tuples sorted by order
 */
export const getAllSections = (): [string, SectionMetadata][] => {
  return Object.entries(SECTION_METADATA).sort((a, b) => a[1].order - b[1].order);
};

// ============================================================================
// CATEGORY VALIDATION
// ============================================================================

/**
 * Known product categories
 * Used for validation when backend doesn't provide category list
 */
export const KNOWN_CATEGORIES = [
  'electronics',
  'clothing',
  'books',
  'home-garden',
  'sports',
  'automotive',
  'health-beauty',
  'toys-games',
  'food-beverage',
  'general'
] as const;

export type KnownCategory = typeof KNOWN_CATEGORIES[number];

/**
 * Validates product category against organization rules and permissions
 *
 * @param category - Category to validate
 * @param assignedCategories - Categories assigned to user
 * @param organizationDefaultCategory - Organization's default category
 * @returns Validation result with category to use and any warnings
 */
export const validateProductCategory = (
  category: string,
  assignedCategories: string[] = [],
  organizationDefaultCategory: string = 'general'
): CategoryValidationResult => {
  console.log('[Category Validation] Input:', { category, assignedCategories, organizationDefaultCategory });

  // Use organization default if no category provided
  if (!category || category.trim() === '') {
    return {
      category: organizationDefaultCategory,
      isValid: true,
      warning: 'No category specified, using organization default'
    };
  }

  const normalizedCategory = category.toLowerCase().trim();

  // Check if user has access to this category
  if (assignedCategories.length > 0 && !assignedCategories.includes(normalizedCategory)) {
    console.warn(`[Category Validation] User not assigned to category '${normalizedCategory}'`);
    return {
      category: assignedCategories[0] || organizationDefaultCategory,
      isValid: false,
      warning: `Access denied to category '${category}'. Using assigned category instead.`
    };
  }

  // Validate against known categories (soft validation - allows unknown categories)
  if (!KNOWN_CATEGORIES.includes(normalizedCategory as KnownCategory)) {
    console.warn(`[Category Validation] Unknown category '${normalizedCategory}', proceeding but may cause schema issues`);
    return {
      category: normalizedCategory,
      isValid: true,
      warning: `Unknown category '${category}' - may have limited field support`
    };
  }

  return {
    category: normalizedCategory,
    isValid: true
  };
};

// ============================================================================
// VALUE TYPE CONVERSION
// ============================================================================

/**
 * Converts form field value to appropriate type based on schema
 *
 * @param value - Raw field value
 * @param fieldType - Expected field type from schema
 * @returns Typed value
 */
export const convertValueByType = (value: any, fieldType: string): any => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  switch (fieldType) {
    case 'number':
    case 'currency':
      return parseFloat(value);
    case 'integer':
      return parseInt(value, 10);
    case 'boolean':
    case 'checkbox':
      return Boolean(value);
    case 'array':
    case 'multi-select':
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
};

// ============================================================================
// FIELD UTILITIES
// ============================================================================

/**
 * Checks if a field name represents a dimension field
 * @param fieldName - Field name to check
 * @returns True if dimension field
 */
export const isDimensionField = (fieldName: string): boolean => {
  return ['length', 'width', 'height', 'dimensionUnit'].includes(fieldName);
};

/**
 * Validates email format
 * @param email - Email address to validate
 * @returns True if valid email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitizes field name for use as HTML id
 * @param fieldName - Field name
 * @returns Sanitized id
 */
export const sanitizeFieldId = (fieldName: string): string => {
  return fieldName.replace(/[^a-zA-Z0-9_-]/g, '_');
};
