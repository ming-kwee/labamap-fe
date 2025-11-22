"use client";
import React from "react";
import Button from "@/components/ui/button/Button";
import { ChannelTemplate } from "./ChannelTemplateManager";

interface TemplatePreviewProps {
  template: ChannelTemplate;
  onEdit: () => void;
  onClose: () => void;
}

const templateTypeIcons: Record<string, string> = {
  'field-mapping': '🎯',
  'content-generation': '🎨',
  'category-mapping': '📁',
  'pricing-strategy': '💰',
  'validation-rules': '✅',
  'complete-channel': '🚀'
};

const templateTypeNames: Record<string, string> = {
  'field-mapping': 'Field Mapping Template',
  'content-generation': 'Content Generation Template',
  'category-mapping': 'Category Mapping Template',
  'pricing-strategy': 'Pricing Strategy Template',
  'validation-rules': 'Validation Rules Template',
  'complete-channel': 'Complete Channel Template'
};

const availableChannels = [
  { id: 'amazon', name: 'Amazon', icon: '📦' },
  { id: 'ebay', name: 'eBay', icon: '🔨' },
  { id: 'walmart', name: 'Walmart', icon: '🛒' },
  { id: 'shopify', name: 'Shopify', icon: '🛍️' },
  { id: 'facebook', name: 'Facebook', icon: '📘' },
  { id: 'shopee', name: 'Shopee', icon: '🛒' },
  { id: 'lazada', name: 'Lazada', icon: '🏪' },
  { id: 'tokopedia', name: 'Tokopedia', icon: '🛵' }
];

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  onEdit,
  onClose
}) => {
  return (
    <div className="space-y-6">
      {/* Template Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900/30 rounded-xl flex items-center justify-center">
              <span className="text-3xl">{templateTypeIcons[template.type]}</span>
            </div>
            <div>
              <h1 className="text-title-lg font-bold text-gray-900 dark:text-white">
                {template.name}
              </h1>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
                {templateTypeNames[template.type]}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-theme-xs ${
                  template.isActive 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    template.isActive ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  {template.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Used {template.usageCount} times
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onEdit}>
              Edit Template
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {template.description && (
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <p className="text-theme-sm text-gray-700 dark:text-gray-300">
              {template.description}
            </p>
          </div>
        )}
      </div>

      {/* Template Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
            Basic Information
          </h3>
          <div className="space-y-4">
            <div>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Category
              </span>
              <div className="text-theme-sm font-medium text-gray-900 dark:text-white mt-1">
                {template.category}
              </div>
            </div>
            <div>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Created
              </span>
              <div className="text-theme-sm font-medium text-gray-900 dark:text-white mt-1">
                {template.createdAt.toLocaleDateString()}
              </div>
            </div>
            <div>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Last Updated
              </span>
              <div className="text-theme-sm font-medium text-gray-900 dark:text-white mt-1">
                {template.updatedAt.toLocaleDateString()}
              </div>
            </div>
            <div>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Usage Count
              </span>
              <div className="text-theme-sm font-medium text-gray-900 dark:text-white mt-1">
                {template.usageCount} products
              </div>
            </div>
          </div>
        </div>

        {/* Target Channels */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
            Target Channels ({template.targetChannels.length})
          </h3>
          <div className="space-y-3">
            {template.targetChannels.map((channelId) => {
              const channel = availableChannels.find(c => c.id === channelId);
              return (
                <div key={channelId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <span className="text-lg">{channel?.icon}</span>
                  <div>
                    <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                      {channel?.name}
                    </div>
                    <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                      Platform integration active
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Template Statistics */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
            Performance Metrics
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-theme-sm text-gray-600 dark:text-gray-400">Success Rate</span>
              <span className="text-theme-sm font-medium text-green-600">98.5%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-theme-sm text-gray-600 dark:text-gray-400">Avg. Processing Time</span>
              <span className="text-theme-sm font-medium text-gray-900 dark:text-white">2.3s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-theme-sm text-gray-600 dark:text-gray-400">Error Rate</span>
              <span className="text-theme-sm font-medium text-red-600">1.5%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-theme-sm text-gray-600 dark:text-gray-400">Last Used</span>
              <span className="text-theme-sm font-medium text-gray-900 dark:text-white">2 hours ago</span>
            </div>
          </div>
        </div>
      </div>

      {/* Field Mappings */}
      {template.fieldMappings && template.fieldMappings.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-6">
            Field Mapping Configuration
          </h3>
          
          <div className="space-y-6">
            {template.fieldMappings.map((mapping, index) => (
              <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white">
                      {mapping.masterField}
                    </h4>
                    {mapping.required && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 rounded text-theme-xs">
                        Required
                      </span>
                    )}
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded text-theme-xs">
                      Priority: {mapping.priority}
                    </span>
                  </div>
                </div>

                {/* Channel Mappings */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {mapping.channelMappings.map((channelMapping, cmIndex) => {
                    const channel = availableChannels.find(c => c.id === channelMapping.channelId);
                    return (
                      <div key={cmIndex} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{channel?.icon}</span>
                          <span className="text-theme-sm font-medium text-gray-900 dark:text-white">
                            {channel?.name}
                          </span>
                        </div>
                        <div className="text-theme-xs text-gray-600 dark:text-gray-400">
                          Field: <span className="font-medium">{channelMapping.fieldName}</span>
                        </div>
                        {channelMapping.maxLength && (
                          <div className="text-theme-xs text-gray-600 dark:text-gray-400">
                            Max Length: <span className="font-medium">{channelMapping.maxLength}</span>
                          </div>
                        )}
                        {channelMapping.prefix && (
                          <div className="text-theme-xs text-gray-600 dark:text-gray-400">
                            Prefix: <span className="font-medium">&quot;{channelMapping.prefix}&quot;</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Transformation Rules */}
                {mapping.transformationRules && mapping.transformationRules.length > 0 && (
                  <div>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Transformation Rules
                    </span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {mapping.transformationRules.map((rule, rIndex) => (
                        <span
                          key={rIndex}
                          className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded text-theme-xs"
                        >
                          {rule.type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview Example */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-6">
          Template Output Preview
        </h3>
        
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Master Data */}
            <div>
              <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
                📝 Master Product Data
              </h4>
              <div className="space-y-3 text-theme-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Product Name:</span>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Premium Wireless Headphones
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Description:</span>
                  <div className="font-medium text-gray-900 dark:text-white">
                    High-quality wireless headphones with noise cancellation
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Price:</span>
                  <div className="font-medium text-gray-900 dark:text-white">$299.99</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Brand:</span>
                  <div className="font-medium text-gray-900 dark:text-white">AudioTech</div>
                </div>
              </div>
            </div>

            {/* Transformed Output */}
            <div>
              <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
                🎯 Amazon Output (Example)
              </h4>
              <div className="space-y-3 text-theme-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Title:</span>
                  <div className="font-medium text-gray-900 dark:text-white">
                    [AudioTech] Premium Wireless Headphones - Noise Cancellation Technology
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Description:</span>
                  <div className="font-medium text-gray-900 dark:text-white">
                    High-quality wireless headphones with noise cancellation. Perfect for audiophiles and music lovers...
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Price:</span>
                  <div className="font-medium text-gray-900 dark:text-white">$299.99</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Keywords:</span>
                  <div className="font-medium text-gray-900 dark:text-white">
                    wireless headphones, noise cancellation, premium audio
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-blue-500 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h5 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                  Transformations Applied
                </h5>
                <ul className="text-theme-xs text-blue-800 dark:text-blue-400 space-y-1">
                  <li>• Added brand prefix &quot;[AudioTech]&quot;</li>
                  <li>• Injected SEO keywords for better discoverability</li>
                  <li>• Optimized title length for Amazon&apos;s 200 character limit</li>
                  <li>• Enhanced description with marketing terms</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" onClick={onEdit}>
          Edit Template
        </Button>
        <Button>
          Apply to Products
        </Button>
        <Button variant="outline">
          Export Template
        </Button>
        <Button variant="outline">
          Duplicate Template
        </Button>
      </div>
    </div>
  );
};

export default TemplatePreview;