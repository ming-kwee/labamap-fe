# Keselarasan Kontrak BFF ⇄ Sync setelah Fase P0-* (+ Wiring G1–G3)

> Analisis: **apakah korelasi & kontrak sudah sesuai** setelah BFF menuntaskan P0-1…P0-5 dan sync
> mengimplementasi CREATE/UPDATE/DELETE. Rujukan kontrak sisi-sync:
> [`07-kontrak-bff-sync-service.md`](07-kontrak-bff-sync-service.md).
>
> Bukti dibaca dari kode kedua repo (BFF ini + `/Users/admin/MyKalix/notifikasi temporal`).

---

## 0. Verdict

| Aspek | Status |
|---|---|
| **Korelasi** (workflowId, step_results, publish_history, eventId-unik) | ✅ **sesuai** |
| **Jalur CREATE** | ✅ **sesuai** |
| **Kontrak operasi UPDATE/DELETE** | ⚠️ **belum tersambung** — tapi **fail-closed** (`channel-update-enabled=false`), jadi **tanpa bug aktif** |

Wiring **G1–G3 sudah dikerjakan** (bagian §2); **G4–G7 tersisa** (bagian §3). **Jangan flip
`app.publish.channel-update-enabled=true` sampai G4 selesai** (alasan di §3).

---

## 1. Korelasi & CREATE — SESUAI ✅

| Klausul kontrak | BFF (P0-*) | Bukti |
|---|---|---|
| Persist `workflowId` (§0.6/§7) | `syncWorkflowId` → publish_history + listing-state | P0-3 |
| `step_results[]` ter-mask → publish_history (§8) | `WorkflowStatusResponse.steps` `@JsonAlias {step_results, step_history}`; `at`=`Instant` (Z) | `SyncApiContractTest` (P0-3) |
| Baca `syncStatus`, bukan `currentStep` (§7) | BFF hanya baca `syncStatus` | — |
| `eventId` unik/operasi (§0.2) | `eventId = publishId` (ber-timestamp) → unik tiap attempt | `ChannelAttributeConverterService` |
| CREATE (§10) | `syncOperation=CREATE` (kini eksplisit, §2), metadata `create_CP` ter-seed | — |

---

## 2. Yang DIKERJAKAN — Wiring G1–G3

Sebelum ini, field forward-compat P0-2 **tak pernah di-populate** dan salah nama; kini disambungkan benar.

### G1 — nama field: `operation` → **`syncOperation`**
`SyncChannelProductRequest.operation` (diabaikan sync — kontrak memakai `syncOperation`, tanpa alias)
di-rename jadi **`syncOperation`**; field top-level `channelProductId` **dihapus** (id UPDATE/DELETE masuk
lewat channelAttribute, bukan field top-level — kontrak §3). *(Sync `@JsonIgnoreProperties(ignoreUnknown)`
membuat field lama yang null selama ini aman — tak ada regresi.)*

### G2 — populate operasi di `convertToSyncRequest`
Kini menyetel `.syncOperation(request.getOperation())` (CREATE/UPDATE; default CREATE) dan
`.deleted("DELETE"…)`. `request.operation` diisi oleh `ChannelPublishService.publishToChannel` (P0-2).

### G3 — id UPDATE/DELETE sebagai INPUT via channelAttribute (data-driven)
Untuk UPDATE/DELETE, `existingChannelProductId` di-inject ke **attribute yang di-target
`create_CP.response-update-to`** (mis. Shopee `id`) — di-resolve dari **metadata channel itu sendiri**
(`externalIdAttributeFrom(...)`, meniru resolusi sync), **tanpa nama per-channel yang di-hardcode**.
Bila tak ditemukan → log warning + tak inject (aman).

**File:** `SyncChannelProductRequest` (G1), `ChannelAttributeConverterService` (G2/G3 + helper).
**Test:** `ExternalIdAttributeResolutionTest` (4) — Shopee `id`, nested `product.id`, `in=variants`
diabaikan, malformed→null.

