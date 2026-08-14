# Mode B — `PER_MODEL_BUCKETS`: penjelasan detail + flowchart + peta kelas

> **Untuk siapa:** siapa pun yang mau paham **bagaimana UPDATE variant bekerja pada channel yang punya
> endpoint model terpisah** (Shopee / TikTok / WIX), dari klik "Publish" di BFF sampai panggilan
> `add_model`/`update_price`/`delete_model` di channel — kelas demi kelas.
> **Prasyarat:** baca [`01-update-diff-engine.md`](01-update-diff-engine.md) §0–§3 dulu (konsep desired vs
> known, round-trip id). Dokumen ini memperbesar **hanya Mode B**.
> **Status:** framework BFF + sisi-sync **siap & teruji**; sisa = authoring metadata Shopee (lihat §9). Semua
> dormant di balik `channelUpdateEnabled=false`.

---

## 1. Mode A vs Mode B dalam satu kalimat

- **Mode A (`RECONCILE_IN_ITEM`, Shopify):** kirim **seluruh** `variants[]` dalam satu panggilan update produk;
  **channel** yang memutuskan mana update/create/delete berdasarkan ada/tidaknya `id`.
- **Mode B (`PER_MODEL_BUCKETS`, Shopee/TikTok/WIX):** channel **tidak** punya "update produk yang menelan
  variants[]". Tiap variant diurus **endpoint model terpisah** (`add_model`, `update_price`/`update_stock`,
  `delete_model`). Jadi **BFF + sync** yang harus memecah variant ke tiga *bucket* dan memanggil endpoint yang
  benar untuk tiap bucket.

Inti Mode B = **"variant mana masuk bucket mana"**, dan itu ditentukan oleh **satu sinyal**: *apakah variant
sudah punya `model_id` di channel?*

```
punya model_id   → variant SUDAH ada di channel → bucket UPDATE  (update_price/update_stock)
tak punya model_id → variant BARU                → bucket ADD     (add_model)
ada di channel tapi tak lagi diinginkan → bucket DELETE (delete_model)
```

---

## 2. Kenapa "punya model_id atau tidak" bisa jadi sinyal — rantai round-trip id

Sinyal itu hanya ada kalau BFF **mengingat** `model_id` tiap variant dari publish sebelumnya. Itulah
**DiffEngine P0 (round-trip id)**:

```
CREATE pertama:
  add_model → channel balas model_id per sku
    → sync tulis balik ke command (response-update-to, match by model_sku)
      → sync surface  sku → model_id  di SyncState.variantIds  (baca metadata idtracking#variants)
        → BFF simpan ke listing-state.variantChannelIds   ← INGATAN
```

Pada UPDATE berikutnya, `variantChannelIds` inilah "known state" yang dibandingkan dengan "desired state".

---

## 3. Flowchart utama — dari Publish sampai channel (Mode B)

```mermaid
flowchart TD
  A["POST /channels/publish<br/>(masterProductId, storeId)"] --> B["ChannelPublishService<br/>.resolveStoreAndPublish"]
  B --> C["ensureMasterProductData<br/>+ loadAndMergeChannelData<br/>(hydrate + merge Step-2)"]
  C --> D["publishToChannel"]
  D --> E["getListingState<br/>(ChannelProductDataService)"]
  E --> F["PublishOperationDecider.decide<br/>+ gate: variantUpdateMode?"]
  F -->|NOOP| Z1["stop — tak sentuh channel"]
  F -->|UPDATE_BLOCKED<br/>(mode tak wired / flag off)| Z2["stop — listing tetap live"]
  F -->|UPDATE, PER_MODEL_BUCKETS| G["set existingVariantChannelIds<br/>= state.variantChannelIds"]
  G --> H["ChannelAttributeConverterService<br/>.convertToSyncRequest"]
  H --> H1["buildVariantGroups<br/>(desired variants + placeholder id kosong)"]
  H1 --> H2["injectModeFor → Mode.BUCKETS<br/>VariantModelIdInjector.inject"]
  H2 --> H3{"per variant, by sku"}
  H3 -->|known| H4["isi model_id + jadikan body field"]
  H3 -->|baru| H5["biarkan id KOSONG<br/>(sinyal add-bucket)"]
  H2 --> I["SyncChannelProductRequest<br/>(variantGroups + metadataGroups)"]
  I --> J["POST /sync_channel_product_impl<br/>(sync service)"]

  subgraph SYNC["Sync service (Temporal / Kalix)"]
    J --> K["ChannelProductWorkflowImpl<br/>route: UPDATE"]
    K --> L1["update bucket:<br/>createRestChannelProductVariants"]
    L1 --> M1["keepVariantGroupsByModelId(keepExisting=true)<br/>→ hanya variant ber-model_id"]
    M1 --> N1["update_price + update_stock"]
    K --> L2["add bucket:<br/>addRestChannelProductVariants"]
    L2 --> M2["keepVariantGroupsByModelId(keepExisting=false)<br/>→ hanya variant tanpa model_id"]
    M2 --> N2["add_model → model_id baru"]
    K --> L3["delete bucket:<br/>deleteRestChannelProductVariants"]
    L3 --> N3["delete_model (to-delete ids via body-reshape)"]
  end

  N2 --> O["response-update-to<br/>tulis balik model_id baru"]
  O --> P["SyncState.variantIds<br/>(sku→model_id)"]
  P --> Q["BFF poll → persistChannelIds<br/>→ listing-state.variantChannelIds diperbarui"]
```

