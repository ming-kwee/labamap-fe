"use client";
import React, { useState, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField, 
  ConditionalConfig,
  ConditionalRule,
  ConditionExpression,
  OperatorType 
} from "../types/ComplexMapping";

interface ConditionalBuilderProps {
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}

const operators: { value: OperatorType; label: string; dataTypes: string[] }[] = [
  { value: 'equals', label: 'Equals (=)', dataTypes: ['string', 'number', 'boolean'] },
  { value: 'not_equals', label: 'Not Equals (≠)', dataTypes: ['string', 'number', 'boolean'] },
  { value: 'greater_than', label: 'Greater Than (>)', dataTypes: ['number', 'date'] },
  { value: 'less_than', label: 'Less Than (<)', dataTypes: ['number', 'date'] },
  { value: 'contains', label: 'Contains', dataTypes: ['string', 'array'] },
  { value: 'starts_with', label: 'Starts With', dataTypes: ['string'] },
  { value: 'ends_with', label: 'Ends With', dataTypes: ['string'] },
  { value: 'regex', label: 'Matches Regex', dataTypes: ['string'] }
];

const ConditionalBuilder: React.FC<ConditionalBuilderProps> = ({
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel,
  initialMapping
}) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [targetField, setTargetField] = useState(initialMapping?.targetField.fieldPath || '');
  
  const [rules, setRules] = useState<ConditionalRule[]>(
    initialMapping?.transformation.conditional?.rules || [
      {
        id: '1',
        condition: {
          field: '',
          operator: 'equals',
          value: '',
          dataType: 'string'
        },
        mapping: {
          sourceField: ''
        },
        priority: 1
      }
    ]
  );
  
  const [defaultMapping, setDefaultMapping] = useState(
    initialMapping?.transformation.conditional?.defaultMapping || { sourceField: '' }
  );
  
  const [fallbackValue, setFallbackValue] = useState<string>(
    String(initialMapping?.transformation.conditional?.fallbackValue || '')
  );

  const addRule = useCallback(() => {
    const newRule: ConditionalRule = {
      id: Date.now().toString(),
      condition: {
        field: '',
        operator: 'equals',
        value: '',
        dataType: 'string'
      },
      mapping: {
        sourceField: ''
      },
      priority: rules.length + 1
    };
    setRules(prev => [...prev, newRule]);
  }, [rules.length]);

  const removeRule = useCallback((ruleId: string) => {
    setRules(prev => prev.filter(rule => rule.id !== ruleId));
  }, []);

  const updateRule = useCallback((ruleId: string, updates: Partial<ConditionalRule>) => {
    setRules(prev => prev.map(rule => 
      rule.id === ruleId ? { ...rule, ...updates } : rule
    ));
  }, []);

  const updateCondition = useCallback((ruleId: string, updates: Partial<ConditionExpression>) => {
    setRules(prev => prev.map(rule => 
      rule.id === ruleId 
        ? { ...rule, condition: { ...rule.condition, ...updates } }
        : rule
    ));
  }, []);

  const handleSave = () => {
    const selectedTargetField = availableTargetFields.find(f => f.fieldPath === targetField)!;
    const usedSourceFields = [
      ...rules.map(r => r.mapping.sourceField).filter(Boolean),
      defaultMapping.sourceField
    ].filter(Boolean);
    
    const selectedSourceFields = usedSourceFields
      .map(fieldPath => availableSourceFields.find(f => f.fieldPath === fieldPath))
      .filter(Boolean) as SourceField[];

    const conditionalConfig: ConditionalConfig = {
      rules: rules.filter(r => r.condition.field && r.mapping.sourceField),
      defaultMapping,
      fallbackValue: fallbackValue || undefined
    };

    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'conditional',
      priority: 1,
      enabled: true,
      sourceFields: selectedSourceFields,
      targetField: selectedTargetField,
      transformation: {
        type: 'conditional',
        conditional: conditionalConfig
      }
    };

    onSave(mapping);
  };

  const getPreviewResult = () => {
    const sampleData: Record<string, unknown> = {
      'masterAttributes.price': 299.99,
      'masterAttributes.category': 'Electronics',
      'masterAttributes.brand': 'AudioTech',
      'variantData.inventory': 50,
      'variantData.isOnSale': true,
      'variantData.weight': 0.8
    };

    // Check each rule in priority order
    for (const rule of rules.sort((a, b) => a.priority - b.priority)) {
      if (!rule.condition.field || !rule.mapping.sourceField) continue;
      
      const conditionValue = sampleData[rule.condition.field];
      const ruleValue = rule.condition.value;
      
      let conditionMet = false;
      
      switch (rule.condition.operator) {
        case 'equals':
          conditionMet = conditionValue === ruleValue;
          break;
        case 'not_equals':
          conditionMet = conditionValue !== ruleValue;
          break;
        case 'greater_than':
          conditionMet = Number(conditionValue) > Number(ruleValue);
          break;
        case 'less_than':
          conditionMet = Number(conditionValue) < Number(ruleValue);
          break;
        case 'contains':
          conditionMet = String(conditionValue).includes(String(ruleValue));
          break;
        case 'starts_with':
          conditionMet = String(conditionValue).startsWith(String(ruleValue));
          break;
        case 'ends_with':
          conditionMet = String(conditionValue).endsWith(String(ruleValue));
          break;
      }
      
      if (conditionMet) {
        let resultValue: unknown;
        
        if (rule.mapping.computationType === 'formula' && rule.mapping.computationFormula) {
          // Mathematical computation (eBay pricing style)
          try {
            let formula = rule.mapping.computationFormula;
            // Replace field references with actual values
            const fieldReferences = formula.match(/[a-zA-Z_][a-zA-Z0-9_.]*\b/g) || [];
            fieldReferences.forEach(fieldRef => {
              const value = sampleData[fieldRef] || sampleData[`masterAttributes.${fieldRef}`] || sampleData[`pricingData.${fieldRef}`];
              if (value !== undefined) {
                formula = formula.replace(new RegExp(`\\b${fieldRef}\\b`, 'g'), String(value));
              }
            });
            
            // Simple evaluation (unsafe for production, but fine for preview)
            resultValue = eval(formula);
            if (isNaN(Number(resultValue))) {
              resultValue = `Formula error: ${rule.mapping.computationFormula}`;
            }
          } catch {
            resultValue = `Invalid formula: ${rule.mapping.computationFormula}`;
          }
        } else {
          resultValue = rule.mapping.staticValue || sampleData[rule.mapping.sourceField || ''];
        }
        
        return {
          matched: true,
          rule: rule,
          condition: `${rule.condition.field} ${rule.condition.operator} ${rule.condition.value}`,
          result: resultValue
        };
      }
    }
    
    // No rules matched, use default
    const defaultValue = defaultMapping.staticValue || sampleData[defaultMapping.sourceField || ''];
    return {
      matched: false,
      rule: null,
      condition: 'No conditions matched',
      result: defaultValue || fallbackValue
    };
  };

  const getAvailableOperators = (dataType: string) => {
    return operators.filter(op => op.dataTypes.includes(dataType));
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          Conditional Field Mapping
        </h4>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Map fields based on conditions and business rules. Rules are evaluated in priority order.
        </p>
      </div>

      {/* Basic Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Mapping Name</Label>
          <Input
            type="text"
            defaultValue={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Price Display Logic"
          />
        </div>
        
        <div>
          <Label>Target Field</Label>
          <select
            defaultValue={targetField}
            onChange={(e) => setTargetField(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Select target field</option>
            {availableTargetFields.map((field) => (
              <option key={field.fieldPath} value={field.fieldPath}>
                {field.displayName} ({field.dataType})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <textarea
          defaultValue={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the conditional logic..."
          className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          rows={2}
        />
      </div>

      {/* Conditional Rules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label>Conditional Rules</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addRule}
          >
            + Add Rule
          </Button>
        </div>

        <div className="space-y-4">
          {rules.map((rule, index) => (
            <div key={rule.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded text-theme-xs font-medium">
                    Rule {index + 1}
                  </span>
                  <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                    Priority: {rule.priority}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeRule(rule.id)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  🗑️
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Condition Configuration */}
                <div className="space-y-4">
                  <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white">
                    Condition
                  </h5>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Field to Check</Label>
                      <select
                        value={rule.condition.field}
                        onChange={(e) => {
                          const field = availableSourceFields.find(f => f.fieldPath === e.target.value);
                          updateCondition(rule.id, { 
                            field: e.target.value,
                            dataType: field?.dataType || 'string'
                          });
                        }}
                        className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">Select field</option>
                        {availableSourceFields.map((field) => (
                          <option key={field.fieldPath} value={field.fieldPath}>
                            {field.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label>Operator</Label>
                      <select
                        value={rule.condition.operator}
                        onChange={(e) => updateCondition(rule.id, { operator: e.target.value as OperatorType })}
                        className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                      >
                        {getAvailableOperators(rule.condition.dataType).map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label>Comparison Value</Label>
                    <Input
                      type={rule.condition.dataType === 'number' ? 'number' : 'text'}
                      defaultValue={String(rule.condition.value)}
                      onChange={(e) => updateCondition(rule.id, { 
                        value: rule.condition.dataType === 'number' ? parseFloat(e.target.value) : e.target.value 
                      })}
                      placeholder="Value to compare against"
                    />
                  </div>
                </div>

                {/* Mapping Configuration */}
                <div className="space-y-4">
                  <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white">
                    Result Mapping
                  </h5>
                  
                  <div>
                    <Label>Mapping Type</Label>
                    <select
                      value={rule.mapping.computationType || 'simple'}
                      onChange={(e) => {
                        const type = e.target.value as 'simple' | 'formula';
                        updateRule(rule.id, { 
                          mapping: { 
                            ...rule.mapping, 
                            computationType: type,
                            sourceField: type === 'simple' ? rule.mapping.sourceField : undefined,
                            computationFormula: type === 'formula' ? rule.mapping.computationFormula : undefined
                          }
                        });
                      }}
                      className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="simple">Source Field / Static Value</option>
                      <option value="formula">Mathematical Formula</option>
                    </select>
                  </div>
                  
                  {rule.mapping.computationType === 'formula' ? (
                    <div className="md:col-span-2">
                      <Label>Mathematical Formula (eBay Pricing Style)</Label>
                      <Input
                        type="text"
                        defaultValue={rule.mapping.computationFormula || ''}
                        onChange={(e) => updateRule(rule.id, { 
                          mapping: { ...rule.mapping, computationFormula: e.target.value }
                        })}
                        placeholder="e.g., price * 0.95, cost * markup / 100"
                      />
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                        Use field names like: price, cost, compare_at_price. Example: price * 0.95 for 5% discount
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>Source Field (when condition is true)</Label>
                        <select
                          value={rule.mapping.sourceField || ''}
                          onChange={(e) => updateRule(rule.id, { 
                            mapping: { ...rule.mapping, sourceField: e.target.value, staticValue: undefined }
                          })}
                          className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                        >
                          <option value="">Select source field</option>
                          {availableSourceFields.map((field) => (
                            <option key={field.fieldPath} value={field.fieldPath}>
                              {field.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <Label>Or Static Value</Label>
                        <Input
                          type="text"
                          defaultValue={String(rule.mapping.staticValue || '')}
                          onChange={(e) => updateRule(rule.id, { 
                            mapping: { ...rule.mapping, staticValue: e.target.value, sourceField: undefined }
                          })}
                          placeholder="Fixed value to use"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      defaultValue={rule.priority.toString()}
                      onChange={(e) => updateRule(rule.id, { priority: parseInt(e.target.value) || 1 })}
                      min="1"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default Mapping */}
      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
          Default Mapping (when no conditions match)
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Default Source Field</Label>
            <select
              value={defaultMapping.sourceField || ''}
              onChange={(e) => setDefaultMapping({ ...defaultMapping, sourceField: e.target.value, staticValue: undefined })}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Select source field</option>
              {availableSourceFields.map((field) => (
                <option key={field.fieldPath} value={field.fieldPath}>
                  {field.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Or Fallback Value</Label>
            <Input
              type="text"
              defaultValue={fallbackValue || ''}
              onChange={(e) => {
                setFallbackValue(e.target.value);
                setDefaultMapping({ ...defaultMapping, staticValue: e.target.value, sourceField: undefined });
              }}
              placeholder="Value when nothing matches"
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h5 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-3">
          Logic Preview
        </h5>
        
        <div className="space-y-3">
          <div className="text-theme-sm">
            <span className="font-medium text-blue-900 dark:text-blue-300">Sample Data:</span>
            <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded p-3 mt-1">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-theme-xs">
                <div>Price: $299.99</div>
                <div>Category: Electronics</div>
                <div>Brand: AudioTech</div>
                <div>Inventory: 50</div>
                <div>On Sale: true</div>
                <div>Weight: 0.8</div>
              </div>
            </div>
          </div>
          
          <div className="text-theme-sm">
            <span className="font-medium text-blue-900 dark:text-blue-300">Result:</span>
            <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded p-3 mt-1">
              {(() => {
                const preview = getPreviewResult();
                return (
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      Value: &quot;{String(preview.result)}&quot;
                    </div>
                    <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                      {preview.matched ? `✅ Matched: ${preview.condition}` : '❌ No conditions matched, using default'}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          disabled={!name || !targetField || rules.every(r => !r.condition.field || !r.mapping.sourceField)}
        >
          Save Mapping
        </Button>
      </div>
    </div>
  );
};

export default ConditionalBuilder;