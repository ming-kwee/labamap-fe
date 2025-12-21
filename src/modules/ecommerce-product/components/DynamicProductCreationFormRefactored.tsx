/**
 * Dynamic Product Creation Form - Refactored
 * Clean, maintainable version with separation of concerns
 *
 * NO HARDCODED FALLBACKS - All data from backend APIs
 */

"use client";

import React, { useEffect, useMemo, useCallback } from 'react';
import { Alert, AlertDescription } from '@/shared/ui/alert/AlertComponents';
import { Loader2, AlertCircle, ChevronDown, ChevronRight, Info, HelpCircle } from '@/shared/ui/icons/Icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card/Card';
import Button from '@/shared/ui/button/Button';
import { DynamicFormData } from '../types/dynamicForm';
import { MasterProduct } from '../types/product';
import VariantConfiguratorDynamic from './VariantConfiguratorDynamic';
import ValidationResultDisplay from './ValidationResultDisplay';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useOrganization } from '@/shared/contexts/OrganizationContext';

// Import custom hooks
import { useProductFormSchema } from '../hooks/useProductFormSchema';
import { useFieldVisibility } from '../hooks/useFieldVisibility';
import { useFieldValidation } from '../hooks/useFieldValidation';
import { useProductSubmission } from '../hooks/useProductSubmission';
import { useProductFieldHandler } from '../hooks/useProductFieldHandler';
import { useProductFormState } from '../hooks/useProductFormState';

// Import utilities
import { mapUserRole, getSectionMetadata, validateProductCategory, normalizeSectionKey, groupFieldsBySection } from '../utils/productFormUtils';

