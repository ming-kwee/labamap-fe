"use client";
import React, { useState } from "react";
import Button from "@/shared/ui/button/Button";
import TemplateCreationWizard from "./TemplateCreationWizard";
import TemplatesList from "./TemplatesList";
import TemplatePreview from "./TemplatePreview";
import TemplateEntrySelector, { TemplateCreationPath } from "./TemplateEntrySelector";
import QuickStartTemplateSelector from "./QuickStartTemplateSelector";

// Template interfaces
export interface ChannelTemplate {
  id: string;
  name: string;
  type: 'advanced-builder';
  category: string;
  targetChannels: string[];
  description: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  usageCount: number;
  
  // Field mapping configuration
  fieldMappings?: FieldMapping[];
  
  // Advanced complex mappings
  complexMappings?: import('./types/ComplexMapping').ComplexFieldMapping[];
  
  // Content generation rules
  contentRules?: ContentRule[];
  
  // AI Settings for content generation
  aiSettings?: {
    keywords?: string;
    template?: string;
    enhancementLevel?: string;
    contentTone?: string;
  };
  
  // Validation rules
  validationRules?: ValidationRule[];
  
  // Pricing strategies
  pricingRules?: PricingRule[];
}

export interface FieldMapping {
  masterField: string;
  channelMappings: ChannelFieldMapping[];
  transformationRules: TransformationRule[];
  priority: number;
  required: boolean;
}

export interface ChannelFieldMapping {
  channelId: string;
  fieldName: string;
  maxLength?: number;
  format?: string;
  prefix?: string;
  suffix?: string;
}

export interface TransformationRule {
  type: 'truncate' | 'prefix' | 'suffix' | 'replace' | 'format' | 'seo-optimize' | 'validate';
  params: Record<string, unknown>;
  condition?: string;
}

export interface ContentRule {
  field: string;
  template: string;
  aiEnhanced: boolean;
  variables: string[];
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'length' | 'pattern' | 'custom';
  params: Record<string, unknown>;
  errorMessage: string;
}

export interface PricingRule {
  channel: string;
  strategy: 'markup' | 'competitive' | 'fixed' | 'dynamic';
  params: Record<string, unknown>;
}

