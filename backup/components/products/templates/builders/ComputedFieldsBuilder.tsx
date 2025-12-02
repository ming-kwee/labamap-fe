"use client";
import React, { useState, useCallback, useMemo } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField, 
  ComputationConfig,
  ComputationVariable,
  ComputationFunction 
} from "../types/ComplexMapping";

interface ComputedFieldsBuilderProps {
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}

const builtInFunctions: ComputationFunction[] = [
  {
    name: 'round',
    definition: 'Math.round(value)',
    parameters: ['value'],
    returnType: 'number'
  },
  {
    name: 'ceil',
    definition: 'Math.ceil(value)',
    parameters: ['value'],
    returnType: 'number'
  },
  {
    name: 'floor',
    definition: 'Math.floor(value)',
    parameters: ['value'],
    returnType: 'number'
  },
  {
    name: 'abs',
    definition: 'Math.abs(value)',
    parameters: ['value'],
    returnType: 'number'
  },
  {
    name: 'min',
    definition: 'Math.min(...values)',
    parameters: ['...values'],
    returnType: 'number'
  },
  {
    name: 'max',
    definition: 'Math.max(...values)',
    parameters: ['...values'],
    returnType: 'number'
  },
  {
    name: 'length',
    definition: 'value.length',
    parameters: ['value'],
    returnType: 'number'
  },
  {
    name: 'uppercase',
    definition: 'String(value).toUpperCase()',
    parameters: ['value'],
    returnType: 'string'
  },
  {
    name: 'lowercase',
    definition: 'String(value).toLowerCase()',
    parameters: ['value'],
    returnType: 'string'
  }
];

const formulaExamples = [
  {
    name: 'Shipping Weight',
    formula: '{weight} + {packagingWeight}',
    description: 'Product weight plus packaging'
  },
  {
    name: 'Volume',
    formula: '{length} * {width} * {height}',
    description: 'Calculate volume from dimensions'
  },
  {
    name: 'Discounted Price',
    formula: '{price} * (1 - {discountPercent} / 100)',
    description: 'Apply percentage discount'
  },
  {
    name: 'Shipping Cost',
    formula: 'round({weight} * 2.5 + ({length} + {width} + {height}) * 0.1)',
    description: 'Weight-based shipping with dimension surcharge'
  },
  {
    name: 'Profit Margin',
    formula: '({price} - {cost}) / {price} * 100',
    description: 'Calculate profit margin percentage'
  }
];

