"use client";
import React from "react";
import type { ChannelFormField } from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";
import { useT } from "@/shared/contexts/LocaleContext";

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

/**
 * One override field, Shopify/Ginee-style: a small label on top (with the Override/Reset action at
 * the right of that row) and the input directly beneath — no per-field box, no label-beside-input
 * gap. The parent lays these out in a compact grid so each input is a sensible width, not stretched
 * across the row. When overriding, the master baseline is shown as a caption below.
 */
export default function MasterOverrideField({ field, value, channelName, onChange }: Props) {
  const t = useT();
  const isInherited = value === null || value === undefined;

  const actionButton = isInherited ? (
    <button
      type="button"
      onClick={() => onChange(field.fieldName, field.masterValue ?? "")}
      className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 hover:underline transition-colors flex-shrink-0"
    >
      <EditIcon />
      {t("common.override", "Override")}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => onChange(field.fieldName, null)}
      className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline transition-colors flex-shrink-0"
    >
      <ResetIcon />
      {t("common.reset", "Reset")}
    </button>
  );

  const input = (
    <ChannelFieldInput
      field={{ ...field, currentValue: isInherited ? field.masterValue : value }}
      value={isInherited ? field.masterValue : value}
      onChange={(fieldName, newVal) => onChange(fieldName, newVal)}
      disabled={isInherited}
    />
  );

  // Master reference — shown only when actively overriding, so the seller knows the baseline.
  const masterRef = !isInherited ? (
    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
      {t("override.masterLabel", "Master:")}{" "}
      <span className="font-mono text-gray-500 dark:text-gray-400">{formatMasterValue(field.masterValue)}</span>
      <span className="ml-1.5 text-gray-300 dark:text-gray-600">
        {" "}
        {t("override.onlyChannelUses", "· only {channel} uses your value").replace("{channel}", channelName)}
      </span>
    </p>
  ) : null;

  // Shopify/Ginee-style stacked field: small label on top (with the override/reset action at the
  // right of that row), input directly beneath. No horizontal gap between label and input, and no
  // per-field box — the parent lays these out in a compact grid so each input is a sensible width.
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</label>
        {actionButton}
      </div>
      {input}
      {masterRef}
    </div>
  );
}
