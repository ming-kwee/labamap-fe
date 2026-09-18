"use client";

/**
 * Fase 1b (FE) — pemilih bahasa di header. Saat diganti:
 *  1) set locale chrome seketika (LocaleContext + localStorage);
 *  2) PATCH `preferredLanguage` ke BFF (partial-merge) → label server ikut terlokalkan;
 *  3) DELETE cache form-schema BFF → schema di-generate ulang dalam bahasa baru (key cache belum memuat locale);
 *  4) reload → Step 1 mengambil ulang label server yang sudah terlokalkan.
 *
 * Semua panggilan jaringan best-effort (kegagalan tak memblok pergantian chrome). Lihat docs/localization/01 §9b.
 */

import React, { useState } from "react";
import { useLocale } from "@/shared/contexts/LocaleContext";
import { useAuth } from "@/shared/contexts/AuthContext";
import { Locale, LOCALES, LOCALE_LABELS } from "@/i18n/messages";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8888/labamap/api/v1";
const ACCESS_TOKEN_KEY = "labamap_access_token";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const { user, organization } = useAuth();
  const [busy, setBusy] = useState(false);

  async function change(next: Locale) {
    if (next === locale || busy) return;
    setBusy(true);
    setLocale(next); // chrome berubah seketika

    try {
      const token =
        typeof window !== "undefined"
          ? window.localStorage.getItem(ACCESS_TOKEN_KEY)
          : null;
      const orgId = organization?.organizationId;
      const userId = user?.userId;

      if (token && orgId && userId) {
        // 2) Persist preferredLanguage (partial merge — hanya field ini yang berubah)
        await fetch(`${API_BASE}/organizations/${orgId}/users/${userId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Organization-ID": orgId,
            "X-User-ID": userId,
          },
          body: JSON.stringify({ preferredLanguage: next }),
        }).catch(() => {});

        // 3) Bersihkan cache form-schema BFF agar label di-generate ulang dalam bahasa baru
        await fetch(`${API_BASE}/ecommerce/form-schema/cache`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      // 4) Reload agar seluruh label server ter-ambil ulang dalam bahasa baru
      if (typeof window !== "undefined") window.location.reload();
    }
  }

  return (
    <select
      aria-label={t("language.change", "Change language")}
      title={t("language.change", "Change language")}
      value={locale}
      disabled={busy}
      onChange={(e) => change(e.target.value as Locale)}
      className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-theme-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
