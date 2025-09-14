/**
 * What is ExampleUsage for? - Live Demo
 * Click any button to see what each example actually does
 */

"use client";
import React, { useState } from 'react';
import {
  SimpleProductCreation,
  ProductListWithSearch,
  AdvancedProductForm,
  BulkOperationsExample,
  RealTimeProductUpdates,
} from '@/lib/api/examples/ExampleUsage';

const examples = [
  {
    id: 'simple',
    title: '📝 Simple Product Creation',
    description: 'Basic form to create a product with just a name',
    whatItDoes: 'Shows you how to create products with minimal code',
    tryThis: 'Enter a product name and click Create. Watch the loading state!',
    component: SimpleProductCreation,
    color: 'blue',
  },
  {
    id: 'list',
    title: '📋 Product List & Search',
    description: 'Browse, search, filter, and delete products',
    whatItDoes: 'Displays a list of products with search and pagination',
    tryThis: 'Search for products, change filters, navigate pages, delete items',
    component: ProductListWithSearch,
    color: 'green',
  },
  {
    id: 'advanced',
    title: '🚀 Advanced Product Form',
    description: 'Complete product form with all features',
    whatItDoes: 'Full product creation with categories, file upload, SKU generation',
    tryThis: 'Fill out the form, upload images, generate SKU automatically',
    component: AdvancedProductForm,
    color: 'purple',
  },
  {
    id: 'bulk',
    title: '⚡ Bulk Operations',
    description: 'Select multiple products and perform batch operations',
    whatItDoes: 'Demonstrates how to work with multiple products at once',
    tryThis: 'Select multiple products and try bulk delete or status updates',
    component: BulkOperationsExample,
    color: 'orange',
  },
  {
    id: 'realtime',
    title: '🔄 Real-time Updates',
    description: 'Update products instantly as you type',
    whatItDoes: 'Shows real-time API calls when form fields change',
    tryThis: 'Enter a product ID, then change fields to see instant updates',
    component: RealTimeProductUpdates,
    color: 'teal',
  },
];

export default function APIDemoPage() {
  const [activeExample, setActiveExample] = useState<string | null>(null);
  
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      button: 'bg-blue-500 hover:bg-blue-600 text-white',
      text: 'text-blue-900 dark:text-blue-300',
      subtext: 'text-blue-800 dark:text-blue-400',
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      button: 'bg-green-500 hover:bg-green-600 text-white',
      text: 'text-green-900 dark:text-green-300',
      subtext: 'text-green-800 dark:text-green-400',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-800',
      button: 'bg-purple-500 hover:bg-purple-600 text-white',
      text: 'text-purple-900 dark:text-purple-300',
      subtext: 'text-purple-800 dark:text-purple-400',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800',
      button: 'bg-orange-500 hover:bg-orange-600 text-white',
      text: 'text-orange-900 dark:text-orange-300',
      subtext: 'text-orange-800 dark:text-orange-400',
    },
    teal: {
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      border: 'border-teal-200 dark:border-teal-800',
      button: 'bg-teal-500 hover:bg-teal-600 text-white',
      text: 'text-teal-900 dark:text-teal-300',
      subtext: 'text-teal-800 dark:text-teal-400',
    },
  };

  const ActiveComponent = activeExample 
    ? examples.find(ex => ex.id === activeExample)?.component
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            🤔 What is ExampleUsage for?
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-2">
            Click any example below to see what our API integration can do
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            These are working examples you can copy and modify for your own projects
          </p>
        </div>

        {/* Examples Grid */}
        {!activeExample && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {examples.map((example) => {
              const colors = colorClasses[example.color as keyof typeof colorClasses];
              
              return (
                <div
                  key={example.id}
                  className={`${colors.bg} ${colors.border} border rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer`}
                  onClick={() => setActiveExample(example.id)}
                >
                  <h3 className={`text-xl font-semibold ${colors.text} mb-3`}>
                    {example.title}
                  </h3>
                  
                  <p className={`${colors.subtext} mb-4`}>
                    {example.description}
                  </p>
                  
                  <div className="mb-4">
                    <h4 className={`font-medium ${colors.text} mb-1`}>
                      What it does:
                    </h4>
                    <p className={`text-sm ${colors.subtext}`}>
                      {example.whatItDoes}
                    </p>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className={`font-medium ${colors.text} mb-1`}>
                      Try this:
                    </h4>
                    <p className={`text-sm ${colors.subtext}`}>
                      {example.tryThis}
                    </p>
                  </div>
                  
                  <button 
                    className={`w-full ${colors.button} px-4 py-2 rounded-lg font-medium transition-colors`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveExample(example.id);
                    }}
                  >
                    Try This Example →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Active Example */}
        {activeExample && ActiveComponent && (
          <div className="space-y-6">
            {/* Back button and title */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setActiveExample(null)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                ← Back to Examples
              </button>
              
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {examples.find(ex => ex.id === activeExample)?.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  {examples.find(ex => ex.id === activeExample)?.description}
                </p>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                💡 What to try:
              </h3>
              <p className="text-blue-800 dark:text-blue-400">
                {examples.find(ex => ex.id === activeExample)?.tryThis}
              </p>
            </div>

            {/* Live Example */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <ActiveComponent />
            </div>

            {/* What you learned */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-2">
                ✅ What this example shows you:
              </h3>
              <p className="text-green-800 dark:text-green-400">
                {examples.find(ex => ex.id === activeExample)?.whatItDoes}
              </p>
            </div>
          </div>
        )}

        {/* Overall Purpose */}
        {!activeExample && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">
              🎯 Purpose of ExampleUsage Components
            </h2>
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div>
                <h3 className="font-semibold mb-2">📖 Learn the API</h3>
                <p className="text-blue-100">
                  See how to use our hooks and services with real working code
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🚀 Quick Start</h3>
                <p className="text-blue-100">
                  Copy these examples and modify them for your own projects
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">🔧 Best Practices</h3>
                <p className="text-blue-100">
                  Learn proper error handling, loading states, and form validation
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}