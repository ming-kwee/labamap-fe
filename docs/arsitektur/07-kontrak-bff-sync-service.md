# Kontrak Integrasi BFF ⇄ Sync Service (Temporal) — CREATE / UPDATE / DELETE

> Referensi untuk **tim BFF**. Setelah Fase 1 (discriminator operasi), Fase 2 (UPDATE), dan Fase 3
> (variant diff + read-from-channel + snapshot rollback) live, dokumen ini merangkum **apa yang harus
> dikirim, apa yang akan diterima, dan perilaku apa yang harus di-desain** di sisi BFF.
>
> Latar: [`03`](03-sync-service-persistence-dan-per-hit-history.md) (step_results / publish_history),
> [`05`](05-rencana-mirror-update-delete-ke-temporal.md) (rencana), [`06`](06-read-from-channel-dan-snapshot-rollback.md)
> (snapshot rollback). **Semua perilaku channel digerakkan metadata JSON — bukan kode.** Beban terbesar
> di BFF = **meng-author metadata yang benar per channel per operasi.**

---

## 0. TL;DR — yang WAJIB diperhatikan BFF

1. **Pilih operasi lewat `syncOperation`** = `CREATE` | `UPDATE` | `DELETE` (case-insensitive). Absen →
   diturunkan dari `deleted` (backward-compatible).
2. **`eventId` = kunci idempotensi.** Operasi **baru** ke produk yang sama **harus** `eventId` baru.
   Re-kirim `eventId` sama → `ALREADY_PROCESSED` (no-op), **bukan** operasi kedua.
3. **UPDATE & DELETE**: `externalChannelProductId` (id produk di channel) adalah **INPUT** — BFF wajib
   mengisinya (produk sudah ada). Pada CREATE ia **OUTPUT** (dihasilkan sync).
4. **UPDATE tidak pernah menghapus produk live.** Gagal = **forward-only** (`UPDATE_FAILED`) atau
   **snapshot rollback** (`UPDATE_ROLLED_BACK`) — keduanya berujung `syncStatus=FAILED`, dan **update
   sebagian mungkin tertinggal**. BFF harus menanganinya (retry/alert), baca `step_results` untuk tahu
   step mana yang gagal.
5. **Author metadata per operasi** dengan key yang benar (`create_CP*` vs `update_CP*` vs `delete_CP`,
   dst — tabel §4). Salah key = step di-SKIP diam-diam.
6. **Persist `workflowId`** dari response POST untuk deep-link + korelasi `publish_history` (P0-1).
7. **step_results** yang dikembalikan sudah **ter-mask** (tanpa kredensial/raw body) → langsung boleh
   dipersist ke `publish_history`.

---

## 1. Endpoint & alur dasar

```
POST /sync_channel_product_impl        (body = SyncRequest)
   → 200 { "workflowId": "...", "entityId": "...", "status": "ACCEPTED" | "ALREADY_PROCESSED" }

GET  /channel_product_state?workflowId=sync-<eventId>     (atau ?eventId=... / ?id=...)
   → 200 { SyncState: syncStatus, externalChannelProductId, failureReason, step_results[], ... }
   → 404 kalau workflow tak ditemukan
```

Pola: **POST sekali → poll `GET` sampai `syncStatus` COMPLETED/FAILED.** `workflowId = "sync-" + (eventId
bila ada, else id)`.

---

## 2. Request contract (`SyncRequest`)

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `id` | string | ✅ | id entitas / channel product. Jadi `entityId`. |
| `eventId` | string | ✅ (disarankan) | **kunci idempotensi & workflowId**. Tiap operasi = eventId unik. |
| `syncOperation` | string | opsional | `CREATE`/`UPDATE`/`DELETE` (case-insensitive). Absen → dari `deleted`. |
| `deleted` | bool | opsional | legacy. `true` → DELETE bila `syncOperation` kosong. |
| `sku`, `storeId`, `channelId`, `productId` | string | — | identitas; di-echo di poll state. |
| `channelAttributes[]` | array | tergantung | atribut produk (termasuk **id produk channel** untuk UPDATE/DELETE). |
| `variantGroups[]`, `optionGroups[]` | array | tergantung | varian/opsi. |
| `channelCredentials[]` | array | ✅ (untuk call ber-auth) | token/secret channel. **Lihat §11 keamanan.** |
| `metadataGroups[]` | array | ✅ | instruksi per-step (channelMetadata: grouping/subGrouping/key/value). Inti perilaku. |

