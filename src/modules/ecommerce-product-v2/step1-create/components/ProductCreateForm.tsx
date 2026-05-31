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
import { useProductTypeVariants } from '../hooks/useProductTypeVariants';
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
  /** Phase 4: "edit" shows "Save Changes" and routes submit through updateProduct */
  mode?: 'create' | 'edit';
  /** Phase 4: the existing product ID when mode === "edit" */
  initialProductId?: string;
  /** Phase 4: called after a successful update (replaces onProductCreated for edit mode) */
  onProductSaved?: (product: MasterProduct) => void;
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
  mode = 'create',
  initialProductId,
  onProductSaved,
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
  } = useFormState({
    initialData,
    organizationDefaultCategory,
    // Edit mode: start at 'full' so all pre-filled fields are immediately visible
    initialViewLevel: mode === 'edit' ? 'full' : 'essential',
  });

  const {
    schema,
    isLoadingSchema,
    schemaError,
    formStage,
    isAddingCategoryFields,
    selectedCategory,
    productTypeId,
    productTypeName,
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
    mode,
    productId: initialProductId,
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

  // Phase 5: resolve ProductType variant dimensions + options.
  // Uses productTypeId from the schema response (Phase 5 metadata) — avoids the broken
  // category-slug → CategoryService.get(ObjectId) lookup that caused empty options.
  const {
    productTypeDimensions,
    dimensionOptions,
    productTypeName: resolvedProductTypeName,
    loading: isLoadingVariantOptions,
  } = useProductTypeVariants(productTypeId || undefined);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Load schema once on mount — always without category.
  // The essential (no-category) call returns all global fields (name, sku, price, …).
  // The category-specific call returns ONLY category-specific fields and replaces the schema,
  // so in edit mode we skip it (see editCategoryLoadedRef below) to keep all global fields.
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

      if (createdProduct) {
        if (mode === 'edit' && onProductSaved) {
          onProductSaved(createdProduct);
        } else if (onProductCreated) {
          onProductCreated(createdProduct, targetChannels);
        }
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

  // On initial schema load: in edit mode expand only sections that have at least one
  // pre-filled value so empty sections stay collapsed; in create mode open only the first.
  useEffect(() => {
    if (sortedSections.length === 0 || hasAutoExpandedRef.current) return;
    hasAutoExpandedRef.current = true;
    if (mode === 'edit') {
      const populated = sortedSections
        .filter(([, fields]) =>
          (fields as any[]).some((field: any) => {
            if (field.required) return true;
            const val = formData[field.name || field.fieldName];
            return val !== undefined && val !== null && val !== '' &&
              !(Array.isArray(val) && val.length === 0);
          })
        )
        .map(([key]) => key);
      // Always keep product-info open even if somehow empty
      setExpandedSections(new Set(populated.length > 0 ? populated : ['product-info']));
    } else {
      setExpandedSections(new Set(['product-info']));
    }
  // formData is intentionally included so the snapshot is current when sortedSections first arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSections, setExpandedSections, mode]);

  // Phase 4 — edit mode: skip the category-specific schema reload entirely.
  // The backend's category schema only returns category-specific fields and replaces the
  // essential schema when set, hiding global fields (name, sku, price, …). In edit mode
  // the essential schema already contains all the fields we need; the initialData pre-fills them.
  const editCategoryLoadedRef = useRef(mode === 'edit');
  useEffect(() => {
    if (mode !== 'edit' || editCategoryLoadedRef.current) return;
    if (!schema || !formData.category) return;
    editCategoryLoadedRef.current = true;
    loadSchema(formData.category);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, schema, formData.category]);

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

  const productId = (mode === 'edit' && initialProductId) ? initialProductId : (formData.id || tempProductIdRef.current);

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
      {/* Dev-only JSON preview — fixed floating badge, no layout footprint */}
      {process.env.NODE_ENV === 'development' && (
        <button
          type="button"
          onClick={() => setShowJsonPreview(!showJsonPreview)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-800 dark:bg-gray-700 text-gray-200 shadow-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors border border-gray-700 dark:border-gray-600"
          title="Dev tool: toggle JSON preview"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {showJsonPreview ? 'Hide JSON' : 'JSON Preview'}
        </button>
      )}

      {/* Progressive disclosure controls */}
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

      {/* Phase 1 — initial load prompt: no category selected yet */}
      {formStage === 'essential' && !formData.category && !isAddingCategoryFields && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-sm text-blue-700 dark:text-blue-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          <p>
            <span className="font-semibold">Select a product category</span> to load the matching attribute set.
            Only global fields are shown until a category is chosen.
          </p>
        </div>
      )}

      {/* Category selected but no ProductType assigned — neutral hint */}
      {formStage === 'category-specific' && selectedCategory && !productTypeId && !isAddingCategoryFields && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
          </svg>
          <p>
            Category-specific fields loaded — no product type assigned to this category yet.
            Contact your admin to assign a product type for stricter attribute filtering.
          </p>
        </div>
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

      {/* Schema-driven sections — skeleton while category schema is loading */}
      {isAddingCategoryFields ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading category fields">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse" style={{ opacity: 1 - i * 0.2 }}>
              <div className="h-12 bg-gray-100 dark:bg-gray-800 px-4 flex items-center gap-3">
                <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800" />
                  <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800" />
                </div>
                <div className="h-9 rounded-lg bg-gray-100 dark:bg-gray-800 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        sortedSections.map(([sectionKey, fields]) =>
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
        )
      )}

      {/* Variants section (special rendering) */}
      <VariantsSection
        schema={schema}
        formData={formData}
        onChange={handleFieldChange}
        onVariantChange={handleVariantConfiguratorChange}
        organizationId={organizationId}
        productId={productId}
        productTypeDimensions={productTypeDimensions}
        dimensionOptions={dimensionOptions}
        productTypeName={resolvedProductTypeName}
        isLoadingVariantOptions={isLoadingVariantOptions}
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
              {mode === 'edit' ? 'Saving Changes...' : 'Creating Product...'}
            </>
          ) : isAddingCategoryFields ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading category fields...
            </>
          ) : (
            mode === 'edit' ? 'Save Changes' : 'Create Product'
          )}
        </Button>
      </div>
    </form>
  );
}
