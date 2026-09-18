"use client";

/**
 * Fase 1b (FE) — LocaleProvider ringan berbasis PREFERENSI USER (bukan URL), cocok untuk admin dashboard.
 * Tak memakai next-intl/middleware/routing berbasis locale (over-engineering untuk kasus ini).
 *
 * Locale awal: localStorage("labamap_locale") ▶ user.preferredLanguage ▶ navigator.language ▶ "en".
 * `t(key)` melayani teks CHROME dari kamus; label data-driven Step 1 datang sudah-terlokalkan dari BFF.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Locale, messages, normalizeLocale } from "@/i18n/messages";
import { useAuth } from "@/shared/contexts/AuthContext";

export const LOCALE_STORAGE_KEY = "labamap_locale";

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Teks chrome untuk `key`; fallback: locale aktif ▶ en ▶ `fallback` ▶ key mentah. */
  t: (key: string, fallback?: string) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Awal deterministik ("en") agar SSR/CSR konsisten; effect menyetel locale sebenarnya di klien.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY))
        : null;
    const fromUser = normalizeLocale(
      (user as { preferredLanguage?: string } | null)?.preferredLanguage
    );
    const fromNav =
      typeof navigator !== "undefined" ? normalizeLocale(navigator.language) : null;
    setLocaleState(stored ?? fromUser ?? fromNav ?? "en");
  }, [user]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) =>
      messages[locale]?.[key] ?? messages.en?.[key] ?? fallback ?? key,
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextType {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

/** Pintasan hanya-fungsi-terjemah. */
export function useT(): LocaleContextType["t"] {
  return useLocale().t;
}
