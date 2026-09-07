# 02 — TikTok size chart: E2E live-test runbook (CREATE + UPDATE)

Verifikasi live alur size chart image-first (rencana + mekanika: [`01`](01-tiktok-size-chart-plan.md)).
Gambar uji: `/Users/admin/tiktok-size-chart-test.jpg` (T-shirt, 900×620 JPEG).

## 0. Prasyarat (WAJIB sebelum tes)
- [ ] **Restart BFF** — seed jalan ulang: rule `tiktok-build-size-chart`, mapping `size_chart` (object), metadata
  `create_CP_Media_Pre` (kini **2 instruksi**) + `update_CP_Media_Pre` (baru). Migrasi startup meng-overwrite metadata.
- [ ] **Restart / rebuild sync** — tak ada perubahan kode sync di fitur ini, tapi pastikan metadata terbaru terkirim
  dari BFF tiap publish (metadata datang dari `metadataGroups` request, bukan tersimpan di sync).
- [ ] **FE build** jalan (branch `v13`) — field IMAGE ada di Step-2.
- [ ] Produk TikTok apparel terhubung ke store (kategori mewajibkan size chart, mis. `835720`).

## 1. Step-2 — unggah gambar (FE + DB)
- [ ] Step 2 → tab store TikTok → grup **"Optional Fields"** (collapsible, default tertutup — expand) → field
  **"Size Chart Image"** render sebagai tombol upload.
- [ ] Pilih `/Users/admin/tiktok-size-chart-test.jpg` → muncul thumbnail + tombol Replace/Remove.
- [ ] **Save** → cek DB: `channel_product_data.channelData.sizeChart` = URL GCS
  (`https://storage.googleapis.com/...`) berupa STRING.

**Gagal?** Field tak muncul → cek `mapFieldType("image")→IMAGE` + master attr `fieldType:"image"` ter-seed
(restart BFF). Upload gagal → cek endpoint `/media/upload` (orgId/productId dari `useAuth()`/route).

## 2. Publish CREATE — urutan log sync (bagian inti)
Publish (produk BARU, belum ada di TikTok) → `operation=CREATE`. Yang dicari, BERURUTAN:

```
[workflow] operation=CREATE id=...
[workflow] entering media_pre loop
[workflow] media_pre iteration=0
[activity] createRestChannelProductMediaPre id=...
  Found uri: https://storage.googleapis.com/.../<main image 1>
  ✅ Successfully downloaded: ... (xN gambar utama)
  Applying Base64 conversion to field: uri_key
  [HTTP] POST .../product/{v}/images/upload?... (multipart)      ← xN (gambar utama)
  [response-update-to] aggregated set attribute 'main_images' = [{"uri":"tos-..."}, ...]
[createRestChannelProductMediaPre] executed N call(s) ... remaining instructions=1   ← ⚠ remaining=1!
[workflow] media_pre remaining metadata items=1
[workflow] media_pre iteration=1                                 ← ITERASI KEDUA = size chart
[activity] createRestChannelProductMediaPre id=...
  Found uri: https://storage.googleapis.com/.../gallery-...-<sizechart>.jpg
  ✅ Successfully downloaded: ... (1 gambar)
  Applying Base64 conversion to field: uri_key
  [HTTP] POST .../product/{v}/images/upload?... (multipart)      ← 1x (size chart)
  [response-update-to] aggregated set attribute 'size_chart' = {"image":{"uri":"tos-..."}}   ← ⭐ CHECKPOINT
[createRestChannelProductMediaPre] executed 1 call(s) ... remaining instructions=0
[workflow] media_pre array exhausted – exiting loop
[workflow] create_rest_channel_product
[activity] createRestChannelProduct ...
  [HTTP] response status=200 body={"code":0,... "data":{"product_id":"..."} ...}   ← sukses, code=0
```

Checklist:
- [ ] **`remaining instructions=1`** setelah iterasi 0 — bukti list 2-instruksi terbaca (kalau `=0`, metadata masih 1
  instruksi → BFF belum restart / seed lama).
