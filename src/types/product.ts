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
  
  // Physical Properties
  weight?: number;
  weightUnit?: 'kg' | 'lb' | 'g' | 'oz';
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in' | 'm' | 'ft';
  };
  
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
  // Required fields
  sku: string;
  name: string;
  price: number;
  
  // Optional fields (all from MasterProduct interface)
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
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in' | 'm' | 'ft';
  };
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  shippingClass?: string;
  requiresShipping?: boolean;
  customAttributes?: { [key: string]: any };
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'public' | 'private' | 'hidden';
  
  // Smart Form fields
  profitMargin?: number;
  warranty?: string;
  model?: string;
  
  // Dynamic form fields
  channel?: string;
  material?: string;
  color?: string;
  
  // Variant fields
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

export interface ProductFilter {
  search?: string;
  category?: string;
  brand?: string;
  status?: 'draft' | 'active' | 'archived';
  stockStatus?: 'in_stock' | 'out_of_stock' | 'low_stock';
  priceMin?: number;
  priceMax?: number;
  createdAfter?: string;
  createdBefore?: string;
  hasImages?: boolean;
  publishedToChannel?: string;
  tags?: string[];
}

export interface ProductSearchResult {
  products: MasterProduct[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets?: SearchFacets;
}

export interface SearchFacets {
  categories: Array<{ name: string; count: number }>;
  brands: Array<{ name: string; count: number }>;
  priceRanges: Array<{ min: number; max: number; count: number }>;
  stockStatuses: Array<{ status: string; count: number }>;
}

export interface ProductAnalytics {
  productId: string;
  views: number;
  clicks: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  averageOrderValue: number;
  channelPerformance: Array<{
    channelId: string;
    views: number;
    clicks: number;
    conversions: number;
    revenue: number;
  }>;
  topSearchTerms: Array<{ term: string; count: number }>;
  performanceTrends: Array<{
    date: string;
    views: number;
    clicks: number;
    conversions: number;
    revenue: number;
  }>;
}

export interface ProductRecommendation {
  type: 'CROSS_SELL' | 'UP_SELL' | 'RELATED' | 'BUNDLE';
  productId: string;
  score: number;
  reason: string;
}

export interface ProductBundle {
  id: string;
  name: string;
  description?: string;
  products: Array<{
    productId: string;
    quantity: number;
    discount?: number;
  }>;
  bundlePrice: number;
  savings: number;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
  reviewerName?: string;
  reviewerEmail?: string;
  verified: boolean;
  helpful: number;
  notHelpful: number;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  createdAt: string;
  updatedAt: string;
}

export interface ProductInsight {
  productId: string;
  completionScore: number;
  missingFields: string[];
  recommendations: Array<{
    type: 'FIELD_COMPLETION' | 'SEO_OPTIMIZATION' | 'PRICING_SUGGESTION' | 'INVENTORY_WARNING';
    priority: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    action?: string;
  }>;
  channelReadiness: Array<{
    channelId: string;
    ready: boolean;
    confidence: number;
    blockers: string[];
  }>;
  seoScore: number;
  qualityScore: number;
}

// Legacy ProductData interface from old ProductCreateForm
export interface ProductData {
  masterAttributes: {
    id: string;
    product_unique_id: string;
    product_id: string;
    product_name: string;
    description: string;
    category: string;
    brand: string;
    sku: string;
    barcode: string;
    status: "draft" | "active" | "inactive";
    tags: string[];
    basePrice: number;
    currency: string;
    costPrice: number;
    comparePrice: number;
    taxable: boolean;
    trackInventory: boolean;
    stockQuantity: number;
    lowStockThreshold: number;
    weight: number;
    dimensions: {
      length: number;
      width: number;
      height: number;
    };
    shippingClass: string;
    seoTitle: string;
    seoDescription: string;
    seoKeywords: string[];
    metaImage: string;
    channels: Array<{
      platform: string;
      storeId: string;
      enabled: boolean;
      customMapping: Record<string, unknown>;
    }>;
    publishedAt: Date | null;
    scheduledPublish: Date | null;
    autoPublish: boolean;
    product_images: Array<{
      src: string;
    }>;
    videos: Array<{
      id: string;
      url: string;
      title: string;
    }>;
  };
  variantGroups: Array<{
    channel_variant_option1_key: string;
    channel_variant_option1_value: string;
    channel_variant_option2_key: string;
    channel_variant_option2_value: string;
  }>;
  optionGroups: Array<{
    channel_option_name: string;
    channel_option_values: Array<{
      channel_option_value: string;
      channel_option_description: string;
    }>;
  }>;
  enhancedVariants?: Array<{
    id: string;
    masterData: {
      sku: string;
      title?: string;
      description?: string;
      price: number;
      inventory: number;
      costPrice?: number;
      comparePrice?: number;
      weight?: number;
      barcode?: string;
      enabled: boolean;
      taxable?: boolean;
      trackInventory?: boolean;
      lowStockThreshold?: number;
      dimensions?: {
        length: number;
        width: number;
        height: number;
      };
      images?: string[];
    };
    attributes: Record<string, string>;
    channelData: Record<string, {
      sku?: string;
      title?: string;
      description?: string;
      price?: number;
      inventory?: number;
      costPrice?: number;
      comparePrice?: number;
      weight?: number;
      barcode?: string;
      enabled?: boolean;
      taxable?: boolean;
      visibility?: boolean;
      tags?: string[];
      images?: string[];
      customFields?: Record<string, unknown>;
      platformSpecific?: Record<string, unknown>;
      seo?: {
        title?: string;
        description?: string;
        keywords?: string[];
        slug?: string;
      };
      inventoryManagement?: {
        trackInventory?: boolean;
        lowStockThreshold?: number;
        allowBackorders?: boolean;
        reservedQuantity?: number;
      };
      lastSynced?: Date;
      syncStatus?: 'pending' | 'synced' | 'error';
      syncErrors?: string[];
    }>;
    globalSettings?: {
      requiresShipping?: boolean;
      hsCode?: string;
      countryOfOrigin?: string;
      notes?: string;
    };
  }>;
}