> Efek runtime **saat ini nol**: `channel-update-enabled=false` → UPDATE tak pernah di-dispatch
> (jadi BLOCKED). G1–G3 membuat wire-nya **benar untuk saat diaktifkan**.

### 2a. G4 — `update_CP` (update konten produk) untuk semua channel metadata-driven
`ChannelMetadataMigration` kini men-seed `workaction#update_CP` (`instruction.setup`) untuk **keempat**
channel yang punya metadata workflow. Sync membaca `update_CP` untuk UPDATE lewat activity yang sama
(pilih create/update via `resolveOperation`), composite key `instruction.setup:workaction#update_CP`
cocok. Migration **overwrite** metadata system-default → masuk ke DB existing saat restart (config
user-customised di-preserve).

| Channel | Endpoint update | Injeksi id (dari attribute — G3) |
|---|---|---|
| **Shopee** | `POST /product/update_item` | `item_id` di **body** (`inject`), attribute `id` |
| **Shopify** | `PUT /products/${product.id}.json` | id di **URL path**, attribute `product.id` |
| **WIX** | `PATCH /stores/products/${product.id}` | id di **URL path**, attribute `product.id` |
| **TikTok Shop** | `PUT /product/products/${product_id}` | id di **URL path + body** (`inject`), attribute `product_id` |

Auth/signature/body pass-through (`output:{}`) sama seperti `create_CP` masing-masing. Id-attribute
di-resolve G3 dari `create_CP.response-update-to` per-channel — **tanpa nama di-hardcode**.

**Test:** `ShopeeUpdateMetadataTest`, `ShopifyUpdateMetadataTest`, `WixTiktokUpdateMetadataTest` (termasuk
guard parameterized: **setiap** channel dengan `create_CP` wajib punya `update_CP`).

**Catatan cakupan:**
- **Konten produk saja.** Tersisa per channel: `update_CP_Variants` (harga/stok — mis. Shopee
  `update_price`/`update_stock`, butuh `model_id` per-SKU dari `variantChannelIds` yang penyimpanannya
  masih ditunda), `add_CP_Variants`/`delete_CP_Variants`, media update, `read_CP`/`restore_CP` (rollback).
- **Amazon/Walmart/eBay** belum punya metadata builder sama sekali (tak ada `create_CP`), jadi `update_CP`
  belum relevan sampai CREATE-nya di-author.
- **Wajib uji E2E di sandbox** (whitelist field yang ditolak endpoint update) **sebelum** flip flag.

### 2b. G5 — model_id tracking (fondasi) + variant diffing (murni)
Prasyarat update harga/stok per-varian: BFF harus tahu **channel model/variant id per SKU**. Fondasi (aditif,
forward-compat) sudah dibangun:

- **Capture (forward-compat):** `WorkflowStatusResponse.variantIds` (`@JsonAlias {variant_ids, variant_channel_ids,
  sku_model_ids}`) → `PublishProductResponse.variantChannelIds` → dipersist ke listing-state
  `channel_product_data.variantChannelIds` lewat `updateVariantChannelIds` **atomik terpisah** (di-set **hanya
  bila sync mengembalikannya** — tak null-clobber). Jalur sinkron **dan** reconciler mempersist. Absen hari ini
  (null) sampai sync surface — **butuh kontrak sync**: SyncState mengembalikan `variant_ids` (sku→model_id),
  polanya sama seperti `step_results`.
- **Diff (murni, teruji):** `VariantDiff.compute(desiredSkus, knownVariantChannelIds)` → `{toUpdate(sku→modelId),
  toAdd(sku), toDelete(sku→modelId)}` — BFF yang memutuskan delta (kontrak §5), sync eksekusi urut update→add→delete.

**Test:** `VariantDiffTest` (5) + `SyncApiContractTest` diperluas (deserialisasi `variant_ids` lewat decoder
WebClient asli).