Urutan eksekusi di dalam sync: **update → add → delete** (delete terakhir agar produk tak pernah sesaat
0-model).

---

## 4. Bagian BFF — kelas demi kelas (pelan)

### 4.1 `ChannelPublishService` — orkestrator + gerbang
- **`resolveStoreAndPublish`** — pipeline utama: hydrate master (`ensureMasterProductData`), merge override
  Step-2 (`loadAndMergeChannelData`), lalu `publishToChannel`.
- **`publishToChannel`** — baca listing-state (`getListingState`) → panggil **decider** → gate:
  ```java
  String vum = channelConfig.getVariantUpdateMode();               // "PER_MODEL_BUCKETS"
  boolean updateCapable = channelUpdateEnabled
        && ("RECONCILE_IN_ITEM".equals(vum) || "PER_MODEL_BUCKETS".equals(vum));
  ```
  Kalau `UPDATE`: **`request.setExistingVariantChannelIds(state.getVariantChannelIds())`** — inilah "known
  state" yang diteruskan ke converter.
- **`persistChannelIds`** (setelah publish sukses) — simpan `sku→model_id` (+ `imageChannelIds`) hasil poll ke
  listing-state → menutup loop untuk UPDATE berikutnya.

### 4.2 `PublishOperationDecider` — CREATE / NOOP / UPDATE / UPDATE_BLOCKED
Fungsi murni: listing hidup + hash sama → **NOOP**; hidup + berubah + `updateCapable` → **UPDATE**; berubah tapi
tak capable → **UPDATE_BLOCKED** (fail-closed, listing tetap live).

### 4.3 `ChannelConfiguration.variantUpdateMode` — data, bukan kode
Di-seed `"PER_MODEL_BUCKETS"` untuk Shopee/TikTok/WIX di **`ChannelConfigurationDataLoader`**. Ini satu-satunya
"tahu channel" — dan itu **data**, dibaca runtime, bukan `if channel==...`.

### 4.4 `ChannelAttributeConverterService` — merakit sync request
- **`buildVariantGroups`** — ubah `variants[]` desired → `VariantGroup[]`; tiap variant punya field
  `skus.model_id` (placeholder kosong dari rule seed, mis. `shopee-seed-model-id`).
- **`injectModeFor(variantUpdateMode)`** → `Mode.BUCKETS`.
- **`resolveVariantIdtracking(channelConfig)`** — baca metadata `idtracking#variants` → `[skuField, idField]`
  (Shopee: `skus.model_sku`, `skus.model_id`). Data-driven; nama field tak di-hardcode.
- **`buildMetadataGroups`** — forward SEMUA workaction metadata (termasuk `update_CP_Variants(_Add/_Delete)`)
  ke request apa adanya.

### 4.5 `VariantModelIdInjector` (`Mode.BUCKETS`) — inti Mode B di BFF
Untuk tiap variant, dipetakan by sku ke `existingVariantChannelIds`:

