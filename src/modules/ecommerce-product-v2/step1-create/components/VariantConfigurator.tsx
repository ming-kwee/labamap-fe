"use client";

/**
 * VariantConfigurator
 * Fully dynamic variant configurator — detects dimensions from backend schema.
 * Phase 5: when productTypeDimensions is provided, those dimensions take
 * precedence over the heuristic schema detection (filtered + sorted by type order).
 */

import React, { useState, useMemo } from 'react';
import VariantMultiImageUpload from './VariantMultiImageUpload';
import SkuMatrixPreview from './SkuMatrixPreview';
import MoneyInput from '../../components/inputs/MoneyInput';
import QuantityInput from '../../components/inputs/QuantityInput';
import { classifyNumericField, cssColorOrNull, inputBaseClass } from '../../components/inputs/field-format';
import { Trash2 } from '@/shared/ui/icons/Icons';
import type { VariantDimension as ProductTypeVariantDimension } from '@/app/(admin)/omni-admin/product-types/_types/product-type';

// Module-level constant — must not be inside the component or a useMemo,
// because it is referenced by useState initializers that run before any hook.
const NON_DIMENSION_KEYS = new Set([
  'id', '_id', 'sku', 'SKU', 'price', 'comparePrice', 'compareAtPrice',
  'inventory', 'quantity', 'stock', 'stockQuantity', 'costPrice',
  'barcode', 'weight', 'variantImages', 'images', 'galleryImages',
  'variantLabel', 'variantOptions',
]);

interface VariantOption {
  id: string;
  [key: string]: any;
}

interface VariantDimension {
  name: string;
  label: string;
  options: string[];
}

interface VariantConfiguratorProps {
  value?: string;
  onChange: (value: string) => void;
  schema?: any;
  formData?: any;
  organizationId?: string;
  productId?: string;
  /**
   * Phase 5: ordered variant dimensions from the category's ProductType.
   * When provided, only schema fields whose name matches an attributeCode here
   * are used as dimensions, ordered by ProductType.variantDimension.order.
   * Falls back to heuristic schema detection when empty/undefined.
   */
  productTypeDimensions?: ProductTypeVariantDimension[];
  /**
   * Phase 5: options per dimension axis fetched from master attributes.
   * Maps attributeCode → string[] of selectable values (e.g. "color" → ["Red","Blue"]).
   * When provided alongside productTypeDimensions, bypasses schema-derived options entirely.
   */
  dimensionOptions?: Map<string, string[]>;
  /** Display name of the resolved ProductType (shown in banner). */
  productTypeName?: string | null;
  /** True while the ProductType + attribute options are being fetched. */
  isLoadingVariantOptions?: boolean;
  /** ISO currency code for per-variant money cells. Defaults to IDR (platform default). */
  currency?: string;
}

