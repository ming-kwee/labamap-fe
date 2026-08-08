"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import type {
  ChannelSchemaPerStore,
  ChannelFormSection,
  MasterProductSnapshot,
  CategoryAttributeSection,
  ChannelFormField,
  ResolvedVariantAxis,
  AxisValidationIssue,
} from "../../types/channelStore";
import {
  useChannelFieldVisibility,
  type VisibilityHelpers,
} from "../../hooks/useChannelFieldVisibility";
import ChannelFieldInput from "./ChannelFieldInput";
import VariantOverridesTable from "./VariantOverridesTable";
import MasterOverrideSection from "./MasterOverrideSection";
import StoreImageOverrideEditor from "./StoreImageOverrideEditor";
import { ProductTypeService } from "@/app/(admin)/omni-admin/product-types/_services/product-type.service";
import { normaliseChannelType, applyChannelCategoryDefault } from "../../utils/categoryPrefill";

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
  /** Master product id — sent to /category-attributes so the backend narrows variant axes
   *  (eligible ∩ Step-1 dimensions) for THIS product. Omitting it falls back to eligible-only. */
  masterProductId?: string;
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

// ── Variant axis derivation ──────────────────────────────────────────────────
// The variant axis SET is a fact about the product's Step 1 SKUs, NOT something the
// seller re-picks from channel taxonomy in Step 2. When the backend ships the resolved
// `variantAxes` contract we render that verbatim; until then we derive an equivalent
// structure from the master snapshot (declared dimensions × realized per-SKU values).
// This can NEVER inject a non-variant attribute (e.g. Pattern) or dump the full taxonomy
// vocabulary into option{n}_values — the two failure modes of the old suggestions panel.

/** Case-insensitive lookup of a variant's value on a given axis (by dimension code or name),
 *  across both the structured variantOptions map and flat variant fields. */
function readAxisValue(
  variant: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const lc: Record<string, string> = {};
  const vo = variant.variantOptions as Record<string, string> | undefined;
  if (vo) for (const [k, val] of Object.entries(vo)) lc[k.toLowerCase()] = val;
  for (const [k, val] of Object.entries(variant)) {
    if (typeof val === "string" && val.trim() && k !== "sku" && k !== "variantLabel" && lc[k.toLowerCase()] == null)
      lc[k.toLowerCase()] = val;
  }
  for (const key of keys) {
    const hit = lc[key.toLowerCase()];
    if (hit != null && hit !== "") return hit;
  }
  return undefined;
}

/** Build resolved axes from the channel's variant-axis fields (backend-narrowed
 *  `variantOptionSuggestions` = eligible ∩ Step-1 dims), realizing values/per-SKU from the master
 *  snapshot. Order follows the Step-1 dimension order when known. An axis with no realized value in
 *  the master is dropped — this both stays correct on already-narrowed responses and defends against
 *  a legacy (un-narrowed) response where a non-axis field like Pattern would otherwise leak in. */
function buildAxesFromFields(
  axisFields: ChannelFormField[],
  master?: MasterProductSnapshot | null,
): ResolvedVariantAxis[] {
  if (axisFields.length === 0) return [];
  const variants = (master?.variants ?? []) as Array<Record<string, unknown> & { sku?: string }>;

  // Step-1 dimension order → deterministic option1/2/3 assignment (not the taxonomy list order).
  const dimOrder = new Map<string, number>();
  for (const d of master?.productTypeVariantDimensions ?? []) {
    dimOrder.set(d.attributeCode.toLowerCase(), d.order);
    dimOrder.set(d.attributeName.toLowerCase(), d.order);
  }
  const ordered = [...axisFields].sort((a, b) => {
    const oa = dimOrder.get(a.fieldName.toLowerCase()) ?? dimOrder.get(a.label.toLowerCase()) ?? 999;
    const ob = dimOrder.get(b.fieldName.toLowerCase()) ?? dimOrder.get(b.label.toLowerCase()) ?? 999;
    return oa - ob;
  });

  const axes: ResolvedVariantAxis[] = [];
  for (const f of ordered) {
    if (axes.length >= 3) break; // channels cap variant options at 3
    const perSku: Record<string, string> = {};
    const values: string[] = [];
    const seenVals = new Set<string>();
    for (const v of variants) {
      if (!v.sku) continue;
      const val = readAxisValue(v, [f.fieldName, f.label]);
      if (val == null) continue;
      perSku[v.sku] = val;
      if (!seenVals.has(val)) { seenVals.add(val); values.push(val); }
    }
    if (values.length === 0) continue; // no SKU varies on this field → not a real axis for this product
    axes.push({
      optionIndex: axes.length + 1,
      attributeCode: f.fieldName,
      name: f.label,
      values,
      perSku,
      valueVocabulary: (f.options ?? []).map((o) => ({ label: o.label, channelValueId: String(o.value) })),
    });
  }
  return axes;
}

