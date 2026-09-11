"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import type { ChannelFormField, MasterMappedSuggestion } from "../../types/channelStore";
import CategoryTreePicker from "./CategoryTreePicker";
import MultiSelectCombobox from "./MultiSelectCombobox";
import MoneyInput from "../../../components/inputs/MoneyInput";
import QuantityInput from "../../../components/inputs/QuantityInput";
import { classifyNumericField } from "../../../components/inputs/field-format";
import { MediaUploadService } from "../../../services/media-upload.service";
import { useAuth } from "@/shared/contexts/AuthContext";

const BASE = "http://localhost:8888/labamap/api/v1";

interface Props {
  field: ChannelFormField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
  /** Scenario E: SET_VALIDATION override from useChannelFieldVisibility — merged on top of field.validationRules */
  validationRules?: ChannelFormField["validationRules"];
}

// ── Scenario A: lazy-load merchant options ────────────────────────────────────

/**
 * When a field has optionsSource === "MERCHANT_API" and a non-empty optionsEndpoint,
 * options are fetched once on mount from the backend merchant-data endpoint.
 * Eager-embedded fields (options[] already populated by backend) skip the fetch entirely.
 */
function useMerchantOptions(field: ChannelFormField) {
  const isLazy =
    field.optionsSource === "MERCHANT_API" &&
    Boolean(field.optionsEndpoint) &&
    (field.options ?? []).length === 0;

  const [options, setOptions] = useState<Array<{ value: string; label: string }>>(
    field.options ?? []
  );
  const [loading, setLoading] = useState(isLazy);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLazy) return;
    setLoading(true);
    setError(null);
    fetch(`${BASE}${field.optionsEndpoint}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<{ options?: Array<{ value: string; label: string }> }>;
      })
      .then((data) => setOptions(data.options ?? []))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load options")
      )
      .finally(() => setLoading(false));
    // Runs once — endpoint is fixed for the lifetime of this field instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { options, loading, error };
}

function OptionsSkeleton({ label }: { label: string }) {
  return (
    <div className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 flex items-center gap-2">
      <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
      <span className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
        Loading {label} options…
      </span>
    </div>
  );
}

function OptionsError({ label, error }: { label: string; error: string }) {
  return (
    <div className="w-full rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5">
      <span className="text-sm text-red-600 dark:text-red-400">
        Failed to load {label} options: {error}
      </span>
    </div>
  );
}

// ── Scenario B: master-to-channel value mapping suggestion banner ─────────────

interface MappingSuggestionBannerProps {
  suggestion: MasterMappedSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
}

function MappingSuggestionBanner({ suggestion, onAccept, onDismiss }: MappingSuggestionBannerProps) {
  const { confidence, masterField, masterValue, suggestedLabel } = suggestion;

  if (confidence === "NONE") {
    return (
      <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
        <span className="mt-0.5 text-amber-500 flex-shrink-0">⚠</span>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          No mapping found for master {masterField} value{" "}
          <strong>&ldquo;{String(masterValue)}&rdquo;</strong>. Please select the closest option manually.
        </p>
      </div>
    );
  }

  const isExact = confidence === "EXACT";

  return (
    <div
      className={`mb-2 rounded-lg border px-3 py-2 ${
        isExact
          ? "border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10"
          : "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`inline-block text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 mb-1 ${
              isExact
                ? "bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400"
                : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
            }`}
          >
            {isExact ? "Exact match" : "Fuzzy match"}
          </span>
          <p className="text-xs text-gray-700 dark:text-gray-300">
            Based on master <span className="font-medium">{masterField}</span>{" "}
            <span className="italic">&ldquo;{String(masterValue)}&rdquo;</span>
            {!isExact && (
              <span className="text-amber-600 dark:text-amber-400"> — verify before accepting</span>
            )}
          </p>
          <p className="mt-0.5 text-xs font-medium text-gray-900 dark:text-white">
            → {suggestedLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={onAccept}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              isExact
                ? "bg-brand-500 hover:bg-brand-600 text-white"
                : "bg-amber-500 hover:bg-amber-600 text-white"
            }`}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Pick different
          </button>
        </div>
      </div>
    </div>
  );
}

// ── IMAGE field: single-image upload (e.g. TikTok size chart) ─────────────────

/**
 * Renders a single image-upload control for an IMAGE-typed channel field. The stored value is a plain
 * image URL string (GCS publicUrl); the backend (ChannelPublishService.stageSizeChart) wraps it into the
 * channel body shape. Own component so useAuth/useParams are called at a valid top level. orgId comes from
 * the auth context, productId from the /products/[masterProductId]/… route — no prop threading needed.
 */