const VariantConfigurator: React.FC<VariantConfiguratorProps> = ({
  value,
  onChange,
  schema,
  formData = {},
  organizationId = 'org-default',
  productId = 'temp-product',
  productTypeDimensions = [],
  dimensionOptions,
  productTypeName,
  isLoadingVariantOptions = false,
  currency = 'IDR',
}) => {
  function isFieldVisible(field: any, currentFormData: any): boolean {
    if (!field.conditionalVisibility) return true;
    const { showWhen } = field.conditionalVisibility;
    if (showWhen) {
      try {
        let expression = showWhen;
        Object.keys(currentFormData).forEach(key => {
          const val = currentFormData[key];
          const valStr = typeof val === 'string' ? `'${val}'` : val;
          expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), valStr);
        });
        return new Function(`return ${expression}`)();
      } catch {
        return true;
      }
    }
    return true;
  }

  const { variantDimensions, variantConfig } = useMemo(() => {
    if (!schema?.fields) return { variantDimensions: [], variantConfig: [] };

    const dimensionFields = schema.fields.filter((field: any) => {
      const fieldName = field.fieldName || field.name || '';
      const isVariantOnly = field.variantScope === 'variant_only';
      const hasOptions = (field.fieldType === 'SELECT' || field.fieldType === 'select') &&
                        field.options && Array.isArray(field.options) && field.options.length > 0;

      if (!hasOptions) return false;
      if (isVariantOnly) return true;

      // Explicit product-level scope overrides the legacy name heuristic below: a field the
      // backend scoped as product-level (e.g. `material`, moved to variantScope="product_only"
      // in backend d4945fd) must NOT be treated as a variant dimension/column, even though its
      // name matches the heuristic. It renders in the product form section instead.
      if (field.variantScope === 'product_only') return false;

      const fieldNameLower = fieldName.toLowerCase();
      const isCommonVariantField =
        fieldNameLower.includes('color') || fieldNameLower.includes('size') ||
        fieldNameLower.includes('material') || fieldNameLower.includes('style') ||
        fieldNameLower.includes('pattern') || fieldNameLower.includes('finish') ||
        fieldNameLower.includes('texture') || fieldNameLower.includes('fabric') ||
        fieldNameLower.includes('type') || fieldNameLower.includes('variant');

      const isExplicitVariantDimension =
        field.validationRules?.isVariantDimension ||
        field.businessContext?.variantDimension ||
        field.metadata?.variantDimension;

      return (isCommonVariantField || isExplicitVariantDimension) && isFieldVisible(field, formData);
    });

    const dimensions: VariantDimension[] = dimensionFields.map((field: any) => ({
      name: field.fieldName || field.name,
      label: field.label,
      options: field.options.map((opt: any) =>
        typeof opt === 'string' ? opt : opt.value || opt.label || opt
      )
    }));

    const getVariantFields = () => {
      const variantField = schema.fields.find((f: any) =>
        f.fieldName === 'variantConfigurator' || f.name === 'variantConfigurator'
      );

      if (variantField?.validationRules?.variantFields) {
        return variantField.validationRules.variantFields;
      }

      type VariantColumn = { name: string; label: string; type: string };
      const nameOf = (f: any) => f.fieldName || f.name || '';
      const humanize = (n: string) => n.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const toColumn = (f: any): VariantColumn => ({
        name: nameOf(f),
        label: f.label || humanize(nameOf(f)),
        type: f.fieldType === 'NUMBER' || f.fieldType === 'number' ? 'number' : 'text',
      });
      const isDimensionName = (n: string) => dimensions.some(d => d.name === n);

      // `dual` fields: product-level XOR variant — become variant columns when hasVariants.
      const dualFields = schema.fields.filter((f: any) => f.variantScope === 'dual');

      // `both` fields: product-level AND per-variant simultaneously, independent values
      // (e.g. WIX product.sku vs variants[*].sku). Resolved from metadata.productAndVariantFields
      // (explicit backend list) or by scanning variantScope === "both". They stay product-level
      // AND also render here as a variant column so each SKU keeps its own value.
      const bothFieldNames: string[] =
        schema.metadata?.productAndVariantFields ||
        schema.fields.filter((f: any) => f.variantScope === 'both').map(nameOf);
      const bothFields = bothFieldNames
        .map((n: string) => schema.fields.find((f: any) => nameOf(f) === n) || { fieldName: n })
        .filter((f: any) => !isDimensionName(nameOf(f)));

      if (dualFields.length > 0 || bothFields.length > 0) {
        const dualCols: VariantColumn[] = dualFields.map(toColumn);
        const dualNames = new Set(dualCols.map((c: VariantColumn) => c.name));
        // Avoid duplicating a column that's already a dual column (scopes are disjoint by
        // contract, but stay defensive against a transitional backend).
        const bothCols = bothFields.map(toColumn).filter((c: VariantColumn) => !dualNames.has(c.name));
        return [
          ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
          { name: 'variantImages', label: 'Images', type: 'images' },
          ...dualCols,
          ...bothCols,
        ];
      }

      return [
        ...dimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' })),
        { name: 'variantImages', label: 'Images', type: 'images' },
        { name: 'price', label: 'Price', type: 'number' },
        { name: 'comparePrice', label: 'Compare Price', type: 'number' },
        { name: 'inventory', label: 'Inventory', type: 'number' },
        { name: 'sku', label: 'SKU', type: 'text' },
        { name: 'barcode', label: 'Barcode', type: 'text' },
        { name: 'weight', label: 'Weight', type: 'number' }
      ];
    };

    return { variantDimensions: dimensions, variantConfig: getVariantFields() };
  }, [schema, formData]);

  // Phase 5: when productTypeDimensions + dimensionOptions are provided, build dimensions
  // directly from the ProductType — bypasses schema-derived options entirely.
  // This fixes the case where the schema endpoint doesn't return SELECT options.
  const activeDimensions = useMemo(() => {
    if (productTypeDimensions.length > 0 && dimensionOptions && dimensionOptions.size > 0) {
      // Primary path: type-driven with fetched options
      return productTypeDimensions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(dim => ({
          name: dim.attributeCode,
          label: dim.attributeName,
          options: dimensionOptions.get(dim.attributeCode) ?? [],
        }))
        .filter(dim => dim.options.length > 0);
    }

    if (productTypeDimensions.length > 0) {
      // Type-driven but options not yet loaded — filter + sort schema-derived dims as fallback
      const normalize = (s: string) => s.toLowerCase().replace(/[_-]/g, '');
      const codeToOrder = new Map(productTypeDimensions.map(d => [normalize(d.attributeCode), d.order]));
      const filtered = variantDimensions.filter(dim => codeToOrder.has(normalize(dim.name)));
      filtered.sort((a, b) => {
        const orderA = codeToOrder.get(normalize(a.name)) ?? 999;
        const orderB = codeToOrder.get(normalize(b.name)) ?? 999;
        return orderA - orderB;
      });
      return filtered;
    }

    // Heuristic fallback: use schema-derived dimensions (no productType assigned)
    return variantDimensions;
  }, [variantDimensions, productTypeDimensions, dimensionOptions]);

  // Dev-only diagnostics: ProductType variant dimensions dropped from the axes because their
  // matched master-attribute has zero options (the primary path filters `options.length > 0`).
  // Surfaced only in development so a "missing axis" isn't a silent mystery; never in production.
  const droppedDimensions = useMemo(() => {
    if (!(productTypeDimensions.length > 0 && dimensionOptions && dimensionOptions.size > 0)) return [];
    return productTypeDimensions.filter(dim => !(dimensionOptions.get(dim.attributeCode)?.length));
  }, [productTypeDimensions, dimensionOptions]);

  // Parse value prop once synchronously so variants and selectedOptions are available
  // on the FIRST render (avoiding the effect-delay that caused derivedDimensions to be
  // empty until after the first paint).
  function parseValue(v: string | undefined): { variants: VariantOption[]; options: Record<string, string[]> | null } {
    if (!v) return { variants: [], options: null };
    try {
      const parsed = typeof v === 'string' ? JSON.parse(v) : v;
      const rawArr = Array.isArray(parsed?.variants) ? parsed.variants as VariantOption[] : [];
      // Normalise: ensure every variant has an `id` so React keys and updateVariant() work.
      const variantArr = rawArr.map((variant, idx) => {
        if (variant.id) return variant;
        // Derive id from sku, or from dimension values, or index fallback
        const skuVal = variant.sku as string | undefined;
        const dimId = Object.entries(variant)
          .filter(([k]) => !NON_DIMENSION_KEYS.has(k))
          .map(([, val]) => String(val).toLowerCase().replace(/\s+/g, '-'))
          .join('-');
        return { ...variant, id: dimId || skuVal || `variant-${idx}` };
      });
      return { variants: variantArr, options: parsed?.options ?? null };
    } catch {
      return { variants: [], options: null };
    }
  }

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(() => {
    const { variants: initVars, options } = parseValue(value);
    if (options) return options;
    // Derive from variants when options not explicitly stored (edit mode)
    const derived: Record<string, string[]> = {};
    for (const v of initVars) {
      for (const [key, val] of Object.entries(v)) {
        if (NON_DIMENSION_KEYS.has(key)) continue;
        if (val == null || typeof val !== 'string' || !val.trim()) continue;
        if (!derived[key]) derived[key] = [];
        if (!derived[key].includes(val as string)) derived[key].push(val as string);
      }
    }
    return derived;
  });
  const [variants, setVariants] = useState<VariantOption[]>(() => parseValue(value).variants);
  const [lastCategory, setLastCategory] = useState<string | undefined>(formData?.category);

  // Derive dimensions from existing variant data when schema/ProductType don't provide them.
  // This is the edit-mode path: essential schema has no type-specific SELECT fields, but the
  // backend GET now returns the saved variants with dimension values at the top level (color,
  // size, etc.). Collecting unique values per non-standard field reconstructs the option axes.
  const derivedDimensions = useMemo((): VariantDimension[] => {
    if (activeDimensions.length > 0 || variants.length === 0) return [];
    const dimMap = new Map<string, Set<string>>();
    for (const variant of variants) {
      for (const [key, val] of Object.entries(variant)) {
        if (NON_DIMENSION_KEYS.has(key)) continue;
        if (val == null || typeof val !== 'string' || !val.trim()) continue;
        if (!dimMap.has(key)) dimMap.set(key, new Set());
        dimMap.get(key)!.add(val as string);
      }
    }
    return Array.from(dimMap.entries()).map(([name, values]) => ({
      name,
      label: name.charAt(0).toUpperCase() + name.slice(1),
      options: Array.from(values),
    }));
  }, [activeDimensions, variants]);

  // Effective dimensions: prefer schema/ProductType; fall back to variant-derived.
  const effectiveDimensions = activeDimensions.length > 0 ? activeDimensions : derivedDimensions;

  // Effective variant table columns — inject dimension columns when schema didn't include them.
  // In edit mode, schema is essential (no type-specific fields), so variantConfig has no
  // dimension columns (Color, Size, Material). effectiveDimensions derives them from variant
  // data. We prepend them here so the table shows the correct columns.
  const effectiveVariantConfig = useMemo(() => {
    if (effectiveDimensions.length === 0) return variantConfig;
    const existingDimNames = new Set(
      (variantConfig as Array<{ name: string; label: string; type: string }>)
        .filter(f => effectiveDimensions.some(d => d.name === f.name))
        .map(f => f.name)
    );
    // Already has dimension columns — schema provided them
    if (existingDimNames.size > 0) return variantConfig;
    // Prepend dimension columns before the non-dimension columns
    const dimCols = effectiveDimensions.map(dim => ({ name: dim.name, label: dim.label, type: 'select' }));
    const nonDimCols = (variantConfig as Array<{ name: string; label: string; type: string }>)
      .filter(f => !effectiveDimensions.some(d => d.name === f.name));
    return [...dimCols, ...nonDimCols];
  }, [variantConfig, effectiveDimensions]);

  React.useEffect(() => {
    const currentCategory = formData?.category;
    if (currentCategory !== lastCategory && activeDimensions.length > 0) {
      const resetSelections: Record<string, string[]> = {};
      activeDimensions.forEach(dim => { resetSelections[dim.name] = []; });
      setSelectedOptions(resetSelections);
      setVariants([]);
      setLastCategory(currentCategory);
    }
  }, [formData?.category, activeDimensions, lastCategory]);

  React.useEffect(() => {
    if (!value) return;
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed?.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
        setVariants(parsed.variants);
        if (parsed.options) {
          // Stored options (from original create flow)
          setSelectedOptions(parsed.options);
        } else {
          // Edit mode: options not in stored JSON — derive selected values from variant data.
          // Each dimension key holds the set of values actually used across all variants.
          const derived: Record<string, string[]> = {};
          for (const variant of parsed.variants as VariantOption[]) {
            for (const [key, val] of Object.entries(variant)) {
              if (NON_DIMENSION_KEYS.has(key)) continue;
              if (val == null || typeof val !== 'string' || !val.trim()) continue;
              if (!derived[key]) derived[key] = [];
              if (!derived[key].includes(val as string)) derived[key].push(val as string);
            }
          }
          if (Object.keys(derived).length > 0) setSelectedOptions(derived);
        }
      }
    } catch {
      // ignore malformed JSON
    }
  // NON_DIMENSION_KEYS is a stable Set created in useMemo — safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateParent = (newVariants: VariantOption[], selections: Record<string, string[]>) => {
    const config = {
      variants: newVariants,
      options: selections,
      totalVariants: newVariants.length,
      dimensions: effectiveDimensions.map(dim => ({
        name: dim.name,
        label: dim.label,
        selectedCount: selections[dim.name]?.length || 0,
        totalOptions: dim.options.length
      }))
    };
    onChange(JSON.stringify(config, null, 2));
  };

  const handleOptionChange = (dimensionName: string, optionValue: string, checked: boolean) => {
    const newSelections = { ...selectedOptions };
    if (checked) {
      newSelections[dimensionName] = [...(newSelections[dimensionName] || []), optionValue];
    } else {
      newSelections[dimensionName] = (newSelections[dimensionName] || []).filter(v => v !== optionValue);
    }
    setSelectedOptions(newSelections);
  };

  const generateVariants = () => {
    const dimsWithSelections = effectiveDimensions.filter(dim =>
      selectedOptions[dim.name] && selectedOptions[dim.name].length > 0
    );
    if (dimsWithSelections.length === 0) return;

    const generateCombinations = (dims: VariantDimension[], current: Record<string, string> = {}): Record<string, string>[] => {
      if (dims.length === 0) return [current];
      const [first, ...rest] = dims;
      const selected = selectedOptions[first.name] || [];
      return selected.flatMap(val =>
        generateCombinations(rest, { ...current, [first.name]: val })
      );
    };

    const allCombinations = generateCombinations(dimsWithSelections);

    const newVariants: VariantOption[] = allCombinations.map(combination => {
      const idParts = dimsWithSelections.map(dim => combination[dim.name]).join('-');
      const id = idParts.toLowerCase().replace(/\s+/g, '-');
      const existing = variants.find(v => v.id === id);

      const variant: VariantOption = {
        id,
        ...combination,
        variantImages: existing?.variantImages || [],
        price: existing?.price || 0,
        comparePrice: existing?.comparePrice || 0,
        inventory: existing?.inventory || 0,
        sku: existing?.sku || `SKU-${idParts.toUpperCase()}`,
        barcode: existing?.barcode || '',
        weight: existing?.weight || 0
      };

      effectiveVariantConfig.forEach((field: any) => {
        if (!Object.prototype.hasOwnProperty.call(variant, field.name)) {
          const existingValue = existing?.[field.name];
          variant[field.name] = field.type === 'number' ? (existingValue || 0) : (existingValue || '');
        }
      });

      return variant;
    });

    setVariants(newVariants);
    updateParent(newVariants, selectedOptions);
  };

  const updateVariant = (id: string, field: string, newValue: any) => {
    const updated = variants.map(v => v.id === id ? { ...v, [field]: newValue } : v);
    setVariants(updated);
    updateParent(updated, selectedOptions);
  };

  // Bulk-apply one value to a column across every generated SKU (Shopify/Ginee "edit all").
  const applyToAll = (field: string, newValue: any) => {
    const updated = variants.map(v => ({ ...v, [field]: newValue }));
    setVariants(updated);
    updateParent(updated, selectedOptions);
  };
  const [bulkPrice, setBulkPrice] = useState<number | undefined>(undefined);
  const [bulkStock, setBulkStock] = useState<number | undefined>(undefined);

  // Select-all / clear per option axis — replaces per-checkbox clicking for wide axes.
  const setAxis = (dimensionName: string, values: string[]) => {
    setSelectedOptions(prev => ({ ...prev, [dimensionName]: values }));
  };

  // Split generated columns: dimensions collapse into one identity cell; the rest stay editable.
  const dimensionCols = effectiveVariantConfig.filter((f: any) => f.type === 'select');
  const valueCols = effectiveVariantConfig.filter((f: any) => f.type !== 'select');
  // First money / quantity column drives the bulk-edit bar (Set price / Set stock for all).
  const priceCol = valueCols.find((f: any) => f.type === 'number' && classifyNumericField(f.name) === 'money');
  const stockCol = valueCols.find((f: any) => f.type === 'number' && classifyNumericField(f.name) === 'quantity');

  const totalCombinations = effectiveDimensions.reduce((total, dim) => {
    const selectedCount = selectedOptions[dim.name]?.length || 0;
    return selectedCount > 0 ? total * selectedCount : total;
  }, 1);

  // Dimensions shaped for SkuMatrixPreview
  const matrixDimensions = effectiveDimensions.map(dim => ({
    name: dim.name,
    label: dim.label,
    selectedOptions: selectedOptions[dim.name] ?? [],
  }));

  const isTypeDriven = productTypeDimensions.length > 0;

  return (
    <div className="space-y-6">
      {/* Phase 5: ProductType banner */}
      {isTypeDriven && productTypeName && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 dark:text-brand-400 flex-shrink-0">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="text-xs text-brand-700 dark:text-brand-300">
            Variant axes driven by <strong>{productTypeName}</strong> product type
            {effectiveDimensions.length > 0 && (
              <span className="ml-1 font-normal text-brand-600 dark:text-brand-400">
                — {effectiveDimensions.map(d => d.label).join(' × ')}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Dev-only: warn when a ProductType variant dimension was dropped for having no options.
          Gated on NODE_ENV → statically eliminated from production builds (never shown to users). */}
      {process.env.NODE_ENV !== "production" && droppedDimensions.length > 0 && (
        <div
          data-testid="dropped-dimensions-dev-warning"
          className="rounded-lg border border-dashed border-amber-400 dark:border-amber-600 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2"
        >
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            ⚠ Dev-only — {droppedDimensions.length} dimensi varian dilewati (tanpa opsi)
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
            Dimensi ini ada di ProductType tapi master-attribute-nya belum punya opsi, jadi tak jadi axis:
          </p>
          <ul className="mt-1 space-y-0.5">
            {droppedDimensions.map(dim => (
              <li key={dim.attributeCode} className="text-[11px] text-amber-700 dark:text-amber-300">
                • <strong>{dim.attributeName}</strong> <code className="font-mono">({dim.attributeCode})</code> — seed opsi di master-attributes agar muncul.
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-amber-500/80 dark:text-amber-400/70 mt-1">Pesan ini hanya tampil saat development.</p>
        </div>
      )}

      {/* Option selectors — pill toggles (one axis per card) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {effectiveDimensions.map(dimension => {
          const selected = selectedOptions[dimension.name] || [];
          const allSelected = dimension.options.length > 0 && selected.length === dimension.options.length;
          return (
            <div
              key={dimension.name}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm text-gray-800 dark:text-gray-100">
                  {dimension.label}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {selected.length}/{dimension.options.length}
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => setAxis(dimension.name, allSelected ? [] : [...dimension.options])}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                  {allSelected ? 'Clear' : 'Select all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {dimension.options.map(option => {
                  const isOn = selected.includes(option);
                  const swatch = cssColorOrNull(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => handleOptionChange(dimension.name, option, !isOn)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                        isOn
                          ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-400'
                      }`}
                    >
                      {swatch && (
                        <span
                          className={`inline-block h-3 w-3 rounded-full ring-1 ${
                            isOn ? 'ring-white/60' : 'ring-black/10 dark:ring-white/20'
                          }`}
                          style={{ backgroundColor: swatch }}
                        />
                      )}
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* SKU matrix live preview */}
      {totalCombinations > 1 && (
        <SkuMatrixPreview dimensions={matrixDimensions} totalSkus={totalCombinations} />
      )}

      {/* Generate button */}
      <div className="flex gap-4 items-center">
        <button
          type="button"
          onClick={generateVariants}
          disabled={totalCombinations === 1}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-900"
        >
          {variants.length > 0 ? 'Regenerate SKUs' : 'Generate SKUs'}
          {effectiveDimensions.length > 0 && (
            <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium">
              {effectiveDimensions.map(dim => selectedOptions[dim.name]?.length || 0).join(' × ')} = {totalCombinations}
            </span>
          )}
        </button>
        {effectiveDimensions.length > 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {effectiveDimensions.length} option{effectiveDimensions.length !== 1 ? 's' : ''} available
          </div>
        )}
      </div>

      {/* Variants table */}
      {variants.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header: title + bulk-edit bar */}
          <div className="flex flex-col gap-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Generated SKUs
              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                {variants.length}
              </span>
            </h4>
            {(priceCol || stockCol) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Bulk edit:</span>
                {priceCol && (
                  <div className="flex items-center gap-1">
                    <MoneyInput
                      compact
                      currency={currency}
                      value={bulkPrice}
                      onChange={setBulkPrice}
                      aria-label="Bulk price"
                      className="w-32"
                    />
                    <button
                      type="button"
                      onClick={() => bulkPrice !== undefined && applyToAll(priceCol.name, bulkPrice)}
                      disabled={bulkPrice === undefined}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/50"
                    >
                      Set price
                    </button>
                  </div>
                )}
                {stockCol && (
                  <div className="flex items-center gap-1">
                    <QuantityInput
                      compact
                      value={bulkStock}
                      onChange={setBulkStock}
                      aria-label="Bulk stock"
                      className="w-28"
                    />
                    <button
                      type="button"
                      onClick={() => bulkStock !== undefined && applyToAll(stockCol.name, bulkStock)}
                      disabled={bulkStock === undefined}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/50"
                    >
                      Set stock
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/70 backdrop-blur">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {dimensionCols.length > 0 && <th className="px-4 py-2.5">Variant</th>}
                  {valueCols.map((field: any) => (
                    <th key={field.name} className="px-3 py-2.5 whitespace-nowrap">{field.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {variants.map((variant, idx) => (
                  <tr
                    key={variant.id ?? variant.sku ?? idx}
                    className="group bg-white even:bg-gray-50/40 hover:bg-brand-50/40 dark:bg-transparent dark:even:bg-gray-800/20 dark:hover:bg-brand-500/5 transition-colors"
                  >
                    {/* Identity cell — dimension values as pills */}
                    {dimensionCols.length > 0 && (
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dimensionCols.map((dimCol: any) => {
                            const val = variant[dimCol.name];
                            if (val == null || val === '') return null;
                            const swatch = cssColorOrNull(val);
                            return (
                              <span
                                key={dimCol.name}
                                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700/60 dark:text-gray-200"
                              >
                                {swatch && (
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                                    style={{ backgroundColor: swatch }}
                                  />
                                )}
                                {String(val)}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    )}

                    {/* Value cells — type-aware inputs */}
                    {valueCols.map((field: any) => {
                      const kind = field.type === 'number' ? classifyNumericField(field.name) : field.type;
                      return (
                        <td key={field.name} className="px-3 py-2 align-middle">
                          {field.type === 'images' ? (
                            <VariantMultiImageUpload
                              variantId={variant.id}
                              currentImages={variant[field.name] || []}
                              onImagesChange={(imageUrls) => updateVariant(variant.id, field.name, imageUrls)}
                              organizationId={organizationId}
                              productId={productId}
                              maxImages={5}
                            />
                          ) : kind === 'money' ? (
                            <MoneyInput
                              compact
                              currency={currency}
                              value={variant[field.name]}
                              onChange={(v) => updateVariant(variant.id, field.name, v ?? 0)}
                              aria-label={field.label}
                              className="w-32"
                            />
                          ) : kind === 'quantity' ? (
                            <QuantityInput
                              compact
                              value={variant[field.name]}
                              onChange={(v) => updateVariant(variant.id, field.name, v ?? 0)}
                              aria-label={field.label}
                              className="w-28"
                            />
                          ) : field.type === 'number' ? (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={variant[field.name] ?? ''}
                              onChange={(e) => updateVariant(variant.id, field.name, e.target.value.replace(/[^\d.]/g, ''))}
                              aria-label={field.label}
                              className={`${inputBaseClass(false, true)} w-24`}
                            />
                          ) : field.type === 'text' ? (
                            <input
                              type="text"
                              value={variant[field.name] || ''}
                              onChange={(e) => updateVariant(variant.id, field.name, e.target.value)}
                              aria-label={field.label}
                              className={`${inputBaseClass(false, true)} w-32`}
                            />
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">{variant[field.name] || '—'}</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Actions */}
                    <td className="px-3 py-2 text-right align-middle">
                      <button
                        type="button"
                        title="Remove SKU"
                        aria-label="Remove SKU"
                        onClick={() => {
                          const updated = variants.filter(v => v.id !== variant.id);
                          setVariants(updated);
                          updateParent(updated, selectedOptions);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
            {variants.length} SKU{variants.length !== 1 ? 's' : ''} · {effectiveDimensions.length} option{effectiveDimensions.length !== 1 ? 's' : ''} ({effectiveDimensions.map(d => d.label).join(', ')})
          </div>
        </div>
      )}

      {effectiveDimensions.length === 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded dark:bg-gray-800 dark:border-gray-700">
          {isLoadingVariantOptions ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Loading variant options…
            </div>
          ) : isTypeDriven && productTypeDimensions.length === 0 ? (
            <div className="text-sm text-amber-700 dark:text-amber-400">
              The product type assigned to this category has no variant dimensions configured.
              Ask your admin to add dimensions (e.g. Color, Size) to the <strong>{productTypeName}</strong> product type.
            </div>
          ) : isTypeDriven && productTypeDimensions.length > 0 ? (
            <div className="text-sm text-amber-700 dark:text-amber-400">
              Variant dimensions are configured but no selectable options were found.
              Ask your admin to add options to the variant attributes (Color, Size, etc.) for the <strong>{productTypeName}</strong> product type.
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Select a product category to see available variant options (e.g. Size, Color).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VariantConfigurator;
