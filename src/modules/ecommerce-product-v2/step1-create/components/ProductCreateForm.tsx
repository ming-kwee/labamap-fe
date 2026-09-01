'use client';

/**
 * ProductCreateForm
 * Form orchestrator for Step 1: Create Master Product.
 * Wires all hooks, computes schema-driven sections, and delegates rendering
 * to section components.
 */

import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
import MasterEditDirtyBanner from './MasterEditDirtyBanner';
import {
  getSectionMetadata,
  groupFieldsBySection,
  normalizeSectionKey,
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
  // Client-assigned UUID v4 — generated once per create session, sent to backend as
  // context.productId so master_product_data._id === channel_product_data.masterProductId.
  // In edit mode, the real productId from the URL is used instead (initialProductId).
  const [clientProductId] = useState(() => mode === 'create' ? uuidv4() : (initialProductId ?? ''));

  // Track whether we've already auto-expanded sections (runs once after first schema load)
  const hasAutoExpandedRef = useRef(false);
  // Track field names from the previous schema so stale values can be removed on category change
  const prevSchemaFieldNamesRef = useRef<Set<string>>(new Set());
  // Freeze the rendered sections while a new schema is in-flight so nothing on screen
  // changes until the full new schema is ready. Updated every render when not loading.
  const committedSectionsRef = useRef<[string, unknown[]][]>([]);

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

  const { fieldErrors, handleFieldBlur: validateOnBlur, clearFieldError } = useFieldValidation();

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
    // Thread the selected product type so it persists to the backend (fixes
    // "product type won't stick" → Step 2 Channel Fields 422 PRODUCT_TYPE_MISSING).
    productTypeId: productTypeId ?? undefined,
    mode,
    productId: initialProductId,
    clientProductId,
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
  // The type-specific call returns ONLY type-specific fields and replaces the schema,
  // so in edit mode we skip it (see editCategoryLoadedRef below) to keep all global fields.
  useEffect(() => {
    // Edit mode: load the schema WITH the product's saved product type so its
    // type-specific fields AND variant option axes are restored (the backend now
    // returns global fields too, so this no longer hides name/sku/price). Without
    // this, product type + variant options look like they "disappeared" on reload.
    const initialPtId = mode === 'edit' ? (initialData?.productTypeId as string | undefined) : undefined;
    loadSchema(initialPtId || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove stale formData values for fields that no longer exist in the new schema.
  // Runs on every schema replacement (including category change) to prevent old type-specific
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
      // Clear a standing validation error the moment the field gets a value. Without this, a required-error
      // set by an earlier blur lingers even after the user provides a value — most visibly on the productType
      // picker, whose select() commits the value AND blurs in the same tick (so the blur validated the stale
      // empty value → "category is required" flashed until the next blur, only in edit mode).
      if (value !== null && value !== undefined && value !== '') {
        clearFieldError(fieldName);
      }
    },
    [handleFieldChangeInternal, clearFieldError]
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

      const product = generateMasterProduct({ formData, schema, organizationId, userId, productId: clientProductId });
      const createdProduct = await submitProduct(product);

      if (createdProduct) {
        if (mode !== 'edit' && productTypeId) {
          try { sessionStorage.setItem(`productTypeId_${createdProduct.id}`, productTypeId); } catch { /**/ }
        }
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
      productTypeId,
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
            (formStage === 'type-specific' && level === 'type-specific')
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

  // Commit new sections to the ref only when NOT in the middle of a schema fetch.
  // During fetch (isAddingCategoryFields=true) the ref keeps its previous value so
  // the rendered form stays frozen — no opacity flash, no field churn. When loading
  // completes this line runs in the same render that flips isAddingCategoryFields=false,
  // giving an atomic old→new swap with no intermediate state visible to the user.
  if (!isAddingCategoryFields && sortedSections.length > 0) {
    committedSectionsRef.current = sortedSections as [string, unknown[]][];
  }

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

  // Phase 4 — edit mode: skip the type-specific schema reload entirely.
  // The backend's category schema only returns type-specific fields and replaces the
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

  // Fix 5: Auto-expand sections that received type-specific fields when category schema loads.
  // Runs every time the schema changes while in type-specific stage so switching categories
  // also reveals the sections for the new category's fields.
  useEffect(() => {
    if (formStage !== 'type-specific' || !schema?.fields) return;

    const sectionsWithCategoryFields = new Set<string>();
    for (const field of schema.fields) {
      const level = (field.displayLevel || 'basic').toLowerCase().replace(/_/g, '-');
      if (level === 'type-specific') {
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

  // In create mode, use clientProductId (UUID v4) so image uploads are stored under the same
  // ID that will become master_product_data._id — no orphaned images after save.
  const productId = (mode === 'edit' && initialProductId) ? initialProductId : clientProductId;

  // ── Loading / error states ─────────────────────────────────────────────────

  // Only block render on initial load (no schema yet).
  // During product-type change, schema already exists — committedSectionsRef freezes
  // sections so there is no visible change while the new schema is in-flight.
  if (isLoadingSchema && !schema) {
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

      {/* Live-listing awareness (edit mode): master edits need a re-publish to reach live channels */}
      {mode === 'edit' && productId && (
        <MasterEditDirtyBanner masterProductId={productId} desired={formData} />
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
            className="font-medium text-brand-600 dark:text-brand-400 hover:underline focus:outline-none"
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

      {/* Banner area — fixed min-height so appearing/disappearing doesn't shift sections.
          Shows the "select a product type" hint before selection.
          Tiny spinner goes inside the CategorySelectField (no layout impact here).
          After a type is selected the area collapses to 0 — a one-time shift, not a blink. */}
      {formStage === 'essential' && !formData.category && !isAddingCategoryFields && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-sm text-blue-700 dark:text-blue-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          <p>
            <span className="font-semibold">Select a product type</span> to load the matching attribute set.
            Only global fields are shown until a product type is chosen.
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
        <ValidationSummary
          result={validationResult}
          fieldLabels={Object.fromEntries(
            (schema?.fields ?? []).map((f: any) => [f.fieldName ?? f.name, f.label])
          )}
          onClose={() => setShowValidation(false)}
        />
      )}

      {/* Schema-driven sections.
          Renders committedSectionsRef — frozen while a new schema is in-flight so
          the form stays visually stable. The ref is updated atomically in the same
          render that clears isAddingCategoryFields, giving a direct old→new swap. */}
      {(committedSectionsRef.current as [string, unknown[]][]).map(([sectionKey, fields]) =>
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
        productTypeDimensions={productTypeDimensions}
        dimensionOptions={dimensionOptions}
        productTypeName={resolvedProductTypeName}
        isLoadingVariantOptions={isLoadingVariantOptions}
        isEditMode={mode === 'edit'}
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
