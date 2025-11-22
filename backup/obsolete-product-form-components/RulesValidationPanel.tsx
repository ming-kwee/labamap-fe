/**
 * Rules Validation Panel
 * Displays business rules validation results in the product form
 */

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import Badge from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { Loader2 } from '@/components/ui/icons/Icons';
import { RuleViolation, RuleWarning, RuleType } from '@/types/rules';

interface RulesValidationPanelProps {
  violations: RuleViolation[];
  warnings: RuleWarning[];
  isExecuting: boolean;
  hasBlockingViolations: boolean;
  onRetry?: () => void;
  onClear?: () => void;
  showRuleType?: boolean;
}

export default function RulesValidationPanel({
  violations,
  warnings,
  isExecuting,
  hasBlockingViolations,
  onRetry,
  onClear,
  showRuleType = false
}: RulesValidationPanelProps) {
  const totalIssues = violations.length + warnings.length;

  if (isExecuting) {
    return (
      <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Validating business rules...
          </span>
        </div>
      </div>
    );
  }

  if (totalIssues === 0) {
    return (
      <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 rounded-full bg-green-600 flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              All business rules passed
            </span>
          </div>
          {onClear && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClear}
              className="text-green-700 hover:text-green-900"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className={`border rounded-lg p-4 ${
        hasBlockingViolations 
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {hasBlockingViolations ? (
              <div className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center">
                <span className="text-white text-xs">✕</span>
              </div>
            ) : (
              <div className="h-4 w-4 rounded-full bg-yellow-600 flex items-center justify-center">
                <span className="text-white text-xs">!</span>
              </div>
            )}
            <span className={`text-sm font-medium ${
              hasBlockingViolations 
                ? 'text-red-900 dark:text-red-100' 
                : 'text-yellow-900 dark:text-yellow-100'
            }`}>
              {hasBlockingViolations ? 'Validation Failed' : 'Warnings Found'}
            </span>
            <Badge variant="secondary" className="text-xs">
              {violations.length} errors, {warnings.length} warnings
            </Badge>
          </div>
          <div className="flex space-x-2">
            {onRetry && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onRetry}
                className="text-gray-600 hover:text-gray-800"
              >
                <span className="text-xs mr-1">⟲</span>
                Retry
              </Button>
            )}
            {onClear && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClear}
                className="text-gray-600 hover:text-gray-800"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Violations */}
      {violations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-900 dark:text-red-100 flex items-center">
            <div className="h-4 w-4 rounded-full bg-red-600 flex items-center justify-center mr-1">
              <span className="text-white text-xs">✕</span>
            </div>
            Errors ({violations.length})
          </h4>
          {violations.map((violation, index) => (
            <Alert key={index} variant="destructive">
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{violation.message}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Field: {violation.field} | Code: {violation.code}
                      </p>
                    </div>
                    {showRuleType && (
                      <Badge variant="secondary" className="text-xs">
                        {violation.field}
                      </Badge>
                    )}
                  </div>
                  {violation.suggestedAction && (
                    <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded text-xs">
                      <strong>Suggested Action:</strong> {violation.suggestedAction}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-yellow-900 dark:text-yellow-100 flex items-center">
            <div className="h-4 w-4 rounded-full bg-yellow-600 flex items-center justify-center mr-1">
              <span className="text-white text-xs">!</span>
            </div>
            Warnings ({warnings.length})
          </h4>
          {warnings.map((warning, index) => (
            <Alert key={index} variant="default" className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">
                        {warning.message}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        Field: {warning.field} | Code: {warning.code}
                      </p>
                    </div>
                    {showRuleType && (
                      <Badge variant="secondary" className="text-xs">
                        {warning.field}
                      </Badge>
                    )}
                  </div>
                  {warning.suggestion && (
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-xs">
                      <strong>Suggestion:</strong> {warning.suggestion}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}