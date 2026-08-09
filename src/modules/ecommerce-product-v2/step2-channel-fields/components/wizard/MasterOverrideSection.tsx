"use client";
import React, { useState } from "react";
import type { ChannelFormField } from "../../types/channelStore";
import MasterOverrideField from "./MasterOverrideField";

interface Props {
  fields: ChannelFormField[];
  values: Record<string, unknown>;
  channelName: string;
  onChange: (fieldName: string, value: unknown | null) => void;
  /**
   * Embedded mode (merchant view): the parent card already provides the collapse toggle, so render the
   * fields directly — no inner header, always expanded (one click, not two).
   */
  embedded?: boolean;
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

export default function MasterOverrideSection({ fields, values, channelName, onChange, embedded = false }: Props) {
  const overrideCount = fields.filter((f) => values[f.fieldName] != null).length;
  const [expanded, setExpanded] = useState(overrideCount > 0);

  if (fields.length === 0) return null;

  const body = (
    <>
      {/* Context banner */}
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        Changes here apply to <strong>{channelName}</strong> only — all other channels keep the master value.
      </p>

      {/* Override field cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.fieldName} className={field.fieldType === "TEXTAREA" ? "md:col-span-2" : ""}>
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
  );

  if (embedded) return <div className="space-y-2">{body}</div>;

  return (
    <div className="space-y-2">
      {/* Header — collapsible, brand-stripe accent */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3
          border-l-4 border-l-brand-400 dark:border-l-brand-500
          border border-brand-200/60 dark:border-brand-500/20
          bg-brand-50/40 dark:bg-brand-500/5
          rounded-xl hover:bg-brand-50/70 dark:hover:bg-brand-500/10 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[10px] font-bold text-brand-500 dark:text-brand-400 uppercase tracking-wider flex-shrink-0">
              Override
            </span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              Product Data
            </span>
            {overrideCount > 0 ? (
              <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400 flex-shrink-0">
                {overrideCount} active
              </span>
            ) : (
              <span className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded-md text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">
                {fields.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              {expanded ? "Collapse" : "Expand"}
            </span>
            <ChevronIcon expanded={expanded} />
          </div>
        </div>
      </button>

      {expanded && body}
    </div>
  );
}
