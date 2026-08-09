"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Shared merchant/developer view mode for the product wizard (Step 2 + Step 3).
 *
 * "merchant"   — guided, plain-language flow (default; the real product for end users).
 * "developer"  — the full schema-role / diagnostics layout.
 *
 * Persisted in one localStorage key so the choice follows the user across steps.
 */
export type WizardViewMode = "merchant" | "developer";

const KEY = "omni_wizard_view_mode";

export function useWizardViewMode(): [WizardViewMode, (m: WizardViewMode) => void] {
  const [mode, setMode] = useState<WizardViewMode>("merchant");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (saved === "developer" || saved === "merchant") setMode(saved);
  }, []);

  const change = useCallback((m: WizardViewMode) => {
    setMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, m);
  }, []);

  return [mode, change];
}
