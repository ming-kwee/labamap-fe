'use client';
/**
 * SkuMatrixPreview
 * Renders a 2-D SKU combination grid.
 *   - 1 selected dimension  → flat chip row
 *   - 2+ selected dimensions → rows × columns table; extra dims shown as "× N more"
 * Used inside VariantConfigurator (live preview) and ProductTypesPage modal (static demo).
 */
import React from 'react';

export interface SkuMatrixDimension {
  name: string;         // field name / attributeCode
  label: string;        // display label
  selectedOptions: string[];
}

interface SkuMatrixPreviewProps {
  /** Ordered dimensions — index 0 = rows, index 1 = columns, rest = depth */
  dimensions: SkuMatrixDimension[];
  /** Total combinations computed by the caller (avoids re-computing inside). */
  totalSkus: number;
  className?: string;
}

export default function SkuMatrixPreview({ dimensions, totalSkus, className = '' }: SkuMatrixPreviewProps) {
  const activeDims = dimensions.filter(d => d.selectedOptions.length > 0);

  if (activeDims.length === 0 || totalSkus <= 1) return null;

  const rowDim = activeDims[0];
  const colDim = activeDims[1] ?? null;
  const extraDepthCount = activeDims.length > 2 ? activeDims.length - 2 : 0;
  const extraDepthLabel = activeDims
    .slice(2)
    .map(d => `${d.label} (${d.selectedOptions.length})`)
    .join(', ');

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          SKU Matrix Preview
        </span>
        <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded-full">
          {totalSkus} SKU{totalSkus !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Depth note */}
      {extraDepthCount > 0 && (
        <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-100 dark:border-amber-500/20">
          <span className="text-xs text-amber-700 dark:text-amber-400">
            × {extraDepthCount} more dimension{extraDepthCount !== 1 ? 's' : ''}: {extraDepthLabel}
          </span>
        </div>
      )}

      {/* 1-D: flat chip row */}
      {!colDim && (
        <div className="p-3 flex flex-wrap gap-2">
          {rowDim.selectedOptions.map(opt => (
            <span
              key={opt}
              className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium"
            >
              {opt}
            </span>
          ))}
        </div>
      )}

      {/* 2-D: grid table */}
      {colDim && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {/* corner cell */}
                <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border-b border-r border-gray-200 dark:border-gray-700">
                  {rowDim.label} ↓ / {colDim.label} →
                </th>
                {colDim.selectedOptions.map(col => (
                  <th
                    key={col}
                    className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 border-b border-r border-gray-200 dark:border-gray-700 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowDim.selectedOptions.map((row, ri) => (
                <tr key={row} className={ri % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/20'}>
                  <td className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300 border-r border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {row}
                  </td>
                  {colDim.selectedOptions.map(col => {
                    const depthMultiplier = activeDims.slice(2).reduce((acc, d) => acc * d.selectedOptions.length, 1);
                    const skuLabel = depthMultiplier > 1
                      ? `${depthMultiplier} SKU${depthMultiplier !== 1 ? 's' : ''}`
                      : `${row} / ${col}`;
                    return (
                      <td
                        key={col}
                        className="px-3 py-2 text-center border-r border-b border-gray-200 dark:border-gray-700"
                      >
                        <span className="inline-block px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 text-[11px] font-medium">
                          {skuLabel}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
