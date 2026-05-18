"use client";
import React from "react";
import type { ChannelFormField } from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";

interface Props {
  field: ChannelFormField;
  value: unknown;
  channelName: string;
  onChange: (fieldName: string, value: unknown | null) => void;
}

function formatMasterValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

const EditIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const ResetIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-3.11"/>
  </svg>
);

export default function MasterOverrideField({ field, value, channelName, onChange }: Props) {
  const isInherited = value === null || value === undefined;

  return (
    <div className={`rounded-xl border transition-all duration-150 p-3 space-y-2 ${
      isInherited
        ? "border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/20"
        : "border-brand-200 dark:border-brand-500/40 bg-brand-50/20 dark:bg-brand-500/5"
    }`}>

      {/* Label row + action button — always visible, no hunting below the input */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-none">
          {field.label}
        </label>
        {isInherited ? (
          <button
            type="button"
            onClick={() => onChange(field.fieldName, field.masterValue ?? "")}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg
              border border-brand-200 dark:border-brand-600/50
              text-brand-600 dark:text-brand-400
              bg-white dark:bg-gray-900
              hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:border-brand-300
              transition-colors font-medium flex-shrink-0"
          >
            <EditIcon />
            Override
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(field.fieldName, null)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg
              border border-gray-200 dark:border-gray-700
              text-gray-500 dark:text-gray-400
              bg-white dark:bg-gray-900
              hover:bg-gray-50 dark:hover:bg-gray-800
              transition-colors font-medium flex-shrink-0"
          >
            <ResetIcon />
            Reset
          </button>
        )}
      </div>

      {/* Input — disabled + grayed when inherited, fully active when overriding */}
      <ChannelFieldInput
        field={{ ...field, currentValue: isInherited ? field.masterValue : value }}
        value={isInherited ? field.masterValue : value}
        onChange={(fieldName, newVal) => onChange(fieldName, newVal)}
        disabled={isInherited}
      />

      {/* Master reference shown only when actively overriding */}
      {!isInherited && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Master:{" "}
          <span className="font-mono text-gray-500 dark:text-gray-400">
            {formatMasterValue(field.masterValue)}
          </span>
          <span className="ml-1.5 text-gray-300 dark:text-gray-600">
            · only {channelName} uses your value
          </span>
        </p>
      )}
    </div>
  );
}
