# Update-Media — Runbook E2E Shopify

> **Untuk operator.** Langkah menjalankan E2E **update-media Shopify** (M1–M3): round-trip `image_id`,
> tambah gambar baru saja, hapus gambar yang dibuang — dari nol sampai verifikasi. Ini **menulis ke store
> Shopify sungguhan** dan **membalik flag** — jalankan sadar & dengan rollback siap. Desain + status:
> [`05-shopify-update-media.md`](05-shopify-update-media.md). Pre-flight otomatis sudah hijau (§9); ini
> membuktikan di channel nyata.

---

## 0. Pra-syarat (sekali)

- Stack hidup: **BFF (port 8888)** + **sync Temporal (`:9000`)** + **MongoDB**.
- **Jaringan host-sync → Shopify harus lancar.** Insiden awal menunjukkan `POST/PUT https://labamap.myshopify.com`
  **timeout** dari host sync (firewall/proxy — `java.net.http` abai env proxy). Pastikan `curl -m 20
  https://labamap.myshopify.com/admin/api/2024-01/products.json -H "X-Shopify-Access-Token: …"` dari host sync
  **berhasil** dulu; kalau timeout, E2E gagal di layer jaringan, bukan logika.
- Store Shopify terhubung (token `shpat_…`), flag update dicatat nilai awalnya.
- **Rebuild + restart** BFF **dan** sync setelah menarik commit M1–M3 (agar migration men-seed metadata media &
  sync memuat `Delete_CP_Media` + capture id).

## 1. Verifikasi seed masuk DB (nol tulis-channel)

Setelah boot, cek dokumen config Shopify memuat kontrak media M1–M3:

```js
db.channel_configurations.findOne(
  { channelId: "shopify" },
  { "channelMetadataList.key": 1 }
)
```
Harus ada key: `idtracking#images` (M1), `workaction#update_CP_Media` (M2), `workaction#delete_CP_Media` (M3),
di samping `workaction#create_CP_Media` yang lama.

Cek isi (opsional):
```js
// M1: field respons yang di-round-trip
db.channel_configurations.aggregate([
  { $match: { channelId: "shopify" } },
  { $unwind: "$channelMetadataList" },
  { $match: { "channelMetadataList.key": { $in: ["idtracking#images","workaction#delete_CP_Media"] } } },
  { $project: { _id:0, key:"$channelMetadataList.key", value:"$channelMetadataList.value" } }
])
```
`idtracking#images` → `{"srcKey":"image.src","id":"image.id"}`; `delete_CP_Media` url memuat
`/images/${image_id}.json` (DELETE) + `from: product.delete_image_ids`.

> Migration hanya **overwrite metadata system-default**. Kalau config Shopify sudah di-customise (bukan
> system-default) → migration **skip** → tiga key baru **tak** masuk. Set balik ke system-default lalu restart,
> atau tambah item manual.

## 2. CREATE — baseline + isi `imageChannelIds` (GERBANG M1)

Publish **CREATE** satu produk ber-gambar (≥2 gambar: main + gallery) lewat alur normal (flag update masih OFF).
Verifikasi round-trip id gambar:

- Log sync: `[captureMediaIds] captured N image id(s) via …idtracking#images` + `[workflow] captured N image id(s)`.
- DB:
```js
db.channel_product_data.findOne(
  { masterProductId: "<id>", storeId: "<store>" },
  { imageChannelIds: 1, status: 1 }
)
```
`imageChannelIds` harus terisi `stem → shopifyImageId` (mis. `"main-1786…-195cf62a": "64768…"`). **Kalau kosong,
STOP** — M1 belum nyambung; semua diff butuh peta ini. Cek: `idtracking#images` sampai? respons media punya
`image.src`/`image.id`? stem ter-ekstrak (bandingkan dengan `imageChannelIds` key)?

> **Wajib produk BARU.** Produk yang dibuat **sebelum** M1 tak punya baseline → add-only sengaja **skip** (0 POST)
> & delete kosong. Untuk menguji, buat produk fresh di sini.

## 3. Aktifkan UPDATE (flag)

```
app.publish.channel-update-enabled = true      (APP_PUBLISH_CHANNEL_UPDATE_ENABLED=true)
```
Restart/refresh BFF. Ini saklar yang membuka tulis-UPDATE ke channel. **Catat** nilai awal untuk rollback.

## 4. Skenario uji (jalankan satu per satu; amati log BFF + sync + Shopify)

Baseline (dari §2) misal punya gambar **I1, I2**. Ubah `masterProductData` (daftar gambar) lalu **publish ulang**
(UPDATE):

| # | Aksi | Ubah di master | Ekspektasi panggilan Shopify | Ekspektasi hasil |
|---|---|---|---|---|
| T1 | **Tambah** I3 | +1 URL gambar baru | **1×** `POST …/products/{id}/images.json` (hanya I3) | 3 gambar; `imageChannelIds` +I3 |
| T2 | **Hapus** I2 | buang URL I2 | **1×** `DELETE …/images/{I2.id}.json` | 2 gambar (I1,I3); `imageChannelIds` −I2 |
| T3 | **Campur** | hapus I1, tambah I4 | **1×** `POST` (I4) **+ 1×** `DELETE` (I1.id) | gambar {I3,I4}; peta sinkron |
| T4 | **Tanpa ubah gambar** (ubah field lain) | mis. title | **0** POST media, **0** DELETE media (PUT produk tetap jalan) | gambar utuh |

