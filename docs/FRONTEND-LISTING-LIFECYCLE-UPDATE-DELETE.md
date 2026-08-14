# Frontend — Rekomendasi UI/UX untuk Listing Lifecycle (Create / Update / Delist)

> Turunan dari perubahan backend **P0-1…P0-5 + G1–G7** (lihat
> [`docs/arsitektur/`](arsitektur/README.md)). Fokus: **apa yang FE bisa/harus manfaatkan sekarang**, dan
> **bagaimana proses UPDATE & DELETE mengubah UI/UX**.
>
> TL;DR: publish berhenti menjadi "tombol sekali tembak yang balas instan". Sekarang tiap produk-per-store
> punya **siklus hidup listing** (DRAFT → PUBLISHED → DELISTED/FAILED), **operasi idempoten**
> (CREATE/NO-OP/UPDATE/DELIST), dan **resolusi asinkron** (bisa balas `PROCESSING` lalu selesai belakangan).
> FE perlu menampilkan status-per-listing, aksi kontekstual, dan riwayat.

---

## 1. Tiga konsep baru yang FE harus adopsi

1. **Listing-state per (produk × store).** Backend kini melacak status setiap listing:
   `DRAFT | READY | PUBLISHED | FAILED | DELISTED`, plus `channelProductId` (id di channel), `channelUrl`
   (deep-link ke listing), `publishAttempts`, `publishedAt`, `lastAttemptAt`, `publishError`.
2. **Operasi idempoten.** Response publish membawa `operation` = `CREATE | NOOP | UPDATE | DELIST`. Publish
   ulang **tidak** membuat duplikat: konten sama → **NO-OP** (tak ada call), konten berubah pada listing
   live → **UPDATE** (bukan create).
3. **Resolusi asinkron.** Publish bisa balas `syncStatus=PROCESSING` (workflow channel masih jalan). Backend
   me-resolve-nya di background (reconciler); FE harus **poll/refresh** untuk status final, bukan
   menganggap PROCESSING = gagal.

---

## 2. Data & endpoint baru yang tersedia untuk FE

| Kebutuhan UI | Endpoint | Field kunci |
|---|---|---|
| Status listing per store (untuk badge + link) | `GET /api/v1/ecommerce/channel-product-data/{masterProductId}/listings` | `status, channelType, channelProductId, channelUrl, publishAttempts, publishedAt, lastAttemptAt, publishError, syncWorkflowId` |
| Riwayat publish satu listing (timeline/audit) | `GET .../channel-product-data/{masterProductId}/{storeId}/history` | `operation, success, syncStatus, channelProductId, errorCode/Message, durationMs, steps[], createdAt, syncWorkflowId` |
| Publish (create/update/no-op) | `POST /api/v1/channels/publish` | resp: `operation, syncStatus, channelProductId, channelUrl, warnings, errors, syncSteps[]` |
| **Delist (baru)** | `POST /api/v1/channels/publish/delist` | body `{masterProductId, storeId, organizationId}`; resp `{success, operation:"DELIST", syncStatus, channelProductId}` |
| Progres batch | `POST /api/v1/channels/publish/batch` | per-store `{success, syncStatus, channelProductId}` |
| (Admin) DLQ publish macet | `GET /api/v1/channels/publish/jobs?status=DEAD` | `PublishJob[]` |

