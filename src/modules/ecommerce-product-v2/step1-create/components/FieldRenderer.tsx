'use client';

/**
 * FieldRenderer
 * Dispatches a form field's fieldType to the correct input element.
 * Extracted from DynamicProductCreationFormRefactored.
 */

import React from 'react';
import { Info, HelpCircle, AlertCircle } from '@/shared/ui/icons/Icons';
import ImageUploadField from './ImageUploadField';
import CategorySelectField from './CategorySelectField';
import MoneyInput from '../../components/inputs/MoneyInput';
import QuantityInput from '../../components/inputs/QuantityInput';
import { classifyNumericField, inputBaseClass } from '../../components/inputs/field-format';

interface FieldRendererProps {
  field: any;
  value: any;
  error?: string;
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
  /** ISO currency code for money-classified fields. Defaults to IDR (platform default). */
  currency?: string;
}

export default function FieldRenderer({
  field,
  value,
  error,
  organizationId,
  productId,
  onChange,
  onBlur,
  currency = 'IDR',
}: FieldRendererProps) {
  const fieldName = field.name || field.fieldName;
  // Normalise: lowercase + underscores → hyphens so "CATEGORY_SELECT" and "category-select" both match
  const fieldType = (field.fieldType || '').toLowerCase().replace(/_/g, '-');

  const baseClass = inputBaseClass(!!error);

  let input: React.ReactNode;

  if (fieldType === 'category-select') {
    input = (
      <CategorySelectField
        orgId={organizationId}
        value={value || ''}
        onChange={(slug) => onChange(fieldName, slug)}
        onBlur={() => onBlur(field)}
        required={field.required}
        placeholder={field.placeholder}
        disabled={field.readOnly}
        className={error
          ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
          : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}
      />
    );
  } else if (fieldType === 'textarea') {
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
  } else if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'integer') {
    // Name-based routing keeps product-level price/stock consistent with the variant table:
    // money → currency mask, quantity → integer stepper, everything else → plain decimal.
    const kind = fieldType === 'currency' ? 'money' : fieldType === 'integer' ? 'quantity' : classifyNumericField(fieldName);
    if (kind === 'money') {
      input = (
        <MoneyInput
          name={fieldName}
          value={value}
          currency={currency}
          error={!!error}
          onChange={(v) => onChange(fieldName, v ?? '')}
          onBlur={() => onBlur(field)}
          placeholder={field.placeholder}
          aria-label={field.label}
        />
      );
    } else if (kind === 'quantity') {
      input = (
        <QuantityInput
          name={fieldName}
          value={value}
          error={!!error}
          onChange={(v) => onChange(fieldName, v ?? '')}
          onBlur={() => onBlur(field)}
          aria-label={field.label}
        />
      );
    } else {
      input = (
        <input
          name={fieldName}
          type="text"
          inputMode="decimal"
          placeholder={field.placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(fieldName, e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={() => onBlur(field)}
          className={baseClass}
        />
      );
    }
  } else {
    input = (
      <input
        name={fieldName}
        type={fieldType === 'email' ? 'email' : 'text'}
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