// ── Variant Axis Summary (read-only) ─────────────────────────────────────────
// Replaces the old selectable "Suggested variant options" panel. Shows the axes that were
// resolved from Step 1 — the seller does not choose these; they edit per-variant values in
// the table above. option{n}_values follow the variants automatically (Shopify's own invariant).

function VariantAxisSummary({
  axes,
  channelName,
  validation,
}: {
  axes: ResolvedVariantAxis[];
  channelName: string;
  validation?: AxisValidationIssue[];
}) {
  const issues = validation ?? [];
  if (axes.length === 0 && issues.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="px-4 py-3 border-l-4 border-l-teal-400 dark:border-l-teal-500 border border-teal-200/60 dark:border-teal-500/20 bg-teal-50/40 dark:bg-teal-500/5 rounded-xl">
        <div className="flex items-center gap-2.5 mb-0.5">
          <span className="text-[10px] font-bold text-teal-500 dark:text-teal-400 uppercase tracking-wider flex-shrink-0">Variant</span>
          <span className="text-sm font-semibold text-teal-800 dark:text-teal-200">
            Variant options → {channelName}
          </span>
          <span className="text-xs bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-500/30 px-1.5 py-0.5 rounded-md text-teal-600 dark:text-teal-400 font-medium">
            {axes.length}
          </span>
        </div>
        <p className="text-xs text-teal-600 dark:text-teal-400">
          Derived from your Step 1 variants — these are the dimensions your SKUs actually vary on.
          Edit per-variant values in the table above; the option value lists follow automatically.
        </p>
      </div>

      {axes.length > 0 && (
        <div className="space-y-1 px-1">
          {axes.map((axis, idx) => (
            <div
              key={axis.attributeCode}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            >
              <span className="text-xs bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-md font-medium flex-shrink-0">
                Option {idx + 1}
              </span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-shrink-0">{axis.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {axis.values.length} value{axis.values.length === 1 ? "" : "s"} — {axis.values.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {issues.map((issue, i) => (
        <div
          key={`${issue.code}-${issue.dimension}-${i}`}
          className={`px-3 py-2 rounded-lg border text-xs ${
            issue.severity === "BLOCKING"
              ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300"
              : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300"
          }`}
        >
          <strong>{issue.dimension}</strong>: {issue.message}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChannelStoreTab({ schema, values, onChange, isSaving, lastSaved, masterProduct, masterProductId, fieldErrors, orgId = "" }: Props) {
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

  // "Unchanged" only when schema has proper required fields already embedded.
  const categoryIsUnchangedFromSchema =
    schema.categoryAttributeSection != null &&
    categoryId === schema.categoryAttributeSection.categoryId &&
    (schema.categoryAttributeSection.requiredFields?.length ?? 0) > 0;

  const [categoryAttrs, setCategoryAttrs] = useState<CategoryAttributeSection | null>(
    schema.categoryAttributeSection ?? null
  );
  const [catAttrsLoading, setCatAttrsLoading] = useState(false);
  const [catAttrsError, setCatAttrsError] = useState<string | null>(null);
  const [catOptionalExpanded, setCatOptionalExpanded] = useState(false);

  // Skip fetch when category already has proper required fields from schema.
  const lastFetchedCategoryId = useRef<string | null>(
    categoryIsUnchangedFromSchema ? (schema.categoryAttributeSection?.categoryId ?? null) : null
  );

  useEffect(() => {
    if (categoryId === lastFetchedCategoryId.current) return;
    lastFetchedCategoryId.current = categoryId;
    if (!categoryId) { setCategoryAttrs(null); return; }
    setCatAttrsLoading(true);
    setCatAttrsError(null);
    // masterProductId narrows variantOptionSuggestions to this product's real axes (eligible ∩
    // Step-1 dims) and demotes non-axis eligible fields (e.g. Pattern) into optionalFields.
    const mpParam = masterProductId ? `&masterProductId=${encodeURIComponent(masterProductId)}` : "";
    const url = `${BASE}/merchant-data/${schema.channelType}/${encodeURIComponent(schema.storeId)}/category-attributes?categoryId=${encodeURIComponent(categoryId)}&organizationId=${encodeURIComponent(orgId)}${mpParam}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<CategoryAttributeSection>;
      })
      .then((data) => {
        setCategoryAttrs(data);
      })
      .catch(() => {
        // Endpoint unreachable — silent, categoryAttrs stays as schema value
        setCatAttrsError(null);
      })
      .finally(() => setCatAttrsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Sync categoryAttrs when schema.categoryAttributeSection is updated by the parent
  // (e.g. after ChannelFieldsWizard does a schema refresh following a failed/empty fetch).
  // Also handles the case where /category-attributes returned empty fields but the schema
  // endpoint has the proper configured fields.
  useEffect(() => {
    if (!schema.categoryAttributeSection) return;
    const schemaFields = (schema.categoryAttributeSection.requiredFields?.length ?? 0) +
                         (schema.categoryAttributeSection.optionalFields?.length ?? 0);
    const currentFields = (categoryAttrs?.requiredFields?.length ?? 0) +
                          (categoryAttrs?.optionalFields?.length ?? 0);
    if (schemaFields > currentFields || !categoryAttrs) {
      setCategoryAttrs(schema.categoryAttributeSection);
      lastFetchedCategoryId.current = schema.categoryAttributeSection.categoryId;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.categoryAttributeSection]);

  // ── Phase 2: Pre-fill CATEGORY_TREE from ProductType channel default ─────────
  // Fills the channel category on the FIRST visit (before any save is persisted) from the
  // ProductType's channelCategoryDefaults. Mirrors the wizard-level pre-fill and shares its
  // leaf/non-leaf rule: leaf → commit value + breadcrumb; non-leaf → browse hint only.
  // A saved/existing category always wins — this never overrides a value already present.

  // Keep a live ref to values so the async callback always writes to current state,
  // not the stale snapshot captured at mount time.
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; });

  const prefillAttempted = useRef(false);

  useEffect(() => {
    if (prefillAttempted.current || !mainCategoryField) return;
    // Resolve productTypeId: prefer the snapshot, fall back to the sessionStorage bridge
    // written by Step 1 create (productTypeId_{masterProductId}). Without the fallback the
    // pre-fill silently no-ops on the first visit when the snapshot hasn't loaded yet.
    const sessionPtId =
      typeof window !== "undefined" && masterProductId
        ? sessionStorage.getItem(`productTypeId_${masterProductId}`)
        : null;
    const productTypeId = masterProduct?.productTypeId ?? sessionPtId ?? null;
    if (!productTypeId) return; // not resolvable yet — effect re-runs when the snapshot arrives
    if (valuesRef.current.channelData[mainCategoryField.fieldName]) return; // already has a value

    prefillAttempted.current = true;
    const field = mainCategoryField; // capture — used inside the async callback

    ProductTypeService.getChannelDefault(productTypeId, normaliseChannelType(schema.channelType))
      .then((def) => {
        if (!def?.categoryId) return;
        // Use valuesRef.current (not the stale closure) so concurrent field edits survive.
        const latest = valuesRef.current;
        if (latest.channelData[field.fieldName]) return; // merchant set a value while in flight
        // leaf → commit categoryId + selectedPath breadcrumb; non-leaf → preFillPath hint only.
        const commitValue = applyChannelCategoryDefault(field, def);
        if (commitValue === undefined) return; // non-leaf → hint only, nothing to commit
        onChange({
          ...latest,
          channelData: { ...latest.channelData, [field.fieldName]: commitValue },
        });
      })
      .catch(() => { /* silent — pre-fill failure must not block merchant */ });
  // Re-runs when productTypeId or the category field becomes available; prefillAttempted
  // guarantees the fetch fires at most once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterProduct?.productTypeId, mainCategoryField?.fieldName]);

  function handleFieldChange(fieldName: string, value: unknown) {
    const isCategoryField = mainCategoryField != null && fieldName === mainCategoryField.fieldName;

    if (isCategoryField && value !== values.channelData[fieldName] && categoryAttrs) {
      // Clear stale category-specific fields (required + optional + variant suggestions)
      // when the seller picks a different category mid-session.
      const staleKeys = new Set([
        ...(categoryAttrs.requiredFields ?? []).map((f) => f.fieldName),
        ...(categoryAttrs.optionalFields ?? []).map((f) => f.fieldName),
        ...(categoryAttrs.variantOptionSuggestions ?? []).map((f) => f.fieldName),
      ]);
      const clearedData = Object.fromEntries(
        Object.entries(values.channelData).filter(([k]) => !staleKeys.has(k))
      );
      // Do NOT write channelData["categoryId"] = GID — backend skips GID values in
      // resolveCategorySlug() and derives the slug from categoryPath (Priority 3).
      onChange({ ...values, channelData: { ...clearedData, [fieldName]: value } });
      return;
    }

    onChange({ ...values, channelData: { ...values.channelData, [fieldName]: value } });
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

  // ── Images I4: per-store image override (channelData.images) ─────────────────
  // Canonical master gallery for the read-only reference. Prefer the snapshot's merged `images`;
  // fall back to [mainImage, ...galleryImages] until the backend snapshot ships `images`.
  const masterImages = useMemo(() => {
    const list =
      masterProduct?.images && masterProduct.images.length
        ? masterProduct.images
        : [masterProduct?.mainImage, ...(masterProduct?.galleryImages ?? [])];
    return (list ?? []).filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  }, [masterProduct]);

  // Non-destructive: write channelData.images only when there's a real override; empty → drop the key
  // so publish falls back to the master gallery (contract docs/images/06 §3).
  function handleImagesOverrideChange(urls: string[] | undefined) {
    const nextChannelData = { ...values.channelData };
    if (urls && urls.length > 0) nextChannelData.images = urls;
    else delete nextChannelData.images;
    onChange({ ...values, channelData: nextChannelData });
  }

  // ── Category field deduplication ─────────────────────────────────────────
  // Backend embeds category-specific required fields (material, size_type, care_instructions)
  // in BOTH schema.sections.required (technical labels from categoryRequirements config) AND
  // categoryAttributeSection.requiredFields (proper Shopify labels from MERGE strategy).
  // To avoid duplication and label inconsistency, we filter these fields OUT of schema sections
  // so they render ONLY from categoryAttrs in the violet CATEGORY section (consistent with
  // create flow where categoryIsUnchangedFromSchema = FALSE).
  const categorySpecificFieldNames = useMemo(() => {
    if (!categoryAttrs) return new Set<string>();
    return new Set([
      ...(categoryAttrs.requiredFields ?? []).map(f => f.fieldName),
      ...(categoryAttrs.optionalFields ?? []).map(f => f.fieldName),
    ]);
  }, [categoryAttrs]);

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

  // ── Resolved variant axes ─────────────────────────────────────────────────
  // The axis SET is owned by the backend, which narrows `variantOptionSuggestions` to
  // (eligible ∩ Step-1 dimensions) for THIS product — so it is already channel-aware (empty for
  // channels without the option{n} mechanism) and product-aware (Pattern demoted to optionalFields).
  // We only realize per-SKU values/order from the master snapshot. `variantAxes` is honored first as
  // a forward-compatible fully-resolved contract if a future backend sends it.
  const resolvedAxes = useMemo<ResolvedVariantAxis[]>(() => {
    const serverAxes = categoryAttrs?.variantAxes;
    if (serverAxes && serverAxes.length > 0) return serverAxes;
    return buildAxesFromFields(categoryAttrs?.variantOptionSuggestions ?? [], masterProduct);
  }, [categoryAttrs?.variantAxes, categoryAttrs?.variantOptionSuggestions, masterProduct]);

  // Axis validation: backend-provided issues plus a client fail-loud check — if a declared Step-1
  // variant dimension the SKUs genuinely vary on (>1 distinct value) did NOT make it into the
  // resolved axes, warn: on Shopify those SKUs would collapse to the same option combo and collide.
  // Only checked while the channel is actively using axes (skip channels with no option{n} concept).
  const axisValidation = useMemo<AxisValidationIssue[]>(() => {
    const backend = categoryAttrs?.axisValidation ?? [];
    if (resolvedAxes.length === 0) return backend;
    const covered = new Set<string>();
    for (const a of resolvedAxes) { covered.add(a.attributeCode.toLowerCase()); covered.add(a.name.toLowerCase()); }
    const variants = (masterProduct?.variants ?? []) as Array<Record<string, unknown> & { sku?: string }>;
    const extra: AxisValidationIssue[] = [];
    for (const d of masterProduct?.productTypeVariantDimensions ?? []) {
      const code = d.attributeCode.toLowerCase();
      const name = d.attributeName.toLowerCase();
      if (covered.has(code) || covered.has(name)) continue;
      if (backend.some((b) => b.dimension.toLowerCase() === name)) continue;
      const distinct = new Set<string>();
      for (const v of variants) { const x = readAxisValue(v, [d.attributeCode, d.attributeName]); if (x) distinct.add(x); }
      if (distinct.size <= 1) continue; // single value → product-level, no collision risk
      extra.push({
        dimension: d.attributeName,
        code: "NOT_EXPRESSIBLE_ON_CHANNEL",
        severity: "WARNING",
        message: `not offered as a variant option for this ${schema.storeName} category — SKUs differing only by ${d.attributeName} may collide. Pick a category that supports it, or adjust Step 1.`,
      });
    }
    return extra.length > 0 ? [...backend, ...extra] : backend;
  }, [categoryAttrs?.axisValidation, resolvedAxes, masterProduct, schema.storeName]);

  // Names of option{n} fields the backend explicitly declares as schema variant fields — we must
  // not prune per-SKU values for those (they belong to the backend, not to derived axes).
  const schemaOptionFieldNames = useMemo(() => {
    const s = new Set<string>();
    for (const section of schema.sections) {
      if (section.sectionName !== "variant_overrides") continue;
      for (const f of section.variantFields ?? []) {
        if (/^option[1-3]$/.test(f.fieldName)) s.add(f.fieldName);
      }
    }
    return s;
  }, [schema.sections]);

  // Keep channelData.option{n}_name / option{n}_values and per-SKU option{n} in sync with the
  // resolved axes. option{n}_values is ALWAYS the distinct set of effective per-SKU values —
  // never the full taxonomy vocabulary. Seller edits in the variant table are preserved (we only
  // seed missing per-SKU values), and guards make this converge in one pass without a render loop.
  useEffect(() => {
    const haveBasis = resolvedAxes.length > 0 || (masterProduct?.variants?.length ?? 0) > 0;
    if (!haveBasis) return; // don't clear saved option keys before the master snapshot loads

    const nextOverrides: Record<string, Record<string, unknown>> = { ...values.variantOverrides };
    let overridesChanged = false;
    resolvedAxes.forEach((axis, idx) => {
      const key = `option${idx + 1}`;
      for (const [sku, val] of Object.entries(axis.perSku)) {
        if (nextOverrides[sku]?.[key] === undefined) {
          nextOverrides[sku] = { ...(nextOverrides[sku] ?? {}), [key]: val };
          overridesChanged = true;
        }
      }
    });

    const nextChannelData: Record<string, unknown> = { ...values.channelData };
    let cdChanged = false;
    const variants = masterProduct?.variants ?? [];
    for (let i = 1; i <= 3; i++) {
      const nameKey = `option${i}_name`;
      const valsKey = `option${i}_values`;
      const optKey = `option${i}`;
      const axis = resolvedAxes[i - 1];
      if (!axis) {
        // Prune stale option keys (e.g. left over from the old suggestions panel that mapped a
        // non-variant attribute like Pattern to an option slot). Skip slots the backend owns.
        if (schemaOptionFieldNames.has(optKey)) continue;
        if (nextChannelData[nameKey] !== undefined) { delete nextChannelData[nameKey]; cdChanged = true; }
        if (nextChannelData[valsKey] !== undefined) { delete nextChannelData[valsKey]; cdChanged = true; }
        for (const sku of Object.keys(nextOverrides)) {
          if (nextOverrides[sku]?.[optKey] !== undefined) {
            const rest = { ...nextOverrides[sku] };
            delete rest[optKey];
            nextOverrides[sku] = rest;
            overridesChanged = true;
          }
        }
        continue;
      }
      if (nextChannelData[nameKey] !== axis.name) { nextChannelData[nameKey] = axis.name; cdChanged = true; }
      const used: string[] = [];
      const seen = new Set<string>();
      for (const v of variants) {
        if (!v.sku) continue;
        const cell = (nextOverrides[v.sku]?.[optKey] as string | undefined) ?? axis.perSku[v.sku];
        if (typeof cell === "string" && cell.trim() && !seen.has(cell)) { seen.add(cell); used.push(cell); }
      }
      const prev = nextChannelData[valsKey];
      const equal = Array.isArray(prev) && prev.length === used.length && prev.every((x, k) => x === used[k]);
      if (!equal) { nextChannelData[valsKey] = used; cdChanged = true; }
    }

    if (overridesChanged || cdChanged) {
      onChange({ ...values, channelData: nextChannelData, variantOverrides: nextOverrides });
    }
  // onChange/values are intentionally read fresh each run; guards prevent a write loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedAxes, values.variantOverrides, values.channelData]);

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
      if (!section.variants?.length) return null;

      // Build one variant-option column per resolved axis (from Step 1, not from a seller
      // selection). fieldType TEXT (not SELECT) — channels accept any string for option values;
      // taxonomy labels are offered as datalist suggestions, not hard constraints.
      // Skip any axis whose fieldName already exists in the schema variantFields to avoid
      // duplicate columns if the backend already includes option1/option2/option3 explicitly.
      const schemaVariantFieldNames = new Set(
        (section.variantFields ?? []).map((f) => f.fieldName)
      );
      const dynamicOptionFields: ChannelFormField[] = [];
      resolvedAxes.forEach((axis, idx) => {
        const fieldName = `option${idx + 1}`;
        if (schemaVariantFieldNames.has(fieldName)) return;
        const datalist = axis.valueVocabulary?.length
          ? axis.valueVocabulary.map((o) => ({ value: o.label, label: o.label }))
          : axis.values.map((v) => ({ value: v, label: v }));
        dynamicOptionFields.push({
          fieldName,
          fieldType: "TEXT",
          label: axis.name,
          required: false,
          placeholder: `Enter ${axis.name}…`,
          options: datalist,
        });
      });

      const allVariantFields = [...(section.variantFields ?? []), ...dynamicOptionFields];
      if (!allVariantFields.length) return null;

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
          {dynamicOptionFields.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30">
              <span className="text-xs text-teal-700 dark:text-teal-300">
                Variant option columns (from Step 1): <strong>{dynamicOptionFields.map(f => f.label).join(", ")}</strong> — pre-filled per SKU, edit any cell to override
              </span>
            </div>
          )}
          <SectionHeader label={section.label} count={section.variants.length} expanded />
          <VariantOverridesTable
            variantFields={allVariantFields}
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
    // Filter out category-specific fields — they render in the violet CATEGORY section
    // from categoryAttrs (with proper Shopify labels), not here (technical labels from config).
    const fields = (section.fields ?? []).filter(
      f => !categorySpecificFieldNames.has(f.fieldName)
    );
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

    const { categoryName: rawCategoryName, categoryPath: rawCategoryPath, requiredFields, optionalFields } = categoryAttrs;

    // Always prefer the human-readable labels resolved by the category picker (selectedPath),
    // falling back to whatever the backend sent in categoryName / categoryPath.
    // This keeps the UI generic — no channel-specific string parsing on the frontend.
    const selectedPath = mainCategoryField?.categoryTreeConfig?.selectedPath ?? [];
    const categoryName = selectedPath.length > 0
      ? (selectedPath[selectedPath.length - 1]?.name ?? rawCategoryName)
      : rawCategoryName;
    const categoryPath = selectedPath.length > 1
      ? selectedPath.slice(0, -1).map(n => n.name)
      : rawCategoryPath;
    const breadcrumb = [...categoryPath, categoryName].filter(Boolean).join(" › ");
    // Variant axes are derived from Step 1 (resolvedAxes) — the seller no longer selects them.
    const showAxisSummary = resolvedAxes.length > 0 || axisValidation.length > 0;

    // When schema has category fields pre-embedded (categoryIsUnchangedFromSchema = TRUE)
    // AND categoryAttrs has no required fields to show, display a compact info banner.
    // Otherwise fall through to the full violet section (consistent with mid-session path).
    if (categoryIsUnchangedFromSchema && requiredFields.length === 0) {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-3 px-4 py-3 border-l-4 border-l-violet-400 dark:border-l-violet-500 border border-violet-200/60 dark:border-violet-500/20 bg-violet-50/40 dark:bg-violet-500/5 rounded-xl">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500 dark:text-violet-400 flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                Category-specific fields applied
              </p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 truncate">
                {breadcrumb} — {optionalFields.length} optional
              </p>
            </div>
          </div>
          {showAxisSummary && (
            <VariantAxisSummary
              key={categoryAttrs.categoryId}
              axes={resolvedAxes}
              channelName={schema.storeName}
              validation={axisValidation}
            />
          )}
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

        {/* Variant axes resolved from Step 1 (read-only summary + validation) */}
        {showAxisSummary && (
          <VariantAxisSummary
            key={categoryAttrs.categoryId}
            axes={resolvedAxes}
            channelName={schema.storeName}
            validation={axisValidation}
          />
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Compute completion locally so the progress bar updates on every keystroke,
  // instead of waiting for the 30-second autosave round-trip.
  // Uses the same visibility/required logic as the field renderer (Scenario E aware).
  const localStats = useMemo(() => {
    let chRequired = 0, chFilled = 0;
    let catRequired = 0, catFilled = 0;
    let recTotal = 0, recFilled = 0;

    const cd = values.channelData;

    for (const section of schema.sections) {
      if (section.sectionName === "master_overrides") continue;

      // Variant required fields: count per-SKU × per-required-variantField.
      // A required variant field (e.g. Inventory Policy) must be filled for EVERY variant SKU.
      if (section.sectionName === "variant_overrides") {
        for (const field of section.variantFields ?? []) {
          if (!field.required) continue;
          for (const variant of section.variants ?? []) {
            const v = values.variantOverrides[variant.sku]?.[field.fieldName];
            chRequired++;
            if (v !== undefined && v !== null && v !== "") chFilled++;
          }
        }
        continue;
      }

      for (const field of section.fields ?? []) {
        // Skip fields owned by categoryAttrs — counted separately below to avoid double-count
        if (categorySpecificFieldNames.has(field.fieldName)) continue;
        if (!visibility.isVisible(field.fieldName)) continue;
        const v = cd[field.fieldName];
        const filled = v !== undefined && v !== null && v !== "";
        if (visibility.isRequired(field.fieldName)) {
          chRequired++;
          if (filled) chFilled++;
        } else if (section.sectionName === "recommended") {
          recTotal++;
          if (filled) recFilled++;
        }
      }
    }

    if (categoryAttrs) {
      for (const field of categoryAttrs.requiredFields) {
        if (!visibility.isVisible(field.fieldName)) continue;
        catRequired++;
        const v = cd[field.fieldName];
        if (v !== undefined && v !== null && v !== "") catFilled++;
      }
    }

    const requiredTotal = chRequired + catRequired;
    const requiredFilled = chFilled + catFilled;
    return {
      requiredTotal,
      requiredFilled,
      channelRequiredTotal:   chRequired,
      channelRequiredFilled:  chFilled,
      categoryRequiredTotal:  catRequired,
      categoryRequiredFilled: catFilled,
      recommendedTotal:  recTotal,
      recommendedFilled: recFilled,
    };
  }, [schema.sections, values.channelData, values.variantOverrides, visibility, categoryAttrs, categorySpecificFieldNames]);

  const stats = localStats;
  const pct = localStats.requiredTotal === 0
    ? 100
    : Math.round((localStats.requiredFilled / localStats.requiredTotal) * 100);
  const hasNoRequired = localStats.requiredTotal === 0;

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

      {/* ── Images I4: per-store image override editor ───────────────────────── */}
      <StoreImageOverrideEditor
        channelType={schema.channelType}
        orgId={orgId}
        masterProductId={masterProductId ?? ""}
        masterImages={masterImages}
        value={Array.isArray(values.channelData.images) ? (values.channelData.images as string[]) : undefined}
        onChange={handleImagesOverrideChange}
        variants={masterProduct?.variants}
        variantOverrides={values.variantOverrides}
        onVariantImagesChange={(sku, urls) =>
          handleVariantChange(sku, "variantImages", urls && urls.length > 0 ? urls : undefined)
        }
      />
    </div>
  );
}
