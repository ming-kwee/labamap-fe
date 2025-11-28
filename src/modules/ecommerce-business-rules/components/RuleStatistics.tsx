"use client";

import React, { useState, useEffect } from 'react';
import type { RuleStatistics as RuleStatsType } from '@/types/businessRules';
import { getBusinessRulesStatistics } from '@/services/businessRulesService';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';

const RuleStatistics: React.FC = () => {
  const [statistics, setStatistics] = useState<RuleStatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getBusinessRulesStatistics();
      if (response.success && response.statistics) {
        setStatistics(response.statistics);
        setLastRefresh(new Date());
      } else {
        setError('Failed to load statistics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Statistics</h3>
        <p className="text-red-600">{error}</p>
        <Button onClick={loadStatistics} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-600">No statistics available</p>
      </div>
    );
  }

  const successRate =
    statistics.totalExecutions > 0
      ? ((statistics.successfulExecutions / statistics.totalExecutions) * 100).toFixed(2)
      : '0';

  const failureRate =
    statistics.totalExecutions > 0
      ? ((statistics.failedExecutions / statistics.totalExecutions) * 100).toFixed(2)
      : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Business Rules Statistics</h3>
          <p className="text-sm text-gray-600 mt-1">
            Last updated: {lastRefresh.toLocaleString()}
          </p>
        </div>
        <Button onClick={loadStatistics} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Rules */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Rules</p>
                <p className="text-3xl font-bold text-gray-900">{statistics.totalRules}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📋</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Executions */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Executions</p>
                <p className="text-3xl font-bold text-gray-900">
                  {statistics.totalExecutions.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⚡</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Success Rate</p>
                <p className="text-3xl font-bold text-green-600">{successRate}%</p>
                <p className="text-xs text-gray-500 mt-1">
                  {statistics.successfulExecutions.toLocaleString()} successful
                </p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Execution Time */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Avg Execution Time</p>
                <p className="text-3xl font-bold text-orange-600">
                  {(statistics.averageExecutionTimeMs || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">milliseconds</p>
              </div>
              <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⏱️</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Execution Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Execution Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Successful Executions</span>
                  <span className="text-sm font-semibold text-green-600">
                    {statistics.successfulExecutions.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${successRate}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Failed Executions</span>
                  <span className="text-sm font-semibold text-red-600">
                    {statistics.failedExecutions.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${failureRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">Performance Status</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    statistics.averageExecutionTimeMs < 10
                      ? 'bg-green-100 text-green-800'
                      : statistics.averageExecutionTimeMs < 50
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {statistics.averageExecutionTimeMs < 10
                    ? 'Excellent'
                    : statistics.averageExecutionTimeMs < 50
                    ? 'Good'
                    : 'Needs Optimization'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">Reliability Status</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    parseFloat(successRate) >= 99
                      ? 'bg-green-100 text-green-800'
                      : parseFloat(successRate) >= 95
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {parseFloat(successRate) >= 99
                    ? 'Excellent'
                    : parseFloat(successRate) >= 95
                    ? 'Good'
                    : 'Needs Attention'}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">Total Operations</span>
                <span className="text-sm font-semibold text-gray-900">
                  {statistics.totalExecutions.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Recommendations */}
      {(statistics.averageExecutionTimeMs > 50 || parseFloat(failureRate) > 5) && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">Performance Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-yellow-900">
              {statistics.averageExecutionTimeMs > 50 && (
                <li className="flex items-start">
                  <span className="mr-2">⚠️</span>
                  <span>
                    Average execution time is {(statistics.averageExecutionTimeMs || 0).toFixed(2)}ms.
                    Consider optimizing slow rules or increasing timeout thresholds.
                  </span>
                </li>
              )}
              {parseFloat(failureRate) > 5 && (
                <li className="flex items-start">
                  <span className="mr-2">⚠️</span>
                  <span>
                    Failure rate is {failureRate}%. Review failed rules and consider adjusting
                    validation logic or field applicability.
                  </span>
                </li>
              )}
              {statistics.totalRules > 50 && (
                <li className="flex items-start">
                  <span className="mr-2">💡</span>
                  <span>
                    You have {statistics.totalRules} rules. Consider consolidating similar rules to
                    improve maintainability.
                  </span>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RuleStatistics;