- [ ] **`media_pre iteration=1`** muncul (iterasi kedua = size chart).
- [ ] Ada **1 upload tambahan** `POST .../images/upload` untuk size chart (multipart), TERPISAH dari gambar utama.
- [ ] ⭐ **CHECKPOINT UTAMA:** `aggregated set attribute 'size_chart' = {"image":{"uri":"<tiktok-uri>"}}` —
  URI TikTok (mis. `tos-...`), **BUKAN** URL GCS, **BUKAN** `{}` atau `{"image":{}}`.
- [ ] `createRestChannelProduct` → response `code:0` (sukses), **tanpa** `12052673 size_chart_image required`.

## 3. Asumsi yang diverifikasi di checkpoint ⭐
Write-back size_chart pakai JOLT `{"*":{"data":{"uri":"image.uri"}}}` atas respons `/images/upload`. Ini
**mengasumsikan** respons upload memuat `data.uri` (sama seperti main_images). Bukti di log:
- **Benar** → `size_chart = {"image":{"uri":"tos-..."}}`. Lanjut.
- **Salah** (respons size-chart upload TIDAK punya `data.uri`, mis. field lain / nested beda) →
  `size_chart = {}` atau `{"image":{}}` → `create_CP` ditolak. **Fix:** sesuaikan `transformPaths` JOLT + mungkin
  `responsePaths` di `tiktokshopCreateMediaPreWorkflow` size-chart block agar menunjuk field uri yang benar
  (tempel body respons `/images/upload` size-chart mentah ke saya → saya sesuaikan; nol tebakan).

## 4. Publish UPDATE — re-test edit
Edit produk yang sama (mis. ganti harga) → publish lagi → `operation=UPDATE`.
- [ ] `media_pre` loop tetap 2 iterasi (kunci `update_CP_Media_Pre` kini ter-seed → **bukan** SKIP).
- [ ] Log `[activity] createRestChannelProductMediaPre` (opKey resolve ke `update_CP_Media_Pre`) — main + size chart
  ter-upload ulang, `size_chart` di-rewrite ke uri TikTok baru.
- [ ] `update_item`/`update_CP` → `code:0` (tanpa error size_chart / ImageIdList).

**Gagal (SKIP)?** `media_pre` log `no metadata found for key 'update_CP_Media_Pre' - SKIP` → seed lama; restart BFF.

## 5. Produk TANPA size chart (regresi)
- [ ] Publish produk TikTok tanpa mengisi size chart → iterasi size-chart = **no-op aman**: `from:"size_chart"` tak
  menemukan atribut → 0 upload untuk instruksi itu (`executed 0 call(s)`), atau atribut `size_chart` tak ada →
  create_CP tanpa `size_chart`. Publish tetap sukses. **Nol regresi.**

## 6. Peta gagal → sebab → fix
| Gejala di log | Sebab | Fix |
|---|---|---|
| `remaining instructions=0` setelah iter 0 | metadata masih 1 instruksi | restart BFF (seed baru) |
| `size_chart = {}` / `{"image":{}}` di write-back | respons upload tak punya `data.uri` | sesuaikan JOLT `transformPaths` (§3) |
| `size_chart = {"image":{"uri":"https://storage.googleapis..."}}` | upload size chart di-skip; masih URL GCS | cek iterasi 1 jalan + `use_case=SIZE_CHART_IMAGE` terkirim |
| `12052673 size_chart_image required` tetap | size_chart tak sampai body / kosong | cek atribut `size_chart` teremit (non-support) + checkpoint ⭐ |
| `36009004 param use_case type invalid. actual type:[]uint8, expected type:string` | **FIXED** — `writeTextPart` dulu menaruh `filename=` di form-field string → dikirim sbg file | sync `temp-v2` `6a71ded` (form field string tanpa filename, RFC 7578) — restart sync |
| UPDATE `... 'update_CP_Media_Pre' - SKIP` | seed update belum ada | restart BFF |
| `image.uri` invalid ratio (bila ada) | TikTok tolak rasio size chart | pakai gambar 1:1 (minta versi baru) |

## Related
[`01`](01-tiktok-size-chart-plan.md) (rencana + §5a/§5b mekanika sync), guide `37-tiktok-size-chart.md`,
guide `25-tiktok-media-pre-upload.md` (pola media-pre), [[tiktok-publish-pipeline-complete]].
