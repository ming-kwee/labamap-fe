# Granularitas Perubahan — Major, Minor, & Patch

> Pendamping [`01-channel-api-schema-versioning.md`](01-channel-api-schema-versioning.md) &
> [`02-version-change-flow-and-backward-compat.md`](02-version-change-flow-and-backward-compat.md).
> Menjawab: *apakah arsitektur versioning ini juga mencakup perubahan kecil — minor atau patch — bukan
> hanya bump versi besar?*

**Jawaban singkat: ya, dan justru di sinilah manfaat terbesarnya.** Arsitektur target membuat
**blast radius proporsional** dengan besar perubahan. Perubahan kecil tidak boleh memicu ritual
7-permukaan + big-bang seperti sekarang. Kuncinya: pisahkan **dua sumbu versi** dan tentukan dampak dari
**apakah bentuk target (apiSchema paths) berubah**, bukan dari label versinya.

---

## 1. Dua sumbu identitas versi

Satu nomor versi tidak cukup, karena ada dua sumber perubahan yang berbeda pemiliknya:

| Sumbu                                      | Contoh                                            | Pemilik     | Kapan naik                                              |
|--------------------------------------------|---------------------------------------------------|-------------|---------------------------------------------------------|
| **`apiVersion`** (channel-driven)          | `2024-01 → 2024-07`, `202309 → 20xxxx`, `v2 → v3` | **Channel** | Channel menaikkan versi API-nya                         |
| **`contractRevision`** (our-driven, patch) | `2024-01` → `2024-01.1` → `2024-01.2`             | **Kita**    | Kita mengoreksi bundle untuk `apiVersion` yang **sama** |

`apiVersion` mengikuti label channel (cocok dengan URL & dokumentasi). `contractRevision` adalah revisi
**internal** kita atas bundle — dipakai saat **kita** memperbaiki sesuatu (mis. mengoreksi apiSchema,
menambah/menyetel post-processing rule, memperbaiki mapping) **tanpa** channel berubah.

> Contoh nyata dari pekerjaan kita: reset apiSchema Shopify (menghapus `option{n}_name`) dan koreksi
> `tags` array→string adalah **`contractRevision`** untuk `apiVersion=2024-01` yang sama — bukan bump
> versi channel. Sedangkan fix image backfill kemarin adalah **patch kode murni** (tak menyentuh kontrak
> sama sekali — lihat §4).

---

## 2. Klasifikasi dampak: major / minor / patch

Yang menentukan tindakan **bukan** nomornya, melainkan **apakah bentuk target berubah** dan **bagaimana**:

| Kelas                | Contoh                                                                                            | Ubah bentuk apiSchema?                            | Sumbu                                      | Regen generated spec?                                                            | Rollout                 |
|----------------------|---------------------------------------------------------------------------------------------------|---------------------------------------------------|--------------------------------------------|----------------------------------------------------------------------------------|-------------------------|
| **Major (breaking)** | field di-rename/dihapus/di-restructure, tipe berubah, endpoint versi baru                         | Ya — path **hilang/berubah**                      | `apiVersion` baru                          | **Ya, semua kategori**                                                           | DRAFT → canary → ACTIVE |
| **Minor (additive)** | field **opsional** baru, enum value baru, endpoint opsional baru                                  | Mungkin — path **ditambah** (tak ada yang hilang) | `apiVersion` minor atau `contractRevision` | **Tidak wajib** (spec lama tetap valid; regen hanya jika ingin pakai field baru) | Bisa langsung ACTIVE    |
| **Patch (no-shape)** | bugfix reshaping, ubah default, koreksi mapping/rule, koreksi faithfulness tanpa ubah path publik | **Tidak** (hanya post-processing/rule/mapping)    | `contractRevision`                         | **Tidak** (path publik tak berubah)                                              | Langsung ACTIVE         |

---

## 3. Prinsip kunci: fingerprint + **structural diff**, bukan sekadar nomor

Doc 01 mengusulkan `apiSchemaHash` untuk deteksi stale. Tapi hash saja terlalu kasar untuk membedakan
minor vs major — hash berubah untuk **penambahan** maupun **penghapusan**. Maka tambahkan **diff level
path**:

```
diff(apiSchema_lama, apiSchema_baru) per target path:
  ├─ path DIHAPUS / DI-RENAME / TIPE-BERUBAH   → BREAKING  → spec lama INVALID → regen wajib
  ├─ path DITAMBAH (opsional)                  → ADDITIVE  → spec lama TETAP VALID (path lama masih ada) → regen opsional
  └─ tidak ada perubahan path (hanya rule/default/mapping) → NON-SCHEMA → spec TIDAK tersentuh
```

