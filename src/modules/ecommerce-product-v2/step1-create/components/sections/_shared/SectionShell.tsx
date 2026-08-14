'use client';

/**
 * SectionShell — shared building blocks for Step 1 product-level sections.
 * Gives every section one header treatment (tinted icon tile, brand field-count
 * badge, description under the title, chevron on the right, keyboard-toggleable)
 * and one responsive field grid, so product-level altitude matches the variant table.
 */

import React from 'react';
import { ChevronDown, ChevronRight } from '@/shared/ui/icons/Icons';
import { CardHeader, CardTitle } from '@/shared/ui/card/Card';
import { getSectionMetadata } from '../../../../utils/form-utils';
import FieldRenderer from '../../FieldRenderer';

// Soft background tile per section accent. Literal class strings (not interpolated)
// so Tailwind's content scanner keeps them — dynamic `bg-${color}-50` would be purged.
const ICON_TINT: Record<string, string> = {
  'text-blue-600': 'bg-blue-50 dark:bg-blue-500/10',
  'text-green-600': 'bg-green-50 dark:bg-green-500/10',
  'text-purple-600': 'bg-purple-50 dark:bg-purple-500/10',
  'text-indigo-600': 'bg-indigo-50 dark:bg-indigo-500/10',
  'text-orange-600': 'bg-orange-50 dark:bg-orange-500/10',
  'text-yellow-600': 'bg-yellow-50 dark:bg-yellow-500/10',
  'text-gray-600': 'bg-gray-100 dark:bg-gray-700/40',
};

interface SectionHeaderProps {
  sectionKey: string;
  fieldCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SectionHeader({ sectionKey, fieldCount, isExpanded, onToggle }: SectionHeaderProps) {
  const meta = getSectionMetadata(sectionKey);
  const Icon = meta.icon;
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const tint = ICON_TINT[meta.iconColor] ?? 'bg-gray-100 dark:bg-gray-700/40';

  return (
    <CardHeader
      className="cursor-pointer rounded-t-2xl transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon className={`h-5 w-5 ${meta.iconColor}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{meta.label}</CardTitle>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
            </span>
          </div>
          {meta.description && (
            <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{meta.description}</p>
          )}
        </div>
        <Chevron className="ml-auto h-5 w-5 flex-shrink-0 text-gray-400" />
      </div>
    </CardHeader>
  );
}

// Field types that always deserve the full row (rich/media/long inputs).
const WIDE_TYPES = new Set([
  'textarea', 'image', 'file', 'media', 'richtext', 'rich-text', 'wysiwyg', 'html', 'category-select',
]);
// Field names that read better full-width (primary + long-form fields).
const WIDE_NAME = /(name|title|description|summary|content|address|slug|tags|note|url)/i;

/** Whether a field should span both grid columns. */
export function isWideField(field: any): boolean {
  const type = (field.fieldType || '').toLowerCase().replace(/_/g, '-');
  if (WIDE_TYPES.has(type)) return true;
  if (field.fullWidth === true) return true;
  if ((field.validationRules?.maxItems ?? 1) > 1 && ['image', 'file', 'media'].includes(type)) return true;
  const name = field.name || field.fieldName || '';
  return WIDE_NAME.test(name);
}

interface FieldGridProps {
  fields: any[];
  formData: Record<string, any>;
  fieldErrors: Record<string, string>;
  organizationId: string;
  productId: string;
  onChange: (fieldName: string, value: any) => void;
  onBlur: (field: any) => void;
}

/**
 * Responsive 2-column field grid. Compact fields (price, sku, weight…) pair up;
 * wide fields (name, description, images) span the row. A lone field spans full width.
 */
export function FieldGrid({
  fields,
  formData,
  fieldErrors,
  organizationId,
  productId,
  onChange,
  onBlur,
}: FieldGridProps) {
  const single = fields.length === 1;
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
      {fields.map((field: any) => {
        const fieldName = field.name || field.fieldName;
        const wide = single || isWideField(field);
        return (
          <div key={fieldName} className={wide ? 'sm:col-span-2' : ''}>
            <FieldRenderer
              field={field}
              value={formData[fieldName]}
              error={fieldErrors[fieldName]}
              organizationId={organizationId}
              productId={productId}
              onChange={onChange}
              onBlur={onBlur}
            />
          </div>
        );
      })}
    </div>
  );
}
