"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon, ArrowRightIcon, CheckCircleIcon, InfoIcon, BoltIcon } from "@/icons";
import { ChannelTemplate, FieldMapping } from "./ChannelTemplateManager";

interface GuidedSetupWizardProps {
  onSave: (template: ChannelTemplate) => void;
  onCancel: () => void;
}

interface BusinessScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  suggestedChannels: string[];
  features: string[];
}

interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  requirements: string[];
  pros: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

const GuidedSetupWizard: React.FC<GuidedSetupWizardProps> = ({ onSave, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    scenario: '',
    templateName: '',
    selectedChannels: [] as string[],
    category: '',
    description: '',
    requirements: [] as string[],
    fieldMappings: {} as Record<string, string>
  });

  const businessScenarios: BusinessScenario[] = [
    {
      id: 'first-time-seller',
      title: 'First-Time Online Seller',
      description: 'I\'m new to selling online and want to start with one or two popular platforms.',
      category: 'Beginner',
      suggestedChannels: ['amazon', 'ebay'],
      features: ['Simple setup', 'Beginner-friendly', 'Built-in guidance']
    },
    {
      id: 'expand-business',
      title: 'Expanding Existing Business',
      description: 'I already sell products and want to expand to additional channels.',
      category: 'Growth',
      suggestedChannels: ['shopify', 'facebook', 'walmart'],
      features: ['Multi-channel sync', 'Business optimization', 'Advanced features']
    },
    {
      id: 'brand-manufacturer',
      title: 'Brand or Manufacturer',
      description: 'I manufacture or own a brand and want to control my online presence.',
      category: 'Brand',
      suggestedChannels: ['shopify', 'amazon', 'walmart'],
      features: ['Brand protection', 'Direct-to-consumer', 'Premium positioning']
    },
    {
      id: 'dropshipper',
      title: 'Dropshipping Business',
      description: 'I want to sell products without holding inventory using dropshipping.',
      category: 'Dropshipping',
      suggestedChannels: ['shopify', 'ebay', 'facebook'],
      features: ['Supplier integration', 'Automated fulfillment', 'Low startup cost']
    },
    {
      id: 'international-seller',
      title: 'International Expansion',
      description: 'I want to sell to customers in different countries and regions.',
      category: 'International',
      suggestedChannels: ['shopee', 'lazada', 'amazon'],
      features: ['Multi-language', 'Currency conversion', 'Regional optimization']
    },
    {
      id: 'niche-specialist',
      title: 'Niche Product Specialist',
      description: 'I sell specialized products for a specific audience or industry.',
      category: 'Specialized',
      suggestedChannels: ['etsy', 'shopify', 'facebook'],
      features: ['Targeted audience', 'Specialized features', 'Community focus']
    }
  ];

  const channelInfo: Record<string, ChannelInfo> = {
    amazon: {
      id: 'amazon',
      name: 'Amazon',
      description: 'World\'s largest marketplace with massive reach',
      requirements: ['Product photos', 'Detailed descriptions', 'Competitive pricing'],
      pros: ['Huge customer base', 'Fulfillment by Amazon', 'Trust and credibility'],
      difficulty: 'medium'
    },
    ebay: {
      id: 'ebay',
      name: 'eBay',
      description: 'Auction and fixed-price marketplace',
      requirements: ['Good seller rating', 'Clear return policy', 'Competitive shipping'],
      pros: ['Easy to start', 'Auction format', 'Global reach'],
      difficulty: 'easy'
    },
    shopify: {
      id: 'shopify',
      name: 'Shopify Store',
      description: 'Your own branded online store',
      requirements: ['Domain name', 'Brand assets', 'Payment setup'],
      pros: ['Full control', 'Brand building', 'No marketplace fees'],
      difficulty: 'medium'
    },
    walmart: {
      id: 'walmart',
      name: 'Walmart Marketplace',
      description: 'Major US retailer\'s online marketplace',
      requirements: ['US business entity', 'Quality standards', 'Fast shipping'],
      pros: ['Growing platform', 'Less competition', 'Trusted brand'],
      difficulty: 'hard'
    },
    facebook: {
      id: 'facebook',
      name: 'Facebook & Instagram',
      description: 'Social commerce platform',
      requirements: ['Facebook business page', 'Visual content', 'Social engagement'],
      pros: ['Social selling', 'Targeted ads', 'Visual products'],
      difficulty: 'easy'
    },
    shopee: {
      id: 'shopee',
      name: 'Shopee',
      description: 'Leading Southeast Asian marketplace',
      requirements: ['Regional presence', 'Local language', 'Mobile optimization'],
      pros: ['Growing market', 'Mobile-first', 'Regional focus'],
      difficulty: 'medium'
    },
    lazada: {
      id: 'lazada',
      name: 'Lazada',
      description: 'Major Southeast Asian e-commerce platform',
      requirements: ['Business registration', 'Local compliance', 'Quality standards'],
      pros: ['Established platform', 'Logistics support', 'Regional expertise'],
      difficulty: 'medium'
    },
    etsy: {
      id: 'etsy',
      name: 'Etsy',
      description: 'Marketplace for handmade and unique items',
      requirements: ['Unique products', 'Quality photos', 'Compelling stories'],
      pros: ['Niche audience', 'Handmade focus', 'Community feel'],
      difficulty: 'easy'
    }
  };

  const steps = [
    'Business Scenario',
    'Template Details', 
    'Channel Selection',
    'Field Configuration',
    'Review & Create'
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleScenarioSelect = (scenarioId: string) => {
    const scenario = businessScenarios.find(s => s.id === scenarioId);
    if (scenario) {
      setFormData({
        ...formData,
        scenario: scenarioId,
        category: scenario.category,
        selectedChannels: scenario.suggestedChannels,
        templateName: `${scenario.title} Template`,
        description: `Template optimized for ${scenario.description.toLowerCase()}`
      });
    }
  };

  const handleChannelToggle = (channelId: string) => {
    const updatedChannels = formData.selectedChannels.includes(channelId)
      ? formData.selectedChannels.filter(c => c !== channelId)
      : [...formData.selectedChannels, channelId];
    
    setFormData({ ...formData, selectedChannels: updatedChannels });
  };

  const handleFieldMapping = (masterField: string, channelField: string) => {
    setFormData({
      ...formData,
      fieldMappings: {
        ...formData.fieldMappings,
        [masterField]: channelField
      }
    });
  };

  const handleFinish = () => {
    const fieldMappings: FieldMapping[] = Object.entries(formData.fieldMappings).map(([masterField, channelField]) => ({
      masterField,
      channelMappings: formData.selectedChannels.map(channelId => ({
        channelId,
        fieldName: channelField,
        maxLength: getFieldMaxLength(channelId, channelField)
      })),
      transformationRules: [
        { type: 'seo-optimize', params: { platforms: formData.selectedChannels } }
      ],
      priority: 1,
      required: true
    }));

    const template: ChannelTemplate = {
      id: `guided-${Date.now()}`,
      name: formData.templateName,
      type: 'field-mapping',
      category: formData.category,
      targetChannels: formData.selectedChannels,
      description: formData.description,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      usageCount: 0,
      fieldMappings
    };

    onSave(template);
  };

  const getFieldMaxLength = (channelId: string, fieldName: string): number | undefined => {
    const limits: Record<string, Record<string, number>> = {
      amazon: { title: 200, description: 2000 },
      ebay: { title: 80, description: 1000 },
      shopify: { title: 255, description: 5000 }
    };
    return limits[channelId]?.[fieldName];
  };

  const selectedScenario = businessScenarios.find(s => s.id === formData.scenario);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Business Scenario
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                What describes your business best?
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                This helps us recommend the right channels and settings for your needs.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {businessScenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  onClick={() => handleScenarioSelect(scenario.id)}
                  className={`relative bg-white dark:bg-gray-800 rounded-lg border-2 p-6 cursor-pointer hover:shadow-md transition-all ${
                    formData.scenario === scenario.id
                      ? 'border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  {formData.scenario === scenario.id && (
                    <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full p-1">
                      <CheckCircleIcon className="w-4 h-4" />
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {scenario.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        {scenario.description}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Recommended channels:</div>
                      <div className="flex flex-wrap gap-1">
                        {scenario.suggestedChannels.map((channel) => (
                          <span key={channel} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">
                            {channelInfo[channel]?.name || channel}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 1: // Template Details
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Template Configuration
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Customize your template name and description
              </p>
            </div>

            {selectedScenario && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <BoltIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">
                      Selected: {selectedScenario.title}
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-200 mt-1">
                      {selectedScenario.description}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={formData.templateName}
                  onChange={(e) => setFormData({ ...formData, templateName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter a name for your template"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Describe what this template is for"
                />
              </div>
            </div>
          </div>
        );

      case 2: // Channel Selection
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Select Your Sales Channels
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Choose which platforms you want to sell on. You can always add more later.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(channelInfo).map((channel) => (
                <div
                  key={channel.id}
                  onClick={() => handleChannelToggle(channel.id)}
                  className={`relative bg-white dark:bg-gray-800 rounded-lg border-2 p-4 cursor-pointer hover:shadow-md transition-all ${
                    formData.selectedChannels.includes(channel.id)
                      ? 'border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  {formData.selectedChannels.includes(channel.id) && (
                    <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full p-1">
                      <CheckCircleIcon className="w-4 h-4" />
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {channel.name}
                      </h3>
                      <span className={`px-2 py-1 text-xs rounded ${
                        channel.difficulty === 'easy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        channel.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                        {channel.difficulty}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {channel.description}
                    </p>
                    
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Key Benefits:</div>
                      <ul className="space-y-1">
                        {channel.pros.slice(0, 2).map((pro, index) => (
                          <li key={index} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <div className="w-1 h-1 bg-green-500 rounded-full" />
                            {pro}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 3: // Field Configuration
        const commonFields = ['product_name', 'description', 'price', 'category', 'brand'];
        
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Configure Field Mappings
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Tell us how to map your product information to each channel
              </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-3">
                <InfoIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900 dark:text-yellow-100">
                    Field Mapping Explained
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-200 mt-1">
                    Each channel may use different field names. We&apos;ll help you map your product data to the right fields for each platform.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {commonFields.map((field) => (
                <div key={field} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900 dark:text-white capitalize">
                      {field.replace('_', ' ')}
                    </h4>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Required</span>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-600 dark:text-gray-300">
                      Map to channel field:
                    </label>
                    <select
                      value={formData.fieldMappings[field] || ''}
                      onChange={(e) => handleFieldMapping(field, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">Select field mapping...</option>
                      <option value="title">Title</option>
                      <option value="name">Name</option>
                      <option value="description">Description</option>
                      <option value="short_description">Short Description</option>
                      <option value="price">Price</option>
                      <option value="category">Category</option>
                      <option value="brand">Brand</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 4: // Review & Create
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Review Your Template
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                Everything looks good? Your template is ready to create.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Template Details</h3>
                <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <div><strong>Name:</strong> {formData.templateName}</div>
                  <div><strong>Category:</strong> {formData.category}</div>
                  <div><strong>Scenario:</strong> {selectedScenario?.title}</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Selected Channels</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.selectedChannels.map((channelId) => (
                    <span
                      key={channelId}
                      className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded"
                    >
                      {channelInfo[channelId]?.name || channelId}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Field Mappings</h3>
                <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  {Object.entries(formData.fieldMappings).map(([masterField, channelField]) => (
                    <div key={masterField}>
                      <strong>{masterField.replace('_', ' ')}:</strong> → {channelField}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isStepComplete = () => {
    switch (currentStep) {
      case 0: return !!formData.scenario;
      case 1: return !!(formData.templateName && formData.description);
      case 2: return formData.selectedChannels.length > 0;
      case 3: return Object.keys(formData.fieldMappings).length > 0;
      case 4: return true;
      default: return false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Guided Template Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep]}
          </p>
        </div>
        
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="min-h-[400px]">
        {renderStepContent()}
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="flex items-center gap-2"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Previous
        </Button>
        
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Step {currentStep + 1} of {steps.length}
        </div>

        {currentStep < steps.length - 1 ? (
          <Button
            onClick={handleNext}
            disabled={!isStepComplete()}
            className="flex items-center gap-2"
          >
            Next
            <ArrowRightIcon className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            disabled={!isStepComplete()}
            className="flex items-center gap-2"
          >
            Create Template
            <CheckCircleIcon className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default GuidedSetupWizard;