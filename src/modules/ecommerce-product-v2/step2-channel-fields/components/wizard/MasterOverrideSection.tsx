"use client";
import React, { useState } from "react";
import type { ChannelFormField } from "../../types/channelStore";
import MasterOverrideField from "./MasterOverrideField";

interface Props {
  fields: ChannelFormField[];
  values: Record<string, unknown>; // storeValues.masterOverrides
  channelName: string;
  onChange: (fieldName: string, value: unknown | null) => void;
}

export default function MasterOverrideSection({ fields, values, channelName, onChange }: Props) {
  const overrideCount = Object.keys(values).filter((k) => values[k] != null).length;
  const [expanded, setExpanded] = useState(overrideCount > 0);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 bg-brand-50/60 dark:bg-brand-500/5 rounded-xl border border-brand-200/70 dark:border-brand-500/20 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Product Data Override
            </span>
            {!expanded && overrideCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400">
                {overrideCount} overridden
              </span>
            )}
            {!expanded && overrideCount === 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                None — using master values
              </span>
            )}
          </div>
          <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <>
          {/* Info banner */}
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            Fields changed here only apply to <strong>{channelName}</strong>. All other channels continue using master values.
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
            {fields.map((field) => (
              <div
                key={field.fieldName}
                className={field.fieldType === "TEXTAREA" ? "md:col-span-2" : ""}
              >
                <MasterOverrideField
                  field={field}
                  value={values[field.fieldName]}
                  channelName={channelName}
                  onChange={onChange}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
