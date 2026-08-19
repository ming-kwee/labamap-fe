# Kompatibilitas lintas-channel: media diff-engine (M1–M5 + V1–V5)

> Konteks: [`05-shopify-update-media.md`](05-shopify-update-media.md) (product M1–M5),
> [`07-shopify-media-reorder.md`](07-shopify-media-reorder.md) (M5), [`08-shopify-variant-media.md`](08-shopify-variant-media.md)
> (variant V1–V5). Dokumen ini menjawab satu pertanyaan yang berulang: **apakah M1–M5/V1–V5 kompatibel dengan
> Shopee, TikTok, WIX, dst.?** Jawaban ringkas: **aman (tidak merusak), tetapi Shopify-only by design** —
> masalah yang diselesaikannya khas Shopify. Tulisan ini merekam *kenapa*, agar tak salah diasumsikan nanti.

## 0. TL;DR

- **Tidak ada breakage.** Seluruh jalur M2/M3/M5 + V2/V3/V4/V5 di BFF di-gate satu kunci
  (`idtracking#images`) yang **hanya di-seed untuk Shopify**; langkah sync baru (`delete/associate/reorder`)
  **SKIP** saat metadata-nya absen dan bersifat **non-fatal**. Untuk Shopee/TikTok/WIX → **nol perubahan
  perilaku**. Aman merge.
- **Tidak berlaku apa adanya** untuk channel lain, dan itu benar: akar masalah M1–M5 adalah
  `POST /images.json` Shopify yang **append-tanpa-dedup**. Shopee/TikTok mengeset gambar sebagai **satu list**
  di `add_item`/`update_item` → **tak ada akumulasi** → tak ada yang perlu di-diff secara bedah.

## 1. Gate yang menjamin "aman-inert"

### BFF — satu kunci menentukan segalanya
```java
private boolean channelTracksImages(ChannelConfiguration channelConfig) {
    return channelConfig.getChannelMetadataList().stream()
            .anyMatch(m -> "idtracking#images".equals(m.getKey()));
}
```
`idtracking#images` **hanya** di-seed di `ChannelMetadataMigration.buildShopifyMetadata()`. Shopee
(`buildShopeeMetadata`), TikTok (`buildTiktokshopMetadata`), WIX (`buildWixMetadata`) tidak menyeednya. Jadi
`channelTracksImages == false` untuk mereka, dan setiap helper berikut langsung return / no-op:

| Helper | Guard |
|---|---|
| `filterProductImagesForUpdate` (M2) | `!channelTracksImages → return` |
| `filterVariantImagesForUpdate` (V2) | `!channelTracksImages → return` |
| `computeDeleteImageIds` (M3/V3) | `!channelTracksImages → List.of()` |
| `computeVariantImageAssociations` (V4) | `!channelTracksImages → List.of()` |
| `applyImageReorder` (M5/V5) | `!channelTracksImages → return` |

→ BFF tak pernah meng-inject support field `product.delete_image_ids` / `product.image_order` /
`product.known_image_ids` / `product.variant_image_assoc` untuk channel non-Shopify.

### Sync — SKIP by metadata-absence, non-fatal
Workflow tunggal menjalankan langkah `delete_ / associate_ / reorder_rest_channel_product_media` untuk **semua**
channel, tetapi tiap activity memakai `executeListViaService`, yang `buildSkipResult` bila
`findMetadataGroup(cmd, key)` null. Shopee/TikTok tak seed `delete_CP_Media`/`reorder_CP_Media`/
`associate_CP_Variants_Media` → **SKIP**. Langkah-langkah ini juga **non-fatal** (ERROR di-log, workflow lanjut).
Capture varian V1 (`idtracking#variant_images`) absen → `captureVariantMediaIds` balik kosong.

> **Kesimpulan gate:** M1–M5 + V1–V5 = *no-op* penuh untuk Shopee/TikTok/WIX. Terverifikasi terhadap seed
> metadata (hanya Shopify yang punya kunci-kunci itu).

## 2. Kenapa modelnya memang Shopify-specific (bukan kekurangan)

Akar masalah yang dipecahkan M1–M5: **`POST /products/{id}/images.json` Shopify meng-APPEND tanpa dedup** → tiap
UPDATE menambah gambar → menumpuk. Shopee & TikTok berbeda fundamental:

