"use client";

import React, { useState, useMemo } from 'react';
import type { BusinessRule, RuleFilter, RuleType } from '@/types/businessRules';
import { deleteBusinessRule, toggleBusinessRule, filterRulesLocally } from '@/services/businessRulesService';
import Button from '@/shared/ui/button/Button';
import { Card, CardContent } from '@/shared/ui/card/Card';

interface RulesListProps {
  rules: BusinessRule[];
  loading: boolean;
  error: string | null;
  onRefresh: (filter?: RuleFilter) => void;
  onEditRule: (rule: BusinessRule) => void;
}

const RulesList: React.FC<RulesListProps> = ({
  rules,
  loading,
  error,
  onRefresh,
  onEditRule,
}) => {
  const [filter, setFilter] = useState<RuleFilter>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [showReEnableForm, setShowReEnableForm] = useState(false);
  const [reEnableRuleId, setReEnableRuleId] = useState('');

  // Filter rules locally
  const filteredRules = useMemo(() => {
    return filterRulesLocally(rules, { ...filter, search: searchTerm });
  }, [rules, filter, searchTerm]);

  const handleToggle = async (ruleId: string) => {
    try {
      setTogglingRuleId(ruleId);
      const response = await toggleBusinessRule(ruleId);

      // Refresh to get updated data
      onRefresh();

      // Show success message with explanation
      if (response.success) {
        if (response.enabled) {
          alert(`Rule "${ruleId}" has been enabled`);
        } else {
          alert(`Rule "${ruleId}" has been disabled.\n\nNote: Disabled rules are hidden from the list but can be re-enabled using the "Re-enable Disabled Rule" button.`);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle rule');
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleReEnableRule = async () => {
    if (!reEnableRuleId.trim()) {
      alert('Please enter a Rule ID');
      return;
    }

    try {
      setTogglingRuleId(reEnableRuleId);
      const response = await toggleBusinessRule(reEnableRuleId);

      if (response.success && response.enabled) {
        alert(`Rule "${reEnableRuleId}" has been re-enabled successfully!`);
        setReEnableRuleId('');
        setShowReEnableForm(false);
        onRefresh();
      } else if (response.success && !response.enabled) {
        alert(`Rule "${reEnableRuleId}" was already disabled. It has now been enabled.`);
        setReEnableRuleId('');
        setShowReEnableForm(false);
        onRefresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to re-enable rule "${reEnableRuleId}". Make sure the Rule ID is correct.`);
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm(`Are you sure you want to delete rule "${ruleId}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingRuleId(ruleId);
      await deleteBusinessRule(ruleId);
      // Refresh without filter after delete
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setDeletingRuleId(null);
    }
  };

  const getRuleTypeBadgeColor = (type: RuleType): string => {
    switch (type) {
      case 'PRE_PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'BUSINESS_LOGIC':
        return 'bg-green-100 text-green-800';
      case 'DATA_ENHANCEMENT':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRuleType = (type: RuleType): string => {
    return type.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading business rules...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Rules</h3>
        <p className="text-red-600">{error}</p>
        <Button onClick={() => onRefresh()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by name, ID, description, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Rule Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rule Type
            </label>
            <select
              value={filter.type || ''}
              onChange={(e) =>
                setFilter({ ...filter, type: e.target.value as RuleType | undefined })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="PRE_PROCESSING">Pre Processing</option>
              <option value="BUSINESS_LOGIC">Business Logic</option>
              <option value="DATA_ENHANCEMENT">Data Enhancement</option>
            </select>
          </div>

          {/* Enabled Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filter.enabled === undefined ? '' : filter.enabled.toString()}
              onChange={(e) =>
                setFilter({
                  ...filter,
                  enabled: e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing <span className="font-semibold">{filteredRules.length}</span> of{' '}
            <span className="font-semibold">{rules.length}</span> rules
          </p>
          <div className="flex space-x-2">
            <Button
              onClick={() => setShowReEnableForm(!showReEnableForm)}
              variant="outline"
              size="sm"
            >
              {showReEnableForm ? '✕ Close' : '↻ Re-enable'}
            </Button>
            <Button onClick={() => onRefresh(filter)} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Re-enable Form */}
      {showReEnableForm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Re-enable a Disabled Rule</h3>
          <p className="text-sm text-gray-600 mb-4">
            Enter the Rule ID of a disabled rule to re-enable it. Disabled rules are hidden from the list but still exist in the database.
          </p>
          <div className="flex space-x-2">
            <input
              type="text"
              value={reEnableRuleId}
              onChange={(e) => setReEnableRuleId(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleReEnableRule();
                }
              }}
              placeholder="Enter Rule ID (e.g., PRICE_VALIDATION)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              onClick={handleReEnableRule}
              disabled={togglingRuleId === reEnableRuleId}
            >
              {togglingRuleId === reEnableRuleId ? 'Re-enabling...' : 'Re-enable'}
            </Button>
            <Button
              onClick={() => {
                setShowReEnableForm(false);
                setReEnableRuleId('');
              }}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Rules Table */}
      {filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 text-lg">No business rules found</p>
            <p className="text-gray-400 text-sm mt-2">
              {searchTerm || filter.type || filter.enabled !== undefined
                ? 'Try adjusting your filters'
                : 'Create your first business rule to get started'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRules.map((rule, index) => (
            <Card key={rule.id || `${rule.ruleId}-${index}`} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {rule.ruleName}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getRuleTypeBadgeColor(
                          rule.ruleType
                        )}`}
                      >
                        {formatRuleType(rule.ruleType)}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          rule.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {rule.isCritical && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Critical
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-500 mb-1">ID: {rule.ruleId}</p>
                    {rule.ruleDescription && (
                      <p className="text-sm text-gray-700 mb-3">{rule.ruleDescription}</p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Priority:</span>{' '}
                        <span className="font-medium">{rule.priority}</span>
                      </div>
                      {rule.executionCount !== undefined && (
                        <div>
                          <span className="text-gray-500">Executions:</span>{' '}
                          <span className="font-medium">{rule.executionCount}</span>
                        </div>
                      )}
                      {rule.successCount !== undefined && rule.executionCount !== undefined && rule.executionCount > 0 && (
                        <div>
                          <span className="text-gray-500">Success Rate:</span>{' '}
                          <span className="font-medium">
                            {((rule.successCount / rule.executionCount) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {rule.avgExecutionTimeMs !== undefined && rule.avgExecutionTimeMs !== null && (
                        <div>
                          <span className="text-gray-500">Avg Time:</span>{' '}
                          <span className="font-medium">{rule.avgExecutionTimeMs.toFixed(2)}ms</span>
                        </div>
                      )}
                    </div>

                    {rule.tags && rule.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rule.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2 ml-4">
                    <Button
                      onClick={() => handleToggle(rule.ruleId)}
                      variant="outline"
                      size="sm"
                      disabled={togglingRuleId === rule.ruleId}
                    >
                      {togglingRuleId === rule.ruleId
                        ? 'Toggling...'
                        : rule.enabled
                        ? 'Disable'
                        : 'Enable'}
                    </Button>
                    <Button onClick={() => onEditRule(rule)} variant="outline" size="sm">
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDelete(rule.ruleId)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      disabled={deletingRuleId === rule.ruleId}
                    >
                      {deletingRuleId === rule.ruleId ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default RulesList;
