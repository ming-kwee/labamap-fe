# Frontend Contract — Per-Store Channel API Version Pin (Phase 3)

> Rekomendasi & kontrak FE untuk **pin versi API channel per-store** — backend Fase 3 sudah live di
> `bff-v11`. Pendamping [`FRONTEND-CHANNEL-CONTRACT-VERSIONS.md`](FRONTEND-CHANNEL-CONTRACT-VERSIONS.md)
> (halaman kelola versi kontrak, R1/R2 sudah dibangun) dan arsitektur di
> [`docs/versioning/01-*`](versioning/01-channel-api-schema-versioning.md).

---

## 0. Konteks & kenapa sekarang bisa dibangun

Fase 3 backend mengaktifkan **koeksistensi versi**: tiap store bisa **di-pin** ke sebuah `apiVersion`. Saat
di-pin, publish store itu memakai **contract beku versi tsb + JOLT spec yang cocok versi** — sementara store
lain bisa lanjut ke versi baru. Tanpa pin, store **mengikuti versi aktif** channel.

Doc contract-versions (§3) sebelumnya bilang "UI pin per-store = Fase 3, jangan dibuat dulu" — **kini
endpoint-nya ada**, jadi UI ini boleh dibangun.

---

## 1. Permukaan backend yang dikonsumsi

**Set / clear pin** (yang baru):
```
PUT /api/v1/channel-stores/{storeId}/api-version?organizationId={org}&apiVersion={ver}
  - apiVersion diisi  → PIN store ke versi itu
  - apiVersion kosong / diomit → CLEAR pin (ikuti versi aktif channel)
  → 200 ChannelStoreConnectionResponse (kini memuat field "apiVersion"); 404 bila store tak ada
```

**Baca pin store** (field baru di response yang sudah ada):
```
GET /api/v1/channel-stores?organizationId={org}[&channelType=…]   // list
GET /api/v1/channel-stores/{storeId}?organizationId={org}         // detail
  → ChannelStoreConnectionResponse.apiVersion : string | null      // null = ikuti versi aktif
```

**Daftar versi yang tersedia untuk sebuah channel** (mengisi dropdown + status):
```
GET /api/v1/admin/channel-api-contracts/{channelId}
  → ChannelApiContract[] { apiVersion, status, apiSchemaHash, updatedAt, … }
     status: DRAFT | ACTIVE | DEPRECATED | RETIRED
```

> Menentukan "versi aktif" channel = kontrak dengan `status === "ACTIVE"` dari daftar di atas. Itu yang
> dipakai bila store tidak di-pin.

---

## 2. Di mana & kontrol UI

Tempatkan di **detail/pengaturan store** (halaman `channel-stores`), satu kontrol per store:

```
┌─ Channel API Version ─────────────────────────────────────────────┐
│  Version:  [ Follow active (2024-07)  ▼ ]                          │
│            ├─ Follow active (2024-07)        ← default (clear pin)  │
│            ├─ 2024-07   [ACTIVE]                                    │
│            ├─ 2024-01   [DEPRECATED]                                │
│            └─ 2025-01   [DRAFT]  (testing)                          │
│                                                                     │
│  Status: Pinned to 2024-01 [DEPRECATED]     [ Clear pin ]          │
│  ⚠ Store ini memakai bentuk versi 2024-01 yang dibekukan.          │
└─────────────────────────────────────────────────────────────────┘
```

- **Dropdown** diisi dari `GET …/channel-api-contracts/{channelType}`:
  - Opsi pertama **"Follow active (<activeVersion>)"** → memanggil PUT dengan `apiVersion` kosong (clear).
  - Lalu tiap versi + **badge status** (ACTIVE/DEPRECATED/DRAFT). **RETIRED tidak ditampilkan/di-disable**
    (lihat §4).
- **Nilai terpilih** = `store.apiVersion` (kalau null → "Follow active").
- **Status line**: kalau di-pin, tampilkan "Pinned to X [status]" + tombol **Clear pin**; kalau tidak,
  "Following active (X)".

---

## 3. Aksi

| Aksi | Panggilan |
|---|---|
| Pin ke versi X | `PUT …/{storeId}/api-version?organizationId=…&apiVersion=X` |
| Clear pin (follow active) | `PUT …/{storeId}/api-version?organizationId=…` (tanpa `apiVersion`) |

Sesudah sukses: refresh store (badge/status berubah). Tampilkan toast. 404 → "Store tak ditemukan".

---

## 4. Guardrails (penting — copy jujur)

1. **RETIRED tidak boleh di-pin.** Versi RETIRED adalah arsip beku; publish di versi retired akan ditolak
   (di fase gate berikutnya). Sembunyikan/disable opsi RETIRED di dropdown.
