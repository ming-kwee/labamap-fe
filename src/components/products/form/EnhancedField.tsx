import React from 'react';

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
  enhancement: FieldEnhancement;
  error?: string;
}

export default function EnhancedField({ 
  fieldName, 
  children, 
  showHelper = true, 
  enhancement, 
  error 
}: EnhancedFieldProps) {
  return (
    <div className="space-y-2">
      {React.cloneElement(children, {
        className: `${children.props?.className || ''} ${enhancement.className}`.trim(),
        placeholder: enhancement.placeholder || children.props?.placeholder,
        required: enhancement.required || children.props?.required
      })}
      
      {showHelper && enhancement.helper && !error && (
        <div className="flex items-start space-x-1">
          <div className={`w-2 h-2 rounded-full mt-1.5 ${
            enhancement.relevance === 'high' ? 'bg-blue-500' :
            enhancement.relevance === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
          }`} />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {enhancement.helper}
          </p>
        </div>
      )}
      
      {error && (
        <div className="flex items-start space-x-1">
          <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5" />
          <p className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}