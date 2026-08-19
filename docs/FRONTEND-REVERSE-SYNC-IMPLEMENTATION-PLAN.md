# Frontend — Reverse Sync (Channel → Platform): Rencana Implementasi

> **Audiens:** tim frontend. **Backend:** sudah TERIMPLEMENTASI (R0–R5, BFF-only, 70 tes hijau). Dokumen ini =
> kontrak API + peta menu/halaman (baru vs ditingkatkan) + alur pengguna + fase. Sumber kebenaran arsitektur:
> [`docs/reversesync/05`](reversesync/05-config-source-of-truth.md). **Tak ada perubahan jalur forward** — reverse
> hidup berdampingan, menulis ke Step-2/draft, tak pernah menimpa master global secara diam-diam.

---

## 0. TL;DR untuk FE

Reverse sync = **menarik data produk DARI channel (Shopee/Shopify) KEMBALI ke platform**. FE perlu:

1. **Tombol "Tarik dari Channel"** di konteks (produk × store) → panggil `/pull` → tampilkan **preview 3-ember**.
2. **Halaman Preview/Diff** — apa yang akan berubah (master-mapped + diff, channel-only, dibuang) sebelum menulis.
3. **Inbox "Saran dari Channel"** (draft-review) — approve/reject perubahan yang menyentuh master global.
4. **Peningkatan** di: product-store matrix (kolom status reverse), admin (policy per-atribut, webhook, reverse-JOLT inspector).

Base URL semua endpoint: `{{host}}/labamap/api/v1/channels/reverse`.

---

## 1. Model mental (cukup untuk FE)

**Tiga ember** — tiap field channel yang masuk diklasifikasikan:

| Ember | Arti | Ke mana | Warna/ikon saran |
|---|---|---|---|
| **(a) master-mapped** | menaut ke atribut master | draft-review **atau** per-store override (tergantung policy) | biru — perlu keputusan |
| **(b) channel-only** | field channel sah tanpa padanan master | Step-2 `channelData` | abu — auto, informatif |
| **(c) discarded** | operasional/tak dikenal | dibuang | abu pudar — collapsed default |

**Arah kebenaran (per atribut master, DATA `reverseWritePolicy`):**
- `DRAFT_REVIEW` → jadi **suggestion** (manusia approve dulu sebelum master berubah).
- `CHANNEL_AUTHORITATIVE` → ditulis **per-store** (mis. stok/harga aktual), tak sentuh master global.
- `MASTER_AUTHORITATIVE` / `IGNORE` → **skip** (master menang).

**Guardrail yang WAJIB tercermin di UI:**
- Master **global** hanya berubah lewat **Accept suggestion** (aksi eksplisit + konfirmasi).
- Reverse **tak menebak** — struktur yang belum bisa dibongkar muncul sebagai **"de-derivation notes"** (informatif, bukan error).
- Reverse **BFF-only** — tak ada interaksi ke Temporal/worker dari FE.

---

## 2. Kontrak API (nyata, dari controller)

Semua di bawah `POST/GET {host}/labamap/api/v1/channels/reverse`. Semua response `application/json`.

### 2.1 `POST /pull` — tarik item dari channel + preview (JALUR UTAMA FE)
Fetch item langsung dari channel (pakai kredensial store tersimpan) lalu klasifikasi. **Tanpa payload manual.**
```jsonc
// Request (ReversePullRequest)
{ "organizationId": "org1", "storeId": "store123", "channelProductId": "803238708",
  "masterProductId": "mp1",   // opsional; bila kosong BFF coba resolve dari linkage
  "apiVersion": "2024-01" }   // opsional; default = versi config channel
// Response 200 → ReversePreview (lihat 2.7). 4xx/5xx → { "error": "..." }
```
> Catatan: hanya channel dengan `reverseSyncConfig.itemUrlTemplate` (Shopify) yang mendukung pull sekarang.
> Channel yang butuh signing (Shopee GET) → 4xx "reverse pull not configured" → FE tampilkan state "pakai preview manual".

### 2.2 `POST /pull/apply` — tarik + langsung tulis Step-2
```jsonc
// Request: ReversePullRequest (sama seperti /pull)
// Response 200 → ReverseApplyResult (2.8)
```

### 2.3 `POST /preview` — preview dari payload yang FE kirim (dry-run / channel tanpa pull)
Dipakai bila FE sudah punya payload channel (mis. hasil GET manual Shopee) atau untuk testing.
```jsonc
// Request (ReversePreviewRequest)
{ "channelType": "shopee", "masterProductId": "mp1", "storeId": "store123",
  "channelPayload": { /* body item channel apa adanya */ } }
// Response 200 → ReversePreview
```

