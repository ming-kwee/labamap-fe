'use client';

/**
 * ProductCreateForm
 * Form orchestrator for Step 1: Create Master Product.
 * Wires all hooks, computes schema-driven sections, and delegates rendering
 * to section components.
 */

import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import { Loader2, AlertCircle } from '@/shared/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import type { MasterProduct } from '../../types/product';
import ValidationSummary from './ValidationSummary';
import BasicInfoSection from './sections/BasicInfoSection';
import PricingSection from './sections/PricingSection';
import MediaSection from './sections/MediaSection';
import ShippingSection from './sections/ShippingSection';
import VariantsSection from './sections/VariantsSection';
import { useFormSchema } from '../hooks/useFormSchema';
import { useFormState } from '../hooks/useFormState';
import { useFieldHandler } from '../hooks/useFieldHandler';
import { useFieldVisibility } from '../hooks/useFieldVisibility';
import { useFieldValidation } from '../hooks/useFieldValidation';
import { useProductSubmit } from '../hooks/useProductSubmit';
import {
  getSectionMetadata,
  groupFieldsBySection,
  normalizeSectionKey,
  validateProductCategory,
} from '../../utils/form-utils';
import { generateMasterProduct } from '../../utils/product-mapper';

// ============================================================================
// PROPS
// ============================================================================

interface ProductCreateFormProps {
  userId: string;
  organizationId: string;
  userRole: string;
  targetChannels: string[];
  assignedCategories: string[];
  organizationDefaultCategory: string;
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Record<string, any>;
}

// ============================================================================
// SECTION ROUTING
// ============================================================================

