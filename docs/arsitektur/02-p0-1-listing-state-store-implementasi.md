# P0-1 — Listing-State Store: Detail Teknis Implementasi

> Turunan dari [`01-analisis-kesiapan-produksi-mvp.md`](01-analisis-kesiapan-produksi-mvp.md) §5 (P0-1).
> **Tujuan:** membuat sistem **tahu apa yang live di mana** — memetakan `(masterProduct × store) →
> channelProductId + status + error + waktu`, dan menyimpan **jejak audit setiap percakapan publish**.
> Ini fondasi untuk P0-2 (update/delist idempoten) & P0-3 (retry/idempotency), jadi dikerjakan lebih dulu.
>
> Semua nama file/method/koleksi di bawah **diverifikasi dari kode** (branch `bff-v12`, 2026-08-11).

---

## 1. Masalah yang diperbaiki (fakta dari kode)

Saat publish sukses, `channelProductId` (ID listing eksternal) **ada di response** tapi **dibuang**:

- `PublishProductResponse` punya `channelProductId`, `channelUrl`, `publishId`
  (`publishing/model/response/PublishProductResponse.java:37,42,47`).
- Titik pencatatan status — `ChannelPublishService.updateChannelProductStatus()`
  (`publishing/service/ChannelPublishService.java:495`) — **hanya** membaca `getSuccess()`,
  `getErrors()`, `getSyncStatus()`. `channelProductId`/`channelUrl` **tidak pernah dipersist**.
- `ChannelProductDataService.markPublished()` (`.../channelproduct/service/ChannelProductDataService.java:175`)
  hanya set `status=PUBLISHED`, `publishedAt`, `publishError=null`. Tak menyimpan ID listing.
- `channel_product_data` entity → tak punya field `channelProductId`. `MasterProductData.channelSummary`
  (`ChannelSyncEntry`) menyimpan `{storeId, storeName, channelType, syncStatus, lastSyncedAt, errorMessage}`
  — **juga tanpa** `channelProductId`, tanpa contentHash, tanpa history.

**Akibat:** tak bisa update/hapus/rekonsiliasi listing (butuh ID-nya), tak bisa dedup re-publish, tak ada audit.

---

## 2. Keputusan desain

Dua tempat penyimpanan, dua grain berbeda:

| | **Current listing-state** | **Publish history** |
|---|---|---|
| Koleksi | **perkaya `channel_product_data`** (yang sudah ada) | **baru: `publish_history`** |
| Grain | 1 baris per `(masterProductId, storeId)` — mutable | 1 baris per percobaan publish — append-only immutable |
| Kunci | index unik `product_store_unique_idx` yang **sudah ada** | index `(masterProductId, storeId, createdAt desc)` |
| Jawab | "master X live di store Y sebagai listing apa, status apa, error terakhir" | "riwayat semua percobaan publish listing ini / feed org" |