### 2.4 `POST /apply` — tulis Step-2 dari payload (per-store, merge, tak sentuh master global)
```jsonc
// Request (ReverseApplyRequest)
{ "channelType": "shopee", "masterProductId": "mp1", "storeId": "store123",
  "organizationId": "org1", "channelProductId": "803238708",
  "channelPayload": { /* … */ } }
// Response 200 → ReverseApplyResult
```

### 2.5 `POST /review` — klasifikasi + route by policy (buat suggestion / per-store)
```jsonc
// Request: ReverseApplyRequest (sama seperti /apply)
// Response 200 → ReverseReviewResult { suggested[], perStoreApplied[], skipped[] }
```

### 2.6 Suggestions (draft-review inbox)
```
GET  /suggestions?organizationId=&status=  → ReverseSuggestion[]  (INBOX org-wide, lintas produk; status default PENDING)
GET  /suggestions/count?organizationId=&status= → { "count": 3 }  (badge nav)
GET  /suggestions/{masterProductId}        → ReverseSuggestion[]  (per-produk, status PENDING)
POST /suggestions/{id}/accept              → ReverseSuggestion  ⚠️ MENULIS MASTER GLOBAL
POST /suggestions/{id}/reject              → ReverseSuggestion  (master tak berubah)
```
> `ReverseSuggestion` kini punya `organizationId` (untuk scope inbox). `/suggestions` tanpa `organizationId` =
> semua org (admin). Literal `/suggestions/count` diprioritaskan di atas `/suggestions/{masterProductId}`.

### 2.6b Admin — set reverseWritePolicy (P5) & katalog atribut kategori (P2 label)
```
// P5 — ubah arah-kebenaran per atribut master (validasi terhadap enum → 400 bila nilai salah)
PATCH /api/v1/admin/master-attributes/{id}/reverse-policy?policy=DRAFT_REVIEW
      → EcommerceMasterAttributeDocument (reverseWritePolicy ter-update)
      // allowed: MASTER_AUTHORITATIVE | CHANNEL_AUTHORITATIVE | DRAFT_REVIEW | IGNORE

// P2 — label atribut kategori (resolve key numerik 200134 → "Material"); ENDPOINT SUDAH ADA
GET /api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}/schema?organizationId=…
    → form schema; tiap field punya fieldName (= native attribute_id) + label
    // FE bangun lookup { "200134": "[S]Material", … } untuk seksi channel-only di P2
```

### 2.7 (admin/debug) `GET /jolt-spec/{channelId}` — proyeksi reverse-JOLT inspectable
```jsonc
{ "channelId": "shopify", "operation": "shift",
  "spec": { "product.title": "name", "product.vendor": "vendor" },
  "ambiguousExcluded": ["product.title"],   // many-to-one, di-skip
  "generatedFrom": "channel_field_mappings (read backwards…)",
  "note": "derived; not a source of truth; not the executor" }
```

### 2.8 Bentuk response inti (untuk komponen)
```jsonc
// ReversePreview
{ "channelType": "shopee", "masterProductId": "mp1", "storeId": "store123",
  "masterMapped": [ { "channelPath": "product.title", "channelValue": "Baju Baru",
                      "masterAttrId": "name", "currentMasterValue": "Baju Lama", "changed": true, "note": null } ],
  "channelOnly":  [ { "channelPath": "200134", "channelValue": 1221, "note": "known channel field, no master mapping" } ],
  "discarded":    [ { "channelPath": "item_id", "channelValue": 803238708, "note": "unknown/operational" } ],
  "deDerivationNotes": [ "de-derivation pending at 'model' — …" ],
  "summary": { "masterMapped": 1, "channelOnly": 1, "discarded": 1, "wouldChangeMaster": 1 } }

// ReverseApplyResult
{ "masterProductId":"mp1", "storeId":"store123", "channelType":"shopee", "applied": true,
  "masterOverridesWritten": ["price"], "channelDataWritten": ["200134","200162"],
  "variantsReconciled": ["red-m","blue-s"], "discarded": 3, "preview": { /* ReversePreview */ } }

// ReverseReviewResult
{ "masterProductId":"mp1","storeId":"store123","channelType":"shopee",
  "suggested": ["name","description"], "perStoreApplied": ["price","inventory"], "skipped": ["weight"] }

// ReverseSuggestion
{ "id":"64f…", "masterProductId":"mp1", "storeId":"store123", "channelType":"shopee",
  "masterAttrId":"name", "suggestedValue":"Baju Baru", "currentValue":"Baju Lama",
  "status":"PENDING", "channelProductId":"803238708",
  "createdAt":"2026-08-19T10:00:00", "resolvedAt":null }
```

