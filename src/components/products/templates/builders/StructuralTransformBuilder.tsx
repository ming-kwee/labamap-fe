"use client";
import React, { useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  SourceField, 
  TargetField, 
  StructuralConfig 
} from "../types/ComplexMapping";

interface StructuralTransformBuilderProps {
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}

const StructuralTransformBuilder: React.FC<StructuralTransformBuilderProps> = ({
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel,
  initialMapping
}) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [targetField, setTargetField] = useState(initialMapping?.targetField.fieldPath || '');
  
  // Facebook-style rich description configuration (unused for now but kept for future enhancement)
  
  const [sourceFields, setSourceFields] = useState({
    description: '',
    features: '',
    specifications: ''
  });
  
  const [richTemplate, setRichTemplate] = useState(
    initialMapping?.transformation.structural?.transformationRules?.[0]?.transformation || 
    '{description}\\n\\n**Key Features:**\\n{features_html}\\n\\n**Specifications:**\\n{specifications_table}'
  );
  
  const [featuresFormat, setFeaturesFormat] = useState<'html_list' | 'bullet_points' | 'numbered'>('html_list');
  const [specificationsFormat, setSpecificationsFormat] = useState<'table' | 'list' | 'paragraphs'>('table');
  const [maxLength, setMaxLength] = useState(5000);

  const handleSave = () => {
    const selectedTargetField = availableTargetFields.find(f => f.fieldPath === targetField)!;
    const usedSourceFields = Object.values(sourceFields)
      .filter(field => field)
      .map(fieldPath => availableSourceFields.find(sf => sf.fieldPath === fieldPath))
      .filter(Boolean) as SourceField[];

    const structuralConfig: StructuralConfig = {
      sourceStructure: {
        type: 'object',
        schema: {
          description: 'string',
          features: 'array',
          specifications: 'object'
        }
      },
      targetStructure: {
        type: 'primitive'
      },
      transformationRules: [
        {
          sourcePath: 'combined',
          targetPath: targetField,
          transformation: richTemplate
        }
      ]
    };

    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'structural',
      priority: 1,
      enabled: true,
      sourceFields: usedSourceFields,
      targetField: selectedTargetField,
      transformation: {
        type: 'structural',
        structural: structuralConfig
      }
    };

    onSave(mapping);
  };

  const getPreviewText = () => {
    const sampleData: Record<string, any> = {
      'masterAttributes.description': 'High-quality wireless headphones with premium sound and all-day comfort.',
      'masterAttributes.features': ['Active Noise Cancellation', 'Bluetooth 5.0', 'Fast Charging', '30-hour battery life'],
      'masterAttributes.specifications': {
        'Driver Size': '40mm',
        'Frequency Response': '20Hz - 20kHz',
        'Impedance': '32 ohms',
        'Weight': '250g',
        'Connectivity': 'Bluetooth 5.0, 3.5mm jack'
      }
    };

    let result = richTemplate;
    
    // Replace description
    const description = sampleData[sourceFields.description] || 'Sample description text';
    result = result.replace(/\{description\}/g, description);
    
    // Format features
    const features = sampleData[sourceFields.features] || ['Feature 1', 'Feature 2', 'Feature 3'];
    let featuresFormatted = '';
    
    switch (featuresFormat) {
      case 'html_list':
        featuresFormatted = '<ul>' + features.map((f: string) => `<li>${f}</li>`).join('') + '</ul>';
        break;
      case 'bullet_points':
        featuresFormatted = features.map((f: string) => `• ${f}`).join('\\n');
        break;
      case 'numbered':
        featuresFormatted = features.map((f: string, i: number) => `${i + 1}. ${f}`).join('\\n');
        break;
    }
    result = result.replace(/\{features_html\}/g, featuresFormatted);
    
    // Format specifications
    const specs = sampleData[sourceFields.specifications] || {'Spec 1': 'Value 1', 'Spec 2': 'Value 2'};
    let specsFormatted = '';
    
    switch (specificationsFormat) {
      case 'table':
        specsFormatted = '<table>' + 
          Object.entries(specs).map(([key, value]) => `<tr><td><strong>${key}</strong></td><td>${value}</td></tr>`).join('') + 
          '</table>';
        break;
      case 'list':
        specsFormatted = '<ul>' + 
          Object.entries(specs).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join('') + 
          '</ul>';
        break;
      case 'paragraphs':
        specsFormatted = Object.entries(specs).map(([key, value]) => `**${key}:** ${value}`).join('\\n\\n');
        break;
    }
    result = result.replace(/\{specifications_table\}/g, specsFormatted);
    
    // Replace escaped newlines with actual newlines for preview
    result = result.replace(/\\n/g, '\\n');
    
    return result;
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
          Structural Field Transformation (Facebook Rich Descriptions)
        </h4>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Transform multiple fields into rich, formatted content with HTML lists, tables, and structured text.
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
            placeholder="e.g., Facebook Rich Description Builder"
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
          placeholder="Describe this structural transformation..."
          className="h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
          rows={2}
        />
      </div>

      {/* Source Fields Mapping */}
      <div>
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
          Source Fields Mapping
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Description Field</Label>
            <select
              value={sourceFields.description}
              onChange={(e) => setSourceFields(prev => ({...prev, description: e.target.value}))}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Select description field</option>
              {availableSourceFields.map((field) => (
                <option key={field.fieldPath} value={field.fieldPath}>
                  {field.displayName}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <Label>Features Field (Array)</Label>
            <select
              value={sourceFields.features}
              onChange={(e) => setSourceFields(prev => ({...prev, features: e.target.value}))}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Select features field</option>
              {availableSourceFields.filter(f => f.dataType === 'array').map((field) => (
                <option key={field.fieldPath} value={field.fieldPath}>
                  {field.displayName}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <Label>Specifications Field (Object)</Label>
            <select
              value={sourceFields.specifications}
              onChange={(e) => setSourceFields(prev => ({...prev, specifications: e.target.value}))}
              className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Select specifications field</option>
              {availableSourceFields.filter(f => f.dataType === 'object').map((field) => (
                <option key={field.fieldPath} value={field.fieldPath}>
                  {field.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Formatting Options */}
      <div>
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-4">
          Rich Formatting Options
        </h5>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Features Format</Label>
              <select
                value={featuresFormat}
                onChange={(e) => setFeaturesFormat(e.target.value as any)}
                className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="html_list">HTML List (&lt;ul&gt;&lt;li&gt;)</option>
                <option value="bullet_points">Bullet Points (•)</option>
                <option value="numbered">Numbered List (1. 2. 3.)</option>
              </select>
            </div>
            
            <div>
              <Label>Specifications Format</Label>
              <select
                value={specificationsFormat}
                onChange={(e) => setSpecificationsFormat(e.target.value as any)}
                className="h-9 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="table">HTML Table</option>
                <option value="list">HTML List</option>
                <option value="paragraphs">Markdown Paragraphs</option>
              </select>
            </div>
            
            <div>
              <Label>Maximum Length</Label>
              <Input
                type="number"
                defaultValue={maxLength.toString()}
                onChange={(e) => setMaxLength(parseInt(e.target.value) || 5000)}
                min="100"
                max="50000"
              />
            </div>
          </div>
          
          <div>
            <Label>Rich Template</Label>
            <textarea
              defaultValue={richTemplate}
              onChange={(e) => setRichTemplate(e.target.value)}
              placeholder="Use {description}, {features_html}, {specifications_table}"
              className="h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-theme-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 font-mono"
              rows={6}
            />
            <p className="text-theme-xs text-gray-500 dark:text-gray-400 mt-1">
              Use \\n for line breaks. Available placeholders: {`{description}`, `{features_html}`, `{specifications_table}`}
            </p>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <h5 className="text-theme-sm font-medium text-gray-900 dark:text-white mb-3">
          Facebook-Style Rich Description Preview
        </h5>
        
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-4">
            <div 
              className="text-theme-sm text-gray-900 dark:text-white"
              dangerouslySetInnerHTML={{ __html: getPreviewText().replace(/\\n/g, '<br/>') }}
            />
          </div>
          <div className="text-theme-xs text-gray-500 dark:text-gray-400 mt-2">
            Length: {getPreviewText().length} characters / {maxLength} max
            {getPreviewText().length > maxLength && (
              <span className="text-red-500 ml-2">⚠️ Exceeds maximum length</span>
            )}
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
          disabled={!name || !targetField || !sourceFields.description}
        >
          Save Structural Transform
        </Button>
      </div>
    </div>
  );
};

export default StructuralTransformBuilder;