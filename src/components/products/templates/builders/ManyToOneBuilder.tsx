"use client";
import React, { useState, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField, 
  ConcatenationConfig,
  ConcatenationField 
} from "../types/ComplexMapping";

interface ManyToOneBuilderProps {
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}

const ManyToOneBuilder: React.FC<ManyToOneBuilderProps> = ({
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel,
  initialMapping
}) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [targetField, setTargetField] = useState(initialMapping?.targetField.fieldPath || '');
  
  const [concatenationFields, setConcatenationFields] = useState<ConcatenationField[]>(
    initialMapping?.transformation.concatenation?.fields || [
      { sourceField: '', required: true }
    ]
  );
  
  const [separator, setSeparator] = useState(
    initialMapping?.transformation.concatenation?.separator || ' '
  );
  
  const [template, setTemplate] = useState(
    initialMapping?.transformation.concatenation?.template || ''
  );
  
  const [maxLength, setMaxLength] = useState(
    initialMapping?.transformation.concatenation?.maxLength || 200
  );
  
  const [truncateMethod, setTruncateMethod] = useState<'end' | 'middle' | 'start' | 'smart'>(
    initialMapping?.transformation.concatenation?.truncateMethod || 'end'
  );
  
  // Advanced validation features
  const [fallbackTemplate, setFallbackTemplate] = useState(
    initialMapping?.transformation.concatenation?.fallbackTemplate || ''
  );
  
  const [requiredFields, setRequiredFields] = useState<string[]>(
    initialMapping?.transformation.concatenation?.validation?.requiredFields || []
  );
  
  const [forbiddenWords, setForbiddenWords] = useState<string[]>(
    initialMapping?.transformation.concatenation?.validation?.forbiddenWords || []
  );
  
  const [wordBoundaryTruncation, setWordBoundaryTruncation] = useState(
    initialMapping?.transformation.concatenation?.wordBoundaryTruncation || false
  );

  const addConcatenationField = useCallback(() => {
    setConcatenationFields(prev => [
      ...prev,
      { sourceField: '', required: false }
    ]);
  }, []);

  const removeConcatenationField = useCallback((index: number) => {
    setConcatenationFields(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateConcatenationField = useCallback((index: number, field: Partial<ConcatenationField>) => {
    setConcatenationFields(prev => prev.map((item, i) => 
      i === index ? { ...item, ...field } : item
    ));
  }, []);

  const handleSave = () => {
    const selectedTargetField = availableTargetFields.find(f => f.fieldPath === targetField)!;
    const selectedSourceFields = concatenationFields
      .filter(f => f.sourceField)
      .map(f => availableSourceFields.find(sf => sf.fieldPath === f.sourceField)!)
      .filter(Boolean);

    const concatenationConfig: ConcatenationConfig = {
      fields: concatenationFields.filter(f => f.sourceField),
      separator,
      template: template || undefined,
      maxLength,
      truncateMethod,
      truncateIndicator: '...',
      outputFormat: 'plain',
      fallbackTemplate: fallbackTemplate || undefined,
      wordBoundaryTruncation,
      validation: (requiredFields.length > 0 || forbiddenWords.length > 0) ? {
        requiredFields,
        forbiddenWords,
        minLength: 10
      } : undefined
    };

    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'many-to-one',
      priority: 1,
      enabled: true,
      sourceFields: selectedSourceFields,
      targetField: selectedTargetField,
      transformation: {
        type: 'many-to-one',
        concatenation: concatenationConfig
      }
    };

    onSave(mapping);
  };

  const getPreviewText = () => {
    const sampleData: Record<string, string> = {
      'masterAttributes.brand': 'AudioTech',
      'masterAttributes.product_name': 'Premium Wireless Headphones',
      'masterAttributes.sku': 'AT-WH-001',
      'masterAttributes.model': 'Pro X1',
      'masterAttributes.key_feature': 'Active Noise Cancellation',
      'variantData.color': 'Black',
      'variantData.size': 'Standard'
    };

    // Validation check
    const hasRequiredFields = requiredFields.every(field => 
      sampleData[field] && sampleData[field].trim() !== ''
    );

    if (!hasRequiredFields) {
      return `❌ Missing required fields: ${requiredFields.filter(f => !sampleData[f]).join(', ')}`;
    }

    let result = '';
    
    if (template) {
      // Template-based concatenation
      result = template;
      concatenationFields.forEach(field => {
        if (field.sourceField) {
          const value = sampleData[field.sourceField] || `{${field.sourceField}}`;
          const processedValue = field.prefix ? `${field.prefix}${value}` : value;
          const finalValue = field.suffix ? `${processedValue}${field.suffix}` : processedValue;
          result = result.replace(new RegExp(`\\{${field.sourceField}\\}`, 'g'), finalValue);
        }
      });
    } else {
      // Separator-based concatenation
      const values = concatenationFields
        .filter(field => field.sourceField)
        .map(field => {
          let value = sampleData[field.sourceField] || `{${field.sourceField}}`;
          if (field.prefix) value = `${field.prefix}${value}`;
          if (field.suffix) value = `${value}${field.suffix}`;
          return value;
        })
        .filter(Boolean);
      
      result = values.join(separator);
    }

    // Check forbidden words
    const hasForbiddenWords = forbiddenWords.some(word => 
      result.toLowerCase().includes(word.toLowerCase())
    );

    if (hasForbiddenWords) {
      const foundWords = forbiddenWords.filter(word => 
        result.toLowerCase().includes(word.toLowerCase())
      );
      return `❌ Contains forbidden words: ${foundWords.join(', ')} - "${result}"`;
    }

    // Check if result exceeds max length
    if (result.length > maxLength) {
      if (fallbackTemplate) {
        // Use fallback template
        let fallbackResult = fallbackTemplate;
        concatenationFields.forEach(field => {
          if (field.sourceField) {
            const value = sampleData[field.sourceField] || `{${field.sourceField}}`;
            fallbackResult = fallbackResult.replace(new RegExp(`\\{${field.sourceField}\\}`, 'g'), value);
          }
        });
        
        if (fallbackResult.length <= maxLength) {
          return `⚠️ Used fallback: "${fallbackResult}" (original was ${result.length} chars)`;
        }
      }
      
      // Truncate with word boundary awareness
      if (wordBoundaryTruncation && truncateMethod === 'smart') {
        const truncated = result.substring(0, maxLength - 3);
        const lastSpace = truncated.lastIndexOf(' ');
        const smartTruncated = lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
        return `✂️ Smart truncated: "${smartTruncated}"`;
      } else {
        return `✂️ Truncated: "${result.substring(0, maxLength - 3)}..."`;
      }
    }

    return `✅ Valid: "${result}"`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          Many-to-One Field Mapping (Concatenation)
        </h4>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Combine multiple source fields into a single target field with custom formatting and templates.
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
            placeholder="e.g., Product Title Builder"
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
                {field.maxLength && ` - Max: ${field.maxLength}`}
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

      {/* Source Fields Configuration */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label>Source Fields</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={addConcatenationField}
          >
            + Add Field
          </Button>
        </div>

        <div className="space-y-3">
          {concatenationFields.map((field, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                <div className="md:col-span-2">
                  <Label>Source Field</Label>
                  <select
                    value={field.sourceField}
                    onChange={(e) => updateConcatenationField(index, { sourceField: e.target.value })}
                    className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">Select field</option>
                    {availableSourceFields.map((sourceField) => (
                      <option key={sourceField.fieldPath} value={sourceField.fieldPath}>
                        {sourceField.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Prefix</Label>
                  <Input
                    type="text"
                    defaultValue={field.prefix || ''}
                    onChange={(e) => updateConcatenationField(index, { prefix: e.target.value })}
                    placeholder="e.g., ["
                  />
                </div>

                <div>
                  <Label>Suffix</Label>
                  <Input
                    type="text"
                    defaultValue={field.suffix || ''}
                    onChange={(e) => updateConcatenationField(index, { suffix: e.target.value })}
                    placeholder="e.g., ]"
                  />
                </div>

                <div>
                  <Label>Transform</Label>
                  <select
                    value={field.transform || ''}
                    onChange={(e) => updateConcatenationField(index, { transform: e.target.value })}
                    className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">None</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="capitalize">Capitalize</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateConcatenationField(index, { required: e.target.checked })}
                      className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
                    />
                    <span className="text-theme-sm text-gray-700 dark:text-gray-300">Required</span>
                  </label>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeConcatenationField(index)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                    disabled={concatenationFields.length === 1}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Validation & Fallback */}
      <div>
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
          Amazon-Style Validation & Fallback
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label>Required Fields (comma-separated)</Label>
            <Input
              type="text"
              defaultValue={requiredFields.join(', ')}
              onChange={(e) => setRequiredFields(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="brand, product_name"
            />
            <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
              Fields that must have values for mapping to succeed
            </p>
          </div>
          
          <div>
            <Label>Forbidden Words (comma-separated)</Label>
            <Input
              type="text"
              defaultValue={forbiddenWords.join(', ')}
              onChange={(e) => setForbiddenWords(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="best, guaranteed, #1"
            />
            <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
              Words that will cause validation to fail (Amazon compliance)
            </p>
          </div>
        </div>
        
        <div>
          <Label>Fallback Template (when main template is too long)</Label>
          <textarea
            defaultValue={fallbackTemplate}
            onChange={(e) => setFallbackTemplate(e.target.value)}
            placeholder="e.g., {brand} {product_name}"
            className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            rows={2}
          />
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
            Shorter template used when main template exceeds max length
          </p>
        </div>
        
        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wordBoundaryTruncation}
              onChange={(e) => setWordBoundaryTruncation(e.target.checked)}
              className="w-4 h-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
            />
            <span className="text-theme-sm text-gray-700 dark:text-gray-300">Smart word-boundary truncation</span>
          </label>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400 ml-6">
            Avoid cutting words in half when truncating
          </p>
        </div>
      </div>

      {/* Concatenation Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
            Concatenation Method
          </h5>
          
          <div className="space-y-4">
            <div>
              <Label>Separator (Simple Mode)</Label>
              <Input
                type="text"
                defaultValue={separator}
                onChange={(e) => setSeparator(e.target.value)}
                placeholder="e.g., ' - ', ' | ', ' '"
              />
              <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                Character(s) to join fields together
              </p>
            </div>

            <div>
              <Label>Template (Advanced Mode)</Label>
              <textarea
                defaultValue={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="e.g., {brand} - {product_name} ({sku})"
                className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
                rows={2}
              />
              <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                Use {`{fieldName}`} placeholders for custom formatting
              </p>
            </div>
          </div>
        </div>

        <div>
          <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
            Length & Truncation
          </h5>
          
          <div className="space-y-4">
            <div>
              <Label>Maximum Length</Label>
              <Input
                type="number"
                defaultValue={maxLength.toString()}
                onChange={(e) => setMaxLength(parseInt(e.target.value) || 200)}
                min="1"
                max="10000"
              />
            </div>

            <div>
              <Label>Truncation Method</Label>
              <select
                value={truncateMethod}
                onChange={(e) => setTruncateMethod(e.target.value as any)}
                className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="end">End - &quot;Hello Wor...&quot;</option>
                <option value="middle">Middle - &quot;Hel...rld&quot;</option>
                <option value="start">Start - &quot;...lo World&quot;</option>
                <option value="smart">Smart - Preserve words</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
          Live Preview
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Sample Input
            </span>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 mt-1">
              <div className="text-theme-sm space-y-1">
                <div>Brand: &quot;AudioTech&quot;</div>
                <div>Product Name: &quot;Premium Wireless Headphones&quot;</div>
                <div>SKU: &quot;AT-WH-001&quot;</div>
                <div>Color: &quot;Black&quot;</div>
              </div>
            </div>
          </div>
          
          <div>
            <span className="text-theme-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Generated Output
            </span>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 mt-1">
              <div className="text-theme-sm font-medium text-gray-900 dark:text-white">
                {getPreviewText()}
              </div>
              <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
                Length: {getPreviewText().length} / {maxLength} characters
              </div>
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
          disabled={!name || !targetField || concatenationFields.every(f => !f.sourceField)}
        >
          Save Mapping
        </Button>
      </div>
    </div>
  );
};

export default ManyToOneBuilder;