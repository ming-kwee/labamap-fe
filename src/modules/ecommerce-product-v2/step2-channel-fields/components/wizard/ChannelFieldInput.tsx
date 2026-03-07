"use client";
import React, { useState, useEffect } from "react";
import type { ChannelFormField } from "../../types/channelStore";

const BASE = "http://localhost:8888/labamap/api/v1";

interface Props {
  field: ChannelFormField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────

export default function ChannelFieldInput({ field, value, onChange, disabled }: Props) {
  // Always call hook at top level — React rules
  const { options, loading, error } = useMerchantOptions(field);

  const baseClass =
    "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed";

  // Show loading / error skeletons for option-based fields before the switch
  const isOptionField = field.fieldType === "SELECT" || field.fieldType === "MULTISELECT";
  if (isOptionField && loading) return <OptionsSkeleton label={field.label} />;
  if (isOptionField && error)   return <OptionsError label={field.label} error={error} />;

  switch (field.fieldType) {
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
      function toggleOption(optValue: string) {
        if (selected.includes(optValue)) {
          onChange(field.fieldName, selected.filter((v) => v !== optValue));
        } else {
          onChange(field.fieldName, [...selected, optValue]);
        }
      }
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(opt.value)}
              className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                selected.includes(opt.value)
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand-400"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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

    case "NUMBER":
      return (
        <input
          type="number"
          value={(value as number) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.valueAsNumber)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          min={field.validationRules?.min}
          max={field.validationRules?.max}
          className={baseClass}
        />
      );

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

    default: // TEXT, COLOR, etc.
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.fieldName, e.target.value)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          maxLength={field.validationRules?.maxLength}
          className={baseClass}
        />
      );
  }
}
