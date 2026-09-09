# Images & Variant Images in the Omnichannel System — Analysis & Design

> **Status: ANALYSIS / DESIGN.** Grounded in the current code (file:line throughout). The recommended
> architecture is a proposal — nothing here changes behaviour until a PR implements it.

## Scope

How product images and variant images *should* be handled across channels: upload model (presign vs
proxied), per-channel size/format **rules as data**, Step-2 editing (crop/resize/reorder), a dedicated
**`ImageService`**, and a **storage/CDN abstraction**. Answers the six questions in one place.

## TL;DR (the six questions)

1. **How to handle images/variant images?** The canonical model already in place is sound — keep it:
   master merges `mainImage`+`galleryImages` → one `images` array; images are **JOLT-independent**,
   staged at `_sourceImages`, and each channel builds its image field in **post-processing**; the
   channel-side upload (Shopee/TikTok) is done by the **sync-service** via workactions consuming our
   public URL. The gaps are around **validation, derivatives, storage coupling, and Step-2 editing** —
   not the pipeline shape. See [`01`](01-current-state.md).
2. **Pre-sign?** Today it's **server-proxied** (FE → BFF → GCS). Recommend **presigned direct-to-storage
   PUT** for the upload path at scale, with validation + derivative generation moved to an **async
   post-upload step**. Both models + migration in [`02`](02-recommended-architecture.md) §4.
3. **Per-channel size rules via config?** **Yes** — model channel image constraints (min/max dimensions,
   aspect, max count, max bytes, formats, channel-side-upload flag) as **DATA** read at runtime, not
   literals (CLAUDE.md). [`03`](03-per-channel-specs-and-validation.md).
4. **Step-2 crop/resize/modify?** **Yes**, non-destructively: per-store image overrides ride the existing
   `channelData` mechanism; a Step-2 editor produces **derivatives** sized to the channel spec, master
   stays canonical. [`04`](04-step2-editing-and-derivatives.md).
5. **One dedicated image class?** **Yes** — a cohesive **`ImageService`** consolidates logic scattered
   across `MasterProductDataService.normalizeImages`, `PublishPayloadStagingService.collectSourceImageUrls`/
   `ensureProductImages`, `FieldTransformationService.URL_ARRAY_TO_SRC_OBJECTS`, and `MediaUploadService`.
   [`02`](02-recommended-architecture.md) §2.
6. **Abstract for CDN vs non-CDN?** **Yes** — a **`MediaStorageProvider`** interface (gcs|s3|local) + a
   **`CdnUrlResolver`**, mirroring the existing pluggable-provider pattern (`LlmClient`, `EmbeddingClient`,
   `VectorStore`). [`02`](02-recommended-architecture.md) §3.

## Files

| File | Bahasan |
|---|---|
| [`01-current-state.md`](01-current-state.md) | Peta penanganan image hari ini (media module, master, pipeline, varian, upload sisi-channel) — file:line |
| [`02-recommended-architecture.md`](02-recommended-architecture.md) | `ImageService`, `MediaStorageProvider` (CDN/non-CDN), presign vs proxied, derivatives |
| [`03-per-channel-specs-and-validation.md`](03-per-channel-specs-and-validation.md) | `ChannelImageSpec` sebagai DATA + di mana divalidasi/dikonsumsi |
| [`04-step2-editing-and-derivatives.md`](04-step2-editing-and-derivatives.md) | Edit image di Step-2 (crop/resize/reorder), override per-store non-destruktif |
| [`05-production-hardening.md`](05-production-hardening.md) | **Self-review kritis** 01–04: model metadata aset, disiplin reactive, content-hash, keamanan, staleness, GC, backward-compat, keputusan tegas |

> **Baca `05` sebelum implementasi.** 01–04 adalah arah yang benar & non-destruktif; `05` menutup celah
> production-critical yang membuatnya benar-benar siap produksi — terutama **H1 (model metadata
> `ImageAsset`)** sebagai prasyarat validasi, **H2 (offload IO blocking dari event loop)** yang
> memperbaiki bug laten WebFlux, dan **H7 (backward-compat)**. Mulai dari **I0** (non-breaking).

## Prinsip yang dipegang (CLAUDE.md)

- **Spesifikasi image per-channel = DATA**, dibaca runtime — bukan literal di service (no hardcoded
  domain knowledge). Seeder/migration adalah rumah sah untuk nilai referensinya.
- **`apiSchema` tetap spec body channel.** Payload pre-upload / derivative / image_id adalah **support
  data** (post-processing rule + attribute mapping + channel metadata workaction), **bukan** ditambah ke
  `apiSchema`. Lihat pola [[shopee-image-two-step-flow]] yang sudah ada.
- **Image tetap JOLT-independent** — di-stage di `_sourceImages`; desain baru tak boleh mengembalikan
  image ke mapping JOLT.
- **Abstraksi storage mengikuti pola provider yang sudah ada** (LlmClient/EmbeddingClient/VectorStore
  pluggable via `app.*.provider`).
