"use client";
import React from "react";
import type { ChannelFormField } from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";

interface Props {
  field: ChannelFormField; // must have isMasterField=true, masterValue set
  value: unknown;          // current override from storeValues.masterOverrides[fieldName], undefined = inherited
  channelName: string;
  onChange: (fieldName: string, value: unknown | null) => void;
  // null → remove override (reset to master)
}

function formatMasterValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default function MasterOverrideField({ field, value, channelName, onChange }: Props) {
  const isInherited = value === null || value === undefined;

  // Render an inactive display input that shows the masterValue when inherited
  const displayField: ChannelFormField = {
    ...field,
    currentValue: isInherited ? field.masterValue : value,
  };

  return (
    <div className="space-y-1.5">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {field.label}
        </label>
        {isInherited ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            Inherited ↓
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400">
            ✏ Overridden
          </span>
        )}
      </div>

      {/* Input */}
      <ChannelFieldInput
        field={displayField}
        value={isInherited ? field.masterValue : value}
        onChange={(fieldName, newVal) => onChange(fieldName, newVal)}
        disabled={isInherited}
      />

      {/* Context row */}
      {isInherited ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Using master value. Changes here only affect {channelName}.
          </p>
          <button
            type="button"
            onClick={() => onChange(field.fieldName, field.masterValue ?? "")}
            className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
          >
            Override for {channelName}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            ↩ Master:{" "}
            <span className="font-mono">{formatMasterValue(field.masterValue)}</span>
          </p>
          <button
            type="button"
            onClick={() => onChange(field.fieldName, null)}
            className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Reset to master
          </button>
        </div>
      )}
    </div>
  );
}
