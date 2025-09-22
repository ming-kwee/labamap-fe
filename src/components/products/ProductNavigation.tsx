"use client";
import React from "react";

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const navigationItems: NavigationItem[] = [
  { id: "basics", label: "Product Basics", icon: "📦", description: "Basic product information" },
  { id: "pricing", label: "Pricing & Inventory", icon: "💰", description: "Pricing and stock management" },
  { id: "media", label: "Images & Media", icon: "🖼️", description: "Product images and videos" },
  { id: "variants", label: "Product Variants", icon: "🔄", description: "Size, color, and other variants" },
  { id: "shipping", label: "Shipping & Details", icon: "🚚", description: "Shipping and physical details" },
  { id: "seo", label: "SEO & Marketing", icon: "📈", description: "Search optimization and marketing" },
  { id: "channels", label: "Channel Sync", icon: "🔗", description: "Multi-channel distribution" },
  { id: "publishing", label: "Publish Settings", icon: "🚀", description: "Publishing and scheduling" },
  { id: "analytics", label: "Analytics", icon: "📊", description: "Product performance insights" },
  { id: "reviews", label: "Reviews", icon: "⭐", description: "Customer reviews and ratings" },
  { id: "bundles", label: "Bundles & Upsells", icon: "📋", description: "Product bundles and recommendations" },
];

interface ProductNavigationProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function ProductNavigation({ activeSection, onSectionChange }: ProductNavigationProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`p-4 text-left border-r border-b border-gray-200 dark:border-gray-700 last:border-r-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
              activeSection === item.id
                ? "bg-brand-50 dark:bg-brand-900/20 border-brand-500 text-brand-700 dark:text-brand-400"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-title-md">{item.icon}</span>
              <span className="font-medium text-sm">{item.label}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}