const ComputedFieldsBuilder: React.FC<ComputedFieldsBuilderProps> = ({
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel,
  initialMapping
}) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [targetField, setTargetField] = useState(initialMapping?.targetField.fieldPath || '');
  const [formula, setFormula] = useState(initialMapping?.transformation.computation?.formula || '');
  const [outputDataType, setOutputDataType] = useState(initialMapping?.transformation.computation?.outputDataType || 'number');
  const [precision, setPrecision] = useState(initialMapping?.transformation.computation?.precision || 2);
  const [units, setUnits] = useState(initialMapping?.transformation.computation?.units || '');
  
  const [variables, setVariables] = useState<ComputationVariable[]>(
    initialMapping?.transformation.computation?.variables || []
  );

  const addVariable = useCallback(() => {
    const newVariable: ComputationVariable = {
      name: '',
      sourceField: '',
      dataType: 'number',
      defaultValue: 0
    };
    setVariables(prev => [...prev, newVariable]);
  }, []);

  const removeVariable = useCallback((index: number) => {
    setVariables(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateVariable = useCallback((index: number, updates: Partial<ComputationVariable>) => {
    setVariables(prev => prev.map((variable, i) => 
      i === index ? { ...variable, ...updates } : variable
    ));
  }, []);

  const insertFormulaExample = useCallback((exampleFormula: string) => {
    setFormula(exampleFormula);
  }, []);

  const insertVariable = useCallback((variableName: string) => {
    setFormula(prev => prev + `{${variableName}}`);
  }, []);

  const insertFunction = useCallback((functionName: string) => {
    setFormula(prev => prev + `${functionName}()`);
  }, []);

  // Extract variables from formula
  const extractedVariables = useMemo(() => {
    const matches = formula.match(/\{([^}]+)\}/g);
    return matches ? matches.map(match => match.slice(1, -1)) : [];
  }, [formula]);

  // Validate formula
  const validateFormula = useMemo(() => {
    try {
      // Check if all variables in formula are defined
      const undefinedVars = extractedVariables.filter(varName => 
        !variables.some(v => v.name === varName)
      );
      
      if (undefinedVars.length > 0) {
        return {
          valid: false,
          error: `Undefined variables: ${undefinedVars.join(', ')}`
        };
      }

      // Basic syntax validation (simplified)
      const testFormula = formula.replace(/\{([^}]+)\}/g, '1');
      new Function('return ' + testFormula);
      
      return { valid: true, error: null };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid formula syntax'
      };
    }
  }, [formula, extractedVariables, variables]);

  const calculatePreview = useCallback(() => {
    const sampleData: Record<string, number> = {
      'weight': 0.8,
      'length': 10,
      'width': 5,
      'height': 3,
      'price': 299.99,
      'cost': 150.00,
      'discountPercent': 15,
      'packagingWeight': 0.2
    };

    try {
      let evaluationFormula = formula;
      
      // Replace variables with sample values
      variables.forEach(variable => {
        const value = sampleData[variable.name] || variable.defaultValue || 0;
        evaluationFormula = evaluationFormula.replace(
          new RegExp(`\\{${variable.name}\\}`, 'g'),
          String(value)
        );
      });

      // Replace built-in functions with JavaScript equivalents
      builtInFunctions.forEach(func => {
        evaluationFormula = evaluationFormula.replace(
          new RegExp(`\\b${func.name}\\(`, 'g'),
          `Math.${func.name}(`
        );
      });

      // Evaluate the formula
      const result = new Function('return ' + evaluationFormula)();
      
      return {
        success: true,
        result: outputDataType === 'number' ? Number(result).toFixed(precision) : String(result),
        formula: evaluationFormula
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Calculation error',
        result: null
      };
    }
  }, [formula, variables, outputDataType, precision]);

  const handleSave = () => {
    const selectedTargetField = availableTargetFields.find(f => f.fieldPath === targetField)!;
    const selectedSourceFields = variables
      .map(v => availableSourceFields.find(f => f.fieldPath === v.sourceField))
      .filter(Boolean) as SourceField[];

    const computationConfig: ComputationConfig = {
      formula,
      variables: variables.filter(v => v.name && v.sourceField),
      functions: builtInFunctions,
      outputDataType,
      precision: outputDataType === 'number' ? precision : undefined,
      units: units || undefined
    };

    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'computed',
      priority: 1,
      enabled: true,
      sourceFields: selectedSourceFields,
      targetField: selectedTargetField,
      transformation: {
        type: 'computed',
        computation: computationConfig
      }
    };

    onSave(mapping);
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          Computed Fields Builder
        </h4>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Create calculated values using mathematical formulas and functions.
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
            placeholder="e.g., Shipping Weight Calculator"
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
          placeholder="Describe what this computation does..."
          className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          rows={2}
        />
      </div>

      {/* Formula Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label>Formula</Label>
            <textarea
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g., {weight} * {length} * {width}"
              className={`h-24 w-full rounded-md border px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:bg-gray-900 ${
                validateFormula.valid 
                  ? 'border-gray-300 dark:border-gray-700' 
                  : 'border-red-300 dark:border-red-700'
              }`}
              rows={3}
            />
            {!validateFormula.valid && (
              <p className="text-theme-xs text-red-600 dark:text-red-400 mt-1">
                {validateFormula.error}
              </p>
            )}
            <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
              Use {`{variableName}`} for variables and standard math operators (+, -, *, /, %)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Output Type</Label>
              <select
                value={outputDataType}
                onChange={(e) => setOutputDataType(e.target.value as any)}
                className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="number">Number</option>
                <option value="string">String</option>
                <option value="boolean">Boolean</option>
                <option value="currency">Currency</option>
              </select>
            </div>

            {outputDataType === 'number' && (
              <div>
                <Label>Decimal Places</Label>
                <Input
                  type="number"
                  defaultValue={precision.toString()}
                  onChange={(e) => setPrecision(parseInt(e.target.value) || 2)}
                  min="0"
                  max="10"
                />
              </div>
            )}

            <div>
              <Label>Units</Label>
              <Input
                type="text"
                defaultValue={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder="e.g., kg, lbs, %"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Formula Examples</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {formulaExamples.map((example, index) => (
                <button
                  key={index}
                  onClick={() => insertFormulaExample(example.formula)}
                  className="w-full text-left p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
                >
                  <div className="font-medium text-gray-900 dark:text-white text-theme-sm">
                    {example.name}
                  </div>
                  <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                    {example.description}
                  </div>
                  <div className="text-theme-xs font-mono text-blue-600 dark:text-blue-400 mt-1">
                    {example.formula}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Variables Configuration */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label>Variables</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addVariable}
          >
            + Add Variable
          </Button>
        </div>

        <div className="space-y-3">
          {variables.map((variable, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div>
                  <Label>Variable Name</Label>
                  <Input
                    type="text"
                    defaultValue={variable.name}
                    onChange={(e) => updateVariable(index, { name: e.target.value })}
                    placeholder="e.g., weight"
                  />
                </div>

                <div>
                  <Label>Source Field</Label>
                  <select
                    value={variable.sourceField}
                    onChange={(e) => updateVariable(index, { sourceField: e.target.value })}
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
                  <Label>Data Type</Label>
                  <select
                    value={variable.dataType}
                    onChange={(e) => updateVariable(index, { dataType: e.target.value as any })}
                    className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="number">Number</option>
                    <option value="string">String</option>
                    <option value="boolean">Boolean</option>
                  </select>
                </div>

                <div>
                  <Label>Default Value</Label>
                  <Input
                    type={variable.dataType === 'number' ? 'number' : 'text'}
                    defaultValue={String(variable.defaultValue || '')}
                    onChange={(e) => updateVariable(index, { 
                      defaultValue: variable.dataType === 'number' ? parseFloat(e.target.value) : e.target.value 
                    })}
                    placeholder="Fallback value"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable(variable.name)}
                    disabled={!variable.name}
                  >
                    Insert
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeVariable(index)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {extractedVariables.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h5 className="text-theme-sm font-medium text-yellow-900 dark:text-yellow-300 mb-2">
                Variables in Formula
              </h5>
              <div className="flex flex-wrap gap-2">
                {extractedVariables.map((varName, index) => {
                  const isDefined = variables.some(v => v.name === varName);
                  return (
                    <span
                      key={index}
                      className={`px-2 py-1 text-xs rounded-full ${
                        isDefined 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      }`}
                    >
                      {varName} {isDefined ? '✓' : '✗'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Built-in Functions */}
      <div>
        <Label>Available Functions</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
          {builtInFunctions.map((func) => (
            <button
              key={func.name}
              onClick={() => insertFunction(func.name)}
              className="p-2 border border-gray-200 dark:border-gray-700 rounded text-theme-sm hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
            >
              {func.name}()
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
          Calculation Preview
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Sample Input Values
            </span>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 mt-1">
              <div className="grid grid-cols-2 gap-2 text-theme-xs">
                <div>weight: 0.8</div>
                <div>length: 10</div>
                <div>width: 5</div>
                <div>height: 3</div>
                <div>price: $299.99</div>
                <div>cost: $150.00</div>
              </div>
            </div>
          </div>
          
          <div>
            <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Calculated Result
            </span>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 mt-1">
              {(() => {
                const preview = calculatePreview();
                return (
                  <div>
                    {preview.success ? (
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {preview.result} {units}
                        </div>
                        <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                          Formula: {preview.formula}
                        </div>
                      </div>
                    ) : (
                      <div className="text-red-600 dark:text-red-400">
                        Error: {preview.error}
                      </div>
                    )}
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
          disabled={!name || !targetField || !formula || !validateFormula.valid || variables.length === 0}
        >
          Save Mapping
        </Button>
      </div>
    </div>
  );
};

export default ComputedFieldsBuilder;