"use client";
import React from "react";
import { ProductData } from "../ProductCreateForm";

interface ProductAnalyticsProps {
  data: ProductData;
}

export default function ProductAnalytics({ }: ProductAnalyticsProps) {
  const mockMetrics = {
    views: 1247,
    conversions: 23,
    revenue: 2340,
    conversionRate: 1.8
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Product Analytics</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{mockMetrics.views}</div>
            <div className="text-sm text-blue-800">Total Views</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{mockMetrics.conversions}</div>
            <div className="text-sm text-green-800">Conversions</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">${mockMetrics.revenue}</div>
            <div className="text-sm text-purple-800">Revenue</div>
          </div>
          <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{mockMetrics.conversionRate}%</div>
            <div className="text-sm text-orange-800">Conversion Rate</div>
          </div>
        </div>
        
        <div className="mt-6">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">Performance Insights</h3>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>📈 Views increased 15% this week</p>
            <p>💰 Revenue up 8% compared to similar products</p>
            <p>🎯 Conversion rate above category average</p>
          </div>
        </div>
      </div>
    </div>
  );
}