"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { ChannelTemplate } from "./ChannelTemplateManager";
import MappingBuilder from "./MappingBuilder";
import { SourceField, TargetField, ComplexFieldMapping } from "./types/ComplexMapping";

interface TemplateCreationWizardProps {
  template?: ChannelTemplate | null;
  onSave: (template: ChannelTemplate) => void;
  onCancel: () => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
}

const wizardSteps: WizardStep[] = [
  { id: 'type', title: 'Template Type', description: 'Select the type of template to create' },
  { id: 'basic', title: 'Basic Information', description: 'Configure template name and details' },
  { id: 'mapping', title: 'Field Mapping', description: 'Set up master field mappings' },
  { id: 'rules', title: 'Transformation Rules', description: 'Define content transformation rules' },
  { id: 'review', title: 'Review & Save', description: 'Review template configuration' }
];

interface TemplateType {
  id: string;
  title: string;
  description: string;
  icon: string;
  featured?: boolean;
}

const templateTypes: TemplateType[] = [
  {
    id: 'field-mapping',
    title: 'Field Mapping Template',
    description: 'Map master product fields to channel-specific fields',
    icon: '🎯'
  },
  {
    id: 'advanced-mapping',
    title: 'Advanced Complex Mapping',
    description: 'Amazon-style validation, eBay pricing, Shopify dimensions & Facebook rich content',
    icon: '🚀',
    featured: true
  },
  {
    id: 'content-generation',
    title: 'Content Generation Template',
    description: 'AI-powered content generation and optimization',
    icon: '🎨'
  },
  {
    id: 'category-mapping',
    title: 'Category Mapping Template',
    description: 'Map product categories across different channels',
    icon: '📁'
  },
  {
    id: 'pricing-strategy',
    title: 'Pricing Strategy Template',
    description: 'Dynamic pricing rules and strategies',
    icon: '💰'
  },
  {
    id: 'validation-rules',
    title: 'Validation Rules Template',
    description: 'Data validation and compliance rules',
    icon: '✅'
  },
  {
    id: 'complete-channel',
    title: 'Complete Channel Template',
    description: 'Comprehensive template with all features',
    icon: '🚀'
  }
];

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

const masterFields = [
  { id: 'product_name', name: 'Product Name', type: 'text', required: true },
  { id: 'description', name: 'Description', type: 'textarea', required: true },
  { id: 'price', name: 'Price', type: 'number', required: true },
  { id: 'category', name: 'Category', type: 'text', required: true },
  { id: 'brand', name: 'Brand', type: 'text', required: false },
  { id: 'weight', name: 'Weight', type: 'number', required: false },
  { id: 'dimensions', name: 'Dimensions', type: 'text', required: false },
  { id: 'features', name: 'Features', type: 'textarea', required: false },
  { id: 'images', name: 'Images', type: 'file', required: false },
  { id: 'sku', name: 'SKU', type: 'text', required: true },
  { id: 'tags', name: 'Tags', type: 'array', required: false }
];

const transformationTypes = [
  { id: 'prefix', name: 'Add Prefix', description: 'Add text at the beginning' },
  { id: 'suffix', name: 'Add Suffix', description: 'Add text at the end' },
  { id: 'truncate', name: 'Truncate', description: 'Limit character length with "..."' },
  { id: 'seo-optimize', name: 'SEO Optimize', description: 'Inject SEO keywords' },
  { id: 'format', name: 'Format Text', description: 'Apply text formatting rules' },
  { id: 'validate', name: 'Validate', description: 'Apply validation rules' }
];

