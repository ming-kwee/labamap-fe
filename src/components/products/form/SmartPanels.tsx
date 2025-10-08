import React from 'react';
import Badge from '@/components/ui/badge/Badge';
import { CheckCircle2 } from '@/components/ui/icons/Icons';
import { CategoryConfiguration } from '@/services/MasterProductService';

interface SmartSuggestionsProps {
  fieldSuggestions: Record<string, string>;
}

export function SmartSuggestions({ fieldSuggestions }: SmartSuggestionsProps) {
  if (Object.keys(fieldSuggestions).length === 0) return null;

  return (
    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">💡 Smart Suggestions</h4>
      <div className="space-y-1">
        {Object.entries(fieldSuggestions).map(([field, suggestion]) => (
          <div key={field} className="text-xs text-blue-700 dark:text-blue-300">
            <strong>{field}:</strong> {suggestion}
          </div>
        ))}
      </div>
    </div>
  );
}

interface RequiredFieldsNoticeProps {
  categoryRequiredFields: string[];
  categoryConfig: CategoryConfiguration | null;
  category: string;
}

export function RequiredFieldsNotice({ 
  categoryRequiredFields, 
  categoryConfig, 
  category 
}: RequiredFieldsNoticeProps) {
  if (categoryRequiredFields.length === 0) return null;

  return (
    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
      <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
        ⚠️ Required for {category}
      </h4>
      <div className="text-xs text-amber-700 dark:text-amber-300">
        Fields: {categoryRequiredFields.join(', ')}
      </div>
      {categoryConfig && categoryConfig.confidenceScore && (
        <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center space-x-1">
          <span>📊 {categoryConfig.confidenceScore.toFixed(1)}%</span>
          {categoryConfig.source && (
            <span className="bg-amber-200 dark:bg-amber-800 px-1 rounded text-xs">
              {categoryConfig.source}
            </span>
          )}
        </div>
      )}
    </div>
  );
}