| Kondisi | Aksi | Kenapa |
|---|---|---|
| **known** (sku punya model_id) | isi `skus.model_id` + `isSupportField=false` | supaya masuk body → filter update-bucket menangkapnya, body-reshape `update_price/stock` bisa baca |
| **baru** (sku tak dikenal) | **biarkan `model_id` kosong** | kekosongan = sinyal add-bucket (kebalikan Mode A yang membuangnya) |
| id sudah terisi | biarkan | sudah benar |

> **Perbedaan tunggal Mode A vs B ada di baris "baru":** RECONCILE **buang** id kosong (channel reconcile
> butuh id absen); BUCKETS **pertahankan** id kosong (filter sync butuh "tanpa model_id" sebagai penanda baru).

### 4.6 Fondasi diff (dipakai untuk keputusan & to-delete)
- **`DesiredStateExtractor`** — `masterProductData` (merged) → desired sets (variant by sku + hash).
- **`ResourceDiffEngine`** — desired vs known → Ops (add/update/delete/noop). Generik.
- **`PublishDiffPlanner`** — bungkus keduanya → `Plan`. `Plan.variants().toDelete()` = `sku→model_id` yang
  harus dihapus (inilah sumber to-delete ids untuk `delete_model`).

### 4.7 `ChannelProductData` (+ service/repo) — ingatan
Field kunci Mode B: **`variantChannelIds`** (`sku→model_id`), `variantContentHashes` (skip NOOP). Ditulis oleh
`updateVariantChannelIds` / `persistChannelIds`, dibaca saat menyusun UPDATE.

---

## 5. Bagian Sync — kelas demi kelas (Temporal, Kalix paritas)

### 5.1 `ChannelProductWorkflowImpl` — urutan step UPDATE
```
create/update bucket : createRestChannelProductVariants   (existing → update_price/stock)
add bucket           : addRestChannelProductVariants       (baru → add_model)     [runVariantDiffStep add]
delete bucket        : deleteRestChannelProductVariants     (dibuang → delete_model)[runVariantDiffStep delete]
```
Add sebelum delete → produk tak pernah 0-model.

### 5.2 `ChannelProductActivitiesImpl` — filter bucket (inti Mode B di sync)
- **`keepVariantGroupsByModelId(cmd, modelIdField, keepExisting)`** — salin command, simpan hanya variant group
  yang **punya** (`true`) atau **tak punya** (`false`) model_id di `modelIdField`.
- **`readDiffIdField(cmd, key)`** — baca `diff-id-field` dari metadata workaction (mis. `skus.model_id`).
- Pemakaian:
  - `createRestChannelProductVariants` (update): UPDATE + `diff-id-field` → `keepExisting=true` → SKIP bila kosong.
  - `addRestChannelProductVariants` (add): `keepExisting=false` → SKIP bila tak ada `diff-id-field`/tak ada baru.
  - `deleteRestChannelProductVariants` (delete): tak filter — to-delete ids via body-reshape.

### 5.3 `Create_CP_Variants` — fan-out per-sku
Endpoint/verb/body dari metadata key yang diberikan (parameterized). Satu service melayani
create/update/add/delete — bedanya cuma **key metadata + hasil filter**.

### 5.4 `SyncState` (Temporal) / `ChannelProductState` (Kalix) — surface id
`variantIds` diisi `captureVariantIds` (Temporal) / `extractVariantIds` (Kalix) dari metadata
`idtracking#variants` → dikembalikan ke BFF di poll.

### 5.5 Divergensi Kalix (paritas nama)
Kalix punya filter yang sama (`keepVariantGroupsByModelId`) tapi memakai reuse-graph `update_*→create_*`. Nama
key **sudah diselaraskan ke gaya B** (`update_CP_Variants_Add/_Delete`) di kedua repo — lihat §7.2 doc utama.

---

## 6. Peta kelas ringkas (siapa melakukan apa)