const ChannelTemplateManager: React.FC = () => {
  const [view, setView] = useState<'list' | 'entry-selector' | 'quick-start' | 'advanced-builder' | 'preview'>('list');
  const [selectedTemplate, setSelectedTemplate] = useState<ChannelTemplate | null>(null);
  const [templates, setTemplates] = useState<ChannelTemplate[]>([]);

  // Mock templates data
  const mockTemplates: ChannelTemplate[] = [
    {
      id: 'tpl-1',
      name: 'Amazon Electronics Optimization',
      type: 'field-mapping',
      category: 'Electronics',
      targetChannels: ['amazon', 'ebay', 'walmart'],
      description: 'Optimized mapping for electronic products with SEO enhancement',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-02-01'),
      isActive: true,
      usageCount: 145,
      fieldMappings: [
        {
          masterField: 'product_name',
          channelMappings: [
            { channelId: 'amazon', fieldName: 'title', maxLength: 200 },
            { channelId: 'ebay', fieldName: 'item_title', maxLength: 80 },
            { channelId: 'walmart', fieldName: 'name', maxLength: 75 }
          ],
          transformationRules: [
            { type: 'prefix', params: { value: '[BRAND] ' } },
            { type: 'seo-optimize', params: { keywords: ['electronics', 'tech'] } }
          ],
          priority: 1,
          required: true
        }
      ]
    },
    {
      id: 'tpl-2',
      name: 'Fashion Category Mapping',
      type: 'category-mapping',
      category: 'Fashion',
      targetChannels: ['shopify', 'facebook', 'instagram'],
      description: 'Complete category mapping for fashion items with size variations',
      createdAt: new Date('2024-01-20'),
      updatedAt: new Date('2024-01-25'),
      isActive: true,
      usageCount: 89
    },
    {
      id: 'tpl-3',
      name: 'AI Content Generator',
      type: 'content-generation',
      category: 'General',
      targetChannels: ['shopee', 'lazada', 'tokopedia'],
      description: 'AI-powered content generation for Southeast Asian markets',
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-10'),
      isActive: true,
      usageCount: 234
    }
  ];

  React.useEffect(() => {
    setTemplates(mockTemplates);
  }, []);

  const handleCreateTemplate = () => {
    setView('entry-selector');
    setSelectedTemplate(null);
  };

  const handleSelectCreationPath = (path: TemplateCreationPath) => {
    setSelectedTemplate(null);
    switch (path) {
      case 'quick-start':
        setView('quick-start');
        break;
      case 'advanced-builder':
        setView('advanced-builder');
        break;
    }
  };

  const handleBackToEntrySelector = () => {
    setView('entry-selector');
    setSelectedTemplate(null);
  };

  const handleViewTemplate = (template: ChannelTemplate) => {
    setSelectedTemplate(template);
    setView('preview');
  };

  const handleEditTemplate = (template: ChannelTemplate) => {
    setSelectedTemplate(template);
    setView('advanced-builder');
  };

  const handleSaveTemplate = (template: ChannelTemplate) => {
    if (selectedTemplate) {
      // Update existing template
      setTemplates(prev => prev.map(t => t.id === template.id ? template : t));
    } else {
      // Create new template
      template.id = `tpl-${Date.now()}`;
      template.createdAt = new Date();
      template.updatedAt = new Date();
      template.usageCount = 0;
      setTemplates(prev => [template, ...prev]);
    }
    setView('list');
    setSelectedTemplate(null);
  };

  const handleDeleteTemplate = (templateId: string) => {
    setTemplates(prev => prev.filter(t => t.id !== templateId));
  };

  const handleCloneTemplate = (template: ChannelTemplate) => {
    const clonedTemplate: ChannelTemplate = {
      ...template,
      id: `tpl-${Date.now()}`,
      name: `${template.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0
    };
    setTemplates(prev => [clonedTemplate, ...prev]);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {view !== 'list' && (
            <Button
              variant="outline"
              onClick={() => {
                setView('list');
                setSelectedTemplate(null);
              }}
            >
              ← Back to Templates
            </Button>
          )}
          
          <div className="flex items-center gap-2">
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">
              {view === 'list' ? 'Template Library' : 
               view === 'entry-selector' ? 'Choose Creation Method' :
               view === 'quick-start' ? 'Quick Start Templates' :
               view === 'advanced-builder' ? (selectedTemplate ? 'Edit Template' : 'Advanced Template Builder') : 
               'Template Preview'}
            </span>
          </div>
        </div>

        {view === 'list' && (
          <div className="flex items-center gap-3">
            <Button variant="outline">
              Import Templates
            </Button>
            <Button onClick={handleCreateTemplate}>
              + Create Template
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {view === 'list' && (
        <TemplatesList
          templates={templates}
          onView={handleViewTemplate}
          onEdit={handleEditTemplate}
          onDelete={handleDeleteTemplate}
          onClone={handleCloneTemplate}
        />
      )}

      {view === 'entry-selector' && (
        <TemplateEntrySelector onSelectPath={handleSelectCreationPath} />
      )}

      {view === 'quick-start' && (
        <QuickStartTemplateSelector
          onSelectTemplate={handleSaveTemplate}
          onBack={handleBackToEntrySelector}
        />
      )}


      {view === 'advanced-builder' && (
        <TemplateCreationWizard
          template={selectedTemplate}
          onSave={handleSaveTemplate}
          onCancel={() => {
            setView('list');
            setSelectedTemplate(null);
          }}
        />
      )}

      {view === 'preview' && selectedTemplate && (
        <TemplatePreview
          template={selectedTemplate}
          onEdit={() => handleEditTemplate(selectedTemplate)}
          onClose={() => setView('list')}
        />
      )}
    </div>
  );
};

export default ChannelTemplateManager;