### 2.9 Error & status
- `200` sukses. `400` request tak valid / channel belum dikonfigurasi untuk pull. `404` produk/store tak ada.
  `422` payload/kondisi tak dapat diproses. `500` internal.
- Body error konsisten: `{ "error": "<pesan>" }` (untuk `/pull*`) atau body kosong (untuk `/preview`/`/apply` pada 5xx).
  FE tampilkan `error` bila ada, else pesan generik.

---

## 3. Peta menu & halaman: BARU vs DITINGKATKAN

| # | Item | Tipe | Endpoint dipakai | Prioritas |
|---|---|---|---|---|
| P1 | **Tombol "Tarik dari Channel"** (di product-store view) | tingkatkan | `/pull` | P0 |
| P2 | **Reverse Preview / Diff** (modal atau page) | baru | `/pull`, `/preview`, `/pull/apply`, `/apply`, `/review` | P0 |
| P3 | **Inbox "Saran dari Channel"** (draft-review) | baru | `/suggestions/*` | P0 |
| P4 | **Kolom status reverse** di product-store matrix | tingkatkan | (data dari product-store) | P1 |
| P5 | **Admin — Reverse Write Policy** per atribut master | tingkatkan (master-attribute admin) | (admin master-attr) | P1 |
| P6 | **Admin — Reverse-JOLT Inspector** | tingkatkan (JOLT admin) | `/jolt-spec/{channelId}` | P2 |
| P7 | **Admin — Webhook & Config reverse** per channel | tingkatkan (channel config admin) | (channel config) | P2 |

> Menu nav: tambahkan grup **"Reverse Sync"** (atau lipat ke "Products"/"Channels" yang ada) dengan sub-item
> **Suggestions** (P3). P1/P2/P4 hidup di dalam halaman produk/store yang sudah ada. P5–P7 di area Admin.

---

## 4. Rincian tiap halaman

### P1 — Tombol "Tarik dari Channel" (product × store)
- **Lokasi:** di baris/kartu tiap store pada halaman produk (tempat status publish ditampilkan sekarang), atau di store-detail.
- **Aksi:** klik → `POST /pull { organizationId, storeId, channelProductId, masterProductId }`.
  - `channelProductId` diambil dari data linkage produk-store (BE sudah simpan). Bila kosong → disable tombol + tooltip "produk belum ter-link ke channel".
- **State:** loading → buka P2 dengan hasil preview. Error `400 "not configured"` → tampilkan info "channel ini belum mendukung tarik-otomatis; gunakan Preview manual" (buka P2 mode manual).

### P2 — Reverse Preview / Diff (inti UX)
Menampilkan `ReversePreview`. Layout 3 seksi + ringkasan + notes.

```
┌ Ringkasan ────────────────────────────────────────────────┐
│ 1 akan ubah master · 1 channel-only · 1 dibuang · 1 catatan │
└────────────────────────────────────────────────────────────┘
▸ (a) MASTER-MAPPED (1)                     [perlu keputusan]
   name:  "Baju Lama"  →  "Baju Baru"   ● changed
▸ (b) CHANNEL-ONLY (1)                       [→ Step-2 channelData]
   200134 (Material) = 1221
▸ (c) DIBUANG (1)                            [collapsed]
   item_id = 803238708
⚠ Catatan de-derivation (1)
   "model — perlu inverse lanjutan"
[ Batal ]  [ Kirim ke Review ]  [ Terapkan ke Step-2 ]
```

- **Seksi (a) master-mapped:** tampilkan diff `currentMasterValue → channelValue`. Badge **changed** bila `changed=true`; `changed=null` (master belum punya nilai) → badge "baru". Ini yang FE tekankan.
- **Seksi (b) channel-only:** list `channelPath = channelValue` + `note`. Untuk atribut kategori (key numerik seperti `200134`), idealnya FE resolve label dari katalog atribut channel bila tersedia (opsional; BE punya `CategoryAttributesCache`).
- **Seksi (c) discarded:** collapsed default.
- **de-derivation notes:** panel info kuning (bukan error) — "struktur yang belum dibongkar; tak diimpor".
- **Aksi:**
  - **Terapkan ke Step-2** → `POST /pull/apply` (bila datang dari pull) atau `/apply` (bila preview manual). Tampilkan `ReverseApplyResult` (chip: X master-override, Y channelData, Z varian).
  - **Kirim ke Review** → `POST /review`. Tampilkan `ReverseReviewResult` (suggested/perStoreApplied/skipped). Beritahu bahwa item `suggested` masuk Inbox (P3).
  - Keduanya idempoten (merge non-destruktif) — aman diklik ulang.

