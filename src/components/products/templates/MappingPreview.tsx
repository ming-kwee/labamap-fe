"use client";
import React, { useState, useMemo } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField 
} from "./types/ComplexMapping";

interface MappingPreviewProps {
  mapping: ComplexFieldMapping;
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onEdit?: () => void;
  onDelete?: () => void;
  onTest?: (mapping: ComplexFieldMapping, testData: Record<string, unknown>) => void;
}

const MappingPreview: React.FC<MappingPreviewProps> = ({
  mapping,
  availableTargetFields,
  onEdit,
  onDelete,
  onTest
}) => {
  const [testData, setTestData] = useState<Record<string, unknown>>({
    'masterAttributes.brand': 'AudioTech',
    'masterAttributes.product_name': 'Premium Wireless Headphones',
    'masterAttributes.sku': 'AT-WH-001',
    'masterAttributes.price': 299.99,
    'masterAttributes.description': 'High-quality wireless headphones with noise cancellation',
    'masterAttributes.dimensions': '20x15x8 cm',
    'variantData.color': 'Black',
    'variantData.size': 'Standard',
    'variantData.weight': '350g',
    'variantData.features': ['Noise Cancelling', 'Bluetooth 5.0', 'Fast Charging'],
    'categoryData.main_category': 'Electronics',
    'categoryData.sub_category': 'Audio',
    'pricingData.cost': 150.00,
    'pricingData.markup': 100
  });

  const [customTestData, setCustomTestData] = useState('');
  const [useCustomData, setUseCustomData] = useState(false);

  const getMappingTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'simple': 'Simple 1:1 Mapping',
      'many-to-one': 'Many-to-One (Concatenation)',
      'one-to-many': 'One-to-Many (Decomposition)',
      'conditional': 'Conditional Mapping',
      'computed': 'Computed Field',
      'structural': 'Structural Transformation',
      'templated': 'Template-Based'
    };
    return labels[type] || type;
  };

  const getSourceFieldsInfo = () => {
    return mapping.sourceFields.map(field => ({
      ...field,
      currentValue: testData[field.fieldPath]
    }));
  };

  const getTargetFieldInfo = () => {
    const targetField = availableTargetFields.find(f => f.fieldPath === mapping.targetField.fieldPath);
    return targetField;
  };

  const simulateTransformation = useMemo(() => {
    try {
      const currentTestData = useCustomData && customTestData ? JSON.parse(customTestData) : testData;
      
      switch (mapping.type) {
        case 'simple':
          const sourceField = mapping.sourceFields[0];
          return currentTestData[sourceField?.fieldPath] || '{no value}';

        case 'many-to-one':
          if (mapping.transformation.concatenation) {
            const config = mapping.transformation.concatenation;
            
            if (config.template) {
              // Template-based concatenation
              let result = config.template;
              config.fields.forEach(field => {
                if (field.sourceField) {
                  const value = currentTestData[field.sourceField] || `{${field.sourceField}}`;
                  const processedValue = field.prefix ? `${field.prefix}${value}` : value;
                  const finalValue = field.suffix ? `${processedValue}${field.suffix}` : processedValue;
                  result = result.replace(new RegExp(`\\{${field.sourceField}\\}`, 'g'), finalValue);
                }
              });
              return result;
            } else {
              // Separator-based concatenation
              const values = config.fields
                .filter(field => field.sourceField)
                .map(field => {
                  let value = currentTestData[field.sourceField] || `{${field.sourceField}}`;
                  if (field.prefix) value = `${field.prefix}${value}`;
                  if (field.suffix) value = `${value}${field.suffix}`;
                  return value;
                })
                .filter(Boolean);
              return values.join(config.separator);
            }
          }
          return 'No concatenation config';

        case 'one-to-many':
          if (mapping.transformation.decomposition) {
            const config = mapping.transformation.decomposition;
            const sourceValue = String(currentTestData[mapping.sourceFields[0]?.fieldPath] || '');
            
            switch (config.method) {
              case 'split':
                return sourceValue ? sourceValue.split(config.delimiter || ',') : [];
              case 'regex':
                if (config.regexPattern) {
                  const matches = sourceValue ? sourceValue.match(new RegExp(config.regexPattern, 'g')) : null;
                  return matches || [];
                }
                return [];
              default:
                return [sourceValue];
            }
          }
          return 'No decomposition config';

        case 'conditional':
          if (mapping.transformation.conditional) {
            const config = mapping.transformation.conditional;
            
            for (const rule of config.rules) {
              const fieldValue = currentTestData[rule.condition.field];
              let conditionMet = false;
              
              switch (rule.condition.operator) {
                case 'equals':
                  conditionMet = fieldValue == rule.condition.value;
                  break;
                case 'not_equals':
                  conditionMet = fieldValue != rule.condition.value;
                  break;
                case 'greater_than':
                  conditionMet = Number(fieldValue) > Number(rule.condition.value);
                  break;
                case 'less_than':
                  conditionMet = Number(fieldValue) < Number(rule.condition.value);
                  break;
                case 'contains':
                  conditionMet = String(fieldValue).includes(String(rule.condition.value));
                  break;
                case 'regex':
                  conditionMet = new RegExp(String(rule.condition.value)).test(String(fieldValue));
                  break;
                default:
                  conditionMet = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
                  break;
              }
              
              if (conditionMet) {
                return rule.mapping.staticValue || currentTestData[rule.mapping.sourceField!] || '{no value}';
              }
            }
            
            return config.defaultMapping?.staticValue || 
                   (config.defaultMapping?.sourceField ? currentTestData[config.defaultMapping.sourceField] : null) || 
                   config.fallbackValue || 
                   '{no match}';
          }
          return 'No conditional config';

        case 'computed':
          if (mapping.transformation.computation) {
            const config = mapping.transformation.computation;
            
            try {
              // Extract variables from formula
              const variables = config.formula.match(/\b[a-zA-Z_][a-zA-Z0-9_.]*\b/g) || [];
              let formula = config.formula;
              
              // Replace variables with actual values
              variables.forEach(variable => {
                if (currentTestData[variable] !== undefined) {
                  formula = formula.replace(new RegExp(`\\b${variable}\\b`, 'g'), String(currentTestData[variable]));
                }
              });
              
              // Simple evaluation (unsafe for production, but fine for preview)
              const result = eval(formula);
              return isNaN(result) ? 'Invalid calculation' : result;
            } catch {
              return 'Formula error';
            }
          }
          return 'No computation config';

        case 'templated':
          if (mapping.transformation.template) {
            const config = mapping.transformation.template;
            
            // Block-based template system (from TemplateBuilder)
            if (config.blocks) {
              let result = '';
              
              config.blocks.forEach(block => {
                switch (block.type) {
                  case 'text':
                    result += block.content || '';
                    break;
                    
                  case 'variable':
                    if (block.variable) {
                      const value = currentTestData[block.variable];
                      result += value !== undefined ? String(value) : `{${block.variable}}`;
                    }
                    break;
                    
                  case 'conditional':
                    if (block.condition) {
                      const fieldValue = currentTestData[block.condition.field];
                      let conditionMet = false;
                      
                      switch (block.condition.operator) {
                        case 'equals':
                          conditionMet = fieldValue == block.condition.value;
                          break;
                        case 'not_equals':
                          conditionMet = fieldValue != block.condition.value;
                          break;
                        case 'contains':
                          conditionMet = String(fieldValue).includes(block.condition.value);
                          break;
                        case 'exists':
                          conditionMet = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
                          break;
                      }
                      
                      result += conditionMet ? block.condition.trueTemplate : block.condition.falseTemplate;
                    }
                    break;
                    
                  case 'loop':
                    if (block.loop && Array.isArray(currentTestData[block.loop.field])) {
                      const items = (currentTestData[block.loop.field] as unknown[]).map((item: unknown) => 
                        block.loop!.itemTemplate.replace(/\{item\}/g, String(item))
                      );
                      result += items.join(block.loop.separator);
                    }
                    break;
                }
              });
              
              if (config.trimWhitespace) {
                result = result.trim();
              }
              
              return result;
            }
            
            // Simple template variable replacement
            if (config.template && config.variables) {
              let result = config.template;
              config.variables.forEach(variable => {
                const value = currentTestData[variable.sourceField];
                const placeholder = `{${variable.name}}`;
                const replacement = value !== undefined ? String(value) : `{${variable.name}}`;
                result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), replacement);
              });
              return result;
            }
            
            return config.template || 'Empty template';
          }
          return 'No template config';

        default:
          return 'Unknown mapping type';
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }, [mapping, testData, customTestData, useCustomData]);

  const handleTestDataChange = (field: string, value: unknown) => {
    setTestData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRunTest = () => {
    if (onTest) {
      const currentTestData = useCustomData && customTestData ? JSON.parse(customTestData) : testData;
      onTest(mapping, currentTestData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-title-md font-semibold text-gray-900 dark:text-white">
            {mapping.name}
          </h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-1">
            {getMappingTypeLabel(mapping.type)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" onClick={onDelete} className="text-red-600 hover:text-red-700 dark:text-red-400">
              Delete
            </Button>
          )}
        </div>
      </div>

      {mapping.description && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
          <p className="text-theme-sm text-gray-600 dark:text-gray-300">
            {mapping.description}
          </p>
        </div>
      )}

      {/* Mapping Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
            Source Fields ({mapping.sourceFields.length})
          </h4>
          <div className="space-y-2">
            {getSourceFieldsInfo().map((field, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
                <div className="flex items-center justify-between">
                  <span className="text-theme-sm font-medium text-gray-900 dark:text-white">
                    {field.displayName}
                  </span>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {field.dataType}
                  </span>
                </div>
                <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                  {field.fieldPath}
                </div>
                <div className="text-theme-sm text-gray-700 dark:text-gray-300 mt-1">
                  Current: {field.currentValue !== undefined ? String(field.currentValue) : 'No value'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
            Target Field
          </h4>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
            <div className="flex items-center justify-between">
              <span className="text-theme-sm font-medium text-gray-900 dark:text-white">
                {getTargetFieldInfo()?.displayName}
              </span>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400">
                {getTargetFieldInfo()?.dataType}
              </span>
            </div>
            <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
              {mapping.targetField.fieldPath}
            </div>
            {getTargetFieldInfo()?.maxLength && (
              <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                Max Length: {getTargetFieldInfo()?.maxLength}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test Data */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white">
            Test Data & Preview
          </h4>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useCustomData}
                onChange={(e) => setUseCustomData(e.target.checked)}
                className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
              />
              <span className="text-theme-sm text-gray-700 dark:text-gray-300">Use Custom JSON</span>
            </label>
          </div>
        </div>

        {useCustomData ? (
          <div className="space-y-4">
            <div>
              <Label>Custom Test Data (JSON)</Label>
              <textarea
                value={customTestData}
                onChange={(e) => setCustomTestData(e.target.value)}
                placeholder="Enter custom test data as JSON..."
                className="h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 font-mono"
                rows={8}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(testData).map(([field, value]) => (
              <div key={field}>
                <Label>{field}</Label>
                <input
                  type="text"
                  value={Array.isArray(value) ? JSON.stringify(value) : String(value)}
                  onChange={(e) => {
                    try {
                      const parsedValue = JSON.parse(e.target.value);
                      handleTestDataChange(field, parsedValue);
                    } catch {
                      handleTestDataChange(field, e.target.value);
                    }
                  }}
                  className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Preview */}
      <div>
        <h4 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
          Live Preview
        </h4>
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Transformed Output
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
            <pre className="text-theme-sm text-gray-900 dark:text-white whitespace-pre-wrap">
              {typeof simulateTransformation === 'object' 
                ? JSON.stringify(simulateTransformation, null, 2)
                : String(simulateTransformation)
              }
            </pre>
          </div>
          <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-2">
            Output Length: {String(simulateTransformation).length} characters
            {getTargetFieldInfo()?.maxLength && (
              <span className={String(simulateTransformation).length > getTargetFieldInfo()!.maxLength! ? ' text-red-500' : ''}>
                {' '} / {getTargetFieldInfo()?.maxLength} max
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Test Button */}
      {onTest && (
        <div className="flex justify-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={handleRunTest}>
            Run Full Test
          </Button>
        </div>
      )}
    </div>
  );
};

export default MappingPreview;