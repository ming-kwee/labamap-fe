"use client";

import React, { useState } from 'react';
import type { EnhancementRule, EnhancementType } from '@/types/businessRules';
import Button from '@/shared/ui/button/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/ui/card/Card';

interface EnhancementRuleBuilderProps {
  enhancementRules: EnhancementRule[];
  onChange: (rules: EnhancementRule[]) => void;
}

const EnhancementRuleBuilder: React.FC<EnhancementRuleBuilderProps> = ({
  enhancementRules,
  onChange,
}) => {
  const [newRule, setNewRule] = useState<EnhancementRule>({
    field: '',
    enhancement: 'AUTO_GENERATE_TAGS',
    source: '',
    parameters: {},
  });

  const [isAdding, setIsAdding] = useState(false);
  const [paramKey, setParamKey] = useState('');
  const [paramValue, setParamValue] = useState('');

  const enhancements: EnhancementType[] = [
    'AUTO_GENERATE_TAGS',
    'ADD_CATEGORY_HIERARCHY',
    'ENRICH_FROM_BARCODE',
    'SUGGEST_PRICING',
    'IMAGE_ANALYSIS',
    'SEO_OPTIMIZATION',
  ];

  const getEnhancementDescription = (enhancement: EnhancementType): string => {
    switch (enhancement) {
      case 'AUTO_GENERATE_TAGS':
        return 'Generate tags from product data using AI';
      case 'ADD_CATEGORY_HIERARCHY':
        return 'Add parent/child category data';
      case 'ENRICH_FROM_BARCODE':
        return 'Fetch product data from barcode lookup';
      case 'SUGGEST_PRICING':
        return 'AI-based pricing suggestions';
      case 'IMAGE_ANALYSIS':
        return 'Extract attributes from product images';
      case 'SEO_OPTIMIZATION':
        return 'Generate SEO-friendly descriptions';
      default:
        return '';
    }
  };

  const getDefaultSource = (enhancement: EnhancementType): string => {
    switch (enhancement) {
      case 'AUTO_GENERATE_TAGS':
        return 'ai_tagging_service';
      case 'ADD_CATEGORY_HIERARCHY':
        return 'category_service';
      case 'ENRICH_FROM_BARCODE':
        return 'barcode_lookup_service';
      case 'SUGGEST_PRICING':
        return 'pricing_ai_service';
      case 'IMAGE_ANALYSIS':
        return 'image_ai_service';
      case 'SEO_OPTIMIZATION':
        return 'seo_ai_service';
      default:
        return '';
    }
  };

  const getParameterSuggestions = (enhancement: EnhancementType): string => {
    switch (enhancement) {
      case 'AUTO_GENERATE_TAGS':
        return 'maxTags: 10, minConfidence: 0.8';
      case 'SUGGEST_PRICING':
        return 'comparisonCount: 5, priceRangePercent: 20';
      case 'IMAGE_ANALYSIS':
        return 'minConfidence: 0.7, extractColors: true';
      case 'SEO_OPTIMIZATION':
        return 'maxKeywords: 5, descriptionLength: 160';
      default:
        return '';
    }
  };

  const handleAddParameter = () => {
    if (!paramKey.trim() || !paramValue.trim()) {
      alert('Both parameter key and value are required');
      return;
    }

    // Try to parse value as number if possible
    let parsedValue: any = paramValue.trim();
    if (!isNaN(Number(parsedValue))) {
      parsedValue = Number(parsedValue);
    } else if (parsedValue === 'true' || parsedValue === 'false') {
      parsedValue = parsedValue === 'true';
    }

    setNewRule({
      ...newRule,
      parameters: {
        ...newRule.parameters,
        [paramKey.trim()]: parsedValue,
      },
    });
    setParamKey('');
    setParamValue('');
  };

  const handleRemoveParameter = (key: string) => {
    const { [key]: removed, ...rest } = newRule.parameters || {};
    setNewRule({ ...newRule, parameters: rest });
  };

  const handleAddRule = () => {
    if (!newRule.field.trim()) {
      alert('Field is required');
      return;
    }

    onChange([...enhancementRules, { ...newRule }]);
    setNewRule({
      field: '',
      enhancement: 'AUTO_GENERATE_TAGS',
      source: '',
      parameters: {},
    });
    setIsAdding(false);
  };

  const handleRemoveRule = (index: number) => {
    onChange(enhancementRules.filter((_, i) => i !== index));
  };

  const formatEnhancement = (enhancement: EnhancementType): string => {
    return enhancement.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Enhancement Rules</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Define AI-powered data enrichment and enhancement logic
            </p>
          </div>
          {!isAdding && (
            <Button type="button" onClick={() => setIsAdding(true)} variant="outline" size="sm">
              + Add Enhancement Rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Existing Rules */}
        {enhancementRules.length > 0 && (
          <div className="space-y-3 mb-6">
            {enhancementRules.map((rule, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-medium text-gray-900">{rule.field}</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">
                      {formatEnhancement(rule.enhancement)}
                    </span>
                  </div>
                  {rule.source && (
                    <p className="text-xs text-gray-600 mb-1">
                      <span className="font-medium">Source:</span> {rule.source}
                    </p>
                  )}
                  {rule.parameters && Object.keys(rule.parameters).length > 0 && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Parameters:</span>
                      <div className="ml-2 mt-1 space-y-1">
                        {Object.entries(rule.parameters).map(([key, value]) => (
                          <div key={key} className="font-mono">
                            {key}: {JSON.stringify(value)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => handleRemoveRule(index)}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Rule Form */}
        {isAdding && (
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
            <h4 className="font-semibold text-gray-900">Add Enhancement Rule</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.field}
                  onChange={(e) => setNewRule({ ...newRule, field: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tags, description, images..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enhancement
                </label>
                <select
                  value={newRule.enhancement}
                  onChange={(e) => {
                    const enhancement = e.target.value as EnhancementType;
                    setNewRule({
                      ...newRule,
                      enhancement,
                      source: getDefaultSource(enhancement),
                      parameters: {},
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {enhancements.map((e) => (
                    <option key={e} value={e}>
                      {formatEnhancement(e)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {getEnhancementDescription(newRule.enhancement)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Service (Optional)
              </label>
              <input
                type="text"
                value={newRule.source}
                onChange={(e) => setNewRule({ ...newRule, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={getDefaultSource(newRule.enhancement)}
              />
              <p className="text-xs text-gray-500 mt-1">
                The service or API to use for this enhancement
              </p>
            </div>

            {/* Parameters Section */}
            <div className="bg-white p-3 rounded border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parameters (Optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Suggested: {getParameterSuggestions(newRule.enhancement) || 'No common parameters'}
              </p>

              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={paramKey}
                  onChange={(e) => setParamKey(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Parameter key"
                />
                <input
                  type="text"
                  value={paramValue}
                  onChange={(e) => setParamValue(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Parameter value"
                />
                <Button type="button" onClick={handleAddParameter} variant="outline" size="sm">
                  Add
                </Button>
              </div>

              {newRule.parameters && Object.keys(newRule.parameters).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(newRule.parameters).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <span className="text-sm font-mono">
                        {key}: {JSON.stringify(value)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveParameter(key)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewRule({
                    field: '',
                    enhancement: 'AUTO_GENERATE_TAGS',
                    source: '',
                    parameters: {},
                  });
                }}
                variant="outline"
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleAddRule}>
                Add Rule
              </Button>
            </div>
          </div>
        )}

        {enhancementRules.length === 0 && !isAdding && (
          <p className="text-gray-500 text-center py-8">
            No enhancement rules defined. Click &quot;Add Enhancement Rule&quot; to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default EnhancementRuleBuilder;
