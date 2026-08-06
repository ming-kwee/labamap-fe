# Frontend Contract — JOLT Spec Schema Staleness (badge + Regenerate CTA)

> Backend siap (bff-v11). Dokumen ini adalah **kontrak FE**: field & endpoint baru yang dapat dikonsumsi
> untuk menampilkan bahwa sebuah generated JOLT spec dibuat terhadap **apiSchema versi lama** (stale),
> beserta tindakan **Regenerate**. Bagian dari Phase 0 channel API schema versioning
> ([`docs/versioning/01-*`](versioning/01-channel-api-schema-versioning.md)).

---

## 1. Latar (kenapa ini ada)

Spec JOLT hasil AI disimpan per `(channel, category, org)` dan **menang** atas seed default. Saat
`apiSchema` channel berubah (bump versi, atau koreksi seperti penghapusan `option{n}_name`), spec lama
**diam-diam** tetap memetakan ke path yang sudah tidak ada → field support bocor, nama produk gagal
terpetakan. Backend kini men-*stamp* tiap generated spec dengan fingerprint apiSchema yang menjadi
targetnya, lalu membandingkannya dengan fingerprint channel saat ini. FE cukup **menampilkan** hasil
perbandingan itu dan menyediakan tombol regenerate.

**Status (tri-state)** — konsisten di semua surface:
- `STALE` — spec dibuat terhadap apiSchema berbeda dari sekarang → **regenerate**.
- `FRESH` — fingerprint cocok, aman.
- `UNKNOWN` — spec belum ter-stamp (dibuat sebelum Phase 0) **atau** channel belum punya fingerprint.
  Perlakukan sebagai "belum terverifikasi — regenerate untuk mengaktifkan deteksi".

---

## 2. Surface A — Publish-Trace Inspector (diagnostik per-produk)

Pendamping [`FRONTEND-PUBLISH-TRACE-INSPECTOR.md`](FRONTEND-PUBLISH-TRACE-INSPECTOR.md). Objek
`joltSpec` di response trace kini punya **2 field baru** (keduanya `@JsonInclude(NON_NULL)`):

| Field | Tipe | Arti |
|---|---|---|
| `apiVersion` | `string?` | Versi API channel yang menjadi target spec saat di-generate (mis. `"2024-01"`). Null untuk spec legacy. |
| `schemaStale` | `boolean?` | `true`=STALE, `false`=FRESH, **absen/null**=UNKNOWN (legacy/unstamped). |

Contoh (spec stale):
```json
"joltSpec": {
  "source": "channel_jolt_specs",
  "categoryId": "clothing",
  "generatedBy": "ai-agent-v1",
  "version": "v1.0",
  "apiVersion": "2024-01",
  "schemaStale": true,
  "operations": 8
}
```

Selain itu, saat `schemaStale=true`, backend **juga** menambahkan pesan ke `warnings[]` trace:
> `JOLT spec for category 'clothing' was generated against an older apiSchema (schemaStale) — regenerate it; it may map to removed/renamed paths.`

**UI yang diharapkan:** di panel JOLT spec inspector, tampilkan badge:
- `schemaStale === true` → 🔴 **"Skema usang — regenerate"** (+ tooltip: dibuat pada `apiVersion`).
- `schemaStale === false` → ⚪ tidak perlu badge (atau ✅ "skema terkini").
- `schemaStale == null` → 🟡 **"Skema belum terverifikasi"** (spec legacy).

---

## 3. Surface B — Admin Staleness Report (kelola proaktif / Review Queue)

Endpoint **baru** (additive, tidak mengubah list yang ada):

```
GET /api/v1/admin/channel-jolt-specs/staleness
      ?channelId={optional}     # batasi ke satu channel
      &onlyStale={true|false}   # default false; true = hanya yang STALE
```

Response: `SpecStalenessItem[]`
```json
[
  {
    "id": "665f0a...",
    "channelId": "shopify",
    "categoryId": "clothing",
    "organizationId": null,
    "isSystemDefault": false,
    "generatedBy": "ai-agent-v1",
    "specApiVersion": "2024-01",
    "specTargetSchemaHash": "sha256:1a2b3c4d...",
    "channelApiVersion": "2024-01",
    "channelApiSchemaHash": "sha256:9f8e7d6c...",
    "status": "STALE"
  }
]
```