### P3 — Inbox "Saran dari Channel" (draft-review)
- **Sumber:** `GET /suggestions/{masterProductId}` → list `PENDING`. (Untuk daftar global lintas produk, BE belum punya endpoint agregat → lihat §7 "gap".)
- **Tiap kartu:** `masterAttrId`, diff `currentValue → suggestedValue`, `channelType`, `storeId`, `createdAt`, `channelProductId`.
- **Aksi per kartu:**
  - **Terima** → `POST /suggestions/{id}/accept`. ⚠️ **Ini mengubah master global** → tampilkan **dialog konfirmasi** ("Nilai master `name` akan diubah dari X ke Y untuk SEMUA channel. Lanjut?"). Sukses → kartu jadi ACCEPTED (hilang dari PENDING).
  - **Tolak** → `POST /suggestions/{id}/reject`. Master tak berubah.
- **Empty state:** "Tidak ada saran menunggu."
- Optional: badge angka PENDING di menu nav (perlu endpoint count / hitung dari list per produk).

### P4 — Kolom status reverse (product-store matrix)
Tambah indikator per (produk × store), data dari `channel_product_data` (BE sudah simpan):
- `lastReverseSyncedAt` — "Terakhir tarik: …".
- `channelUpdatedAt` — "Channel berubah: …" (bila lebih baru dari lastReverseSynced → badge "ada update").
- `channelProductId` — link/ikon "ter-link".
> Perlu BE mengekspos field ini di response product-store yang sudah ada (lihat §7 gap bila belum).

### P5 — Admin: Reverse Write Policy per atribut master
Di halaman admin master-attribute (yang sudah ada), tambah kolom/editor **`reverseWritePolicy`**:
- Dropdown: `MASTER_AUTHORITATIVE` (default) · `CHANNEL_AUTHORITATIVE` · `DRAFT_REVIEW` · `IGNORE`.
- Tooltip tiap opsi (lihat §1). **Endpoint:** `PATCH /api/v1/admin/master-attributes/{id}/reverse-policy?policy=…`
  (§2.6b) — server validasi terhadap enum (400 bila salah); response = dokumen atribut ter-update.

### P6 — Admin: Reverse-JOLT Inspector
Di area JOLT admin (ada `FRONTEND-JOLT-*` docs), tambah tab/panel **"Reverse (channel→master)"**:
- `GET /jolt-spec/{channelId}` → tampilkan tabel `spec` (`channelPath → masterField`) + daftar `ambiguousExcluded` (badge "di-skip: many-to-one") + `note` ("derived, read-only").
- Read-only — tegaskan ini **proyeksi**, bukan editor.

### P7 — Admin: Webhook & Config reverse per channel
Di channel-config admin, tampilkan (read-only cukup untuk v1) ringkasan `reverseSyncConfig`:
- `webhookEnabled` + URL webhook untuk didaftarkan (`/api/v1/webhooks/{channelType}/products-update`).
- Apakah `itemUrlTemplate` ada (pull didukung?), `itemPath`, ada/tidaknya `variantInverse`/`attributeListInverse`/`enrichers`.

---

## 5. Alur pengguna (flows)

**Flow A — Tarik satu produk (Shopify, pull didukung):**
`P1 tombol → POST /pull → P2 preview → [Terapkan ke Step-2] POST /pull/apply → toast hasil + P4 stamp update`

**Flow B — Field sensitif (nama/deskripsi) via review:**
`P2 → [Kirim ke Review] POST /review → item DRAFT_REVIEW masuk P3 → user Terima/Tolak → (Terima) master global berubah`

**Flow C — Otomatis (webhook, tanpa FE):** channel produk berubah → webhook → reverse ingest → suggestion muncul di P3 (FE cukup poll/refresh Inbox). FE **tidak** memicu ini; hanya menampilkan hasilnya.

**Flow D — Channel tanpa pull (Shopee GET perlu signing):**
`P1 → /pull 400 "not configured" → P2 mode manual (user tempel/BE sediakan payload get_item) → POST /preview → /apply`

---

## 6. Komponen reusable (saran)

