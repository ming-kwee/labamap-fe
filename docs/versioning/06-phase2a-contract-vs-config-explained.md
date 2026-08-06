# Fase 2a Dijelaskan Perlahan — `ChannelApiContract` vs `ChannelConfiguration`

> Bagian dari [seri versioning](01-channel-api-schema-versioning.md). Menjawab pertanyaan wajar:
> *"Field `ChannelApiContract` sebagian besar sama dengan `ChannelConfiguration` — apa bedanya, dan kenapa
> tidak cukup satu saja?"* Fase 2a sudah diimplementasikan (branch `bff-v11`, commit `361fbae`).

---

## 1. Satu kalimat

`ChannelApiContract` **bukan** konfigurasi baru — ia **foto beku (snapshot) dari kontrak `ChannelConfiguration`
untuk satu versi API**, disimpan sekali dan tak pernah diubah, supaya sebuah versi punya catatan yang tidak
bisa berubah di bawah kaki store yang sedang jalan.

Field-nya memang sengaja **mirip** — karena isinya memang menyalin bagian "kontrak" dari config. Yang beda
adalah **siapa dia, bagaimana ia hidup, dan untuk apa**.

---

## 2. Kenapa perlu ada (masalah yang dipecahkan)

`ChannelConfiguration` **dimutasi di tempat**: tiap restart, loader menimpa `apiSchema`, `postProcessingRules`,
`attributeMappings`, dst dengan nilai dari kode terbaru (lihat [`02`](02-version-change-flow-and-backward-compat.md)).
Artinya:

- Tidak ada **histori** — begitu ditimpa, bentuk versi lama lenyap.
- Tidak ada **immutability** — store yang sedang jalan bisa "berubah di bawah kaki" saat config ditimpa.
- Tidak ada **koeksistensi versi** — hanya ada satu config "sekarang" per channel.

`ChannelApiContract` menutup ini: kontrak untuk `(channelId, apiVersion)` ditulis **sekali** (register-if-absent)
dan **tak pernah ditimpa**.

---

## 3. Perbedaan inti (bukan di field — di sifat)

| Aspek | `ChannelConfiguration` | `ChannelApiContract` |
|---|---|---|
| **Identitas / kunci** | per **channel** (`channelId` [+ org]) | per **channel × versi** (`channelId, apiVersion`) |
| **Mutability** | **Mutable** — ditimpa tiap restart oleh loader; bisa diedit admin | **Immutable** — ditulis sekali, tak pernah ditimpa |
| **Jumlah** | satu "yang sekarang" per channel | banyak (satu per versi), hidup berdampingan |
| **Peran** | "config kerja saat ini" (HEAD/working copy) | "rilis beku sebuah versi" (git tag) |
| **Isi** | kontrak **+** setelan operasional (matching, auth, threshold, alias, dll) | **hanya** bagian kontrak-of-record versi itu |
| **Lifecycle** | tak ada status versi | `status`: DRAFT/ACTIVE/DEPRECATED/RETIRED (transisi = Fase 2c) |
| **Provenance** | — | `source`, `sourceConfigId` (dari mana snapshot diambil) |
| **Dibaca saat publish?** | **Ya** (sumber kebenaran sekarang) | **Belum** (2a fondasi; 2b yang me-resolve-nya) |

**Analogi:** `ChannelConfiguration` = **working copy / HEAD** (selalu terbaru, berubah-ubah).
`ChannelApiContract` = **git tag / rilis** (potret satu titik, beku, ber-nomor versi). Keduanya "berisi kode
yang sama" pada saat tag dibuat — tapi tag tidak ikut berubah saat kamu terus commit di HEAD.

---

## 4. Kenapa field-nya mirip (dan mana yang TIDAK sama)

Field mirip **karena memang snapshot** — `ChannelApiContract.fromConfig(config)` menyalin bagian
kontrak-of-record dari config:

**Disalin ke contract** (bagian "seperti apa body create + bagaimana dibangun + ke mana dikirim"):
`apiSchema` (+ `apiSchemaHash`), `postProcessingRules`, `payloadRequirements`, `attributeMappings`,
`channelMetadataList` (endpoints), `apiWrapperConfig`.

**Hanya di `ChannelConfiguration`** (setelan operasional/matching/auth — bukan bagian kontrak versi):
`fieldBoosts`, `confidenceThresholds`, `autoApprovalThreshold`, `defaultMappingStrategies`, `validationRules`,
`transformationDefaults`, `integrationConfig` (auth + sync endpoint — sumbu versi berbeda, lihat
[`05` §8](05-phase1-endpoint-versioning-explained.md)), `oauthConfig`, `aliases`, `channelName`, `metadata`,
`customSettings`, `version` (versi config internal, **bukan** versi API), `organizationId`, `isSystemDefault`.

