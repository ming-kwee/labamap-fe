"use client";
import React, { useState } from "react";
import Button from "@/shared/ui/button/Button";
import { ChannelTemplate } from "./ChannelTemplateManager";

interface TemplatesListProps {
  templates: ChannelTemplate[];
  onView: (template: ChannelTemplate) => void;
  onEdit: (template: ChannelTemplate) => void;
  onDelete: (templateId: string) => void;
  onClone: (template: ChannelTemplate) => void;
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
  'field-mapping': 'Field Mapping',
  'content-generation': 'Content Generation',
  'category-mapping': 'Category Mapping',
  'pricing-strategy': 'Pricing Strategy',
  'validation-rules': 'Validation Rules',
  'complete-channel': 'Complete Channel'
};

const TemplatesList: React.FC<TemplatesListProps> = ({
  templates,
  onView,
  onEdit,
  onDelete,
  onClone
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'usage' | 'updated'>('updated');

  const filteredTemplates = templates
    .filter(template => {
      const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          template.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || template.type === filterType;
      const matchesCategory = filterCategory === 'all' || template.category === filterCategory;
      return matchesSearch && matchesType && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'usage':
          return b.usageCount - a.usageCount;
        case 'updated':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default:
          return 0;
      }
    });

  const categories = [...new Set(templates.map(t => t.category))];
  const templateTypes = [...new Set(templates.map(t => t.type))];

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Templates
            </label>
            <input
              type="text"
              placeholder="Search by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            />
          </div>

          <div>
            <label className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="all">All Types</option>
              {templateTypes.map(type => (
                <option key={type} value={type}>
                  {templateTypeNames[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'usage' | 'updated')}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="updated">Last Updated</option>
              <option value="name">Name</option>
              <option value="usage">Usage Count</option>
            </select>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">📊</span>
            </div>
            <div>
              <div className="text-title-md font-semibold text-gray-900 dark:text-white">
                {filteredTemplates.length}
              </div>
              <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                Total Templates
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">✅</span>
            </div>
            <div>
              <div className="text-title-md font-semibold text-gray-900 dark:text-white">
                {filteredTemplates.filter(t => t.isActive).length}
              </div>
              <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                Active Templates
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">🎯</span>
            </div>
            <div>
              <div className="text-title-md font-semibold text-gray-900 dark:text-white">
                {categories.length}
              </div>
              <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                Categories
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">📈</span>
            </div>
            <div>
              <div className="text-title-md font-semibold text-gray-900 dark:text-white">
                {filteredTemplates.reduce((sum, t) => sum + t.usageCount, 0)}
              </div>
              <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                Total Usage
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
          >
            {/* Template Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                    <span className="text-lg">{templateTypeIcons[template.type]}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-title-sm">
                      {template.name}
                    </h3>
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                      {templateTypeNames[template.type]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    template.isActive ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {template.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <p className="text-theme-sm text-gray-600 dark:text-gray-400 mb-4">
                {template.description}
              </p>

              {/* Template Details */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Category
                  </span>
                  <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                    {template.category}
                  </div>
                </div>
                <div>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Usage Count
                  </span>
                  <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                    {template.usageCount}
                  </div>
                </div>
              </div>

              {/* Target Channels */}
              <div>
                <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                  Target Channels
                </span>
                <div className="flex flex-wrap gap-1">
                  {template.targetChannels.slice(0, 3).map((channelId) => (
                    <span
                      key={channelId}
                      className="px-2 py-1 bg-brand-100 text-brand-800 dark:bg-brand-900/20 dark:text-brand-400 rounded text-theme-xs"
                    >
                      {channelId}
                    </span>
                  ))}
                  {template.targetChannels.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded text-theme-xs">
                      +{template.targetChannels.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Template Actions */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center justify-between text-theme-xs text-gray-500 dark:text-gray-400 mb-3">
                <span>Updated {template.updatedAt.toLocaleDateString()}</span>
                <span>Created {template.createdAt.toLocaleDateString()}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onView(template)}
                  className="flex-1"
                >
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(template)}
                  className="flex-1"
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onClone(template)}
                  className="px-3"
                >
                  📋
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(template.id)}
                  className="px-3 text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  🗑️
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-title-md font-medium text-gray-900 dark:text-white mb-2">
            No templates found
          </h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Try adjusting your filters or create a new template
          </p>
        </div>
      )}
    </div>
  );
};

export default TemplatesList;