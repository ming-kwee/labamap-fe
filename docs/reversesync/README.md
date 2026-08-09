# Reverse Sync (Channel → Platform) — Design Recommendation

> **Status: DESIGN ONLY. Belum ada implementasi.** Arah balik channel→platform **belum** ada di kode
> hari ini — yang ada hanya jalur maju (master → JOLT → post-processing → publish) + webhook
> uninstall/deauthorize + write-back **status** (`markPublished`). Dokumen ini adalah rekomendasi
> arsitektur bila fitur ini nanti dibangun. Tidak ada perubahan perilaku yang tersirat.

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

## Prinsip yang diwarisi (CLAUDE.md)

- **`apiSchema` = spec-of-record** body channel. Reverse membacanya sebagai daftar path channel yang sah;
  tidak menambah field ke apiSchema untuk kebutuhan reverse.
- **No hardcoded domain knowledge.** Semua vocabulary reverse (path mana → master apa, nilai mana →
  nilai apa, sumbu varian apa) dibaca dari koleksi yang sudah ada, bukan literal di kode runtime.
- **Data-driven & versioned.** Reverse memakai contract **beku** (`channel_api_contracts`) versi efektif
  store agar payload versi lama diinterpretasi dengan resep versi itu.
