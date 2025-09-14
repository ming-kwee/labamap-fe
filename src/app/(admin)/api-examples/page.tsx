/**
 * API Examples Demo Page
 * Click and see what each example actually does
 */

"use client";
import { CompleteAPIExamples } from '@/lib/api/examples/ExampleUsage';

export default function APIExamplesPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 mb-8 border border-gray-200 dark:border-gray-700">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            🚀 API Integration Examples
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
            Click the tabs below to see live examples of what our API integration can do.
          </p>
          
          {/* What you can do with these examples */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                📝 Create Products
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-400">
                Simple forms to add new products with validation and feedback
              </p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-green-900 dark:text-green-300 mb-2">
                🔍 Search & Filter
              </h3>
              <p className="text-sm text-green-800 dark:text-green-400">
                Find products quickly with search, filters, and pagination
              </p>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">
                📁 Upload Files
              </h3>
              <p className="text-sm text-purple-800 dark:text-purple-400">
                Upload images, generate SKUs, and manage product media
              </p>
            </div>
            
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-orange-900 dark:text-orange-300 mb-2">
                ⚡ Bulk Operations
              </h3>
              <p className="text-sm text-orange-800 dark:text-orange-400">
                Select multiple products and update or delete them at once
              </p>
            </div>
            
            <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-teal-900 dark:text-teal-300 mb-2">
                🔄 Real-time Updates
              </h3>
              <p className="text-sm text-teal-800 dark:text-teal-400">
                Update products instantly as you type or change values
              </p>
            </div>
            
            <div className="bg-pink-50 dark:bg-pink-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-pink-900 dark:text-pink-300 mb-2">
                🎯 Complete Solution
              </h3>
              <p className="text-sm text-pink-800 dark:text-pink-400">
                Full product management with all features integrated
              </p>
            </div>
          </div>
          
          {/* Instructions */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              🎮 How to Use These Examples
            </h3>
            <ul className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
              <li>• <strong>Click the tabs below</strong> to switch between different examples</li>
              <li>• <strong>Try interacting</strong> with the forms, buttons, and inputs</li>
              <li>• <strong>Watch the console</strong> to see API calls and responses (F12 Developer Tools)</li>
              <li>• <strong>Notice the loading states</strong> and error handling</li>
              <li>• <strong>Copy the code</strong> from these examples for your own projects</li>
            </ul>
          </div>
        </div>

        {/* Live Examples */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <CompleteAPIExamples />
        </div>
        
        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 dark:text-gray-400">
          <p className="mb-2">
            🔗 <strong>API Integration System</strong> - Complete centralized solution for backend communication
          </p>
          <p className="text-sm">
            View the source code in <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">/src/lib/api/examples/</code>
          </p>
        </div>
      </div>
    </div>
  );
}