| Aspek | Shopify | Shopee / TikTok |
|---|---|---|
| Cara set gambar | per-image `POST/DELETE/PUT /images` (bedah) | **list utuh** (`image.image_id_list` / array image id) di `add_item`/`update_item` |
| Akumulasi | ya (append no-dedup) → butuh diff | **tidak** — list di-replace tiap update → idempoten alami |
| Identitas id | respons meng-echo `image.src` → `imageKey` stem → id | pre-upload (`media_space/upload_image`, `upload_image`) balikin `image_id` **per posisi**, tak echo src |
| Reorder | panggilan khusus `PUT product.images=[{id,position}]` | cukup urutan elemen di `image_id_list` saat update item |
| Delete | `DELETE /images/{id}` | cukup hilangkan dari `image_id_list` |
| Variant image | product image ber-`variant_ids` (list bersama) | ranah beda (mis. Shopee: gambar per-model di `add_model`/`tier_variation`) |

Untuk Shopee/TikTok, "add/delete/reorder" **built-in** ke satu panggilan update item — tak ada masalah
akumulasi yang perlu di-diff. Dan `imageKey` **stem** mengasumsikan "src yang di-echo balik" + suffix
`_<uuid>` Shopify; Shopee/TikTok tak echo src, jadi mekanisme round-trip stem tak berlaku apa adanya.

## 3. Yang sudah channel-agnostic vs Shopify-specific

**Sudah netral (reusable):**
- `DesiredStateExtractor` — Resource `url` (product) / `sku::url` (variant) + content-hash. Sudah dipakai juga
  di jalur varian Shopee (Mode B).
- `PublishDiffPlanner` — Ops add/delete/noop generik.
- Deteksi NOOP via content hash (`persistContentHashes`).

**Shopify-specific (perlu strategi per-channel bila diperluas):**
- `DesiredStateExtractor.imageKey` stem — asumsi src echo + `_<uuid>`.
- Round-trip id via `idtracking#images` / `idtracking#variant_images` (baca `image.src` / `image.variant_ids`).
- Workaction REST `/images.json` (POST/DELETE/PUT), `reorder_CP_Media`, `associate_CP_Variants_Media`, dan
  helper BFF yang men-stage support field-nya.

## 4. Kalau nanti ingin "hemat upload" untuk Shopee/TikTok

Ini **desain terpisah** (sebut M-Shopee/M-TikTok), **bukan** reuse M1–M5. Bentuknya:

- **Identitas by `source-URL → channel image_id` yang dipersist** (bukan src-stem echo), diisi dari write-back
  pre-upload (`create_CP_Media_Pre` Shopee / `upload_image` TikTok). Simpan mirip `imageChannelIds` tapi
  di-key oleh URL sumber (atau hash konten).
- **"Diff" hanya memutuskan gambar mana yang perlu di-upload ulang** — yang belum punya image_id tersimpan;
  add/delete/reorder cukup dengan menyusun `image_id_list` yang diinginkan di `update_item` (list otoritatif).
- **Tak perlu** langkah delete/reorder/associate terpisah — semua lewat satu panggilan update item.
- Manfaat: menghindari re-upload berulang (hemat kuota media), bukan mengatasi "duplikat/akumulasi" (yang di
  Shopee/TikTok tak terjadi karena list di-replace).

## 5. Cara memverifikasi klaim "no-op" (bila ragu di masa depan)

1. Grep `idtracking#images` di `ChannelMetadataMigration` → seharusnya hanya di `buildShopifyMetadata`.
2. Publish UPDATE ke store Shopee/TikTok → log BFF **tidak** memuat `M2/M3/M4/V*` (semua di-gate off); log
   sync menampilkan `deleteRestChannelProductMedia … SKIP` / `no metadata … SKIP` untuk langkah media baru.
3. `channel_product_data.imageChannelIds` untuk store Shopee/TikTok tetap kosong (tak ada round-trip).

> Bila salah satu channel non-Shopify **memang** menyeed `idtracking#images` (mis. eksperimen), sadari bahwa
> ia akan mengaktifkan seluruh pipeline bedah — yang **tidak** cocok dengan model list-utuh mereka. Jangan
> seed kunci itu untuk channel non-Shopify tanpa lebih dulu membangun strategi identitas per §4.
