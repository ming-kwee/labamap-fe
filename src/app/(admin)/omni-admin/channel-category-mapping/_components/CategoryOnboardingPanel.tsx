"use client";

import React, { useState } from "react";
import type { CategorySourceOrigin } from "@/app/(admin)/channels/categories/_types/category-origin";

const ImportIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const TemplateIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/>
    <path d="M3 9h18"/><path d="M9 21V9"/>
  </svg>
);
const AlertTriangleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
);

interface Props {
  onChosen: (origin: CategorySourceOrigin) => Promise<void>;
}

export function CategoryOnboardingPanel({ onChosen }: Props) {
  const [selected,  setSelected]  = useState<CategorySourceOrigin | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await onChosen(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pilihan. Coba lagi.");
      setSaving(false);
    }
  }

  const options: Array<{
    value: CategorySourceOrigin;
    icon: React.ReactNode;
    title: string;
    description: string;
    detail: string;
    color: string;
  }> = [
    {
      value: "import",
      icon: <ImportIcon />,
      title: "Import dari Channel",
      description: "Saya sudah punya kategori di WooCommerce, Etsy, atau Wix.",
      detail: "Kategori dari channel Anda akan dijadikan basis. Setelah import, platform menjadi master — perubahan dilakukan di sini, bukan di channel.",
      color: "border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-500/10",
    },
    {
      value: "template",
      icon: <TemplateIcon />,
      title: "Platform Template",
      description: "Saya mulai dari nol atau ingin menggunakan struktur standar platform.",
      detail: "Admin platform akan menyediakan struktur kategori awal. Anda bisa mengkustomisasi setelah provisioning.",
      color: "border-violet-300 bg-violet-50 dark:border-violet-600 dark:bg-violet-500/10",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-12">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pilih cara setup kategori Anda
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
            Keputusan ini menentukan dari mana platform mengambil struktur kategori awal Anda.
            Pilih dengan cermat — perubahan setelah 14 hari memerlukan proses migrasi.
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {options.map((opt) => {
            const isActive = selected === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                className={`text-left rounded-2xl border-2 p-5 transition-all ${
                  isActive
                    ? opt.color + " ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-gray-900"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                  isActive ? "text-brand-600 dark:text-brand-400 bg-white dark:bg-white/10" : "text-gray-400 bg-gray-100 dark:bg-gray-800"
                }`}>
                  {opt.icon}
                </div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{opt.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{opt.description}</p>
                {isActive && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 pt-2 border-t border-current/10 leading-relaxed">
                    {opt.detail}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 mb-6">
          <span className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0"><AlertTriangleIcon /></span>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            <strong>Keputusan ini hanya bisa diubah dalam 14 hari pertama.</strong>{" "}
            Setelah itu, pergantian memerlukan proses migrasi yang melibatkan semua produk
            dan channel mapping Anda.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Confirm button */}
        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="px-8 py-3 text-sm font-semibold rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-brand-500/20"
          >
            {saving
              ? "Menyimpan…"
              : selected
                ? `Konfirmasi: ${selected === "import" ? "Import dari Channel" : "Platform Template"}`
                : "Pilih salah satu di atas"}
          </button>
        </div>
      </div>
    </div>
  );
}