`steps[]` (per-hit, ter-mask): `stepName, status(OK/ERROR/SKIP), httpStatus, channelSuccess, iterationIndex,
durationMs, errorCode, errorMessage, at` → cocok untuk **progress granular** ("upload image 2/5", "create
product", "add variants") dan menunjuk step mana yang gagal.

> **Saran backend kecil (agar FE hemat 1 call):** perkaya `ChannelStepStoresResponse.StoreSummary`
> (dipakai grid Step-2/3) dengan `channelProductId` + `channelUrl` + `listingStatus`, sehingga badge "Live +
> link" langsung tersedia tanpa memanggil `/listings` terpisah.

---

## 3. Peta status → UI (state machine)

Gunakan ini untuk badge + aksi primer per store:

| listing `status` | + sinyal | Badge | Aksi primer | Aksi sekunder |
|---|---|---|---|---|
| `DRAFT`/`READY` | — | ⚪ Draft / Siap | **Publish** | — |
| `PUBLISHED` | konten = terakhir | 🟢 Live | **Up to date** (disabled) / "Lihat di channel" | **Delist**, Riwayat |
| `PUBLISHED` | konten berubah | 🟢 Live • ada perubahan | **Update listing** | Delist, Riwayat, Discard changes |
| resp `PROCESSING` | — | 🔵 Processing… | (spinner) auto-refresh | Batalkan? |
| resp `BLOCKED` (op=UPDATE) | update belum diaktifkan | 🟠 Perlu tindakan | **Delist lalu Publish** | Riwayat |
| `FAILED` (create) | tak live | 🔴 Gagal | **Coba lagi** (fix + Publish) | Lihat error, Riwayat |
| `PUBLISHED` + `publishError` (update gagal — G7) | masih live | 🟢 Live • update terakhir gagal | **Coba update lagi** | Delist, Riwayat |
| `DELISTED` | dihapus dari channel | ⚫ Delisted | **Publish ulang** (create baru) | Riwayat |

Perhatikan dua baris FAILED yang **berbeda** (§5.4 & §6): create-gagal = tak live (perbaiki), update-gagal =
**masih live** (listing aman, hanya editnya belum masuk).

---

## 4. Rekomendasi per layar

### 4a. Step-3 "Publish" (layar utama yang paling berubah)
- **Tombol primer kontekstual** per store (lihat tabel §3): "Publish" / "Update listing" / "Up to date" /
  "Coba lagi". Baca dari `/listings` saat membuka layar.
- **Hasil operasi eksplisit** setelah publish: tampilkan `operation`:
  - `CREATE` → "Listing dibuat" + link `channelUrl`.
  - `NOOP` → toast "Tidak ada perubahan sejak publish terakhir" (jangan tampilkan sebagai sukses-baru yang membingungkan).
  - `UPDATE` → "Listing diperbarui".
  - `BLOCKED` → banner actionable (lihat §5.3).
- **Penanganan PROCESSING**: jika resp `syncStatus=PROCESSING`, jangan tampilkan gagal — tampilkan "Sedang
  diproses…" + **poll** `/listings` (atau `/{storeId}/history`) tiap ~3–5 dtk sampai terminal, atau tombol
  "Refresh status".
- **Progress granular (opsional, bagus)**: jika resp membawa `syncSteps[]`, tampilkan langkah (create →
  media → variants) dengan status per step.

### 4b. Grid/daftar produk (multi-channel)
- **Kolom/badge status per channel** (chip warna dari §3) + ikon link ke `channelUrl`.
- Filter: "Live", "Draft", "Failed", "Delisted", "Processing".
- Tooltip pada Failed → `publishError` singkat + link ke Riwayat.

### 4c. Drawer "Riwayat & Status listing" (baru)
- Timeline dari `/{storeId}/history`: tiap attempt = `operation` + `syncStatus` + waktu + durasi + error.
- Expand attempt → daftar `steps[]` (hit per channel) dengan status/HTTP/error — untuk debugging seller/ops.
- (Admin) tampilkan `syncWorkflowId` sebagai deep-link ke Temporal.

### 4d. Bulk publish
- Progres per store (dari respons batch) + status akhir. Karena backend **membatasi konkurensi** (P0-4),
  bulk besar akan **bertahap** — tampilkan progress bar, jangan asumsikan instan.
- Hasil per store bisa campur (sebagian PROCESSING) → sama seperti §4a, poll yang PROCESSING.

### 4e. (Admin/ops) DLQ
- Tabel `GET .../publish/jobs?status=DEAD` — publish yang tak pernah selesai; kolom master/store/error +
  tombol retry manual (memicu publish ulang).

---

## 5. Bagaimana **UPDATE** mengubah UI/UX

**Inti perubahan:** "Publish" tidak lagi selalu berarti "buat baru". Untuk produk yang **sudah live**,
mengedit lalu menekan publish = **memperbarui listing yang sama** (tanpa duplikat).

### 5.1 Tombol berubah makna
- Produk belum live → **"Publish"**.
- Produk **live, konten sama** → **"Up to date"** (disabled) atau tampil "Tidak ada perubahan". (Backend =
  NO-OP; call di-skip, hemat.)
- Produk **live, konten berubah** → **"Update listing"**. FE bisa deteksi "ada perubahan" secara optimistik
  dari form dirty-state; kepastian dari backend = `operation=UPDATE` di response.

### 5.2 Indikator "ada perubahan belum ter-publish"
- Setelah user mengedit produk yang live, tandai store terkait "🟢 Live • ada perubahan" agar jelas edit
  belum sampai ke channel sampai ditekan Update.

### 5.3 State **BLOCKED** (penting sekarang) — update channel belum diaktifkan
Saat ini `app.publish.channel-update-enabled=false` untuk semua channel (menunggu verifikasi E2E). Jadi
**edit konten pada listing live akan balas `syncStatus=BLOCKED`, `operation=UPDATE`** dengan pesan
actionable. FE harus menampilkannya sebagai **banner kuning**, bukan error merah:
> "Mengubah listing yang sudah tayang belum tersedia untuk channel ini. **Delist** listing lalu **Publish
> ulang**, atau tunggu dukungan update aktif."
Sediakan tombol cepat **"Delist & Publish ulang"** (chain: `/delist` → sukses → `/publish`).

*(Ketika backend meng-aktifkan update per channel, response berubah dari BLOCKED → UPDATE tanpa perubahan
FE — FE cukup menangani kedua `operation`.)*

### 5.4 Kegagalan UPDATE tidak menghapus listing (G7)
Jika UPDATE **gagal**, listing **tetap live** (channel tak pernah dihapus saat update). Backend menjaga
status **PUBLISHED** + `publishError` (bukan FAILED). FE harus menampilkan:
> "🟢 Masih tayang — update terakhir gagal. Coba update lagi."
**Jangan** tampilkan "gagal/hilang" (menyesatkan; produk masih dijual di channel). Aksi = "Coba update lagi".

### 5.5 Asinkron
Update bisa `PROCESSING` sama seperti create → poll status (§4a).

---

## 6. Bagaimana **DELETE / DELIST** mengubah UI/UX

**Fitur baru:** menghapus listing dari channel via `POST /api/v1/channels/publish/delist`
`{masterProductId, storeId, organizationId}`.

### 6.1 Aksi & lokasi
- Tombol **"Delist"** / **"Hapus dari channel"** pada store yang berstatus **Live** (aktif hanya bila
  `isDelistable`: PUBLISHED + ada `channelProductId`).
- Bisa di: menu titik-tiga per store di grid, dan di drawer detail listing.

### 6.2 Konfirmasi (aksi destruktif menghadap-luar)
Delist menghapus listing dari marketplace (terlihat pembeli) → **wajib modal konfirmasi**:
> "Hapus listing ini dari **{channel}**? Produk tidak lagi tampil untuk pembeli. Data produk di sistem
> tetap ada — Anda bisa publish ulang nanti."
Tombol: **"Ya, delist"** / "Batal".

### 6.3 Hasil & status
- Sukses → status store menjadi **⚫ Delisted**; sembunyikan/putuskan link `channelUrl` (listing sudah tiada);
  tampilkan "Delisted • {waktu}". `channelProductId` **tetap disimpan** untuk audit (jangan tampilkan sebagai
  "masih live").
- **404 di channel = sukses** (idempoten) — kalau listing sudah tak ada, tetap berujung Delisted; FE tak perlu
  perlakukan khusus.
- Gagal → listing **tetap live**, status tak berubah; tampilkan error + "Coba lagi".
- PROCESSING → poll (§4a).

### 6.4 Setelah delist
- Store yang Delisted menampilkan aksi **"Publish ulang"** → menghasilkan **listing baru** (`operation=CREATE`,
  `channelProductId` baru). Komunikasikan: "Publish ulang membuat listing baru di channel."

### 6.5 Delist sebagai jalan-pintas update (sementara)
Karena UPDATE masih BLOCKED (§5.3), pola **"Delist → Publish ulang"** adalah cara resmi mengubah konten
listing live saat ini. Sediakan sebagai satu aksi terpandu di banner BLOCKED.

---

## 7. Edge & error handling (ringkas)

| Kondisi backend | Yang FE tampilkan |
|---|---|
| `operation=NOOP` | Info "tidak ada perubahan", bukan sukses-baru |
| `syncStatus=PROCESSING` | Spinner + poll; **bukan** gagal |
| `syncStatus=BLOCKED` (op=UPDATE) | Banner kuning + "Delist & Publish ulang" |
| `FAILED` create | Merah "Gagal — belum tayang", tombol Coba lagi + error |
| `PUBLISHED` + `publishError` (update gagal, G7) | Hijau "Masih tayang — update gagal", Coba update lagi |
| Rate-limited (P0-4) | "Sedang sibuk, coba beberapa saat lagi" (retry, bukan error keras) |
| `DELISTED` | ⚫ Delisted, aksi Publish ulang |

---

## 8. Prioritas implementasi FE

**Must (agar konsisten dengan backend baru):**
1. Baca `/listings` → **badge status + aksi kontekstual** per store (Publish/Update/Up-to-date/Retry).
2. Tangani **PROCESSING** (poll) dan **BLOCKED** (banner + Delist&Republish).
3. Tampilkan **`operation`** hasil publish (create/no-op/update) dengan jelas.
4. Bedakan **create-gagal (tak live)** vs **update-gagal (masih live, G7)**.

**Should:**
5. Aksi **Delist** + modal konfirmasi + state Delisted + Publish-ulang.
6. Drawer **Riwayat** dari `/{storeId}/history` (timeline + steps).

**Nice:**
7. Progress granular dari `steps[]`; bulk progress bertahap; deep-link Temporal (admin); DLQ view.

---

## 9. Catatan integrasi
- Semua endpoint di base-path `/labamap` (mis. `POST /labamap/api/v1/channels/publish/delist`).
- Status enum listing: `DRAFT, READY, PUBLISHED, FAILED, DELISTED`. `operation`: `CREATE, NOOP, UPDATE, DELIST`.
  `syncStatus`: `COMPLETED, FAILED, PROCESSING, PENDING, BLOCKED, DRY_RUN`.
- UPDATE penuh (edit listing live) **masih di belakang flag** `channel-update-enabled` (default off) sampai
  E2E per channel selesai — sampai itu, FE menangani jalur **BLOCKED → Delist & Publish ulang**. FE tak perlu
  berubah saat flag di-flip; cukup menangani `operation=UPDATE`/`BLOCKED` sejak awal.