**Resolusi operasi (di sync):** `syncOperation` eksplisit menang (case-insensitive, trimmed); nilai tak
dikenal/kosong → fallback dari `deleted` (`true→DELETE`, else `CREATE`). Payload lama yang hanya kirim
`deleted` tetap jalan.

### Format composite key metadata
BFF mengirim tiap instruksi sebagai `channelMetadata` dengan `grouping` + `subGrouping` + `key`; sync
menggabung menjadi **`grouping.subGrouping:key`**. Contoh:
```
grouping="instruction", subGrouping="setup", key="workaction#update_CP"
   → "instruction.setup:workaction#update_CP"
grouping="instruction", subGrouping="prerequisite", key="workaction#update_CP_First_Pre"
   → "instruction.prerequisite:workaction#update_CP_First_Pre"
```

---

## 3. Aturan `externalChannelProductId` (INPUT vs OUTPUT) — sering salah

| Operasi | id produk channel |
|---|---|
| **CREATE** | **OUTPUT** — dihasilkan dari respons `create_CP` (`response-update-to` menulis ke attribute `id`). |
| **UPDATE** | **INPUT** — BFF **wajib** mengisi id (mis. attribute `id`) agar `update_CP`/`read_CP`/`restore_CP` bisa meng-inject-nya ke URL/body. |
| **DELETE** | **INPUT** — id dipakai `delete_CP` untuk menghapus produk yang benar. |

> Kalau UPDATE/DELETE dikirim tanpa id, sync tak tahu produk mana → gagal/no-op. Ini tanggung jawab BFF.

---

## 4. Metadata keys per operasi (yang harus di-author BFF)

Semua key di bawah adalah bagian `key` composite (`instruction.setup:workaction#...` kecuali prerequisite
= `instruction.prerequisite:...`). **Step yang key-nya absen otomatis SKIP** (tak error). Sync memilih
`create_*` vs `update_*` berdasar `syncOperation`.

### CREATE
| Key | Wajib | Fungsi |
|---|---|---|
| `workaction#create_CP` | ✅ | buat produk (menghasilkan id). |
| `workaction#create_CP_First_Pre` (prerequisite) | opsional | loop prasyarat. |
| `workaction#create_CP_Media_Pre` / `create_CP_Variants_Media_Pre` | opsional | upload gambar sebelum create. |
| `workaction#create_CP_Variants` (+ `create_CP_Variants_Init`) | opsional | buat varian (add_model / init_tier_variation). |
| `workaction#create_CP_Media` / `create_CP_Variants_Media` | opsional | attach gambar sesudah create. |

### UPDATE  *(reuse graph create; hanya key beda)*
| Key | Wajib | Fungsi |
|---|---|---|
| `workaction#update_CP` | ✅ (agar UPDATE bermakna) | update item utama (butuh id). |
| `workaction#update_CP_First_Pre` (prerequisite) | opsional | loop prasyarat update. |
| `workaction#update_CP_Media_Pre` / `update_CP_Variants_Media_Pre` | opsional | upload gambar baru. |
| `workaction#update_CP_Variants` | opsional | update model yang **sudah ada** (harga/stok). |
| `workaction#add_CP_Variants` | opsional | **tambah** model varian baru (Fase 3). |
| `workaction#delete_CP_Variants` | opsional | **hapus** model varian yang dibuang (Fase 3). |
| `workaction#update_CP_Media` / `update_CP_Variants_Media` | opsional | update/attach gambar. |
| `workaction#read_CP` | opsional | **baca snapshot sebelum mutasi** (aktifkan rollback). |
| `workaction#restore_CP` | opsional | **kembalikan snapshot** bila UPDATE gagal (butuh `read_CP` juga). |

### DELETE
| Key | Wajib | Fungsi |
|---|---|---|
| `workaction#delete_CP` | ✅ | hapus produk di channel (butuh id). 404 = sukses idempoten. |

### Metadata pendukung (semua operasi, bila relevan)
| Key | Kapan |
|---|---|
| `body.content:servflow#data_structure#info` | dibutuhkan langkah **varian** (menemukan struktur varian). |
| `body.content:servflow#response#success-check` | channel yang balas **HTTP 200 tapi error di body** (mis. Shopee `error`, TikTok `code`). **Wajib** agar error bisnis tak lolos sebagai sukses. |
| `integration.security:shared#serviceFunctions#partner-credential` | channel ber-**signature** (Shopee oauth2-hmacsha256). |

---

## 5. Diffing varian — BFF yang memutuskan add/update/delete

