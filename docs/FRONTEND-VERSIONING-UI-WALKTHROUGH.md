# Panduan Melihat UI Fase 2 & Fase 3 (Channel API Versioning)

> Panduan langkah-demi-langkah (perlahan) untuk **membuka dan melihat sendiri** UI baru yang
> ditambahkan untuk channel API schema versioning:
> - **Fase 2** → halaman **Channel Contract Versions** (kelola versi kontrak + lifecycle).
> - **Fase 3** → **pin versi API per-store** di halaman **Channel Store Connections**.
>
> Dokumen kontrak: [`FRONTEND-CHANNEL-CONTRACT-VERSIONS.md`](FRONTEND-CHANNEL-CONTRACT-VERSIONS.md)
> (Fase 2) dan [`FRONTEND-STORE-VERSION-PIN.md`](FRONTEND-STORE-VERSION-PIN.md) (Fase 3).

---

## 0. Ringkasan: apa yang berubah di layar

| Fase       | Di mana                                                                                 | Yang baru terlihat                                                                                                                                                                                   |
|------------|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Fase 2** | Sidebar → **Platform Admin › Channel Contract Versions** (halaman baru)                 | Tabel versi kontrak per channel: badge status (DRAFT/ACTIVE/DEPRECATED/RETIRED), `apiSchemaHash` pendek, jumlah kategori ber-ekstensi, baris bisa di-expand, **tombol Promote / Deprecate / Retire** |
| **Fase 3** | Sidebar → **Platform Admin › Channel Store Connections** (halaman lama, **kolom baru**) | Kolom **"API Version"** di tabel store: chip `Follow active` atau `📌 <versi>`. Klik → modal **pin versi**                                                                                           |

Dua-duanya ada di grup **Platform Admin** pada sidebar kiri.

---

## 1. Prasyarat (baca dulu, penting)

UI ini **mengambil data dari backend sungguhan** (tidak ada mock). Supaya tabel terisi:

1. **Backend harus jalan** di `http://localhost:8888/labamap/api/v1`.
   - Fase 2 memanggil `/admin/channel-api-contracts`.
   - Fase 3 memanggil `/channel-stores` + `/channel-stores/{id}/api-version`.
2. Kalau backend **belum jalan / endpoint belum ada**, halaman tetap terbuka tetapi menampilkan
   **pesan error** atau **empty state** (lihat §5). Itu normal — UI-nya sudah ada, tinggal menunggu data.

> Kalau hanya ingin **melihat bentuk UI-nya** (bukan data asli), tetap ikuti langkah di bawah;
> yang tampil adalah kerangka halaman + pesan "gagal memuat / belum ada data".

---

## 2. Menjalankan aplikasi

Buka terminal di folder proyek, lalu:

```bash
npm install        # sekali saja, kalau belum
npm run dev        # menjalankan Next.js di http://localhost:3000
```

Ada juga varian yang sekaligus menunjuk backend lokal (opsional):

```bash
npm run dev:local-api   # set NEXT_PUBLIC_BACKEND_API_URL ke localhost:8888
```

> Catatan: service halaman ini **hardcode** ke `http://localhost:8888/labamap/api/v1`, jadi
> `npm run dev` biasa pun sudah cukup selama backend ada di port 8888.

Setelah muncul `ready - started server on http://localhost:3000`, buka browser ke
**http://localhost:3000** dan login seperti biasa.

Tip: kalau port 3000 nyangkut, pakai `npm run dev:fresh` (mematikan proses lama di port 3000 dulu).

---

## 3. Melihat UI **Fase 2** — Channel Contract Versions

### 3.1 Navigasi
1. Lihat **sidebar kiri**.
2. Klik grup **Platform Admin** (ikon pesawat kertas) untuk membukanya.
3. Klik menu **Channel Contract Versions**.
   - Atau langsung ke URL: **http://localhost:3000/platform-admin/channel-contract-versions**

