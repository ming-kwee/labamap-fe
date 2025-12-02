'use client';

/**
 * Conditional Logic Manager
 * Main UI for managing conditional logic rules
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import Button from '@/shared/ui/button/Button';
import { Loader2, AlertCircle, Plus, Settings, BarChart } from '@/shared/ui/icons/Icons';
import { ConditionalLogicService } from '../services/conditionalLogicService';
import {
  ConditionalLogicRule,
  ConditionalLogicStats,
  CreateRuleRequest
} from '../types/conditionalLogic';

export default function ConditionalLogicManager() {
  const router = useRouter();
  const [rules, setRules] = useState<ConditionalLogicRule[]>([]);
  const [stats, setStats] = useState<ConditionalLogicStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<ConditionalLogicRule | null>(null);

  // Load rules and stats
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [rulesData, statsData] = await Promise.all([
        ConditionalLogicService.getAllRules(),
        ConditionalLogicService.getStats()
      ]);

      setRules(rulesData);
      setStats(statsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conditional logic rules';
      setError(errorMessage);
      console.error('[ConditionalLogicManager] Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    console.log('[ConditionalLogicManager] Toggle rule clicked:', ruleId);
    try {
      setError(null);
      await ConditionalLogicService.toggleRule(ruleId);
      console.log('[ConditionalLogicManager] Rule toggled successfully');
      await loadData(); // Reload to get updated data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle rule';
      console.error('[ConditionalLogicManager] Toggle error:', err);
      setError(errorMessage);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    console.log('[ConditionalLogicManager] Delete rule clicked:', ruleId);
    if (!confirm('Are you sure you want to delete this rule?')) {
      console.log('[ConditionalLogicManager] Delete cancelled by user');
      return;
    }

    try {
      setError(null);
      await ConditionalLogicService.deleteRule(ruleId);
      console.log('[ConditionalLogicManager] Rule deleted successfully');
      await loadData(); // Reload to get updated data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete rule';
      console.error('[ConditionalLogicManager] Delete error:', err);
      setError(errorMessage);
    }
  };

  const handleEditRule = (rule: ConditionalLogicRule) => {
    console.log('[ConditionalLogicManager] Edit rule clicked:', rule.id);
    router.push(`/conditional-logic/edit/${rule.id}`);
  };

  const handleCreateRule = () => {
    console.log('[ConditionalLogicManager] Create rule clicked');
    router.push('/conditional-logic/create');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-brand-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading conditional logic rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Conditional Logic Rules
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage dynamic form behavior and field interactions
          </p>
        </div>
        <Button variant="primary" onClick={handleCreateRule}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-brand-600">{stats.totalRules}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total Rules</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{stats.enabledRules}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Enabled</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-600">{stats.disabledRules}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Disabled</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{stats.totalExecutions}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total Executions</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle>Rules List</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Rules Created
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Get started by creating your first conditional logic rule
              </p>
              <Button variant="primary" onClick={handleCreateRule}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Rule
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                          {rule.ruleName}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            rule.enabled
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {rule.priority && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Priority: {rule.priority}
                          </span>
                        )}
                      </div>

                      {rule.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {rule.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm">
                        {rule.triggerField && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Trigger: </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {rule.triggerField} {rule.triggerOperator} {rule.triggerValue}
                            </span>
                          </div>
                        )}

                        {rule.conditions && rule.conditions.length > 0 && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Conditions: </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {rule.conditions.length} condition(s)
                            </span>
                          </div>
                        )}

                        {rule.actions && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Actions: </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {rule.actions.length} action(s)
                            </span>
                          </div>
                        )}

                        {rule.executionCount !== undefined && rule.executionCount > 0 && (
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Executed: </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {rule.executionCount} times
                            </span>
                          </div>
                        )}
                      </div>

                      {rule.tags && rule.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {rule.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleRule(rule.id!)}
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditRule(rule)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id!)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>About Conditional Logic Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Conditional logic rules control dynamic form behavior based on field values. Use them to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Show or hide fields conditionally</li>
              <li>Make fields required or optional based on context</li>
              <li>Set field values automatically</li>
              <li>Filter dropdown options dynamically</li>
              <li>Execute UI actions when conditions are met</li>
            </ul>
            <p className="mt-4">
              <strong>Example:</strong> "Show variant options when hasVariants is true" or "Require
              shipping dimensions when weight is greater than 5kg"
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
