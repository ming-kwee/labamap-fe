import { ChannelConfig } from './ChannelTypes';

export const ENHANCED_CHANNEL_CONFIGS: Record<string, ChannelConfig> = {
  shopify: {
    id: 'shopify',
    name: 'shopify',
    displayName: 'Shopify',
    icon: '🛍️',
    description: 'Sync with your Shopify stores with advanced product configuration',
    isConnected: true,
    category: 'direct',
    stores: [
      { id: "store-1", name: "Main Store", url: "mystore.myshopify.com" },
      { id: "store-2", name: "EU Store", url: "eu-store.myshopify.com" }
    ],
    requiredFields: [
      {
        fieldName: 'handle',
        displayName: 'URL Handle',
        type: 'text',
        required: true,
        helpText: 'URL-friendly product handle (auto-generated if empty)',
        validation: { pattern: '^[a-z0-9-]+$' }
      },
      {
        fieldName: 'vendor',
        displayName: 'Vendor',
        type: 'text',
        required: true,
        helpText: 'Manufacturer or brand name'
      },
      {
        fieldName: 'productType',
        displayName: 'Product Type',
        type: 'text',
        required: true,
        helpText: 'Category or type of product'
      }
    ],
    optionalFields: [
      {
        fieldName: 'templateSuffix',
        displayName: 'Template Suffix',
        type: 'text',
        required: false,
        helpText: 'Custom template for product page'
      },
      {
        fieldName: 'compareAtPrice',
        displayName: 'Compare at Price',
        type: 'number',
        required: false,
        helpText: 'Original price to show discount'
      },
      {
        fieldName: 'seoTitle',
        displayName: 'SEO Title',
        type: 'text',
        required: false,
        helpText: 'Title for search engines',
        validation: { maxLength: 70 }
      },
      {
        fieldName: 'seoDescription',
        displayName: 'SEO Description',
        type: 'textarea',
        required: false,
        helpText: 'Meta description for search engines',
        validation: { maxLength: 160 }
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Price Sync', supported: true },
      { name: 'Image Sync', supported: true, limitations: 'Max 250 images' },
      { name: 'Variant Support', supported: true, limitations: 'Max 100 variants per product' },
      { name: 'Collections', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 250, description: 'Maximum 250 images per product' },
      { type: 'custom', limit: '100 variants', description: 'Maximum 100 variants per product' }
    ]
  },

  amazon: {
    id: 'amazon',
    name: 'amazon',
    displayName: 'Amazon',
    icon: '📦',
    description: 'Sell on Amazon marketplace with detailed product listings',
    isConnected: true,
    category: 'marketplace',
    stores: [
      { id: "amazon-us", name: "Amazon US", url: "amazon.com" },
      { id: "amazon-uk", name: "Amazon UK", url: "amazon.co.uk" }
    ],
    requiredFields: [
      {
        fieldName: 'itemType',
        displayName: 'Item Type',
        type: 'select',
        required: true,
        options: [
          { value: 'Books', label: 'Books' },
          { value: 'Electronics', label: 'Electronics' },
          { value: 'Clothing', label: 'Clothing' },
          { value: 'Home', label: 'Home & Garden' },
          { value: 'Sports', label: 'Sports & Outdoors' }
        ],
        helpText: 'Select the Amazon item type category'
      },
      {
        fieldName: 'productIdType',
        displayName: 'Product ID Type',
        type: 'select',
        required: true,
        options: [
          { value: 'UPC', label: 'UPC' },
          { value: 'EAN', label: 'EAN' },
          { value: 'GCID', label: 'GCID' },
          { value: 'ASIN', label: 'ASIN' }
        ],
        helpText: 'Type of product identifier'
      },
      {
        fieldName: 'productId',
        displayName: 'Product ID',
        type: 'text',
        required: true,
        helpText: 'The actual product identifier value',
        validation: { minLength: 8, maxLength: 14 }
      },
      {
        fieldName: 'condition',
        displayName: 'Condition',
        type: 'select',
        required: true,
        options: [
          { value: 'New', label: 'New' },
          { value: 'Used', label: 'Used' },
          { value: 'Collectible', label: 'Collectible' },
          { value: 'Refurbished', label: 'Refurbished' }
        ]
      },
      {
        fieldName: 'fulfillmentChannel',
        displayName: 'Fulfillment',
        type: 'select',
        required: true,
        options: [
          { value: 'MFN', label: 'Merchant Fulfilled (MFN)' },
          { value: 'AFN', label: 'Amazon Fulfilled (FBA)' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'bulletPoints',
        displayName: 'Bullet Points',
        type: 'textarea',
        required: false,
        helpText: 'Key features (one per line, max 5)',
        validation: { maxLength: 500 }
      },
      {
        fieldName: 'searchTerms',
        displayName: 'Search Terms',
        type: 'text',
        required: false,
        helpText: 'Keywords for Amazon search (comma separated)',
        validation: { maxLength: 250 }
      },
      {
        fieldName: 'browseNode',
        displayName: 'Browse Node',
        type: 'text',
        required: false,
        helpText: 'Amazon category browse node ID'
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Price Sync', supported: true },
      { name: 'Image Sync', supported: true, limitations: 'Max 9 images' },
      { name: 'Variant Support', supported: true },
      { name: 'Bulk Upload', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 9, description: 'Maximum 9 images per product' },
      { type: 'title_length', limit: 200, description: 'Title cannot exceed 200 characters' },
      { type: 'description_length', limit: 2000, description: 'Description cannot exceed 2000 characters' }
    ]
  },

  ebay: {
    id: 'ebay',
    name: 'ebay',
    displayName: 'eBay',
    icon: '🏪',
    description: 'List products on eBay marketplace with auction support',
    isConnected: false,
    category: 'marketplace',
    requiredFields: [
      {
        fieldName: 'listingType',
        displayName: 'Listing Type',
        type: 'select',
        required: true,
        options: [
          { value: 'FixedPriceItem', label: 'Fixed Price' },
          { value: 'Auction', label: 'Auction' },
          { value: 'StoreFixedPrice', label: 'Store Fixed Price' }
        ]
      },
      {
        fieldName: 'categoryId',
        displayName: 'eBay Category',
        type: 'text',
        required: true,
        helpText: 'eBay category ID for the product'
      },
      {
        fieldName: 'conditionId',
        displayName: 'Condition',
        type: 'select',
        required: true,
        options: [
          { value: '1000', label: 'New' },
          { value: '1500', label: 'New Other' },
          { value: '2000', label: 'Manufacturer Refurbished' },
          { value: '3000', label: 'Used' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'duration',
        displayName: 'Listing Duration',
        type: 'select',
        required: false,
        options: [
          { value: 'Days_3', label: '3 Days' },
          { value: 'Days_7', label: '7 Days' },
          { value: 'Days_30', label: '30 Days' }
        ]
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Price Sync', supported: true },
      { name: 'Image Sync', supported: true, limitations: 'Max 12 images' },
      { name: 'Best Offers', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 12, description: 'Maximum 12 images per listing' },
      { type: 'title_length', limit: 80, description: 'Title cannot exceed 80 characters' }
    ]
  },

  facebook: {
    id: 'facebook',
    name: 'facebook',
    displayName: 'Facebook Shop',
    icon: '📘',
    description: 'Sell on Facebook and Instagram with social commerce features',
    isConnected: true,
    category: 'social',
    stores: [
      { id: "fb-main", name: "Main Business Page", url: "facebook.com/mybusiness" }
    ],
    requiredFields: [
      {
        fieldName: 'availability',
        displayName: 'Availability',
        type: 'select',
        required: true,
        options: [
          { value: 'in stock', label: 'In Stock' },
          { value: 'out of stock', label: 'Out of Stock' },
          { value: 'preorder', label: 'Pre-order' }
        ]
      },
      {
        fieldName: 'condition',
        displayName: 'Condition',
        type: 'select',
        required: true,
        options: [
          { value: 'new', label: 'New' },
          { value: 'refurbished', label: 'Refurbished' },
          { value: 'used', label: 'Used' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'ageGroup',
        displayName: 'Age Group',
        type: 'select',
        required: false,
        options: [
          { value: 'adult', label: 'Adult' },
          { value: 'teen', label: 'Teen' },
          { value: 'kids', label: 'Kids' }
        ]
      },
      {
        fieldName: 'gender',
        displayName: 'Gender',
        type: 'select',
        required: false,
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'unisex', label: 'Unisex' }
        ]
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Price Sync', supported: true },
      { name: 'Image Sync', supported: true, limitations: 'Max 20 images' },
      { name: 'Instagram Integration', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 20, description: 'Maximum 20 images per product' },
      { type: 'title_length', limit: 150, description: 'Title cannot exceed 150 characters' }
    ]
  },

  google: {
    id: 'google',
    name: 'google',
    displayName: 'Google Shopping',
    icon: '🔍',
    description: 'Display products in Google Shopping results and ads',
    isConnected: false,
    category: 'advertising',
    requiredFields: [
      {
        fieldName: 'targetCountry',
        displayName: 'Target Country',
        type: 'select',
        required: true,
        options: [
          { value: 'US', label: 'United States' },
          { value: 'CA', label: 'Canada' },
          { value: 'GB', label: 'United Kingdom' }
        ]
      },
      {
        fieldName: 'condition',
        displayName: 'Condition',
        type: 'select',
        required: true,
        options: [
          { value: 'new', label: 'New' },
          { value: 'refurbished', label: 'Refurbished' },
          { value: 'used', label: 'Used' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'gtin',
        displayName: 'GTIN',
        type: 'text',
        required: false,
        helpText: 'Global Trade Item Number (UPC, EAN, etc.)'
      },
      {
        fieldName: 'mpn',
        displayName: 'MPN',
        type: 'text',
        required: false,
        helpText: 'Manufacturer Part Number'
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Price Sync', supported: true },
      { name: 'Performance Tracking', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 10, description: 'Maximum 10 images per product' }
    ]
  },

  etsy: {
    id: 'etsy',
    name: 'etsy',
    displayName: 'Etsy',
    icon: '🎨',
    description: 'Sell handmade and vintage items with artisan focus',
    isConnected: false,
    category: 'marketplace',
    requiredFields: [
      {
        fieldName: 'whoMade',
        displayName: 'Who Made',
        type: 'select',
        required: true,
        options: [
          { value: 'i_did', label: 'I did' },
          { value: 'collective', label: 'A member of my shop' },
          { value: 'someone_else', label: 'Another company or person' }
        ]
      },
      {
        fieldName: 'whenMade',
        displayName: 'When Made',
        type: 'select',
        required: true,
        options: [
          { value: 'made_to_order', label: 'Made to order' },
          { value: '2020_2024', label: '2020-2024' },
          { value: 'before_1700', label: 'Before 1700' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'materials',
        displayName: 'Materials',
        type: 'text',
        required: false,
        helpText: 'Materials used (comma separated)'
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Personalization', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 10, description: 'Maximum 10 images per listing' },
      { type: 'custom', limit: '13 tags', description: 'Maximum 13 tags per listing' }
    ]
  },

  shopee: {
    id: 'shopee',
    name: 'shopee',
    displayName: 'Shopee',
    icon: '🛒',
    description: 'Leading e-commerce platform in Southeast Asia with millions of active users',
    isConnected: true,
    category: 'marketplace',
    stores: [
      { id: "shopee-sg", name: "Shopee Singapore", url: "shopee.sg" },
      { id: "shopee-my", name: "Shopee Malaysia", url: "shopee.com.my" },
      { id: "shopee-th", name: "Shopee Thailand", url: "shopee.co.th" },
      { id: "shopee-id", name: "Shopee Indonesia", url: "shopee.co.id" },
      { id: "shopee-ph", name: "Shopee Philippines", url: "shopee.ph" },
      { id: "shopee-vn", name: "Shopee Vietnam", url: "shopee.vn" }
    ],
    requiredFields: [
      {
        fieldName: 'brand',
        displayName: 'Brand',
        type: 'text',
        required: true,
        helpText: 'Official brand name or "No Brand" if generic'
      },
      {
        fieldName: 'category',
        displayName: 'Category',
        type: 'select',
        required: true,
        helpText: 'Primary category classification',
        options: [
          { value: 'fashion', label: 'Fashion & Accessories' },
          { value: 'electronics', label: 'Electronics' },
          { value: 'home', label: 'Home & Living' },
          { value: 'beauty', label: 'Health & Beauty' },
          { value: 'sports', label: 'Sports & Outdoors' }
        ]
      },
      {
        fieldName: 'condition',
        displayName: 'Condition',
        type: 'select',
        required: true,
        options: [
          { value: 'new', label: 'New' },
          { value: 'used', label: 'Used' },
          { value: 'refurbished', label: 'Refurbished' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'model',
        displayName: 'Model',
        type: 'text',
        required: false,
        helpText: 'Product model number or variant'
      },
      {
        fieldName: 'warranty',
        displayName: 'Warranty',
        type: 'text',
        required: false,
        helpText: 'Warranty period and terms'
      },
      {
        fieldName: 'preOrder',
        displayName: 'Pre-order Days',
        type: 'number',
        required: false,
        helpText: 'Days required for pre-order items'
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Multi-Region', supported: true },
      { name: 'Flash Sales', supported: true },
      { name: 'Vouchers & Discounts', supported: true },
      { name: 'Live Streaming', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 9, description: 'Maximum 9 images per listing' },
      { type: 'video_count', limit: 1, description: 'Maximum 1 video per listing' },
      { type: 'variation_count', limit: 2, description: 'Maximum 2 variation types' },
      { type: 'variation_options', limit: 20, description: 'Maximum 20 options per variation' }
    ]
  },

  wix: {
    id: 'wix',
    name: 'wix',
    displayName: 'Wix',
    icon: '🎨',
    description: 'Website builder platform with integrated e-commerce capabilities',
    isConnected: true,
    category: 'direct',
    stores: [
      { id: "wix-main", name: "Main Store", url: "mystore.wixsite.com" },
      { id: "wix-custom", name: "Custom Domain", url: "mystore.com" }
    ],
    requiredFields: [
      {
        fieldName: 'productType',
        displayName: 'Product Type',
        type: 'select',
        required: true,
        helpText: 'Type of product being sold',
        options: [
          { value: 'physical', label: 'Physical Product' },
          { value: 'digital', label: 'Digital Product' },
          { value: 'service', label: 'Service' },
          { value: 'subscription', label: 'Subscription' }
        ]
      },
      {
        fieldName: 'trackQuantity',
        displayName: 'Track Quantity',
        type: 'boolean',
        required: true,
        helpText: 'Enable inventory tracking for this product'
      }
    ],
    optionalFields: [
      {
        fieldName: 'ribbon',
        displayName: 'Product Ribbon',
        type: 'text',
        required: false,
        helpText: 'Special badge or label (e.g., "New", "Sale")'
      },
      {
        fieldName: 'customTextFields',
        displayName: 'Custom Text Fields',
        type: 'text',
        required: false,
        helpText: 'Additional customer input fields'
      },
      {
        fieldName: 'productOptions',
        displayName: 'Product Options',
        type: 'text',
        required: false,
        helpText: 'Additional product choices (color, size, etc.)'
      },
      {
        fieldName: 'seoTitle',
        displayName: 'SEO Title',
        type: 'text',
        required: false,
        helpText: 'Custom title for search engines'
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'SEO Optimization', supported: true },
      { name: 'Custom Fields', supported: true },
      { name: 'Digital Downloads', supported: true },
      { name: 'Subscription Products', supported: true },
      { name: 'Multi-language', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 15, description: 'Maximum 15 images per product' },
      { type: 'variant_count', limit: 300, description: 'Maximum 300 variants per product' },
      { type: 'custom', limit: 'Unlimited', description: 'No limit on product options' }
    ]
  },

  blibli: {
    id: 'blibli',
    name: 'blibli',
    displayName: 'Blibli',
    icon: '🇮🇩',
    description: 'Indonesian e-commerce marketplace with focus on electronics and lifestyle products',
    isConnected: true,
    category: 'marketplace',
    stores: [
      { id: "blibli-main", name: "Blibli Indonesia", url: "blibli.com" }
    ],
    requiredFields: [
      {
        fieldName: 'brand',
        displayName: 'Brand',
        type: 'text',
        required: true,
        helpText: 'Official brand name of the product'
      },
      {
        fieldName: 'categoryBlibli',
        displayName: 'Blibli Category',
        type: 'select',
        required: true,
        helpText: 'Product category as per Blibli classification',
        options: [
          { value: 'electronics', label: 'Electronics' },
          { value: 'fashion_pria', label: 'Fashion Pria' },
          { value: 'fashion_wanita', label: 'Fashion Wanita' },
          { value: 'ibu_bayi', label: 'Ibu & Bayi' },
          { value: 'rumah_tangga', label: 'Rumah Tangga' },
          { value: 'kesehatan', label: 'Kesehatan & Kecantikan' },
          { value: 'olahraga', label: 'Olahraga & Outdoor' },
          { value: 'otomotif', label: 'Otomotif' }
        ]
      },
      {
        fieldName: 'condition',
        displayName: 'Condition',
        type: 'select',
        required: true,
        options: [
          { value: 'new', label: 'Baru' },
          { value: 'used', label: 'Bekas' },
          { value: 'refurbished', label: 'Refurbished' }
        ]
      }
    ],
    optionalFields: [
      {
        fieldName: 'model',
        displayName: 'Model',
        type: 'text',
        required: false,
        helpText: 'Product model or variant specification'
      },
      {
        fieldName: 'warrantyPeriod',
        displayName: 'Warranty Period',
        type: 'select',
        required: false,
        options: [
          { value: 'no_warranty', label: 'Tanpa Garansi' },
          { value: '3_months', label: '3 Bulan' },
          { value: '6_months', label: '6 Bulan' },
          { value: '1_year', label: '1 Tahun' },
          { value: '2_years', label: '2 Tahun' }
        ]
      },
      {
        fieldName: 'preOrderDays',
        displayName: 'Pre-order Days',
        type: 'number',
        required: false,
        helpText: 'Number of days for pre-order processing'
      },
      {
        fieldName: 'dangerousGoods',
        displayName: 'Dangerous Goods',
        type: 'boolean',
        required: false,
        helpText: 'Mark if product contains hazardous materials'
      }
    ],
    supportedFeatures: [
      { name: 'Inventory Sync', supported: true },
      { name: 'Flash Sale', supported: true },
      { name: 'Voucher Integration', supported: true },
      { name: 'COD Support', supported: true },
      { name: 'Installment Payment', supported: true },
      { name: 'Bulk Upload', supported: true }
    ],
    limitations: [
      { type: 'image_count', limit: 8, description: 'Maximum 8 images per product' },
      { type: 'title_length', limit: 150, description: 'Maximum 150 characters for title' },
      { type: 'description_length', limit: 2000, description: 'Maximum 2000 characters for description' },
      { type: 'variation_count', limit: 2, description: 'Maximum 2 variation types' }
    ]
  }
};

export const getEnhancedChannelConfig = (channelId: string): ChannelConfig | undefined => {
  return ENHANCED_CHANNEL_CONFIGS[channelId];
};

export const getConnectedChannels = (): ChannelConfig[] => {
  return Object.values(ENHANCED_CHANNEL_CONFIGS).filter(config => config.isConnected);
};

export const getChannelsByCategory = (category: string): ChannelConfig[] => {
  return Object.values(ENHANCED_CHANNEL_CONFIGS).filter(config => config.category === category);
};