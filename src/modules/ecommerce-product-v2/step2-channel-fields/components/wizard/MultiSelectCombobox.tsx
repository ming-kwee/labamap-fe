"use client";
import React, { useMemo, useState } from "react";
import { Dropdown } from "@/shared/ui/dropdown/Dropdown";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  /** Selected option values. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Searchable multi-select for category attributes with long option lists (e.g. Shopify
 * Fabric = 48 values, Neckline = 18). Replaces the wall-of-toggle-chips: selected values
 * show as removable tokens in the trigger; the popover offers type-to-filter + checkboxes.
 * Mirrors the Shopify "Metaobject (List)" picker while staying channel-agnostic — it only
 * ever offers the options the channel provided (no free-text entry), so values can't be
 * rejected downstream.
 */
export default function MultiSelectCombobox({
  options,
  value,
  onChange,
  disabled,
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Map each selected value to its option; fall back to the raw value so a stale/unknown
  // value still renders (and stays removable) instead of silently vanishing.
  const selectedOptions = useMemo(
    () => value.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v }),
    [value, options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div className="relative">
      {/* Trigger: token chips + placeholder */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`dropdown-toggle flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm transition-colors ${
          open
            ? "border-brand-500 ring-2 ring-brand-500/30"
            : "border-gray-200 dark:border-gray-700"
        } bg-white dark:bg-gray-800 ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        {selectedOptions.length === 0 ? (
          <span className="px-1 text-gray-400 dark:text-gray-500">
            {placeholder ?? "Select…"}
          </span>
        ) : (
          selectedOptions.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
            >
              {o.label}
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.value);
                }}
                className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                aria-label={`Remove ${o.label}`}
              >
                ×
              </button>
            </span>
          ))
        )}
        <svg
          className={`ml-auto h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        className="left-0 w-full overflow-hidden p-0"
      >
        <div className="border-b border-gray-100 p-2 dark:border-gray-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-sm text-gray-400">No matches</div>
          ) : (
            filtered.map((o) => {
              const checked = value.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {checked && (
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={checked ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}>
                    {o.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5 text-xs dark:border-gray-800">
            <span className="text-gray-400">{value.length} selected</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-medium text-red-500 hover:text-red-600"
            >
              Clear
            </button>
          </div>
        )}
      </Dropdown>
    </div>
  );
}