Sync **tidak** menghitung sendiri delta varian. **BFF menentukan** (karena BFF tahu desired end-state +
last-known state di DB-nya):
- model yang **berubah** (harga/stok) → taruh di `update_CP_Variants`.
- model **baru** → taruh di `add_CP_Variants`.
- model **dibuang** → taruh di `delete_CP_Variants`.

Urutan eksekusi sync: **update → add → delete** (delete terakhir agar produk tak sempat 0-model). Ketiga
key opsional; yang absen di-SKIP.

---

## 6. Snapshot rollback (opsional, opt-in) — apa yang BFF author

Rollback **hanya aktif** bila BFF mengirim **`read_CP` DAN `restore_CP`**. Kalau tidak, UPDATE tetap
**forward-only** (aman, tapi bisa tertinggal setengah-update). Rinci di [`06`](06-read-from-channel-dan-snapshot-rollback.md).

- **`read_CP`** = GET keadaan sekarang; `response-update-to`-nya **menyimpan field yang mau di-restore ke
  attribute** (mis. `snapshot_status`).
- **`restore_CP`** = update biasa yang **membaca attribute snapshot** untuk menulis balik.

Bentuk minimal:
```json
// read_CP
{ "endpoint": { "url": "https://.../get_item?item_id=${id}", "method": "GET" },
  "response-update-to": { "responsePaths": ["item_status"],
    "updatePaths": [ { "get": "item_status", "to": "snapshot_status", "in": "attribute" } ] } }

// restore_CP
{ "endpoint": { "url": "https://.../update_item", "method": "POST" },
  "body-reshape-to": { "inject": { "item_id": "id", "status": "snapshot_status" } } }
```
Catatan: **read yang gagal itu non-fatal** (update tetap dicoba); **restore best-effort** (bila restore
gagal, jatuh ke forward-only). *Field mana yang di-snapshot & cara restore = keputusan authoring BFF.*

---

## 7. Response POST & polling (`SyncState`)

### POST → 200
```json
{ "workflowId": "sync-<eventId>", "entityId": "<id>", "status": "ACCEPTED" | "ALREADY_PROCESSED" }
```
- `ACCEPTED` = workflow dimulai. `ALREADY_PROCESSED` = sudah ada run dengan workflowId itu (idempoten).
- **BFF wajib persist `workflowId`** (korelasi `publish_history`, deep-link Temporal).

