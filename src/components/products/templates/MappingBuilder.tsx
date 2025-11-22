"use client";
import React, { useState, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import { 
  ComplexFieldMapping, 
  MappingType, 
  MappingBuilderState,
  SourceField,
  TargetField
} from "./types/ComplexMapping";
import ManyToOneBuilder from "./builders/ManyToOneBuilder";
import OneToManyBuilder from "./builders/OneToManyBuilder";
import ConditionalBuilder from "./builders/ConditionalBuilder";
import ComputedFieldsBuilder from "./builders/ComputedFieldsBuilder";
import TemplateBuilder from "./builders/TemplateBuilder";
import StructuralTransformBuilder from "./builders/StructuralTransformBuilder";

interface MappingBuilderProps {
  initialMappings?: ComplexFieldMapping[];
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mappings: ComplexFieldMapping[]) => void;
  onCancel: () => void;
}

const mappingTypes = [
  {
    id: 'simple',
    name: 'Simple Mapping',
    description: '1:1 direct field mapping',
    icon: '🔗',
    complexity: 'Basic'
  },
  {
    id: 'many-to-one',
    name: 'Many-to-One',
    description: 'Concatenate multiple fields into one',
    icon: '🔀',
    complexity: 'Medium'
  },
  {
    id: 'one-to-many',
    name: 'One-to-Many',
    description: 'Split one field into multiple fields',
    icon: '📦',
    complexity: 'Medium'
  },
  {
    id: 'conditional',
    name: 'Conditional Mapping',
    description: 'Map based on conditions and rules',
    icon: '🔀',
    complexity: 'Advanced'
  },
  {
    id: 'computed',
    name: 'Computed Fields',
    description: 'Calculate values using formulas',
    icon: '🧮',
    complexity: 'Advanced'
  },
  {
    id: 'structural',
    name: 'Structural Transform',
    description: 'Transform data structures',
    icon: '🏗️',
    complexity: 'Expert'
  },
  {
    id: 'templated',
    name: 'Template-Based',
    description: 'Use templates for complex formatting',
    icon: '📝',
    complexity: 'Expert'
  }
] as const;