2. **Pin ke non-ACTIVE = konfirmasi.** Untuk DEPRECATED atau DRAFT, tampilkan **dialog konfirmasi**:
   - DEPRECATED: "Store akan memakai bentuk **beku versi lama** (X). Cocok untuk menahan store yang belum
     siap pindah. Publish berikutnya memakai apiSchema/rules/endpoint versi X."
   - DRAFT: "Versi X masih **DRAFT (uji coba)**. Gunakan untuk canary sebelum versi dipromosikan ACTIVE."
3. **Sinyal stale (silang-rujuk).** Setelah pin ke versi lama, JOLT spec kategori yang ada mungkin
   di-generate untuk versi lain → muncul **badge/peringatan stale** (fitur Fase 0,
   [`FRONTEND-JOLT-SPEC-SCHEMA-STALENESS.md`](FRONTEND-JOLT-SPEC-SCHEMA-STALENESS.md)). Kalau bisa, tautkan:
   "spec untuk versi ini mungkin perlu diregenerasi" → arahkan ke aksi regenerate yang sudah ada.
4. **Clear = kembali ke aktif.** Jelaskan bahwa clear membuat store mengikuti versi ACTIVE terkini
   (otomatis ikut saat channel bump versi).
5. **Fail-safe backend:** pin ke versi yang **belum punya contract** akan **di-abaikan** backend (store
   degradasi ke versi aktif, publish tetap jalan). Idealnya UI hanya menawarkan versi yang ADA di daftar
   contract, jadi kasus ini tak terjadi dari UI.

---

## 5. Kriteria penerimaan

- [x] Kontrol versi muncul per store; nilai awal = `store.apiVersion` (null → "Follow active (<active>)").
- [x] Dropdown diisi dari `channel-api-contracts/{channelType}` dengan badge status; RETIRED disembunyikan
      (kecuali versi yang sedang di-pin, agar bisa dilihat & di-clear — §4.1).
- [x] Pin memanggil PUT dengan `apiVersion`; Clear memanggil PUT tanpa `apiVersion`; refresh (state update) + toast.
- [x] Konfirmasi untuk DEPRECATED/DRAFT dengan copy sesuai §4 (two-step: Save → Konfirmasi pin).
- [x] Status line membedakan "Following active (X)" vs "Pinned to X [status]" + tombol Clear.
- [x] Tautan stale-spec (ke halaman JOLT Specs, ter-filter channel) muncul saat memilih versi non-ACTIVE.

---

## 6. Yang JANGAN dibuat di sini

- **Membuat/mengedit versi kontrak** (apiSchema, promote/deprecate/retire) — itu di halaman **Contract
  Versions** ([`FRONTEND-CHANNEL-CONTRACT-VERSIONS.md`](FRONTEND-CHANNEL-CONTRACT-VERSIONS.md) R1/R2), bukan
  di pin store.
- **Editor apiSchema/rules.** Kontrak immutable; tak ada endpoint tulis selain lifecycle.
- **Mengubah kredensial/koneksi** — itu alur store yang terpisah.

---

## 7. Ringkas kontrak backend

| Kebutuhan FE | Backend |
|---|---|
| Set pin | `PUT /api/v1/channel-stores/{storeId}/api-version?organizationId&apiVersion` |
| Clear pin | PUT yang sama tanpa `apiVersion` |
| Baca pin store | `ChannelStoreConnectionResponse.apiVersion` (GET list/detail) |
| Daftar versi + status | `GET /api/v1/admin/channel-api-contracts/{channelId}` |
| Versi aktif channel | kontrak dengan `status === "ACTIVE"` dari daftar di atas |

---

## 8. Status implementasi FE (2026-08-06)

**SELESAI.** Kontrol pin ditempatkan di halaman **Platform Admin › Channel Store Connections**
(`src/app/(admin)/platform-admin/channel-stores/`), bukan di halaman Contract Versions (§6).

- `_types/channel-store-admin.ts` — `apiVersion?: string | null` pada `AdminChannelStore` + `mapRawStore`.
- `_services/channel-store-admin.service.ts` — `setApiVersionPin(orgId, storeId, apiVersion?)` →
  `PUT …/{storeId}/api-version?organizationId[&apiVersion]` (omit `apiVersion` = clear).
- `_components/VersionPinModal.tsx` — memuat versi via `ChannelApiContractService.listByChannel(channelType)`
  (di-reuse dari halaman Contract Versions), dropdown "Follow active (<active>)" + versi non-RETIRED dengan
  status, status line pinned/following, konfirmasi dua-langkah untuk DEPRECATED/DRAFT, tombol Clear pin,
  tautan stale-spec ke `channel-jolt-specs?channelId=…`.
- `_components/ChannelStoreAdminPage.tsx` — kolom **API Version** (chip "Follow active" / "📌 X") membuka modal;
  `handleVersionSaved` update state + toast.

Fail-safe §4.5 dijaga oleh UI: hanya versi yang ADA di daftar contract yang ditawarkan. R3 (versi ter-resolve
di publish-trace) tetap menunggu field BE. Verifikasi: `tsc --noEmit` & `next lint` bersih.
