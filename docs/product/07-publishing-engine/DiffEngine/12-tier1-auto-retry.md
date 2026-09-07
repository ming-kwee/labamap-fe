# Tier-1 Auto-retry untuk UPDATE gagal (forward-only) — penjelasan pelan-pelan

> **Status: IMPLEMENTED (2026-09-05), OPT-IN — OFF secara default.** Aktifkan dengan
> `app.publish.retry.enabled=true`. Melanjutkan Tier-0 (konvergensi, lihat `11-forward-only-update-convergence.md`)
> dan strategi forward-only di repo sync (`documentation/09-forward-only-update-dan-reconcile.md`).

---

## 0. TL;DR

- Saat sebuah **UPDATE** berakhir **gagal** (`syncStatus=FAILED`), BFF **tidak** meng-undo apa pun
  (forward-only). Tier-1 menambahkan **pemulihan otomatis**: enqueue → **re-dispatch ulang** desired-state
  yang sama dengan **backoff terbatas**, lalu berhenti (`EXHAUSTED`) setelah `max-attempts`.
- Re-dispatch memakai **resync-by-id**: cukup kirim `(masterProductId, storeId, operation=UPDATE)`; jalur
  publish **meng-hydrate desired-state** dari master tersimpan dan **meng-inject credential** sendiri, dan
  `publishId` selalu **baru** (timestamp) → tak kena `ALREADY_PROCESSED`.
- **Hanya UPDATE.** CREATE gagal di-*delete-compensate* di sisi sync, jadi tak pernah di-retry.
- **Opt-in** (default mati) karena ini aksi keluar (memanggil channel) tanpa campur tangan manusia.

---

## 1. Kenapa perlu (dan kenapa aman)

Forward-only membuat UPDATE gagal berhenti aman (`UPDATE_FAILED`), tapi **tidak** otomatis diperbaiki —
pemulihan bergantung pada publish berikutnya (Tier-0 manual). Tier-1 mengotomatiskan pemicu itu.

Aman karena **Tier-0 sudah terverifikasi** (`11-...`):
- Field skalar konvergen (baseline `contentHash` dikosongkan saat gagal via G7 → publish ulang mendorong lagi).
- **R2** (`$set` clobber) **terbukti aman**: BFF mengirim set varian penuh + `VariantModelIdInjector` mengisi
  id existing untuk semua sku → sync menangkap peta lengkap → tak ada id yang hilang.
- **R1** (delete-ghost) tersisa tapi **benign** (delete-of-gone idempoten).

Karena sync **idempoten** (update-by-id + DiffEngine), menjalankan ulang desired-state yang sama akan
**konvergen** — bukan menduplikasi.

---

## 2. Alur (wireframe)

```
UPDATE publish → syncStatus=FAILED
   │  (ChannelPublishService jalur sinkron ATAU PublishJobReconciler jalur poll-timeout)
   ▼
PublishRetryService.enqueueUpdateFailure(product, store, ...)      [self-gated: no-op bila retry disabled]
   │   simpan PublishRetryJob{status=PENDING, attempts=0, nextRetryAt=now+base}   (dedup per product+store)
   ▼
PublishRetryScheduler.tick()  @Scheduled (hanya ada bila enabled)
   │   ambil PENDING yang nextRetryAt<=now (oldest first, dibatasi concurrency)
   ▼
retryOne(job): publishProduct( {masterProductId, storeId, operation:UPDATE} )   ← resync-by-id, publishId baru
   │            (desired-state di-hydrate server-side; credential di-inject server-side)
   ├─ hasil non-FAILED (COMPLETED / masih PROCESSING / BLOCKED) → markResolved → HAPUS job
   └─ hasil FAILED → markFailure → attempts++
            ├─ attempts < max → backoff eksponensial (base·2^(n-1), cap 2^6) → nextRetryAt
            └─ attempts ≥ max → status=EXHAUSTED (disimpan untuk inspeksi + hook alert Tier-2)
```

Catatan: bila `publishProduct` balik **PROCESSING** (poll timeout), job dianggap **resolved** (dihapus) —
`PublishJobReconciler` yang akan menuntaskan status akhirnya; kalau ternyata FAILED lagi, jalur gagal akan
**meng-enqueue ulang** job baru. Jadi tak ada double-handling.

---

## 3. Komponen (file)