**Yang HARUS diamati di log:**
- BFF (add): `M2 image add-only: X of Y source image(s) are new` — X = jumlah gambar baru saja.
- Sync (add): `[activity] createRestChannelProductMedia` → `POST …/images.json` **hanya** untuk gambar baru +
  `[captureMediaIds] captured X` (id gambar baru ter-round-trip).
- BFF (delete): `M3 image delete: Z removed image(s)`.
- Sync (delete): `[activity] deleteRestChannelProductMedia` → `DELETE MEDIA EXEC SEQUENTIAL - Z image(s)` →
  `Z×` `DELETE …/images/{id}.json`.

**Cek keras (paling penting):**
1. **Tak ada re-POST gambar lama.** Pada T1, `POST /images.json` **hanya** untuk I3 — bukan I1/I2. Kalau I1/I2
   ikut di-POST → **STOP + flag OFF** (regresi append; cek `M2 image add-only` count & `imageChannelIds` baseline).
2. **DELETE hanya menyasar id yang dibuang.** Pada T2/T3, `DELETE /images/{id}` **hanya** untuk id milik gambar
   yang dihapus — **tidak** untuk yang dipertahankan. Kalau menyasar yang dipertahankan → **STOP + flag OFF**.

## 5. Verifikasi state pasca-UPDATE (merge)

```js
db.channel_product_data.findOne({masterProductId:"<id>",storeId:"<store>"}, {imageChannelIds:1})
```
- Setelah T1: memuat I3 (I1,I2 tetap). Setelah T2: **tanpa** I2. Setelah T3: {I3,I4}, tanpa I1/I2.
- Di **Shopify admin**: jumlah & isi gambar produk sesuai; **tak ada duplikat**.

> **Ini menguji `mergeImageChannelIds`.** Sync di UPDATE hanya surface id gambar **baru**; merge harus tetap
> menyimpan id gambar lama yang dipertahankan (+ buang yang dihapus). Kalau `imageChannelIds` malah **hanya**
> berisi gambar terakhir yang ditambah → merge gagal → update berikutnya akan re-append. STOP + laporkan.

## 6. NOOP (idempotensi)

Publish ulang **tanpa perubahan apa pun** → keputusan **NOOP** → **nol** panggilan channel (termasuk media). Log
BFF: `Publish NO-OP … content unchanged`. Membuktikan republish identik tak menyentuh gambar.

## 7. Rollback / selesai

- Kembalikan `app.publish.channel-update-enabled` ke nilai awal (**OFF** kalau belum siap produksi).
- UPDATE gagal bersifat **forward-only** (listing tetap live; produk tak dihapus). Media add/delete **non-fatal**:
  gagal-nya satu POST/DELETE dicatat di `step_results` tapi tak menggagalkan sync — bisa **partial** (mis. add
  sukses, delete gagal → gambar orphan). Baca `step_results`, perbaiki, ulangi dgn eventId baru.
- Gambar duplikat sisa uji lama dibersihkan manual di Shopify admin.

## 8. Batas yang diketahui (jangan diuji dulu)

- **Gambar VARIANT** (`product.variants.images`, key `sku::stem`) **belum** masuk (M4). `update_CP_Variants_Media`
  belum di-seed → langkah variant-media **SKIP** di UPDATE. Uji hanya **gambar produk**.
- **Urutan/`position`** gambar belum dikelola (M5). Gambar baru menempel di posisi akhir.
- **Identitas = filename-stem** (`imageKeyOf` = potong `_<uuid>`, ext, query, path). Andal untuk penamaan GCS
  `<prefix>-<ts>-<hash>` (tanpa `_`). Kalau sumber gambar memakai `_` di nama file → stem bisa salah; jangan
  campur skema penamaan lain saat uji.
- **Produk pra-M1** (tanpa baseline `imageChannelIds`) sengaja **tak** menambah gambar di UPDATE (0 POST) untuk
  hindari append. **Backfill** tersedia — GET gambar existing dari channel lalu isi `imageChannelIds`:
  ```
  POST /labamap/api/v1/admin/media/backfill-image-ids?organizationId=…&masterProductId=…&storeId=…
  ```
  (`MediaBackfillAdminController` → `ImageChannelIdBackfillService`.) ⚠️ Produk yang gambarnya sudah **duplikat
  stem** (mis. sisa bug append lama: `x.jpg` + `x_<uuid>.jpg`) akan **collision** saat backfill (peta simpan id
  terakhir per stem) — lebih baik **buat ulang** produk itu daripada di-backfill.

## 9. Pre-flight otomatis (sudah hijau — konteks)

Sebelum langkah live, test membuktikan sisi kode benar tanpa channel:
- **BFF** — `ShopifyMediaSeedTest` (seed `idtracking#images` + `update_CP_Media` + `delete_CP_Media`) &
  `DesiredStateExtractorTest` (parity `imageKey`: source URL ↔ Shopify-CDN mangled → stem sama).
  Jalankan: `mvn -o test -Dtest=ShopifyMediaSeedTest,DesiredStateExtractorTest,PublishDiffPlannerTest`.
- **Sync** — `ImageKeyParityTest` (`imageKeyOf` = kontrak stem yang sama; anti-drift dari BFF). *(test repo sync
  gitignored — jalankan lokal: `mvn test -Dtest=ImageKeyParityTest`.)*

Kalau salah satu merah, **jangan** live — perbaiki dulu (paling sering: stem parity BFF↔sync drift).
