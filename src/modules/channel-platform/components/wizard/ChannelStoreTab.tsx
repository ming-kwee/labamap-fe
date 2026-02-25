"use client";
import React, { useState } from "react";
import type {
  ChannelSchemaPerStore,
  ChannelFormSection,
} from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";
import VariantOverridesTable from "./VariantOverridesTable";

interface StoreFormValues {
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

interface Props {
  schema: ChannelSchemaPerStore;
  values: StoreFormValues;
  onChange: (values: StoreFormValues) => void;
  isSaving: boolean;
  lastSaved?: Date;
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
}: {
  field: import("../../types/channelStore").ChannelFormField;
  value: unknown;
  onChange: (name: string, val: unknown) => void;
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
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {field.label}
        {field.required && <span className="text-error-500 ml-0.5">*</span>}
      </label>
      <ChannelFieldInput field={field} value={value} onChange={onChange} />
      {field.helpText && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{field.helpText}</p>
      )}
    </div>
  );
}

export default function ChannelStoreTab({ schema, values, onChange, isSaving, lastSaved }: Props) {
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  function handleFieldChange(fieldName: string, value: unknown) {
    onChange({
      ...values,
      channelData: { ...values.channelData, [fieldName]: value },
    });
  }

  function handleVariantChange(sku: string, fieldName: string, value: unknown) {
    const existing = values.variantOverrides[sku] ?? {};
    onChange({
      ...values,
      variantOverrides: {
        ...values.variantOverrides,
        [sku]: { ...existing, [fieldName]: value },
      },
    });
  }

  const sections = [...schema.sections].sort((a, b) => a.priority - b.priority);

  function renderSection(section: ChannelFormSection) {
    if (section.sectionName === "variant_overrides") {
      if (!section.variantFields?.length || !section.variants?.length) return null;
      return (
        <div key={section.sectionName} className="space-y-3">
          <SectionHeader label={section.label} count={section.variants.length} expanded />
          <VariantOverridesTable
            variantFields={section.variantFields}
            variants={section.variants}
            overrides={values.variantOverrides}
            onChange={handleVariantChange}
          />
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
                />
              </div>
            ))}
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
    </div>
  );
}
