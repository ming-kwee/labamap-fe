"use client";

import React, { useState } from 'react';
import type { ValidationRule, ValidationOperator, ValidationSeverity } from '@/types/businessRules';
import Button from '@/components/ui/button/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card/Card';

interface ValidationRuleBuilderProps {
  validationRules: ValidationRule[];
  onChange: (rules: ValidationRule[]) => void;
}

const ValidationRuleBuilder: React.FC<ValidationRuleBuilderProps> = ({
  validationRules,
  onChange,
}) => {
  const [newRule, setNewRule] = useState<ValidationRule>({
    field: '',
    operator: 'REQUIRED',
    value: '',
    message: '',
    severity: 'ERROR',
    errorCode: '',
  });

  const [isAdding, setIsAdding] = useState(false);

  const operators: ValidationOperator[] = [
    'REQUIRED',
    'NOT_NULL',
    'EQUALS',
    'NOT_EQUALS',
    'GREATER_THAN',
    'LESS_THAN',
    'GREATER_THAN_OR_EQUAL',
    'LESS_THAN_OR_EQUAL',
    'MIN_LENGTH',
    'MAX_LENGTH',
    'LENGTH_BETWEEN',
    'REGEX',
    'NOT_REGEX',
    'IN',
    'NOT_IN',
    'CONTAINS',
    'NOT_CONTAINS',
  ];

  const severities: ValidationSeverity[] = ['ERROR', 'WARNING', 'INFO'];

  const needsValue = (operator: ValidationOperator): boolean => {
    return !['REQUIRED', 'NOT_NULL'].includes(operator);
  };

  const handleAddRule = () => {
    if (!newRule.field.trim() || !newRule.message.trim()) {
      alert('Field and message are required');
      return;
    }

    if (needsValue(newRule.operator) && !newRule.value) {
      alert('Value is required for this operator');
      return;
    }

    onChange([...validationRules, { ...newRule }]);
    setNewRule({
      field: '',
      operator: 'REQUIRED',
      value: '',
      message: '',
      severity: 'ERROR',
      errorCode: '',
    });
    setIsAdding(false);
  };

  const handleRemoveRule = (index: number) => {
    onChange(validationRules.filter((_, i) => i !== index));
  };

  const formatOperator = (operator: ValidationOperator): string => {
    return operator.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Validation Rules</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Define field validation logic with operators and severity levels
            </p>
          </div>
          {!isAdding && (
            <Button type="button" onClick={() => setIsAdding(true)} variant="outline" size="sm">
              + Add Validation Rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Existing Rules */}
        {validationRules.length > 0 && (
          <div className="space-y-3 mb-6">
            {validationRules.map((rule, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-medium text-gray-900">{rule.field}</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                      {formatOperator(rule.operator)}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        rule.severity === 'ERROR'
                          ? 'bg-red-100 text-red-800'
                          : rule.severity === 'WARNING'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{rule.message}</p>
                  {rule.value && (
                    <p className="text-xs text-gray-500">
                      Value: <span className="font-mono">{JSON.stringify(rule.value)}</span>
                    </p>
                  )}
                  {rule.errorCode && (
                    <p className="text-xs text-gray-500">Error Code: {rule.errorCode}</p>
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
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
            <h4 className="font-semibold text-gray-900">Add Validation Rule</h4>

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
                  placeholder="price"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Operator
                </label>
                <select
                  value={newRule.operator}
                  onChange={(e) =>
                    setNewRule({ ...newRule, operator: e.target.value as ValidationOperator })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {formatOperator(op)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {needsValue(newRule.operator) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.value}
                  onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter value (numbers, strings, or arrays)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  For arrays, use comma-separated values. For numbers, enter numeric value.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Error Message <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newRule.message}
                onChange={(e) => setNewRule({ ...newRule, message: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Price must be greater than 0"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  value={newRule.severity}
                  onChange={(e) =>
                    setNewRule({ ...newRule, severity: e.target.value as ValidationSeverity })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {severities.map((sev) => (
                    <option key={sev} value={sev}>
                      {sev}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  ERROR blocks submission, WARNING allows with warning, INFO is informational
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Error Code (Optional)
                </label>
                <input
                  type="text"
                  value={newRule.errorCode}
                  onChange={(e) => setNewRule({ ...newRule, errorCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="PRICE_001"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewRule({
                    field: '',
                    operator: 'REQUIRED',
                    value: '',
                    message: '',
                    severity: 'ERROR',
                    errorCode: '',
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

        {validationRules.length === 0 && !isAdding && (
          <p className="text-gray-500 text-center py-8">
            No validation rules defined. Click &quot;Add Validation Rule&quot; to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ValidationRuleBuilder;
