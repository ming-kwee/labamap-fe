"use client";
import React, { useState } from "react";
import Button from "@/shared/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { ChannelTemplate, FieldMapping } from "./ChannelTemplateManager";
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

// Streamlined wizard steps - removed unnecessary "Template Type" step
const getWizardSteps = (): WizardStep[] => {
  return [
    { id: 'basic', title: 'Basic Information', description: 'Configure template name and details' },
    { id: 'advanced-mapping', title: 'Advanced Mappings', description: 'Create field transformations, validation, AI content, pricing & category mappings' },
    { id: 'review', title: 'Review & Save', description: 'Review your advanced template configuration' }
  ];
};

// Template type is now fixed to 'advanced-builder' - no selection needed

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
  const [complexMappings, setComplexMappings] = useState<ComplexFieldMapping[]>([]);
  const [currentWizardSteps] = useState<WizardStep[]>(
    getWizardSteps()
  );
  
  const [formData, setFormData] = useState<Partial<ChannelTemplate> & { activeAdvancedTab?: string }>({
    name: template?.name || '',
    type: template?.type || 'advanced-builder',
    category: template?.category || '',
    targetChannels: template?.targetChannels || [],
    description: template?.description || '',
    isActive: template?.isActive ?? true,
    fieldMappings: template?.fieldMappings || [],
    activeAdvancedTab: 'mappings'
  });

  // State for actual field mappings
  const [selectedMasterFields, setSelectedMasterFields] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);

  const handleNext = () => {
    if (currentStep < currentWizardSteps.length - 1) {
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
            ? { 
                ...m, 
                channelMappings: m.channelMappings.map(cm => 
                  cm.channelId === channel 
                    ? { ...cm, fieldName: targetField }
                    : cm
                ).concat(
                  m.channelMappings.find(cm => cm.channelId === channel) 
                    ? [] 
                    : [{ channelId: channel, fieldName: targetField }]
                )
              }
            : m
        );
      } else {
        return [...prev, { 
          masterField, 
          channelMappings: [{ channelId: channel, fieldName: targetField }],
          transformationRules: [],
          priority: 1,
          required: false
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
      type: 'advanced-builder',
      category: formData.category || '',
      targetChannels: formData.targetChannels || [],
      description: formData.description || '',
      createdAt: template?.createdAt || new Date(),
      updatedAt: new Date(),
      isActive: formData.isActive || true,
      usageCount: template?.usageCount || 0,
      fieldMappings: fieldMappings, // Save the actual field mappings created by user
      complexMappings: complexMappings // Save complex mappings for all templates
    };
    onSave(templateData);
  };

  const renderStepContent = () => {
    switch (currentWizardSteps[currentStep]?.id) {
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

      case 'unused-mapping':
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
                                const currentMapping = fieldMappings.find(m => m.masterField === masterFieldId)?.channelMappings.find(cm => cm.channelId === channelId)?.fieldName;
                                
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
                          const mappingCount = mapping.channelMappings.length;
                          
                          return (
                            <div key={mapping.masterField} className="text-sm text-green-800 dark:text-green-400">
                              <strong>{masterField?.name}</strong> mapped to {mappingCount} channel{mappingCount !== 1 ? 's' : ''}
                              <div className="ml-4 text-xs">
                                {mapping.channelMappings.map(channelMapping => {
                                  const channel = availableChannels.find(c => c.id === channelMapping.channelId);
                                  const channelFields = getChannelFields(channelMapping.channelId);
                                  const targetFieldName = channelFields.find(f => f.id === channelMapping.fieldName)?.name;
                                  return (
                                    <div key={channelMapping.channelId}>
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

      case 'advanced-mapping':
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
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                🚀 ADVANCED TEMPLATE BUILDER
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Complete solution: field transformations, AI content generation, dynamic pricing & validation rules
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="flex space-x-8">
                {[
                  { id: 'mappings', name: 'Field Mappings', icon: '🎯' },
                  { id: 'ai-content', name: 'AI Content', icon: '🎨' },
                  { id: 'pricing', name: 'Pricing Strategy', icon: '💰' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                      (formData.activeAdvancedTab || 'mappings') === tab.id
                        ? 'border-brand-500 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setFormData(prev => ({ ...prev, activeAdvancedTab: tab.id }))}
                  >
                    <span>{tab.icon}</span>
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              
              {/* Field Mappings Tab */}
              {(!formData.activeAdvancedTab || formData.activeAdvancedTab === 'mappings') && (
                <MappingBuilder
                  availableSourceFields={sampleSourceFields}
                  availableTargetFields={sampleTargetFields}
                  onSave={(mappings) => {
                    setComplexMappings(mappings);
                    // Switch to AI Content tab after mappings are saved
                    setFormData(prev => ({ ...prev, activeAdvancedTab: 'ai-content' }));
                  }}
                  onCancel={() => {
                    // Stay on current step, user can use Previous button if needed
                  }}
                />
              )}

              {/* AI Content Generation Tab */}
              {formData.activeAdvancedTab === 'ai-content' && (
                <div className="p-6 space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-title-md font-semibold text-gray-900 dark:text-white mb-2">
                      🎨 AI Content Generation
                    </h3>
                    <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                      Configure AI-powered content generation rules for enhanced product descriptions
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Content Generation Rules */}
                    <div className="space-y-4">
                      <h4 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                        Content Generation Rules
                      </h4>
                      
                      <div>
                        <Label>Target Content Fields</Label>
                        <div className="space-y-2">
                          {['title', 'description', 'bullet_points', 'meta_description'].map((field) => (
                            <label key={field} className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" 
                                defaultChecked={field === 'description'}
                              />
                              <span className="text-theme-sm text-gray-900 dark:text-white capitalize">
                                {field.replace('_', ' ')}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label>AI Enhancement Level</Label>
                        <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                          <option value="basic">Basic Enhancement</option>
                          <option value="advanced">Advanced SEO Optimization</option>
                          <option value="premium">Premium AI + Market Analysis</option>
                        </select>
                      </div>

                      <div>
                        <Label>Content Tone</Label>
                        <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                          <option value="professional">Professional</option>
                          <option value="friendly">Friendly</option>
                          <option value="persuasive">Persuasive</option>
                          <option value="technical">Technical</option>
                        </select>
                      </div>
                    </div>

                    {/* AI Configuration */}
                    <div className="space-y-4">
                      <h4 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                        AI Model Configuration
                      </h4>

                      <div>
                        <Label>Target Keywords (SEO)</Label>
                        <Input
                          type="text"
                          placeholder="e.g., wireless headphones, premium audio, noise cancelling"
                          defaultValue={formData.aiSettings?.keywords || ''}
                        />
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                          Comma-separated keywords for SEO optimization
                        </p>
                      </div>

                      <div>
                        <Label>Content Template</Label>
                        <textarea
                          className="h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                          placeholder="Use {product_name}, {brand}, {features} as variables"
                          defaultValue={formData.aiSettings?.template || 'Discover the amazing {product_name} by {brand}. {features}'}
                          rows={4}
                        />
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h5 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                          🚀 AI Enhancement Preview
                        </h5>
                        <div className="text-theme-xs text-blue-800 dark:text-blue-400 space-y-1">
                          <div><strong>Original:</strong> &quot;Wireless headphones with good sound&quot;</div>
                          <div><strong>AI Enhanced:</strong> &quot;Premium wireless headphones featuring advanced audio technology and superior comfort for all-day listening&quot;</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      variant="outline"
                      onClick={() => setFormData(prev => ({ ...prev, activeAdvancedTab: 'mappings' }))}
                    >
                      ← Back to Mappings
                    </Button>
                    <Button
                      onClick={() => setFormData(prev => ({ ...prev, activeAdvancedTab: 'pricing' }))}
                    >
                      Continue to Pricing →
                    </Button>
                  </div>
                </div>
              )}

              {/* Dynamic Pricing Tab */}
              {formData.activeAdvancedTab === 'pricing' && (
                <div className="p-6 space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-title-md font-semibold text-gray-900 dark:text-white mb-2">
                      💰 Dynamic Pricing Strategy
                    </h3>
                    <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                      Set up dynamic pricing rules and competitive strategies across channels
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Pricing Strategy */}
                    <div className="space-y-4">
                      <h4 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                        Base Pricing Strategy
                      </h4>
                      
                      <div>
                        <Label>Pricing Method</Label>
                        <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                          <option value="markup">Cost + Markup %</option>
                          <option value="competitive">Competitive Pricing</option>
                          <option value="value">Value-Based Pricing</option>
                          <option value="dynamic">Dynamic Market Pricing</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Markup Percentage</Label>
                          <Input
                            type="number"
                            placeholder="30"
                            defaultValue="30"
                            min="0"
                            max="500"
                          />
                        </div>
                        <div>
                          <Label>Minimum Margin %</Label>
                          <Input
                            type="number"
                            placeholder="15"
                            defaultValue="15"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Bulk Pricing Tiers</Label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-theme-sm">
                            <span className="w-20">Qty 1-10:</span>
                            <span className="w-16">100%</span>
                            <span className="text-gray-500">of base price</span>
                          </div>
                          <div className="flex items-center gap-2 text-theme-sm">
                            <span className="w-20">Qty 11-50:</span>
                            <Input type="number" className="w-16 h-8" defaultValue="95" />
                            <span className="text-gray-500">% of base price</span>
                          </div>
                          <div className="flex items-center gap-2 text-theme-sm">
                            <span className="w-20">Qty 50+:</span>
                            <Input type="number" className="w-16 h-8" defaultValue="90" />
                            <span className="text-gray-500">% of base price</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Channel-Specific Pricing */}
                    <div className="space-y-4">
                      <h4 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                        Channel-Specific Adjustments
                      </h4>

                      {[
                        { id: 'amazon', name: 'Amazon', fee: '15%' },
                        { id: 'ebay', name: 'eBay', fee: '12%' },
                        { id: 'shopify', name: 'Shopify', fee: '3%' }
                      ].map((channel) => (
                        <div key={channel.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">{channel.name}</span>
                              <span className="text-xs bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded">
                                {channel.fee} fees
                              </span>
                            </div>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" defaultChecked />
                              <span className="text-theme-xs text-gray-600 dark:text-gray-400">Auto-adjust</span>
                            </label>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Price Adjustment</Label>
                              <Input type="number" placeholder="+5" className="h-8" />
                            </div>
                            <div>
                              <Label className="text-xs">Competition Factor</Label>
                              <select className="h-8 w-full text-xs rounded border border-gray-300 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900">
                                <option value="match">Match lowest</option>
                                <option value="beat">Beat by 5%</option>
                                <option value="ignore">Ignore competition</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      variant="outline"
                      onClick={() => setFormData(prev => ({ ...prev, activeAdvancedTab: 'ai-content' }))}
                    >
                      ← Back to AI Content
                    </Button>
                    <Button
                      onClick={() => {
                        // Move to next step after pricing is configured
                        handleNext();
                      }}
                    >
                      Complete Advanced Setup →
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Progress Indicators */}
            <div className="flex justify-center gap-4 text-sm">
              <div className={`flex items-center gap-2 ${complexMappings.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {complexMappings.length > 0 ? '✅' : '⏳'} Field Mappings ({complexMappings.length})
              </div>
              <div className={`flex items-center gap-2 ${formData.aiSettings?.keywords ? 'text-green-600' : 'text-gray-400'}`}>
                {formData.aiSettings?.keywords ? '✅' : '⏳'} AI Content Rules
              </div>
              <div className="flex items-center gap-2 text-green-600">
                ✅ Pricing Strategy
              </div>
            </div>
          </div>
        );

      case 'unused-rules':
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
                          Advanced Template Builder
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

                {/* Show Complex Mappings Summary for advanced templates */}
                {complexMappings.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="text-title-sm font-semibold text-blue-900 dark:text-blue-300 mb-4">
                      🚀 Advanced Complex Mappings
                    </h3>
                    <div className="space-y-2">
                      {complexMappings.map((mapping, index) => (
                        <div key={mapping.id || index} className="text-theme-sm">
                          <div className="font-medium text-blue-900 dark:text-blue-300">
                            {mapping.name} ({mapping.type})
                          </div>
                          <div className="text-theme-xs text-blue-700 dark:text-blue-400">
                            {mapping.sourceFields.length} source field{mapping.sourceFields.length !== 1 ? 's' : ''} → {mapping.targetField.displayName}
                          </div>
                        </div>
                      ))}
                      <div className="mt-3 text-theme-xs text-blue-800 dark:text-blue-400">
                        Total: {complexMappings.length} advanced mapping{complexMappings.length !== 1 ? 's' : ''} configured
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'unused-ai-settings':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                🎨 AI Content Generation Settings
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Configure AI-powered content generation rules for enhanced product descriptions
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Content Generation Rules */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Content Generation Rules
                </h3>
                
                <div>
                  <Label>Target Content Fields</Label>
                  <div className="space-y-2">
                    {['title', 'description', 'bullet_points', 'meta_description'].map((field) => (
                      <label key={field} className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" 
                          defaultChecked={field === 'description'}
                        />
                        <span className="text-theme-sm text-gray-900 dark:text-white capitalize">
                          {field.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>AI Enhancement Level</Label>
                  <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                    <option value="basic">Basic Enhancement</option>
                    <option value="advanced">Advanced SEO Optimization</option>
                    <option value="premium">Premium AI + Market Analysis</option>
                  </select>
                </div>

                <div>
                  <Label>Content Tone</Label>
                  <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="persuasive">Persuasive</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
              </div>

              {/* AI Configuration */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  AI Model Configuration
                </h3>

                <div>
                  <Label>Target Keywords (SEO)</Label>
                  <Input
                    type="text"
                    placeholder="e.g., wireless headphones, premium audio, noise cancelling"
                    defaultValue={formData.aiSettings?.keywords || ''}
                  />
                  <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                    Comma-separated keywords for SEO optimization
                  </p>
                </div>

                <div>
                  <Label>Content Template</Label>
                  <textarea
                    className="h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    placeholder="Use {product_name}, {brand}, {features} as variables"
                    defaultValue={formData.aiSettings?.template || 'Discover the amazing {product_name} by {brand}. {features}'}
                    rows={4}
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                    🚀 AI Enhancement Preview
                  </h4>
                  <div className="text-theme-xs text-blue-800 dark:text-blue-400 space-y-1">
                    <div><strong>Original:</strong> &quot;Wireless headphones with good sound&quot;</div>
                    <div><strong>AI Enhanced:</strong> &quot;Premium wireless headphones featuring advanced audio technology and superior comfort for all-day listening&quot;</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'unused-category-setup':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                📂 Category Mapping Configuration
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Set up intelligent category mapping across different sales channels
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Master Category */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Master Category Configuration
                </h3>
                
                <div>
                  <Label>Primary Category</Label>
                  <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                    <option value="">Select primary category</option>
                    <option value="electronics">Electronics</option>
                    <option value="fashion">Fashion & Apparel</option>
                    <option value="home">Home & Garden</option>
                    <option value="sports">Sports & Outdoors</option>
                    <option value="books">Books & Media</option>
                  </select>
                </div>

                <div>
                  <Label>Category Attributes</Label>
                  <div className="space-y-2">
                    {['Brand', 'Size', 'Color', 'Material', 'Age Group'].map((attr) => (
                      <label key={attr} className="flex items-center gap-2">
                        <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                        <span className="text-theme-sm text-gray-900 dark:text-white">{attr}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Auto-categorization Rules</Label>
                  <textarea
                    className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    placeholder="If product_name contains 'phone' then Electronics > Mobile Phones"
                    rows={3}
                  />
                </div>
              </div>

              {/* Channel Category Mapping */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Channel-Specific Categories
                </h3>

                {['amazon', 'ebay', 'shopify'].map((channel) => (
                  <div key={channel} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="capitalize font-medium text-gray-900 dark:text-white">{channel}</span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                        {channel === 'amazon' ? 'Browse Tree' : channel === 'ebay' ? 'Category ID' : 'Product Type'}
                      </span>
                    </div>
                    <select className="h-8 w-full rounded-md border border-gray-300 px-2 py-1 text-theme-sm focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900">
                      <option value="">Select {channel} category</option>
                      {channel === 'amazon' && (
                        <>
                          <option value="172282">Electronics &gt; Headphones</option>
                          <option value="172541">Electronics &gt; Cell Phones</option>
                        </>
                      )}
                      {channel === 'ebay' && (
                        <>
                          <option value="15032">Consumer Electronics</option>
                          <option value="9355">Cell Phones &amp; Accessories</option>
                        </>
                      )}
                      {channel === 'shopify' && (
                        <>
                          <option value="Electronics">Electronics</option>
                          <option value="Accessories">Accessories</option>
                        </>
                      )}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'unused-pricing-setup':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                💰 Pricing Strategy Configuration
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Set up dynamic pricing rules and competitive strategies across channels
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pricing Strategy */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Base Pricing Strategy
                </h3>
                
                <div>
                  <Label>Pricing Method</Label>
                  <select className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900">
                    <option value="markup">Cost + Markup %</option>
                    <option value="competitive">Competitive Pricing</option>
                    <option value="value">Value-Based Pricing</option>
                    <option value="dynamic">Dynamic Market Pricing</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Markup Percentage</Label>
                    <Input
                      type="number"
                      placeholder="30"
                      defaultValue="30"
                      min="0"
                      max="500"
                    />
                  </div>
                  <div>
                    <Label>Minimum Margin %</Label>
                    <Input
                      type="number"
                      placeholder="15"
                      defaultValue="15"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>

                <div>
                  <Label>Bulk Pricing Tiers</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-theme-sm">
                      <span className="w-20">Qty 1-10:</span>
                      <span className="w-16">100%</span>
                      <span className="text-gray-500">of base price</span>
                    </div>
                    <div className="flex items-center gap-2 text-theme-sm">
                      <span className="w-20">Qty 11-50:</span>
                      <Input type="number" className="w-16 h-8" defaultValue="95" />
                      <span className="text-gray-500">% of base price</span>
                    </div>
                    <div className="flex items-center gap-2 text-theme-sm">
                      <span className="w-20">Qty 50+:</span>
                      <Input type="number" className="w-16 h-8" defaultValue="90" />
                      <span className="text-gray-500">% of base price</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Channel-Specific Pricing */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Channel-Specific Adjustments
                </h3>

                {[
                  { id: 'amazon', name: 'Amazon', fee: '15%' },
                  { id: 'ebay', name: 'eBay', fee: '12%' },
                  { id: 'shopify', name: 'Shopify', fee: '3%' }
                ].map((channel) => (
                  <div key={channel.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{channel.name}</span>
                        <span className="text-xs bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded">
                          {channel.fee} fees
                        </span>
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" defaultChecked />
                        <span className="text-theme-xs text-gray-600 dark:text-gray-400">Auto-adjust</span>
                      </label>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Price Adjustment %</Label>
                        <Input
                          type="number"
                          defaultValue={channel.id === 'amazon' ? '5' : channel.id === 'ebay' ? '3' : '0'}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label>Competitive Buffer</Label>
                        <select className="h-8 w-full rounded-md border border-gray-300 px-2 py-1 text-theme-sm focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900">
                          <option value="match">Match lowest</option>
                          <option value="below1">$1 below</option>
                          <option value="above1">$1 above</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'unused-validation-setup':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white mb-2">
                ✅ Validation Rules & Compliance
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Set up data validation rules and ensure channel compliance requirements
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Field Validation Rules */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Field Validation Rules
                </h3>
                
                <div className="space-y-3">
                  {[
                    { field: 'Product Title', rule: 'Length 10-200 chars', channel: 'Amazon' },
                    { field: 'Description', rule: 'Required, max 5000 chars', channel: 'All' },
                    { field: 'Price', rule: 'Must be > $0.01', channel: 'All' },
                    { field: 'SKU', rule: 'Unique, alphanumeric', channel: 'All' }
                  ].map((validation, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white text-theme-sm">
                          {validation.field}
                        </div>
                        <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                          {validation.rule}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                          {validation.channel}
                        </span>
                        <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" defaultChecked />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <Label>Custom Validation Rule</Label>
                  <textarea
                    className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    placeholder="if (price < cost * 1.1) then error('Price too low')"
                    rows={3}
                  />
                </div>
              </div>

              {/* Channel Compliance */}
              <div className="space-y-4">
                <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
                  Channel Compliance Requirements
                </h3>

                {[
                  { 
                    channel: 'Amazon', 
                    requirements: ['UPC/EAN required', 'Category approval needed', 'Image > 1000px'],
                    color: 'orange'
                  },
                  { 
                    channel: 'eBay', 
                    requirements: ['PayPal required', 'Return policy mandatory', 'Item specifics'],
                    color: 'blue'
                  },
                  { 
                    channel: 'Shopify', 
                    requirements: ['SEO title < 70 chars', 'Alt text required', 'Meta description'],
                    color: 'green'
                  }
                ].map((compliance) => (
                  <div key={compliance.channel} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-medium text-gray-900 dark:text-white">{compliance.channel}</span>
                      <span className={
                        compliance.color === 'orange' 
                          ? `text-xs bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-1 rounded`
                          : compliance.color === 'blue'
                          ? `text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded`
                          : `text-xs bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-2 py-1 rounded`
                      }>
                        Compliance Check
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {compliance.requirements.map((req, index) => (
                        <label key={index} className="flex items-center gap-2">
                          <input type="checkbox" className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" defaultChecked />
                          <span className="text-theme-sm text-gray-900 dark:text-white">{req}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h4 className="text-theme-sm font-medium text-yellow-900 dark:text-yellow-300 mb-2">
                    ⚠️ Validation Actions
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="validation-action" className="text-brand-600 focus:ring-brand-500" defaultChecked />
                      <span className="text-theme-sm text-yellow-800 dark:text-yellow-400">Block sync on validation error</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="validation-action" className="text-brand-600 focus:ring-brand-500" />
                      <span className="text-theme-sm text-yellow-800 dark:text-yellow-400">Warn but allow sync</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="validation-action" className="text-brand-600 focus:ring-brand-500" />
                      <span className="text-theme-sm text-yellow-800 dark:text-yellow-400">Auto-fix when possible</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };


  return (
    <div className="space-y-6">
      {/* Advanced Builder Header */}
      <div className="text-center space-y-3 pb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium">
          <span className="w-2 h-2 bg-purple-600 rounded-full"></span>
          Advanced Template Builder
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {template ? 'Edit Advanced Template' : 'Create Advanced Template'}
        </h1>
        <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Build complex templates with advanced field mappings, transformations, and custom rules. 
          This tool provides maximum flexibility for power users who need complete control over their channel integrations.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          {currentWizardSteps.map((step, index) => (
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
              {index < currentWizardSteps.length - 1 && (
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
            {currentWizardSteps[currentStep].title}
          </h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
            {currentWizardSteps[currentStep].description}
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
          {currentStep < currentWizardSteps.length - 1 ? (
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