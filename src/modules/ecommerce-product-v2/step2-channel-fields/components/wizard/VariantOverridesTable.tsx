"use client";
import React from "react";
import type { ChannelFormField, VariantOverrideRow, MasterProductSnapshot } from "../../types/channelStore";
import ChannelFieldInput from "./ChannelFieldInput";
import { Thumb, asUrlList } from "./StoreImageOverrideEditor";

interface Props {
  variantFields: ChannelFormField[];
  variants: VariantOverrideRow[];
  overrides: Record<string, Record<string, unknown>>;
  onChange: (sku: string, fieldName: string, value: unknown) => void;
  disabled?: boolean;
  /** Master product variant values — used to show inherited values for isMasterField columns */
  masterVariants?: MasterProductSnapshot["variants"];
  /**
   * When provided, an inline "Images" column is shown per SKU (compact thumbnail summary of the
   * effective images — override if set, else the master variant baseline). Clicking opens the
   * full per-variant image editor for that SKU. Omit to hide the column entirely.
   */
  onEditImages?: (sku: string) => void;
}

export default function VariantOverridesTable({
  variantFields,
  variants,
  overrides,
  onChange,
  disabled,
  masterVariants,
  onEditImages,
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
            {onEditImages && (
              <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-gray-300 min-w-[150px]">
                Images
              </th>
            )}
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

            // Effective images for the inline summary: the per-store override when set,
            // otherwise the master variant baseline (what will actually publish).
            const imgOverrideRaw = variantOverride["variantImages"];
            const imgOverrideActive = Array.isArray(imgOverrideRaw);
            const imgBaseline = asUrlList((masterVariant as Record<string, unknown> | undefined)?.variantImages);
            const imgEffective = imgOverrideActive ? asUrlList(imgOverrideRaw) : imgBaseline;

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
                {onEditImages && (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onEditImages(variant.sku)}
                      disabled={disabled}
                      title="Edit variant images"
                      className="group/img flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1.5 hover:border-sky-300 dark:hover:border-sky-500/50 hover:bg-sky-50/50 dark:hover:bg-sky-500/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {imgEffective.length > 0 ? (
                        <span className="flex items-center -space-x-1.5">
                          {imgEffective.slice(0, 3).map((url, i) => (
                            <Thumb
                              key={`${url}-${i}`}
                              url={url}
                              className="h-8 w-8 rounded-md border border-white dark:border-gray-800 ring-1 ring-gray-200 dark:ring-gray-700"
                            />
                          ))}
                          {imgEffective.length > 3 && (
                            <span className="h-8 w-8 rounded-md border border-white dark:border-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 bg-gray-100 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 dark:text-gray-400 flex items-center justify-center">
                              +{imgEffective.length - 3}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="h-8 w-8 rounded-md border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 text-lg leading-none">
                          +
                        </span>
                      )}
                      <span className="flex flex-col items-start gap-0.5 leading-none">
                        {imgOverrideActive ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300">
                            custom
                          </span>
                        ) : imgBaseline.length > 0 ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            master · {imgBaseline.length}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">No images</span>
                        )}
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 group-hover/img:text-sky-600 dark:group-hover/img:text-sky-400 transition-colors">
                          ✎ Edit
                        </span>
                      </span>
                    </button>
                  </td>
                )}
                {variantFields.map((field) => {
                  const isMasterField = field.isMasterField === true;
                  const currentOverride = variantOverride[field.fieldName];
                  const hasOverride = currentOverride !== undefined && currentOverride !== null;

                  // For master fields: show master value when no override is set.
                  // Cast to Record so any fieldName resolves — not just "price" | "quantity".
                  const masterCellValue = isMasterField
                    ? (masterVariant as Record<string, unknown> | undefined)?.[field.fieldName]
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