interface SectionProps {
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

function renderSection(sectionKey: string, props: SectionProps): React.ReactNode {
  switch (sectionKey) {
    case 'pricing':
      return <PricingSection key={sectionKey} {...props} />;
    case 'media':
      return <MediaSection key={sectionKey} {...props} />;
    case 'shipping':
      return <ShippingSection key={sectionKey} {...props} />;
    default:
      return <BasicInfoSection key={sectionKey} {...props} />;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProductCreateForm({
  userId,
  organizationId,
  userRole,
  targetChannels,
  assignedCategories,
  organizationDefaultCategory,
  onProductCreated,
  initialData = {},
}: ProductCreateFormProps) {
  // Stable temp product ID for image uploads before product is saved
  const tempProductIdRef = useRef(`temp_${Date.now()}`);
  // Track whether we've already auto-expanded sections (runs once after first schema load)
  const hasAutoExpandedRef = useRef(false);
  // Track field names from the previous schema so stale values can be removed on category change
  const prevSchemaFieldNamesRef = useRef<Set<string>>(new Set());

  // ── Hooks ──────────────────────────────────────────────────────────────────

  const {
    formData,
    setFormData,
    expandedSections,
    setExpandedSections,
    toggleSection,
    showJsonPreview,
    setShowJsonPreview,
    viewLevel,
    setViewLevel,
    promoteToStandard,
  } = useFormState({ initialData, organizationDefaultCategory });

  const {
    schema,
    isLoadingSchema,
    schemaError,
    formStage,
    isAddingCategoryFields,
    loadSchema,
    loadCategoryFieldsSmooth,
  } = useFormSchema({ userId, organizationId, userRole, targetChannels });

  const { getVisibleFields } = useFieldVisibility();

  const { fieldErrors, handleFieldBlur: validateOnBlur } = useFieldValidation();

  const {
    isSubmitting,
    submitError,
    validationResult,
    showValidation,
    submitProduct,
    setShowValidation,
  } = useProductSubmit({
    userId,
    organizationId,
    userRole,
    targetChannels,
    category: formData.category || organizationDefaultCategory,
  });

  const handleCategoryChange = useCallback(
    (category: string) => {
      loadCategoryFieldsSmooth(category);
      promoteToStandard();
    },
    [loadCategoryFieldsSmooth, promoteToStandard]
  );

  const { handleFieldChange: handleFieldChangeInternal, handleVariantConfiguratorChange } =
    useFieldHandler({ formData, setFormData, onCategoryChange: handleCategoryChange });

  // ── Effects ────────────────────────────────────────────────────────────────

  // Load schema once on mount
  useEffect(() => {
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove stale formData values for fields that no longer exist in the new schema.
  // Runs on every schema replacement (including category change) to prevent old category-specific
  // values from silently persisting in formData and being submitted with the product.
  useEffect(() => {
    if (!schema?.fields) return;

    const newFieldNames = new Set<string>(
      schema.fields.map((f: any) => f.name || f.fieldName)
    );

    // These keys are managed outside the schema and must never be cleared automatically
    const systemFields = new Set(['category', 'hasVariants', 'variantConfigurator', 'id']);

    const staleFieldNames: string[] = [];
    for (const fieldName of prevSchemaFieldNamesRef.current) {
      if (!newFieldNames.has(fieldName) && !systemFields.has(fieldName)) {
        staleFieldNames.push(fieldName);
      }
    }

    if (staleFieldNames.length > 0) {
      setFormData((prev) => {
        const updated = { ...prev };
        for (const fieldName of staleFieldNames) {
          delete updated[fieldName];
        }
        return updated;
      });
    }

    // Always update the ref so the next schema change can diff against the current one
    prevSchemaFieldNamesRef.current = newFieldNames;
  }, [schema, setFormData]);

  // Apply schema default values when schema first loads or changes
  useEffect(() => {
    if (!schema?.fields) return;

    setFormData((prev) => {
      const updated = { ...prev };
      let hasChanges = false;

      for (const field of schema.fields) {
        const fieldName = field.name || field.fieldName;
        if (
          field.defaultValue !== undefined &&
          field.defaultValue !== null &&
          (updated[fieldName] === undefined ||
            updated[fieldName] === null ||
            updated[fieldName] === '')
        ) {
          updated[fieldName] = field.defaultValue;
          hasChanges = true;
        }
      }

      return hasChanges ? updated : prev;
    });
  }, [schema, setFormData]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleFieldChange = useCallback(
    (fieldName: string, value: any) => {
      handleFieldChangeInternal(fieldName, value);
    },
    [handleFieldChangeInternal]
  );

  const handleFieldBlur = useCallback(
    (field: any) => {
      const fieldName = field.name || field.fieldName;
      validateOnBlur(field, formData[fieldName]);
    },
    [formData, validateOnBlur]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!schema) return;

      const categoryValidation = validateProductCategory(
        formData.category || '',
        assignedCategories,
        organizationDefaultCategory
      );

      if (!categoryValidation.isValid && categoryValidation.warning) {
        alert(categoryValidation.warning);
        return;
      }

      const product = generateMasterProduct({ formData, schema, organizationId, userId });
      const createdProduct = await submitProduct(product);

      if (createdProduct && onProductCreated) {
        onProductCreated(createdProduct, targetChannels);
      }
    },
    [
      schema,
      formData,
      assignedCategories,
      organizationDefaultCategory,
      organizationId,
      userId,
      submitProduct,
      onProductCreated,
      targetChannels,
    ]
  );

  // ── Computed sections ──────────────────────────────────────────────────────

  const sortedSections = useMemo(() => {
    if (!schema?.fields) return [];

    const visibleFields = getVisibleFields(schema.fields, formData);

    // Fix 1: Strict tier-based filter — missing displayLevel treated as 'basic'
    const filteredFields = visibleFields.filter((field: any) => {
      const level = (field.displayLevel || 'basic').toLowerCase().replace(/_/g, '-');
      switch (viewLevel) {
        case 'essential':
          return level === 'essential';
        case 'standard':
          return (
            level === 'essential' ||
            level === 'basic' ||
            (formStage === 'category-specific' && level === 'category-specific')
          );
        case 'full':
        default:
          return true;
      }
    });

    const sortedFields = filteredFields.sort(
      (a: any, b: any) => (a.order ?? 999) - (b.order ?? 999)
    );

    const fieldsBySection = groupFieldsBySection(sortedFields, ['hasVariants', 'variantConfigurator']);

    return Object.entries(fieldsBySection).sort(
      ([keyA], [keyB]) => getSectionMetadata(keyA).order - getSectionMetadata(keyB).order
    );
  }, [schema, formData, formStage, viewLevel, getVisibleFields]);

  // Fix 4: Only expand the first section on initial load, not all sections with required fields
  useEffect(() => {
    if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;
    hasAutoExpandedRef.current = true;
    setExpandedSections(new Set(['product-info']));
  }, [sortedSections, setExpandedSections]);

  // Fix 5: Auto-expand sections that received category-specific fields when category schema loads.
  // Runs every time the schema changes while in category-specific stage so switching categories
  // also reveals the sections for the new category's fields.
  useEffect(() => {
    if (formStage !== 'category-specific' || !schema?.fields) return;

    const sectionsWithCategoryFields = new Set<string>();
    for (const field of schema.fields) {
      const level = (field.displayLevel || 'basic').toLowerCase().replace(/_/g, '-');
      if (level === 'category-specific') {
        const sectionKey = normalizeSectionKey(field.section || 'product-info');
        sectionsWithCategoryFields.add(sectionKey);
      }
    }

    if (sectionsWithCategoryFields.size > 0) {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        sectionsWithCategoryFields.forEach((k) => next.add(k));
        return next;
      });
    }
  }, [schema, formStage, setExpandedSections]);

  const productId = formData.id || tempProductIdRef.current;

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoadingSchema) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading form schema...</p>
        </div>
      </div>
    );
  }

  if (schemaError) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load form schema: {schemaError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Form schema not loaded. Please refresh the page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Product</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {formStage === 'essential'
              ? 'Fill in essential product details'
              : 'Complete product information'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowJsonPreview(!showJsonPreview)}
        >
          {showJsonPreview ? 'Hide' : 'Show'} JSON Preview
        </Button>
      </div>

      {/* Fix 5: Progressive disclosure controls */}
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span>
          {viewLevel === 'essential' && 'Showing essential fields only'}
          {viewLevel === 'standard' && 'Showing recommended fields'}
          {viewLevel === 'full' && 'Showing all fields'}
        </span>
        {viewLevel !== 'full' && (
          <button
            type="button"
            className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
            onClick={() => setViewLevel(viewLevel === 'essential' ? 'standard' : 'full')}
          >
            {viewLevel === 'essential' ? '+ Show recommended fields' : '+ Show all fields'}
          </button>
        )}
        {viewLevel === 'full' && (
          <button
            type="button"
            className="text-gray-400 hover:underline focus:outline-none"
            onClick={() => setViewLevel('essential')}
          >
            Show less
          </button>
        )}
      </div>

      {/* Category fields loading indicator */}
      {isAddingCategoryFields && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>Loading category-specific fields...</AlertDescription>
        </Alert>
      )}

      {/* Submit error */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Validation results */}
      {showValidation && validationResult && (
        <ValidationSummary result={validationResult} onClose={() => setShowValidation(false)} />
      )}

      {/* Schema-driven sections */}
      {sortedSections.map(([sectionKey, fields]) =>
        renderSection(sectionKey, {
          sectionKey,
          fields,
          isExpanded: expandedSections.has(sectionKey),
          onToggle: () => toggleSection(sectionKey),
          formData,
          fieldErrors,
          organizationId,
          productId,
          onChange: handleFieldChange,
          onBlur: handleFieldBlur,
        })
      )}

      {/* Variants section (special rendering) */}
      <VariantsSection
        schema={schema}
        formData={formData}
        onChange={handleFieldChange}
        onVariantChange={handleVariantConfiguratorChange}
        organizationId={organizationId}
        productId={productId}
      />

      {/* JSON preview */}
      {showJsonPreview && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Product JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md overflow-auto max-h-96 text-xs">
              {JSON.stringify(
                generateMasterProduct({ formData, schema, organizationId, userId }),
                null,
                2
              )}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting || isAddingCategoryFields}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating Product...
            </>
          ) : isAddingCategoryFields ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading category fields...
            </>
          ) : (
            'Create Product'
          )}
        </Button>
      </div>
    </form>
  );
}
