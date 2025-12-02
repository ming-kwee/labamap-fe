'use client';

/**
 * Rule Builder Component
 * Form for creating/editing conditional logic rules
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import Button from '@/shared/ui/button/Button';
import { Loader2, AlertCircle, Save, X, Plus, Trash2 } from '@/shared/ui/icons/Icons';
import { ConditionalLogicService } from '../services/conditionalLogicService';
import {
  ConditionalLogicRule,
  CreateRuleRequest,
  ConditionExpression,
  RuleAction
} from '../types/conditionalLogic';
import { OPERATORS, ACTIONS } from '../types/operators';

interface RuleBuilderProps {
  ruleId?: string; // If provided, edit mode
  onSave?: (rule: ConditionalLogicRule) => void;
  onCancel?: () => void;
}

export default function RuleBuilder({ ruleId, onSave, onCancel }: RuleBuilderProps) {
  const router = useRouter();
  const isEditMode = !!ruleId;

  // Form state
  const [formData, setFormData] = useState<CreateRuleRequest>({
    ruleName: '',
    description: '',
    triggerField: '',
    triggerValue: '',
    triggerOperator: 'EQUALS',
    conditions: [],
    logicalOperator: 'AND',
    actions: [],
    priority: 100,
    enabled: true,
    applicableCategories: [],
    supportedChannels: [],
    tags: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAdvancedConditions, setUseAdvancedConditions] = useState(false);

  // Load existing rule if in edit mode
  useEffect(() => {
    if (isEditMode && ruleId) {
      loadRule(ruleId);
    }
  }, [ruleId, isEditMode]);

  const loadRule = async (id: string) => {
    try {
      console.log('[RuleBuilder] Loading rule with ID:', id);
      setIsLoading(true);
      setError(null);

      const rule = await ConditionalLogicService.getRuleById(id);
      console.log('[RuleBuilder] Rule loaded from backend:', rule);

      if (!rule) {
        throw new Error('Rule not found or empty response from backend');
      }

      const formDataToSet = {
        ruleName: rule.ruleName,
        description: rule.description || '',
        triggerField: rule.triggerField || '',
        triggerValue: rule.triggerValue || '',
        triggerOperator: rule.triggerOperator || 'EQUALS',
        conditions: rule.conditions || [],
        logicalOperator: rule.logicalOperator || 'AND',
        actions: rule.actions || [],
        priority: rule.priority || 100,
        enabled: rule.enabled,
        applicableCategories: rule.applicableCategories || [],
        supportedChannels: rule.supportedChannels || [],
        tags: rule.tags || []
      };

      console.log('[RuleBuilder] Setting form data:', formDataToSet);
      setFormData(formDataToSet);

      // Use advanced conditions if conditions array exists
      const hasAdvancedConditions = (rule.conditions?.length || 0) > 0;
      console.log('[RuleBuilder] Has advanced conditions:', hasAdvancedConditions);
      setUseAdvancedConditions(hasAdvancedConditions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load rule';
      console.error('[RuleBuilder] Error loading rule:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[RuleBuilder] Form submitted');

    // Validation
    if (!formData.ruleName.trim()) {
      setError('Rule name is required');
      return;
    }

    if (formData.actions.length === 0) {
      setError('At least one action is required');
      return;
    }

    if (!useAdvancedConditions && !formData.triggerField) {
      setError('Trigger field is required for simple conditions');
      return;
    }

    if (useAdvancedConditions && (formData.conditions?.length || 0) === 0) {
      setError('At least one condition is required for advanced conditions');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      // Clean up data based on condition type
      const submitData: CreateRuleRequest = {
        ...formData,
        // If using simple conditions, clear advanced conditions
        conditions: useAdvancedConditions ? formData.conditions : undefined,
        // If using advanced conditions, clear simple trigger
        triggerField: useAdvancedConditions ? undefined : formData.triggerField,
        triggerValue: useAdvancedConditions ? undefined : formData.triggerValue,
        triggerOperator: useAdvancedConditions ? undefined : formData.triggerOperator,
      };

      console.log('[RuleBuilder] Submitting data:', submitData);

      let savedRule: ConditionalLogicRule;

      if (isEditMode && ruleId) {
        console.log('[RuleBuilder] Updating existing rule:', ruleId);
        savedRule = await ConditionalLogicService.updateRule(ruleId, submitData);
        console.log('[RuleBuilder] Rule updated successfully:', savedRule);
      } else {
        console.log('[RuleBuilder] Creating new rule');
        savedRule = await ConditionalLogicService.createRule(submitData);
        console.log('[RuleBuilder] Rule created successfully:', savedRule);
      }

      if (onSave) {
        onSave(savedRule);
      }

      console.log('[RuleBuilder] Navigating back to /conditional-logic');
      router.push('/conditional-logic');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save rule';
      console.error('[RuleBuilder] Error saving rule:', err);
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push('/conditional-logic');
    }
  };

  const addAction = () => {
    setFormData({
      ...formData,
      actions: [
        ...formData.actions,
        {
          actionType: 'SHOW_FIELD',
          targetField: '',
          actionConfig: {}
        }
      ]
    });
  };

  const updateAction = (index: number, action: RuleAction) => {
    const newActions = [...formData.actions];
    newActions[index] = action;
    setFormData({ ...formData, actions: newActions });
  };

  const removeAction = (index: number) => {
    setFormData({
      ...formData,
      actions: formData.actions.filter((_, i) => i !== index)
    });
  };

  const addCondition = () => {
    setFormData({
      ...formData,
      conditions: [
        ...(formData.conditions || []),
        {
          field: '',
          operator: 'EQUALS',
          value: '',
          dataType: 'STRING'
        }
      ]
    });
  };

  const updateCondition = (index: number, condition: ConditionExpression) => {
    const newConditions = [...(formData.conditions || [])];
    newConditions[index] = condition;
    setFormData({ ...formData, conditions: newConditions });
  };

  const removeCondition = (index: number) => {
    setFormData({
      ...formData,
      conditions: (formData.conditions || []).filter((_, i) => i !== index)
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditMode ? 'Edit Rule' : 'Create New Rule'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Define conditions and actions for dynamic form behavior
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEditMode ? 'Update Rule' : 'Create Rule'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Rule Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.ruleName}
              onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
              placeholder="e.g., Show Variants When Has Variants"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
              placeholder="Describe what this rule does"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Priority
              </label>
              <input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                min="1"
                max="1000"
              />
              <p className="text-xs text-gray-500 mt-1">Lower number = higher priority</p>
            </div>

            <div>
              <label className="flex items-center space-x-2 mt-8">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enabled
                </span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Conditions</CardTitle>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={useAdvancedConditions}
                onChange={(e) => setUseAdvancedConditions(e.target.checked)}
                className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Use Advanced Conditions
              </span>
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!useAdvancedConditions ? (
            // Simple Trigger
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Trigger Field <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.triggerField}
                    onChange={(e) => setFormData({ ...formData, triggerField: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                    placeholder="e.g., hasVariants"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Operator
                  </label>
                  <select
                    value={formData.triggerOperator}
                    onChange={(e) => setFormData({ ...formData, triggerOperator: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                  >
                    {Object.values(OPERATORS).map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Value
                  </label>
                  <input
                    type="text"
                    value={formData.triggerValue}
                    onChange={(e) => setFormData({ ...formData, triggerValue: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                    placeholder="e.g., true"
                  />
                </div>
              </div>
            </div>
          ) : (
            // Advanced Conditions
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Logical Operator
                  </label>
                  <select
                    value={formData.logicalOperator}
                    onChange={(e) => setFormData({ ...formData, logicalOperator: e.target.value as 'AND' | 'OR' })}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="AND">AND (all must be true)</option>
                    <option value="OR">OR (any can be true)</option>
                  </select>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Condition
                </Button>
              </div>

              {(formData.conditions || []).map((condition, index) => (
                <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Field
                      </label>
                      <input
                        type="text"
                        value={condition.field}
                        onChange={(e) =>
                          updateCondition(index, { ...condition, field: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                        placeholder="Field name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Operator
                      </label>
                      <select
                        value={condition.operator}
                        onChange={(e) =>
                          updateCondition(index, { ...condition, operator: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                      >
                        {Object.values(OPERATORS).map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Value
                      </label>
                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) =>
                          updateCondition(index, { ...condition, value: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                        placeholder="Value"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Type
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={condition.dataType}
                          onChange={(e) =>
                            updateCondition(index, { ...condition, dataType: e.target.value as any })
                          }
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                        >
                          <option value="STRING">String</option>
                          <option value="NUMBER">Number</option>
                          <option value="BOOLEAN">Boolean</option>
                          <option value="DATE">Date</option>
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeCondition(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {(formData.conditions?.length || 0) === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No conditions added. Click "Add Condition" to create one.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Actions</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addAction}>
              <Plus className="h-4 w-4 mr-2" />
              Add Action
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.actions.map((action, index) => (
            <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Action Type
                  </label>
                  <select
                    value={action.actionType}
                    onChange={(e) =>
                      updateAction(index, { ...action, actionType: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                  >
                    {Object.values(ACTIONS).map((act) => (
                      <option key={act.value} value={act.value}>
                        {act.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Field
                  </label>
                  <input
                    type="text"
                    value={action.targetField}
                    onChange={(e) =>
                      updateAction(index, { ...action, targetField: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                    placeholder="e.g., variants"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Value (optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={action.actionValue || ''}
                      onChange={(e) =>
                        updateAction(index, { ...action, actionValue: e.target.value })
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
                      placeholder="For SET_VALUE action"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeAction(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {formData.actions.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No actions added. Click "Add Action" to create one.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scope (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle>Scope (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Categories (comma-separated)
            </label>
            <input
              type="text"
              value={formData.applicableCategories?.join(', ') || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  applicableCategories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
              placeholder="e.g., electronics, clothing (leave empty for all)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Channels (comma-separated)
            </label>
            <input
              type="text"
              value={formData.supportedChannels?.join(', ') || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  supportedChannels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
              placeholder="e.g., shopify, amazon (leave empty for all)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={formData.tags?.join(', ') || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 dark:bg-gray-800 dark:text-white"
              placeholder="e.g., variants, pricing"
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