**Kenapa perkaya `channel_product_data`, bukan koleksi `listing_state` baru?** Grain-nya **sudah tepat**:
`channel_product_data` unik per `(masterProductId, storeId)` dan **sudah** memegang `status`/`publishedAt`/
`publishError`. Menambah koleksi paralel = dua sumber-kebenaran untuk status listing yang sama → risiko
divergen. Cukup tambah field identitas listing di sini. (Konsisten dengan opsi "atau perkaya
channel_product_data" di dok analisis.)

**Kenapa history koleksi terpisah?** Grain berbeda (per-attempt, immutable) — menaruh array history dalam
doc mutable membuatnya membengkak & rawan clobber. Append-only di koleksi sendiri lebih bersih + bisa TTL.

---

## 3. Perubahan data model

### 3a. `ChannelProductData` — tambah field identitas listing

File: `ecommerce/channelproduct/model/entity/ChannelProductData.java` (aditif, semua nullable):

```java
// ── Listing identity (P0-1): live listing yang dipetakan (master × store) ──
/** External listing id yang dikembalikan channel (Shopify product id, Shopee item_id, …). */
@Indexed
private String channelProductId;

/** Deep-link ke listing di admin channel. */
private String channelUrl;

/**
 * Opsional: sku → channel variant/model id (Shopify variant id, Shopee model_id).
 * Diisi HANYA jika sync-service mengembalikannya; kalau belum tersedia, biarkan null (lihat §9).
 */
private Map<String, String> variantChannelIds;

/** publishId percobaan terakhir (menautkan ke publish_history). */
private String lastPublishId;

/** Hash payload yang terakhir SUKSES terkirim — dasar dedup/idempotency (§8). */
private String lastPublishedContentHash;

/** Counter monotonic jumlah percobaan publish. */
@Builder.Default
private Integer publishAttempts = 0;

/** Waktu percobaan terakhir (sukses atau gagal), beda dari publishedAt (hanya sukses). */
private LocalDateTime lastAttemptAt;
// publishedAt & publishError SUDAH ada — dipertahankan.
```

Enum status **tetap** `DRAFT, READY, PUBLISHED, FAILED` untuk P0-1. (Forward-looking: `DELISTED` untuk
P0-2, `PUBLISHING` untuk P0-3 async — jangan ditambah sekarang agar scope P0-1 minimal.)

Index baru: `@Indexed` pada `channelProductId` memberi **reverse lookup** (channel→master) yang
dibutuhkan webhook & reverse-sync nanti. Tambah compound index eksplisit di `@CompoundIndexes`:

```java
@CompoundIndex(name = "channel_listing_idx",
               def = "{'channelType': 1, 'channelProductId': 1}", sparse = true)
```
(`sparse=true` karena mayoritas draft belum punya `channelProductId`.)

### 3b. Koleksi baru `publish_history` (append-only audit)

File baru: `publishing/model/entity/PublishHistoryEntry.java`

```java
@Data @NoArgsConstructor @AllArgsConstructor @Builder
@Document(collection = "publish_history")
@CompoundIndexes({
    @CompoundIndex(name = "listing_history_idx",
                   def = "{'masterProductId': 1, 'storeId': 1, 'createdAt': -1}"),
    @CompoundIndex(name = "org_feed_idx",
                   def = "{'organizationId': 1, 'createdAt': -1}")
})
public class PublishHistoryEntry {
    @Id private String id;

    private String masterProductId;
    private String storeId;
    private String channelType;
    private String organizationId;

    private String publishId;          // == PublishProductResponse.publishId
    private String operation;          // "CREATE" | "UPDATE" | "DELIST" (P0-2)
    private boolean success;
    private String syncStatus;         // COMPLETED | FAILED | DRY_RUN | PROCESSING
    private String channelProductId;   // terisi saat sukses
    private String contentHash;

    private String errorCode;
    private String errorMessage;
    private Long durationMs;
    private boolean dryRun;
    private String userId;

    /** TTL 180 hari agar pertumbuhan terbatas; hapus @Indexed(expireAfter) bila ingin retensi permanen. */
    @Indexed(expireAfter = "180d")
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

> **Catatan TTL:** `@Indexed(expireAfter=...)` pada `LocalDateTime` didukung Spring Data Mongo (dikonversi
> ke `Date`). Kalau audit harus permanen (mis. kepatuhan), buang anotasi expireAfter.

---

## 4. Perubahan repository

### 4a. `ChannelProductDataRepository` — atomic partial-update + reverse lookup

File: `ecommerce/channelproduct/repository/ChannelProductDataRepository.java`

**Penting — pakai `@Update` atomik, bukan read-modify-write.** `markPublished`/`markFailed` sekarang
mem-`findBy…` lalu `repository.save(data)` **seluruh dokumen** — ini bisa **menimpa** `channelData`/
`masterOverrides` bila ada penyimpanan Step-2 yang bersamaan. Ganti dengan `$set` hanya field listing:

```java
/** Catat hasil publish SUKSES — set hanya field listing, $inc attempts. Tak menyentuh channelData. */
@Query("{ 'masterProductId': ?0, 'storeId': ?1 }")
@Update("{ '$set':  { 'status': 'PUBLISHED', 'channelProductId': ?2, 'channelUrl': ?3, " +
        "            'lastPublishId': ?4, 'lastPublishedContentHash': ?5, " +
        "            'publishedAt': ?6, 'lastAttemptAt': ?6, 'publishError': null }, " +
        "  '$inc':  { 'publishAttempts': 1 } }")
Mono<Long> recordPublishSuccess(String masterProductId, String storeId,
                                String channelProductId, String channelUrl,
                                String lastPublishId, String contentHash, LocalDateTime at);

/** Catat hasil publish GAGAL — status FAILED + error, tanpa menyentuh channelProductId sebelumnya. */
@Query("{ 'masterProductId': ?0, 'storeId': ?1 }")
@Update("{ '$set':  { 'status': 'FAILED', 'publishError': ?2, 'lastPublishId': ?3, 'lastAttemptAt': ?4 }, " +
        "  '$inc':  { 'publishAttempts': 1 } }")
Mono<Long> recordPublishFailure(String masterProductId, String storeId,
                                String errorMessage, String lastPublishId, LocalDateTime at);

/** Reverse lookup untuk webhook / reverse-sync (channel → master). */
Mono<ChannelProductData> findByChannelTypeAndChannelProductId(String channelType, String channelProductId);
```

> Pola `@Query`+`@Update` sudah dipakai di repo ini (`updateChannelCategory`), jadi idiomatik.

### 4b. `PublishHistoryRepository` (baru)

File baru: `publishing/repository/PublishHistoryRepository.java`

```java
@Repository
public interface PublishHistoryRepository extends ReactiveMongoRepository<PublishHistoryEntry, String> {
    Flux<PublishHistoryEntry> findByMasterProductIdAndStoreIdOrderByCreatedAtDesc(String masterProductId, String storeId);
    Flux<PublishHistoryEntry> findByOrganizationIdOrderByCreatedAtDesc(String organizationId, Pageable pageable);
}
```

> ⚠️ **Gotcha wiring:** repo **tidak** auto-scan dari base package root — `MongoConfig`
> (`configuration/MongoConfig.java:20`) meng-enumerasi `basePackages` secara **eksplisit**. Paket baru
> `com.labamap.labamapomnichannelbe4fe.publishing.repository` **harus ditambahkan** ke daftar itu,
> atau repository tak akan ter-instansiasi. (Alternatif: taruh entity+repo di
> `ecommerce.channelproduct.repository` yang sudah terdaftar, dan lewati edit MongoConfig.)

---

## 5. Perubahan service

### 5a. `ChannelProductDataService`

Ganti `markPublished`/`markFailed` (read-save) → delegasi ke partial-update atomik:

```java
public Mono<Long> recordPublishSuccess(String masterProductId, String storeId,
                                        String channelProductId, String channelUrl,
                                        String publishId, String contentHash) {
    return repository.recordPublishSuccess(masterProductId, storeId, channelProductId,
            channelUrl, publishId, contentHash, LocalDateTime.now());
}

public Mono<Long> recordPublishFailure(String masterProductId, String storeId,
                                        String errorMessage, String publishId) {
    return repository.recordPublishFailure(masterProductId, storeId, errorMessage,
            publishId, LocalDateTime.now());
}
```

(Pertahankan `markPublished(id, storeId)` lama sebagai delegasi tipis bila masih dirujuk tempat lain,
atau update pemanggilnya — hanya `ChannelPublishService` yang memakainya.)

### 5b. `PublishHistoryService` (baru, tipis)

File baru: `publishing/service/PublishHistoryService.java` — satu method append + dua query read:

```java
public Mono<PublishHistoryEntry> record(PublishHistoryEntry e) { return repository.save(e); }
public Flux<PublishHistoryEntry> forListing(String masterProductId, String storeId) { … }
public Flux<PublishHistoryEntry> forOrg(String organizationId, int limit) { … }
```

---

## 6. Titik integrasi (seam) — di mana kode disambung

Satu tempat: `ChannelPublishService.updateChannelProductStatus()` (baris **495**), dipanggil dari baris
**199** setelah publish. Ubah isinya:

```java
// dryRun → tetap tidak persist listing-state (perilaku existing dipertahankan) …
if (Boolean.TRUE.equals(request.getDryRun())) {
    return recordHistory(request, store, response, "CREATE"); // history DRY_RUN saja (opsional)
}

// PROCESSING (poll timeout) → JANGAN set PUBLISHED/FAILED, TAPI catat history PROCESSING untuk jejak.
if (isProcessingSyncStatus(response.getSyncStatus())) {
    return recordHistory(request, store, response, "CREATE"); // status listing dibiarkan; poll nanti rekonsiliasi
}

String hash = ContentHash.of(response.getPublishedData()); // §8

if (Boolean.TRUE.equals(response.getSuccess())) {
    return channelProductDataService.recordPublishSuccess(
                masterProductId, storeId,
                response.getChannelProductId(),   // ← yang tadinya dibuang, kini dipersist
                response.getChannelUrl(),
                response.getPublishId(), hash)
            .onErrorResume(e -> { log.warn("listing-state persist failed: {}", e.getMessage()); return Mono.empty(); })
            .then(recordHistory(request, store, response, "CREATE"))
            .then(masterProductDataService.updateChannelSummaryEntry(masterProductId, successEntry)); // existing
} else {
    String errorMsg = firstErrorMessage(response);
    return channelProductDataService.recordPublishFailure(masterProductId, storeId, errorMsg, response.getPublishId())
            .onErrorResume(e -> { … })
            .then(recordHistory(request, store, response, "CREATE"))
            .then(masterProductDataService.updateChannelSummaryEntry(masterProductId, failedEntry)); // existing
}
```

`recordHistory(...)` membangun `PublishHistoryEntry` dari `request`/`store`/`response` (termasuk
`durationMs` dari `response.getPerformanceMetrics().getTotalTimeMs()`, `userId` dari `request.getUserId()`)
lalu `publishHistoryService.record(e)`. (Metode `recordHistory` + leaf-helper `persist*` kini berada di
`PublishOutcomeWriter`, Fase 5 dekomposisi guide 41; orkestrator `updateChannelProductStatus`/`recordFailedOutcome`
di `ChannelPublishService` mendelegasikan ke sana. Pseudocode alur di atas tetap berlaku secara konseptual.)

> **Untuk P0-2 nanti:** parameter `"CREATE"` menjadi `"UPDATE"` bila listing-state sudah punya
> `channelProductId` sebelum publish. Di P0-1 selalu `"CREATE"`.

`updateChannelSummaryEntry` existing bisa **diperkaya** menambah `channelProductId` ke `ChannelSyncEntry`
agar ringkasan di master-product juga menautkan listing (aditif, opsional).

### 6b. Seam kedua — jalur exception (abort sebelum ada response)

`updateChannelProductStatus` hanya jalan saat publish **menghasilkan response** (sukses/gagal terminal).
Bila pipeline **melempar** sebelum itu (pre-flight block, error transform), aliran masuk ke
`onErrorResume(...)` di `resolveStoreAndPublish` — yang semula **hanya** meng-update master `channelSummary`.
Agar listing-state & audit konsisten, jalur ini juga dicatat lewat helper `recordFailedOutcome(...)`:

```java
// di dalam onErrorResume(error -> handlePublishError(...).flatMap(failedResponse -> { … }))
return recordFailedOutcome(request, failedResponse, errMsg)         // listing-state FAILED + history
        .then(masterProductDataService.updateChannelSummaryEntry(masterProductId, entry)) // existing
        .thenReturn(failedResponse);

private Mono<Void> recordFailedOutcome(PublishProductRequest request,
        PublishProductResponse failedResponse, String errorMsg) {
    Mono<Void> listingState = Boolean.TRUE.equals(request.getDryRun())
            ? Mono.empty()   // dry-run: history saja, listing-state tak disentuh (konsisten §6)
            : channelProductDataService.recordPublishFailure(
                        request.getMasterProductId(), request.getStoreId(),
                        errorMsg, failedResponse.getPublishId())
                    .onErrorResume(e -> Mono.empty()).then();
    // store tak ada di scope error-handler → recordHistory fallback ke request.getChannelId().
    return listingState.then(recordHistory(request, null, failedResponse, "CREATE").then());
}
```

Catatan: `handlePublishError` memberi `syncStatus="BLOCKED"` untuk pre-flight block (vs `"FAILED"`);
history **mempertahankan** nilai itu, sementara `channel_product_data.status` menjadi `FAILED` (enum tak
punya BLOCKED) — konsisten dengan perilaku `channelSummary` existing. **P0-2:** jalur update sebaiknya
tidak men-*downgrade* listing yang sudah live jadi FAILED saat re-publish cuma di-BLOCK pre-flight.
Kedua seam **saling eksklusif** (`onErrorResume` hanya menyala pada sinyal error), jadi tak ada double-write.

---

## 7. API baca (read model) untuk FE/ops

Tambah di `ChannelProductDataController` (base `/api/v1/ecommerce/channel-product-data`):

```java
// Daftar listing-state per store untuk satu produk (status + channelProductId + url + error).
@GetMapping("/{masterProductId}/listings")
Mono<ResponseEntity<List<ListingStateResponse>>> listings(@PathVariable String masterProductId);

// Riwayat publish satu listing.
@GetMapping("/{masterProductId}/{storeId}/history")
Mono<ResponseEntity<List<PublishHistoryEntry>>> history(@PathVariable String masterProductId,
                                                        @PathVariable String storeId);
```

`ListingStateResponse` = proyeksi ringan dari `ChannelProductData`
(`storeId, channelType, status, channelProductId, channelUrl, publishedAt, publishError, publishAttempts`).
`ChannelStepStoresResponse.StoreSummary` yang sudah ada bisa **diperluas** menambah `channelProductId`/
`channelUrl` agar badge "live" langsung nge-link ke listing.

---

## 8. `contentHash` — spesifikasi & jembatan ke P0-2/P0-3

Sumber: `response.getPublishedData()` (Map payload channel yang benar-benar terkirim — sudah ada di
response, tak perlu di-thread ulang). Hash stabil:

```java
final class ContentHash {
  static String of(Map<String,Object> payload) {
    if (payload == null) return null;
    String canonical = canonicalJson(payload);          // key ter-sort, whitespace ternormalisasi
    return "sha256:" + sha256Hex(canonical.getBytes(UTF_8));
  }
}
```

Ini mengaktifkan (di P0-2/P0-3, bukan sekarang) tabel keputusan re-publish:

| Kondisi | Aksi |
|---|---|
| `status≠PUBLISHED` atau `channelProductId==null` | **CREATE** (jalur sekarang) |
| `PUBLISHED` && `channelProductId≠null` && `newHash==lastPublishedContentHash` | **NO-OP** (idempoten — skip call channel) |
| `PUBLISHED` && `channelProductId≠null` && `newHash≠lastPublishedContentHash` | **UPDATE** listing (P0-2) |

Di P0-1 kita **hanya menyimpan** `lastPublishedContentHash`; logika cabang di atas menyusul di P0-2/P0-3.

---

## 9. Migrasi & backfill (jujur soal batasan)

- Semua field baru **aditif & nullable** → **tak ada migrasi destruktif**. Doc lama dapat null; publish
  berikutnya mengisinya. `publish_history` baru & kosong.
- **Batasan forward-only:** listing yang **sudah** live sebelum P0-1 **tak bisa** di-backfill
  `channelProductId`-nya — ID itu memang tak pernah disimpan (dibuang di response). Opsi rekonsiliasi:
  (a) biarkan publish berikutnya mengisinya (paling sederhana, cukup untuk MVP), atau (b) tandai
  `status=PUBLISHED && channelProductId==null` sebagai "unlinked" dan pulihkan lewat reverse-sync
  poll-by-SKU nanti (P2). **Jangan** memalsukan ID.
- `variantChannelIds` (§3a) hanya terisi bila **sync-service mengembalikan per-variant id**. Response
  saat ini (`PublishProductResponse`) hanya membawa `channelProductId` item-level. Jika per-variant id
  belum di-surface sync-service, **biarkan null** dan tunda — jangan blok P0-1 karenanya.

---

## 10. Konkurensi & kebenaran

- **Atomic `$set`** (§4a) mencegah publish menimpa penyimpanan Step-2 yang bersamaan (read-save lama
  berisiko clobber `channelData`). Ini perbaikan tersendiri, bukan sekadar kosmetik.
- Index unik `product_store_unique_idx` menjamin **satu** baris listing-state per `(master, store)`.
- Append history di koleksi terpisah → tanpa kontensi dengan mutasi listing-state.
- Persist listing-state dibungkus `onErrorResume` (seperti `markPublished` existing) agar kegagalan
  pencatatan **tidak** menggagalkan publish yang sudah sukses di channel.

---

## 11. Testing

- **Unit (service):** sukses → `recordPublishSuccess` set `channelProductId/channelUrl/hash/publishedAt`
  + 1 history `success=true, operation=CREATE`; gagal → `FAILED`+error+1 history `success=false`;
  dryRun → tak sentuh listing-state (guard existing).
- **Repository (@DataMongoTest / embedded):** `recordPublishSuccess` **tidak** meng-null-kan `channelData`
  yang di-set sebelumnya (bukti atomic partial-update).
- **Reverse lookup:** `findByChannelTypeAndChannelProductId` mengembalikan doc yang benar.
- **Idempotency helper:** `ContentHash.of` stabil terhadap urutan key (payload sama, urutan beda → hash sama).
- **Wiring:** context-load test memverifikasi `PublishHistoryRepository` ter-instansiasi (mendeteksi lupa
  daftar MongoConfig).

---

## 12. Definition of Done (checklist)

- [ ] `ChannelProductData` + 6 field listing-identity + index `channel_listing_idx`.
- [ ] `PublishHistoryEntry` + `PublishHistoryRepository` + **paket didaftarkan di `MongoConfig`**.
- [ ] `ChannelProductDataRepository`: `recordPublishSuccess`/`recordPublishFailure` (atomic) + reverse lookup.
- [ ] `ChannelProductDataService`: method baru; pemanggil lama disesuaikan.
- [ ] `PublishHistoryService` + `ContentHash` util.
- [ ] `ChannelPublishService.updateChannelProductStatus` menulis `channelProductId`/`channelUrl`/`hash` +
      append history (sukses/gagal/PROCESSING).
- [ ] Endpoint `GET …/listings` & `…/{storeId}/history`; `StoreSummary` diperluas (opsional).
- [ ] Test §11 hijau; `mvn -Dmaven.test.skip=true` build bersih.
- [ ] Catat perubahan di memory & (bila perlu) `docs/product/07-publishing-engine/`.

**Estimasi:** ~1 sprint kecil (2–3 hari eng). Risiko rendah — **aditif**, tak mengubah jalur transformasi,
seam tunggal yang sudah teridentifikasi. Nilai tinggi: membuka P0-2 & P0-3.