const TemplateCreationWizard: React.FC<TemplateCreationWizardProps> = ({
  template,
  onSave,
  onCancel
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [complexMappings, setComplexMappings] = useState<ComplexFieldMapping[]>([]);
  
  const [formData, setFormData] = useState<Partial<ChannelTemplate>>({
    name: template?.name || '',
    type: template?.type || 'field-mapping',
    category: template?.category || '',
    targetChannels: template?.targetChannels || [],
    description: template?.description || '',
    isActive: template?.isActive ?? true,
    fieldMappings: template?.fieldMappings || []
  });

  // State for actual field mappings
  const [selectedMasterFields, setSelectedMasterFields] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Array<{
    masterField: string;
    channelMappings: Record<string, string>;
  }>>([]);

  const handleNext = () => {
    if (currentStep < wizardSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFieldChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Show advanced mapping builder for advanced-mapping type
    if (field === 'type' && value === 'advanced-mapping') {
      setShowAdvancedMapping(true);
    }
  };

  const handleMasterFieldToggle = (fieldId: string) => {
    setSelectedMasterFields(prev => 
      prev.includes(fieldId) 
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const updateFieldMapping = (masterField: string, channel: string, targetField: string) => {
    setFieldMappings(prev => {
      const existing = prev.find(m => m.masterField === masterField);
      if (existing) {
        return prev.map(m => 
          m.masterField === masterField 
            ? { ...m, channelMappings: { ...m.channelMappings, [channel]: targetField }}
            : m
        );
      } else {
        return [...prev, { 
          masterField, 
          channelMappings: { [channel]: targetField }
        }];
      }
    });
  };

  const getChannelFields = (channelId: string) => {
    // Channel-specific fields based on real marketplace requirements
    const channelFieldsMap: Record<string, Array<{id: string, name: string, maxLength?: number}>> = {
      amazon: [
        { id: 'title', name: 'Product Title', maxLength: 200 },
        { id: 'bullet_point_1', name: 'Bullet Point 1', maxLength: 255 },
        { id: 'bullet_point_2', name: 'Bullet Point 2', maxLength: 255 },
        { id: 'description', name: 'Product Description', maxLength: 2000 },
        { id: 'search_terms', name: 'Search Terms', maxLength: 249 }
      ],
      ebay: [
        { id: 'title', name: 'Item Title', maxLength: 80 },
        { id: 'subtitle', name: 'Subtitle', maxLength: 55 },
        { id: 'description', name: 'Item Description' },
        { id: 'condition', name: 'Item Condition' }
      ],
      shopify: [
        { id: 'title', name: 'Product Title' },
        { id: 'body_html', name: 'Description' },
        { id: 'vendor', name: 'Vendor' },
        { id: 'product_type', name: 'Product Type' },
        { id: 'tags', name: 'Tags' }
      ],
      walmart: [
        { id: 'productName', name: 'Product Name', maxLength: 75 },
        { id: 'shortDescription', name: 'Short Description', maxLength: 4000 },
        { id: 'mainImageUrl', name: 'Main Image URL' }
      ]
    };
    
    return channelFieldsMap[channelId] || [];
  };

  const handleChannelToggle = (channelId: string) => {
    setFormData(prev => ({
      ...prev,
      targetChannels: prev.targetChannels?.includes(channelId)
        ? prev.targetChannels.filter(id => id !== channelId)
        : [...(prev.targetChannels || []), channelId]
    }));
  };

  const handleSave = () => {
    const templateData: ChannelTemplate = {
      id: template?.id || '',
      name: formData.name || '',
      type: formData.type || 'field-mapping',
      category: formData.category || '',
      targetChannels: formData.targetChannels || [],
      description: formData.description || '',
      createdAt: template?.createdAt || new Date(),
      updatedAt: new Date(),
      isActive: formData.isActive || true,
      usageCount: template?.usageCount || 0,
      fieldMappings: fieldMappings // Save the actual field mappings created by user
    };
    onSave(templateData);
  };

  const renderStepContent = () => {
    switch (wizardSteps[currentStep].id) {
      case 'type':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                CREATE NEW TEMPLATE
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Choose the type of template you want to create
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templateTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleFieldChange('type', type.id)}
                  className={`p-6 rounded-lg border-2 transition-all text-left relative ${
                    formData.type === type.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : type.featured
                      ? 'border-purple-300 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 hover:border-purple-400'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {type.featured && (
                    <div className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                      NEW
                    </div>
                  )}
                  <div className="text-3xl mb-3">{type.icon}</div>
                  <h3 className={`font-semibold mb-2 ${
                    type.featured 
                      ? 'text-purple-900 dark:text-purple-300' 
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {type.title}
                  </h3>
                  <p className={`text-theme-sm ${
                    type.featured 
                      ? 'text-purple-700 dark:text-purple-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {type.description}
                  </p>
                  {type.featured && (
                    <div className="mt-3 text-xs text-purple-600 dark:text-purple-400 font-medium">
                      ✨ Real-world examples: Amazon, eBay, Shopify, Facebook
                    </div>
                  )}
                </button>
              ))}
            </div>

            {formData.type && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="text-blue-500 text-2xl">
                    {templateTypes.find(t => t.id === formData.type)?.icon}
                  </div>
                  <div>
                    <h4 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                      Selected: {templateTypes.find(t => t.id === formData.type)?.title}
                    </h4>
                    <p className="text-theme-xs text-blue-800 dark:text-blue-400">
                      {templateTypes.find(t => t.id === formData.type)?.description}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'basic':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                TEMPLATE BASIC INFORMATION
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Configure your template name, category, and target channels
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>📝 Template Name</Label>
                  <Input
                    type="text"
                    defaultValue={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="e.g., Amazon Electronics Optimization"
                  />
                </div>

                <div>
                  <Label>🏷️ Category</Label>
                  <select
                    defaultValue={formData.category}
                    onChange={(e) => handleFieldChange('category', e.target.value)}
                    className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">Select Category</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Home & Garden">Home & Garden</option>
                    <option value="Sports">Sports</option>
                    <option value="Books">Books</option>
                    <option value="Beauty">Beauty</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div className="mt-6">
                <Label>📄 Description</Label>
                <textarea
                  defaultValue={formData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="Describe what this template does and when to use it..."
                  className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                  rows={3}
                />
              </div>

              <div className="mt-6">
                <Label>🎯 Target Channels</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                  {availableChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handleChannelToggle(channel.id)}
                      className={`p-3 rounded-lg border-2 transition-all flex items-center gap-2 ${
                        formData.targetChannels?.includes(channel.id)
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-lg">{channel.icon}</span>
                      <span className="text-theme-sm font-medium">{channel.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                FIELD MAPPING CONFIGURATION
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Map master product fields to channel-specific fields with drag & drop or dropdown selection
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              {formData.targetChannels && formData.targetChannels.length > 0 ? (
                <div className="space-y-8">
                  {/* Master Fields Selection */}
                  <div>
                    <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
                      1️⃣ Select Master Fields to Map
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {masterFields.map((field) => (
                        <div
                          key={field.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${
                            selectedMasterFields.includes(field.id)
                              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                          }`}
                          onClick={() => handleMasterFieldToggle(field.id)}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedMasterFields.includes(field.id)}
                              onChange={() => handleMasterFieldToggle(field.id)}
                              className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                            />
                            <span className="text-theme-sm font-medium text-gray-900 dark:text-white">
                              {field.name}
                            </span>
                            {field.required && (
                              <span className="text-xs px-1 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded">
                                *
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {field.type}
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedMasterFields.length > 0 && (
                      <div className="mt-3 text-theme-sm text-green-600 dark:text-green-400">
                        ✅ {selectedMasterFields.length} fields selected for mapping
                      </div>
                    )}
                  </div>

                  {/* Field Mapping Interface */}
                  {selectedMasterFields.length > 0 && (
                    <div>
                      <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
                        2️⃣ Configure Field Mappings
                      </h3>
                      
                      {selectedMasterFields.map(masterFieldId => {
                        const masterField = masterFields.find(f => f.id === masterFieldId);
                        if (!masterField) return null;
                        
                        return (
                          <div key={masterFieldId} className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-3 h-3 bg-brand-500 rounded-full"></div>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {masterField.name}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({masterField.type})
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                              {formData.targetChannels?.map(channelId => {
                                const channel = availableChannels.find(c => c.id === channelId);
                                const channelFields = getChannelFields(channelId);
                                const currentMapping = fieldMappings.find(m => m.masterField === masterFieldId)?.channelMappings[channelId];
                                
                                return (
                                  <div key={channelId} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                                    <div className="flex items-center gap-2 mb-3">
                                      <span className="text-lg">{channel?.icon}</span>
                                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                                        {channel?.name}
                                      </span>
                                    </div>
                                    
                                    <select
                                      value={currentMapping || ''}
                                      onChange={(e) => updateFieldMapping(masterFieldId, channelId, e.target.value)}
                                      className="w-full h-9 rounded border border-gray-300 px-2 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                                    >
                                      <option value="">Select target field</option>
                                      {channelFields.map(targetField => (
                                        <option key={targetField.id} value={targetField.id}>
                                          {targetField.name}
                                          {targetField.maxLength ? ` (${targetField.maxLength})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                    
                                    {currentMapping && (
                                      <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                                        ✓ Mapped to {channelFields.find(f => f.id === currentMapping)?.name}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Mapping Summary */}
                  {fieldMappings.length > 0 && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <h4 className="text-theme-sm font-medium text-green-900 dark:text-green-300 mb-3">
                        📋 Mapping Summary
                      </h4>
                      <div className="space-y-2">
                        {fieldMappings.map(mapping => {
                          const masterField = masterFields.find(f => f.id === mapping.masterField);
                          const mappingCount = Object.keys(mapping.channelMappings).length;
                          
                          return (
                            <div key={mapping.masterField} className="text-sm text-green-800 dark:text-green-400">
                              <strong>{masterField?.name}</strong> mapped to {mappingCount} channel{mappingCount !== 1 ? 's' : ''}
                              <div className="ml-4 text-xs">
                                {Object.entries(mapping.channelMappings).map(([channelId, targetField]) => {
                                  const channel = availableChannels.find(c => c.id === channelId);
                                  const channelFields = getChannelFields(channelId);
                                  const targetFieldName = channelFields.find(f => f.id === targetField)?.name;
                                  return (
                                    <div key={channelId}>
                                      {channel?.icon} {channel?.name}: {targetFieldName}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📋</div>
                  <h3 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
                    No Target Channels Selected
                  </h3>
                  <p className="text-theme-sm text-gray-500 dark:text-gray-400 mb-4">
                    Please go back to the previous step and select target channels first.
                  </p>
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>
                    ← Back to Basic Information
                  </Button>
                </div>
              )}
            </div>
          </div>
        );

      case 'rules':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                TRANSFORMATION RULES
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Define how content should be transformed for each channel
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-6">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Available Transformation Rules
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {transformationTypes.map((rule) => (
                    <div
                      key={rule.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                            {rule.name}
                          </h4>
                          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                            {rule.description}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-4">
                    Preview Configuration
                  </h4>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Master Field
                        </span>
                        <div className="text-theme-sm font-medium text-gray-900 dark:text-white mt-1">
                          Premium Wireless Headphones
                        </div>
                      </div>
                      <div>
                        <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Amazon Output
                        </span>
                        <div className="text-theme-sm font-medium text-gray-900 dark:text-white mt-1">
                          [AudioTech] Premium Wireless Headphones - Noise Cancellation
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                REVIEW & SAVE TEMPLATE
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Review your template configuration before saving
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-6">
                {/* Template Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
                      Template Details
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Name
                        </span>
                        <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                          {formData.name || 'Untitled Template'}
                        </div>
                      </div>
                      <div>
                        <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Type
                        </span>
                        <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                          {templateTypes.find(t => t.id === formData.type)?.title}
                        </div>
                      </div>
                      <div>
                        <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Category
                        </span>
                        <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                          {formData.category || 'Not specified'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
                      Target Channels
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {formData.targetChannels?.map((channelId) => {
                        const channel = availableChannels.find(c => c.id === channelId);
                        return (
                          <span
                            key={channelId}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-brand-100 text-brand-800 dark:bg-brand-900/20 dark:text-brand-400 rounded-full text-theme-xs"
                          >
                            {channel?.icon} {channel?.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {formData.description && (
                  <div>
                    <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Description
                    </span>
                    <div className="text-theme-sm text-gray-900 dark:text-white mt-1">
                      {formData.description}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Show Advanced Mapping Builder when advanced-mapping is selected
  if (showAdvancedMapping) {
    // Create sample source and target fields for the mapping builder
    const sampleSourceFields: SourceField[] = [
      { fieldPath: 'masterAttributes.brand', displayName: 'Brand', dataType: 'string', required: true },
      { fieldPath: 'masterAttributes.product_name', displayName: 'Product Name', dataType: 'string', required: true },
      { fieldPath: 'masterAttributes.model', displayName: 'Model', dataType: 'string', required: false },
      { fieldPath: 'masterAttributes.key_feature', displayName: 'Key Feature', dataType: 'string', required: false },
      { fieldPath: 'masterAttributes.description', displayName: 'Description', dataType: 'string', required: true },
      { fieldPath: 'masterAttributes.features', displayName: 'Features', dataType: 'array', required: false },
      { fieldPath: 'masterAttributes.specifications', displayName: 'Specifications', dataType: 'object', required: false },
      { fieldPath: 'masterAttributes.dimensions', displayName: 'Dimensions', dataType: 'object', required: false },
      { fieldPath: 'pricingData.price', displayName: 'Price', dataType: 'number', required: true },
      { fieldPath: 'pricingData.compare_at_price', displayName: 'Compare At Price', dataType: 'number', required: false },
      { fieldPath: 'pricingData.cost', displayName: 'Cost', dataType: 'number', required: false }
    ];

    const sampleTargetFields: TargetField[] = [
      { channelId: 'amazon', fieldPath: 'title', displayName: 'Amazon Title', dataType: 'string', maxLength: 200, required: true },
      { channelId: 'amazon', fieldPath: 'bullet_points', displayName: 'Amazon Bullet Points', dataType: 'array', required: false },
      { channelId: 'shopify', fieldPath: 'shipping_length', displayName: 'Shopify Shipping Length', dataType: 'number', required: false },
      { channelId: 'shopify', fieldPath: 'shipping_width', displayName: 'Shopify Shipping Width', dataType: 'number', required: false },
      { channelId: 'shopify', fieldPath: 'shipping_height', displayName: 'Shopify Shipping Height', dataType: 'number', required: false },
      { channelId: 'shopify', fieldPath: 'dimension_unit', displayName: 'Shopify Dimension Unit', dataType: 'string', required: false },
      { channelId: 'ebay', fieldPath: 'price', displayName: 'eBay Price', dataType: 'number', required: true },
      { channelId: 'facebook', fieldPath: 'description', displayName: 'Facebook Rich Description', dataType: 'string', maxLength: 5000, required: false }
    ];

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white">
                🚀 Advanced Complex Mapping Builder
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
                Create sophisticated field transformations with Amazon validation, eBay pricing, Shopify dimensions & Facebook rich content
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAdvancedMapping(false)}
            >
              ← Back to Template Wizard
            </Button>
          </div>
        </div>

        <MappingBuilder
          availableSourceFields={sampleSourceFields}
          availableTargetFields={sampleTargetFields}
          onSave={(mappings) => {
            setComplexMappings(mappings);
            // You could save these mappings to the template
            setShowAdvancedMapping(false);
            // Optionally continue to next step or complete the template
          }}
          onCancel={() => setShowAdvancedMapping(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          {wizardSteps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-theme-sm font-medium ${
                  index === currentStep
                    ? 'bg-brand-500 text-white'
                    : index < currentStep
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {index < currentStep ? '✓' : index + 1}
              </div>
              {index < wizardSteps.length - 1 && (
                <div
                  className={`w-16 h-1 mx-2 ${
                    index < currentStep ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-center">
          <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
            {wizardSteps[currentStep].title}
          </h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
            {wizardSteps[currentStep].description}
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[500px]">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={currentStep === 0 ? onCancel : handlePrevious}
        >
          {currentStep === 0 ? 'Cancel' : 'Previous'}
        </Button>

        <div className="flex items-center gap-3">
          {currentStep < wizardSteps.length - 1 ? (
            <Button onClick={handleNext}>
              Continue
            </Button>
          ) : (
            <Button onClick={handleSave}>
              Save Template
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateCreationWizard;