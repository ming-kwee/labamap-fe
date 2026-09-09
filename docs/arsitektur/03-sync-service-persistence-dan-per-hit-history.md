# Sync Service (Temporal): Persistensi, Per-Hit History, & Korelasi dengan `publish_history`

> Analisis lintas-repo + ekstensi yang diimplementasi. Menjawab tiga pertanyaan:
> **(1)** apakah data product-channel di sync service sebaiknya MongoDB saja vs Postgres,
> **(2)** apakah tiap hit ke channel API (multi-hit) perlu disimpan ke 1 dokumen Mongo sebagai history,
> **(3)** bagaimana korelasinya dengan `publish_history` (P0-1) yang baru dibangun.
>
> Sync service = repo terpisah **`/Users/admin/MyKalix/notifikasi temporal`** (Java + Temporal 1.24).
> Fakta di bawah dibaca dari kodenya (bukan asumsi). Lihat juga
> [`01-analisis-kesiapan-produksi-mvp.md`](01-analisis-kesiapan-produksi-mvp.md) §Gap-3 (retry/queue) dan
> [`02-p0-1-listing-state-store-implementasi.md`](02-p0-1-listing-state-store-implementasi.md).

---

## 1. Temuan sistem sync (hasil pembedahan)

**Arsitektur:** Temporal worker (`channel-product-temporal`, tanpa Spring) + JDK `HttpServer` tipis
(`WorkflowTriggerServer`):
- `POST /sync_channel_product_impl` → start workflow → `{workflowId, entityId, status}`
- `GET /channel_product_state?workflowId=…` → poll `SyncState` (PENDING/PROCESSING/COMPLETED/FAILED +
  `externalChannelProductId` + `failureReason`)

**Persistensi = PostgreSQL, tapi dipakai sebagai document store.** Satu tabel `channel_products`
(`ChannelProductRepositoryImpl`):

| Kolom | Peran |
|---|---|
| `id` (PK), `sku`, `store_id`, `channel_id`, `product_id`, `deleted`, `created_at`, `updated_at` | skalar ter-index untuk query ad-hoc |
| **`payload JSONB`** | **seluruh** `ChannelProductCommand` (schemaless — komentar kode: "biar tak perlu migrasi schema") |

- **Upsert by `id`** (`ON CONFLICT DO UPDATE`) → hanya state **terakhir**, **tak ada history**.
- Tak ada join/FK/normalisasi/transaksi lintas-tabel → **bukan** pemakaian relasional; ini K/V-by-id.
- `updateChannelProductState(cmd)` dipanggil ~3× per workflow (setelah create, setelah variants, final),
  masing-masing **menimpa**.

**Pola multi-hit (dikonfirmasi di `ChannelProductWorkflowImpl`):** satu publish = **puluhan** panggilan
channel — loop `prerequisite`, `media_pre`, `variants_media_pre` (tiap loop s/d `MAX_ITERATIONS=10`, tiap
iterasi fan-out ke N gambar/varian via `executeListViaService`/`executeArrayLoopViaService`), lalu
`create` (1), `variants` (1), `media` loop, `variants_media` loop, plus kompensasi (delete on error).
Tiap hit → `HttpCallResult` (OK/ERROR/SKIP + data + mutated command) → **dikumpulkan in-memory,
divalidasi, lalu dibuang**; hanya `cmd` yang di-upsert.

**Yang krusial:** **Temporal SUDAH merekam setiap hit** (input/output tiap activity) di event
history-nya — durable, replayable, terlihat di Temporal UI. Jadi per-hit **sudah** terekam, tapi:
retention terbatas, queryable hanya per-workflow (bukan per-SKU/channel/error/tanggal), dan payload-nya
**memuat kredensial**.

---

## 2. Q1 — MongoDB saja vs Postgres?

**Verdict: JANGAN migrasi Postgres→Mongo hanya untuk tabel ini. Yang benar: pertanyakan apakah tabel ini
perlu ada.**

Alasan:
1. **Sudah document-store, bukan relasional.** Postgres di sini = JSONB blob + skalar index. Mongo cocok,
   tapi Postgres-JSONB **sudah** memadai — tak ada fitur relasional yang hilang bila pindah, jadi juga tak
   ada yang didapat.
2. **Temporal butuh store relasional** (Postgres/MySQL/Cassandra) untuk dirinya sendiri. Menambah Mongo =
   datastore baru **hanya** untuk 1 tabel di service yang sudah menjalankan Postgres → **tak sepadan** (biaya
   ops + risiko migrasi > manfaat).
3. **`channel_products` adalah cache/projection**, bukan source-of-truth. SoT eksekusi = Temporal history;
   SoT bisnis = BFF `channel_product_data` (Mongo). Pilihan datastore untuk cache = **low-stakes**.

**Kapan MongoDB-only justru benar:** bila kamu **konsolidasi kepemilikan state ke BFF** — jadikan sync
service **stateless** (Temporal pegang execution-state, BFF pegang business-state di Mongo) dan
hapus/kurangi `channel_products` yang sebagian besar **menduplikasi** identitas + command yang sudah ada di
BFF. Itu penyederhanaan arsitektur nyata; sekadar menukar driver DB bukan.

> Ringkas: **tetap Postgres-JSONB** untuk sekarang. Roadmap yang lebih baik ≠ "Mongo-kan tabelnya",
> melainkan "buat sync stateless, BFF jadi satu-satunya SoT bisnis".

---

## 3. Q2 — Simpan tiap hit ke 1 dokumen Mongo sebagai history?

**Verdict: ya untuk *history bisnis*, tapi grain-nya "1 dokumen per publish attempt dengan array
`steps[]`" — bukan 1 dokumen per hit, dan disimpan di *BFF*, bukan sync service.**

- **Jangan** duplikasi mentah untuk durability/debug — Temporal sudah melakukannya. Persist ke Mongo
  **hanya** untuk yang tak diberi Temporal: **audit jangka-panjang** (melewati retention Temporal),
  **analitik lintas-dimensi** ("endpoint channel mana paling sering gagal", "success-rate upload gambar"),
  dan **progres per-step untuk seller/ops**.
- **Grain benar:** 1 dokumen per **attempt** dengan `steps[]` embedded (satu entri per hit). Bounded
  (puluhan step), natural, cocok model dokumen. Bukan 1-dokumen-per-hit (fragmentasi), bukan 1 dokumen
  global raksasa.
- **Wajib:** **mask kredensial** (command memuat token/secret — workflow bahkan mlog-nya dengan peringatan)
  dan **jangan simpan response body penuh** per gambar (ringkas: status + error summary), agar tak bloat
  (batas dok Mongo 16 MB).
- **Di mana:** di **MongoDB BFF**, karena audit bisnis + dashboard sudah di sana (`publish_history`). Sync
  service cukup **mengembalikan** ringkasan step (ter-mask) di response poll; BFF yang mempersist.

Inilah "1 dokumen sebagai history" yang dimaksud — dan tepatnya = **sibling yang lebih kaya dari entri
`publish_history`** (§4).

---

## 4. Q3 — Korelasi dengan `publish_history` (P0-1) + ekstensi yang diimplementasi

Hubungan **parent→child (1:N)**: `publish_history` = 1 baris per **attempt**; per-hit = banyak **step**
dalam attempt. `publish_history` adalah induk yang tepat untuk menampung step.

```
publish_history (BFF, Mongo)                 ← 1 baris per ATTEMPT (P0-1)
   • publishId, syncStatus, success            attempt-level, otoritatif
   • channelProductId, contentHash, error, durationMs
   • syncWorkflowId, syncEntityId   ← BARU: deep-link ke eksekusi Temporal
   └── steps[] : PublishStepResult  ← BARU: per HIT (stepName, endpoint, httpStatus,
                                       channelSuccess, iterationIndex, durationMs,
                                       errorCode, errorMessage, at)   ← dari sync (ter-mask)
```

**Join key & gap yang ditemukan:** BFF **punya** `workflowId` saat runtime
(`syncResponse.getWorkflowId()`, dipakai untuk poll di `ChannelPublishService`) tapi **tidak
mempersist-nya**. Ekstensi ini menutup gap itu.

### 4a. Yang diimplementasi (BFF — aditif, forward-compatible)

