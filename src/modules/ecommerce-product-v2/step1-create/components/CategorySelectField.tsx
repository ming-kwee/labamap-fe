'use client';

/**
 * CategorySelectField — MIGRATION STUB (2026-06-16)
 *
 * product_categories collection removed. The backend still sends fieldType: 'category-select'
 * fields in the Step 1 schema. This component is kept alive as a stub so the form doesn't
 * crash. It renders a disabled placeholder until the backend migrates schema generation to
 * use productTypeId instead of productCategory slug.
 *
 * Next step: backend updates /ecommerce/form-schema/generate to accept productTypeId directly.
 * After that, replace this component with ProductTypeSelectField.
 * See: docs/product/01-catalog-schema/02-api-reference/14-product-categories-migration-backend.md
 */

import React from 'react';

interface CategorySelectFieldProps {
  orgId: string;
  value: string;
  onChange: (slug: string) => void;
  onBlur: () => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function CategorySelectField({ disabled, className }: CategorySelectFieldProps) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="w-full px-3 py-2 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg cursor-not-allowed">
        Category selection coming soon — use Product Type instead
      </div>
      {disabled === false && null}
    </div>
  );
}
