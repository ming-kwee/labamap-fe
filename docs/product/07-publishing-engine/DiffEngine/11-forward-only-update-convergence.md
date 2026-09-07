# UPDATE Forward-only — perbaikan konvergensi (simpan channel-id parsial saat GAGAL)

> **Status: SUDAH DIIMPLEMENTASI (2026-09-05).** Kedua jalur outcome publish (sinkron + reconciler async)
> kini menyimpan channel-id yang disurface sync **walaupun** UPDATE gagal, supaya retry **konvergen** alih-alih
> menduplikasi varian/gambar. Sejalan dengan perubahan di sync service yang membuang snapshot rollback demi
> forward-only (lihat doc repo sync `documentation/09-forward-only-update-dan-reconcile.md`).

## 1. Latar belakang — apa itu "UPDATE forward-only"

Sync service (Temporal) menangani UPDATE yang gagal secara **forward-only**: ia berhenti di `UPDATE_FAILED`,
**tidak pernah** menghapus atau me-rollback produk live. Pemulihannya lewat **konvergensi** — publish
berikutnya mendorong ulang desired-state, dan karena DiffEngine + `update-by-id` bersifat idempoten, ia
mengoreksi dirinya sendiri. (Snapshot rollback `restore_CP` dibuang karena over-engineering; `read_CP`/
read-from-channel dipertahankan untuk media.)

Agar konvergensi benar-benar bekerja, **baseline listing-state di BFF harus akurat** setelah kegagalan
parsial. Dokumen ini memperbaiki dua tempat di mana baseline itu tadinya tidak akurat.

## 2. Dua celah (sebelum perbaikan ini)

Kegagalan UPDATE parsial = sebagian langkah sudah diterapkan di channel, lalu langkah berikutnya gagal
(mis. item ter-update, model varian baru dibuat lewat `add_model`, lalu langkah media gagal → keseluruhan
`UPDATE_FAILED`).

| # | Celah | Efek ke publish berikutnya |
|---|-------|-----------------------------|
| **G-a** | Saat gagal, `persistChannelIds(...)` **tidak** dipanggil (channel-id hanya ditangkap saat sukses). | Model varian / gambar yang dibuat *sebelum* gagal punya channel-id yang tak pernah dicatat BFF → diff berikutnya menganggapnya **baru** → `add_model` lagi → **model / gambar duplikat**. |
| **G-b** | **Reconciler** (`PublishJobReconciler`) memakai `recordPublishFailure` biasa untuk semua kegagalan — termasuk UPDATE — sehingga **menurunkan** (downgrade) listing yang masih live menjadi FAILED. | Publish berikutnya melihat listing bukan-PUBLISHED → memutuskan **CREATE** → **produk duplikat**. (Jalur sinkron sudah menghindari ini via G7 `recordUpdateFailureKeepingLive`; reconciler belum.) |

Field skalar (judul/harga/stok) sudah konvergen dengan benar — baseline `contentHash` hanya dimajukan
**saat sukses** (dan jalur sinkron sudah mengosongkannya saat UPDATE gagal via G7), jadi field yang gagal
tetap "dirty" dan publish berikutnya mendorongnya ulang. Celahnya spesifik pada **entitas anak** (model
varian, gambar) dan **downgrade listing oleh reconciler**.

## 3. Apa yang diubah

Kedua perubahan bersifat **UPDATE-only**. Kegagalan **CREATE** di-compensate lewat *delete* di sisi sync
(produk separuh-jadi beserta anak-anaknya dihapus), jadi id-nya **tidak boleh** disimpan — CREATE tetap
memakai perilaku FAILURE biasa.

### 3.1 Jalur sinkron — `ChannelPublishService` (handler outcome, cabang failure)
Ditambahkan, hanya untuk kegagalan UPDATE yang live, `persistChannelIds(...)` best-effort memakai id yang
dikembalikan sync:

```java
Mono<Void> persistPartialIds = liveUpdateFailure
        ? persistChannelIds(masterProductId, storeId,
                response.getVariantChannelIds(), response.getImageChannelIds())
        : Mono.empty();

return stateUpdate                       // recordUpdateFailureKeepingLive (G7) untuk UPDATE
        .doOnNext(...)
        .onErrorResume(...)
        .then(persistPartialIds)         // ← BARU: catat id anak yang terlanjur dibuat
        .then(recordHistory(...))
        .then(masterProductDataService.updateChannelSummaryEntry(...));
```

### 3.2 Jalur async — `PublishJobReconciler` (penyelesaian poll-timeout)
Cabang failure pada `applyOutcome` kini mendelegasikan ke method baru `failureListingState(job, ws)` yang
membawa reconciler ke **paritas G7** dan menyimpan id parsial:

```java
private Mono<Void> failureListingState(PublishJob job, WorkflowStatusResponse ws) {
    boolean update = "UPDATE".equalsIgnoreCase(job.getOperation());
    String reason = ws.getFailureReason() != null ? ws.getFailureReason() : "Sync reported FAILED";
    Mono<Long> stateUpdate = update
            ? channelProductDataService.recordUpdateFailureKeepingLive(...)   // G7: keep live (dulu: downgrade)
            : channelProductDataService.recordPublishFailure(...);            // CREATE: tak berubah
    return stateUpdate.then(update ? persistChannelIds(job, ws) : Mono.empty());  // ← BARU untuk UPDATE
}
```

`PublishJob.operation` (CREATE | UPDATE) adalah pembeda-nya. Kedua helper `persistChannelIds` bersifat
best-effort dan no-op saat map id kosong, jadi tak ada yang ter-clobber ketika sync tak menyurface id.

## 4. Kenapa ini aman

- **Menyimpan id tidak memajukan `contentHash`.** `updateVariantChannelIds` / `updateImageChannelIds` hanya
  `$set` map id; baseline hash tetap tak-maju (dikosongkan saat UPDATE gagal via G7), sehingga diff berikutnya
  tetap mendorong ulang field yang diinginkan. Kita hanya memberi tahu diff *channel-id mana yang sudah ada*
  supaya ia mengeluarkan UPDATE, bukan ADD, untuk id itu.
- **UPDATE-only.** Kegagalan CREATE di-delete-compensate di sisi sync → menyimpan id anaknya akan menunjuk
  entitas yang sudah dihapus; jadi dilewati.
- **Best-effort.** Mencatat id tak pernah menggagalkan response publish.

## 5. Enabler (repo sync) — id parsial MEMANG tersedia saat GAGAL

Perbaikan ini bergantung pada sync service yang menyurface id yang ditangkap *sebelum* gagal. Dan memang
begitu: `ChannelProductWorkflowImpl.getSyncState()` mengembalikan `variantIds` + `imageIds` **tanpa pandang
status terminal** (diisi inkremental oleh `captureVariantIds` seiring langkah sukses). Jadi poll
`UPDATE_FAILED` tetap membawa id anak yang terlanjur dibuat. Tidak perlu perubahan di sisi sync.

## 6. Cara verifikasi

1. Picu UPDATE yang menambah varian/gambar, dan paksa langkah *berikutnya* gagal (mis. token salah pada
   panggilan media) supaya run berakhir `UPDATE_FAILED` setelah `add_model` sukses.
2. Cek `channel_product_data` (listing-state): status tetap **PUBLISHED** (bukan FAILED), `contentHash`
   kosong, dan `variantChannelIds`/`imageChannelIds` kini memuat model/gambar yang dibuat run ini.
3. Publish ulang produk yang sama → diff mengeluarkan **UPDATE** (bukan ADD) untuk model/gambar itu →
   **tanpa duplikat**.
4. Ekspektasi sama via jalur async: biarkan poll sinkron timeout supaya `PublishJobReconciler` menyelesaikan
   job; pastikan listing tetap live + id tersimpan.

## 7. Terkait

- Repo sync: `documentation/09-forward-only-update-dan-reconcile.md` (strategi forward-only + reconcile;
  §10 backlog mencantumkan penyempurnaan Tier-0 ini).
- `03-mode-b-per-model-buckets.md` (bucket add/update/delete varian — diff yang diberi makan oleh ini).
- `10-wix-media-id-tracking.md` (round-trip id gambar untuk media-replace WIX).
- G7 (keep-live saat UPDATE gagal) — `ChannelProductDataService.recordUpdateFailureKeepingLive`.

## 8. Di luar scope (masih backlog)

- **Auto-retry Tier 1** atas `UPDATE_FAILED` (re-issue dengan `eventId` baru + backoff terbatas) — ditunda.
- **Alert Tier 2** atas publish FAILED / dead-lettered — ditunda.
- Opsional: picu **reverse-sync** sebelum mem-publish ulang produk FAILED (bangun ulang baseline dari state
  channel nyata) — pelengkap yang lebih berat untuk perbaikan ini; hanya diperlukan bila penangkapan id saat
  gagal ternyata tak cukup untuk suatu channel.

## 9. Sisa celah tepi yang diketahui (audit 2026-09-05)

Perbaikan ini menutup duplikat-ADD + downgrade reconciler. Dari dua celah tepi, **R2 kini terverifikasi
aman**; sisa hanya R1 (ringan):

- **R1 — delete-ghost (masih terbuka, ringan).** Varian yang berhasil **dihapus** lalu langkah berikutnya
  gagal tetap menyimpan id-nya di `variantChannelIds` (`persistChannelIds`/`updateVariantChannelIds` hanya
  `$set`/menambah, tak pernah menghapus) → retry berikutnya bisa mencoba `delete_model` pada model yang sudah
  tiada. **Benign** (delete-of-gone umumnya idempoten). Obat: reverse-sync. Bukan penghalang.
- **R2 — `$set` replace, bukan merge → ✅ TERVERIFIKASI AMAN (2026-09-05).** `updateVariantChannelIds` =
  `@Update("{ '$set': { 'variantChannelIds': ?2 } }")` mengganti seluruh map, jadi kekhawatirannya: bila
  `ws.getVariantIds()` saat gagal **< baseline**, ia menimpa → drop id → duplikat. **Cek cakupan payload
  membuktikan itu tak terjadi:** setiap UPDATE, `ChannelAttributeConverterService.buildVariantGroups`
  membangun **set varian DESIRED penuh**, lalu `VariantModelIdInjector.inject` mengisi model-id existing untuk
  **semua** sku dikenal (iterasi seluruh grup, resolusi dari `existingVariantChannelIds` penuh) dengan
  `isSupportField=false` SEBELUM panggil channel. Jadi payload membawa **seluruh** varian ber-id; bucketing
  (update/add/delete) dilakukan **di dalam sync**, bukan dengan memangkas payload. Sisi sync
  `captureVariantIds` menangkap peta **lengkap** (paling awal di `ChannelProductWorkflowImpl:194`, sebelum
  langkah varian). Maka `$set` menulis balik peta lengkap/superset → tak ada id baseline hilang. Degenerate
  juga aman: tanpa `idtracking#variants` → `captureVariantIds` no-op → `ws.getVariantIds()` kosong →
  empty-guard `persistChannelIds` → tanpa `$set`. `$set` yang sama dipakai jalur SUCCESS; sama-sama aman.

**Obat untuk R1 = reverse-sync** (baca ulang state channel nyata → bangun ulang baseline), bukan menambah
tweak persist-on-failure lagi (lihat §8).

### Prasyarat sebelum mengaktifkan Tier 1 (auto-retry)

**R2 sudah terverifikasi aman** → tak lagi memblokir. Sisa hanya **R1 (delete-ghost)** yang **ringan/benign**
(delete-of-gone idempoten). Tier 1 boleh dilanjut; **reverse-sync opsional** sebagai hardening R1, bukan
syarat wajib.
