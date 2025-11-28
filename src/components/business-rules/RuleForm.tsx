"use client";

import React, { useState, useEffect } from 'react';
import type {
  BusinessRule,
  CreateRuleRequest,
  RuleType,
  ValidationRule,
  TransformationRule,
  EnhancementRule,
} from '@/types/businessRules';
import { createBusinessRule, updateBusinessRule } from '@/services/businessRulesService';
import Button from '@/components/ui/button/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card/Card';
import ValidationRuleBuilder from './ValidationRuleBuilder';
import TransformationRuleBuilder from './TransformationRuleBuilder';
import EnhancementRuleBuilder from './EnhancementRuleBuilder';
import SchemaBasedConfigurationForm from './SchemaBasedConfigurationForm';
import type { RuleConfigurationSchema } from '@/services/configurationSchemaService';
import { getAllSchemas, getSchema, suggestSchema, validateConfiguration } from '@/services/configurationSchemaService';

interface RuleFormProps {
  editingRule?: BusinessRule | null;
  onSuccess: () => void;
  onCancel?: () => void;
}

const RuleForm: React.FC<RuleFormProps> = ({ editingRule, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<CreateRuleRequest>({
    ruleId: '',
    ruleName: '',
    ruleDescription: '',
    ruleType: 'BUSINESS_LOGIC',
    priority: 100,
    enabled: true,
    validationRules: [],
    transformationRules: [],
    enhancementRules: [],
    applicableFields: [],
    applicableCategories: [],
    supportedChannels: [],
    isCritical: false,
    executionTimeoutMs: 5000,
    tags: [],
  });

  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [transformationRules, setTransformationRules] = useState<TransformationRule[]>([]);
  const [enhancementRules, setEnhancementRules] = useState<EnhancementRule[]>([]);

  // Track which builder to show based on rule type
  const showValidationBuilder = formData.ruleType === 'BUSINESS_LOGIC';
  const showTransformationBuilder = formData.ruleType === 'PRE_PROCESSING';
  const showEnhancementBuilder = formData.ruleType === 'DATA_ENHANCEMENT';

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fieldInput, setFieldInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [configurationJson, setConfigurationJson] = useState('{}');
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // Schema-based configuration
  const [configurationSchema, setConfigurationSchema] = useState<RuleConfigurationSchema | null>(null);
  const [schemaConfiguration, setSchemaConfiguration] = useState<Record<string, any>>({});
  const [schemaValidationErrors, setSchemaValidationErrors] = useState<Record<string, string>>({});
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [availableSchemas, setAvailableSchemas] = useState<RuleConfigurationSchema[]>([]);

  // Load all available schemas on mount
  useEffect(() => {
    const loadSchemas = async () => {
      const schemas = await getAllSchemas();
      setAvailableSchemas(schemas);
      console.log('📚 Loaded available schemas:', schemas.map(s => `${s.schemaId} (${s.ruleType})`));
    };
    loadSchemas();
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (editingRule) {
      setFormData({
        ruleId: editingRule.ruleId,
        ruleName: editingRule.ruleName,
        ruleDescription: editingRule.ruleDescription || '',
        ruleType: editingRule.ruleType,
        priority: editingRule.priority,
        enabled: editingRule.enabled,
        validationRules: editingRule.validationRules || [],
        transformationRules: editingRule.transformationRules || [],
        enhancementRules: editingRule.enhancementRules || [],
        applicableFields: editingRule.applicableFields || [],
        applicableCategories: editingRule.applicableCategories || [],
        supportedChannels: editingRule.supportedChannels || [],
        isCritical: editingRule.isCritical || false,
        executionTimeoutMs: editingRule.executionTimeoutMs || 5000,
        tags: editingRule.tags || [],
      });
      setValidationRules(editingRule.validationRules || []);
      setTransformationRules(editingRule.transformationRules || []);
      setEnhancementRules(editingRule.enhancementRules || []);

      // Load configuration as formatted JSON
      console.log('Loading editingRule:', editingRule.ruleId, 'configuration:', editingRule.configuration);
      if (editingRule.configuration) {
        setConfigurationJson(JSON.stringify(editingRule.configuration, null, 2));
        setShowAdvancedConfig(true); // Auto-show if rule has configuration
      } else {
        setConfigurationJson('{}');
      }
    } else {
      // Reset configuration when switching from edit to create mode
      setConfigurationJson('{}');
      setConfigurationError(null);
    }
  }, [editingRule]);

  // Clear irrelevant rules when rule type changes
  useEffect(() => {
    if (formData.ruleType === 'BUSINESS_LOGIC') {
      // Only keep validation rules
      setTransformationRules([]);
      setEnhancementRules([]);
    } else if (formData.ruleType === 'PRE_PROCESSING') {
      // Only keep transformation rules
      setValidationRules([]);
      setEnhancementRules([]);
    } else if (formData.ruleType === 'DATA_ENHANCEMENT') {
      // Only keep enhancement rules
      setValidationRules([]);
      setTransformationRules([]);
    }
  }, [formData.ruleType]);

  // Try to fetch configuration schema when rule type or ID changes
  useEffect(() => {
    const fetchSchema = async () => {
      console.log('🔍 Fetching schema for:', formData.ruleType, 'ruleId:', formData.ruleId);
      setLoadingSchema(true);

      let schema: any = null;

      // Strategy 1: Try exact Rule ID match first
      console.log('🎯 Trying direct schema fetch by Rule ID...');
      const directSchema = await getSchema(formData.ruleId);
      if (directSchema && directSchema.ruleType === formData.ruleType) {
        schema = directSchema;
        console.log('✅ Found schema by exact ID match:', schema.schemaId);
      } else if (directSchema) {
        console.log(`⚠️ Schema found but Rule Type mismatch: schema expects ${directSchema.ruleType}, but form has ${formData.ruleType}`);
      } else {
        console.log('❌ No schema found by exact Rule ID');
      }

      // Strategy 2: If no exact match, try keyword-based suggestion
      if (!schema) {
        console.log('🔍 Trying keyword-based suggestion...');
        const ruleIdLower = formData.ruleId.toLowerCase();
        let purpose = '';
        if (ruleIdLower.includes('price')) purpose = 'price';
        else if (ruleIdLower.includes('sku')) purpose = 'sku';
        else if (ruleIdLower.includes('category')) purpose = 'category';
        else if (ruleIdLower.includes('stock')) purpose = 'stock';
        else if (ruleIdLower.includes('image')) purpose = 'image';

        console.log('📋 Detected purpose from keywords:', purpose || 'none');

        schema = await suggestSchema(formData.ruleType, purpose);
        if (schema) {
          console.log('✅ Found schema by suggestion:', schema.schemaId);
        }
      }

      if (schema) {
        setConfigurationSchema(schema);
        console.log('📝 Schema loaded:', schema.schemaId, 'with', schema.fields.length, 'fields');
        // If editing and has configuration, load it
        if (editingRule?.configuration) {
          setSchemaConfiguration(editingRule.configuration);
        }
      } else {
        setConfigurationSchema(null);
        console.log('❌ No schema found for Rule Type:', formData.ruleType, 'Rule ID:', formData.ruleId);
      }

      setLoadingSchema(false);
    };

    // Fetch schema when rule ID is entered or rule type changes
    if (formData.ruleId && formData.ruleId.length > 3) {
      fetchSchema();
    } else {
      // No rule ID yet, reset schema
      setConfigurationSchema(null);
      setLoadingSchema(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.ruleType, formData.ruleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfigurationError(null);

    // Validate required fields
    if (!formData.ruleId.trim()) {
      setError('Rule ID is required');
      return;
    }
    if (!formData.ruleName.trim()) {
      setError('Rule Name is required');
      return;
    }

    // Handle configuration based on whether schema is available
    let configurationObject: Record<string, any> | undefined;

    if (configurationSchema) {
      // Schema-based configuration
      // Clean up empty string values (convert to undefined for proper validation)
      const cleanedConfig = Object.keys(schemaConfiguration).reduce((acc, key) => {
        const val = schemaConfiguration[key];
        if (val !== '' && val !== null) {
          acc[key] = val;
        }
        return acc;
      }, {} as Record<string, any>);

      // Validate against schema
      const validation = await validateConfiguration(
        configurationSchema.schemaId,
        cleanedConfig
      );

      if (!validation.valid) {
        // Convert errors array to field-specific errors
        const fieldErrors: Record<string, string> = {};
        validation.errors.forEach((error) => {
          // Try to extract field name from error message
          const match = error.match(/Field '(\w+)'/);
          if (match) {
            fieldErrors[match[1]] = error;
          } else {
            fieldErrors['_general'] = error;
          }
        });
        setSchemaValidationErrors(fieldErrors);
        setError('Configuration validation failed. Please check the highlighted fields.');
        return;
      }

      configurationObject = cleanedConfig;
    } else {
      // Fallback to JSON configuration
      if (configurationJson.trim() && configurationJson.trim() !== '{}') {
        try {
          configurationObject = JSON.parse(configurationJson);
        } catch (err) {
          setConfigurationError('Invalid JSON format in Configuration field');
          return;
        }
      }
    }

    try {
      setSubmitting(true);

      // Prepare rule data - only include relevant rules based on type
      const ruleData: any = {
        ruleId: formData.ruleId,
        ruleName: formData.ruleName,
        ruleDescription: formData.ruleDescription,
        ruleType: formData.ruleType,
        priority: formData.priority,
        enabled: formData.enabled,
        applicableFields: formData.applicableFields,
        applicableCategories: formData.applicableCategories,
        supportedChannels: formData.supportedChannels,
        isCritical: formData.isCritical,
        executionTimeoutMs: formData.executionTimeoutMs,
        tags: formData.tags,
      };

      // Only include the relevant rules based on rule type
      if (formData.ruleType === 'BUSINESS_LOGIC') {
        ruleData.validationRules = validationRules;
      } else if (formData.ruleType === 'PRE_PROCESSING') {
        ruleData.transformationRules = transformationRules;
      } else if (formData.ruleType === 'DATA_ENHANCEMENT') {
        ruleData.enhancementRules = enhancementRules;
      }

      // Add configuration if provided
      if (configurationObject) {
        ruleData.configuration = configurationObject;
      }

      if (editingRule) {
        // When updating, preserve ALL backend fields that aren't in the form UI
        // This ensures no data is lost during update (backend may do full replacement)

        // Backend-specific fields
        if (editingRule.implementation) ruleData.implementation = editingRule.implementation;
        // NOTE: configuration is now handled by the form UI above, not preserved here
        if (editingRule.description) ruleData.description = editingRule.description;
        if (editingRule.performanceThresholdMs !== undefined) ruleData.performanceThresholdMs = editingRule.performanceThresholdMs;
        if (editingRule.tenantSpecific !== undefined) ruleData.tenantSpecific = editingRule.tenantSpecific;
        if (editingRule.organizationId) ruleData.organizationId = editingRule.organizationId;
        if (editingRule.metadata) ruleData.metadata = editingRule.metadata;
        if (editingRule.version) ruleData.version = editingRule.version;
        if (editingRule.author) ruleData.author = editingRule.author;

        // Preserve statistics fields (in case backend does full replacement)
        if (editingRule.executionCount !== undefined) ruleData.executionCount = editingRule.executionCount;
        if (editingRule.successCount !== undefined) ruleData.successCount = editingRule.successCount;
        if (editingRule.failureCount !== undefined) ruleData.failureCount = editingRule.failureCount;
        if (editingRule.avgExecutionTimeMs !== undefined) ruleData.avgExecutionTimeMs = editingRule.avgExecutionTimeMs;
        if (editingRule.lastExecutedAt) ruleData.lastExecutedAt = editingRule.lastExecutedAt;

        // Preserve audit fields
        if (editingRule.createdAt) ruleData.createdAt = editingRule.createdAt;
        if (editingRule.createdBy) ruleData.createdBy = editingRule.createdBy;

        // Update existing rule
        await updateBusinessRule(editingRule.ruleId, ruleData);
      } else {
        // Create new rule
        await createBusinessRule(ruleData);
      }

      onSuccess();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      ruleId: '',
      ruleName: '',
      ruleDescription: '',
      ruleType: 'BUSINESS_LOGIC',
      priority: 100,
      enabled: true,
      validationRules: [],
      transformationRules: [],
      enhancementRules: [],
      applicableFields: [],
      applicableCategories: [],
      supportedChannels: [],
      isCritical: false,
      executionTimeoutMs: 5000,
      tags: [],
    });
    setValidationRules([]);
    setTransformationRules([]);
    setEnhancementRules([]);
    setFieldInput('');
    setCategoryInput('');
    setChannelInput('');
    setTagInput('');
    setConfigurationJson('{}');
    setConfigurationError(null);
  };

  const addItem = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    array: string[],
    field: keyof CreateRuleRequest
  ) => {
    if (value.trim() && !array.includes(value.trim())) {
      setFormData({
        ...formData,
        [field]: [...array, value.trim()],
      });
      setter('');
    }
  };

  const removeItem = (index: number, array: string[], field: keyof CreateRuleRequest) => {
    setFormData({
      ...formData,
      [field]: array.filter((_, i) => i !== index),
    });
  };

  const formatConfigurationJson = () => {
    try {
      const parsed = JSON.parse(configurationJson);
      setConfigurationJson(JSON.stringify(parsed, null, 2));
      setConfigurationError(null);
    } catch (err) {
      setConfigurationError('Invalid JSON - cannot format');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-semibold">Error</p>
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ruleId}
                onChange={(e) => setFormData({ ...formData, ruleId: e.target.value })}
                disabled={!!editingRule}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                placeholder="PRICE_VALIDATION"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Unique identifier (cannot be changed after creation)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ruleName}
                onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Price Validation Rule"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.ruleDescription}
              onChange={(e) => setFormData({ ...formData, ruleDescription: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Describe what this rule does..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.ruleType}
                onChange={(e) => setFormData({ ...formData, ruleType: e.target.value as RuleType })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="PRE_PROCESSING">Pre Processing</option>
                <option value="BUSINESS_LOGIC">Business Logic</option>
                <option value="DATA_ENHANCEMENT">Data Enhancement</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.ruleType === 'PRE_PROCESSING' && 'Clean & normalize data (Transformations)'}
                {formData.ruleType === 'BUSINESS_LOGIC' && 'Enforce constraints (Validations)'}
                {formData.ruleType === 'DATA_ENHANCEMENT' && 'Add metadata (Enhancements)'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">Higher = executes first</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Execution Timeout (ms)
              </label>
              <input
                type="number"
                value={formData.executionTimeoutMs}
                onChange={(e) =>
                  setFormData({ ...formData, executionTimeoutMs: parseInt(e.target.value) })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="100"
              />
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Enabled</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isCritical}
                onChange={(e) => setFormData({ ...formData, isCritical: e.target.checked })}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <span className="ml-2 text-sm text-gray-700">Critical Rule</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Applicable Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Applicability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Applicable Fields
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={fieldInput}
                onChange={(e) => setFieldInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(fieldInput, setFieldInput, formData.applicableFields || [], 'applicableFields');
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="price, sku, name..."
              />
              <Button
                type="button"
                onClick={() => addItem(fieldInput, setFieldInput, formData.applicableFields || [], 'applicableFields')}
                variant="outline"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.applicableFields?.map((field, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => removeItem(index, formData.applicableFields || [], 'applicableFields')}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Applicable Categories
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(categoryInput, setCategoryInput, formData.applicableCategories || [], 'applicableCategories');
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="electronics, clothing..."
              />
              <Button
                type="button"
                onClick={() => addItem(categoryInput, setCategoryInput, formData.applicableCategories || [], 'applicableCategories')}
                variant="outline"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.applicableCategories?.map((category, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center"
                >
                  {category}
                  <button
                    type="button"
                    onClick={() => removeItem(index, formData.applicableCategories || [], 'applicableCategories')}
                    className="ml-2 text-green-600 hover:text-green-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supported Channels
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(channelInput, setChannelInput, formData.supportedChannels || [], 'supportedChannels');
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="shopify, lazada, amazon..."
              />
              <Button
                type="button"
                onClick={() => addItem(channelInput, setChannelInput, formData.supportedChannels || [], 'supportedChannels')}
                variant="outline"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.supportedChannels?.map((channel, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm flex items-center"
                >
                  {channel}
                  <button
                    type="button"
                    onClick={() => removeItem(index, formData.supportedChannels || [], 'supportedChannels')}
                    className="ml-2 text-purple-600 hover:text-purple-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(tagInput, setTagInput, formData.tags || [], 'tags');
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="validation, pricing, critical..."
              />
              <Button
                type="button"
                onClick={() => addItem(tagInput, setTagInput, formData.tags || [], 'tags')}
                variant="outline"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.tags?.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm flex items-center"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeItem(index, formData.tags || [], 'tags')}
                    className="ml-2 text-gray-600 hover:text-gray-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Configuration (Optional - Collapsible) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CardTitle>Configuration (Optional)</CardTitle>
              {configurationSchema ? (
                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                  Schema: {configurationSchema.schemaId}
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                  {formData.ruleId && formData.ruleId.length > 3 ? 'No schema found' : 'Enter Rule ID (4+ chars)'}
                </span>
              )}
              {loadingSchema && (
                <span className="text-xs text-gray-500">Loading schema...</span>
              )}
            </div>
            <Button
              type="button"
              onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
              variant="outline"
              size="sm"
            >
              {showAdvancedConfig ? '− Hide' : '+ Show'}
            </Button>
          </div>
        </CardHeader>

        {showAdvancedConfig && (
          <CardContent className="space-y-4">
            {/* Render Schema-Based Form if Available */}
            {configurationSchema ? (
              <SchemaBasedConfigurationForm
                schema={configurationSchema}
                configuration={schemaConfiguration}
                onChange={(newConfig) => {
                  setSchemaConfiguration(newConfig);
                  setSchemaValidationErrors({});
                }}
                errors={schemaValidationErrors}
              />
            ) : (
              <>
                {/* Check if editing existing rule with configuration */}
                {editingRule && editingRule.configuration ? (
                  <>
                    {/* Editing existing rule without schema - Show JSON Editor */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-amber-800">
                            Editing Existing Configuration (No Schema Available)
                          </h3>
                          <div className="mt-1 text-sm text-amber-700">
                            <p>
                              This rule has configuration but no matching schema. Edit the JSON carefully or rename the Rule ID to match a schema keyword.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* JSON Editor for existing configuration */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Configuration JSON
                        </label>
                        <div className="flex space-x-2">
                          <Button
                            type="button"
                            onClick={formatConfigurationJson}
                            variant="outline"
                            size="sm"
                          >
                            Format
                          </Button>
                        </div>
                      </div>
                      <textarea
                        value={configurationJson}
                        onChange={(e) => {
                          setConfigurationJson(e.target.value);
                          setConfigurationError(null);
                        }}
                        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 font-mono text-sm ${
                          configurationError
                            ? 'border-red-500 focus:ring-red-500'
                            : 'border-gray-300 focus:ring-blue-500'
                        }`}
                        rows={10}
                        placeholder={'{\n  "key": "value"\n}'}
                      />
                      {configurationError && (
                        <p className="text-red-600 text-sm mt-1">{configurationError}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-1">
                        ✓ Loaded from existing rule. Edit to update.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Creating new rule without schema - Show helpful info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-blue-800">
                            {formData.ruleId && formData.ruleId.length > 3 ? 'No Configuration Schema Found' : 'Waiting for Rule ID'}
                          </h3>
                          <div className="mt-1 text-sm text-blue-700">
                            {formData.ruleId && formData.ruleId.length > 3 ? (
                              <p>
                                To use guided configuration forms, include these keywords in your Rule ID: <strong>price</strong>, <strong>sku</strong>, <strong>category</strong>, <strong>stock</strong>, or <strong>image</strong>.
                              </p>
                            ) : (
                              <p>
                                Enter a Rule ID above (minimum 4 characters) to automatically load a configuration schema if available.
                                Try keywords like: PRICE_VALIDATION, SKU_TRANSFORM, CATEGORY_CHECK, STOCK_VALIDATION, IMAGE_VERIFY
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                {/* Configuration Requirements Information */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      📋 Available Configuration Schemas
                    </h4>
                    {availableSchemas.length > 0 ? (
                      <>
                        <p className="text-sm text-gray-700 mb-3">
                          To get a guided configuration form with field validation, create a rule with matching Rule Type and ID:
                        </p>

                        <div className="space-y-2">
                          {availableSchemas.map((schema, index) => {
                            const colors = [
                              { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', textLight: 'text-green-700', bgCode: 'bg-green-100' },
                              { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', textLight: 'text-blue-700', bgCode: 'bg-blue-100' },
                              { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', textLight: 'text-purple-700', bgCode: 'bg-purple-100' },
                              { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', textLight: 'text-amber-700', bgCode: 'bg-amber-100' },
                              { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', textLight: 'text-indigo-700', bgCode: 'bg-indigo-100' },
                            ];
                            const color = colors[index % colors.length];

                            const ruleTypeLabel = schema.ruleType === 'PRE_PROCESSING' ? 'Pre-Processing'
                              : schema.ruleType === 'BUSINESS_LOGIC' ? 'Business Logic'
                              : schema.ruleType === 'DATA_ENHANCEMENT' ? 'Data Enhancement'
                              : schema.ruleType;

                            return (
                              <div key={schema.schemaId} className={`${color.bg} ${color.border} border rounded p-3`}>
                                <div className="flex items-start">
                                  <span className={`${color.text} font-mono text-sm font-medium mr-2`}>{schema.schemaId}</span>
                                  <div className="flex-1">
                                    <p className="text-sm text-gray-700">
                                      <strong>{schema.schemaName}</strong> ({ruleTypeLabel})
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      {schema.description}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      <strong>Fields:</strong> {schema.fields.map(f => f.fieldName).join(', ')}
                                    </p>
                                    <p className={`text-xs ${color.textLight} mt-1`}>
                                      ✅ Use Rule ID: <code className={`${color.bgCode} px-1 rounded`}>{schema.schemaId}</code> with Rule Type: <strong>{ruleTypeLabel}</strong>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 italic">Loading available schemas...</p>
                    )}
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h5 className="text-sm font-medium text-gray-900 mb-2">💡 Recommendation</h5>
                      <p className="text-sm text-gray-700 mb-2">
                        If your rule requires configuration but doesn't match these schemas:
                      </p>
                      <ol className="text-sm text-gray-700 space-y-1 ml-4 list-decimal">
                        <li>Use the exact <strong>Rule ID</strong> and <strong>Rule Type</strong> shown above for the schema you need</li>
                        <li>Request your backend team to create a custom schema for your use case</li>
                        <li>This rule may not require configuration - you can submit without configuration</li>
                      </ol>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-xs text-gray-500 text-center">
                      Configuration will be validated against the schema before submission
                    </p>
                  </div>
                </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Rule Type Information Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800">
              {formData.ruleType === 'PRE_PROCESSING' && 'Pre-Processing Rules: Data Transformation'}
              {formData.ruleType === 'BUSINESS_LOGIC' && 'Business Logic Rules: Data Validation'}
              {formData.ruleType === 'DATA_ENHANCEMENT' && 'Data Enhancement Rules: Metadata & Enrichment'}
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              {formData.ruleType === 'PRE_PROCESSING' && (
                <p>
                  <strong>Purpose:</strong> Clean and normalize incoming data before validation.
                  <br />
                  <strong>Examples:</strong> TRIM whitespace, UPPERCASE SKU, ROUND prices
                  <br />
                  <strong>Execution:</strong> Runs FIRST (before validation)
                </p>
              )}
              {formData.ruleType === 'BUSINESS_LOGIC' && (
                <p>
                  <strong>Purpose:</strong> Enforce business constraints and validate data quality.
                  <br />
                  <strong>Examples:</strong> Price must be positive, SKU is required, Name min length
                  <br />
                  <strong>Execution:</strong> Runs SECOND (after pre-processing)
                </p>
              )}
              {formData.ruleType === 'DATA_ENHANCEMENT' && (
                <p>
                  <strong>Purpose:</strong> Add computed fields, AI-generated content, and metadata.
                  <br />
                  <strong>Examples:</strong> Auto-generate tags, Add category hierarchy, SEO optimization
                  <br />
                  <strong>Execution:</strong> Runs LAST (after validation passes)
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rule Builders - Only show relevant builder based on rule type */}

      {/* BUSINESS_LOGIC: Validation Rules Only */}
      {showValidationBuilder && (
        <ValidationRuleBuilder
          validationRules={validationRules}
          onChange={setValidationRules}
        />
      )}

      {/* PRE_PROCESSING: Transformation Rules Only */}
      {showTransformationBuilder && (
        <TransformationRuleBuilder
          transformationRules={transformationRules}
          onChange={setTransformationRules}
        />
      )}

      {/* DATA_ENHANCEMENT: Enhancement Rules Only */}
      {showEnhancementBuilder && (
        <EnhancementRuleBuilder
          enhancementRules={enhancementRules}
          onChange={setEnhancementRules}
        />
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4">
        {onCancel && (
          <Button type="button" onClick={onCancel} variant="outline">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
        </Button>
      </div>
    </form>
  );
};

export default RuleForm;
