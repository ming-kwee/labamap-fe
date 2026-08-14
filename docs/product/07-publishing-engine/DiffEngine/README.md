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

## Intisari satu paragraf

CREATE itu "kirim semuanya"; UPDATE itu "kirim hanya yang berubah". Perbedaan berubah/tetap/baru/dibuang
tidak bisa ditebak dari payload saat ini saja — ia butuh **keadaan yang channel tahu terakhir**. Karena itu
fondasi seluruh desain adalah **round-trip id channel** (`model_id` variant + `image_id` gambar) yang
disimpan kembali ke listing-state. Di atas fondasi itu, satu `ResourceDiffEngine` men-diff variant dan gambar
secara seragam, satu bucket-builder menaruh hasilnya ke sync request, dan **seluruh perbedaan channel hidup
di metadata JSON** — sehingga menambah channel/atribut/gambar = mengubah data, bukan kode.
