"use client";
import React from "react";
import { ProductData } from "./ProductCreateForm";

interface ProductSidebarProps {
  productData: ProductData;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function ProductSidebar({ productData }: ProductSidebarProps) {
  const completionPercentage = calculateCompletionPercentage(productData);
  
  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-screen sticky top-16 overflow-y-auto">
      <div className="p-6">
        {/* Product Preview Card */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              {productData.masterAttributes.product_images.length > 0 ? (
                <img 
                  src={productData.masterAttributes.product_images[0].src} 
                  alt={productData.masterAttributes.product_name || "Product"} 
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <span className="text-2xl">📦</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-white">
                {productData.masterAttributes.product_name || "Untitled Product"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {productData.masterAttributes.sku || "No SKU"}
              </p>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className="flex items-center justify-between mb-3">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              productData.masterAttributes.status === "active" 
                ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                : productData.masterAttributes.status === "inactive"
                ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
            }`}>
              {productData.masterAttributes.status.charAt(0).toUpperCase() + productData.masterAttributes.status.slice(1)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {productData.masterAttributes.basePrice > 0 ? `$${productData.masterAttributes.basePrice}` : "No price"}
            </span>
          </div>

          {/* Completion Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Completion</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {completionPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2 mb-6">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Quick Actions</h4>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            📋 Duplicate Product
          </button>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            📤 Export Data
          </button>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            🔄 Sync Channels
          </button>
          <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            📊 View Analytics
          </button>
        </div>

        {/* Channel Status */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Channel Status</h4>
          <div className="space-y-2">
            {productData.masterAttributes.channels.length > 0 ? (
              productData.masterAttributes.channels.map((channel, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{channel.platform}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    channel.enabled 
                      ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                  }`}>
                    {channel.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No channels configured</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function calculateCompletionPercentage(data: ProductData): number {
  const fields = [
    !!data.masterAttributes.product_name,
    !!data.masterAttributes.description,
    !!data.masterAttributes.category,
    !!data.masterAttributes.sku,
    data.masterAttributes.basePrice > 0,
    data.masterAttributes.product_images.length > 0,
    !!data.masterAttributes.seoTitle,
    !!data.masterAttributes.seoDescription,
    data.masterAttributes.channels.length > 0,
  ];
  
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}