**Tersisa:** (1) sync mengembalikan `variant_ids` di poll; (2) author metadata `update_CP_Variants`/`add_CP_Variants`/
`delete_CP_Variants` per channel (Shopee `update_price`/`update_stock`/`add_model`/`delete_model`, dst);
(3) route hasil `VariantDiff` ke sync request (variantGroups per aksi) di `ChannelPublishService`.

### 2c. G6 — Endpoint delist (DELETE)
`POST /api/v1/channels/publish/delist` `{masterProductId, storeId, organizationId}` →
`ChannelPublishService.delistProduct(...)`:
- Validasi **live** (`isDelistable`: status PUBLISHED + ada `channelProductId`) — else 409 "nothing to delist".
- Reuse resolusi store + kredензial (token refresh + `injectDecryptedCredentials`) + `doChannelSyncPublish`
  (rate-limit + POST + poll) seperti publish, **tanpa transform produk** (delete tak butuh konten).
- Kirim `syncOperation=DELETE` (+`deleted=true`) + id di-inject sebagai channelAttribute (G3); sync
  menjalankan `runDeleteFlow` → `delete_CP`. **404 di channel = sukses idempoten** (kontrak §9.3).
- Outcome: sukses → `markDelisted` (status **DELISTED**, `channelProductId` disimpan untuk audit) + history
  DELIST; gagal → **listing tetap live**, status **tidak** diubah, history saja; timeout (PROCESSING) →
  history saja, retry aman (idempoten).

**Test:** `DelistPreconditionTest` (2). Flow penuh = integration → **E2E**.

**⚠️ Caveat metadata delete per channel (E2E):** G3 meng-inject id ke attribute yang di-target
**`create_CP`** (mis. Shopee `id`, Shopify/WIX `product.id`, TikTok `product_id`). Beberapa `delete_CP` yang
sudah ada mungkin membaca id dari attribute berbeda — mis. **Shopee `delete_CP` body memakai `product.id`
sedangkan create menulis ke `id`** (inkonsistensi lama). Selaraskan attribute id create↔delete per channel
saat uji E2E delist. Shopify/WIX/TikTok konsisten (create & delete pakai attribute yang sama).

### 2d. G7 — UPDATE partial/rollback failure (jangan downgrade listing live)
Bahaya terbesar: UPDATE gagal (`UPDATE_FAILED`/`UPDATE_ROLLED_BACK` → syncStatus=FAILED) pada listing yang
**masih live** (UPDATE tak pernah menghapus). Jika BFF men-set status **FAILED**, publish berikutnya (P0-2)
menilai bukan-PUBLISHED → **CREATE → listing duplikat** — persis yang P0-2 cegah.

Penanganan (di `updateChannelProductStatus` jalur gagal **dan** `recordFailedOutcome` jalur exception):
- **operation=UPDATE + gagal → JANGAN downgrade.** Status tetap **PUBLISHED** (listing masih ada),
  `publishError` dicatat, history FAILED direkam.
- **Clear `lastPublishedContentHash`** (`recordUpdateFailureKeepingLive`). State konten kini tak pasti
  (mungkin partial) → publish berikutnya menghasilkan `intendedHash ≠ null-hash` → **UPDATE (retry)**, bukan
  NO-OP basi. Pilihan konservatif yang aman untuk forward-only maupun rolled-back (BFF tak bisa membedakan
  keduanya andal; `currentStep` = debug-only per kontrak §7).
- CREATE/DELETE gagal tetap seperti sebelumnya (CREATE → FAILED; DELETE → listing tetap live).

**Test:** `UpdateFailureRetryDecisionTest` (2) — state pasca-UPDATE-gagal (PUBLISHED + hash null) → keputusan
`UPDATE` (retry) / `UPDATE_BLOCKED`, **tak pernah CREATE atau NO-OP**.

---

## 3. Yang TERSISA — G4–G7 (+ safety)

