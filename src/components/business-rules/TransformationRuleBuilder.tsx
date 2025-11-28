"use client";

import React, { useState } from 'react';
import type { TransformationRule, TransformationType } from '@/types/businessRules';
import Button from '@/components/ui/button/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card/Card';

interface TransformationRuleBuilderProps {
  transformationRules: TransformationRule[];
  onChange: (rules: TransformationRule[]) => void;
}

const TransformationRuleBuilder: React.FC<TransformationRuleBuilderProps> = ({
  transformationRules,
  onChange,
}) => {
  const [newRule, setNewRule] = useState<TransformationRule>({
    field: '',
    transformation: 'UPPERCASE',
    order: transformationRules.length + 1,
    parameters: {},
  });

  const [isAdding, setIsAdding] = useState(false);
  const [paramKey, setParamKey] = useState('');
  const [paramValue, setParamValue] = useState('');

  const transformations: TransformationType[] = [
    'UPPERCASE',
    'LOWERCASE',
    'CAPITALIZE',
    'TRIM',
    'TRIM_START',
    'TRIM_END',
    'ROUND',
    'FORMAT_DATE',
    'REMOVE_SPECIAL_CHARS',
    'REPLACE',
    'CONCATENATE',
  ];

  const needsParameters = (transformation: TransformationType): boolean => {
    return ['ROUND', 'FORMAT_DATE', 'REPLACE', 'CONCATENATE'].includes(transformation);
  };

  const getParameterHint = (transformation: TransformationType): string => {
    switch (transformation) {
      case 'ROUND':
        return 'Add "decimals" parameter (e.g., decimals: 2)';
      case 'FORMAT_DATE':
        return 'Add "format" parameter (e.g., format: yyyy-MM-dd)';
      case 'REPLACE':
        return 'Add "pattern" and "replacement" parameters';
      case 'CONCATENATE':
        return 'Add "fields" (comma-separated) and "separator" parameters';
      default:
        return '';
    }
  };

  const handleAddParameter = () => {
    if (!paramKey.trim() || !paramValue.trim()) {
      alert('Both parameter key and value are required');
      return;
    }

    setNewRule({
      ...newRule,
      parameters: {
        ...newRule.parameters,
        [paramKey.trim()]: paramValue.trim(),
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

    if (needsParameters(newRule.transformation) && Object.keys(newRule.parameters || {}).length === 0) {
      alert(`Parameters are required for ${newRule.transformation} transformation`);
      return;
    }

    onChange([...transformationRules, { ...newRule }]);
    setNewRule({
      field: '',
      transformation: 'UPPERCASE',
      order: transformationRules.length + 2,
      parameters: {},
    });
    setIsAdding(false);
  };

  const handleRemoveRule = (index: number) => {
    onChange(transformationRules.filter((_, i) => i !== index));
  };

  const formatTransformation = (transformation: TransformationType): string => {
    return transformation.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Transformation Rules</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Define data transformation logic to modify field values
            </p>
          </div>
          {!isAdding && (
            <Button type="button" onClick={() => setIsAdding(true)} variant="outline" size="sm">
              + Add Transformation Rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Existing Rules */}
        {transformationRules.length > 0 && (
          <div className="space-y-3 mb-6">
            {transformationRules.map((rule, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-medium text-gray-900">{rule.field}</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                      {formatTransformation(rule.transformation)}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                      Order: {rule.order}
                    </span>
                  </div>
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
          <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-4">
            <h4 className="font-semibold text-gray-900">Add Transformation Rule</h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.field}
                  onChange={(e) => setNewRule({ ...newRule, field: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sku"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transformation
                </label>
                <select
                  value={newRule.transformation}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      transformation: e.target.value as TransformationType,
                      parameters: {},
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {transformations.map((t) => (
                    <option key={t} value={t}>
                      {formatTransformation(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Execution Order
                </label>
                <input
                  type="number"
                  value={newRule.order}
                  onChange={(e) => setNewRule({ ...newRule, order: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
            </div>

            {/* Parameters Section */}
            {needsParameters(newRule.transformation) && (
              <div className="bg-white p-3 rounded border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parameters <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">{getParameterHint(newRule.transformation)}</p>

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
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewRule({
                    field: '',
                    transformation: 'UPPERCASE',
                    order: transformationRules.length + 1,
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

        {transformationRules.length === 0 && !isAdding && (
          <p className="text-gray-500 text-center py-8">
            No transformation rules defined. Click &quot;Add Transformation Rule&quot; to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default TransformationRuleBuilder;
