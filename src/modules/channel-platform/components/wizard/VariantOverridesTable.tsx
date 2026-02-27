"use client";
import React from "react";
import type { ChannelFormField, VariantOverrideRow, MasterProductSnapshot } from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";

interface Props {
  variantFields: ChannelFormField[];
  variants: VariantOverrideRow[];
  overrides: Record<string, Record<string, unknown>>;
  onChange: (sku: string, fieldName: string, value: unknown) => void;
  disabled?: boolean;
  /** Master product variant values — used to show inherited values for isMasterField columns */
  masterVariants?: MasterProductSnapshot["variants"];
}

export default function VariantOverridesTable({
  variantFields,
  variants,
  overrides,
  onChange,
  disabled,
  masterVariants,
}: Props) {
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
                <div className="flex items-center gap-1.5">
                  {field.label}
                  {field.required && <span className="text-error-500">*</span>}
                  {field.isMasterField && (
                    <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      master
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {variants.map((variant) => {
            const variantOverride = overrides[variant.sku] ?? {};
            const masterVariant = masterVariants?.find((v) => v.sku === variant.sku);

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
                {variantFields.map((field) => {
                  const isMasterField = field.isMasterField === true;
                  const currentOverride = variantOverride[field.fieldName];
                  const hasOverride = currentOverride !== undefined && currentOverride !== null;

                  // For master fields: show master value when no override is set
                  const masterCellValue = isMasterField
                    ? masterVariant?.[field.fieldName as "price" | "quantity"]
                    : undefined;

                  if (isMasterField && !hasOverride) {
                    // Inherited state: show master value grayed out with pencil-to-override button
                    return (
                      <td key={field.fieldName} className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 dark:text-gray-500 text-sm font-mono">
                              {masterCellValue !== undefined ? String(masterCellValue) : "—"}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
                              master
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onChange(variant.sku, field.fieldName, masterCellValue ?? "")}
                            disabled={disabled}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ✏ Override
                          </button>
                        </div>
                      </td>
                    );
                  }

                  if (isMasterField && hasOverride) {
                    // Overridden state: editable input + reset icon
                    return (
                      <td key={field.fieldName} className="px-4 py-3">
                        <div className="space-y-1">
                          <ChannelFieldInput
                            field={field}
                            value={currentOverride}
                            onChange={(_, value) => onChange(variant.sku, field.fieldName, value)}
                            disabled={disabled}
                          />
                          <button
                            type="button"
                            onClick={() => onChange(variant.sku, field.fieldName, undefined)}
                            disabled={disabled}
                            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ↩ master: {masterCellValue !== undefined ? String(masterCellValue) : "—"}
                          </button>
                        </div>
                      </td>
                    );
                  }

                  // Regular (non-master) channel field — always editable
                  return (
                    <td key={field.fieldName} className="px-4 py-3">
                      <ChannelFieldInput
                        field={field}
                        value={variantOverride[field.fieldName]}
                        onChange={(_, value) => onChange(variant.sku, field.fieldName, value)}
                        disabled={disabled}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
