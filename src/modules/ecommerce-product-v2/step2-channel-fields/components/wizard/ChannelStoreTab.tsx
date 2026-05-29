"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import type {
  ChannelSchemaPerStore,
  ChannelFormSection,
  MasterProductSnapshot,
  CategoryAttributeSection,
  ChannelFormField,
} from "../../types/channelStore";
import {
  useChannelFieldVisibility,
  type VisibilityHelpers,
} from "../../hooks/useChannelFieldVisibility";
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
  /** Live completion % from the last save — overrides the frozen schema value. */
  savedCompletionPct?: number;
  /** Real organization ID from auth context — required for merchant-data API calls. */
  orgId?: string;
}

// ── SVG chevron — animated rotation via className ─────────────────────────────
function ChevronIcon({ expanded, className = "" }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""} ${className}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

// ── Section header — color-coded by role, animated collapse ───────────────────
//
// variant="required" → amber left-stripe, locked, "REQUIRED" tag
// variant="optional" → gray  left-stripe, collapsible, "OPTIONAL" tag
// variant="default"  → plain header (variant_overrides, etc.)
//
function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  variant = "default",
  right,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle?: () => void;
  variant?: "required" | "optional" | "default";
  right?: React.ReactNode;
}) {
  const stripeClass = {
    required: "border-l-4 border-l-orange-400 dark:border-l-orange-500 border border-orange-200/60 dark:border-orange-500/20 bg-orange-50/40 dark:bg-orange-500/5",
    optional:  "border-l-4 border-l-gray-300 dark:border-l-gray-600 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40",
    default:   "border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40",
  }[variant];

  const inner = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {variant === "required" && (
          <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wider flex-shrink-0">
            Required
          </span>
        )}
        {variant === "optional" && (
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex-shrink-0">
            Optional
          </span>
        )}
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{label}</span>
        <span className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-gray-400 font-medium flex-shrink-0">
          {count}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {right}
        {onToggle ? (
          <>
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              {expanded ? "Collapse" : "Expand"}
            </span>
            <ChevronIcon expanded={expanded} className="text-gray-400" />
          </>
        ) : variant === "required" ? (
          <span className="text-xs text-orange-400 dark:text-orange-500">mandatory</span>
        ) : null}
      </div>
    </div>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left px-4 py-3 rounded-xl transition-colors hover:brightness-[0.97] dark:hover:brightness-110 ${stripeClass}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={`px-4 py-3 rounded-xl ${stripeClass}`}>
      {inner}
    </div>
  );
}

