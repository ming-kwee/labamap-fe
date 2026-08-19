# DiffEngine — Pipeline UPDATE yang Data-Driven

Kumpulan desain untuk membuat operasi **UPDATE** (produk, variant, dan gambar) berjalan lewat
**satu pipeline generik** — diff → bucket → workaction metadata — bukan kode yang dijahit per-kasus
atau per-channel.

## Isi

- [`01-update-diff-engine.md`](01-update-diff-engine.md) — dokumen desain utama. Menjelaskan pelan-pelan:
  masalahnya, prinsip anti-jahit, konsep inti (desired vs known, round-trip id), model data, mesin diff
  generik, bucket builder, penyelesaian sisi sync, seeding metadata, decider per-resource, keamanan/rollback,
  walkthrough skenario nyata, dan urutan rollout.
- [`02-frontend-dirty-state.md`](02-frontend-dirty-state.md) — kontrak untuk tim FE: endpoint baca
  `publish-diff` yang memberi deteksi "ada perubahan atau tidak" **lintas-step, per-store, otoritatif**
  (reuse `DesiredStateExtractor` + `PublishDiffPlanner` + decider, tanpa mem-publish).
- [`03-mode-b-per-model-buckets.md`](03-mode-b-per-model-buckets.md) — deep-dive **Mode B**
  (`PER_MODEL_BUCKETS`, Shopee/TikTok/WIX): penjelasan pelan + flowchart (mermaid) + peta kelas lintas repo
  (BFF ⇄ sync), walkthrough skenario, dan status jujur sudah/belum.
- [`04-mode-b-e2e-runbook-shopee.md`](04-mode-b-e2e-runbook-shopee.md) — runbook E2E ke **Shopee sandbox**:
  verifikasi seed → CREATE baseline → flip flag → skenario ubah/tambah/hapus variant → verifikasi → rollback.
  Plus pre-flight otomatis (`ShopeeModeBBucketRoutingTest`, `ShopeeModeBSeedTest`).
- [`05-shopify-update-media.md`](05-shopify-update-media.md) — rencana **update-media Shopify** yang idempoten
  (tanpa duplikat gambar): round-trip `image_id` (`idtracking#images`) + seed `update_CP_Media`/`delete_CP_Media`
  + `imageKey`=stem. Fase M1–M5 (M1–M3 **implemented**), dengan analisis akar bug append + identitas gambar.
- [`06-media-e2e-runbook-shopify.md`](06-media-e2e-runbook-shopify.md) — runbook E2E ke **Shopify nyata**:
  verifikasi seed → CREATE baseline (isi `imageChannelIds`) → flip flag → skenario tambah/hapus/campur gambar →
  verifikasi merge → NOOP → rollback. Plus pre-flight otomatis (`ShopifyMediaSeedTest`, imageKey parity BFF+sync).
- [`07-shopify-media-reorder.md`](07-shopify-media-reorder.md) — desain **M5 (reorder)**: mengukuhkan urutan
  `position` gambar Shopify pada UPDATE via **reorder-by-id** (`PUT product.images=[{id,position}]`), id =
  baseline (kept) ∪ captured (baru), dengan guard "reorder-only-if-changed" (CREATE = NOOP karena POST sekuensial).
- [`08-shopify-variant-media.md`](08-shopify-variant-media.md) — rencana **M4 (variant images)** bertahap
  (V1–V5): karena di Shopify variant image = product image ber-`variant_ids`, dokumen ini merancang round-trip
  id `sku::stem`, add-only, delete **shared-image aware**, re-asosiasi `variant_ids`, dan urutan bersama M5 —
  menuntaskan gambar per-varian setelah product-level (M1–M5) selesai.
- [`09-media-cross-channel-compat.md`](09-media-cross-channel-compat.md) — **kompatibilitas lintas-channel**:
  kenapa M1–M5 + V1–V5 aman-inert (no-op) untuk Shopee/TikTok/WIX (di-gate `idtracking#images`, hanya di-seed
  Shopify; langkah sync SKIP + non-fatal), kenapa modelnya memang Shopify-specific (Shopify append-no-dedup vs
  list-utuh Shopee/TikTok), bagian mana yang sudah channel-agnostic, dan sketsa desain terpisah bila ingin
  "hemat upload" untuk Shopee/TikTok.

## Intisari satu paragraf

CREATE itu "kirim semuanya"; UPDATE itu "kirim hanya yang berubah". Perbedaan berubah/tetap/baru/dibuang
tidak bisa ditebak dari payload saat ini saja — ia butuh **keadaan yang channel tahu terakhir**. Karena itu
fondasi seluruh desain adalah **round-trip id channel** (`model_id` variant + `image_id` gambar) yang
disimpan kembali ke listing-state. Di atas fondasi itu, satu `ResourceDiffEngine` men-diff variant dan gambar
secara seragam, satu bucket-builder menaruh hasilnya ke sync request, dan **seluruh perbedaan channel hidup
di metadata JSON** — sehingga menambah channel/atribut/gambar = mengubah data, bukan kode.
