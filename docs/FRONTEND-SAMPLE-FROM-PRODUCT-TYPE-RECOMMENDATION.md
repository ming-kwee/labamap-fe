# Frontend: Isi "Master Product (JSON)" dari Product Type (bukan input buta)

**Tanggal**: 2026-07-07
**Backend status**: Sudah diimplementasikan — endpoint siap dipanggil
**Frontend status**: ✅ **SELESAI (2026-07-07)** — komponen `ProductTypeSampleLoader` (dropdown Product Type + tombol "Load from Product Type") di kedua console; 200 → isi textarea (editable), 404 → tampilkan pesan config tanpa fallback. E2E `sample-from-product-type.spec.ts` (2).
> ⚠ Catatan verifikasi: saat implementasi, route `GET /admin/ai/sample-master-product` **belum ter-deploy** di backend dev (masih generic 404 `message:null`; `/admin/ai/config` 200), dan semua Product Type org demo `attributeCount: 0`. Jadi jalur 200 diverifikasi via mock e2e, bukan live. Perlu rebuild+restart backend + konfigurasi master attributes untuk uji 200 live.
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

**Response 200** — sample master product JSON, diturunkan dari `ecommerce_master_attributes` untuk Product Type itu:
```json
{
  "name": "sample_name",
  "description": "sample_description",
  "brand": "sample_brand",
  "price": 0,
  "variants": [
    {
      "sku": "sample_sku",
      "color": "black",
      "size": "sample_size",
      "price": 0
    }
  ]
}
```
- Field **product-scope** → top-level; field **variant-scope** → `variants[0]`
- Field SELECT/MULTISELECT → memakai opsi pertama sebagai value (mis. `color: "black"`)
- Field lain → value dummy per tipe (number→0, text→`sample_<field>`)
- Channel-specific fields (`isChannelField=true`) **tidak** disertakan (itu sisi target)

**Response 404** — Product Type belum punya master attribute aktif:
```json
{ "status": 404, "message": "No active master attributes for productTypeId '...' — configure the ProductType's attributes first." }
```
Ini **sinyal konfigurasi nyata**, bukan error teknis. Tampilkan ke admin apa adanya (jangan fallback ke contoh hardcoded).

### Prinsip desain (penting dipahami FE)
- **Single source, no fallback**: sample HANYA dari master attributes Product Type. Kalau kosong → 404, bukan diam-diam ambil dari sumber lain. Ini disengaja agar hasil deterministik & masalah config terlihat.
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
  const sample = await res.json();
  masterProductJsonInput.value = JSON.stringify(sample, null, 2);  // isi textarea, tetap editable
}
```

### 3. Admin tetap bisa edit sebelum submit

Sample yang di-load adalah **titik awal**, bukan kunci. Textarea tetap editable — admin bisa tweak values/field sebelum submit ke `generate-jolt` / diagnostics seperti biasa. Ini menjaga transparansi (tidak buta, tapi tetap terkontrol).

### 4. Berlaku untuk KEDUA console

Endpoint sama dipakai di:
- **JOLT Generation Console** — sebelum generate JOLT
- **Publish Diagnostics** (sample mode, `id: "diag-sample"`) — sebelum menganalisa

Satu sumber, konsisten di dua tempat.

---

## Yang TIDAK Berubah di Backend

- `POST /api/v1/admin/ai/generate-jolt` — tetap menerima `sampleMasterProduct` di body (tidak breaking). FE cukup mengisinya dengan hasil endpoint sample, lalu submit seperti biasa.
- Publish Diagnostics (`analyze`) — tetap menerima produk. Endpoint sample hanya untuk **mengisi input**, bukan mengganti alur analisa.

Jadi integrasi FE = **panggil endpoint sample → populate textarea**. Tidak ada perubahan kontrak submit.

---

## Alur Akhir (Ringkasan)

```
Admin pilih Channel + Product Type   (FE sediakan Product Type picker)
        ↓  klik "Load from Product Type"
GET /sample-master-product?productTypeId=X
        ↓  200 → isi textarea (editable)   |   404 → tampilkan pesan config
Admin review/edit JSON
        ↓
Submit ke generate-jolt / diagnostics  (kontrak lama, tak berubah)
```

Hasil: input "Master Product (JSON)" tidak lagi diketik buta — di-seed dari kontrak field nyata Product Type, konsisten dengan apa yang akan benar-benar dipublish.