| File | Peran |
|---|---|
| `publishing/model/entity/PublishRetryJob.java` | Entity antrean (`publish_retry_jobs`): product/store, attempts, maxAttempts, status (PENDING/EXHAUSTED), nextRetryAt. |
| `publishing/repository/PublishRetryJobRepository.java` | Query due-jobs + dedup + listing EXHAUSTED. |
| `publishing/service/PublishRetryService.java` | State machine: `enqueueUpdateFailure` (self-gated), `markResolved`, `markFailure`; backoff + exhaust (static, teruji). |
| `publishing/service/PublishRetryScheduler.java` | `@Scheduled` **opt-in** (`@ConditionalOnProperty app.publish.retry.enabled=true`): re-dispatch via resync-by-id. |
| `ChannelPublishService` (jalur gagal sinkron) | Memanggil `enqueueUpdateFailure` untuk UPDATE gagal. |
| `PublishJobReconciler.failureListingState` (jalur poll-timeout) | Idem untuk UPDATE gagal yang di-resolve async. |

Enqueue **hanya** dipasang di cabang **UPDATE** (bukan CREATE), dan `enqueueUpdateFailure` sendiri **no-op**
saat fitur mati → tak ada baris antrean menumpuk bila disabled.

---

## 4. Konfigurasi (`application.yml` → `app.publish.retry`)

```yaml
app:
  publish:
    retry:
      enabled: ${APP_PUBLISH_RETRY_ENABLED:false}          # OPT-IN — OFF default
      interval-ms: ${APP_PUBLISH_RETRY_INTERVAL_MS:60000}  # periode tick scheduler
      initial-delay-ms: ${APP_PUBLISH_RETRY_INITIAL_DELAY_MS:60000}
      max-attempts: ${APP_PUBLISH_RETRY_MAX_ATTEMPTS:3}
      base-backoff-seconds: ${APP_PUBLISH_RETRY_BASE_BACKOFF_SECONDS:120}  # 120s, 240s, 480s, ...
      max-concurrency: ${APP_PUBLISH_RETRY_MAX_CONCURRENCY:2}
```

Bila `enabled=false` (default): bean `PublishRetryScheduler` **tidak dibuat** dan `enqueueUpdateFailure`
no-op → perilaku sistem persis seperti sebelum fitur ini.

---

## 5. ⚠️ Prasyarat SEBELUM mengaktifkan

1. **Tier-2 visibility dulu.** Retry yang `EXHAUSTED` **diam** kecuali ada yang memantau. Sediakan
   dashboard/query atas `publish_retry_jobs` (status=EXHAUSTED) atau alert **sebelum** menyalakan — kalau
   tidak, kegagalan permanen tak terlihat.
2. **R2 sudah aman** (terverifikasi, doc 11) → tak memblokir. **R1** (delete-ghost) benign; bila UPDATE-mu
   sering menghapus varian dan kamu ingin bersih sempurna, pertimbangkan **reverse-sync-before-retry** sebagai
   hardening (opsional, bukan syarat).
3. **Single instance.** Scheduler mengasumsikan satu instance. Untuk multi-instance, tambahkan *atomic claim*
   (findAndModify) sebelum dispatch agar dua instance tak me-retry job yang sama.

---

## 6. Cara mengaktifkan & memverifikasi

1. Set `APP_PUBLISH_RETRY_ENABLED=true` (mulai dari staging).
2. Picu UPDATE yang gagal (mis. token varian salah) → cek koleksi `publish_retry_jobs`: muncul satu
   `PENDING` untuk (product, store) dengan `nextRetryAt ≈ now + base-backoff`.
3. Tunggu tick berikutnya → log `[publish-retry] re-dispatch attempt N ...`. Bila channel sudah sehat →
   publish sukses → job **dihapus**. Bila masih gagal → `attempts++`, backoff membesar.
4. Setelah `max-attempts` → job jadi `EXHAUSTED` + log warning (titik pasang alert Tier-2).

Unit test logika inti: `PublishRetryServiceBackoffTest` (backoff eksponensial + exhaust). Kompilasi & test
hijau. Alur reaktif/Mongo end-to-end perlu diuji di lingkungan ber-Mongo sebelum produksi.

---

## 7. Di luar scope

- **Retry CREATE** — tidak; CREATE gagal di-delete-compensate di sync.
- **Alert Tier-2 aktif** (Slack/PagerDuty) — belum; hanya log `EXHAUSTED`. Pasang hook di
  `PublishRetryService.markFailure` (cabang EXHAUSTED).
- **Reverse-sync-before-retry** (hardening R1) — belum; opsional.
- **Atomic claim multi-instance** — belum; asumsi single scheduler.
