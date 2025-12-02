"use client";
import React, { useState, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField, 
  DecompositionConfig,
  DecompositionTarget 
} from "../types/ComplexMapping";

interface OneToManyBuilderProps {
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}

const OneToManyBuilder: React.FC<OneToManyBuilderProps> = ({
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel,
  initialMapping
}) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [sourceField, setSourceField] = useState(initialMapping?.sourceFields[0]?.fieldPath || '');
  
  const [decompositionMethod, setDecompositionMethod] = useState<'split' | 'extract' | 'parse' | 'regex' | 'object_properties'>(
    initialMapping?.transformation.decomposition?.method || 'split'
  );
  
  const [delimiter, setDelimiter] = useState(
    initialMapping?.transformation.decomposition?.delimiter || ','
  );
  
  const [regexPattern, setRegexPattern] = useState(
    initialMapping?.transformation.decomposition?.regexPattern || ''
  );
  
  const [parseFormat, setParseFormat] = useState<'json' | 'xml' | 'csv' | 'dimensions' | 'custom'>(
    initialMapping?.transformation.decomposition?.parseFormat || 'dimensions'
  );
  
  const [targets, setTargets] = useState<DecompositionTarget[]>(
    initialMapping?.transformation.decomposition?.targets || [
      { targetField: '', index: 0, fallback: '' }
    ]
  );
  
  // Object property mapping for complex objects like dimensions
  const [objectProperties, setObjectProperties] = useState<{[key: string]: string}>(
    initialMapping?.transformation.decomposition?.objectMapping?.properties || {
      'length': '',
      'width': '',
      'height': '',
      'unit': ''
    }
  );
  
  // Unit conversion parameters
  const [unitConversion, setUnitConversion] = useState({
    enabled: false,
    from: 'cm',
    to: 'in',
    applyCondition: 'channel_requires_inches'
  });

  const addTarget = useCallback(() => {
    setTargets(prev => [
      ...prev,
      { targetField: '', index: prev.length, fallback: '' }
    ]);
  }, []);

  const removeTarget = useCallback((index: number) => {
    setTargets(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateTarget = useCallback((index: number, target: Partial<DecompositionTarget>) => {
    setTargets(prev => prev.map((item, i) => 
      i === index ? { ...item, ...target } : item
    ));
  }, []);

  const handleSave = () => {
    const selectedSourceField = availableSourceFields.find(f => f.fieldPath === sourceField)!;
    
    const decompositionConfig: DecompositionConfig = {
      sourceField,
      method: decompositionMethod,
      targets: targets.filter(t => t.targetField),
      delimiter: decompositionMethod === 'split' ? delimiter : undefined,
      regexPattern: decompositionMethod === 'regex' ? regexPattern : undefined,
      parseFormat: decompositionMethod === 'parse' ? parseFormat : undefined
    };

    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'one-to-many',
      priority: 1,
      enabled: true,
      sourceFields: [selectedSourceField],
      targetField: availableTargetFields[0], // Placeholder, not used for one-to-many
      transformation: {
        type: 'one-to-many',
        decomposition: decompositionConfig
      }
    };

    onSave(mapping);
  };

  const getPreviewData = () => {
    const sampleData: Record<string, string> = {
      'masterAttributes.dimensions': '10 x 5 x 3 inches',
      'masterAttributes.features': 'Wireless, Noise Cancellation, 20hr Battery, Fast Charging',
      'masterAttributes.tags': 'electronics,audio,wireless,premium',
      'variantData.specifications': '{"weight": "250g", "color": "black", "material": "plastic"}'
    };

    const sourceValue = sampleData[sourceField] || `Sample data for ${sourceField}`;

    switch (decompositionMethod) {
      case 'split':
        return sourceValue.split(delimiter).map((value, index) => ({
          index,
          value: value.trim(),
          target: targets.find(t => t.index === index)?.targetField || 'Not mapped'
        }));

      case 'regex':
        if (!regexPattern) return [];
        try {
          const regex = new RegExp(regexPattern);
          const matches = sourceValue.match(regex);
          return matches ? matches.slice(1).map((value, index) => ({
            index,
            value,
            target: targets.find(t => t.regexGroup === `group${index + 1}`)?.targetField || 'Not mapped'
          })) : [];
        } catch {
          return [{ index: 0, value: 'Invalid regex pattern', target: 'Error' }];
        }

      case 'parse':
        if (parseFormat === 'dimensions') {
          const dimensionMatch = sourceValue.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
          return dimensionMatch ? [
            { index: 0, value: dimensionMatch[1], target: 'Length' },
            { index: 1, value: dimensionMatch[2], target: 'Width' },
            { index: 2, value: dimensionMatch[3], target: 'Height' }
          ] : [];
        }
        if (parseFormat === 'json') {
          try {
            const parsed = JSON.parse(sourceValue);
            return Object.entries(parsed).map(([key, value], index) => ({
              index,
              value: String(value),
              target: targets.find(t => t.key === key)?.targetField || 'Not mapped'
            }));
          } catch {
            return [{ index: 0, value: 'Invalid JSON', target: 'Error' }];
          }
        }
        return [];

      default:
        return [];
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          One-to-Many Field Mapping (Decomposition)
        </h4>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Split or extract data from a single source field into multiple target fields.
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
            placeholder="e.g., Dimensions Splitter"
          />
        </div>
        
        <div>
          <Label>Source Field</Label>
          <select
            defaultValue={sourceField}
            onChange={(e) => setSourceField(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Select source field</option>
            {availableSourceFields.map((field) => (
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
          placeholder="Describe what this mapping does..."
          className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          rows={2}
        />
      </div>

      {/* Decomposition Method */}
      <div>
        <Label>Decomposition Method</Label>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-2">
          {[
            { id: 'split', name: 'Split', description: 'Split by delimiter', icon: '✂️' },
            { id: 'extract', name: 'Extract', description: 'Extract patterns', icon: '🔍' },
            { id: 'parse', name: 'Parse', description: 'Parse structured data', icon: '📋' },
            { id: 'regex', name: 'Regex', description: 'Regular expressions', icon: '🔤' },
            { id: 'object_properties', name: 'Object Properties', description: 'Extract object properties', icon: '🔧' }
          ].map((method) => (
            <button
              key={method.id}
              onClick={() => setDecompositionMethod(method.id as any)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                decompositionMethod === method.id
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="text-lg mb-1">{method.icon}</div>
              <div className="font-medium text-gray-900 dark:text-white text-theme-sm">
                {method.name}
              </div>
              <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                {method.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Method-Specific Configuration */}
      {decompositionMethod === 'split' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h5 className="text-theme-sm font-medium text-blue-900 dark:text-blue-300 mb-3">
            Split Configuration
          </h5>
          <div>
            <Label>Delimiter</Label>
            <Input
              type="text"
              defaultValue={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              placeholder="e.g., ',', ' x ', '|'"
            />
            <p className="text-theme-xs text-blue-800 dark:text-blue-400 mt-1">
              Character(s) to split the source field by
            </p>
          </div>
        </div>
      )}

      {decompositionMethod === 'regex' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h5 className="text-theme-sm font-medium text-green-900 dark:text-green-300 mb-3">
            Regular Expression Configuration
          </h5>
          <div>
            <Label>Regex Pattern</Label>
            <Input
              type="text"
              defaultValue={regexPattern}
              onChange={(e) => setRegexPattern(e.target.value)}
              placeholder="e.g., (\\d+)\\s*x\\s*(\\d+)\\s*x\\s*(\\d+)"
            />
            <p className="text-theme-xs text-green-800 dark:text-green-400 mt-1">
              Use capturing groups () to extract values
            </p>
          </div>
        </div>
      )}

      {decompositionMethod === 'parse' && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <h5 className="text-theme-sm font-medium text-purple-900 dark:text-purple-300 mb-3">
            Parse Configuration
          </h5>
          <div>
            <Label>Parse Format</Label>
            <select
              value={parseFormat}
              onChange={(e) => setParseFormat(e.target.value as any)}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="dimensions">Dimensions (e.g., &quot;10 x 5 x 3&quot;)</option>
              <option value="json">JSON Object</option>
              <option value="xml">XML</option>
              <option value="csv">CSV</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
      )}

      {/* Object Properties Configuration - New for Shopify Dimensions */}
      {decompositionMethod === 'object_properties' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h5 className="text-theme-sm font-medium text-green-900 dark:text-green-300 mb-3">
            Object Properties Mapping (Shopify Dimensions Style)
          </h5>
          
          <div className="space-y-4">
            <p className="text-theme-sm text-green-800 dark:text-green-400">
              Extract properties from a complex object (e.g., dimensions: {`{length: 20, width: 15, height: 8, unit: "cm"}`})
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Length Property → Target Field</Label>
                <select
                  value={objectProperties.length}
                  onChange={(e) => setObjectProperties(prev => ({...prev, length: e.target.value}))}
                  className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select target field</option>
                  {availableTargetFields.map((field) => (
                    <option key={field.fieldPath} value={field.fieldPath}>
                      {field.displayName}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label>Width Property → Target Field</Label>
                <select
                  value={objectProperties.width}
                  onChange={(e) => setObjectProperties(prev => ({...prev, width: e.target.value}))}
                  className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select target field</option>
                  {availableTargetFields.map((field) => (
                    <option key={field.fieldPath} value={field.fieldPath}>
                      {field.displayName}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label>Height Property → Target Field</Label>
                <select
                  value={objectProperties.height}
                  onChange={(e) => setObjectProperties(prev => ({...prev, height: e.target.value}))}
                  className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select target field</option>
                  {availableTargetFields.map((field) => (
                    <option key={field.fieldPath} value={field.fieldPath}>
                      {field.displayName}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label>Unit Property → Target Field</Label>
                <select
                  value={objectProperties.unit}
                  onChange={(e) => setObjectProperties(prev => ({...prev, unit: e.target.value}))}
                  className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Select target field</option>
                  {availableTargetFields.map((field) => (
                    <option key={field.fieldPath} value={field.fieldPath}>
                      {field.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Unit Conversion Feature */}
            <div className="border-t border-green-200 dark:border-green-700 pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={unitConversion.enabled}
                  onChange={(e) => setUnitConversion(prev => ({...prev, enabled: e.target.checked}))}
                  className="w-4 h-4 text-green-500 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-theme-sm font-medium text-green-900 dark:text-green-300">
                  Enable Unit Conversion
                </span>
              </div>
              
              {unitConversion.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>From Unit</Label>
                    <select
                      value={unitConversion.from}
                      onChange={(e) => setUnitConversion(prev => ({...prev, from: e.target.value}))}
                      className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="cm">Centimeters (cm)</option>
                      <option value="in">Inches (in)</option>
                      <option value="mm">Millimeters (mm)</option>
                      <option value="m">Meters (m)</option>
                    </select>
                  </div>
                  
                  <div>
                    <Label>To Unit</Label>
                    <select
                      value={unitConversion.to}
                      onChange={(e) => setUnitConversion(prev => ({...prev, to: e.target.value}))}
                      className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="in">Inches (in)</option>
                      <option value="cm">Centimeters (cm)</option>
                      <option value="mm">Millimeters (mm)</option>
                      <option value="m">Meters (m)</option>
                    </select>
                  </div>
                  
                  <div>
                    <Label>Apply When</Label>
                    <Input
                      type="text"
                      defaultValue={unitConversion.applyCondition}
                      onChange={(e) => setUnitConversion(prev => ({...prev, applyCondition: e.target.value}))}
                      placeholder="channel_requires_inches"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Target Fields Configuration */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label>Target Fields</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addTarget}
          >
            + Add Target
          </Button>
        </div>

        <div className="space-y-3">
          {targets.map((target, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div className="md:col-span-2">
                  <Label>Target Field</Label>
                  <select
                    value={target.targetField}
                    onChange={(e) => updateTarget(index, { targetField: e.target.value })}
                    className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">Select field</option>
                    {availableTargetFields.map((field) => (
                      <option key={field.fieldPath} value={field.fieldPath}>
                        {field.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                {decompositionMethod === 'split' && (
                  <div>
                    <Label>Array Index</Label>
                    <Input
                      type="number"
                      defaultValue={target.index?.toString() || '0'}
                      onChange={(e) => updateTarget(index, { index: parseInt(e.target.value) || 0 })}
                      min="0"
                    />
                  </div>
                )}

                {decompositionMethod === 'parse' && parseFormat === 'json' && (
                  <div>
                    <Label>JSON Key</Label>
                    <Input
                      type="text"
                      defaultValue={target.key || ''}
                      onChange={(e) => updateTarget(index, { key: e.target.value })}
                      placeholder="e.g., weight"
                    />
                  </div>
                )}

                {decompositionMethod === 'regex' && (
                  <div>
                    <Label>Regex Group</Label>
                    <select
                      value={target.regexGroup || ''}
                      onChange={(e) => updateTarget(index, { regexGroup: e.target.value })}
                      className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    >
                      <option value="">Select group</option>
                      <option value="group1">Group 1</option>
                      <option value="group2">Group 2</option>
                      <option value="group3">Group 3</option>
                      <option value="group4">Group 4</option>
                    </select>
                  </div>
                )}

                <div>
                  <Label>Fallback Value</Label>
                  <Input
                    type="text"
                    defaultValue={target.fallback || ''}
                    onChange={(e) => updateTarget(index, { fallback: e.target.value })}
                    placeholder="Default value"
                  />
                </div>

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeTarget(index)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                    disabled={targets.length === 1}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
          Live Preview
        </h5>
        
        {sourceField ? (
          <div className="space-y-4">
            <div>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Source Data
              </span>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 mt-1">
                <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                  {sourceField === 'masterAttributes.dimensions' ? '10 x 5 x 3 inches' :
                   sourceField === 'masterAttributes.features' ? 'Wireless, Noise Cancellation, 20hr Battery, Fast Charging' :
                   sourceField === 'masterAttributes.tags' ? 'electronics,audio,wireless,premium' :
                   sourceField === 'variantData.specifications' ? '{"weight": "250g", "color": "black", "material": "plastic"}' :
                   `Sample data for ${sourceField}`}
                </div>
              </div>
            </div>
            
            <div>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Extracted Values
              </span>
              <div className="space-y-2 mt-1">
                {getPreviewData().map((item, index) => (
                  <div key={index} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-theme-sm">
                        <span className="font-medium text-gray-900 dark:text-white">
                          &quot;{item.value}&quot;
                        </span>
                      </div>
                      <div className="text-theme-xs text-gray-500 dark:text-gray-400">
                        → {item.target}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Select a source field to see preview
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          disabled={!name || !sourceField || targets.every(t => !t.targetField)}
        >
          Save Mapping
        </Button>
      </div>
    </div>
  );
};

export default OneToManyBuilder;