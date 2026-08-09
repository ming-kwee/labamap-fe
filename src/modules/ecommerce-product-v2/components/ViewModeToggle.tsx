"use client";
import React from "react";
import type { WizardViewMode } from "../utils/viewMode";

/**
 * Segmented Merchant / Developer switch, shared by Step 2 and Step 3 so the toggle looks and behaves
 * identically across the wizard. Purely presentational — state lives in useWizardViewMode().
 */
export default function ViewModeToggle({
  value,
  onChange,
}: {
  value: WizardViewMode;
  onChange: (m: WizardViewMode) => void;
}) {
  const options = [
    { key: "merchant", label: "Merchant", icon: "🛍" },
    { key: "developer", label: "Developer", icon: "⌘" },
  ] as const;

  return (
    <div
      className="flex-shrink-0 inline-flex items-center rounded-xl bg-gray-100 dark:bg-gray-800 p-0.5"
      role="group"
      aria-label="View mode"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={value === opt.key}
          title={opt.key === "merchant" ? "Guided view for merchants" : "Full technical view for developers"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === opt.key
              ? "bg-white dark:bg-gray-900 text-brand-600 dark:text-brand-400 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          <span aria-hidden>{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