### 3.2 Yang harus Anda lihat
```
┌ Channel Contract Versions ─────────────────────────────── [⟳ refresh] ┐
│ [Total] [Active] [Draft] [Deprecated] [Channels] [Showing]  ← kartu statistik │
│ ℹ Info banner: penjelasan contract immutable + lifecycle + catatan Fase 3     │
│ Filter:  Channel [All ▼]   Status [ all | draft | active | deprecated | ... ] │
│ ┌───────────────────────────────────────────────────────────────────────────┐│
│ │ Channel/Version │ Status │ Schema │ Contents │ Source │ Updated │ Lifecycle ││
│ │ Shopify 2024-01 │ ●Active│ sha256…│ 3 endp…  │ snap…  │ Aug 6   │ [Promote] ││
│ │                 │        │ 1 cat  │          │        │         │ [Deprecate]│
│ │                 │        │        │          │        │         │ [Retire]  ││
│ └───────────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────────────┘
```

Cek satu per satu (perlahan):

1. **Kartu statistik** di atas — Total / Active / Draft / Deprecated / Channels / Showing.
2. **Badge status** di kolom Status: `● Active` (hijau), `▲ Deprecated` (kuning), `✎ Draft` (abu),
   `■ Retired` (merah).
3. **Kolom Schema** — `apiSchemaHash` versi pendek (mis. `sha256:9f8e12…`) + "N categories ext".
4. **Klik ikon panah (⌄)** di kolom paling kanan pada sebuah baris → baris **mengembang** dan
   menampilkan detail: apiSchema (read-only, bisa dibuka), daftar `categoryApiSchemaExtensions`
   per-slug, endpoints, rules, `apiWrapperConfig`, id, timestamp.
