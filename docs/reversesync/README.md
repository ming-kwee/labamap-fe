# Reverse Sync (Channel → Platform)

> **Status: TERIMPLEMENTASI (R0–R5), BFF-only, aditif.** Arah balik channel→platform sekarang ADA di kode:
> preview (R1), apply Step-2 per-store (R2), draft-review + `reverseWritePolicy` (R3), pull GET item + webhook
> auto-trigger dengan echo-suppression (R4), dan R5 (nama field, dimensi varian, value translation, reverse-op
> descriptor per-SKU, rekonsiliasi variant, reverse-JOLT proyeksi). **Interpreter terpisah** yang membaca
> metadata forward yang sama secara terbalik — jalur publish forward & Temporal sync worker **tak tersentuh**,
> master global **tak pernah ditimpa diam-diam**. Status + peta SoT terkunci di [`05`](05-config-source-of-truth.md).
> Belum: enricher Kelas B (media/warehouse), cakupan non-Shopify (tinggal seed config), SKU-match produk
> belum ter-link.

## Apa ini

"Reverse sync" = menarik data produk **dari** sales channel (mis. Shopee, Shopify) **kembali ke**
platform, membentuk/menyegarkan **master product** + **Step-2 channel data**. Kebalikan dari publish.

## TL;DR — tiga temuan inti

1. **Selektif, bukan salinan bulat.** Tidak semua field pada item channel masuk ke platform. Field
   terbelah tiga ember: **(a)** punya padanan master → master product, **(b)** channel-only tapi dikenal
   → Step-2 `channelData`, **(c)** operasional/tak dikenal → dibuang (paling banter `channelProductId`
   disimpan sebagai linkage). Detail: [`01`](01-overview-and-principles.md).

2. **Post-processing WAJIB terlibat — tapi dibalik dan dijalankan PALING AWAL.** Payload channel berisi
   struktur turunan khas channel (Shopee `tier_variation`, `image.image_id_list`, `model`; Shopify
   `option1/2` terindeks). Kalau tidak "di-un-build" dulu, reverse JOLT akan menghasilkan master yang
   **salah/garbage**. Post-processing maju = langkah **terakhir**; reverse post-processing = langkah
   **pertama** (mirror). Inti jawaban pertanyaan Anda ada di [`02`](02-reverse-pipeline-and-post-processing.md).

3. **Master itu shared → arah kebenaran adalah keputusan desain terberat.** Master dipakai banyak
   channel; reverse yang aman menulis ke **Step-2/draft**, bukan menimpa master diam-diam. Butuh
   **linkage identity** (`channelProductId`, belum disimpan) dan **versi-aware parsing** (pakai contract
   beku versi yang membuat payload). Detail: [`03`](03-data-model-identity-and-phasing.md).

## Isi

| File | Bahasan |
|---|---|
| [`01-overview-and-principles.md`](01-overview-and-principles.md) | Kenapa selektif; model tiga-ember; arah kebenaran; non-goals |
| [`02-reverse-pipeline-and-post-processing.md`](02-reverse-pipeline-and-post-processing.md) | **Pipeline balik + peran post-processing**; tabel invertibility per operasi; desain engine dua-arah |
| [`03-data-model-identity-and-phasing.md`](03-data-model-identity-and-phasing.md) | Linkage/identity; target penyimpanan; policy ownership; tie-in versioning; fase implementasi |
| [`04-engine-separation-and-industry-comparison.md`](04-engine-separation-and-industry-comparison.md) | Perbandingan industri (ChannelAdvisor/BigCommerce/Jubelio/Ginee); keputusan **interpreter terpisah, bukan mode di engine forward**; scorecard SoC; koreksi fakta atas `03`; **log implementasi R0–R5** (setiap slice + uji) |
| [`05-config-source-of-truth.md`](05-config-source-of-truth.md) | **DOKUMEN KUNCI (as-built).** Dua sumbu Correspondence vs Transform; **peta SoT** (satu fakta, satu tempat, dua arah); redundansi yang sengaja dihapus; pipeline reverse langkah-demi-langkah; guardrail; peta kode; kenapa reverse-JOLT = proyeksi; **status terkunci R0–R5**; ringkasan uji; checklist tambah channel baru |
| [`../FRONTEND-REVERSE-SYNC-IMPLEMENTATION-PLAN.md`](../FRONTEND-REVERSE-SYNC-IMPLEMENTATION-PLAN.md) | **Untuk tim FE.** Kontrak API (6 endpoint + DTO nyata); peta menu/halaman (baru vs ditingkatkan); alur pengguna; komponen reusable; gap BE yang perlu dikonfirmasi; fase FE-1…FE-4 |

## Prinsip yang diwarisi (CLAUDE.md)

- **`apiSchema` = spec-of-record** body channel. Reverse membacanya sebagai daftar path channel yang sah;
  tidak menambah field ke apiSchema untuk kebutuhan reverse.
- **No hardcoded domain knowledge.** Semua vocabulary reverse (path mana → master apa, nilai mana →
  nilai apa, sumbu varian apa) dibaca dari koleksi yang sudah ada, bukan literal di kode runtime.
- **Data-driven & versioned.** Reverse memakai contract **beku** (`channel_api_contracts`) versi efektif
  store agar payload versi lama diinterpretasi dengan resep versi itu.
