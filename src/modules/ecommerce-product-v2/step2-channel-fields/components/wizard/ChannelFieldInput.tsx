"use client";
import React from "react";
import type { ChannelFormField } from "../../types/channelStore";

interface Props {
  field: ChannelFormField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

export default function ChannelFieldInput({ field, value, onChange, disabled }: Props) {
  const baseClass =
    "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed";

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
          {field.options?.map((opt) => (
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
          {field.options?.map((opt) => (
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