| # | Gap | Kenapa penting |
|---|---|---|
| **G4** | **Author + seed metadata `update_CP`** per channel — ✅ **konten selesai untuk SEMUA channel metadata-driven** (Shopee, Shopify, WIX, TikTok Shop) (§2a); varian/harga/stok/media/rollback tersisa | Tanpa ini, UPDATE **SKIP diam-diam** (kontrak §4). **Beban terbesar** (kontrak §0.5). |
| **G5** | **model_id tracking + variant diffing** — 🟡 **fondasi selesai** (§2b): capture `variantChannelIds` (forward-compat) + `VariantDiff` murni; tersisa: sync mengembalikan `variant_ids`, author `*_CP_Variants` metadata, route diff ke request | Sync tak menghitung delta; BFF yang memutuskan (§5). |
| **G6** | **Endpoint delist** (DELETE) — ✅ **selesai** (§2c): `POST /channels/publish/delist` → `syncOperation=DELETE` + id-attribute (G3) → listing-state `DELISTED` + history DELIST | delete_CP metadata sudah ada; endpoint kini ada. |
| **G7** | Handle UPDATE **partial/rollback** — ✅ **selesai** (§2d): UPDATE gagal **tidak** men-downgrade listing live; hash di-clear → retry aman | Mencegah bug "UPDATE gagal → FAILED → publish berikutnya CREATE → duplikat". |

### ⚠️ Safety — jangan flip flag sampai G4
Karena BFF mengirim **`eventId` unik** dan (dulu) **tanpa `syncOperation`**, sync me-resolve **setiap**
dispatch sebagai **CREATE**. Bila `channel-update-enabled` di-flip **sebelum G4**, UPDATE yang dikirim tanpa
metadata `update_CP` akan menjalankan **create ulang = listing duplikat** — persis yang P0-2 cegah. Desain
fail-closed P0-2 (UPDATE→BLOCKED) menahan ini; G1–G3 kini benar, tapi **aktivasi menunggu G4 + G5**.

---

## 4. Urutan aktivasi UPDATE/DELETE

1. ✅ **G1–G3** (selesai) — wire operasi + id-input benar.
2. ✅ **G4** seed metadata `update_CP` (konten) — **selesai untuk semua channel metadata-driven**
   (Shopee/Shopify/WIX/TikTok) (§2a); varian/harga/stok/media/rollback tersisa.
3. **G4-lanjut** uji E2E update di sandbox per channel (whitelist field yang ditolak endpoint update).
4. 🟡 **G5** — fondasi (capture `variantChannelIds` + `VariantDiff`) selesai (§2b); tersisa: sync return
   `variant_ids`, metadata `*_CP_Variants`, route diff ke request.
5. **Flip** `app.publish.channel-update-enabled=true` + uji E2E per channel.
6. ✅ **G6** delist endpoint (§2c; E2E + selaraskan attribute id delete Shopee) · ✅ **G7** partial-failure handling (§2d).

> **Ringkasan status G1–G7:** ✅ G1–G4, G6, G7 · 🟡 G5 (fondasi tracking + diff; sisa: sync `variant_ids`,
> metadata `*_CP_Variants`, routing). Yang menghalangi flip flag: **E2E per channel** + **G5 lengkap**.

---

## 5. Status

- **Build:** `BUILD SUCCESS`. **Test G3:** `ExternalIdAttributeResolutionTest` (4) hijau; subset regresi
  publish tetap hijau.
- **Korelasi sesuai; jalur CREATE sesuai; UPDATE/DELETE wire benar (G1–G3) tapi belum diaktifkan** (menunggu
  G4/G5) — dan **aman** karena fail-closed.

> Catatan: ada dua berkas `07-*` di folder ini (`07-kontrak-bff-sync-service.md` milik tim + `07-p0-5-…`).
> Pertimbangkan me-rename salah satu untuk menghindari ambiguitas.
