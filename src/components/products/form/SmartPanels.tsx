import React from 'react';
import Badge from '@/components/ui/badge/Badge';
import { CheckCircle2, Star, AlertCircle } from '@/components/ui/icons/Icons';
import { CategoryConfiguration } from '@/services/MasterProductService';
import { FormField } from '@/types/dynamicForm';

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
      <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1 flex items-center">
        <AlertCircle className="h-4 w-4 mr-1" />
        Required for {category}
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

// Schema-driven field insights panel
interface SchemaInsightsProps {
  schema: { fields: FormField[] } | null;
  formData: Record<string, any>;
}

export function SchemaInsights({ schema, formData }: SchemaInsightsProps) {
  if (!schema?.fields) return null;

  const requiredFields = schema.fields.filter(f => f.required);
  const completedRequired = requiredFields.filter(f => {
    const value = formData[f.fieldName];
    return value !== undefined && value !== null && value !== '';
  });
  
  const conditionalFields = schema.fields.filter(f => f.conditionalVisibility);
  const activeConditionalFields = conditionalFields.filter(f => {
    // Simple check - in real implementation would evaluate conditional expressions
    return formData[f.fieldName] !== undefined;
  });

  const completionPercentage = requiredFields.length > 0 
    ? Math.round((completedRequired.length / requiredFields.length) * 100)
    : 100;

  return (
    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center">
        <Star className="h-4 w-4 mr-1" />
        Form Insights
      </h4>
      
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-blue-700 dark:text-blue-300">Progress:</span>
          <div className="flex items-center space-x-2">
            <div className="w-16 bg-blue-200 dark:bg-blue-800 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              {completionPercentage}%
            </span>
          </div>
        </div>
        
        <div className="text-blue-700 dark:text-blue-300">
          Required: {completedRequired.length}/{requiredFields.length} completed
        </div>
        
        {conditionalFields.length > 0 && (
          <div className="text-blue-700 dark:text-blue-300">
            Conditional: {activeConditionalFields.length}/{conditionalFields.length} active
          </div>
        )}
        
        <div className="text-blue-700 dark:text-blue-300">
          Total fields: {schema.fields.length}
        </div>
      </div>
    </div>
  );
}

// Field validation summary panel
interface FieldValidationSummaryProps {
  fieldErrors: Record<string, string[]>;
  fieldWarnings?: Record<string, string[]>;
}

export function FieldValidationSummary({ fieldErrors, fieldWarnings = {} }: FieldValidationSummaryProps) {
  const errorCount = Object.keys(fieldErrors).length;
  const warningCount = Object.keys(fieldWarnings).length;
  
  if (errorCount === 0 && warningCount === 0) {
    return (
      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center text-sm text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          All fields are valid
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
      <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2 flex items-center">
        <AlertCircle className="h-4 w-4 mr-1" />
        Validation Summary
      </h4>
      
      <div className="space-y-1 text-xs">
        {errorCount > 0 && (
          <div className="text-red-700 dark:text-red-300">
            {errorCount} field{errorCount > 1 ? 's' : ''} with errors
          </div>
        )}
        
        {warningCount > 0 && (
          <div className="text-yellow-700 dark:text-yellow-300">
            {warningCount} field{warningCount > 1 ? 's' : ''} with warnings
          </div>
        )}
      </div>
    </div>
  );
}