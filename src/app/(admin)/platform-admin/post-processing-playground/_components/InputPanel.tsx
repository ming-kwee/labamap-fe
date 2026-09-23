"use client";

/**
 * InputPanel — the source JSON document.
 * Monospace textarea + live validity indicator, Format / Sample / Clear actions.
 */

import React, { useRef, useState } from "react";

// ─── Built-in sample presets ─────────────────────────────────────────────────
const SAMPLES: { label: string; value: unknown }[] = [
  {
    label: "Simple product",
    value: { name: "Cotton T-Shirt", price: 19.99, status: "draft" },
  },
  {
    label: "Variant product",
    value: {
      name: "Cotton T-Shirt",
      variants: [
        { sku: "TS-RED-S", color: "Red", price: 19.99 },
        { sku: "TS-BLU-M", color: "Blue", price: 21.99 },
      ],
    },
  },
  {
    label: "With _source",
    value: {
      _source: { weight: 1.2 },
      package_weight: { unit: "KILOGRAM" },
    },
  },
];

// ─── Icons ───────────────────────────────────────────────────────────────────
const CheckIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>);
const AlertIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>);
const ChevronIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);

const btnCls =
  "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

export default function InputPanel({
  text,
  onTextChange,
  parseError,
}: {
  text: string;
  onTextChange: (t: string) => void;
  parseError: string | null;
}) {
  const [sampleOpen, setSampleOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const valid = parseError === null && text.trim() !== "";

  const handleFormat = () => {
    try {
      onTextChange(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      /* leave as-is; the validity indicator already flags it */
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Input JSON</h2>
          {text.trim() === "" ? (
            <span className="text-[11px] text-gray-400">empty</span>
          ) : valid ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
              <CheckIcon /> valid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
              <AlertIcon /> invalid
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleFormat} className={btnCls} title="Pretty-print (2-space)">Format</button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setSampleOpen((v) => !v)}
              className={btnCls}
              aria-haspopup="menu"
              aria-expanded={sampleOpen}
            >
              Sample <span className={`transition-transform ${sampleOpen ? "rotate-180" : ""}`}><ChevronIcon /></span>
            </button>
            {sampleOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSampleOpen(false)} aria-hidden />
                <div role="menu" className="absolute right-0 mt-1 z-20 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.label}
                      role="menuitem"
                      onClick={() => {
                        onTextChange(JSON.stringify(s.value, null, 2));
                        setSampleOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => onTextChange("")} className={btnCls} title="Clear input">Clear</button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        spellCheck={false}
        placeholder='{ "name": "…", "price": 0 }'
        aria-label="Input JSON"
        aria-invalid={!valid && text.trim() !== ""}
        className={`flex-1 min-h-0 w-full resize-none font-mono text-xs leading-relaxed p-3 rounded-lg border bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          !valid && text.trim() !== ""
            ? "border-red-400 dark:border-red-500"
            : "border-gray-200 dark:border-gray-700"
        }`}
      />

      {/* Parse error */}
      {parseError && text.trim() !== "" && (
        <div className="mt-2 shrink-0 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-400 font-mono">
          {parseError}
        </div>
      )}
    </div>
  );
}
