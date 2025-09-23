"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { ChannelTemplate } from "./ChannelTemplateManager";

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

const templateTypes = [
  {
    id: 'field-mapping',
    title: 'Field Mapping Template',
    description: 'Map master product fields to channel-specific fields',
    icon: '🎯'
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
  const [formData, setFormData] = useState<Partial<ChannelTemplate>>({
    name: template?.name || '',
    type: template?.type || 'field-mapping',
    category: template?.category || '',
    targetChannels: template?.targetChannels || [],
    description: template?.description || '',
    isActive: template?.isActive ?? true,
    fieldMappings: template?.fieldMappings || []
  });

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
      fieldMappings: formData.fieldMappings
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
                  className={`p-6 rounded-lg border-2 transition-all text-left ${
                    formData.type === type.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-3xl mb-3">{type.icon}</div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                    {type.title}
                  </h3>
                  <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                    {type.description}
                  </p>
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
                MASTER FIELD MAPPING
              </h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                Configure how master product fields map to channel-specific fields
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Master Fields */}
                <div>
                  <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Master Product Fields
                  </h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {masterFields.map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            defaultChecked={field.required}
                            className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                          />
                          <span className="text-theme-sm font-medium text-gray-900 dark:text-white">
                            {field.name}
                          </span>
                          {field.required && (
                            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 rounded-full">
                              Required
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {field.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Channel Mapping Rules */}
                <div>
                  <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
                    Channel Mapping Rules
                  </h3>
                  <div className="space-y-4">
                    {formData.targetChannels?.slice(0, 3).map((channelId) => {
                      const channel = availableChannels.find(c => c.id === channelId);
                      return (
                        <div key={channelId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">{channel?.icon}</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {channel?.name}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="text-theme-sm">
                              <span className="text-gray-500 dark:text-gray-400">Title:</span>
                              <span className="ml-2 text-gray-900 dark:text-white">
                                {channelId === 'amazon' ? 'Title (200)' :
                                 channelId === 'ebay' ? 'Item Title (80)' :
                                 channelId === 'walmart' ? 'Name (75)' :
                                 'Title (150)'}
                              </span>
                            </div>
                            <div className="text-theme-sm">
                              <span className="text-gray-500 dark:text-gray-400">Description:</span>
                              <span className="ml-2 text-gray-900 dark:text-white">
                                Description ({channelId === 'amazon' ? '2000' : '500'})
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h4 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                        🎨 Transformation Rules
                      </h4>
                      <div className="space-y-1 text-theme-xs text-blue-800 dark:text-blue-400">
                        <div>• Add brand prefix</div>
                        <div>• Truncate with &quot;...&quot;</div>
                        <div>• SEO keyword injection</div>
                        <div>• Character validation</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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