### GET /channel_product_state → 200 `SyncState`
Field penting:
| Field JSON | Arti |
|---|---|
| `syncStatus` | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED` — **satu-satunya** sinyal lifecycle yang boleh dipakai BFF. |
| `externalChannelProductId` | id produk di channel (terisi setelah create; echo input untuk update/delete). |
| `failureReason` | ringkasan penyebab gagal (diisi saat FAILED). |
| `step_results[]` | riwayat per-hit ter-mask (lihat §8). Bertambah selama PROCESSING. |
| `currentStep` | nama step internal (debug saja — **jangan** dijadikan logika bisnis). |
| `id`,`sku`,`storeId`,`channelId`,`eventId`,`productId` | echo identitas. |

**Pemetaan `currentStep` → `syncStatus`** (untuk pemahaman; BFF cukup baca `syncStatus`):
| currentStep internal | syncStatus |
|---|---|
| `COMPLETED`, `DELETE_COMPLETED` | **COMPLETED** |
| `COMPENSATED`, `DELETE_COMPENSATED`, `CANCELLED`, `UPDATE_FAILED`, `UPDATE_ROLLED_BACK` | **FAILED** |
| `STARTING` | PENDING |
| lainnya (step berjalan) | PROCESSING |

> **`UPDATE_ROLLED_BACK` tetap FAILED** — update yang diminta tidak berhasil; hanya keadaan yang
> dikembalikan. Produk aman/utuh, tapi bagi BFF ini **kegagalan** (perlu retry/alert).

---

## 8. `step_results[]` (ter-mask) → `publish_history`

Tiap **hit** ke channel = satu entri. Sudah **tanpa kredensial & tanpa raw body** → aman dipersist.
Field (snake_case, cocok `@JsonAlias {step_results, step_history}` di BFF):

```json
{
  "step_name": "update_CP | media_pre_iteration_0 | add_rest_channel_product_variants | read_rest_channel_product | restore_rest_channel_product | ...",
  "status": "OK | ERROR | SKIP",         // SKIP tak direkam; hanya hit nyata
  "http_status": 429,                     // null bila tak ada round-trip HTTP
  "channel_success": false,
  "iteration_index": 0,                   // untuk step loop; null bila single-call
  "duration_ms": 850,
  "error_code": "RATE_LIMIT | CHANNEL_4XX | CHANNEL_5XX | SUCCESS_CHECK_FAILED | EXCEPTION",
  "error_message": "ringkasan (bukan body penuh)",
  "at": "2026-08-12T00:00:00Z"
}
```
Nama step baru yang relevan Fase 2/3: `read_rest_channel_product`, `restore_rest_channel_product`,
`add_rest_channel_product_variants`, `delete_rest_channel_product_variants`. BFF bisa memakai
`step_results` untuk menandai **partial update** dan menunjukkan step mana yang gagal di dashboard.

---

## 9. Jaminan perilaku yang harus di-desain BFF

1. **Idempotensi via eventId.** Re-POST eventId sama = `ALREADY_PROCESSED` (tak menjalankan ulang). Untuk
   operasi berikutnya pada produk yang sama (mis. create lalu update) → **eventId baru**.
2. **UPDATE forward-only / rollback → FAILED, bisa partial.** BFF harus memutuskan retry (dengan eventId
   baru) atau alert; jangan asumsikan "gagal = tak ada perubahan".
3. **DELETE 404 = sukses.** Menghapus produk yang sudah tak ada tetap `COMPLETED` (idempoten).
4. **read gagal ≠ update gagal.** Jangan panik bila `read_rest_channel_product` ERROR di step_results tapi
   sync COMPLETED.
5. **CREATE compensation menghapus produk;** UPDATE **tidak pernah**. Jangan tukar semantik.
6. **`success-check` wajib** untuk channel yang balas 200-with-error; tanpa itu, error bisnis lolos sebagai
   sukses palsu.

---

## 10. Checklist per operasi (actionable)

**CREATE**
- [ ] `syncOperation=CREATE` (atau kosong).
- [ ] metadata `create_CP` (+ opsional prereq/media/variants).
- [ ] jangan kirim id channel (akan dihasilkan).
- [ ] poll sampai COMPLETED → simpan `externalChannelProductId`.

**UPDATE**
- [ ] `syncOperation=UPDATE`, **eventId baru**.
- [ ] isi **id produk channel** di channelAttributes.
- [ ] metadata `update_CP` (+ opsional `update_CP_Variants`, `add_CP_Variants`, `delete_CP_Variants`, media).
- [ ] (opsional rollback) `read_CP` **dan** `restore_CP`.
- [ ] handle FAILED: cek `step_results`, putuskan retry(eventId baru)/alert.

**DELETE**
- [ ] `syncOperation=DELETE` (atau `deleted=true`), **eventId baru**.
- [ ] isi id produk channel.
- [ ] metadata `delete_CP`.
- [ ] 404 diperlakukan sukses — tak perlu retry.

---

## 11. Keamanan & masking

- **Payload request membawa kredensial** (`channelCredentials`, dan token/secret di metadata signature).
  Perlakukan sebagai rahasia; sync me-log payload penuh **hanya** untuk debug lokal (ada peringatan di
  kode) — jangan aktifkan log itu di lingkungan bersama.
- **`step_results` sudah bersih**: tak ada kredensial, tak ada body respons mentah (hanya `error_message`
  ringkas). Aman disimpan/ditampilkan.

---

## 12. Yang BELUM ada — jangan diandalkan BFF

- **Auto set-diffing varian**: sync **tidak** menghitung sendiri model mana add/update/delete. BFF yang
  memutuskan via metadata (§5). (Fondasi read sudah ada, tapi logika diff otomatis belum.)
- **Restore reshape & full-replace media**: bergantung metadata yang di-author + **belum terverifikasi
  E2E** terhadap channel nyata. Uji per-channel sebelum produksi.
- **Multipart image upload Shopee (`create_CP_Media_Pre`)** belum diport (lihat catatan Shopee di memori
  proyek) — add_item Shopee butuh ImageIdList, jadi Shopee create penuh masih terhambat itu.

---

## 13. Ringkasan satu paragraf (untuk BFF)

Kirim `SyncRequest` dengan `syncOperation` + `eventId` unik; untuk UPDATE/DELETE **sertakan id produk
channel**. Author metadata `create_*`/`update_*`/`delete_*` yang sesuai (step tanpa metadata di-SKIP).
Untuk rollback UPDATE, kirim `read_CP`+`restore_CP` (opt-in). POST balas `{workflowId, entityId, status}`
— **persist workflowId**. Poll `GET /channel_product_state`, baca **`syncStatus`** (bukan `currentStep`)
dan **`step_results`** (ter-mask, langsung ke `publish_history`). Ingat: **UPDATE tak pernah menghapus
produk live**, gagalnya bisa **partial** → tangani retry/alert dengan **eventId baru**.