// Import services
import { generateMasterProduct } from '../services/productGenerationService';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface DynamicProductCreationFormRefactoredProps {
  onProductCreated?: (product: MasterProduct, availableChannels: string[]) => void;
  initialData?: Partial<DynamicFormData>;
  debugMode?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DynamicProductCreationFormRefactored({
  onProductCreated,
  initialData = {},
  debugMode = true  // Temporarily enabled for debugging
}: DynamicProductCreationFormRefactoredProps) {

  console.log('[ProductForm] Component rendering');

  // ========================================================================
  // AUTHENTICATION & ORGANIZATION CONTEXT
  // ========================================================================

  const { user, organization, isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    organizationConfig,
    getAssignedChannels,
    getAssignedCategories,
    isLoading: orgLoading,
    error: orgError
  } = useOrganization();

  // Early return for authentication/loading states
  if (!isAuthenticated || authLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading organization configuration...</p>
        </div>
      </div>
    );
  }

  if (!user || !organization) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Authentication required. Please log in to continue.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to load organization configuration: {orgError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ========================================================================
  // DERIVED VALUES FROM CONTEXT
  // ========================================================================

  const userId = user.userId;
  const organizationId = organization.organizationId;
  const userRole = mapUserRole(user.role);
  const targetChannels = getAssignedChannels();
  const assignedCategories = getAssignedCategories();
  const organizationDefaultCategory = organizationConfig?.configuration?.businessSettings?.defaultProductCategory || 'general';

  console.log('[ProductForm] Context:', {
    userId,
    organizationId,
    userRole,
    targetChannels,
    assignedCategories,
    organizationDefaultCategory
  });

  // ========================================================================
  // CUSTOM HOOKS
  // ========================================================================

  // Form state management
  const {
    formData,
    setFormData,
    expandedSections,
    toggleSection,
    showJsonPreview,
    setShowJsonPreview
  } = useProductFormState({
    initialData,
    organizationDefaultCategory
  });

  // Schema loading
  const {
    schema,
    isLoadingSchema,
    schemaError,
    formStage,
    isAddingCategoryFields,
    loadSchema,
    loadCategoryFieldsSmooth
  } = useProductFormSchema({
    userId,
    organizationId,
    userRole,
    targetChannels
  });

  // Field visibility
  const { getVisibleFields } = useFieldVisibility();

  // Field validation
  const {
    fieldErrors,
    handleFieldBlur: validateOnBlur
  } = useFieldValidation();

  // Product submission
  const {
    isSubmitting,
    submitError,
    validationResult,
    showValidation,
    submitProduct,
    setShowValidation
  } = useProductSubmission({
    userId,
    organizationId,
    userRole,
    targetChannels,
    category: formData.category || organizationDefaultCategory
  });

  // Memoized category change handler to prevent infinite loops
  const handleCategoryChange = useCallback((category: string) => {
    console.log('[ProductForm] ═══════════════════════════════════════');
    console.log('[ProductForm] 🎯 handleCategoryChange callback triggered');
    console.log('[ProductForm] Category:', category);
    console.log('[ProductForm] Calling loadCategoryFieldsSmooth...');
    loadCategoryFieldsSmooth(category);
  }, [loadCategoryFieldsSmooth]);

  // Field change handling
  const { handleFieldChange: handleFieldChangeInternal, handleVariantConfiguratorChange } = useProductFieldHandler({
    formData,
    setFormData,
    onCategoryChange: handleCategoryChange
  });

  // Diagnostic logging after all hooks
  console.log('[ProductForm] 📊 Current Hook Values:', {
    schemaFieldCount: schema?.fields?.length || 0,
    formStage,
    isLoadingSchema,
    schemaError: schemaError ? 'YES' : 'NO',
    categoryInFormData: formData.category,
    hasVariants: formData.hasVariants
  });

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Load initial schema on mount - ONLY ONCE
  useEffect(() => {
    console.log('[ProductForm] Loading initial schema (essential fields) - MOUNT ONLY');
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run once on mount, never again

  // Apply schema default values when schema changes
  useEffect(() => {
    if (!schema || !schema.fields) return;

    console.log('[ProductForm] Applying schema default values');

    setFormData(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      for (const field of schema.fields) {
        const fieldName = field.name || field.fieldName;

        // Apply default value if field is empty and has a default
        if (
          field.defaultValue !== undefined &&
          field.defaultValue !== null &&
          (updated[fieldName] === undefined || updated[fieldName] === null || updated[fieldName] === '')
        ) {
          console.log(`[ProductForm] Setting default value for ${fieldName}:`, field.defaultValue);
          updated[fieldName] = field.defaultValue;
          hasChanges = true;
        }
      }

      return hasChanges ? updated : prev;
    });
  }, [schema, setFormData]);

  // ========================================================================
  // EVENT HANDLERS
  // ========================================================================

  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    handleFieldChangeInternal(fieldName, value);
  }, [handleFieldChangeInternal]);

  const handleFieldBlur = useCallback((field: any) => {
    const fieldName = field.name || field.fieldName;
    const value = formData[fieldName];
    validateOnBlur(field, value);
  }, [formData, validateOnBlur]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ProductForm] Form submitted');

    if (!schema) {
      console.error('[ProductForm] Cannot submit - schema not loaded');
      return;
    }

    // Validate category
    const categoryValidation = validateProductCategory(
      formData.category || '',
      assignedCategories,
      organizationDefaultCategory
    );

    if (!categoryValidation.isValid && categoryValidation.warning) {
      alert(categoryValidation.warning);
      return;
    }

    // Generate product from form data
    const product = generateMasterProduct({
      formData,
      schema,
      organizationId,
      userId
    });

    console.log('[ProductForm] Generated product:', product);

    // Submit product
    const createdProduct = await submitProduct(product);

    if (createdProduct && onProductCreated) {
      onProductCreated(createdProduct, targetChannels);
    }
  }, [
    schema,
    formData,
    assignedCategories,
    organizationDefaultCategory,
    organizationId,
    userId,
    submitProduct,
    onProductCreated,
    targetChannels
  ]);

  // ========================================================================
  // MEMOIZED VALUES
  // ========================================================================

  // Get visible and filtered fields (same as old component)
  const sortedSections = useMemo(() => {
    if (!schema || !schema.fields) return [];

    // Step 1: Get visible fields based on conditional visibility
    const visibleFields = getVisibleFields(schema.fields, formData);

    // Step 2: Filter by displayLevel (essential, basic, category-specific)
    const filteredFields = visibleFields.filter((field: any) => {
      const displayLevel = (field.displayLevel || '').toLowerCase();
      const isEssential = displayLevel === 'essential';
      const isBasic = displayLevel === 'basic';
      const isCategorySpecific = displayLevel === 'category-specific';
      const isConditionalField = field.conditionalVisibility !== null;

      // For initial load (no category selected)
      if (formStage === 'essential') {
        return isEssential || isBasic;
      }

      // After category selected, show applicable fields
      return isEssential || isBasic || isCategorySpecific || isConditionalField;
    });

    // Step 3: Sort by order
    const sortedFields = filteredFields.sort((a: any, b: any) => {
      return (a.order ?? 999) - (b.order ?? 999);
    });

    // Step 4: Group by section property (exclude variant fields)
    const fieldsBySection = groupFieldsBySection(sortedFields, ['hasVariants', 'variantConfigurator']);

    // Step 5: Sort sections by metadata order
    const sections = Object.entries(fieldsBySection).sort(([keyA], [keyB]) => {
      const metaA = getSectionMetadata(keyA);
      const metaB = getSectionMetadata(keyB);
      return metaA.order - metaB.order;
    });

    return sections;
  }, [schema, formData, formStage, getVisibleFields]);

  // ========================================================================
  // RENDERING
  // ========================================================================

  // Loading state
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

  // Schema error state
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

  // No schema loaded
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

  // Main form render
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Create Product
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {formStage === 'essential' ? 'Fill in essential product details' : 'Complete product information'}
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

      {/* Category loading indicator */}
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
        <ValidationResultDisplay
          result={validationResult}
          onClose={() => setShowValidation(false)}
        />
      )}

      {/* Form sections */}
      {sortedSections.map(([sectionKey, sectionFields]) => {
        const sectionMeta = getSectionMetadata(sectionKey);
        const IconComponent = sectionMeta.icon;
        const isExpanded = expandedSections.has(sectionKey);
        const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

        return (
          <Card key={sectionKey}>
            <CardHeader
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={() => toggleSection(sectionKey)}
              role="button"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <ChevronIcon className="h-5 w-5 text-gray-500" />
                  <IconComponent className={`h-5 w-5 ${sectionMeta.iconColor}`} />
                  <CardTitle className="text-lg">{sectionMeta.label}</CardTitle>
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                    {sectionFields.length} {sectionFields.length === 1 ? 'field' : 'fields'}
                  </span>
                </div>
                {sectionMeta.description && (
                  <p className="text-sm text-gray-500">{sectionMeta.description}</p>
                )}
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="space-y-4 pt-4">
                {sectionFields.map((field: any, index: number) => {
                  const fieldName = field.name || field.fieldName;
                  const fieldType = (field.fieldType || '').toLowerCase();

                  // Skip special field types that have custom rendering
                  if (fieldType === 'variant_configurator' || fieldType === 'variant-configurator') {
                    return null; // Skip - rendered separately
                  }

                  const hasError = !!fieldErrors[fieldName];
                  const errorClass = hasError
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';
                  const baseClass = `w-full px-3 py-2 border rounded-md shadow-sm ${errorClass} transition-colors dark:bg-gray-800 dark:text-white`;

                  return (
                    <div key={`${fieldName}-${index}`} className="space-y-2">
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

                      {/* Input field */}
                      {fieldType === 'textarea' ? (
                        <textarea
                          name={fieldName}
                          placeholder={field.placeholder}
                          value={formData[fieldName] || ''}
                          onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                          onBlur={() => handleFieldBlur(field)}
                          className={baseClass}
                          rows={3}
                        />
                      ) : fieldType === 'select' ? (
                        <select
                          name={fieldName}
                          value={formData[fieldName] || ''}
                          onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                          onBlur={() => handleFieldBlur(field)}
                          className={baseClass}
                        >
                          <option value="">{field.placeholder || 'Select...'}</option>
                          {field.options?.map((option: any) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : fieldType === 'checkbox' ? (
                        <input
                          type="checkbox"
                          name={fieldName}
                          checked={!!formData[fieldName]}
                          onChange={(e) => handleFieldChange(fieldName, e.target.checked)}
                          onBlur={() => handleFieldBlur(field)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      ) : (
                        <input
                          name={fieldName}
                          type={fieldType === 'number' ? 'number' : fieldType === 'email' ? 'email' : 'text'}
                          placeholder={field.placeholder}
                          value={formData[fieldName] || ''}
                          onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                          onBlur={() => handleFieldBlur(field)}
                          className={baseClass}
                        />
                      )}

                      {/* Error message */}
                      {fieldErrors[fieldName] && (
                        <p className="text-xs text-red-600 flex items-start">
                          <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                          {fieldErrors[fieldName]}
                        </p>
                      )}

                      {/* Help text */}
                      {field.helpText && !fieldErrors[fieldName] && (
                        <p className="text-xs text-gray-500 flex items-start">
                          <HelpCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Variant Section (hasVariants checkbox + Configurator) */}
      {(() => {
        if (!schema || !schema.fields) return null;

        // Find hasVariants field and variantConfigurator field in schema
        const hasVariantsField = schema.fields.find((field: any) => {
          const fieldName = field.name || field.fieldName;
          return fieldName === 'hasVariants';
        });

        const variantField = schema.fields.find((field: any) => {
          const fieldType = (field.fieldType || '').toLowerCase();
          return fieldType === 'variant_configurator' || fieldType === 'variant-configurator';
        });

        // Only render section if variantConfigurator field exists in schema
        // (hasVariants checkbox will be rendered even if not explicitly in schema)
        if (!variantField) return null;

        const hasVariantsEnabled = formData['hasVariants'] || false;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>{variantField?.label || 'Product Variants'}</span>
              </CardTitle>
              {variantField?.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {variantField.description}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Always render hasVariants checkbox when variantConfigurator exists */}
              <div className="flex items-start p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                <input
                  type="checkbox"
                  id="hasVariants"
                  checked={hasVariantsEnabled}
                  onChange={(e) => {
                    console.log('[ProductForm] hasVariants checkbox clicked:', e.target.checked);
                    handleFieldChange('hasVariants', e.target.checked);
                  }}
                  className="mt-1 mr-3 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div>
                  <label htmlFor="hasVariants" className="font-medium text-lg cursor-pointer text-gray-800">
                    {hasVariantsField?.label || 'This product has variants'}
                  </label>
                  <p className="text-sm text-gray-600 mt-1">
                    {hasVariantsField?.helpText || 'Enable this to configure product variations (e.g., different sizes, colors, materials)'}
                  </p>
                  <div className="mt-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      hasVariantsEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {hasVariantsEnabled ? '✓ Variants Enabled' : 'Variants Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning when hasVariants is disabled */}
              {variantField && !hasVariantsEnabled && (
                <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                    <span className="text-sm text-yellow-800">
                      Enable "Has Variants" checkbox above to configure product variants.
                    </span>
                  </div>
                </div>
              )}

              {/* Debug: Show what fields are in schema */}
              {hasVariantsEnabled && debugMode && (() => {
                const totalFields = schema?.fields?.length || 0;
                const selectFields = schema?.fields?.filter((f: any) =>
                  (f.fieldType === 'SELECT' || f.fieldType === 'select')
                ) || [];

                console.log('[DEBUG PANEL RENDER]', {
                  totalFields,
                  selectFieldCount: selectFields.length,
                  formStage,
                  category: formData.category,
                  hasVariants: formData.hasVariants
                });

                return (
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg text-xs">
                    <strong>🐛 Debug: Schema Fields (Live)</strong>
                    <div className="mt-2 space-y-1">
                      <div><strong>Total fields:</strong> {totalFields}</div>
                      <div><strong>SELECT fields:</strong> ({selectFields.length} found)</div>
                      {selectFields.map((f: any) => (
                        <div key={f.fieldName || f.name} className="ml-4">
                          • {f.fieldName || f.name} ({f.fieldType}) -
                          {f.options?.length || 0} options -
                          displayLevel: {f.displayLevel} -
                          conditional: {f.conditionalVisibility ? 'yes' : 'no'}
                        </div>
                      ))}
                      <div className="mt-2"><strong>Current formData.hasVariants:</strong> {String(formData.hasVariants)}</div>
                      <div><strong>Current formData.category:</strong> {formData.category || 'none'}</div>
                      <div><strong>Form stage:</strong> {formStage}</div>
                      <div className="mt-2 text-xs text-gray-500">
                        Last render: {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Variant Configurator - always rendered but styled based on enabled state */}
              {variantField && (() => {
                console.log('[ProductForm] 🎯 About to render VariantConfiguratorDynamic');
                console.log('[ProductForm] Schema being passed:', {
                  schemaExists: !!schema,
                  schemaFieldsCount: schema?.fields?.length || 0,
                  formStageFromHook: formStage,
                  hasVariantsEnabled,
                  category: formData.category
                });

                return (
                  <div className={`transition-all duration-300 ${
                    hasVariantsEnabled ? 'opacity-100' : 'opacity-60'
                  }`}>
                    <VariantConfiguratorDynamic
                      value={formData.variantConfigurator}
                      onChange={handleVariantConfiguratorChange}
                      schema={schema}
                      formData={formData}
                    />
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        );
      })()}

      {/* JSON Preview */}
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

      {/* Submit button */}
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

      {/* Debug mode */}
      {debugMode && (
        <Card>
          <CardHeader>
            <CardTitle>Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto max-h-64">
              {JSON.stringify(
                {
                  userId,
                  organizationId,
                  userRole,
                  targetChannels,
                  assignedCategories,
                  formStage,
                  visibleFieldsCount: sortedSections.reduce((count, [_, fields]) => count + fields.length, 0),
                  sectionsCount: sortedSections.length
                },
                null,
                2
              )}
            </pre>
          </CardContent>
        </Card>
      )}
    </form>
  );
}