5. **Tombol lifecycle** (Promote / Deprecate / Retire):
   - Tombol **aktif/nonaktif otomatis** sesuai status baris. Contoh: baris **RETIRED** → semua tombol abu (disabled).
   - Klik salah satu → muncul **dialog konfirmasi** dengan penjelasan jujur (mis. Promote: "versi ACTIVE
     lain akan otomatis DEPRECATED"; Retire: terminal) + catatan Fase-3.
   - Setelah **Konfirmasi** → toast sukses + tabel refresh (status berubah).
   - Kalau transisi tidak sah → toast merah "Transisi tidak sah (from→to)".

### 3.3 File terkait (kalau mau lihat kodenya)
`src/app/(admin)/platform-admin/channel-contract-versions/`
- `_components/ChannelContractVersionsPage.tsx` — tabel + tombol lifecycle
- `_components/ConfirmTransitionModal.tsx` — dialog konfirmasi
- `_services/channel-api-contract.service.ts` — panggilan API
- `_types/channel-api-contract.ts` — tipe + graf transisi

---

## 4. Melihat UI **Fase 3** — Pin Versi API per-store

### 4.1 Navigasi
1. Sidebar kiri → grup **Platform Admin**.
2. Klik menu **Channel Store Connections**.
   - Atau URL: **http://localhost:3000/platform-admin/channel-stores**

### 4.2 Muat data store dulu
Halaman ini butuh **Organization ID**:
1. Di kotak **Organization**, isi org id (mis. `org_123`) — biasanya sudah terisi dari akun Anda.
2. Klik **Load**. Tabel store akan muncul.

### 4.3 Yang baru: kolom "API Version"
```
┌ Store table ───────────────────────────────────────────────────────────────────┐
│ Store │ Channel │ URL │ Region │ Status │ API Version │ Connected │ Order │ Actions │
│ Toko  │ Shopify │ …   │ us     │ ●Active│ [Follow active] │ Aug 6 │ 1 │ ✎ 🔑 ⦿ 🗑 │
│ Toko2 │ Shopee  │ …   │ id     │ ●Active│ [📌 2024-01]    │ Aug 6 │ 2 │ ✎ 🔑 ⦿ 🗑 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

1. Lihat kolom **"API Version"** (di antara **Status** dan **Connected**).
   - **`Follow active`** (abu, chip berbingkai) → store mengikuti versi ACTIVE channel (belum di-pin).
   - **`📌 <versi>`** (biru) → store di-pin ke versi tertentu.

### 4.4 Buka modal pin
2. **Klik chip** di kolom API Version pada salah satu store → muncul modal **"Channel API Version"**.
```
┌ Channel API Version ─────────────────────────────  [✕] ┐
│ Toko · Shopify                                          │
│ Following active  (2024-07)          ← status line       │
│ Version: [ Follow active (2024-07) ▼ ]                   │
│          ├ Follow active (2024-07)                       │
│          ├ 2024-07 — ACTIVE                              │
│          ├ 2024-01 — DEPRECATED                          │
│          └ 2025-01 — DRAFT (testing)                     │
│ Selected: ▲ Deprecated   sha256:…                        │
│ ⚠ (kalau pilih non-ACTIVE) copy konfirmasi + link stale  │
│ [Clear pin]                    [Cancel] [Pin ke 2024-01] │
└──────────────────────────────────────────────────────────┘
```

Cek perlahan:

3. **Dropdown Version**: opsi pertama **"Follow active (<versi ACTIVE>)"**, lalu tiap versi + statusnya.
   Versi **RETIRED disembunyikan** (kecuali kalau store memang sedang di-pin ke versi retired, agar bisa di-clear).
4. **Status line** di atas: "Following active (X)" atau "Pinned to X [status]".
5. **Pilih versi non-ACTIVE** (DEPRECATED atau DRAFT) → muncul **kotak peringatan** dengan copy jujur:
   - DEPRECATED: "Store akan memakai bentuk beku versi lama…"
   - DRAFT: "Versi X masih DRAFT (uji coba)…"
   - Plus **tautan** "cek & regenerate spec untuk <channel> →" (menuju halaman JOLT Specs ter-filter channel).
6. **Klik "Pin ke X"**:
   - Untuk versi ACTIVE → langsung tersimpan.
   - Untuk versi non-ACTIVE → tombol berubah jadi **"Konfirmasi pin → X"** (kuning); klik lagi untuk benar-benar simpan.
7. **Tombol "Clear pin"** (muncul kalau sedang di-pin) → kembali "Follow active".
8. Setelah sukses → modal tertutup, **toast** muncul, dan chip di tabel berubah
   (mis. dari `Follow active` → `📌 2024-01`).

### 4.5 File terkait
`src/app/(admin)/platform-admin/channel-stores/`
- `_components/ChannelStoreAdminPage.tsx` — kolom "API Version" + pemicu modal
- `_components/VersionPinModal.tsx` — modal pin (dropdown, konfirmasi, clear, link stale)
- `_services/channel-store-admin.service.ts` — `setApiVersionPin(...)`
- `_types/channel-store-admin.ts` — field `apiVersion` pada store

---

## 5. Kalau backend belum siap — apa yang terlihat?

- **Fase 2 (Contract Versions):** tabel kosong → **empty state** ("No channel contracts yet") atau
  **kotak error merah** kalau fetch gagal ("Check that the backend is running at localhost:8888").
- **Fase 3 (Store Version Pin):**
  - Store list tetap butuh backend `/channel-stores`. Kalau kosong → empty state store.
  - Buka modal pin tanpa backend contracts → dropdown menampilkan "No published contract versions for this
    channel yet." (hanya opsi "Follow active").

Ini **bukan bug** — UI sengaja dibuat "degrade gracefully" sampai endpoint/data tersedia.

---

## 6. Checklist cepat

- [ ] `npm run dev` jalan, buka http://localhost:3000
- [ ] Backend hidup di port 8888 (kalau ingin data asli)
- [ ] **Fase 2:** Platform Admin › Channel Contract Versions → lihat badge status, expand baris, coba tombol lifecycle
- [ ] **Fase 3:** Platform Admin › Channel Store Connections → Load org → lihat kolom **API Version** → klik chip → coba pin/clear

---

## 7. Catatan

- **R3** (menampilkan versi kontrak ter-resolve di **Publish-Trace Inspector**) **belum** ada di UI —
  menunggu field kecil dari backend (`contractStatus`). Jadi tidak ada yang bisa dilihat untuk R3 dulu.
- Sampai gate publish menegakkannya, **transisi lifecycle Fase 2 belum mengubah versi yang benar-benar
  dipakai publish** — copy di dialog sudah menjelaskan ini secara jujur.