function ChannelImageInput({ field, value, onChange, disabled }: Omit<Props, "validationRules">) {
  const { organization } = useAuth();
  const params = useParams();
  const orgId = organization?.organizationId ?? "";
  const productId = String((params as Record<string, string | string[]>)?.masterProductId ?? "");
  const url = typeof value === "string" ? value : "";

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const res = await MediaUploadService.uploadImage(file, orgId, productId, "gallery");
      onChange(field.fieldName, res.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-selecting the same file
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        disabled={disabled || uploading}
        className="hidden"
        id={`img-${field.fieldName}`}
      />
      {url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={field.label}
            className="h-20 w-20 rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-brand-400 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => onChange(field.fieldName, "")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              Uploading…
            </>
          ) : (
            <>+ Upload {field.label}</>
          )}
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ChannelFieldInput({ field, value, onChange, disabled, validationRules: validationRulesOverride }: Props) {
  // Scenario E: use override when provided, otherwise fall back to field definition
  const effectiveValidation = validationRulesOverride ?? field.validationRules;
  // Always call hook at top level — React rules
  const { options, loading, error } = useMerchantOptions(field);

  // Scenario B: show suggestion banner until accepted or dismissed
  const hasSuggestion =
    Boolean(field.masterMappedSuggestion) &&
    field.masterMappedSuggestion!.confidence !== "NONE";
  const hasNoMatchWarning =
    field.masterMappedSuggestion?.confidence === "NONE";
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  function handleAcceptSuggestion() {
    onChange(field.fieldName, field.masterMappedSuggestion!.suggestedValue);
    setSuggestionDismissed(true);
  }

  const baseClass =
    "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed";

  // Scenario C: CATEGORY_TREE is fully self-contained — renders its own suggestion
  // banner, browsing panel, and breadcrumb. No generic banner wrapper needed.
  if (field.fieldType === "CATEGORY_TREE") {
    return <CategoryTreePicker field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  // Show loading / error skeletons for option-based fields before the switch
  const isOptionField = field.fieldType === "SELECT" || field.fieldType === "MULTISELECT";
  if (isOptionField && loading) return <OptionsSkeleton label={field.label} />;
  if (isOptionField && error)   return <OptionsError label={field.label} error={error} />;

  // Scenario B: render suggestion banner (EXACT/FUZZY) or no-match warning (NONE)
  const showSuggestionBanner = !suggestionDismissed && hasSuggestion;
  const showNoMatchWarning = hasNoMatchWarning;

  return (
    <div>
      {showNoMatchWarning && field.masterMappedSuggestion && (
        <MappingSuggestionBanner
          suggestion={field.masterMappedSuggestion}
          onAccept={handleAcceptSuggestion}
          onDismiss={() => setSuggestionDismissed(true)}
        />
      )}
      {showSuggestionBanner && field.masterMappedSuggestion && (
        <MappingSuggestionBanner
          suggestion={field.masterMappedSuggestion}
          onAccept={handleAcceptSuggestion}
          onDismiss={() => setSuggestionDismissed(true)}
        />
      )}
      {renderInput()}
    </div>
  );

  function renderInput() { switch (field.fieldType) {
    case "IMAGE":
      return <ChannelImageInput field={field} value={value} onChange={onChange} disabled={disabled} />;

    case "TEXTAREA":
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          rows={3}
          className={baseClass + " resize-none"}
        />
      );

    case "SELECT":
      return (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          disabled={disabled}
          className={baseClass}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );

    case "MULTISELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <MultiSelectCombobox
          options={options}
          value={selected}
          onChange={(next) => onChange(field.fieldName, next)}
          disabled={disabled}
          placeholder={field.placeholder ?? "Select…"}
        />
      );
    }

    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.fieldName, e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
        </label>
      );

    case "NUMBER": {
      // Same masking as Step 1: money → currency prefix + thousand grouping, quantity →
      // integer stepper, everything else → plain decimal. No native spinners.
      const kind = classifyNumericField(field.fieldName);
      const numValue = value as number | string | undefined;
      if (kind === "money") {
        return (
          <MoneyInput
            value={numValue}
            currency="IDR"
            onChange={(v) => onChange(field.fieldName, v ?? "")}
            disabled={disabled}
            placeholder={field.placeholder ?? undefined}
            aria-label={field.label}
            className="w-full rounded-xl"
          />
        );
      }
      if (kind === "quantity") {
        return (
          <QuantityInput
            value={numValue}
            min={effectiveValidation?.min ?? 0}
            max={effectiveValidation?.max}
            onChange={(v) => onChange(field.fieldName, v ?? "")}
            disabled={disabled}
            aria-label={field.label}
            className="w-full rounded-xl"
          />
        );
      }
      return (
        <input
          type="text"
          inputMode="decimal"
          value={numValue ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value.replace(/[^\d.]/g, ""))}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          className={baseClass}
        />
      );
    }

    case "DATE":
      return (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          disabled={disabled}
          className={baseClass}
        />
      );

    case "URL":
      return (
        <input
          type="url"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          placeholder={field.placeholder ?? "https://"}
          disabled={disabled}
          className={baseClass}
        />
      );

    case "EMAIL":
      return (
        <input
          type="email"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          className={baseClass}
        />
      );

    default: { // TEXT, COLOR, etc.
      // When options are present, add a datalist so taxonomy values appear as
      // browser autocomplete suggestions while still allowing free-text input.
      // Used by dynamic variant option columns (Color, Size, Pattern per-variant cells)
      // where Shopify accepts any string but suggests taxonomy labels.
      const listId = options.length > 0 ? `dl-${field.fieldName}` : undefined;
      // Dedupe by the displayed label — a channel taxonomy vocabulary can repeat a label
      // (e.g. two "6-7 years" size nodes), which both duplicates React keys and shows the
      // same suggestion twice. The datalist only surfaces the label, so label is the identity.
      const datalistOptions = listId
        ? options.filter((o, i, arr) => arr.findIndex((x) => x.label === o.label) === i)
        : [];
      return (
        <>
          <input
            type="text"
            list={listId}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.fieldName, e.target.value)}
            placeholder={field.placeholder ?? ""}
            disabled={disabled}
            maxLength={effectiveValidation?.maxLength}
            className={baseClass}
          />
          {listId && (
            <datalist id={listId}>
              {datalistOptions.map((opt) => (
                <option key={opt.label} value={opt.label} />
              ))}
            </datalist>
          )}
        </>
      );
    }
  } } // closes switch + renderInput
}
