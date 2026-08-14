# docs/arsitektur — Analisis Arsitektur & Kesiapan Produksi

Folder ini berisi analisis tingkat-sistem (bukan panduan per-fitur). Untuk panduan
implementasi per-area lihat `docs/product/**`, `docs/setup/**`, `docs/versioning/**`.

| Dok | Isi |
|---|---|
| [01-analisis-kesiapan-produksi-mvp.md](01-analisis-kesiapan-produksi-mvp.md) | Riset sistem saat ini, perbandingan dengan platform luar, kebutuhan seller, dan **daftar fitur MVP minimum untuk siap publish ke market**. |
| [02-p0-1-listing-state-store-implementasi.md](02-p0-1-listing-state-store-implementasi.md) | Detail teknis implementasi **P0-1 (listing-state store)** — data model, repository atomic-update, seam integrasi di `ChannelPublishService`, API baca, contentHash, migrasi, testing. |
| [03-sync-service-persistence-dan-per-hit-history.md](03-sync-service-persistence-dan-per-hit-history.md) | Analisis sync service Temporal (`notifikasi temporal`): **MongoDB vs Postgres**, **per-hit history** (steps per attempt), dan **korelasi dengan `publish_history`** — plus ekstensi `syncWorkflowId`/`syncEntityId`/`steps[]` yang diimplementasi. |
| [04-p0-2-idempotent-publish-update-delist.md](04-p0-2-idempotent-publish-update-delist.md) | Implementasi **P0-2 (publish idempoten)**: keputusan CREATE/NO-OP/UPDATE berbasis listing-state + content-hash (cegah listing duplikat), guard BLOCKED fail-closed, don't-downgrade-live-listing, kesiapan delist. |
| [05-p0-3-durable-jobs-dan-rekonsiliasi.md](05-p0-3-durable-jobs-dan-rekonsiliasi.md) | Implementasi **P0-3 (durable job + rekonsiliasi)**: `publish_jobs` untuk publish PROCESSING + reconciler `@Scheduled` yang me-resolve outcome (fix listing-state basi selamanya) + DLQ (`DEAD`). |
| [06-p0-4-rate-limit-per-channel-dan-cap-batch.md](06-p0-4-rate-limit-per-channel-dan-cap-batch.md) | Implementasi **P0-4 (rate-limit)**: limiter konkurensi reaktif per `(channelType, store)` (bulkhead) + cap fan-out `/publish/batch` — cegah kena ban channel saat bulk-publish. |
| [07-p0-5-golden-payload-tests.md](07-p0-5-golden-payload-tests.md) | Implementasi **P0-5 (golden-payload tests)**: kunci body JOLT 7 channel terhadap spec seeded REAL (deterministik, tanpa Mongo) — jaring regresi transform. Menutup daftar P0 go-live. |
| [07-kontrak-bff-sync-service.md](07-kontrak-bff-sync-service.md) | Kontrak integrasi BFF⇄sync (CREATE/UPDATE/DELETE) dari sisi sync — field, metadata keys, id-input, step_results. *(Dokumen tim; berbagi nomor 07.)* |
| [08-keselarasan-kontrak-bff-sync-p0.md](08-keselarasan-kontrak-bff-sync-p0.md) | Analisis keselarasan kontrak setelah P0-*: korelasi ✅, operasi UPDATE/DELETE ⚠️; **wiring G1–G3 diimplementasi** (syncOperation, id-as-attribute), G4–G7 tersisa + safety note (jangan flip flag sebelum G4). |

Dokumen FE-facing turunan (di `docs/` root, konvensi `FRONTEND-*`):
- [`../FRONTEND-LISTING-LIFECYCLE-UPDATE-DELETE.md`](../FRONTEND-LISTING-LIFECYCLE-UPDATE-DELETE.md) — rekomendasi UI/UX dari P0-1…P0-5 + G1–G7: listing lifecycle, aksi kontekstual (Publish/Update/Delist), penanganan PROCESSING/BLOCKED, dan bagaimana UPDATE & DELETE mengubah UX.

Dokumen terkait di luar folder ini:
- [`../ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS.md`](../ARCHITECTURE-ASSESSMENT-VS-MARKETPLACE-PLATFORMS.md) — penilaian arsitektur jalur transformasi/publish vs Sellbrite/BigSeller/Linnworks/ChannelAdvisor.
- [`../reversesync/`](../reversesync/) — desain reverse-sync (channel→master), **design-only, belum diimplementasi**.
