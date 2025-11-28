"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card/Card';
import RulesList from './RulesList';
import RuleForm from './RuleForm';
import RuleStatistics from './RuleStatistics';
import type { BusinessRule, RuleFilter } from '@/types/businessRules';
import { getBusinessRules } from '@/services/businessRulesService';

type TabType = 'all-rules' | 'create-rule' | 'statistics';

const BusinessRulesManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('all-rules');
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<BusinessRule | null>(null);

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async (filter?: RuleFilter) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getBusinessRules(filter);
      if (response.success && response.rules) {
        setRules(response.rules);
      } else {
        setError('Failed to load business rules');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRuleCreated = () => {
    loadRules();
    setActiveTab('all-rules');
  };

  const handleRuleUpdated = () => {
    loadRules();
    setEditingRule(null);
    setActiveTab('all-rules');
  };

  const handleEditRule = (rule: BusinessRule) => {
    setEditingRule(rule);
    setActiveTab('create-rule');
  };

  const handleCancelEdit = () => {
    setEditingRule(null);
  };

  const tabs = [
    { id: 'all-rules' as TabType, label: 'All Rules', icon: '📋' },
    { id: 'create-rule' as TabType, label: 'Create Rule', icon: '➕' },
    { id: 'statistics' as TabType, label: 'Statistics', icon: '📊' },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl">Business Rules Management</CardTitle>
              <p className="text-gray-600 mt-2">
                Manage validation, transformation, and enhancement rules for your products
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Tab Navigation */}
          <div className="flex space-x-1 border-b border-gray-200 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'create-rule') {
                    setEditingRule(null);
                  }
                }}
                className={`px-6 py-3 font-medium text-sm transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
                {tab.id === 'create-rule' && editingRule && (
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                    Editing
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {activeTab === 'all-rules' && (
              <RulesList
                rules={rules}
                loading={loading}
                error={error}
                onRefresh={loadRules}
                onEditRule={handleEditRule}
              />
            )}

            {activeTab === 'create-rule' && (
              <RuleForm
                editingRule={editingRule}
                onSuccess={editingRule ? handleRuleUpdated : handleRuleCreated}
                onCancel={editingRule ? handleCancelEdit : undefined}
              />
            )}

            {activeTab === 'statistics' && <RuleStatistics />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessRulesManager;
