"use client";
import React, { useState, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField, 
  TemplateConfig,
  TemplateBlock 
} from "../types/ComplexMapping";

interface TemplateBuilderProps {
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}

const TemplateBuilder: React.FC<TemplateBuilderProps> = ({
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel,
  initialMapping
}) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [targetField, setTargetField] = useState(initialMapping?.targetField.fieldPath || '');
  
  const [templateBlocks, setTemplateBlocks] = useState<TemplateBlock[]>(
    initialMapping?.transformation.template?.blocks || [
      { type: 'text', content: '' }
    ]
  );
  
  const [outputFormat, setOutputFormat] = useState(
    initialMapping?.transformation.template?.outputFormat || 'plain'
  );
  
  const [escapeHtml, setEscapeHtml] = useState(
    initialMapping?.transformation.template?.escapeHtml || false
  );
  
  const [trimWhitespace, setTrimWhitespace] = useState<boolean>(
    initialMapping?.transformation.template?.trimWhitespace ?? true
  );

  const addTemplateBlock = useCallback((type: 'text' | 'variable' | 'conditional' | 'loop') => {
    const newBlock: TemplateBlock = {
      type,
      content: type === 'text' ? '' : undefined,
      variable: type === 'variable' ? '' : undefined,
      condition: type === 'conditional' ? {
        field: '',
        operator: 'equals',
        value: '',
        trueTemplate: '',
        falseTemplate: ''
      } : undefined,
      loop: type === 'loop' ? {
        field: '',
        itemTemplate: '',
        separator: ', '
      } : undefined
    };
    
    setTemplateBlocks(prev => [...prev, newBlock]);
  }, []);

  const removeTemplateBlock = useCallback((index: number) => {
    setTemplateBlocks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateTemplateBlock = useCallback((index: number, block: Partial<TemplateBlock>) => {
    setTemplateBlocks(prev => prev.map((item, i) => 
      i === index ? { ...item, ...block } : item
    ));
  }, []);

  const moveBlock = useCallback((index: number, direction: 'up' | 'down') => {
    setTemplateBlocks(prev => {
      const newBlocks = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (targetIndex >= 0 && targetIndex < newBlocks.length) {
        [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
      }
      
      return newBlocks;
    });
  }, []);

  const handleSave = () => {
    const selectedTargetField = availableTargetFields.find(f => f.fieldPath === targetField)!;
    const usedSourceFields = templateBlocks
      .filter(block => block.variable || block.condition?.field || block.loop?.field)
      .map(block => {
        const fieldPath = block.variable || block.condition?.field || block.loop?.field;
        return availableSourceFields.find(sf => sf.fieldPath === fieldPath);
      })
      .filter(Boolean) as SourceField[];

    const templateConfig: TemplateConfig = {
      blocks: templateBlocks,
      outputFormat,
      escapeHtml,
      trimWhitespace
    };

    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'templated',
      priority: 1,
      enabled: true,
      sourceFields: usedSourceFields,
      targetField: selectedTargetField,
      transformation: {
        type: 'templated',
        template: templateConfig
      }
    };

    onSave(mapping);
  };

  const getPreviewText = () => {
    const sampleData: Record<string, any> = {
      'masterAttributes.brand': 'AudioTech',
      'masterAttributes.product_name': 'Premium Wireless Headphones',
      'masterAttributes.sku': 'AT-WH-001',
      'masterAttributes.price': 299.99,
      'variantData.color': 'Black',
      'variantData.size': 'Standard',
      'variantData.features': ['Noise Cancelling', 'Bluetooth 5.0', 'Fast Charging']
    };

    let result = '';
    
    templateBlocks.forEach(block => {
      switch (block.type) {
        case 'text':
          result += block.content || '';
          break;
          
        case 'variable':
          if (block.variable) {
            const value = sampleData[block.variable];
            result += value !== undefined ? String(value) : `{${block.variable}}`;
          }
          break;
          
        case 'conditional':
          if (block.condition) {
            const fieldValue = sampleData[block.condition.field];
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
          if (block.loop && Array.isArray(sampleData[block.loop.field])) {
            const items = sampleData[block.loop.field].map((item: any) => 
              block.loop!.itemTemplate.replace(/\{item\}/g, String(item))
            );
            result += items.join(block.loop.separator);
          }
          break;
      }
    });

    if (trimWhitespace) {
      result = result.trim();
    }

    return result;
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          Template-Based Field Mapping
        </h4>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Create complex formatted output using text blocks, variables, conditions, and loops.
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
            placeholder="e.g., Product Description Template"
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
          placeholder="Describe what this template generates..."
          className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          rows={2}
        />
      </div>

      {/* Template Blocks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label>Template Blocks</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addTemplateBlock('text')}>
              + Text
            </Button>
            <Button variant="outline" size="sm" onClick={() => addTemplateBlock('variable')}>
              + Variable
            </Button>
            <Button variant="outline" size="sm" onClick={() => addTemplateBlock('conditional')}>
              + Conditional
            </Button>
            <Button variant="outline" size="sm" onClick={() => addTemplateBlock('loop')}>
              + Loop
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {templateBlocks.map((block, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-theme-sm font-medium capitalize text-gray-900 dark:text-white">
                  {block.type} Block
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => moveBlock(index, 'up')}
                    disabled={index === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => moveBlock(index, 'down')}
                    disabled={index === templateBlocks.length - 1}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeTemplateBlock(index)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                    disabled={templateBlocks.length === 1}
                  >
                    🗑️
                  </Button>
                </div>
              </div>

              {block.type === 'text' && (
                <div>
                  <Label>Text Content</Label>
                  <textarea
                    defaultValue={block.content || ''}
                    onChange={(e) => updateTemplateBlock(index, { content: e.target.value })}
                    placeholder="Enter static text content..."
                    className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                    rows={2}
                  />
                </div>
              )}

              {block.type === 'variable' && (
                <div>
                  <Label>Source Field</Label>
                  <select
                    value={block.variable || ''}
                    onChange={(e) => updateTemplateBlock(index, { variable: e.target.value })}
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
              )}

              {block.type === 'conditional' && block.condition && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Field</Label>
                      <select
                        value={block.condition.field}
                        onChange={(e) => updateTemplateBlock(index, { 
                          condition: { ...block.condition!, field: e.target.value } 
                        })}
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
                        value={block.condition.operator}
                        onChange={(e) => updateTemplateBlock(index, { 
                          condition: { ...block.condition!, operator: e.target.value as any } 
                        })}
                        className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                        <option value="contains">Contains</option>
                        <option value="exists">Exists</option>
                      </select>
                    </div>
                    <div>
                      <Label>Value</Label>
                      <Input
                        type="text"
                        defaultValue={block.condition.value}
                        onChange={(e) => updateTemplateBlock(index, { 
                          condition: { ...block.condition!, value: e.target.value } 
                        })}
                        placeholder="Comparison value"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>If True</Label>
                      <textarea
                        defaultValue={block.condition.trueTemplate}
                        onChange={(e) => updateTemplateBlock(index, { 
                          condition: { ...block.condition!, trueTemplate: e.target.value } 
                        })}
                        placeholder="Template when condition is true"
                        className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label>If False</Label>
                      <textarea
                        defaultValue={block.condition.falseTemplate}
                        onChange={(e) => updateTemplateBlock(index, { 
                          condition: { ...block.condition!, falseTemplate: e.target.value } 
                        })}
                        placeholder="Template when condition is false"
                        className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}

              {block.type === 'loop' && block.loop && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Array Field</Label>
                      <select
                        value={block.loop.field}
                        onChange={(e) => updateTemplateBlock(index, { 
                          loop: { ...block.loop!, field: e.target.value } 
                        })}
                        className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">Select field</option>
                        {availableSourceFields.filter(f => f.dataType === 'array').map((field) => (
                          <option key={field.fieldPath} value={field.fieldPath}>
                            {field.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Separator</Label>
                      <Input
                        type="text"
                        defaultValue={block.loop.separator}
                        onChange={(e) => updateTemplateBlock(index, { 
                          loop: { ...block.loop!, separator: e.target.value } 
                        })}
                        placeholder=", "
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Item Template</Label>
                    <textarea
                      defaultValue={block.loop.itemTemplate}
                      onChange={(e) => updateTemplateBlock(index, { 
                        loop: { ...block.loop!, itemTemplate: e.target.value } 
                      })}
                      placeholder="Template for each item (use {item} as placeholder)"
                      className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Template Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
            Output Options
          </h5>
          
          <div className="space-y-4">
            <div>
              <Label>Output Format</Label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as any)}
                className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="plain">Plain Text</option>
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={escapeHtml}
                  onChange={(e) => setEscapeHtml(e.target.checked)}
                  className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                />
                <span className="text-theme-sm text-gray-700 dark:text-gray-300">Escape HTML characters</span>
              </label>
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={trimWhitespace}
                  onChange={(e) => setTrimWhitespace(e.target.checked)}
                  className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                />
                <span className="text-theme-sm text-gray-700 dark:text-gray-300">Trim whitespace</span>
              </label>
            </div>
          </div>
        </div>

        <div>
          <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
            Live Preview
          </h5>
          
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
            <pre className="text-theme-sm text-gray-900 dark:text-white whitespace-pre-wrap">
              {getPreviewText()}
            </pre>
            <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-2">
              Length: {getPreviewText().length} characters
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
          disabled={!name || !targetField || templateBlocks.length === 0}
        >
          Save Template
        </Button>
      </div>
    </div>
  );
};

export default TemplateBuilder;