// ── Individual field row ───────────────────────────────────────────────────────
function FieldRow({
  field,
  value,
  onChange,
  hasError,
  isRequired: isRequiredProp,
  validationRules: validationRulesProp,
}: {
  field: ChannelFormField;
  value: unknown;
  onChange: (name: string, val: unknown) => void;
  hasError?: boolean;
  /** Scenario E: dynamic required override from useChannelFieldVisibility */
  isRequired?: boolean;
  /** Scenario E: SET_VALIDATION override from useChannelFieldVisibility */
  validationRules?: ChannelFormField["validationRules"];
}) {
  const required = isRequiredProp ?? Boolean(field.required);

  if (field.fieldType === "CHECKBOX") {
    return (
      <div className="py-2">
        <ChannelFieldInput field={field} value={value} onChange={onChange} validationRules={validationRulesProp} />
        {field.helpText && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-6">{field.helpText}</p>
        )}
      </div>
    );
  }
  return (
    <div>
      <label className={`block text-sm font-medium mb-1 ${hasError ? "text-red-500" : "text-gray-700 dark:text-gray-300"}`}>
        {field.label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className={hasError ? "ring-1 ring-red-500 rounded-xl" : undefined}>
        <ChannelFieldInput field={field} value={value} onChange={onChange} validationRules={validationRulesProp} />
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

// ── Fields grid — shared across all section types ─────────────────────────────
function FieldsGrid({
  fields,
  channelData,
  onChange,
  fieldErrors,
  visibility,
}: {
  fields: ChannelFormField[];
  channelData: Record<string, unknown>;
  onChange: (name: string, val: unknown) => void;
  fieldErrors?: Set<string>;
  /** Scenario E: visibility helpers from useChannelFieldVisibility */
  visibility?: VisibilityHelpers;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1">
      {fields
        .filter((field) => !visibility || visibility.isVisible(field.fieldName))
        .map((field) => (
          <div
            key={field.fieldName}
            className={field.fieldType === "TEXTAREA" || field.fieldType === "CATEGORY_TREE" ? "md:col-span-2" : ""}
          >
            <FieldRow
              field={field}
              value={channelData[field.fieldName]}
              onChange={onChange}
              hasError={fieldErrors?.has(field.fieldName)}
              isRequired={visibility?.isRequired(field.fieldName)}
              validationRules={visibility?.getValidation(field.fieldName)}
            />
          </div>
        ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChannelStoreTab({ schema, values, onChange, isSaving, lastSaved, masterProduct, fieldErrors, savedCompletionPct, orgId = "" }: Props) {
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  // ── Scenario D: Category-Dependent Dynamic Field Injection ────────────────

  const mainCategoryField: ChannelFormField | null = (() => {
    for (const section of schema.sections) {
      const f = (section.fields ?? []).find(f => f.fieldType === "CATEGORY_TREE");
      if (f) return f;
    }
    return null;
  })();

  const categoryId = mainCategoryField
    ? ((values.channelData[mainCategoryField.fieldName] as string | undefined) ?? null)
    : null;

  const categoryIsUnchangedFromSchema =
    schema.categoryAttributeSection != null &&
    categoryId === schema.categoryAttributeSection.categoryId;

  const [categoryAttrs, setCategoryAttrs] = useState<CategoryAttributeSection | null>(
    schema.categoryAttributeSection ?? null
  );
  const [catAttrsLoading, setCatAttrsLoading] = useState(false);
  const [catAttrsError, setCatAttrsError] = useState<string | null>(null);
  const [catOptionalExpanded, setCatOptionalExpanded] = useState(false);

  const lastFetchedCategoryId = useRef<string | null>(
    schema.categoryAttributeSection?.categoryId ?? null
  );

  useEffect(() => {
    if (categoryId === lastFetchedCategoryId.current) return;
    lastFetchedCategoryId.current = categoryId;
    if (!categoryId) { setCategoryAttrs(null); return; }
    setCatAttrsLoading(true);
    setCatAttrsError(null);
    const url = `${BASE}/merchant-data/${schema.channelType}/${encodeURIComponent(schema.storeId)}/category-attributes?categoryId=${encodeURIComponent(categoryId)}&organizationId=${encodeURIComponent(orgId)}`;
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

    if (isCategoryField && value !== values.channelData[fieldName] && categoryAttrs) {
      const staleKeys = new Set([
        ...(categoryAttrs.requiredFields ?? []).map((f) => f.fieldName),
        ...(categoryAttrs.optionalFields ?? []).map((f) => f.fieldName),
      ]);
      const clearedData = Object.fromEntries(
        Object.entries(values.channelData).filter(([k]) => !staleKeys.has(k))
      );
      const updatedData: Record<string, unknown> = { ...clearedData, [fieldName]: value };
      if (fieldName !== "categoryId") updatedData.categoryId = value;
      onChange({ ...values, channelData: updatedData });
      return;
    }

    const updatedChannelData: Record<string, unknown> = { ...values.channelData, [fieldName]: value };
    if (isCategoryField && fieldName !== "categoryId") {
      updatedChannelData.categoryId = value;
    }
    onChange({ ...values, channelData: updatedChannelData });
  }

  function handleVariantChange(sku: string, fieldName: string, value: unknown) {
    const existing = values.variantOverrides[sku] ?? {};
    if (value === undefined) {
      const { [fieldName]: _removed, ...rest } = existing;
      onChange({ ...values, variantOverrides: { ...values.variantOverrides, [sku]: rest } });
    } else {
      onChange({
        ...values,
        variantOverrides: { ...values.variantOverrides, [sku]: { ...existing, [fieldName]: value } },
      });
    }
  }

  function handleMasterOverrideChange(fieldName: string, value: unknown | null) {
    const next = { ...values.masterOverrides };
    if (value === null) { delete next[fieldName]; } else { next[fieldName] = value; }
    onChange({ ...values, masterOverrides: next });
  }

  // ── Scenario E: collect all fields and evaluate conditional rules ─────────
  const allFields = useMemo(() => {
    const collected: ChannelFormField[] = [];
    for (const section of schema.sections) {
      if (section.fields) collected.push(...section.fields);
    }
    if (categoryAttrs) {
      collected.push(...categoryAttrs.requiredFields);
      collected.push(...categoryAttrs.optionalFields);
    }
    return collected;
  }, [schema.sections, categoryAttrs]);

  const visibility = useChannelFieldVisibility(allFields, values.channelData);

  const sections = [...schema.sections].sort((a, b) => a.priority - b.priority);

  // ── Section renderer ────────────────────────────────────────────────────────

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
        <div key={section.sectionName} className="space-y-2">
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
        <div key="merchant_data" className="space-y-2">
          {/* Blue left-stripe header for live merchant-sourced data */}
          <div className="px-4 py-3 border-l-4 border-l-blue-400 dark:border-l-blue-500 border border-blue-200/60 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-500/5 rounded-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Live</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{section.label}</span>
                <span className="text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-500/30 px-1.5 py-0.5 rounded-md text-blue-600 dark:text-blue-400 font-medium">
                  {fields.length}
                </span>
              </div>
              <span className="text-xs text-blue-500 dark:text-blue-400 italic hidden sm:block">
                from your {schema.channelType} account
              </span>
            </div>
          </div>
          <FieldsGrid
            fields={fields}
            channelData={values.channelData}
            onChange={handleFieldChange}
            fieldErrors={fieldErrors}
            visibility={visibility}
          />
        </div>
      );
    }

    // Generic: "required", "optional", and any other section names
    const fields = section.fields ?? [];
    if (fields.length === 0) return null;

    const isOptional = section.sectionName === "optional";
    const isRequired = section.sectionName === "required";
    const headerVariant = isRequired ? "required" : isOptional ? "optional" : "default";

    return (
      <div key={section.sectionName} className="space-y-2">
        <SectionHeader
          label={section.label}
          count={fields.length}
          expanded={isOptional ? optionalExpanded : true}
          onToggle={isOptional ? () => setOptionalExpanded((v) => !v) : undefined}
          variant={headerVariant}
        />
        {(!isOptional || optionalExpanded) && (
          <FieldsGrid
            fields={fields}
            channelData={values.channelData}
            onChange={handleFieldChange}
            fieldErrors={fieldErrors}
            visibility={visibility}
          />
        )}
      </div>
    );
  }

  // ── Category attribute section (Scenario D) ───────────────────────────────

  function renderCategoryAttributeSection() {
    if (!mainCategoryField) return null;

    if (catAttrsLoading) {
      return (
        <div className="flex items-center gap-2.5 px-4 py-3 border-l-4 border-l-violet-400 dark:border-l-violet-500 border border-violet-200/60 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/5 rounded-xl">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin flex-shrink-0" />
          <span className="text-sm text-violet-700 dark:text-violet-300">Loading category fields…</span>
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

    // Category unchanged from schema load — fields already rendered inside form sections.
    // Show only a compact info banner to avoid duplication.
    if (categoryIsUnchangedFromSchema) {
      return (
        <div className="flex items-start gap-3 px-4 py-3 border-l-4 border-l-violet-400 dark:border-l-violet-500 border border-violet-200/60 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/5 rounded-xl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500 dark:text-violet-400 flex-shrink-0 mt-0.5">
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

    // Mid-session category change — inject the new category's fields directly.
    const hasOptional = optionalFields.length > 0;
    const totalFields = requiredFields.length + optionalFields.length;

    return (
      <div className="space-y-2">
        {/* Violet section header */}
        <div className="px-4 py-3 border-l-4 border-l-violet-400 dark:border-l-violet-500 border border-violet-200/60 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/5 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider flex-shrink-0">Category</span>
              <span className="text-sm font-semibold text-violet-800 dark:text-violet-200 truncate">{categoryName}</span>
              <span className="text-xs bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-500/30 px-1.5 py-0.5 rounded-md text-violet-600 dark:text-violet-400 font-medium flex-shrink-0">
                {totalFields}
              </span>
            </div>
            <span className="text-xs text-violet-500 dark:text-violet-400 hidden sm:block truncate max-w-[200px]">
              {breadcrumb}
            </span>
          </div>
        </div>

        {/* Required category fields */}
        {requiredFields.length > 0 && (
          <FieldsGrid
            fields={requiredFields}
            channelData={values.channelData}
            onChange={handleFieldChange}
            fieldErrors={fieldErrors}
            visibility={visibility}
          />
        )}

        {/* Optional category fields — collapsible */}
        {hasOptional && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setCatOptionalExpanded((v) => !v)}
              className="w-full text-left px-4 py-3 border-l-4 border-l-gray-300 dark:border-l-gray-600 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 rounded-xl hover:brightness-[0.97] dark:hover:brightness-110 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Optional</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{categoryName}</span>
                  <span className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-gray-400 font-medium">
                    {optionalFields.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                    {catOptionalExpanded ? "Collapse" : "Expand"}
                  </span>
                  <ChevronIcon expanded={catOptionalExpanded} className="text-gray-400" />
                </div>
              </div>
            </button>
            {catOptionalExpanded && (
              <FieldsGrid
                fields={optionalFields}
                channelData={values.channelData}
                onChange={handleFieldChange}
                fieldErrors={fieldErrors}
                visibility={visibility}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const stats = schema.completionStats;
  // savedCompletionPct reflects the last save; fall back to schema value on first load.
  const pct = savedCompletionPct ?? schema.completionPercentage;
  const hasNoRequired = (stats?.requiredTotal ?? 0) === 0;

  return (
    <div className="space-y-5">

      {/* ── Completion area ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {hasNoRequired ? (
          /* No required fields — show a simple "no requirements" line */
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400">
              ✓ No required fields
            </span>
            <div className="flex-shrink-0">
              {isSaving && (
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
                  Saving…
                </span>
              )}
              {!isSaving && lastSaved && (
                <span className="text-xs text-success-600 dark:text-success-400">
                  ✓ Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Row 1: bar + percentage + status pill */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    pct === 100 ? "bg-success-500" : pct > 0 ? "bg-warning-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 min-w-[2.5rem] text-right tabular-nums">
                {pct}%
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                pct === 100
                  ? "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400"
                  : pct > 0
                  ? "bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}>
                {pct === 100 ? "✓ Complete" : pct > 0 ? "In progress" : "Not started"}
              </span>
            </div>

            {/* Row 2: breakdown badges + autosave */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium tabular-nums">{stats.requiredFilled}</span>
                  <span className="text-gray-400 dark:text-gray-500">/{stats.requiredTotal}</span>
                  <span className="ml-1">required</span>
                </span>
                {stats.channelRequiredTotal > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium tabular-nums">
                    Ch {stats.channelRequiredFilled}/{stats.channelRequiredTotal}
                  </span>
                )}
                {stats.categoryRequiredTotal > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium tabular-nums">
                    Cat {stats.categoryRequiredFilled}/{stats.categoryRequiredTotal}
                  </span>
                )}
              </div>
              <div className="flex-shrink-0">
                {isSaving && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
                    Saving…
                  </span>
                )}
                {!isSaving && lastSaved && (
                  <span className="text-xs text-success-600 dark:text-success-400">
                    ✓ Saved {lastSaved.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Field sections ──────────────────────────────────────────────────── */}
      {sections.map(renderSection)}

      {/* ── Scenario D: category-specific injected fields ───────────────────── */}
      {renderCategoryAttributeSection()}
    </div>
  );
}
