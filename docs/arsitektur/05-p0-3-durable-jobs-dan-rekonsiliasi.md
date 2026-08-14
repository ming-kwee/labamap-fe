# P0-3 — Publish Durable Job + Rekonsiliasi PROCESSING (+ DLQ)

> Turunan dari [`01-analisis-kesiapan-produksi-mvp.md`](01-analisis-kesiapan-produksi-mvp.md) §5 (P0-3),
> di atas [P0-1 listing-state](02-p0-1-listing-state-store-implementasi.md),
> [korelasi sync](03-sync-service-persistence-dan-per-hit-history.md), dan
> [P0-2 idempoten](04-p0-2-idempotent-publish-update-delist.md).

---

## 1. Framing: apa yang benar-benar kurang (mengingat sync = Temporal)

Doc 01 §Gap-3 menulis "publish sinkron, tanpa job/retry/idempotency/DLQ". Setelah analisis sync
([doc 03](03-sync-service-persistence-dan-per-hit-history.md)), gambarannya lebih tajam: **Temporal
sudah** memberi durable-execution + retry untuk *panggilan channel*. Jadi P0-3 di BFF **bukan** "bangun
job-engine baru" (itu duplikasi Temporal), melainkan **durabilitas di batas BFF↔sync**:

- BFF men-*dispatch* ke sync lalu **poll** sampai terminal atau timeout (`app.sync.poll-timeout-seconds`,
  default 180s).
- Jika **timeout**, BFF mengembalikan `PROCESSING` dan **berhenti** — **tidak ada** yang mem-poll ulang
  belakangan. Akibatnya `channel_product_data` **tak pernah** jadi PUBLISHED walau workflow sync akhirnya
  selesai. **Ini bug nyata:** seller melihat "processing" selamanya, dan P0-1/P0-2 beroperasi di atas
  listing-state basi.

**P0-3 slice ini menutup bug itu**: durable job + reconciler yang me-resolve PROCESSING; plus DLQ.

---

## 2. Desain — job **hanya** saat PROCESSING

Kunci menghindari double-apply: publish yang **resolve sinkron** (dalam window poll) **sudah** mempersist
outcome-nya (`updateChannelProductStatus` → recordPublishSuccess/Failure + history). Jadi **tak perlu**
job untuk kasus itu. Job dibuat **hanya** ketika outcome = PROCESSING (timeout) — satu-satunya kasus yang
persistensinya di-skip dan butuh diselesaikan belakangan.

```
publish (store-aware)
  → doChannelSyncPublish: POST /sync → poll GET /channel_product_workflow/{id}
      terminal (COMPLETED/FAILED)  → updateChannelProductStatus mempersist outcome  → SELESAI (tanpa job)
      timeout (PROCESSING)         → updateChannelProductStatus:
                                        • createProcessing(publish_job)   ← BARU (durable)
                                        • recordHistory(PROCESSING)
─────────────────────────────────────────────────────────────────────────────────────
@Scheduled PublishJobReconciler (fixedDelay, default 30s; initialDelay 60s)
  findDue(PROCESSING, nextPollAt<=now)  → tiap job: poll sync sekali → decide(...)
```

Karena job **ada hanya bila outcome belum dipersist**, reconciler adalah satu-satunya yang mempersist
outcome untuk job itu → **tak ada aplikasi ganda**.

### Keputusan reconciler (`decide`, murni & teruji)

| Kondisi poll | Usia job | Aksi |
|---|---|---|
| sync `COMPLETED` | — | **APPLY_SUCCESS** → recordPublishSuccess + history, job COMPLETED |
| sync `FAILED` | — | **APPLY_FAILURE** → recordPublishFailure + history, job FAILED |
| non-terminal / poll gagal | ≤ `max-age` | **RETRY** → `deferNextPoll` (attempts++, jadwalkan ulang) |
| non-terminal / poll gagal | > `max-age` (default 30m) | **MARK_DEAD** → DLQ |

Terminal **selalu menang** (job tua yang ternyata COMPLETED tetap di-apply, bukan di-DEAD).
`APPLY_SUCCESS` menulis `lastPublishedContentHash` dari `job.contentHash` → P0-2 NO-OP tetap berfungsi
untuk publish yang di-resolve reconciler.

---

## 3. File & konfigurasi

| File | Peran |
|---|---|
| `publishing/model/entity/PublishJob.java` (**baru**) | Koleksi `publish_jobs`; status PROCESSING/COMPLETED/FAILED/DEAD; index `(status,nextPollAt)` + `(master,store)`. |
| `publishing/repository/PublishJobRepository.java` (**baru**) | `findTop50ByStatusAndNextPollAtLessThanEqual…` (due) + listing per status (DLQ). Paket sudah terdaftar di MongoConfig. |
| `publishing/service/PublishJobService.java` (**baru**) | createProcessing / findDue / markCompleted·Failed·Dead / deferNextPoll / listByStatus. |
| `publishing/service/PublishJobReconciler.java` (**baru**) | `@Scheduled` + `decide(...)` murni + applyOutcome (reuse recordPublishSuccess/Failure + publish_history). `@ConditionalOnProperty(app.publish.reconciler-enabled, matchIfMissing=true)`. |
| `ChannelPublishService` | PROCESSING guard kini `createProcessing(job)`; `buildProcessingResponse` + response `contentHash`. |
| `PublishProductResponse` | +`contentHash` (dibawa di response PROCESSING agar job menyimpannya). |
| `ChannelPublishController` | `GET /channels/publish/jobs?status=DEAD&organizationId=…` (inspeksi DLQ). |

**Config (semua ber-default aman):**
- `app.publish.reconciler-enabled` (default `true`) — matikan reconciler bila perlu.
- `app.publish.reconcile.interval-ms` (30000), `initial-delay-ms` (60000).
- `app.publish.reconcile.max-age-minutes` (30) — ambang DLQ.
- `app.publish.reconcile.defer-seconds` (30), `max-concurrency` (4).

---

## 4. Yang DITUNDA (slice berikutnya)

1. **Idempotency-key / dedup dispatch** — cegah dua request konkuren men-dispatch publish yang sama untuk
   `(master, store)`. Perlu guard atomik (unique partial index / findAndModify). P0-2 NO-OP sudah menutup
   "konten sama sudah PUBLISHED"; ini menutup "sedang in-flight".
2. **Retry POST dispatch** — retry-backoff pada `POST /sync_channel_product_impl` untuk 5xx/timeout
   transient. **Ditunda sengaja**: aman hanya bila sync meng-dedup POST (mengembalikan `ALREADY_PROCESSED`
   berbasis id deterministik); belum diverifikasi. Retry-channel-call sendiri **sudah** ditangani Temporal.
3. **Progress batch + resume** — `publish/batch` (Flux.merge) melacak progres per-store & lanjut dari
   kegagalan sebagian.
4. **Atomic claim multi-instance** — reconciler saat ini mengasumsikan **satu** instance scheduler.
   Multi-instance perlu klaim atomik (findAndModify PROCESSING→RECONCILING) sebelum apply.

---

## 5. Status & pengujian

- **Build:** `BUILD SUCCESS`. **Test:** 19 hijau (P0-3 `decide` 6 + P0-2 6 + kontrak sync 1 + steps 2 +
  hash 3 + listing-state 1).
- **Bug diperbaiki:** publish PROCESSING kini **akhirnya resolve** ke PUBLISHED/FAILED via reconciler,
  dan yang macet → DLQ (`DEAD`) yang bisa diinspeksi.
- Semua aditif; job dibuat hanya untuk kasus PROCESSING sehingga tak ada double-apply pada jalur sinkron.
