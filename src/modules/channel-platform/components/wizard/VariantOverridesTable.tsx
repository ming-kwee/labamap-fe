"use client";
import React from "react";
import type { ChannelFormField, VariantOverrideRow } from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";

interface Props {
  variantFields: ChannelFormField[];
  variants: VariantOverrideRow[];
  overrides: Record<string, Record<string, unknown>>;
  onChange: (sku: string, fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

export default function VariantOverridesTable({ variantFields, variants, overrides, onChange, disabled }: Props) {
  if (variants.length === 0 || variantFields.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
              SKU
            </th>
            {variantFields.map((field) => (
              <th
                key={field.fieldName}
                className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300 min-w-[180px]"
              >
                {field.label}
                {field.required && <span className="text-error-500 ml-0.5">*</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {variants.map((variant) => {
            const variantOverride = overrides[variant.sku] ?? {};
            return (
              <tr key={variant.sku} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{variant.sku}</p>
                    {variant.variantLabel && variant.variantLabel !== variant.sku && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{variant.variantLabel}</p>
                    )}
                  </div>
                </td>
                {variantFields.map((field) => (
                  <td key={field.fieldName} className="px-4 py-3">
                    <ChannelFieldInput
                      field={field}
                      value={variantOverride[field.fieldName]}
                      onChange={(_, value) => onChange(variant.sku, field.fieldName, value)}
                      disabled={disabled}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
