"use client";
import React, { useState, useEffect, useRef } from "react";
import type {
  ChannelSchemaPerStore,
  ChannelFormSection,
  MasterProductSnapshot,
  CategoryAttributeSection,
  ChannelFormField,
} from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";
import VariantOverridesTable from "./VariantOverridesTable";
import MasterOverrideSection from "./MasterOverrideSection";

const BASE = "http://localhost:8888/labamap/api/v1";

interface StoreFormValues {
  masterOverrides: Record<string, unknown>;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

interface Props {
  schema: ChannelSchemaPerStore;
  values: StoreFormValues;
  onChange: (values: StoreFormValues) => void;
  isSaving: boolean;
  lastSaved?: Date;
  masterProduct?: MasterProductSnapshot;
  fieldErrors?: Set<string>;
}

function SectionHeader({ label, count, expanded, onToggle }: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{count} field{count !== 1 ? "s" : ""}</span>
      </div>
      {onToggle && (
        <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
      )}
    </div>
  );
  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700">
      {inner}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  hasError,
}: {
  field: import("../../types/channelStore").ChannelFormField;
  value: unknown;
  onChange: (name: string, val: unknown) => void;
  hasError?: boolean;
}) {
  if (field.fieldType === "CHECKBOX") {
    return (
      <div className="py-2">
        <ChannelFieldInput field={field} value={value} onChange={onChange} />
        {field.helpText && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-6">{field.helpText}</p>
        )}
      </div>
    );
  }
  return (
    <div>
      <label className={`block text-sm font-medium mb-1 ${hasError ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className={hasError ? 'ring-1 ring-red-500 rounded-xl' : undefined}>
        <ChannelFieldInput field={field} value={value} onChange={onChange} />
      </div>
      {hasError && (
        <p className="text-xs text-red-500 mt-1">This field is required</p>
      )}
      {field.helpText && !hasError && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{field.helpText}</p>
      )}
    </div>
  );
}

export default function ChannelStoreTab({ schema, values, onChange, isSaving, lastSaved, masterProduct, fieldErrors }: Props) {
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  // ── Scenario D: Category-Dependent Dynamic Field Injection ─────────────────

  // Find the first CATEGORY_TREE field across all sections (typically one per store)
  const mainCategoryField: ChannelFormField | null = (() => {
    for (const section of schema.sections) {
      const f = (section.fields ?? []).find(f => f.fieldType === "CATEGORY_TREE");
      if (f) return f;
    }
    return null;
  })();

  // Current category leaf ID — sourced from live channelData state
  const categoryId = mainCategoryField
    ? ((values.channelData[mainCategoryField.fieldName] as string | undefined) ?? null)
    : null;

  // True when the live categoryId matches what the schema was originally built with.
  // In this case, category required/optional fields are already in sections — show only a context banner.
  const categoryIsUnchangedFromSchema =
    schema.categoryAttributeSection != null &&
    categoryId === schema.categoryAttributeSection.categoryId;

  // Category attribute state — initialised from schema pre-fetch (if any)
  const [categoryAttrs, setCategoryAttrs] = useState<CategoryAttributeSection | null>(
    schema.categoryAttributeSection ?? null
  );
  const [catAttrsLoading, setCatAttrsLoading] = useState(false);
  const [catAttrsError, setCatAttrsError] = useState<string | null>(null);
  const [catOptionalExpanded, setCatOptionalExpanded] = useState(false);

  // Track the last categoryId we fetched/have data for — avoids re-fetching on unrelated re-renders
  const lastFetchedCategoryId = useRef<string | null>(
    schema.categoryAttributeSection?.categoryId ?? null
  );

  useEffect(() => {
    // Skip if the categoryId hasn't changed from what we already have
    if (categoryId === lastFetchedCategoryId.current) return;
    lastFetchedCategoryId.current = categoryId;

    if (!categoryId) {
      setCategoryAttrs(null);
      return;
    }

    setCatAttrsLoading(true);
    setCatAttrsError(null);
    const url = `${BASE}/merchant-data/${schema.channelType}/${encodeURIComponent(schema.storeId)}/category-attributes?categoryId=${encodeURIComponent(categoryId)}&organizationId=org_123`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<CategoryAttributeSection>;
      })
      .then(setCategoryAttrs)
      .catch((err: unknown) =>
        setCatAttrsError(err instanceof Error ? err.message : "Failed to load category fields")
      )
      .finally(() => setCatAttrsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  function handleFieldChange(fieldName: string, value: unknown) {
    const isCategoryField = mainCategoryField != null && fieldName === mainCategoryField.fieldName;

    // Scenario D: when the category field changes, clear stale category-specific values
    if (isCategoryField && value !== values.channelData[fieldName] && categoryAttrs) {
      const staleKeys = new Set([
        ...(categoryAttrs.requiredFields ?? []).map((f) => f.fieldName),
        ...(categoryAttrs.optionalFields ?? []).map((f) => f.fieldName),
      ]);
      const clearedData = Object.fromEntries(
        Object.entries(values.channelData).filter(([k]) => !staleKeys.has(k))
      );
      const updatedData: Record<string, unknown> = { ...clearedData, [fieldName]: value };
      // Persist categoryId explicitly so backend resolveCategorySlug() finds it (Path A)
      if (fieldName !== "categoryId") updatedData.categoryId = value;
      onChange({ ...values, channelData: updatedData });
      return;
    }

    const updatedChannelData: Record<string, unknown> = { ...values.channelData, [fieldName]: value };
    // For CATEGORY_TREE fields, also store under the explicit "categoryId" key
    if (isCategoryField && fieldName !== "categoryId") {
      updatedChannelData.categoryId = value;
    }
    onChange({ ...values, channelData: updatedChannelData });
  }

  function handleVariantChange(sku: string, fieldName: string, value: unknown) {
    const existing = values.variantOverrides[sku] ?? {};
    // undefined = remove key from override (reset to master variant value)
    if (value === undefined) {
      const { [fieldName]: _removed, ...rest } = existing;
      onChange({
        ...values,
        variantOverrides: { ...values.variantOverrides, [sku]: rest },
      });
    } else {
      onChange({
        ...values,
        variantOverrides: {
          ...values.variantOverrides,
          [sku]: { ...existing, [fieldName]: value },
        },
      });
    }
  }

  function handleMasterOverrideChange(fieldName: string, value: unknown | null) {
    const next = { ...values.masterOverrides };
    if (value === null) {
      delete next[fieldName]; // null = reset → remove key entirely
    } else {
      next[fieldName] = value;
    }
    onChange({ ...values, masterOverrides: next });
  }

  const sections = [...schema.sections].sort((a, b) => a.priority - b.priority);

  function renderSection(section: ChannelFormSection) {
    if (section.sectionName === "master_overrides") {
      return (
        <MasterOverrideSection
          key="master_overrides"
          fields={section.fields ?? []}
          values={values.masterOverrides}
          channelName={schema.storeName}
          onChange={handleMasterOverrideChange}
        />
      );
    }

    if (section.sectionName === "variant_overrides") {
      if (!section.variantFields?.length || !section.variants?.length) return null;
      const ptDims = masterProduct?.productTypeVariantDimensions;
      const ptName = masterProduct?.productTypeName;
      return (
        <div key={section.sectionName} className="space-y-3">
          {/* Phase 5: ProductType variant dimensions info banner */}
          {ptName && ptDims && ptDims.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
              </svg>
              <span className="text-xs text-brand-700 dark:text-brand-300">
                Variant axes defined by <strong>{ptName}</strong>:{" "}
                {[...ptDims].sort((a, b) => a.order - b.order).map(d => d.attributeName).join(" × ")}
                {ptDims.some(d => d.required) && (
                  <span className="ml-1 text-brand-500 dark:text-brand-400">(required per SKU)</span>
                )}
              </span>
            </div>
          )}
          <SectionHeader label={section.label} count={section.variants.length} expanded />
          <VariantOverridesTable
            variantFields={section.variantFields}
            variants={section.variants}
            overrides={values.variantOverrides}
            onChange={handleVariantChange}
            masterVariants={masterProduct?.variants}
          />
        </div>
      );
    }

    if (section.sectionName === "merchant_data") {
      const fields = section.fields ?? [];
      if (fields.length === 0) return null;
      return (
        <div key="merchant_data" className="space-y-3">
          <div className="px-4 py-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-200 dark:border-blue-500/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">{section.label}</span>
                <span className="text-xs text-blue-500 dark:text-blue-400">{fields.length} field{fields.length !== 1 ? "s" : ""}</span>
              </div>
              <span className="text-xs text-blue-500 dark:text-blue-400 italic">Sourced from your {schema.channelType} account</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
            {fields.map((field) => (
              <div key={field.fieldName} className={field.fieldType === "TEXTAREA" ? "md:col-span-2" : ""}>
                <FieldRow
                  field={field}
                  value={values.channelData[field.fieldName]}
                  onChange={handleFieldChange}
                  hasError={fieldErrors?.has(field.fieldName)}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    const fields = section.fields ?? [];
    if (fields.length === 0) return null;

    const isOptional = section.sectionName === "optional";

    return (
      <div key={section.sectionName} className="space-y-3">
        <SectionHeader
          label={section.label}
          count={fields.length}
          expanded={isOptional ? optionalExpanded : true}
          onToggle={isOptional ? () => setOptionalExpanded((v) => !v) : undefined}
        />
        {(!isOptional || optionalExpanded) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
            {fields.map((field) => (
              <div key={field.fieldName} className={field.fieldType === "TEXTAREA" ? "md:col-span-2" : ""}>
                <FieldRow
                  field={field}
                  value={values.channelData[field.fieldName]}
                  onChange={handleFieldChange}
                  hasError={fieldErrors?.has(field.fieldName)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Scenario D: Render injected category-specific fields ────────────────────

  function renderCategoryAttributeSection() {
    if (!mainCategoryField) return null;

    if (catAttrsLoading) {
      return (
        <div className="space-y-3">
          <div className="px-4 py-3 bg-violet-50 dark:bg-violet-500/10 rounded-xl border border-violet-200 dark:border-violet-500/30 flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin flex-shrink-0" />
            <span className="text-sm text-violet-700 dark:text-violet-300 animate-pulse">
              Loading category-specific fields…
            </span>
          </div>
        </div>
      );
    }

    if (catAttrsError) {
      return (
        <div className="px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
          <span className="text-sm text-red-600 dark:text-red-400">
            Failed to load category fields: {catAttrsError}
          </span>
        </div>
      );
    }

    if (!categoryAttrs) return null;

    const { categoryName, categoryPath, requiredFields, optionalFields } = categoryAttrs;
    const breadcrumb = [...categoryPath, categoryName].filter(Boolean).join(" › ");

    // When the category is unchanged from schema load, required/optional fields are already
    // rendered inside their respective form sections — show only an info banner to avoid duplication.
    if (categoryIsUnchangedFromSchema) {
      return (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500 dark:text-violet-400 flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
              Category-specific fields applied
            </p>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 truncate">
              {breadcrumb} — {requiredFields.length} required, {optionalFields.length} optional
            </p>
          </div>
        </div>
      );
    }

    // Mid-session category change: inject the new category's fields as a separate section.
    const hasOptional = optionalFields.length > 0;

    return (
      <div className="space-y-3">
        {/* Section header */}
        <div className="px-4 py-3 bg-violet-50 dark:bg-violet-500/10 rounded-xl border border-violet-200 dark:border-violet-500/30">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                  Category-specific fields
                </span>
                <span className="text-xs text-violet-500 dark:text-violet-400">
                  {requiredFields.length + optionalFields.length} field
                  {requiredFields.length + optionalFields.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 truncate">
                {breadcrumb}
              </p>
            </div>
          </div>
        </div>

        {/* Required category fields */}
        {requiredFields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
            {requiredFields.map((field) => (
              <div
                key={field.fieldName}
                className={field.fieldType === "TEXTAREA" || field.fieldType === "CATEGORY_TREE" ? "md:col-span-2" : ""}
              >
                <FieldRow
                  field={field}
                  value={values.channelData[field.fieldName]}
                  onChange={handleFieldChange}
                  hasError={fieldErrors?.has(field.fieldName)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Optional category fields — collapsible */}
        {hasOptional && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setCatOptionalExpanded((v) => !v)}
              className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Optional — {categoryName}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {optionalFields.length} field{optionalFields.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-gray-400 text-sm">{catOptionalExpanded ? "▲" : "▼"}</span>
              </div>
            </button>
            {catOptionalExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
                {optionalFields.map((field) => (
                  <div
                    key={field.fieldName}
                    className={field.fieldType === "TEXTAREA" || field.fieldType === "CATEGORY_TREE" ? "md:col-span-2" : ""}
                  >
                    <FieldRow
                      field={field}
                      value={values.channelData[field.fieldName]}
                      onChange={handleFieldChange}
                      hasError={fieldErrors?.has(field.fieldName)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Completion bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              schema.completionPercentage === 100
                ? "bg-success-500"
                : schema.completionPercentage > 0
                ? "bg-warning-500"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            style={{ width: `${schema.completionPercentage}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[3rem] text-right">
          {schema.completionPercentage}%
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {schema.completionStats.requiredFilled}/{schema.completionStats.requiredTotal} required
          {(schema.completionStats.channelRequiredTotal > 0 || schema.completionStats.categoryRequiredTotal > 0) && (
            <span className="ml-1 text-gray-300 dark:text-gray-600">
              ({[
                schema.completionStats.channelRequiredTotal > 0
                  ? `Ch ${schema.completionStats.channelRequiredFilled}/${schema.completionStats.channelRequiredTotal}`
                  : "",
                schema.completionStats.categoryRequiredTotal > 0
                  ? `Cat ${schema.completionStats.categoryRequiredFilled}/${schema.completionStats.categoryRequiredTotal}`
                  : "",
              ].filter(Boolean).join(" · ")})
            </span>
          )}
        </span>
        {/* Autosave indicator */}
        {isSaving && (
          <span className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Saving…</span>
        )}
        {!isSaving && lastSaved && (
          <span className="text-xs text-success-600 dark:text-success-400">
            ✓ Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Field sections */}
      {sections.map(renderSection)}

      {/* Scenario D: category-specific injected fields */}
      {renderCategoryAttributeSection()}
    </div>
  );
}
