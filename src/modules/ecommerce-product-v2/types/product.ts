/**
 * Master Product Types
 * Based on MasterAttribute.java implementation
 */

export interface MasterProduct {
  id: string;
  sku: string;
  name: string;
  description?: string;
  shortDescription?: string;
  price: number;
  compareAtPrice?: number;
  costPerItem?: number;

  // Basic Information
  brand?: string;
  category?: string;
  tags?: string[];
  barcode?: string;
  hsCode?: string;

  // Inventory
  quantity?: number;
  trackQuantity?: boolean;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'low_stock';
  lowStockThreshold?: number;
  allowBackorders?: boolean;

  // Media
  mainImage?: string;
  galleryImages?: string[];
  videos?: string[];

  // Physical Properties — stored flat (backend + analyzer consume them flat)
  weight?: number;
  weightUnit?: 'kg' | 'lb' | 'g' | 'oz';
  length?: number;
  width?: number;
  height?: number;
  dimensionUnit?: 'cm' | 'in' | 'm' | 'ft';

  // SEO
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  searchTerms?: string[];

  // Shipping
  shippingClass?: string;
  shippingWeight?: number;
  requiresShipping?: boolean;
  freeShipping?: boolean;

  // Variants
  hasVariants?: boolean;
  variantOptions?: VariantOption[];
  variants?: ProductVariant[];

  // Custom Attributes
  customAttributes?: { [key: string]: any };

  // Status
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'public' | 'private' | 'hidden';

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;

  // Channel Information
  channelMappings?: ChannelMapping[];
  publishedChannels?: string[];
}

export interface VariantOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: string;
  sku: string;
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  barcode?: string;
  image?: string;
  weight?: number;
  options: { [optionName: string]: string };
  customAttributes?: { [key: string]: any };
}

export interface ChannelMapping {
  channelId: string;
  channelProductId?: string;
  mappedAt: string;
  lastSyncAt?: string;
  status: 'mapped' | 'published' | 'error';
  confidence: number;
  mappedFields: number;
  totalFields: number;
}

export interface CreateMasterProductRequest {
  sku: string;
  name: string;
  price: number;
  description?: string;
  shortDescription?: string;
  compareAtPrice?: number;
  costPerItem?: number;
  brand?: string;
  category?: string;
  tags?: string[];
  barcode?: string;
  quantity?: number;
  trackQuantity?: boolean;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'low_stock';
  mainImage?: string;
  galleryImages?: string[];
  weight?: number;
  weightUnit?: 'kg' | 'lb' | 'g' | 'oz';
  length?: number;
  width?: number;
  height?: number;
  dimensionUnit?: 'cm' | 'in' | 'm' | 'ft';
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  shippingClass?: string;
  requiresShipping?: boolean;
  customAttributes?: { [key: string]: any };
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'public' | 'private' | 'hidden';
  profitMargin?: number;
  warranty?: string;
  model?: string;
  channel?: string;
  material?: string;
  color?: string;
  hasVariants?: boolean;
  variantOptions?: VariantOption[];
  variants?: ProductVariant[];
}

export interface ProductCreationResponse {
  success: boolean;
  masterProduct?: MasterProduct;
  availableChannels?: string[];
  nextStep?: string;
  errors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  fieldValidations?: FieldValidation[];
}

export interface FieldValidation {
  fieldName: string;
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
