# Frontend Contract — Channel API Contract Versions & Lifecycle (Phase 2)

> Analisa & rekomendasi FE untuk Fase 2 (2a/2b/2c/2d) channel API schema versioning yang diimplementasi
> hari ini di `bff-v11`. Konteks arsitektur: [`docs/versioning/01-*`](versioning/01-channel-api-schema-versioning.md)
> dan seri versioning lainnya.

---

## 0. Verdict singkat

**Perubahan FE WAJIB: TIDAK ADA.** Fase 2 adalah fondasi backend yang **behaviour-preserving**:
- Publish/analyze sekarang membaca dari **contract** (`channel_api_contracts`) alih-alih config mutable
  (Fase 2b), tapi karena versi ACTIVE selalu sinkron dengan config (model A), **hasilnya identik** — tak
  ada perilaku FE yang berubah, tak ada field response yang berubah, tak ada endpoint FE yang rusak.
- Tidak ada kontrak API yang dikonsumsi FE yang berubah.

**Perubahan FE OPSIONAL (forward-looking): ADA, satu.** Fase 2c menambah **endpoint transisi lifecycle**
(promote/deprecate/retire) yang **inheren digerakkan manusia** — tapi **belum punya UI**. Kalau organisasi
ingin admin mengelola versi kontrak lewat UI (bukan curl), FE perlu halaman **"Channel Contract Versions"**.
Nilainya kecil hari ini (baru 1 versi ACTIVE per channel) dan **matang saat Fase 3** (pin per-store + bump
versi nyata).

Ringkas: seperti Fase 1 (tak perlu FE), **bukan** seperti Fase 0 (perlu badge). Yang membedakan: endpoint
lifecycle 2c butuh tombol — tapi hanya jika Anda mau mengelola versi via UI.

---

## 1. Permukaan backend baru yang bisa dikonsumsi FE

Semua di bawah `/api/v1/admin/channel-api-contracts` (read-only + transisi lifecycle):

| Method | Path | Guna |
|---|---|---|
| GET | `/channel-api-contracts?channelId=&status=` | List kontrak (filter opsional) |
| GET | `/channel-api-contracts/{channelId}` | Semua versi satu channel |
| GET | `/channel-api-contracts/{channelId}/{apiVersion}` | Satu kontrak (404 bila tak ada) |
| PUT | `/channel-api-contracts/{channelId}/{apiVersion}/promote` | → ACTIVE (men-demote ACTIVE lain → DEPRECATED) |
| PUT | `/channel-api-contracts/{channelId}/{apiVersion}/deprecate` | → DEPRECATED |
| PUT | `/channel-api-contracts/{channelId}/{apiVersion}/retire` | → RETIRED |

Transisi ilegal → **409 CONFLICT** (pesan menyebut from→to); kontrak tak ada → **404**.

Bentuk objek `ChannelApiContract` (ringkas):
```json
{
  "id": "…",
  "channelId": "shopify",
  "apiVersion": "2024-01",
  "status": "ACTIVE",                       // DRAFT | ACTIVE | DEPRECATED | RETIRED
  "apiSchema": { "product": { "title": "" } },
  "apiSchemaHash": "sha256:9f8e…",
  "categoryApiSchemaExtensions": { "clothing": { "product.material": "" } },
  "postProcessingRules": [ … ],
  "payloadRequirements": [ … ],
  "attributeMappings": { … },
  "channelMetadataList": [ … ],             // endpoint {apiVersion}-templated
  "apiWrapperConfig": { "rootKey": "product" },
  "source": "snapshot:system-default-config",
  "createdAt": "…", "updatedAt": "…"
}
```

Transisi legal (untuk meng-enable/disable tombol di UI):
```
DRAFT      → ACTIVE | RETIRED
ACTIVE     → DEPRECATED | RETIRED
DEPRECATED → ACTIVE (rollback) | RETIRED
RETIRED    → (terminal)
```

---

## 2. Rekomendasi FE (opsional, berurut prioritas)

### R1 — Halaman admin "Channel Contract Versions" (read) — *fondasi*
Daftar kontrak per channel dengan kolom: `apiVersion`, **badge `status`** (DRAFT/ACTIVE/DEPRECATED/RETIRED),
`apiSchemaHash` (pendek), jumlah kategori ber-ekstensi, `updatedAt`. Detail: tampilkan apiSchema (read-only,
collapsible), daftar `categoryApiSchemaExtensions` per slug, endpoints, dan provenance.
- **Nilai sekarang:** kecil (biasanya 1 ACTIVE per channel). **Nilai penuh:** saat ada banyak versi (Fase 3).
- **Kaitan Fase 0:** halaman ini pasangan alami dari badge staleness yang sudah ada — `apiSchemaHash` di
  sini adalah acuan yang dipakai deteksi stale spec.

### R2 — Aksi lifecycle (promote/deprecate/retire) — *satu-satunya yang "kurang" secara UI*
Endpoint 2c **belum punya UI**. Kalau admin harus mengelola versi tanpa curl, tambahkan tombol di halaman R1:
- Tombol per baris versi; **enable/disable sesuai graf transisi** di §1 (mis. tombol Promote nonaktif untuk
  RETIRED).
- **Dialog konfirmasi**, khususnya Promote (jelaskan: "versi ACTIVE lain akan otomatis DEPRECATED") dan
  Retire (terminal).
