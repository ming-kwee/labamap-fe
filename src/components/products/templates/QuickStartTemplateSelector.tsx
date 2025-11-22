"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import { ArrowRightIcon, CheckCircleIcon, TimeIcon, GroupIcon, ArrowUpIcon } from "@/icons";
import { ChannelTemplate } from "./ChannelTemplateManager";

interface QuickStartTemplate {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  channels: string[];
  category: string;
  estimatedTime: string;
  popularity: 'high' | 'medium' | 'low';
  features: string[];
  template: Omit<ChannelTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>;
}

interface QuickStartTemplateSelectorProps {
  onSelectTemplate: (template: ChannelTemplate) => void;
  onBack: () => void;
}

const QuickStartTemplateSelector: React.FC<QuickStartTemplateSelectorProps> = ({
  onSelectTemplate,
  onBack
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<QuickStartTemplate | null>(null);

  const quickStartTemplates: QuickStartTemplate[] = [
    {
      id: 'amazon-starter',
      title: 'Start Selling on Amazon',
      subtitle: 'Perfect for Amazon beginners',
      description: 'Pre-configured template optimized for Amazon\'s requirements with SEO-friendly titles, bullet points, and search terms.',
      channels: ['Amazon'],
      category: 'General',
      estimatedTime: '3 minutes',
      popularity: 'high',
      features: [
        'Amazon-optimized product titles',
        'Bullet point generation',
        'Search term optimization',
        'Category mapping included'
      ],
      template: {
        name: 'Amazon Starter Template',
        type: 'field-mapping',
        category: 'General',
        targetChannels: ['amazon'],
        description: 'Quick setup template for Amazon marketplace with optimized field mappings',
        isActive: true,
        fieldMappings: [
          {
            masterField: 'product_name',
            channelMappings: [
              { channelId: 'amazon', fieldName: 'title', maxLength: 200 }
            ],
            transformationRules: [
              { type: 'seo-optimize', params: { platform: 'amazon' } }
            ],
            priority: 1,
            required: true
          }
        ]
      }
    },
    {
      id: 'ebay-quicklist',
      title: 'Quick List on eBay',
      subtitle: 'Get started with eBay selling',
      description: 'Simple template for eBay listings with optimal title length, category selection, and shipping configurations.',
      channels: ['eBay'],
      category: 'General',
      estimatedTime: '4 minutes',
      popularity: 'high',
      features: [
        'eBay title optimization (80 chars)',
        'Category auto-mapping',
        'Shipping template setup',
        'Best offer configurations'
      ],
      template: {
        name: 'eBay Quick List Template',
        type: 'field-mapping',
        category: 'General',
        targetChannels: ['ebay'],
        description: 'Streamlined template for eBay marketplace listings',
        isActive: true,
        fieldMappings: [
          {
            masterField: 'product_name',
            channelMappings: [
              { channelId: 'ebay', fieldName: 'title', maxLength: 80 }
            ],
            transformationRules: [
              { type: 'truncate', params: { maxLength: 80 } }
            ],
            priority: 1,
            required: true
          }
        ]
      }
    },
    {
      id: 'shopify-store',
      title: 'Expand to Shopify',
      subtitle: 'Add your own online store',
      description: 'Complete Shopify integration with SEO optimization, variant management, and inventory sync.',
      channels: ['Shopify'],
      category: 'Ecommerce',
      estimatedTime: '5 minutes',
      popularity: 'medium',
      features: [
        'SEO-optimized product pages',
        'Variant synchronization',
        'Inventory management',
        'Collection organization'
      ],
      template: {
        name: 'Shopify Store Template',
        type: 'complete-channel',
        category: 'Ecommerce',
        targetChannels: ['shopify'],
        description: 'Complete Shopify store setup with advanced features',
        isActive: true,
        fieldMappings: [
          {
            masterField: 'product_name',
            channelMappings: [
              { channelId: 'shopify', fieldName: 'title', maxLength: 255 }
            ],
            transformationRules: [
              { type: 'seo-optimize', params: { platform: 'shopify' } }
            ],
            priority: 1,
            required: true
          }
        ]
      }
    },
    {
      id: 'multi-marketplace',
      title: 'Multi-Marketplace Launch',
      subtitle: 'Sell on Amazon, eBay & Walmart',
      description: 'Comprehensive template that optimizes your products for multiple major marketplaces simultaneously.',
      channels: ['Amazon', 'eBay', 'Walmart'],
      category: 'Multi-Channel',
      estimatedTime: '5 minutes',
      popularity: 'high',
      features: [
        'Cross-platform optimization',
        'Channel-specific formatting',
        'Unified inventory management',
        'Pricing strategy alignment'
      ],
      template: {
        name: 'Multi-Marketplace Template',
        type: 'complete-channel',
        category: 'Multi-Channel',
        targetChannels: ['amazon', 'ebay', 'walmart'],
        description: 'Optimized template for selling across multiple major marketplaces',
        isActive: true,
        fieldMappings: [
          {
            masterField: 'product_name',
            channelMappings: [
              { channelId: 'amazon', fieldName: 'title', maxLength: 200 },
              { channelId: 'ebay', fieldName: 'title', maxLength: 80 },
              { channelId: 'walmart', fieldName: 'name', maxLength: 75 }
            ],
            transformationRules: [
              { type: 'seo-optimize', params: { platforms: ['amazon', 'ebay', 'walmart'] } }
            ],
            priority: 1,
            required: true
          }
        ]
      }
    },
    {
      id: 'social-commerce',
      title: 'Social Commerce Setup',
      subtitle: 'Facebook & Instagram shops',
      description: 'Optimized for social media selling with engaging descriptions and mobile-friendly formatting.',
      channels: ['Facebook', 'Instagram'],
      category: 'Social Media',
      estimatedTime: '4 minutes',
      popularity: 'medium',
      features: [
        'Social media optimized content',
        'Mobile-friendly formatting',
        'Engaging product descriptions',
        'Visual-first approach'
      ],
      template: {
        name: 'Social Commerce Template',
        type: 'content-generation',
        category: 'Social Media',
        targetChannels: ['facebook', 'instagram'],
        description: 'Social media optimized template for Facebook and Instagram shops',
        isActive: true,
        contentRules: [
          {
            field: 'description',
            template: 'Social media friendly description with emojis and engaging content',
            aiEnhanced: true,
            variables: ['product_name', 'key_features']
          }
        ]
      }
    },
    {
      id: 'international-expansion',
      title: 'International Expansion',
      subtitle: 'Shopee, Lazada & global markets',
      description: 'Expand globally with templates optimized for Asian and international marketplaces.',
      channels: ['Shopee', 'Lazada', 'Tokopedia'],
      category: 'International',
      estimatedTime: '5 minutes',
      popularity: 'low',
      features: [
        'Multi-language support',
        'Currency conversion',
        'Regional optimization',
        'Cultural adaptation'
      ],
      template: {
        name: 'International Expansion Template',
        type: 'complete-channel',
        category: 'International',
        targetChannels: ['shopee', 'lazada', 'tokopedia'],
        description: 'International marketplace template for global expansion',
        isActive: true,
        fieldMappings: [
          {
            masterField: 'product_name',
            channelMappings: [
              { channelId: 'shopee', fieldName: 'name', maxLength: 120 },
              { channelId: 'lazada', fieldName: 'title', maxLength: 255 },
              { channelId: 'tokopedia', fieldName: 'name', maxLength: 70 }
            ],
            transformationRules: [
              { type: 'seo-optimize', params: { region: 'asia' } }
            ],
            priority: 1,
            required: true
          }
        ]
      }
    }
  ];

  const getPopularityIcon = (popularity: string) => {
    switch (popularity) {
      case 'high':
        return <ArrowUpIcon className="w-4 h-4 text-green-600" />;
      case 'medium':
        return <GroupIcon className="w-4 h-4 text-blue-600" />;
      default:
        return <TimeIcon className="w-4 h-4 text-gray-600" />;
    }
  };

  const getPopularityLabel = (popularity: string) => {
    switch (popularity) {
      case 'high':
        return 'Most Popular';
      case 'medium':
        return 'Popular';
      default:
        return 'Specialized';
    }
  };

  const handleSelectTemplate = () => {
    if (!selectedTemplate) return;
    
    const template: ChannelTemplate = {
      ...selectedTemplate.template,
      id: `quick-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0
    };
    
    onSelectTemplate(template);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onBack} className="px-3">
              ← Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Quick Start Templates
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            Pre-configured templates to get you started in minutes
          </p>
        </div>
        
        {selectedTemplate && (
          <Button onClick={handleSelectTemplate} className="px-6">
            Create Template <ArrowRightIcon className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quickStartTemplates.map((template) => (
          <div
            key={template.id}
            onClick={() => setSelectedTemplate(template)}
            className={`relative bg-white dark:bg-gray-800 rounded-lg border-2 p-6 cursor-pointer hover:shadow-lg transition-all duration-200 ${
              selectedTemplate?.id === template.id
                ? 'border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {selectedTemplate?.id === template.id && (
              <div className="absolute -top-3 -right-3 bg-blue-600 text-white rounded-full p-1">
                <CheckCircleIcon className="w-5 h-5" />
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 rounded">
                    {getPopularityIcon(template.popularity)}
                    {getPopularityLabel(template.popularity)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <TimeIcon className="w-3 h-3" />
                    {template.estimatedTime}
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {template.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {template.subtitle}
                </p>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {template.description}
              </p>

              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {template.channels.map((channel) => (
                    <span
                      key={channel}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded"
                    >
                      {channel}
                    </span>
                  ))}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Includes:
                  </h4>
                  <ul className="space-y-1">
                    {template.features.slice(0, 2).map((feature, index) => (
                      <li key={index} className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2">
                        <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                    {template.features.length > 2 && (
                      <li className="text-xs text-gray-500 dark:text-gray-400">
                        +{template.features.length - 2} more features
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
              {selectedTemplate.title} - Ready to Create
            </h3>
            <p className="text-blue-700 dark:text-blue-200">
              {selectedTemplate.description}
            </p>
            
            <div className="space-y-2">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                This template includes:
              </h4>
              <div className="grid md:grid-cols-2 gap-2">
                {selectedTemplate.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-200">
                    <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-blue-200 dark:border-blue-700">
              <div className="text-sm text-blue-600 dark:text-blue-300">
                Estimated setup time: <span className="font-medium">{selectedTemplate.estimatedTime}</span>
              </div>
              <Button onClick={handleSelectTemplate}>
                Create This Template <ArrowRightIcon className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickStartTemplateSelector;