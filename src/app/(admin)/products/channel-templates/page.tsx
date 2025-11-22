"use client";
import ChannelTemplateManager from "@/components/products/templates/ChannelTemplateManager";

export default function ChannelTemplatesPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-xl font-bold text-gray-900 dark:text-white">
              Channel Mapping Templates
            </h1>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400 mt-2">
              Create and manage reusable channel mapping templates for efficient product distribution across multiple sales channels.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-title-md font-semibold text-gray-900 dark:text-white">
                Smart Templates
              </div>
              <div className="text-theme-sm text-gray-500 dark:text-gray-400">
                Automated mapping & optimization
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Features Info */}
      {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">🎯</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Field Mapping</h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">Smart field associations</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">🎨</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Content Generation</h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">AI-powered optimization</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">🔄</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Bulk Application</h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">Apply to multiple products</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <span className="text-title-md">✅</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Validation Rules</h3>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">Ensure data compliance</p>
            </div>
          </div>
        </div>
      </div> */}

      {/* Template Manager Component */}
      <ChannelTemplateManager />
    </div>
  );
}