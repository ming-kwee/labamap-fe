# P0-2 — Publish Idempoten (CREATE / NO-OP / UPDATE) + Kesiapan Delist

> Turunan dari [`01-analisis-kesiapan-produksi-mvp.md`](01-analisis-kesiapan-produksi-mvp.md) §5 (P0-2),
> dibangun di atas [P0-1 listing-state](02-p0-1-listing-state-store-implementasi.md) +
> [korelasi sync](03-sync-service-persistence-dan-per-hit-history.md). **Tujuan:** re-publish **tidak
> boleh** membuat listing duplikat — sistem harus tahu produk sudah live dan bertindak sesuai
> (skip / update), bukan membuat listing baru tiap kali.

---

## 1. Masalah

Sebelum P0-2, setiap publish menjalankan jalur **create** (`create_CP`). Publish ulang produk yang
sudah tayang → channel membuat listing **kedua** dan meng-orphan yang pertama; BFF lalu menimpa
`channel_product_data.channelProductId` dengan id baru → listing lama hilang jejak. Ini pemecah
kepercayaan #1 di produksi.

Fakta sisi-sync (dibaca dari repo `notifikasi temporal`):
- Sync **sudah** dukung DELETE end-to-end (`SyncRequest.deleted` → `CommandMapper` → `runDeleteFlow` →
  `delete_CP`).
- Sync **belum** dukung UPDATE — hanya `create_CP` + delete. Jadi mengirim "update" ke sync sekarang =
  create ulang = duplikat.

Kedua fakta itu menentukan desain aman di bawah.

---

## 2. Keputusan idempoten (murni, teruji)

`PublishOperationDecider.decide(state, intendedContentHash, channelUpdateEnabled)` — fungsi **murni**
(unit-tested), dipanggil sebelum menyentuh channel. `intendedContentHash = ContentHash.of(wrappedData)`
(payload final yang akan dikirim), dibandingkan dengan `listingState.lastPublishedContentHash` (P0-1).

| Listing-state | Content hash | Keputusan | Aksi |
|---|---|---|---|
| absen / bukan PUBLISHED / tanpa `channelProductId` | — | **CREATE** | jalur create seperti biasa |
| live (PUBLISHED + `channelProductId`) | **== last** | **NO-OP** | **skip channel call**, kembalikan listing yang ada |
| live | ≠ last, `channel-update` **on** | **UPDATE** | kirim ke sync dengan `operation=UPDATE` + `channelProductId` |
| live | ≠ last, `channel-update` **off** | **UPDATE_BLOCKED** | fail-closed: `syncStatus=BLOCKED` + pesan actionable |

**NO-OP** = kemenangan penuh & aman: nol panggilan channel, nol duplikat, mengembalikan
`channelProductId` yang ada. **UPDATE** di-gate config karena sync belum punya `update_CP`; sampai itu
ada, re-publish konten-berubah pada listing live = **BLOCKED** (gagal-tertutup), **bukan** duplikat diam.

Jalur aman untuk mengubah konten listing live saat ini: **delist → re-publish** (delist = follow-up §5).

---

## 3. Alur & titik integrasi

`ChannelPublishService.publishToChannel` kini menjadi **gerbang keputusan** (store-aware saja; jalur
legacy channelId-only selalu CREATE):

```
publishToChannel(request, channelConfig, wrappedData, …)
  intendedHash = ContentHash.of(wrappedData)
  state ← channelProductDataService.getListingState(masterProductId, storeId)   // P0-1
  op    ← PublishOperationDecider.decide(state, intendedHash, channelUpdateEnabled)
    NOOP          → buildNoOpResponse(...)            // tak ada sync call
    UPDATE_BLOCKED→ buildBlockedUpdateResponse(...)   // tak ada sync call, syncStatus=BLOCKED
    UPDATE        → set operation=UPDATE + existingChannelProductId → doChannelSyncPublish(...)
    CREATE        → doChannelSyncPublish(...)          // = body publish lama (POST + poll)
```

> Sejak Fase 1 dekomposisi (guide 41), `buildNoOpResponse` / `buildBlockedUpdateResponse` pindah ke
> collaborator murni `PublishResponseFactory`; `publishToChannel` (di `ChannelPublishService`)
> mendelegasikan ke sana. Alur keputusan tak berubah.

