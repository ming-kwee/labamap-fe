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
    "common.field": "field",
    "common.fields": "field",
    "product.create.title": "Buat Produk",
    "product.edit.title": "Ubah Produk",
    "product.step1.title": "Detail Produk",
    // Judul & deskripsi SECTION Step-1 (chrome FE — key ternormalisasi getSectionMetadata)
    "section.product-info.label": "Informasi Produk",
    "section.product-info.desc": "Detail produk penting",
    "section.product-details.label": "Detail Tambahan",
    "section.product-details.desc": "Atribut untuk tipe produk ini — dipakai semua channel",
    "section.pricing.label": "Harga & Stok",
    "section.pricing.desc": "Harga, biaya, dan tingkat stok",
    "section.media.label": "Gambar & Media",
    "section.media.desc": "Gambar, video, dan galeri produk",
    "section.content.label": "Konten Produk",
    "section.content.desc": "Deskripsi, fitur, dan spesifikasi",
    "section.shipping.label": "Detail Pengiriman",
    "section.shipping.desc": "Berat, dimensi, dan opsi pengiriman",
    "section.seo.label": "SEO & Pemasaran",
    "section.seo.desc": "Optimasi pencarian dan metadata",
    "section.taxonomy.label": "Kategori & Tag",
    "section.taxonomy.desc": "Klasifikasi dan pengelompokan produk",
    "section.variants.label": "Varian Produk",
    "section.variants.desc": "Ukuran, warna, dan variasi lainnya",
  },
};

/** Normalisasi kode bahasa apa pun (mis. "id-ID") ke Locale yang didukung, atau null. */
export function normalizeLocale(input?: string | null): Locale | null {
  if (!input) return null;
  const base = input.toLowerCase().split("-")[0];
  return (LOCALES as string[]).includes(base) ? (base as Locale) : null;
}