| Lapisan | Kelas | Peran di Mode B |
|---|---|---|
| BFF | `ChannelPublishService` | orkestrasi, gate `updateCapable`, set `existingVariantChannelIds`, `persistChannelIds` |
| BFF | `PublishOperationDecider` | CREATE/NOOP/UPDATE/UPDATE_BLOCKED |
| BFF | `ChannelConfiguration.variantUpdateMode` | label `PER_MODEL_BUCKETS` (data) |
| BFF | `ChannelAttributeConverterService` | rakit request, `injectModeFor`, `resolveVariantIdtracking`, `buildVariantGroups`, `buildMetadataGroups` |
| BFF | **`VariantModelIdInjector` (BUCKETS)** | isi id known / pertahankan id kosong utk baru |
| BFF | `DesiredStateExtractor` / `ResourceDiffEngine` / `PublishDiffPlanner` | desired vs known → Ops; sumber to-delete |
| BFF | `ChannelProductData` (+ service/repo) | `variantChannelIds` (ingatan), hash |
| BFF | `ChannelMetadataMigration` | seed `update_CP_Variants(_Add/_Delete)` + `diff-id-field` (per channel) |
| Sync | `ChannelProductWorkflowImpl` | urutan update→add→delete |
| Sync | **`ChannelProductActivitiesImpl`** | `keepVariantGroupsByModelId`, `readDiffIdField` (filter bucket) |
| Sync | `Create_CP_Variants` | fan-out per-sku, endpoint dari metadata |
| Sync | `SyncState`/`ChannelProductState` | surface `variantIds` |

---

## 7. Walkthrough skenario (3 variant: A tetap, B ubah harga, hapus C, tambah D)

Known (listing-state): `variantChannelIds = {A:mA, B:mB, C:mC}`. Desired (master): A, B(harga baru), D.

```
1. PublishDiffPlanner.plan:
     toUpdate {B:mB}   (hash beda)      noop {A}      toAdd [D]     toDelete {C:mC}
2. ChannelAttributeConverterService (Mode.BUCKETS) menyusun variantGroups desired [A,B,D]:
     A → skus.model_id = mA  (known, body field)
     B → skus.model_id = mB  (known, body field)
     D → skus.model_id = ""   (baru, KOSONG dipertahankan)
   (C tak ada di desired → to-delete disuplai terpisah: mC)
3. Sync:
     update bucket  keepExisting=true  → {A,B}  → update_price/update_stock (mA,mB)
     add bucket     keepExisting=false → {D}    → add_model → model_id mD
     delete bucket                      → {mC}  → delete_model
4. add_model balas mD → response-update-to → SyncState.variantIds {D:mD}
5. BFF persistChannelIds → variantChannelIds = {A:mA, B:mB, D:mD}   (C hilang, D masuk)
```

> Catatan: variant **A** (noop) tetap ikut ke update bucket pada scaffold saat ini (di-update ulang tanpa
> perubahan — aman/idempoten). Optimisasi "skip noop by hash" di update bucket adalah penyempurnaan opsional
> (P6 per-resource), bukan syarat kebenaran.

---

## 8. Peta metadata (yang BFF kirim per bucket)

| Workaction key | Endpoint Shopee | `diff-id-field` | Filter sync |
|---|---|---|---|
| `workaction#update_CP_Variants` | `update_price` + `update_stock` | `skus.model_id` | keepExisting=true |
| `workaction#update_CP_Variants_Add` | `add_model` | `skus.model_id` | keepExisting=false |
| `workaction#update_CP_Variants_Delete` | `delete_model` | — | to-delete via body-reshape |
| `instruction.setup:idtracking#variants` | — (surface id) | `{key:skus.model_sku, id:skus.model_id}` | — |

Endpoint terverifikasi + body: lihat doc utama **§7.4**.

### 8.1 Payload Shopee TERKONFIRMASI (dari tim, 2026-08) + fork desain update-bucket

Payload berikut **dikonfirmasi** (bukan lagi tebakan) — siap dijadikan `body-reshape-to`:

```jsonc
// update_price  — POST /api/v2/product/update_price
{ "item_id": <id>, "price_list": [ { "model_id": <mid>, "original_price": <num> } ] }

// update_stock  — POST /api/v2/product/update_stock   (seller_stock butuh location_id!)
{ "item_id": <id>, "stock_list": [ { "model_id": <mid>, "seller_stock": [ { "location_id": "<loc>", "stock": <int> } ] } ] }

// add_model     — POST /api/v2/product/add_model      (item_id di-inject spt create_CP_Variants)
{ "item_id": <id>, "model_list": [ { "model_sku": "<sku>", "original_price": <num>,
    "seller_stock": [ { "location_id": "<loc>", "stock": <int> } ], "gtin_code": "<g>", "weight": <num> } ] }

// update_tier_variation — POST /api/v2/product/update_tier_variation  (utk OPSI baru / assign tier_index)
{ "item_id": <id>, "model_list": [ { "model_id": <mid>, "tier_index": [<i>] } ], "standardise_tier_variation": [ ... ] }
```