Jadi:
- **Hash berubah** = "ada yang berubah" (lampu kuning).
- **Diff** = "breaking atau additive" (lampu merah vs hijau).
- Hanya **breaking diff** yang memaksa regen generated spec. **Additive** backward-compatible: spec lama
  memetakan ke path yang **masih ada**, cukup abaikan field baru.

Ini mencegah dua kesalahan: (a) mengirim body rusak karena stale (kasus `option1_name` — breaking), dan
(b) meregenerasi semua spec sia-sia hanya karena channel menambah satu field opsional (additive).

---

## 4. Perubahan yang **tidak** menyentuh kontrak sama sekali

Sebagian "perubahan kecil" bahkan **bukan** urusan versioning — murni patch kode:

- Fix `collectSourceImageUrls` / `extractImageUrl` (toleran objek) dan `ensureProductImages` (backfill) —
  **tidak** mengubah apiSchema, rules, mapping, maupun endpoint. Ini **patch aplikasi biasa**, bukan
  revisi kontrak; tak perlu `apiVersion`/`contractRevision` baru.

Aturan pembeda: **kalau yang berubah adalah bentuk yang dilihat channel/agent (apiSchema, endpoint,
rules, mappings, requirements) → itu revisi kontrak (ber-versi). Kalau hanya perilaku internal pipeline
kita → itu patch kode biasa.**

---

## 5. Blast radius proporsional (kontras dengan as-is)

Inti nilai arsitektur ini untuk perubahan kecil:

| Kelas                | As-is sekarang                                                               | To-be (proporsional)                                                                                       |
|----------------------|------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| **Patch (no-shape)** | Tetap edit di-tempat + restart menimpa semua store; risiko sama dengan major | Edit **1 permukaan** → `contractRevision` baru → ACTIVE; spec tak tersentuh; rollback = tunjuk revisi lama |
| **Minor (additive)** | Sama seperti major (tak ada pembeda)                                         | Tambah path opsional → additive diff → tak ada regen paksa; auto-apply semua store di `apiVersion` itu     |
| **Major (breaking)** | 7 permukaan + big-bang + regen manual                                        | 7 permukaan tetap, tapi **terisolasi** di bundle baru + canary + auto-invalidate                           |

Perubahan patch/minor **backward-compatible by definition**, jadi boleh langsung `ACTIVE` untuk semua
store pada `apiVersion` itu — **tanpa** canary. Yang butuh canary/pin hanya **major/breaking**. Namun
revisi sebelumnya **tetap disimpan** agar patch yang ternyata buruk bisa di-*rollback* dengan menunjuk
balik revisi lama (tanpa deploy).

---

## 6. Bagaimana ini masuk ke "bundle immutable per versi"

Prinsip immutability (doc 01 §4.2) tetap berlaku: sebuah revisi yang sudah ACTIVE **tidak dimutasi**.
Perbaikan = **revisi baru**:

```
channel_api_contracts:
  (shopify, 2024-01, rev .0)  status=DEPRECATED   ← disimpan untuk rollback
  (shopify, 2024-01, rev .1)  status=DEPRECATED
  (shopify, 2024-01, rev .2)  status=ACTIVE       ← "shopify@2024-01" menunjuk ke sini
  (shopify, 2024-07, rev .0)  status=DRAFT         ← canary major berikutnya
```

- Pointer "versi ACTIVE untuk `(channel, apiVersion)`" menunjuk ke revisi terbaru.
- **Rollback patch** = pindahkan pointer ke revisi sebelumnya (instan).
- Store pin (doc 01 §4.3) biasanya di level `apiVersion` (mengikuti revisi ACTIVE); pin sampai level
  `contractRevision` hanya diperlukan untuk investigasi/rollback spesifik.

---

## 7. Aturan praktis (ringkas)

1. **Channel yang berubah** → `apiVersion` baru (major) atau minor tergantung breaking/additive.
2. **Kita yang mengoreksi bundle** → `contractRevision` baru pada `apiVersion` yang sama.
3. **Kita mengubah perilaku pipeline internal saja** → patch kode biasa, **bukan** versi.
4. **Tindakan ditentukan oleh diff**, bukan nomor: `breaking → regen + canary`; `additive → tak ada
   regen paksa, auto-apply`; `non-schema → spec tak tersentuh`.
5. **Selalu simpan revisi sebelumnya** — rollback = tunjuk pointer, bukan deploy.
