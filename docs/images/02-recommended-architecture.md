# 02 — Recommended Architecture: ImageService + Storage/CDN abstraction + presign

> DESIGN. Menjawab Q1 (handling), Q2 (presign), Q5 (satu kelas), Q6 (abstraksi CDN/non-CDN).

## 1. Model kanonik (dipertahankan)

Bentuk pipeline yang ada sudah benar — jangan diubah:
```
master: mainImage + galleryImages  ──normalizeImages──▶  images[] (kanonik, dedup, mainImage duluan)
publish: images[] ──collectSourceImageUrls──▶ _sourceImages (staging, JOLT-independent)
         └─ post-processing per-channel membangun field image dari _sourceImages
channel-side upload (Shopee/TikTok): dilakukan sync-service via workaction, menarik dari URL publik kita
```
Desain di bawah **membungkus** ini di balik satu service + abstraksi storage; ia tak mengubah alur.

## 2. `ImageService` — satu kelas domain (Q5)

Konsolidasikan logika image yang kini tersebar (`normalizeImages`, `collectSourceImageUrls`,
`ensureProductImages`, `URL_ARRAY_TO_SRC_OBJECTS`, validasi ad-hoc) ke satu service kohesif:

```
ImageService
  canonicalize(master)                 → images[]           (merge mainImage+gallery, dedup)   [dari normalizeImages]
  extractUrls(node)                    → List<String>        (toleran url/publicUrl/src/imageUrl) [dari collectSourceImageUrls]
  toSrcObjects(urls, propertyName)     → [{src|<prop>: url}] (variant images)                    [dari URL_ARRAY_TO_SRC_OBJECTS]
  validate(urls|meta, ChannelImageSpec)→ List<ImageIssue>    (dimensi/aspek/jumlah/bytes/format)  [BARU — §03]
  resolvePublicUrl(storageKeyOrUrl)    → String              (CDN atau raw)                       [via CdnUrlResolver]
  selectDerivative(url, ChannelImageSpec) → String           (pilih derivative sesuai channel)    [BARU — §4]
```

- **Murni + data-driven**: vocab channel (spec) datang dari data (§03), bukan literal — sesuai CLAUDE.md.
- Konsumen (`ChannelPublishService`, `FieldTransformationService`, Step-2 schema, media controller)
  memanggil `ImageService`, bukan menyalin logika. Menghapus duplikasi yang sekarang tersebar.
- **Tetap JOLT-independent**: `ImageService` mengisi `_sourceImages`; tak mengembalikan image ke JOLT.

## 3. `MediaStorageProvider` + `CdnUrlResolver` — abstraksi CDN/non-CDN (Q6)

`MediaUploadService` sekarang hard-coupled ke GCS. Ganti dengan antarmuka pluggable — **pola yang sama**
dengan `LlmClient`/`EmbeddingClient`/`VectorStore` (dipilih via `app.*.provider`):

```
interface MediaStorageProvider {
  StoredObject upload(byte[] bytes, String key, String contentType);   // server-proxied path
  PresignedUpload presignUpload(String key, String contentType, Duration ttl); // presign path (§4)
  void   delete(String key);
  boolean exists(String key);
  String rawPublicUrl(String key);   // URL mentah storage (mis. GCS/S3)
}
impl: GcsMediaStorageProvider (bungkus logika sekarang) · S3MediaStorageProvider · LocalMediaStorageProvider (dev)
config: app.media.storage.provider = gcs | s3 | local
```

**CDN vs non-CDN** = satu resolver tipis di atas provider:
```
CdnUrlResolver.publicUrl(key):
   base = app.media.cdn.base-url   (mis. https://cdn.mycompany.com)
   return base != null ? base + "/" + key : provider.rawPublicUrl(key)   // non-CDN → URL storage mentah
```
- Ganti ke CDN = set satu env; ganti storage = set `provider`. Tak ada kode call-site yang berubah.
- **Batasan (dari [`01`](01-current-state.md) §5):** URL yang diserahkan ke channel saat publish **wajib
  publicly fetchable** (Shopee/Shopify menariknya). Jadi `publicUrl` untuk publish = URL CDN/publik,
  **bukan** URL bertanda tangan sementara (presign hanya untuk *unggah*, bukan untuk dipakai channel).

## 4. Presign vs server-proxied (Q2)

| | Server-proxied (sekarang) | Presigned direct-to-storage (disarankan) |
|---|---|---|
| Alur | FE → **BFF** (stream bytes) → storage | FE minta presign ke BFF → FE **PUT langsung** ke storage |
| Beban BFF | tinggi (memori/latency file besar) | rendah (BFF tak menyentuh bytes) |
| Validasi server (bytes) | mudah (BFF punya bytes) | **hilang** → pindah ke pre-check client + langkah async |
| Derivative/thumbnail | inline di BFF | **async** (event storage → generator) atau langkah "finalize" |
| Skala | terbatas | baik |

**Rekomendasi:** presigned PUT untuk unggah + **derivative async**:
```
1. FE: POST /media/presign { contentType, sizeHint } → { uploadUrl, key, publicUrl }   (BFF validasi tipe/ukuran-hint, buat key)
2. FE: PUT bytes → uploadUrl (langsung ke storage)
3. FE: POST /media/finalize { key }  → BFF verifikasi objek ada + baca dimensi/bytes + antri derivative
4. Async (event GCS/S3 → worker / Cloud Function): buat derivative (thumbnail + ukuran per-channel §03),
   jalankan validasi penuh; tandai status objek READY/INVALID.
```
- Pertahankan endpoint proxied lama untuk file kecil / fallback (dev tanpa presign).
- `ImageService.validate` dipakai di langkah finalize/async **dan** di Step-2 (pre-check), satu sumber.

## 5. Migrasi bertahap (behaviour-preserving)

| Fase | Isi | Nilai | Status |
|---|---|---|---|
| **I0** | Ekstrak `ImageService` + tangkap width/height + offload boundedElastic (no behavior change) | kohesi + hapus duplikasi | ✅ `bff-v12` (BE `c307fbd`, FE `55c14a3`) |
| **I1** | `MediaStorageProvider` + `CdnUrlResolver`; `GcsMediaStorageProvider` bungkus kode sekarang | tukar storage/CDN via config | ✅ `bff-v12` (`98f85e0`) |
| **I2** | `ChannelImageSpec` data + `validate` (warning-only) di analyze/Step-2 | validasi per-channel (§03) | ✅ `bff-v12` (I2) + `ImageAsset` metadata (I2b: dimensi pada URL tersimpan) |
| **I3** | Presign upload + finalize + derivative async | skala + derivative per-channel | ✅ *(sebagian)* `bff-v12`: presign+finalize endpoint + provider signing/exists. Derivative-async + magic-byte sniffing **ditunda** (butuh worker/event infra) |
| **I4** | Step-2 editing (crop/resize/reorder) → derivative override | §04 | ✅ FE `v9`: plumbing (presign/finalize/dims) + **editor visual** (`StoreImageOverrideEditor` + `ImageCropModal` + `channelImageSpec.service`) per kontrak [`06`](06-frontend-step2-image-override.md); sisa: QA visual + variant-image override |

| **I5** | GC orphan (H6) | hemat storage + bersih | ✅ `bff-v12`: dry-run report + purge confirm-gated (`/admin/image-gc/*`); **tak terjadwal** (opt-in). Destruktif → mulai dari dry-run |

Tiap fase additive; I0/I1 tanpa perubahan perilaku (terverifikasi: default config → URL identik, test hijau).
