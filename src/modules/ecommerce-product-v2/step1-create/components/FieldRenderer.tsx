'use client';

/**
 * FieldRenderer
 * Dispatches a form field's fieldType to the correct input element.
 * Extracted from DynamicProductCreationFormRefactored.
 */

import React from 'react';
import { Info, HelpCircle, AlertCircle } from '@/shared/ui/icons/Icons';
import ImageUploadField from './ImageUploadField';

interface FieldRendererProps {
  field: any;
  value: any;
  error?: string;
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
}

export default function FieldRenderer({
  field,
  value,
  error,
  organizationId,
  productId,
  onChange,
  onBlur,
}: FieldRendererProps) {
  const fieldName = field.name || field.fieldName;
  const fieldType = (field.fieldType || '').toLowerCase();

  const errorClass = error
    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';
  const baseClass = `w-full px-3 py-2 border rounded-md shadow-sm ${errorClass} transition-colors dark:bg-gray-800 dark:text-white`;

  let input: React.ReactNode;

  if (fieldType === 'textarea') {
    input = (
      <textarea
        name={fieldName}
        placeholder={field.placeholder}
        value={value || ''}
        onChange={(e) => onChange(fieldName, e.target.value)}
        onBlur={() => onBlur(field)}
        className={baseClass}
        rows={3}
      />
    );
  } else if (fieldType === 'select') {
    input = (
      <select
        name={fieldName}
        value={value || ''}
        onChange={(e) => onChange(fieldName, e.target.value)}
        onBlur={() => onBlur(field)}
        className={baseClass}
      >
        <option value="">{field.placeholder || 'Select...'}</option>
        {field.options?.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (fieldType === 'checkbox') {
    input = (
      <input
        type="checkbox"
        name={fieldName}
        checked={!!value}
        onChange={(e) => onChange(fieldName, e.target.checked)}
        onBlur={() => onBlur(field)}
        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
    );
  } else if (fieldType === 'image' || fieldType === 'file' || fieldType === 'media') {
    input = (
      <ImageUploadField
        fieldName={fieldName}
        label={field.label}
        value={value || (fieldType === 'image' ? '' : [])}
        onChange={(val) => onChange(fieldName, val)}
        multiple={field.multiple ?? (fieldType === 'media' || fieldType === 'file' || (fieldType === 'image' && (field.validationRules?.maxItems ?? 1) > 1))}
        maxImages={field.validationRules?.maxItems || 5}
        required={field.required}
        helpText={field.helpText}
        organizationId={organizationId}
        productId={productId}
        error={error}
        disabled={field.readOnly}
      />
    );
  } else {
    input = (
      <input
        name={fieldName}
        type={fieldType === 'number' ? 'number' : fieldType === 'email' ? 'email' : 'text'}
        placeholder={field.placeholder}
        value={value || ''}
        onChange={(e) => onChange(fieldName, e.target.value)}
        onBlur={() => onBlur(field)}
        className={baseClass}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.description && (
          <div className="group relative">
            <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
              {field.description}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {input}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 flex items-start">
          <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}

      {/* Help text */}
      {field.helpText && !error && (
        <p className="text-xs text-gray-500 flex items-start">
          <HelpCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
          {field.helpText}
        </p>
      )}
    </div>
  );
}