**Hanya di `ChannelApiContract`** (yang membuatnya "versi beku"):
`apiVersion` (kunci), `status` (lifecycle), `source` + `sourceConfigId` (provenance).

> Jadi contract itu **subset kontrak** dari config + **identitas versi** + **lifecycle**. Bukan duplikat penuh.
> (Catatan: `integrationConfig.publishApiPath` — path HMAC Shopee — belum ikut di-snapshot di 2a; ia bercampur
> dengan auth. Ini titik yang akan dirapikan saat 2b menentukan persis apa yang di-*resolve* dari contract.)

---

## 5. Kenapa tidak cukup menambah `apiVersion` ke `ChannelConfiguration` saja?

Karena keduanya butuh **sifat yang bertentangan**:

- `ChannelConfiguration` **harus mutable** — loader me-refresh-nya tiap restart, admin mengeditnya, dan ia
  memegang setelan operasional yang wajar berubah. Kalau kita "bekukan" config, kita kehilangan kemampuan
  refresh/edit itu.
- Kontrak versi **harus immutable** — jaminan bahwa store yang jalan di `v1` tidak berubah perilakunya saat
  kita menyiapkan `v2`.

Satu dokumen tak bisa "mutable untuk operasional" **dan** "immutable per versi" sekaligus. Maka dipisah:
config tetap jadi tempat kerja yang hidup; contract jadi arsip beku per versi. (Duplikasi sebagian field itu
**disengaja** — sama seperti git tag menduplikasi state tree; justru itu gunanya.)

---

## 6. Cara kerja 2a (register-if-absent = immutable)

`ChannelApiContractMigration` (jalan di `ApplicationReadyEvent`, **setelah** semua loader selesai men-*merge*
config) melakukan, untuk tiap `ChannelConfiguration` system-default aktif:

```
apiVersion = config.apiVersion              // dari Fase 0
kontrak (channelId, apiVersion) sudah ada?
   ├─ YA  → SKIP (immutable — jangan timpa)
   └─ TIDAK → snapshot config → simpan (status=ACTIVE)
```

- Restart dengan `apiVersion` sama → kontrak sudah ada → **skip** (tak ada perubahan).
- `apiVersion` dinaikkan (versi baru) → kontrak **baru** diregistrasi; yang lama **tetap utuh**.

Itulah immutability + koeksistensi: versi lama tersimpan, versi baru bersanding.

---

## 7. Alur (mutable → beku)

```
tiap restart                                  sekali per versi
────────────                                  ────────────────
loader menimpa                                register-if-absent
ChannelConfiguration  ──fromConfig snapshot──▶ ChannelApiContract
(mutable, "sekarang")                         (immutable, per (channelId, apiVersion))
       │                                              │
       ▼                                              ▼
  dibaca publish (SEKARANG)                  BELUM dibaca (menunggu Fase 2b)
```

---

## 8. Apa yang BELUM (penting)

**2a itu fondasi additive — belum ada yang membaca `channel_api_contracts` di jalur publish/analyze.**
`ChannelConfiguration` masih sumber kebenaran untuk publish. Yang menyusul:

- **2b** — publish/analyze me-*resolve* **contract** (untuk versi aktif channel) alih-alih config mutable;
  loader jadi "register versi jika belum ada" (berhenti menimpa). Ini yang benar-benar mengaktifkan immutability
  di runtime + koeksistensi versi. (Menyentuh hot path — dikerjakan terpisah dengan hati-hati.)
- **2c** — lifecycle `DRAFT→ACTIVE→DEPRECATED→RETIRED` + endpoint promote/deprecate.

---

## 9. Cara inspeksi (read-only, sudah tersedia)

```bash
# semua kontrak (opsional filter channelId/status)
curl -s 'http://localhost:8888/labamap/api/v1/admin/channel-api-contracts' | jq '.'
# semua versi satu channel
curl -s 'http://localhost:8888/labamap/api/v1/admin/channel-api-contracts/shopify' | jq '.'
# satu kontrak spesifik
curl -s 'http://localhost:8888/labamap/api/v1/admin/channel-api-contracts/shopify/2024-01' | jq '{channelId, apiVersion, status, apiSchemaHash, source}'
```

(Terisi setelah rebuild + restart, saat migrasi men-snapshot config aktif.)

---

## 10. Ringkas

- **Bukan** config baru — **snapshot beku** kontrak config untuk satu versi.
- Field mirip karena **memang menyalin** bagian kontrak; bedanya di **kunci (per versi)**, **immutability**,
  **lifecycle**, dan **provenance**.
- `ChannelConfiguration` = working copy mutable (HEAD). `ChannelApiContract` = rilis beku ber-versi (tag).
- 2a fondasi saja; belum dibaca publish (itu 2b).