**FORK DESAIN — bucket `update_CP_Variants` = DUA endpoint (`update_price` + `update_stock`).**
Variant-service sync (`Create_CP_Variants.createChannelProductVariants` → `getCertainMetadataFromHashmapMetadata`)
membaca **SATU** objek instruksi (`workingNode.get(ENDPOINT)`) — **tidak loop array**. Jadi satu key
`update_CP_Variants` tak bisa memuat dua endpoint sekaligus tanpa keputusan:

| Opsi | Cara | Biaya |
|---|---|---|
| **A. Dua workaction step** | pecah jadi `update_CP_Variants` (→ update_price) + step baru `update_CP_Variants_Stock` (→ update_stock); workflow panggil dua-duanya | perubahan **sync** (workflow+activity+constant, 2 repo) — additive, ikut pola "1 workaction = 1 endpoint" |
| **B. Array-loop di service** | jadikan value `update_CP_Variants` array `[update_price, update_stock]`, service loop | perubahan **sync** lebih dalam (ubah service fan-out) |
| **C. v1 = harga saja** | `update_CP_Variants` → update_price; stok lewat sync inventory terpisah (bukan DiffEngine) | nol perubahan sync, tapi perubahan **stok** variant tak ikut UPDATE (content-hash harus kecualikan stok agar tak NOOP-salah) |

**Rekomendasi: Opsi A** — paling konsisten dgn arsitektur "satu workaction = satu endpoint" yang sudah ada,
additive, dan mudah dipahami. Butuh keputusan karena mengubah kontrak sync (2 repo).

**`delete_model` — payload TERKONFIRMASI** (POST `/api/v2/product/delete_model`, `{item_id, model_id}`,
satu model per call). **Tapi kontrak to-delete = fork desain (BELUM di-seed — berbahaya tanpa ini):**

Sync delete-bucket (`deleteRestChannelProductVariants` → `Create_CP_Variants`, `from:skus`) mem-fan-out
delete atas **variantGroups di command** — yaitu variant **DESIRED** (yang mau dipertahankan). Kalau
di-seed apa adanya + enable → **menghapus variant yang ingin disimpan.** Akar: "delete" = *punya model_id
TAPI tak lagi desired* — sinyal "punya model_id" (yang memisah update vs add) **tak bisa** memisah update
vs delete. Butuh sinyal/kanal terpisah untuk to-delete (`known − desired`, dari `PublishDiffPlanner.toDelete`):

| Opsi to-delete | Cara | Biaya |
|---|---|---|
| **1. Marker `_diff_op=DELETE`** | BFF append variantGroup sintetis (model_id + marker) utk tiap to-delete; sync: update/stock exclude marker, delete keep-only-marker | ubah filter sync (2 repo) + BFF (converter hitung `known−desired`) — minimal, reuse `from:skus` |
| **2. Atribut list + loop** | BFF stage to-delete model_ids sbg channelAttribute; delete-bucket loop baca atribut (bukan variantGroups) | jalur eksekusi delete baru di sync (2 repo) — pemisahan paling bersih, lebih invasif |
| **3. Sync request delete terpisah** | BFF kirim operasi sync khusus delete (mini-request per to-delete) | orkestrasi berubah (banyak call sync/publish); buckets tetap bersih |

**Dipilih & DIIMPLEMENTASI: Opsi 1 (marker).** Alur:
- **BFF** (`VariantDeleteMarker`, teruji): untuk UPDATE PER_MODEL_BUCKETS, append variantGroup sintetis per
  `known − desired` = `{idField=model_id, opField="DELETE"}`. `opField` dari `idtracking#variants.op`
  (Shopee: `skus._diff_op`). Di-wire di `ChannelAttributeConverterService`. Seed `update_CP_Variants_Delete`
  → `delete_model {item_id, model_id}` (satu call per model).