- `<ReverseDiffField>` — satu baris: `channelPath`, diff `current → channelValue`, badge changed/baru. Dipakai P2 & P3.
- `<ReverseBucketSection>` — seksi collapsible dengan hitungan + list `<ReverseDiffField>`.
- `<ReverseSummaryBar>` — ringkasan angka dari `summary`.
- `<DeDerivationNotes>` — panel info notes.
- `<SuggestionCard>` — kartu P3 dengan Accept/Reject + dialog konfirmasi master.
- `<ReverseStatusBadge>` — untuk P4 (lastReverseSyncedAt / ada-update).
- Hook `useReversePull(storeId, channelProductId)`, `useReverseSuggestions(masterProductId)`.

---

## 7. Pertimbangan teknis & GAP backend (perlu dikonfirmasi/ditambah)

**Sudah tersedia (FE bisa langsung pakai):** semua endpoint di §2.

**Gap yang SUDAH DITUTUP (BE, siap dipakai):**
1. ✅ **Endpoint agregat suggestions** — `GET /suggestions?organizationId=&status=` (inbox org-wide) +
   `GET /suggestions/count?organizationId=&status=` (badge). `ReverseSuggestion` kini punya `organizationId`.
2. ✅ **Field reverse di response product-store** — `ChannelProductDataResponse` kini expose `channelProductId`,
   `publishedApiVersion`, `channelUpdatedAt`, `lastReverseSyncedAt` (di semua endpoint yang mengembalikan DTO ini).

3. ✅ **Editor `reverseWritePolicy`** (P5) — `PATCH /api/v1/admin/master-attributes/{id}/reverse-policy?policy=`
   (validasi terhadap enum `ReverseWritePolicy`, 400 bila salah). Lihat §2.6b.
4. ✅ **Label atribut kategori** (P2 seksi b) — **endpoint sudah ada**:
   `GET /api/v1/categories/{channelType}/{storeId}/attributes/{categoryId}/schema` mengembalikan field dengan
   `fieldName` (= native attribute_id) + `label`. FE bangun lookup `{ "200134": "Material" }`. Lihat §2.6b.

**Semua gap BE (#1–#4) TERTUTUP** — FE punya kontrak penuh untuk FE-1 s/d FE-4.

**Non-fungsional:**
- **Idempotensi:** `/apply`, `/pull/apply`, `/review` merge non-destruktif → aman retry; tombol boleh re-enable setelah sukses.
- **Anti-loop:** murni urusan BE (echo-suppression). FE tak perlu menangani.
- **Long-running pull:** `/pull` memanggil channel API (network) → beri spinner + timeout wajar; tangani 4xx "not configured".
- **Permission:** **Accept suggestion** menulis master global — gate dengan role (mis. hanya admin/manager). Konfirmasi wajib.
- **i18n:** ikuti konvensi app; string di doc ini contoh (ID).
- **Optimistic UI:** hindari untuk Accept (efek ke master global) — tunggu 200 baru update.

---

## 8. Fase implementasi FE

| Fase FE | Isi | Endpoint |
|---|---|---|
| **FE-1 (P0)** | P1 tombol + P2 Preview/Diff + Terapkan ke Step-2 | `/pull`, `/pull/apply`, `/preview`, `/apply` |
| **FE-2 (P0)** | P3 Inbox Suggestions + Accept/Reject + konfirmasi master | `/review`, `/suggestions/*` |
| **FE-3 (P1)** | P4 kolom status reverse + P5 policy editor | (butuh gap #2/#3) |
| **FE-4 (P2)** | P6 reverse-JOLT inspector + P7 webhook/config viewer | `/jolt-spec/{channelId}` |

Mulai **FE-1 + FE-2** — itu menutup alur inti (tarik → preview → terapkan/review → approve). FE-3/FE-4 memoles & admin.

---

## 9. Referensi
- Arsitektur & SoT: [`docs/reversesync/05`](reversesync/05-config-source-of-truth.md) (peta Source-of-Truth, pipeline, guardrail, status R0–R5).
- Prinsip: [`docs/reversesync/01`](reversesync/01-overview-and-principles.md). Pipeline: [`02`](reversesync/02-reverse-pipeline-and-post-processing.md). Data/identity: [`03`](reversesync/03-data-model-identity-and-phasing.md). Log implementasi: [`04`](reversesync/04-engine-separation-and-industry-comparison.md).
- Contoh config channel terverifikasi: `createShopifyConfiguration` / `createShopeeConfiguration` di `ChannelConfigurationDataLoader`.
