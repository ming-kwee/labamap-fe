# Frontend: Isi "Master Product (JSON)" dari Product Type (bukan input buta)

**Tanggal**: 2026-07-07
**Backend status**: Sudah diimplementasikan — endpoint siap dipanggil
**Backend update (2026-07-07)**: Sample kini menyertakan **GLOBAL/common attributes** (name, price, sku, description, brand — attribute dengan `productTypeIds` kosong) yang sebelumnya terbuang. Konsekuensi penting bagi catatan verifikasi di bawah: Product Type dengan `attributeCount: 0` (tidak punya attribute khusus) **tetap** mengembalikan 200 berisi common fields — **bukan lagi 404**. Endpoint mengembalikan 404 hanya bila catalog benar-benar tak punya master attribute sama sekali.
**Backend update #2 (2026-07-08) — ⚠ BREAKING untuk FE**: (a) Sample kini juga menyertakan **variant dimensions** dari `ProductType.variantDimensions` (mis. `color`, `size`) sebagai `variants[0].<code>` — sebelumnya axes ini hilang total karena tersimpan di ProductType, bukan di master attributes (itu sebabnya apparel tampak "global saja"). (b) **Bentuk response berubah** dari raw sample JSON menjadi `{ "sample": {...}, "meta": {...} }`. FE harus ambil `.sample` untuk mengisi textarea, dan `meta` untuk label komposisi akurat. Lihat "Response 200 (bentuk baru)" & "Perubahan FE karena update #2" di bawah.
**Frontend status**: ✅ **SELESAI (2026-07-07)** — komponen `ProductTypeSampleLoader` (dropdown Product Type + tombol "Load from Product Type") di kedua console; 200 → isi textarea (editable), 404 → tampilkan pesan config tanpa fallback. E2E `sample-from-product-type.spec.ts` (2).
**Frontend align (2026-07-08)**: disesuaikan dengan backend update di atas — 404 kini diperlakukan sebagai sinyal **catalog-level** (bukan per-Product-Type) di komentar `ProductTypeSampleLoader`/`aiAdmin.service`; dropdown Product Type menampilkan `attributeCount` (`N attribute khusus` / `field global saja`); ditambah hint "field global selalu disertakan" agar admin tahu `attributeCount: 0` **tetap** menghasilkan sample. E2E diperbarui: mock 404 memakai pesan catalog-level baru, mock Product Type memakai `attributeCount`, + assert hint global.
**Frontend align #2 (2026-07-08, update #2 BREAKING)**: ✅ SELESAI — (a) response envelope `{ sample, meta }` di-handle: `getSampleMasterProduct` mengembalikan `SampleMasterProductResponse` (`types/session.ts`), loader mengisi textarea dari `.sample` saja (bukan envelope mentah). (b) Label komposisi akurat dari `meta` ("✓ Sample dimuat — 5 global · axes: color, size") menggantikan hint pra-load setelah sukses. (c) Label dropdown `field global saja` **dihapus** — `attributeCount: 0` tidak lagi ditandai "global saja" (bisa punya variant axes); anotasi `· N attribute khusus` hanya bila >0. E2E diperbarui: mock memakai envelope `{ sample, meta }`, assert label komposisi + assert textarea **tidak** bocor `globalFieldCount`.
> ⚠ Catatan verifikasi: saat implementasi, route `GET /admin/ai/sample-master-product` **belum ter-deploy** di backend dev (masih generic 404 `message:null`; `/admin/ai/config` 200), dan semua Product Type org demo `attributeCount: 0`. Jadi jalur 200 diverifikasi via mock e2e, bukan live. Perlu rebuild+restart backend + konfigurasi master attributes untuk uji 200 live.
> ✅ Setelah backend update di atas: `attributeCount: 0` **bukan lagi blocker** — endpoint mengembalikan common global fields (name/price/sku/…). Setelah rebuild+restart backend dev, jalur 200 dapat diuji **live** (tidak perlu mock) untuk Product Type manapun selama catalog punya global master attributes.
**Scope**: JOLT Generation Console + Publish Diagnostics (sample mode)

---

## Latar Belakang

Kedua console — **JOLT Generation Console** dan **Publish Diagnostics** — punya input "Master Product (JSON)" yang saat ini diisi **manual** (tombol "reset ke contoh" menaruh JSON hardcoded). Admin harus mengetik/menempel struktur master product secara buta, rawan:

- Field tidak lengkap / tidak representatif → JOLT digenerate untuk field yang salah
- Admin harus hafal struktur persis (`variants[0].sku`, dll)
- Tidak ada jaminan sample = field yang benar-benar akan dipublish

**Solusi**: seed input dari kontrak field nyata Product Type, bukan tebakan.

---

## Yang Sudah Disediakan Backend

### Endpoint baru
```
GET /api/v1/admin/ai/sample-master-product?productTypeId=<objectId>
```

**Response 200 (bentuk baru — sejak backend update #2)** — `{ sample, meta }`:
```json
{
  "sample": {
    "name": "sample_name",
    "description": "sample_description",
    "brand": "sample_brand",
    "price": 0,
    "variants": [
      {
        "sku": "sample_sku",
        "color": "sample_color",
        "size": "sample_size",
        "price": 0
      }
    ]
  },
  "meta": {
    "globalFieldCount": 5,
    "typeSpecificFieldCount": 2,
    "variantDimensions": ["color", "size"],
    "hasVariants": true
  }
}
```
- **`sample`** — JSON yang dimasukkan ke textarea (`.sample`, bukan root response).
- **`meta`** — ringkasan komposisi untuk label UI yang akurat:
  - `globalFieldCount` — jumlah field global/common
  - `typeSpecificFieldCount` — jumlah field khusus Product Type (= `attributeCount`)
  - `variantDimensions` — daftar axis variasi (color, size) dari `ProductType.variantDimensions`
  - `hasVariants` — apakah sample punya `variants[0].*`

**Inklusi field (meniru filter Step 1 form generation):**
- **Global/common attributes** (`productTypeIds` kosong/null) → **SELALU disertakan**. Ini field inti: `name`, `description`, `price`, `sku`, `brand` — tulang punggung tiap master product.
- **Type-specific attributes** → disertakan hanya bila `productTypeIds` mengandung `productTypeId` yang diminta (mis. `material`, `size_type` untuk clothing).
- **Variant dimensions** (`ProductType.variantDimensions`: color, size, …) → ditambahkan sebagai `variants[0].<attributeCode>`. Ini axis variasi yang **tidak** ada di master attributes — sebelum update #2 axes ini hilang, membuat apparel tampak "global saja".
- Field **product-scope** → top-level; field **variant-scope** → `variants[0]`
- Field SELECT/MULTISELECT → memakai opsi pertama sebagai value
- Field lain → value dummy per tipe (number→0, text→`sample_<field>`)
- Channel-specific fields (`isChannelField=true`) **tidak** disertakan (itu sisi target)

> Konsekuensi: Product Type tanpa attribute khusus **tetap** menghasilkan sample berisi common fields + variant axes. `attributeCount: 0` di UI Product Type **bukan** berarti "global saja" — pakai `meta.variantDimensions`/`meta.hasVariants` untuk label yang benar.

**Response 404** — hanya bila catalog **sama sekali tidak punya** master attribute (termasuk global):
```json
{ "status": 404, "message": "No active master attributes found — configure master product attributes (at minimum the common global fields) first." }
```
Ini **sinyal konfigurasi nyata** (catalog belum di-seed), bukan error teknis. Tampilkan ke admin apa adanya (jangan fallback ke contoh hardcoded).

### Prinsip desain (penting dipahami FE)
- **Single source, no fallback**: sample HANYA dari `ecommerce_master_attributes` (global + type-specific). Tidak pernah diam-diam ambil dari sumber lain (mis. cached form schema). Deterministik & masalah config terlihat.
- **Values synthetic**: yang akurat adalah **nama & struktur field** (itu yang dipakai matching). Values placeholder — admin boleh edit bila ingin dry-run lebih realistis.

---

## Perubahan yang Diperlukan di Frontend

### 1. Kirim `productTypeId`, bukan category slug — WAJIB

Console saat ini menampilkan **"Category ID: clothing"** (slug). Endpoint butuh **`productTypeId` (ObjectId)**. Slug tidak akan match.

Yang perlu diubah:
- Tambah **Product Type picker** di kedua console (dropdown Product Type), atau
- Resolusi Product Type dari pilihan kategori di sisi FE, lalu kirim `productTypeId`

> Backend sengaja TIDAK menebak slug → productTypeId (akan jadi fallback tersembunyi yang tidak deterministik). FE harus menyediakan productTypeId yang sebenarnya.

### 2. Tombol "Load from Product Type"

Ganti/dampingi tombol "reset ke contoh" dengan "Load from Product Type":

```typescript
async function loadSampleFromProductType(productTypeId: string) {
  const res = await fetch(
    `/api/v1/admin/ai/sample-master-product?productTypeId=${encodeURIComponent(productTypeId)}`
  );
  if (res.status === 404) {
    const body = await res.json();
    // Tampilkan pesan config, JANGAN fallback ke contoh hardcoded
    showWarning(body.message);
    return;
  }
  if (!res.ok) { showError("Gagal memuat sample"); return; }
  const { sample, meta } = await res.json();          // ⚠ bentuk baru: { sample, meta }
  masterProductJsonInput.value = JSON.stringify(sample, null, 2);  // pakai .sample untuk textarea
  // Opsional: label komposisi dari meta (mis. "5 global + 2 khusus + axes: color, size")
  renderCompositionLabel(meta);
}
```

> ⚠ **BREAKING (backend update #2)**: response kini `{ sample, meta }`, bukan raw JSON. FE yang sudah implement dengan `JSON.stringify(await res.json())` akan menaruh `{sample, meta}` mentah ke textarea. Ganti ke `const { sample, meta } = await res.json()` lalu stringify `sample` saja.

### 2b. Label komposisi dari `meta` — menyelesaikan "global saja"

`meta` menjawab persoalan Product Type yang tampak "global saja". Gunakan untuk label akurat:
```typescript
function renderCompositionLabel(meta) {
  const parts = [`${meta.globalFieldCount} global`];
  if (meta.typeSpecificFieldCount > 0) parts.push(`${meta.typeSpecificFieldCount} khusus`);
  if (meta.variantDimensions.length)   parts.push(`axes: ${meta.variantDimensions.join(", ")}`);
  return parts.join(" · ");   // mis. "5 global · axes: color, size"
}
```
Catatan: `attributeCount` di dropdown Product Type = `meta.typeSpecificFieldCount` saja — TIDAK menghitung global maupun variant dimensions. Jadi `attributeCount: 0` **bukan** berarti "global saja"; cek `meta.variantDimensions`/`meta.hasVariants` untuk tahu apparel punya axes color/size.

### 3. Admin tetap bisa edit sebelum submit

Sample yang di-load adalah **titik awal**, bukan kunci. Textarea tetap editable — admin bisa tweak values/field sebelum submit ke `generate-jolt` / diagnostics seperti biasa. Ini menjaga transparansi (tidak buta, tapi tetap terkontrol).

### 4. Berlaku untuk KEDUA console

Endpoint sama dipakai di:
- **JOLT Generation Console** — sebelum generate JOLT
- **Publish Diagnostics** (sample mode, `id: "diag-sample"`) — sebelum menganalisa

Satu sumber, konsisten di dua tempat.

---

## Yang TIDAK Berubah di Backend

- `POST /api/v1/admin/ai/generate-jolt` — tetap menerima `sampleMasterProduct` di body (tidak breaking). FE mengisinya dengan `.sample` dari response endpoint sample (bukan seluruh `{sample, meta}`), lalu submit seperti biasa.
- Publish Diagnostics (`analyze`) — tetap menerima produk. Endpoint sample hanya untuk **mengisi input**, bukan mengganti alur analisa.

Jadi integrasi FE = **panggil endpoint sample → ambil `.sample` → populate textarea → (opsional) `.meta` untuk label**. Kontrak submit ke generate-jolt/analyze tidak berubah.

---

## Alur Akhir (Ringkasan)

```
Admin pilih Channel + Product Type   (FE sediakan Product Type picker)
        ↓  klik "Load from Product Type"
GET /sample-master-product?productTypeId=X   → { sample, meta }
        ↓  200 → textarea = .sample (editable) + label = .meta
        |  404 → tampilkan pesan config (catalog kosong)
Admin review/edit JSON
        ↓
Submit .sample (hasil edit) ke generate-jolt / diagnostics  (kontrak lama, tak berubah)
```

Hasil: input "Master Product (JSON)" tidak lagi diketik buta — di-seed dari kontrak field nyata Product Type (global + type-specific + variant axes), dan `meta` memberi FE komposisi akurat (bukan "global saja").
