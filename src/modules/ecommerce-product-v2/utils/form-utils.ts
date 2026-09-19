/**
 * Product Form Utilities
 * Pure utility functions for product form operations
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
 */
export function normalizeSectionKey(sectionKey: string): string {
  if (!sectionKey) return 'product-info';

  const normalized = sectionKey
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  // Alias old/variant keys to canonical keys
  if (normalized === 'basic-info' || normalized === 'basic-information') {
    return 'product-info';
  }

  return normalized;
}

/**
 * Groups fields by their section property from backend.
 */
export function groupFieldsBySection(
  fields: any[],
  excludeFieldNames: string[] = []
): Record<string, any[]> {
  const fieldsBySection: Record<string, any[]> = {};

  fields.forEach((field: any) => {
    const fieldName = field.name || field.fieldName;

    if (excludeFieldNames.includes(fieldName)) return;

    const rawSection = field.section || 'product-info';
    const section = normalizeSectionKey(rawSection);

    if (!fieldsBySection[section]) {
      fieldsBySection[section] = [];
    }
    fieldsBySection[section].push(field);
  });

  return fieldsBySection;
}

export type BackendUserRole = 'BUSINESS_USER' | 'ADMIN' | 'DEVELOPER';

// ============================================================================
// ROLE MAPPING
// ============================================================================

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
    default:
      return 'BUSINESS_USER';
  }
};

// ============================================================================
// SECTION UTILITIES
// ============================================================================

const SECTION_METADATA: Record<string, SectionMetadata> = {
  'product-info': {
    label: 'Product Information',
    icon: Package,
    iconColor: 'text-blue-600',
    description: 'Essential product details',
    order: 1
  },
  // Domain/category attributes (Material, Gender, Pattern, …) — the product-type-specific fields that feed all
  // channels. A dedicated always-visible section (like Amazon "More Details" / Shopify category attributes),
  // so they are never hidden behind a tier toggle. Ordered right after Product Information for discoverability.
  'product-details': {
    label: 'Additional Details',
    icon: Tag,
    iconColor: 'text-teal-600',
    description: 'Attributes for this product type — shared across all channels',
    order: 1.5
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
  },
  // Backend Step-1 section vocabulary (ecommerce_master_attributes.section) uses these keys —
  // normalizeSectionKey maps e.g. pricing_inventory → pricing-inventory. Kept in sync so the
  // header shows a real label/icon (EN fallback) and the i18n key `section.<nk>.label` resolves (ID).
  'pricing-inventory': {
    label: 'Pricing & Inventory',
    icon: DollarSign,
    iconColor: 'text-green-600',
    description: 'Pricing, costs, and stock levels',
    order: 2
  },
  'publishing': {
    label: 'SEO & Publishing',
    icon: Star,
    iconColor: 'text-yellow-600',
    description: 'Search optimization and publishing metadata',
    order: 6
  },
  'variant-attributes': {
    label: 'Variant Configuration',
    icon: Settings,
    iconColor: 'text-gray-600',
    description: 'Variant axes and per-variant attributes',
    order: 8.5
  },
  'compliance': {
    label: 'Compliance & Legal',
    icon: FileText,
    iconColor: 'text-indigo-600',
    description: 'Regulatory and legal information',
    order: 9
  },
  'general': {
    label: 'General Information',
    icon: Package,
    iconColor: 'text-blue-600',
    description: 'General product details',
    order: 0.5
  }
};

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

// ============================================================================
// VALUE TYPE CONVERSION
// ============================================================================

export const convertValueByType = (value: any, fieldType: string): any => {
  if (value === null || value === undefined || value === '') return undefined;

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

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const sanitizeFieldId = (fieldName: string): string => {
  return fieldName.replace(/[^a-zA-Z0-9_-]/g, '_');
};