| Field | Arti |
|---|---|
| `status` | `"STALE"` \| `"FRESH"` \| `"UNKNOWN"` (sumber kebenaran untuk badge). |
| `specTargetSchemaHash` / `channelApiSchemaHash` | Fingerprint spec vs channel (untuk tooltip/diagnostik; bandingkan sudah dilakukan backend). |
| `specApiVersion` / `channelApiVersion` | Versi API saat spec dibuat vs versi channel sekarang. |
| `isSystemDefault` | `true` = seed loader (biasanya selalu FRESH); `false` = generated per-kategori. |

**UI yang diharapkan (Review Queue / admin jolt-spec):**
- Kolom/badge **STALE** per baris (dari `status`).
- Filter **"Tampilkan stale saja"** → panggil `?onlyStale=true`.
- Chip **`apiVersion`** channel (dari `channelApiVersion`).
- Tombol **Regenerate** (lihat §4).
- Opsional: tombol bulk **"Regenerate semua stale"** (loop DELETE atas baris STALE).

---

## 4. Aksi "Regenerate" — pakai endpoint yang sudah ada

Regenerate = **hapus** spec; spec baru dibangun otomatis oleh AI agent saat **publish/analyse berikutnya**
untuk kategori tsb, dan otomatis ter-stamp dengan fingerprint terkini (jadi menjadi FRESH).

- Satu spec: `DELETE /api/v1/admin/channel-jolt-specs/{id}`
- Bulk per channel: `DELETE /api/v1/admin/channel-jolt-specs?channelId=...&categoryId=...`

> ⚠️ **Catatan penting untuk FE:** regenerasi **tidak sinkron** — DELETE hanya menghapus. Spec baru muncul
> saat publish/analyse berikut. Jadi setelah DELETE, tampilkan state *"menunggu regenerasi pada publish
> berikutnya"*, jangan berharap spec langsung ada. Spec `isManuallyConfigured=true` (human-owned) sengaja
> **tidak** di-regenerate otomatis oleh agent — untuk itu perlu review manual, jangan tawarkan tombol
> regenerate satu-klik (atau beri konfirmasi tegas).

---

## 5. Kriteria penerimaan

- [ ] Publish-trace inspector menampilkan badge stale dari `joltSpec.schemaStale` (3 state) + surface pesan
      dari `warnings[]`.
- [ ] Admin/Review-Queue memanggil `GET …/staleness` dan menampilkan badge `status` per spec + filter
      `onlyStale`.
- [ ] Tombol **Regenerate** memanggil `DELETE …/{id}` dan menampilkan state "menunggu regenerasi".
- [ ] State `UNKNOWN` dibedakan dari `FRESH` (kuning vs hijau) — bukan disamakan.
- [ ] `isManuallyConfigured=true` tidak menawarkan regenerate satu-klik tanpa konfirmasi.

---

## 6. Edge cases

- **Spec legacy (pre-Phase 0)** → `schemaStale`/`status` = UNKNOWN. Tidak berarti aman; artinya belum
  ter-stamp. Regenerate untuk memverifikasi.
- **Channel tanpa config aktif** (jarang) → `channelApiSchemaHash` null → semua specnya UNKNOWN.
- **`source="request"` / `source="none"`** di trace → tidak ada `schemaStale` (bukan generated spec);
  jangan tampilkan badge.
- **Deteksi bersifat forward-looking**: spec yang di-generate SEBELUM Phase 0 baru menjadi STALE/FRESH
  setelah sekali diregenerasi (ter-stamp). Sampai itu ia UNKNOWN.

---

## 7. Ringkas kontrak backend (yang sudah ada)

| Kebutuhan FE | Backend |
|---|---|
| Badge stale di trace | `PublishTraceResponse.joltSpec.{apiVersion, schemaStale}` + `warnings[]` |
| Daftar spec stale | `GET /api/v1/admin/channel-jolt-specs/staleness?channelId&onlyStale` → `SpecStalenessItem[]` |
| Regenerate | `DELETE /api/v1/admin/channel-jolt-specs/{id}` (atau bulk by channelId) |
