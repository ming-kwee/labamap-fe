import { ProductData } from "../ProductCreateForm";

// Enhanced channel configuration interfaces
export interface ChannelConfig {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  description: string;
  isConnected: boolean;
  category: 'marketplace' | 'social' | 'direct' | 'advertising';
  requiredFields: ChannelFieldConfig[];
  optionalFields: ChannelFieldConfig[];
  supportedFeatures: ChannelFeature[];
  limitations: ChannelLimitation[];
  stores?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

export interface ChannelFieldConfig {
  fieldName: string;
  displayName: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'textarea' | 'date' | 'url' | 'email';
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  helpText?: string;
  placeholder?: string;
  defaultValue?: any;
  dependsOn?: string;
}

export interface ChannelFeature {
  name: string;
  supported: boolean;
  limitations?: string;
}

export interface ChannelLimitation {
  type: 'field_length' | 'image_count' | 'image_size' | 'description_length' | 'title_length' | 'custom';
  field?: string;
  limit: number | string;
  description: string;
}

// Channel-specific data interfaces that extend the existing ProductData structure
export interface ChannelSpecificData {
  // Title and description overrides
  customTitle?: string;
  customDescription?: string;
  customPrice?: number;
  priceAdjustment?: {
    type: 'percentage' | 'fixed' | 'none';
    value: number;
  };
  
  // Channel-specific fields
  customFields: Record<string, any>;
  
  // Sync status
  lastSynced?: Date;
  syncErrors?: string[];
  pendingSync?: boolean;
}

// Amazon-specific interfaces
export interface AmazonChannelData {
  itemType?: string;
  productIdType?: 'UPC' | 'EAN' | 'GCID' | 'ASIN';
  productId?: string;
  asin?: string;
  condition?: 'New' | 'Used' | 'Collectible' | 'Refurbished';
  conditionNote?: string;
  fulfillmentChannel?: 'MFN' | 'AFN';
  bulletPoints?: string[];
  searchTerms?: string[];
  browseNode?: string;
  targetAudience?: string;
  giftWrapAvailable?: boolean;
  giftMessageAvailable?: boolean;
  maxOrderQuantity?: number;
  packageDimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
  };
}

// Shopify-specific interfaces
export interface ShopifyChannelData {
  handle?: string;
  vendor?: string;
  productType?: string;
  templateSuffix?: string;
  compareAtPrice?: number;
  requiresShipping?: boolean;
  trackQuantity?: boolean;
  taxable?: boolean;
  taxCode?: string;
  inventoryPolicy?: 'deny' | 'continue';
  inventoryManagement?: string;
  publishedScope?: 'web' | 'global';
  collectionsToAdd?: string[];
  seoTitle?: string;
  seoDescription?: string;
}

// Interface for channel-specific form props
export interface ChannelFormProps {
  data: ProductData;
  channelId: string;
  channelData: ChannelSpecificData;
  onUpdate: (channelId: string, updates: Partial<ChannelSpecificData>) => void;
  onSync?: (channelId: string) => Promise<void>;
  isReadOnly?: boolean;
}