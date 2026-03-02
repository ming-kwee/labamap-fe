'use client';

import React from 'react';
import { ChevronDown, ChevronRight } from '@/shared/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import { getSectionMetadata } from '../../../utils/form-utils';
import FieldRenderer from '../FieldRenderer';

interface BasicInfoSectionProps {
  sectionKey: string;
  fields: any[];
  isExpanded: boolean;
  onToggle: () => void;
  formData: Record<string, any>;
  fieldErrors: Record<string, string>;
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
}

export default function BasicInfoSection({
  sectionKey,
  fields,
  isExpanded,
  onToggle,
  formData,
  fieldErrors,
  organizationId,
  productId,
  onChange,
  onBlur,
}: BasicInfoSectionProps) {
  const meta = getSectionMetadata(sectionKey);
  const IconComponent = meta.icon;
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ChevronIcon className="h-5 w-5 text-gray-500" />
            <IconComponent className={`h-5 w-5 ${meta.iconColor}`} />
            <CardTitle className="text-lg">{meta.label}</CardTitle>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
              {fields.length} {fields.length === 1 ? 'field' : 'fields'}
            </span>
          </div>
          {meta.description && (
            <p className="text-sm text-gray-500">{meta.description}</p>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-4">
          {fields.map((field: any) => {
            const fieldName = field.name || field.fieldName;
            return (
              <FieldRenderer
                key={fieldName}
                field={field}
                value={formData[fieldName]}
                error={fieldErrors[fieldName]}
                organizationId={organizationId}
                productId={productId}
                onChange={onChange}
                onBlur={onBlur}
              />
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
