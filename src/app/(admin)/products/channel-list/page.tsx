"use client";
import { ProductData } from "@/types/product";

// Mock master products data for demonstration
const mockMasterProducts: ProductData[] = [
  {
    masterAttributes: {
      id: "master-1",
      product_unique_id: "PROD-001",
      product_id: "product-1",
      product_name: "Premium Wireless Headphones",
      description: "High-quality wireless headphones with noise cancellation and premium audio experience.",
      category: "Electronics",
      brand: "AudioTech",
      sku: "AT-WH-001",
      barcode: "1234567890123",
      status: "active",
      tags: ["wireless", "headphones", "premium", "noise-cancellation"],
      basePrice: 299.99,
      currency: "USD",
      costPrice: 150.00,
      comparePrice: 399.99,
      taxable: true,
      trackInventory: true,
      stockQuantity: 150,
      lowStockThreshold: 10,
      weight: 0.8,
      dimensions: {
        length: 20,
        width: 18,
        height: 8,
      },
      shippingClass: "standard",
      seoTitle: "Premium Wireless Headphones - AudioTech",
      seoDescription: "Experience premium audio with our wireless headphones featuring noise cancellation",
      seoKeywords: ["wireless headphones", "noise cancellation", "premium audio"],
      metaImage: "/images/products/headphones.jpg",
      channels: [
        { platform: "shopify", storeId: "main-store", enabled: true, customMapping: {} },
        { platform: "amazon", storeId: "amazon-us", enabled: true, customMapping: {} },
        { platform: "shopee", storeId: "shopee-sg", enabled: true, customMapping: {} },
      ],
      publishedAt: new Date("2024-01-15"),
      scheduledPublish: null,
      autoPublish: true,
      product_images: [
        { src: "/images/products/headphones-1.jpg" },
        { src: "/images/products/headphones-2.jpg" },
      ],
      videos: [
        { id: "vid-1", url: "/videos/headphones-demo.mp4", title: "Product Demo" },
      ],
    },
    variantGroups: [
      {
        channel_variant_option1_key: "color",
        channel_variant_option1_value: "black",
        channel_variant_option2_key: "size",
        channel_variant_option2_value: "standard",
      },
    ],
    optionGroups: [
      {
        channel_option_name: "Color",
        channel_option_values: [
          { channel_option_value: "black", channel_option_description: "Matte Black" },
          { channel_option_value: "white", channel_option_description: "Pearl White" },
        ],
      },
    ],
  },
  {
    masterAttributes: {
      id: "master-2",
      product_unique_id: "PROD-002",
      product_id: "product-2",
      product_name: "Smart Fitness Tracker",
      description: "Advanced fitness tracker with heart rate monitoring, GPS, and smartphone integration.",
      category: "Wearables",
      brand: "FitTech",
      sku: "FT-ST-002",
      barcode: "2345678901234",
      status: "active",
      tags: ["fitness", "tracker", "smart", "health"],
      basePrice: 199.99,
      currency: "USD",
      costPrice: 80.00,
      comparePrice: 249.99,
      taxable: true,
      trackInventory: true,
      stockQuantity: 200,
      lowStockThreshold: 15,
      weight: 0.1,
      dimensions: {
        length: 5,
        width: 3,
        height: 1,
      },
      shippingClass: "standard",
      seoTitle: "Smart Fitness Tracker - FitTech",
      seoDescription: "Track your fitness goals with our advanced smart fitness tracker",
      seoKeywords: ["fitness tracker", "health monitor", "smart watch"],
      metaImage: "/images/products/fitness-tracker.jpg",
      channels: [
        { platform: "shopify", storeId: "main-store", enabled: true, customMapping: {} },
        { platform: "amazon", storeId: "amazon-us", enabled: true, customMapping: {} },
        { platform: "lazada", storeId: "lazada-my", enabled: true, customMapping: {} },
      ],
      publishedAt: new Date("2024-02-01"),
      scheduledPublish: null,
      autoPublish: true,
      product_images: [
        { src: "/images/products/fitness-tracker-1.jpg" },
      ],
      videos: [],
    },
    variantGroups: [
      {
        channel_variant_option1_key: "color",
        channel_variant_option1_value: "blue",
        channel_variant_option2_key: "band",
        channel_variant_option2_value: "silicone",
      },
    ],
    optionGroups: [
      {
        channel_option_name: "Color",
        channel_option_values: [
          { channel_option_value: "blue", channel_option_description: "Ocean Blue" },
          { channel_option_value: "red", channel_option_description: "Sport Red" },
        ],
      },
    ],
  },
  {
    masterAttributes: {
      id: "master-3",
      product_unique_id: "PROD-003",
      product_id: "product-3",
      product_name: "Organic Coffee Beans",
      description: "Premium organic coffee beans sourced from sustainable farms worldwide.",
      category: "Food & Beverage",
      brand: "CoffeeCraft",
      sku: "CC-OCB-003",
      barcode: "3456789012345",
      status: "active",
      tags: ["organic", "coffee", "premium", "sustainable"],
      basePrice: 24.99,
      currency: "USD",
      costPrice: 12.00,
      comparePrice: 34.99,
      taxable: true,
      trackInventory: true,
      stockQuantity: 500,
      lowStockThreshold: 50,
      weight: 1.0,
      dimensions: {
        length: 15,
        width: 8,
        height: 5,
      },
      shippingClass: "standard",
      seoTitle: "Organic Coffee Beans - CoffeeCraft",
      seoDescription: "Premium organic coffee beans for the perfect cup",
      seoKeywords: ["organic coffee", "premium beans", "sustainable coffee"],
      metaImage: "/images/products/coffee-beans.jpg",
      channels: [
        { platform: "shopify", storeId: "main-store", enabled: true, customMapping: {} },
        { platform: "tokopedia", storeId: "tokopedia-id", enabled: true, customMapping: {} },
        { platform: "facebook", storeId: "facebook-shop", enabled: true, customMapping: {} },
      ],
      publishedAt: new Date("2024-03-01"),
      scheduledPublish: null,
      autoPublish: true,
      product_images: [
        { src: "/images/products/coffee-beans-1.jpg" },
        { src: "/images/products/coffee-beans-2.jpg" },
      ],
      videos: [],
    },
    variantGroups: [
      {
        channel_variant_option1_key: "roast",
        channel_variant_option1_value: "medium",
        channel_variant_option2_key: "size",
        channel_variant_option2_value: "1lb",
      },
    ],
    optionGroups: [
      {
        channel_option_name: "Roast Level",
        channel_option_values: [
          { channel_option_value: "light", channel_option_description: "Light Roast" },
          { channel_option_value: "medium", channel_option_description: "Medium Roast" },
          { channel_option_value: "dark", channel_option_description: "Dark Roast" },
        ],
      },
    ],
  },
];