| File | Perubahan |
|---|---|
| `publishing/model/entity/PublishStepResult.java` (**baru**) | Model 1 hit; POJO tunggal dipakai sebagai wire (sync)+carrier+persist; `@JsonAlias` toleran snake_case; catatan "no creds / no raw body". |
| `PublishHistoryEntry` | +`syncWorkflowId`, `syncEntityId`, `List<PublishStepResult> steps`. |
| `ChannelProductData` (listing-state) | +`syncWorkflowId`, `syncEntityId` (workflow publish **terakhir**). |
| `PublishProductResponse` | +`syncWorkflowId`, `syncEntityId`, `syncSteps` (carrier internal). |
| `WorkflowStatusResponse` | +`steps` (opsional; `@JsonAlias {step_results, step_history}`) — **absen hari ini → null**, tertangkap saat sync mengirimnya. |
| `ChannelProductDataRepository` / `…Service` | `recordPublishSuccess` kini set `syncWorkflowId`/`syncEntityId` (atomic `$set`). |
| `ChannelPublishService` | success-builder set `syncWorkflowId(workflowId)`/`syncEntityId(ws.getId())`/`syncSteps(ws.getSteps())`; `buildProcessingResponse` set `syncWorkflowId` (metode kini di `PublishResponseFactory`, Fase 1 dekomposisi guide 41); `recordHistory` mempersist ketiganya (metode kini di `PublishOutcomeWriter`, Fase 5 dekomposisi guide 41 — orchestrator mendelegasikan). |
| `ListingStateResponse` | ekspos `syncWorkflowId`/`syncEntityId`. |

**Keputusan desain:**
- **Hanya jalur SUKSES** yang menulis `syncWorkflowId`/`syncEntityId` ke *listing-state*. Jalur gagal
  **tidak** — banyak kegagalan terjadi **sebelum** workflow ada (pre-flight/transform), sehingga menulis
  `null` akan **meng-clobber** nilai baik sebelumnya. Per-attempt tetap terekam di `publish_history`
  (yang selalu menyimpan `syncWorkflowId` bila tersedia).
- `steps` **forward-compatible**: BFF siap menerima, tapi kosong sampai sync mengembalikannya (§4b). Field
  attempt-level tetap otoritatif tanpa `steps`.
- **Tak ada store history baru di sync service** — konsisten Q1/Q2: BFF jadi satu permukaan audit
  queryable; Temporal tetap SoT eksekusi.

### 4b. Kontrak sisi-sync yang dibutuhkan agar `steps[]` terisi (follow-up, repo `notifikasi temporal`)

BFF sudah siap; agar `steps[]` bukan kosong, sync service perlu **mengembalikan ringkasan step** di
response `GET /channel_product_state` (mis. field `step_results[]`), diisi dari `HttpCallResult` tiap
activity. **Jangan** kirim kredensial atau response body mentah. Bentuk minimal per step:

```json
{
  "step_name": "media_pre_iteration_0",
  "status": "ERROR",           // OK | ERROR | SKIP
  "http_status": 429,
  "channel_success": false,
  "iteration_index": 0,
  "duration_ms": 850,
  "error_code": "RATE_LIMIT",
  "error_message": "too many requests"   // ringkasan, bukan body penuh
}
```

Sumbernya sudah ada di sync (`HttpCallResult.status/description/data`, nama step dari `setStatus(...)`),
tinggal dikumpulkan ke sebuah list dan disertakan di `SyncState`/response poll. Karena Temporal sudah
menyimpan detail penuh, list ini cukup **ringkasan bisnis** yang aman ditampilkan.

### 4c. Yang diimplementasi (sync side — repo `notifikasi temporal`) ✅

Kontrak §4b **sudah dibangun** di sync service (aditif, ter-mask, forward-compatible):

| File | Perubahan |
|---|---|
| `channelProduct/model/SyncStepResult.java` (**baru**) | Model 1 hit ter-mask; field snake_case (`step_name`, `http_status`, `channel_success`, `iteration_index`, `duration_ms`, `error_code`, `error_message`, `at`) selaras `PublishStepResult` BFF; `@JsonInclude(NON_NULL)`; **tanpa** kredensial & **tanpa** raw body. |
| `channelProduct/model/HttpCallResult` | +`httpStatus` (Integer, nullable) — status HTTP terakhir/pertama-gagal, diisi di semua cabang dispatch activity (single / list / array-loop + `collectAndValidate`). |
| `channelProduct/model/SyncState` | +`List<SyncStepResult> stepResults` → diserialisasi `step_results` (cocok `@JsonAlias {step_results, step_history}` BFF). |
| `channelProduct/workflow/ChannelProductWorkflowImpl` | `stepResults` (workflow state, hanya di-mutate dari workflow thread, deterministik saat replay); `recordStep(stepName, iterationIndex, startMillis, result)` dipanggil tiap hit (prerequisite/media_pre/variants_media_pre loop, create, variants, media, variants_media loop, delete + compensate-delete). Timing pakai `Workflow.currentTimeMillis()` (replay-safe). `getSyncState()` mengembalikan salinan list. |

