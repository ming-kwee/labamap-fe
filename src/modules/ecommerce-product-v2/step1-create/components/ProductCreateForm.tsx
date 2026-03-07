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

  // ── Hooks ──────────────────────────────────────────────────────────────────

  const {
    formData,
    setFormData,
    expandedSections,
    setExpandedSections,
    toggleSection,
    showJsonPreview,
    setShowJsonPreview,
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
    },
    [loadCategoryFieldsSmooth]
  );

  const { handleFieldChange: handleFieldChangeInternal, handleVariantConfiguratorChange } =
    useFieldHandler({ formData, setFormData, onCategoryChange: handleCategoryChange });

  // ── Effects ────────────────────────────────────────────────────────────────

  // Load schema once on mount
  useEffect(() => {
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply schema default values when schema first loads
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

    const filteredFields = visibleFields.filter((field: any) => {
      const displayLevel = (field.displayLevel || '').toLowerCase();
      if (formStage === 'essential') {
        return (
          displayLevel === 'essential' ||
          displayLevel === 'basic' ||
          displayLevel === 'enhanced' ||
          displayLevel === 'advanced' ||
          displayLevel === 'optional' ||
          displayLevel === ''
        );
      }
      return (
        displayLevel === 'essential' ||
        displayLevel === 'basic' ||
        displayLevel === 'enhanced' ||
        displayLevel === 'advanced' ||
        displayLevel === 'optional' ||
        displayLevel === 'category-specific' ||
        displayLevel === '' ||
        field.conditionalVisibility !== null
      );
    });

    const sortedFields = filteredFields.sort(
      (a: any, b: any) => (a.order ?? 999) - (b.order ?? 999)
    );

    const fieldsBySection = groupFieldsBySection(sortedFields, ['hasVariants', 'variantConfigurator']);

    return Object.entries(fieldsBySection).sort(
      ([keyA], [keyB]) => getSectionMetadata(keyA).order - getSectionMetadata(keyB).order
    );
  }, [schema, formData, formStage, getVisibleFields]);

  // Auto-expand sections that contain at least one required field (runs once after schema loads)
  useEffect(() => {
    if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;
    hasAutoExpandedRef.current = true;
    const required = new Set<string>();
    for (const [sectionKey, fields] of sortedSections) {
      if ((fields as any[]).some((f: any) => f.required)) required.add(sectionKey);
    }
    if (required.size > 0) {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        required.forEach((k) => next.add(k));
        return next;
      });
    }
  }, [sortedSections, setExpandedSections]);

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
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating Product...
            </>
          ) : (
            'Create Product'
          )}
        </Button>
      </div>
    </form>
  );
}