export default function ChannelProductListPage() {
  // Note: These handlers were previously used by ChannelProductList component
  // Keeping them commented for reference
  // const handleProductUpdate = async (productId: string, updates: Record<string, unknown>) => {
  //   console.log("Updating product:", productId, updates);
  // };

  // const handleBulkSync = async (productIds: string[]) => {
  //   console.log("Bulk syncing products:", productIds);
  //   await new Promise(resolve => setTimeout(resolve, 1000));
  //   console.log("Bulk sync completed");
  // };

  // const handleBulkUpdate = async (productIds: string[], updates: Record<string, unknown>) => {
  //   console.log("Bulk updating products:", productIds, updates);
  // };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-xl font-bold text-gray-900 dark:text-white">
              Channel Product Management
            </h1>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-2">
              Ginee-inspired omnichannel product management with advanced grid editing capabilities. 
              Manage products across multiple sales channels, perform bulk operations, and sync data efficiently.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-title-md font-semibold text-gray-900 dark:text-white">
                {mockMasterProducts.length} Master Products
              </div>
              <div className="text-theme-sm text-gray-500 dark:text-gray-400">
                Available for channel distribution
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Product List Component - Temporarily Disabled */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Channel Product List
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            ChannelProductList component has been removed during cleanup.
            This page shows {mockMasterProducts.length} mock products.
          </p>
          <a 
            href="/products/v2/create"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create New Product
          </a>
        </div>
      </div>

      {/* Implementation Notes */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-title-md font-semibold text-gray-900 dark:text-white mb-4">
          🔧 Ginee-Inspired Features Implemented
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Grid Editing Features:</h4>
            <ul className="text-theme-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Inline cell editing for prices, SKU, and product details</li>
              <li>• Click-to-edit interface with auto-save</li>
              <li>• Boolean toggles for status and tracking</li>
              <li>• Real-time validation and formatting</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Bulk Operations:</h4>
            <ul className="text-theme-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Multi-select with checkboxes</li>
              <li>• Bulk price adjustments (+10%, -10%)</li>
              <li>• Bulk synchronization across channels</li>
              <li>• Batch status updates</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Channel Management:</h4>
            <ul className="text-theme-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Multi-channel product distribution</li>
              <li>• Channel-specific pricing and inventory</li>
              <li>• Sync status tracking and error handling</li>
              <li>• Platform-specific customizations</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Enterprise Features:</h4>
            <ul className="text-theme-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>• Advanced filtering and search</li>
              <li>• Sortable columns with indicators</li>
              <li>• Export capabilities</li>
              <li>• Performance metrics dashboard</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}