**Keputusan desain (sync side):**
- **SKIP tidak direkam** — SKIP = tak ada round-trip HTTP; hanya OK/ERROR (hit nyata) yang jadi entri.
- **`error_code`** diturunkan dari `http_status`: `429→RATE_LIMIT`, `≥500→CHANNEL_5XX`, `≥400→CHANNEL_4XX`,
  `null→EXCEPTION` (gagal sebelum HTTP), 2xx-tapi-success-check-gagal `→SUCCESS_CHECK_FAILED`.
- **`error_message` di-*summarize*** (whitespace di-collapse + potong di `MAX_ERROR_SUMMARY_LEN=300`), agar
  body channel besar tak membengkakkan history (batas dok Mongo 16 MB di hilir).
- **Tanpa store baru di sync** — konsisten Q1/Q2; hanya diekspos via query `getSyncState()`/poll,
  BFF yang mempersist.

**Uji:** `SyncStepResultContractTest` (4 test) mengunci wire-contract: kunci `step_results` snake_case,
omit field null pada step OK (`NON_NULL`), tak ada kredensial/`data`/`body` bocor, dan round-trip Jackson.

---

## 5. Prinsip yang mengikat ketiganya

Pisahkan **source-of-truth** dari **projeksi turunan**:

| Lapis | SoT? | Isi |
|---|---|---|
| Temporal event history | **SoT eksekusi** | tiap activity in/out (detail penuh, ada kredensial, retention terbatas) |
| BFF `channel_product_data` (Mongo) | **SoT bisnis** | listing-state saat ini (P0-1) |
| BFF `publish_history` (Mongo) | audit turunan | attempt + `steps[]` ringkas + korelasi `syncWorkflowId` |
| Sync `channel_products` (Postgres JSONB) | cache turunan | command terminal per entity |

Begitu ini jelas, Q1/Q2 jadi mudah: **jangan pindahkan cache antar-DB**, **jangan duplikasi apa yang
Temporal sudah simpan** — cukup **perkaya satu audit surface** (`publish_history`) dengan korelasi +
step-summary. Itu yang dikerjakan ekstensi ini.

---

## 6. Status & pengujian

- **Build:** `BUILD SUCCESS` (kedua repo). **Test BFF:** `ContentHashTest` (3), `ListingStateResponseTest`
  (1, +sync ids), `WorkflowStatusStepsTest` (2 — deserialisasi `steps` snake_case + absen→null). **Test
  sync:** `SyncStepResultContractTest` (4 — wire-contract `step_results` + masking + round-trip). Semua hijau.
- **Migrasi:** semua field baru **aditif & nullable** — tak ada migrasi destruktif; doc lama dapat null,
  publish berikutnya mengisi `syncWorkflowId`/`syncEntityId`.
- **Sisa (follow-up):** ~~kontrak `step_results[]` di sync service (§4b)~~ **SELESAI** (§4c) — sync kini
  mengembalikan `step_results[]` ter-mask di `GET /channel_product_state`. Tindak lanjut berikutnya: di BFF,
  isi `WorkflowStatusResponse.steps` dari `step_results` saat poll (mapping sudah forward-compatible),
  sehingga dashboard membaca per-step langsung dari `publish_history` tanpa akses Temporal. Verifikasi E2E
  per-step terisi butuh menjalankan publish nyata (Temporal@7233 + Postgres).
- **Paritas Kalix (interchangeable):** sync service **Kalix** (`/Users/admin/MyKalix/notifikasi`) kini
  mengembalikan `step_results[]` dengan **kontrak wire yang identik** (snake_case dipaksa via proto
  `json_name`), sehingga Kalix & Temporal bisa **saling menggantikan** di belakang BFF tanpa perubahan BFF.
  Detail + perbedaan sadar: `documentation/sync-step-results-parity.md` di repo Kalix.