- **Sync (Temporal + Kalix)** — `keepVariantGroupsByOpMarker(opField, keepMarked)` + `readVariantOpField`
  (baca `idtracking#variants.op`):
  - update + stock bucket: setelah keepExisting=true, **drop** DELETE-marked (jangan update model yg mau dihapus).
  - delete bucket: **keep-only** DELETE-marked → `delete_model`; SKIP bila tak ada.
  - add bucket: DELETE-marked punya model_id → sudah otomatis tak masuk.
- `DIFF_OP_DELETE="DELETE"` = konstanta protokol bersama; field name data-driven. Dormant di balik flag.

Menutup lubang bahaya: delete-bucket kini **hanya** menyentuh yang eksplisit ditandai, tak pernah variant desired.

**Nuansa `add_model`:** menambah model dgn **opsi yang sudah ada** cukup `add_model`. Menambah **nilai opsi
baru** (mis. warna baru) perlu `update_tier_variation` dulu → kasus lanjutan, tandai terpisah.

---

## 9. Apa yang SUDAH vs BELUM (status jujur)

**Sudah (teruji, dormant):**
- Sync: filter `keepVariantGroupsByModelId` + bucket add/update/delete (Temporal & Kalix, nama selaras).
- **Sync (Temporal + Kalix): step `update_CP_Variants_Stock`** (Opsi A) — endpoint kedua utk existing
  variant, keepExisting=true, forward-only; urutan update_price→update_stock→add→delete. Temporal:
  `updateStockRestChannelProductVariants`. Kalix: step-graph `update_rest_channel_product_variants_stock`
  (proto rpc + reuse-graph alias `create_CP_Variants_Stock`). **Paritas penuh.**
- **BFF: seed Shopee** `update_CP_Variants` (update_price), `update_CP_Variants_Stock` (update_stock),
  `update_CP_Variants_Add` (add_model) — semua `diff-id-field=skus.model_id`, body-reshape reuse mesin
  verified add_model. JSON tervalidasi.
- BFF: injeksi model-id `Mode.BUCKETS`, gate `PER_MODEL_BUCKETS`, label 3 channel, fondasi diff/planner, P0 id
  round-trip untuk variant.

**Payload Shopee TERKONFIRMASI** (§8.1): `update_price`, `update_stock` (seller_stock+location_id),
`add_model`, `update_tier_variation`. `delete_model` masih menunggu.

- **Delete bucket (marker `_diff_op=DELETE`)** — BFF `VariantDeleteMarker` (append known−desired) + seed
  `update_CP_Variants_Delete` (delete_model); sync filter op-marker (Temporal + Kalix, paritas). Teruji.

**Belum:**
2. **Nuansa opsi-baru** (`add_model` + `update_tier_variation`) untuk nilai opsi baru — follow-up.
3. **E2E Shopee** (verify body-reshape price/stock/add vs channel nyata) → flip `channelUpdateEnabled`.

*(Kalix parity untuk stock step: **selesai** — sudah pindah ke "Sudah" di atas.)*

> Semua yang tersisa = **authoring metadata channel-spesifik + verifikasi**, bukan lagi kode generik. Framework
> Mode B (BFF + sync) sudah lengkap.

---

## 10. Ringkas satu paragraf

Mode B memecah UPDATE variant ke tiga bucket (**update / add / delete**) karena channel-nya (Shopee/TikTok/WIX)
mengurus variant lewat endpoint model terpisah. Sinyal pemisah = **ada/tidaknya `model_id`** tiap variant,
yang BFF ingat di `listing-state.variantChannelIds` (hasil round-trip id P0). BFF (`VariantModelIdInjector`
mode BUCKETS) mengisi model_id untuk variant dikenal dan **membiarkan kosong** untuk yang baru; sync
(`keepVariantGroupsByModelId`) memfilter variant ke bucket berdasarkan sinyal itu, lalu `Create_CP_Variants`
memanggil endpoint channel dari metadata. Semua channel-spesifik ada di **metadata** (`update_CP_Variants*` +
`idtracking#variants` + `diff-id-field`), runtime nol pengetahuan channel. Yang tersisa untuk go-live Shopee =
mengarang metadata `update_price/update_stock/delete_model` dengan **payload terverifikasi** + E2E.
