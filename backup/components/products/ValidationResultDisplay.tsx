'use client';

/**
 * Validation Result Display Component
 * Displays enhanced validation results including violations and warnings
 */

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert/AlertComponents';
import { AlertCircle, CheckCircle2, Clock, Star } from '@/components/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card/Card';
import Badge from '@/components/ui/badge/Badge';
import type { EnhancedValidationResult, ValidationViolation, ValidationWarning } from '@/types/dynamicForm';

interface ValidationResultDisplayProps {
  result: EnhancedValidationResult;
  onClose?: () => void;
  className?: string;
}

export default function ValidationResultDisplay({
  result,
  onClose,
  className = ''
}: ValidationResultDisplayProps) {

  const getSeverityIcon = (severity: ValidationViolation['severity']) => {
    switch (severity) {
      case 'ERROR':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'WARNING':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'INFO':
        return <AlertCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: ValidationViolation['severity']) => {
    switch (severity) {
      case 'ERROR':
        return 'error';
      case 'WARNING':
        return 'warning';
      case 'INFO':
        return 'info';
      default:
        return 'default';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-50';
    if (score >= 60) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Overall Status */}
      <Card className={result.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {result.valid ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <AlertCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <h3 className={`text-lg font-semibold ${result.valid ? 'text-green-900' : 'text-red-900'}`}>
                  {result.message}
                </h3>
                <p className="text-sm text-gray-600">
                  {result.violations.length} violation{result.violations.length !== 1 ? 's' : ''}, {' '}
                  {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Validation Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={getScoreBg(result.validationScore)}>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Star className={`h-5 w-5 ${getScoreColor(result.validationScore)}`} />
              <div>
                <p className="text-sm text-gray-600">Validation Score</p>
                <p className={`text-2xl font-bold ${getScoreColor(result.validationScore)}`}>
                  {result.validationScore.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Rules Executed</p>
                <p className="text-2xl font-bold text-blue-600">{result.rulesExecuted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-gray-600">Execution Time</p>
                <p className="text-2xl font-bold text-purple-600">{result.executionTimeMs}ms</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Violations */}
      {result.violations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span>Validation Violations ({result.violations.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.violations.map((violation, index) => (
                <Alert key={index} variant={getSeverityColor(violation.severity) as any}>
                  <div className="flex items-start space-x-3">
                    {getSeverityIcon(violation.severity)}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-semibold">{violation.message}</span>
                        <Badge variant="light" color={getSeverityColor(violation.severity) as any}>
                          {violation.severity}
                        </Badge>
                      </div>

                      {violation.affectedFields.length > 0 && (
                        <p className="text-sm text-gray-600 mb-1">
                          Affected fields: {violation.affectedFields.join(', ')}
                        </p>
                      )}

                      {violation.suggestion && (
                        <p className="text-sm text-gray-700 mt-2 italic">
                          💡 Suggestion: {violation.suggestion}
                        </p>
                      )}

                      <p className="text-xs text-gray-500 mt-1">
                        Rule: {violation.ruleId} • Type: {violation.violationType}
                      </p>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span>Warnings ({result.warnings.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.warnings.map((warning, index) => (
                <Alert key={index} variant="warning">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <div className="flex-1">
                      <p className="font-semibold">{warning.message}</p>

                      {warning.affectedFields.length > 0 && (
                        <p className="text-sm text-gray-600 mt-1">
                          Affected fields: {warning.affectedFields.join(', ')}
                        </p>
                      )}

                      {warning.suggestion && (
                        <p className="text-sm text-gray-700 mt-2 italic">
                          💡 Suggestion: {warning.suggestion}
                        </p>
                      )}

                      <p className="text-xs text-gray-500 mt-1">
                        Rule: {warning.ruleId}
                      </p>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Can Submit Status */}
      {!result.canSubmit && (
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertDescription>
            <strong>Cannot Submit:</strong> Please resolve all ERROR severity violations before submitting the product.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
