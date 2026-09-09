# Fase 1 Dijelaskan Perlahan — Endpoint `{apiVersion}` Templating

> Bagian dari [seri versioning](01-channel-api-schema-versioning.md). Menjelaskan **pelan-pelan** apa yang
> diubah Fase 1, kenapa aman, cara pakainya, dan apakah frontend perlu berubah. Fase 1 sudah
> diimplementasikan (branch `bff-v11`).

---

## 1. Satu kalimat

Versi API channel (mis. Shopify `2024-01`, TikTok `202309`) **tidak lagi ditulis-kode** ke dalam setiap
URL endpoint; sekarang URL memakai placeholder **`{apiVersion}`** yang diisi saat publish dari **satu
sumber**: `ChannelConfiguration.apiVersion`.

---

## 2. Masalah sebelum Fase 1

Versi tersebar sebagai **literal** di banyak URL. Contoh (TikTok):

```
POST https://open-api.tiktokglobalshop.com/product/202309/products
POST https://open-api.tiktokglobalshop.com/product/202309/images/upload
DELETE https://open-api.tiktokglobalshop.com/product/202309/products
```

Kalau TikTok naik ke versi baru, engineer harus mencari & mengganti **`202309` di semua tempat** —
gampang ada yang terlewat → satu endpoint memanggil versi lama secara diam-diam.

---

## 3. Konsep: satu sumber + placeholder

Fase 0 sudah menambahkan field first-class **`ChannelConfiguration.apiVersion`** (mis. `"202309"`).
Fase 1 memakainya sebagai **satu-satunya** sumber versi:

```
URL disimpan:   .../product/{apiVersion}/products
apiVersion:     "202309"                         ← satu sumber
URL dikirim:    .../product/202309/products       ← hasil substitusi saat publish
```

Pola ini **bukan hal baru** — config kategori sudah memakainya (`ChannelTaxonomyService` mengganti
`{apiVersion}` di path API kategori). Fase 1 hanya **menggeneralisasi** pola itu ke endpoint publish-produk.

---

## 4. Apa yang berubah — langkah demi langkah

### Langkah A — URL di metadata jadi template

Di `ChannelMetadataMigration` (seeder), semua segmen versi literal diganti `{apiVersion}`:

| Channel | Sebelum | Sesudah |
|---|---|---|
| Shopify | `/admin/api/2024-01/…` | `/admin/api/{apiVersion}/…` |
| TikTok | `/product/202309/…` | `/product/{apiVersion}/…` |
| Shopee | `/api/v2/…` | `/api/{apiVersion}/…` |
| WIX | `/stores/v1/…` | `/stores/{apiVersion}/…` |

(24 kemunculan diganti; 0 literal tersisa. Amazon/Walmart/eBay tak punya URL berversi → tak disentuh.)

### Langkah B — resolver bersama

`channel/versioning/EndpointVersionTemplate.resolve(value, apiVersion, channelId)`:
- Tidak ada `{apiVersion}` → kembalikan apa adanya.
- Ada `{apiVersion}` + apiVersion terisi → ganti semua kemunculan.
- Ada `{apiVersion}` **tapi** apiVersion null/kosong → **biarkan placeholder + log ERROR** (URL rusak
  muncul jelas, bukan menebak versi diam-diam). Tidak pernah throw.

### Langkah C — titik resolusi 1: metadata → sync-service

`ChannelAttributeConverterService.resolveMetadataValue(...)` dipanggil untuk **setiap** item metadata
sebelum dikirim ke sync-service. Di situ, `{apiVersion}` di-resolve dari `channelConfig.getApiVersion()`
— berdampingan dengan resolusi secret `{app.oauth.clientSecret}` yang sudah ada. Jadi yang sampai ke
sync-service adalah URL **berversi konkret**.

### Langkah D — titik resolusi 2: path HMAC Shopee

Shopee menandatangani request (HMAC) memakai **path** sebagai bagian pesan tanda tangan
(`integrationConfig.publishApiPath`, mis. `/api/{apiVersion}/product/add_item`). Di
`PublishCredentialInjector.enrichHmacSignedPublishOptions`, path ini di-resolve **sebelum** dipakai, sehingga
**path yang di-sign dan URL yang dipanggil sama-sama berversi konkret** (keduanya wajib cocok, kalau tidak
Shopee menolak).

---

## 5. Alur runtime (hulu → hilir)

```
seed (restart)                 DB                         publish
─────────────                  ──                         ───────
build*Metadata  ──URL {apiVersion}──▶ channel_config ──▶ buildMetadataGroups
apiVersion="202309" ───────────────▶ ChannelConfig      └─ resolveMetadataValue: {apiVersion}→"202309"
                                                          └─ (Shopee) enrichHmac...: path {apiVersion}→"v2"
                                                                      │
                                                                      ▼
                                                            sync-service (:9000)
                                                            memanggil URL berversi konkret ke channel
```

Poin penting: substitusi terjadi **di backend, sebelum** menyentuh sync-service. Sync-service tetap
menerima URL biasa (berversi konkret) dan me-resolve token miliknya sendiri (`${PATH}`, `${product.id}`).

---

