import React from 'react';
import { FormField } from '@/types/dynamicForm';
import { AlertCircle, Star, CheckCircle2 } from '@/components/ui/icons/Icons';

interface FieldEnhancement {
  relevance: 'high' | 'medium' | 'low';
  required: boolean;
  placeholder?: string;
  helper?: string;
  className: string;
}

interface EnhancedFieldProps {
  fieldName: string;
  children: React.ReactElement<any>;
  showHelper?: boolean;
  enhancement?: FieldEnhancement;
  error?: string;
  warning?: string;
  schemaField?: FormField;
  value?: any;
  isValid?: boolean;
}

export default function EnhancedField({ 
  fieldName, 
  children, 
  showHelper = true, 
  enhancement,
  error,
  warning,
  schemaField,
  value,
  isValid
}: EnhancedFieldProps) {
  // Determine field status
  const hasValue = value !== undefined && value !== null && value !== '';
  const isRequired = enhancement?.required || schemaField?.required || false;
  const helpText = enhancement?.helper || schemaField?.helpText;
  
  // Get enhancement data from schema if not provided
  const effectiveEnhancement = enhancement || {
    relevance: schemaField?.businessContext?.riskLevel === 'HIGH' ? 'high' : 
              schemaField?.businessContext?.riskLevel === 'MEDIUM' ? 'medium' : 'low',
    required: isRequired,
    placeholder: schemaField?.placeholder,
    helper: helpText,
    className: ''
  };

  // Enhanced styling based on field state
  const getFieldClassName = () => {
    let baseClass = children.props?.className || '';
    
    if (error) return `${baseClass} border-red-500 focus:border-red-500`;
    if (warning) return `${baseClass} border-yellow-400 focus:border-yellow-400`;
    if (hasValue && isValid !== false) return `${baseClass} border-green-500`;
    if (isRequired) return `${baseClass} border-blue-400`;
    
    return `${baseClass} ${effectiveEnhancement.className}`.trim();
  };

  return (
    <div className="space-y-2 relative">
      <div className="relative">
        {React.cloneElement(children, {
          className: getFieldClassName(),
          placeholder: effectiveEnhancement.placeholder || children.props?.placeholder,
          required: isRequired || children.props?.required
        })}
        
        {/* Field status indicator */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          {error && <AlertCircle className="h-4 w-4 text-red-500" />}
          {warning && !error && <AlertCircle className="h-4 w-4 text-yellow-500" />}
          {hasValue && isValid && !error && !warning && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {isRequired && (
            <Star className="h-3 w-3 text-red-400" />
          )}
        </div>
      </div>
      
      {/* Helper text */}
      {showHelper && helpText && !error && !warning && (
        <div className="flex items-start space-x-1">
          <div className={`w-2 h-2 rounded-full mt-1.5 ${
            effectiveEnhancement.relevance === 'high' ? 'bg-blue-500' :
            effectiveEnhancement.relevance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
          }`} />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {helpText}
          </p>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="flex items-start space-x-1">
          <AlertCircle className="h-3 w-3 text-red-500 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        </div>
      )}
      
      {/* Warning message */}
      {warning && !error && (
        <div className="flex items-start space-x-1">
          <AlertCircle className="h-3 w-3 text-yellow-500 mt-0.5" />
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            {warning}
          </p>
        </div>
      )}
      
      {/* Schema field metadata for development */}
      {schemaField && process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 p-1 rounded text-mono">
          Field: {schemaField.fieldName} | Type: {schemaField.fieldType} | 
          {schemaField.businessContext && ` Risk: ${schemaField.businessContext.riskLevel}`}
        </div>
      )}
    </div>
  );
}