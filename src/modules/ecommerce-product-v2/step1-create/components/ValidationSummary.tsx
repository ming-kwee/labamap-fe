'use client';

import React from 'react';
import type { EnhancedValidationResult } from '../../types/form-schema';

interface ValidationSummaryProps {
  result: EnhancedValidationResult;
  /** Labels from the rendered schema — maps fieldName → label as shown in the form */
  fieldLabels?: Record<string, string>;
  onClose?: () => void;
  className?: string;
}

function label(fieldName: string, fieldLabels?: Record<string, string>): string {
  // Prefer the label from the live schema; fall back to title-casing the field name
  return fieldLabels?.[fieldName]
    ?? fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function friendlyMessage(raw: string, fieldLabels?: Record<string, string>): string {
  return raw
    .replace(/Field '([^']+)' does not match required pattern/i, (_, f) =>
      `${label(f, fieldLabels)} does not match the required format`)
    .replace(/Required field '([^']+)' is missing/i, (_, f) =>
      `${label(f, fieldLabels)} is required`)
    .replace(/Field '([^']+)' must be at least (\d+) characters?/i, (_, f, n) =>
      `${label(f, fieldLabels)} must be at least ${n} characters`)
    .replace(/Field '([^']+)' must be at most (\d+) characters?/i, (_, f, n) =>
      `${label(f, fieldLabels)} must be no more than ${n} characters`)
    .replace(/Field '([^']+)'/i, (_, f) => label(f, fieldLabels));
}

export default function ValidationSummary({ result, fieldLabels, onClose, className = '' }: ValidationSummaryProps) {
  const errors = result.violations.filter(v => v.severity === 'ERROR');

  return (
    <div className={`rounded-xl border ${result.valid ? 'border-success-200 dark:border-success-500/30 bg-success-50 dark:bg-success-500/10' : 'border-error-200 dark:border-error-500/30 bg-error-50 dark:bg-error-500/10'} overflow-hidden ${className}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-inherit">
        <div className="flex items-center gap-2">
          {result.valid ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success-600 dark:text-success-400 flex-shrink-0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
            </svg>
          )}
          <p className="text-sm font-semibold text-error-700 dark:text-error-300">
            {result.valid
              ? 'All checks passed'
              : errors.length === 1
                ? 'Please fix 1 issue before submitting'
                : `Please fix ${errors.length} issues before submitting`}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <ul className="px-4 py-3 space-y-1.5">
          {errors.map((v, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-error-700 dark:text-error-300">
              <span className="mt-0.5 flex-shrink-0 h-1.5 w-1.5 rounded-full bg-error-500 dark:bg-error-400" />
              {friendlyMessage(v.message, fieldLabels)}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