## 6. Kenapa ini AMAN (behaviour-preserving)

1. **Hasil = literal lama.** `apiVersion` tiap channel **persis sama** dengan segmen versi lama, jadi
   `{apiVersion}` → nilai yang identik. Tidak ada perubahan URL aktual — hanya sumbernya yang jadi satu.

   | Channel | `apiVersion` | `{apiVersion}` → |
   |---|---|---|
   | Shopify | `2024-01` | `/admin/api/2024-01/…` |
   | TikTok | `202309` | `/product/202309/…` |
   | Shopee | `v2` | `/api/v2/…` |
   | WIX | `v1` | `/stores/v1/…` |

2. **Token sync-service tidak tersentuh.** `{apiVersion}` (kurung tunggal) berbeda dari `${PATH}` /
   `${product.id}` (dollar-kurung). Substitusi hanya mengganti token `{apiVersion}` yang persis.

3. **Aman-null.** Kalau `apiVersion` belum terisi, placeholder dibiarkan + ERROR di-log (bukan tebakan).
   Untuk channel yang di-seed, `apiVersion` selalu terisi (diturunkan dari `metadata.apiVersion`).

4. **Channel user-customised** (metadata di-skip refresh saat restart) tetap menyimpan URL literal lama —
   `resolveMetadataValue` tak menemukan `{apiVersion}` → mengembalikan apa adanya → tetap jalan.

---

## 7. Cara memakai (bump versi hari ini)

Sekarang menaikkan versi endpoint sebuah channel = **mengubah satu nilai `apiVersion`** (di
`metadata.apiVersion` seed yang menurunkan `ChannelConfiguration.apiVersion`), lalu rebuild + restart.
Semua URL endpoint channel itu otomatis ikut versi baru. (Catatan: mengganti *bentuk body* tetap butuh
apiSchema/JOLT/rules — itu ranah major-change; Fase 1 hanya menyeragamkan **versi di URL**.)

**Deploy:** butuh **rebuild + restart** agar seeder menulis ulang URL bertemplat ke DB.

---

## 8. Apakah frontend perlu berubah?

**Secara fungsional: TIDAK.** Fase 1 adalah refactor backend yang **behaviour-preserving**:
- Tidak ada perubahan kontrak API yang dikonsumsi FE.
- FE **tidak** memanggil URL endpoint channel — yang memanggil adalah sync-service (:9000), dan ia
  menerima URL yang **sudah** berversi konkret.
- Tidak ada endpoint FE baru; tidak ada field response baru.

### Rekomendasi FE (OPSIONAL — hanya jika ada halaman admin config channel)

`GET /api/v1/admin/channel-configurations/{channelId}` kini mengembalikan:
- `apiVersion` (mis. `"202309"`),
- `channelMetadataList` yang URL-nya berisi **`{apiVersion}`** (template, belum ter-resolve — memang
  disimpan begitu di DB).

Jika FE menampilkan config/metadata ini ke admin, ada 2 penyesuaian **kosmetik** yang membantu (bukan
keharusan):

1. **Tampilkan chip `apiVersion`** per channel (nilainya sudah tersedia dari Fase 0).
2. **Render `{apiVersion}` dengan anggun.** URL di admin akan tampak `…/product/{apiVersion}/products`.
   Pilihan:
   - tampilkan apa adanya + tooltip "template — di-resolve saat publish dari apiVersion", atau
   - tampilkan **preview ter-resolve** dengan mengganti `{apiVersion}` memakai `apiVersion` di sisi klien
     (murni tampilan; contoh: `…/product/202309/products`).
   Jangan tampilkan `{apiVersion}` sebagai "URL rusak" — itu template yang benar.

> **Belum tersedia (jadi jangan dibuat dulu di FE):** endpoint untuk **mengedit** `apiVersion` via admin
> belum ada — `apiVersion` saat ini hanya read-only (di-set oleh seeder). Editor `apiVersion` sebagai
> "tuas bump versi satu-klik" adalah ide bagus tapi butuh endpoint PUT backend lebih dulu (kandidat Fase 2/3).
> Sampai itu ada, perlakukan `apiVersion` sebagai **read-only** di FE.

### Ringkas keputusan FE

| Kondisi | Aksi FE |
|---|---|
| FE tidak punya halaman admin config channel | **Tidak ada perubahan** |
| FE menampilkan config/metadata channel | Opsional: chip `apiVersion` + render `{apiVersion}` (as-is atau preview) |
| Ingin editor bump versi | Tunggu endpoint PUT apiVersion (belum ada) |

---

## 9. Batasan & catatan

- `apiVersion` belum bisa diedit via API (read-only; di-seed dari kode). Editor + PUT = pekerjaan lanjutan.
- Fase 1 hanya menyeragamkan **versi di URL endpoint**. Perubahan bentuk body (apiSchema/JOLT/rules) tetap
  proses tersendiri (lihat [02](02-version-change-flow-and-backward-compat.md), [03](03-change-granularity-major-minor-patch.md)).
- Fase 2 (bundle kontrak immutable per versi) & Fase 3 (pin versi per store + auto-regenerate) belum
  diimplementasikan.
