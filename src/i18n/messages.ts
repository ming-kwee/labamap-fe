/**
 * Fase 1b (FE) — kamus i18n untuk CHROME statis (tombol, judul, label switcher).
 *
 * CATATAN PENTING: label data-driven Step 1 (nama field/section/opsi) TIDAK ada di sini — itu datang
 * sudah-terlokalkan dari BFF (form-schema, Fase 1a). Kamus ini HANYA untuk teks yang di-hardcode FE.
 * Menambah bahasa = tambah entri di `messages`. Kunci hilang → fallback ke English → key mentah.
 * Lihat docs/localization/01 (repo BFF) §1 (lapis A) & §5.
 */

export type Locale = "en" | "id";

export const LOCALES: Locale[] = ["en", "id"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

type Dict = Record<string, string>;

export const messages: Record<Locale, Dict> = {
  en: {
    "language.label": "Language",
    "language.change": "Change language",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.next": "Next",
    "common.back": "Back",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.loading": "Loading…",
    "product.create.title": "Create Product",
    "product.edit.title": "Edit Product",
    "product.step1.title": "Product Details",
  },
  id: {
    "language.label": "Bahasa",
    "language.change": "Ubah bahasa",
    "common.save": "Simpan",
    "common.saving": "Menyimpan…",
    "common.next": "Selanjutnya",
    "common.back": "Kembali",
    "common.cancel": "Batal",
    "common.delete": "Hapus",
    "common.edit": "Ubah",
    "common.loading": "Memuat…",
    "product.create.title": "Buat Produk",
    "product.edit.title": "Ubah Produk",
    "product.step1.title": "Detail Produk",
  },
};

/** Normalisasi kode bahasa apa pun (mis. "id-ID") ke Locale yang didukung, atau null. */
export function normalizeLocale(input?: string | null): Locale | null {
  if (!input) return null;
  const base = input.toLowerCase().split("-")[0];
  return (LOCALES as string[]).includes(base) ? (base as Locale) : null;
}