- **Error handling:** 409 → toast "Transisi tidak sah (from→to)"; 404 → "Kontrak tak ditemukan".
- Setelah sukses, refresh list (status berubah, mungkin ada yang ter-demote).
> Catatan: sampai Fase 3 (pin per-store) ada, transisi ini **belum** mengubah versi yang dipakai publish
> (resolver masih pakai `config.apiVersion`). Jadi UI ini berguna untuk **menyiapkan/mengarsipkan** versi,
> bukan untuk rollback-live. Beri copy yang jujur agar admin tak berekspektasi rollback instan dulu.

### R3 — (opsional, butuh perubahan BE kecil) Tampilkan versi ter-resolve di Publish-Trace
Saat ini publish-trace inspector belum menampilkan **kontrak/versi mana** yang dipakai sebuah publish.
Menambahkan `apiVersion` (dan `contractStatus`) ke `PublishTraceResponse.joltSpec` akan membuat developer
melihat "publish ini memakai kontrak `shopify@2024-01 [ACTIVE]`". **Perlu penambahan field kecil di backend
lebih dulu** (belum ada). Prioritas rendah; berguna untuk diagnostik saat multi-versi.

---

## 3. Yang JANGAN dibuat di FE dulu

- **Editor apiSchema/rules kontrak.** Kontrak bersifat **immutable per versi**; tak ada endpoint tulis
  selain transisi lifecycle. Jangan buat form edit apiSchema di kontrak (edit dilakukan di config →
  di-snapshot migrasi).
- **UI pin versi per-store.** ~~Itu Fase 3 (belum ada endpoint).~~ **UPDATE: backend Fase 3 sudah live**
  (`PUT /api/v1/channel-stores/{storeId}/api-version`). UI-nya sekarang boleh dibangun — kontrak & rekomendasi
  ada di [`FRONTEND-STORE-VERSION-PIN.md`](FRONTEND-STORE-VERSION-PIN.md). Tetap **bukan** di halaman ini
  (pin ada di halaman Channel Stores, bukan di kelola-versi-kontrak).
- **Tombol "regenerate contract".** Tak ada; kontrak ACTIVE otomatis di-refresh dari config saat restart
  (model A).

---

## 4. Ringkas keputusan FE

| Kondisi | Aksi FE |
|---|---|
| Tidak ada kebutuhan mengelola versi via UI sekarang | **Tidak ada perubahan** (Fase 2 behaviour-preserving) |
| Admin ingin melihat versi kontrak | R1 (halaman read) — nilai penuh saat Fase 3 |
| Admin ingin promote/deprecate/retire via UI | R2 (tombol lifecycle) — satu-satunya gap UI dari 2c |
| Ingin diagnostik versi di trace | R3 (butuh field BE kecil dulu) |
| Pin per-store / rollback-live | **Fase 3 backend live** → lihat [`FRONTEND-STORE-VERSION-PIN.md`](FRONTEND-STORE-VERSION-PIN.md) |

**Rekomendasi akhir:** tidak ada yang mendesak. Kalau mau proaktif, kerjakan **R1 + R2** sebagai satu
halaman admin "Contract Versions" — itu menyiapkan operator untuk saat versi channel benar-benar di-bump
(dan melengkapi endpoint lifecycle 2c yang kini hanya bisa dipanggil via API).

---

## 5. Status implementasi FE (2026-08-06)

**R1 + R2 — SELESAI (proaktif).** Halaman admin baru dibangun mengikuti pola `channel-jolt-specs`.

Path: `src/app/(admin)/platform-admin/channel-contract-versions/`
- `_types/channel-api-contract.ts` — `ChannelApiContract`, `ContractStatus`, graf transisi
  (`LEGAL_TRANSITIONS`, `ACTION_TARGET`, `canRunAction`), `STATUS_STYLE`, helper (`shortHash`,
  `categoryExtensionCount`), `mapRawContract`.
- `_services/channel-api-contract.service.ts` — `listContracts({channelId,status})`, `listByChannel`,
  `getContract`, `transition/promote/deprecate/retire`. Melempar `ContractApiError` yang menyimpan
  `status` HTTP agar UI membedakan **409** (transisi ilegal, pesan from→to) vs **404**.
- `_components/ChannelContractVersionsPage.tsx` — **R1**: tabel per channel (badge status, `apiSchemaHash`
  pendek, jumlah kategori-ekstensi, source/provenance, `updatedAt`) + baris expand (apiSchema read-only
  collapsible, ekstensi per-slug, endpoints, rules, apiWrapperConfig). Filter channel + status, stat cards,
  info banner. **R2**: tombol Promote/Deprecate/Retire per baris, **enable/disable sesuai graf transisi**;
  klik → dialog konfirmasi; toast sukses + refresh; 409→"Transisi tidak sah (from→to)", 404→"Kontrak tak ditemukan".
- `_components/ConfirmTransitionModal.tsx` — dialog konfirmasi dengan copy **jujur**: Promote menjelaskan
  "versi ACTIVE lain otomatis DEPRECATED", Retire menegaskan terminal, plus catatan Fase-3 (transisi belum
  mengubah versi yang dipakai publish — untuk menyiapkan/mengarsipkan, bukan rollback-live).
- `page.tsx` + entri sidebar (Platform Admin › **Channel Contract Versions**).

**R3 — DITUNDA.** Butuh field BE (`apiVersion`/`contractStatus` di `PublishTraceResponse.joltSpec`) yang
belum ada. `apiVersion` sudah tampil di trace inspector; `contractStatus` menyusul saat BE menambah field.
Tidak menghalangi R1/R2.

**Sesuai §3 (JANGAN dibuat):** tidak ada editor apiSchema, tidak ada UI pin per-store (Fase 3), tidak ada
tombol "regenerate contract" — hanya read + transisi lifecycle.