const MappingBuilder: React.FC<MappingBuilderProps> = ({
  initialMappings = [],
  availableSourceFields,
  availableTargetFields,
  onSave,
  onCancel
}) => {
  const [state, setState] = useState<MappingBuilderState>({
    mappings: initialMappings,
    isDirty: false
  });

  const [selectedMappingType, setSelectedMappingType] = useState<MappingType>('simple');
  const [showMappingBuilder, setShowMappingBuilder] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ComplexFieldMapping | null>(null);

  const handleAddMapping = useCallback(() => {
    setEditingMapping(null);
    setShowMappingBuilder(true);
  }, []);

  const handleEditMapping = useCallback((mapping: ComplexFieldMapping) => {
    setEditingMapping(mapping);
    setSelectedMappingType(mapping.type);
    setShowMappingBuilder(true);
  }, []);

  const handleSaveMapping = useCallback((mapping: ComplexFieldMapping) => {
    setState(prev => {
      const newMappings = editingMapping
        ? prev.mappings.map(m => m.id === editingMapping.id ? mapping : m)
        : [...prev.mappings, { ...mapping, id: Date.now().toString() }];
      
      return {
        ...prev,
        mappings: newMappings,
        isDirty: true
      };
    });
    setShowMappingBuilder(false);
    setEditingMapping(null);
  }, [editingMapping]);

  const handleDeleteMapping = useCallback((mappingId: string) => {
    setState(prev => ({
      ...prev,
      mappings: prev.mappings.filter(m => m.id !== mappingId),
      isDirty: true
    }));
  }, []);

  const handleCloneMapping = useCallback((mapping: ComplexFieldMapping) => {
    const clonedMapping: ComplexFieldMapping = {
      ...mapping,
      id: Date.now().toString(),
      name: `${mapping.name} (Copy)`
    };
    
    setState(prev => ({
      ...prev,
      mappings: [...prev.mappings, clonedMapping],
      isDirty: true
    }));
  }, []);

  const renderMappingTypeSelector = () => (
    <div className="space-y-4">
      <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
        Select Mapping Type
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mappingTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => setSelectedMappingType(type.id as MappingType)}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              selectedMappingType === type.id
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">{type.icon}</div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                  {type.name}
                </h4>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400 mb-2">
                  {type.description}
                </p>
                <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                  type.complexity === 'Basic' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                  type.complexity === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                  type.complexity === 'Advanced' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                  'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  {type.complexity}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderMappingBuilder = () => {
    const commonProps = {
      availableSourceFields,
      availableTargetFields,
      onSave: handleSaveMapping,
      onCancel: () => setShowMappingBuilder(false),
      initialMapping: editingMapping
    };

    switch (selectedMappingType) {
      case 'many-to-one':
        return <ManyToOneBuilder {...commonProps} />;
      case 'one-to-many':
        return <OneToManyBuilder {...commonProps} />;
      case 'conditional':
        return <ConditionalBuilder {...commonProps} />;
      case 'computed':
        return <ComputedFieldsBuilder {...commonProps} />;
      case 'templated':
        return <TemplateBuilder {...commonProps} />;
      case 'structural':
        return <StructuralTransformBuilder {...commonProps} />;
      default:
        return <SimpleFieldMapping {...commonProps} />;
    }
  };

  const renderMappingsList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white">
          Field Mappings ({state.mappings.length})
        </h3>
        <Button onClick={handleAddMapping}>
          + Add Mapping
        </Button>
      </div>

      {state.mappings.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-4xl mb-4">🔗</div>
          <h4 className="text-title-sm font-medium text-gray-900 dark:text-white mb-2">
            No mappings configured
          </h4>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400 mb-4">
            Add your first field mapping to get started
          </p>
          <Button onClick={handleAddMapping}>
            Create First Mapping
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {state.mappings.map((mapping) => {
            const typeInfo = mappingTypes.find(t => t.id === mapping.type);
            return (
              <div
                key={mapping.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="text-xl">{typeInfo?.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {mapping.name}
                        </h4>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          mapping.enabled 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {mapping.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded-full">
                          {typeInfo?.name}
                        </span>
                      </div>
                      
                      {mapping.description && (
                        <p className="text-theme-sm text-gray-500 dark:text-gray-400 mb-2">
                          {mapping.description}
                        </p>
                      )}
                      
                      <div className="text-theme-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Sources:</span> {mapping.sourceFields.map(f => f.displayName).join(', ')} →{' '}
                        <span className="font-medium">Target:</span> {mapping.targetField.displayName}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditMapping(mapping)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCloneMapping(mapping)}
                    >
                      📋
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteMapping(mapping.id)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (showMappingBuilder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white">
              {editingMapping ? 'Edit Mapping' : 'Create New Mapping'}
            </h2>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              Configure complex field transformations and relationships
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowMappingBuilder(false)}
          >
            ← Back to Mappings
          </Button>
        </div>

        {!editingMapping && renderMappingTypeSelector()}
        
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          {renderMappingBuilder()}
        </div>
      </div>
    );
  }

  return (
    <div className=" px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-title-lg font-semibold text-gray-900 dark:text-white">
            Complex Field Mapping Builder
          </h2>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Configure advanced field transformations and relationships
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={() => onSave(state.mappings)}
            disabled={!state.isDirty}
          >
            Save Mappings
          </Button>
        </div>
      </div>

      {/* Mapping Patterns Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-title-sm font-semibold text-gray-900 dark:text-white mb-4">
          Complex Mapping Patterns
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔀</span>
              <span className="font-medium text-blue-900 dark:text-blue-300">Many-to-One</span>
            </div>
            <p className="text-theme-sm text-blue-800 dark:text-blue-400">
              Concatenation: [Brand] + [Name] + [Model] → [Title]
            </p>
          </div>
          
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📦</span>
              <span className="font-medium text-green-900 dark:text-green-300">One-to-Many</span>
            </div>
            <p className="text-theme-sm text-green-800 dark:text-green-400">
              Decomposition: [Dimensions] → [Length][Width][Height]
            </p>
          </div>
          
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🧮</span>
              <span className="font-medium text-purple-900 dark:text-purple-300">Computed Fields</span>
            </div>
            <p className="text-theme-sm text-purple-800 dark:text-purple-400">
              Calculations: [Weight] × [Dimensions] → [ShippingCost]
            </p>
          </div>
        </div>
      </div>

      {renderMappingsList()}
    </div>
  );
};

// Simple Field Mapping Component
const SimpleFieldMapping: React.FC<{
  availableSourceFields: SourceField[];
  availableTargetFields: TargetField[];
  onSave: (mapping: ComplexFieldMapping) => void;
  onCancel: () => void;
  initialMapping?: ComplexFieldMapping | null;
}> = ({ availableSourceFields, availableTargetFields, onSave, onCancel, initialMapping }) => {
  const [name, setName] = useState(initialMapping?.name || '');
  const [description, setDescription] = useState(initialMapping?.description || '');
  const [sourceField, setSourceField] = useState('');
  const [targetField, setTargetField] = useState('');

  const handleSave = () => {
    const mapping: ComplexFieldMapping = {
      id: initialMapping?.id || '',
      name,
      description,
      type: 'simple',
      priority: 1,
      enabled: true,
      sourceFields: [availableSourceFields.find(f => f.fieldPath === sourceField)!],
      targetField: availableTargetFields.find(f => f.fieldPath === targetField)!,
      transformation: { type: 'simple' }
    };
    onSave(mapping);
  };

  return (
    <div className="space-y-4">
      <h4 className="text-title-sm font-medium text-gray-900 dark:text-white">
        Simple Field Mapping Configuration
      </h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Mapping Name</Label>
          <Input
            type="text"
            defaultValue={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Product Name to Title"
          />
        </div>
        
        <div>
          <Label>Description</Label>
          <Input
            type="text"
            defaultValue={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      
      <div className="flex items-center justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave}
          disabled={!name || !sourceField || !targetField}
        >
          Save Mapping
        </Button>
      </div>
    </div>
  );
};

export default MappingBuilder;