`doChannelSyncPublish` = badan publish lama (build sync request → POST `/sync_channel_product_impl` →
poll). Tak berubah selain kini menerima `publishId` + menandai `operation` di response.

**Persistensi outcome** (`updateChannelProductStatus`) diperluas agar tak merusak state:
- `operation=NOOP` → **history saja**, listing-state tak disentuh (sudah PUBLISHED dengan konten sama).
- `syncStatus=BLOCKED` → **history saja**, listing live **tidak** di-downgrade ke FAILED (tak ada call).
- `operation` mengalir ke `publish_history.operation` (CREATE/NOOP/UPDATE) lewat `opOf(request)`.

**Refinement terkait:** `recordFailedOutcome` (jalur exception, mis. **pre-flight block**) kini juga
skip mutasi listing-state saat `BLOCKED` — sebelumnya pre-flight block men-downgrade listing live ke
FAILED. (Ini TODO P0-2 yang dicatat di P0-1, kini beres.)

---

## 4. File yang berubah (aditif)

| File | Perubahan |
|---|---|
| `publishing/service/PublishOperationDecider.java` (**baru**) | Keputusan murni CREATE/NOOP/UPDATE/UPDATE_BLOCKED. |
| `ChannelPublishService` | Gerbang `publishToChannel` + ekstraksi `doChannelSyncPublish` + delegasi `buildNoOpResponse`/`buildBlockedUpdateResponse` (metode kini di `PublishResponseFactory`, Fase 1 dekomposisi guide 41) + guard NOOP/BLOCKED di `updateChannelProductStatus` & `recordFailedOutcome` + helper `isBlockedSyncStatus`/`opOf` + flag `channelUpdateEnabled`. |
| `ChannelProductDataService` | `getListingState(masterProductId, storeId)`. |
| `PublishProductRequest` | +`operation`, `existingChannelProductId` (derived). |
| `PublishProductResponse` | +`operation` (CREATE/NOOP/UPDATE/DELIST). |
| `SyncChannelProductRequest` | +`deleted` (match sync), `operation`, `channelProductId` (forward-compat update/delete). |
| `ChannelProductData` | enum status +`DELISTED`. |

**Config baru:** `app.publish.channel-update-enabled` (env `APP_PUBLISH_CHANNEL_UPDATE_ENABLED`),
**default `false`**. Flip ke `true` **hanya** setelah sync service mengimplementasi `update_CP` yang
membaca `operation`/`channelProductId` dari request.

**Test:** `PublishOperationDeciderTest` (6) — matriks keputusan penuh termasuk null-hash guard.

---

## 5. Yang DITUNDA (follow-up sisi-sync — pola sama seperti `steps[]`)

1. **UPDATE channel-execution** — sync perlu workflow `update_CP` (mis. Shopify `PUT /products/{id}`,
   Shopee `update_item`) yang membaca `operation=UPDATE` + `channelProductId` dari request. Sampai itu
   ada, `channel-update-enabled` tetap `false` dan konten-berubah = BLOCKED.
2. **DELIST execution** — sync **sudah** bisa delete (`deleted=true` → `runDeleteFlow`), dan metadata
   `workaction#delete_CP` **sudah** di-seed di BFF (`ChannelMetadataMigration`). Yang belum: endpoint
   BFF `POST /channels/publish/delist` yang (a) memuat listing-state (butuh `channelProductId`),
   (b) membangun sync request `deleted=true` dengan `channelProductId` pada atribut target,
   (c) set listing-state → `DELISTED` + history `operation=DELIST`. Ditunda karena builder request-delete
   perlu kontrak "atribut mana yang memuat id" per channel — paling aman dikerjakan sepaket dengan sync.
   Model sudah siap (`DELISTED`, `SyncChannelProductRequest.deleted`).

---

## 6. Status & pengujian

- **Build:** `BUILD SUCCESS`. **Test:** 13 hijau (P0-2 decider 6 + kontrak sync 1 + steps 2 + hash 3 +
  listing-state 1).
- **Aman untuk go-live sekarang:** NO-OP aktif (cegah re-publish redundan) & CREATE-vs-duplicate
  terlindung (konten-berubah pada listing live = BLOCKED, bukan duplikat). Semua aditif, tanpa migrasi
  destruktif.
- **Aktivasi UPDATE penuh:** butuh `update_CP` sisi-sync + flip `app.publish.channel-update-enabled`.
