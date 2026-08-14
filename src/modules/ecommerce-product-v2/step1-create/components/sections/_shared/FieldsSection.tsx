'use client';

/**
 * FieldsSection — generic collapsible product-level section (Basic Info / Pricing /
 * Shipping share this one implementation). Section identity comes from `sectionKey`
 * (label, icon, description via getSectionMetadata); fields render in the shared grid.
 */

import React from 'react';
import { Card, CardContent } from '@/shared/ui/card/Card';
import { SectionHeader, FieldGrid } from './SectionShell';

interface FieldsSectionProps {
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

export default function FieldsSection({
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
}: FieldsSectionProps) {
  return (
    <Card>
      <SectionHeader
        sectionKey={sectionKey}
        fieldCount={fields.length}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <CardContent>
          <FieldGrid
            fields={fields}
            formData={formData}
            fieldErrors={fieldErrors}
            organizationId={organizationId}
            productId={productId}
            onChange={onChange}
            onBlur={onBlur}
          />
        </CardContent>
      )}
    </Card>
  );
}
