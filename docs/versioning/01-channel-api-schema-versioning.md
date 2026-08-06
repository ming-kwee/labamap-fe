# Channel API Schema Versioning — Arsitektur Saat Ini & Rekomendasi Ideal

> Status: design proposal · Ditulis oleh: omnichannel engineering
> Konteks: channel e-commerce (Shopify, TikTok Shop, Shopee, Amazon, eBay, WIX, Walmart) mengubah
> kontrak API produk mereka secara berkala (Shopify `2024-01 → 2024-07 → …`, TikTok `202309 → 20xxxx`,
> Shopee `v2 → v3`). Dokumen ini mempelajari cara sistem menangani versi **hari ini**, menunjukkan
> titik-titik lemahnya, lalu mengusulkan arsitektur target beserta peta perubahan konkret & roadmap
> bertahap.

---

## 1. TL;DR

**Kondisi sekarang:** versi API channel bersifat **implisit, tersebar, dan di-mutasi in-place**. Ada
field `metadata.apiVersion` tapi itu cuma **label** yang tidak menggerakkan apa-apa (dan pernah drift
dari realita — lihat TikTok 202309). Ketika sebuah channel menaikkan versi API-nya, engineer harus
mengubah **~7 permukaan seed secara lockstep** + URL endpoint di sync-service + meregenerasi spec JOLT
yang sudah terlanjur stale. Tidak ada koeksistensi versi (blue/green), tidak ada rollback, tidak ada
deteksi otomatis bahwa generated spec sudah usang terhadap schema baru.

**Usul:** jadikan **`apiVersion` sebagai dimensi first-class & otoritatif**, bungkus seluruh kontrak
channel per-versi menjadi satu **Channel Contract Bundle** yang **immutable per versi** (versi baru =
dokumen baru, bukan menimpa), tambahkan **fingerprint schema** untuk meng-invalidasi generated spec
secara otomatis, dan jadikan **resolusi publish sadar-versi** (per-store pin + lifecycle DRAFT→ACTIVE→
DEPRECATED→RETIRED). Ini mengubah "version bump" dari operasi berisiko-tinggi manual menjadi
rollout data-driven yang bisa di-rollback.

---

## 2. Kondisi Saat Ini (as-is)

### 2.1 `apiVersion` = label, bukan penggerak

`ChannelConfiguration.metadata.apiVersion` diisi per channel tapi **tidak dibaca oleh runtime** untuk
memilih perilaku:

| Channel         | `metadata.apiVersion`  | Lokasi seed                               |
|-----------------|------------------------|-------------------------------------------|
| Shopify         | `"2024-01"`            | `ChannelConfigurationDataLoader.java:214` |
| TikTok Shop     | `"202309"`             | `:1110`                                   |
| Shopee          | `"v2"`                 | `:1471`                                   |
| (Amazon/eBay/…) | `"v1"` / dll           | `:753`, …                                 |

`ChannelConfiguration.version` (`"1.0"`, `:270` dst) adalah versi **config internal**, bukan versi API
channel. Bukti drift: dokumen `docs/product/07-publishing-engine/01-guides/11-tiktok-202309-schema.md`
menyatakan config "**labelled `202309` tapi memakai field names legacy `/api/products`**" — label dan
realita berpisah tanpa ada yang menahannya.

### 2.2 Satu-satunya versi yang benar-benar first-class: category API

`ChannelCategoryApiConfig.apiVersion` + `apiPath` template `"/admin/api/{apiVersion}/graphql.json"`
(`ChannelCategoryApiConfig.java:487-490`), disubstitusi runtime:

```java
// ChannelTaxonomyService.java:177,430
url.replace("{apiVersion}", config.getApiVersion() != null ? config.getApiVersion() : "");
```

Ini **pola yang benar** — versi jadi parameter, bukan literal. Sayangnya hanya dipakai untuk taxonomy/
category API, bukan untuk create-product body maupun endpoint publish.

### 2.3 "Lockstep surface" — versi terpahat di ~7 permukaan seed

Bentuk sebuah versi API sebenarnya **tercermin implisit** di banyak tempat yang harus diubah bersamaan
(sesuai konvensi `CLAUDE.md`: apiSchema = spec-of-record; support/reshape di post-processing):

| # | Permukaan | Fungsi seed | Apa yang versi-spesifik |
|---|---|---|---|
| 1 | **apiSchema** (spec-of-record) | `create*ApiSchema()` | Bentuk body create (path & tipe field) |
| 2 | **Default JOLT seed** | `build*JoltSpec()` (`DefaultJoltSpecDataLoader`) | Target path per versi |
| 3 | **Post-processing rules** | `create*PostProcessingRules()` | Reshape → struktur versi (mis. `package_weight:{value,unit}`) |
| 4 | **Attribute mappings** | `build*AttributeMappings()` (`ChannelAttributeMappingsMigration`) | Nama field channel (`attrId`/`vrntId`) per versi |
| 5 | **Channel metadata / endpoints** | `build*Metadata()` (`ChannelMetadataMigration`) | **URL berisi versi literal** (`/product/202309/products`, `/admin/api/2024-01/products.json`) |
| 6 | **Payload requirements** | `buildPayloadRequirements()` | Kontrak field wajib create-body |
| 7 | **Engine op extensions** | `GenericPostProcessingEngine` | Op baru/parameter untuk struktur versi baru (`BUILD_STOCK_INFOS.stockKey`, `BUILD_SALES_ATTRIBUTES.attributeKey`) |

Contoh URL berisi versi literal (harus diedit manual saat bump):
`ChannelMetadataMigration.java:696` (`/product/202309/products`), `:884` (`/admin/api/2024-01/products.json`).

### 2.4 Tidak ada koeksistensi versi — mutasi in-place

- Kunci unik JOLT spec: **`(channelId, categoryId, organizationId)`** — **tanpa dimensi versi**
  (`ChannelJoltSpec.java:35-41`). Dua versi tidak bisa hidup berdampingan.
- `ChannelConfiguration` satu-per-`(channelId, orgId)`. Saat restart, loader **menimpa** apiSchema/
  rules/mappings di tempat: `ChannelConfigurationDataLoader.java:123` (`existing.setApiSchema(...)`),
  `:124` (`setPostProcessingRules`), dst. Tidak ada histori versi, tidak ada rollback.
- Konsekuensi: bump versi = "big bang" untuk seluruh store channel itu sekaligus; tidak ada canary,
  tidak ada blue/green, tidak ada per-store migration.

### 2.5 Generated spec menjadi stale (kegagalan konkret yang sudah terjadi)

`channel_jolt_specs` menyimpan spec hasil AI (`generatedBy="ai-agent-v1"`) yang **menang** atas seed
untuk kategori yang sudah punya spec (`resolutionPriority`: `org+category(120) > system+category(110)
> org+default(70) > system+default(60)`, `ChannelJoltSpec.java:142`). Ketika apiSchema berubah
(mis. reset Shopify menghapus `option{n}_name`), spec lama **masih memetakan path lama** →
- field support bocor ke `channelAttributes`,
- decoy target men-scramble pemetaan (`product name → product.title` gagal).

Ada mekanisme deteksi perubahan **superset (source)** — `JoltMetadata.supersetSchemaHash`,
`SupersetSchema.schemaHash` (`ChannelJoltSpec.java:174,244`) — tapi **tidak ada** fingerprint terhadap
**target apiSchema/versi**, sehingga perubahan versi channel **tidak** meng-invalidasi generated spec.
Proteksi `isProtectedFromAutoOverwrite()` (`:121`) justru membuat spec stale bertahan (auto-apply
`SKIPPED_PROTECTED`).

### 2.6 Ringkasan: di mana "versi" tinggal hari ini

```
apiVersion (label)  ──▶ metadata.apiVersion            [tidak menggerakkan apa-apa]
bentuk body         ──▶ apiSchema (create*ApiSchema)   [implisit]
target paths        ──▶ build*JoltSpec + generated specs (channel_jolt_specs) [implisit, bisa stale]
reshape             ──▶ create*PostProcessingRules + engine ops              [implisit]
field names         ──▶ build*AttributeMappings                              [implisit]
endpoint URL        ──▶ build*Metadata (URL literal 202309/2024-01)          [literal, manual]
required fields     ──▶ buildPayloadRequirements                             [implisit]
category API        ──▶ ChannelCategoryApiConfig.apiVersion + {apiVersion}   [✅ first-class]
```

---

## 3. Masalah & Risiko

1. **Drift label↔realita** — `apiVersion` tidak diverifikasi terhadap bentuk sebenarnya (sudah terjadi
   di TikTok).
2. **Perubahan lockstep manual** — 7 permukaan + URL sync-service; lupa satu → payload rusak sunyi.
3. **Tidak ada koeksistensi/rollback** — bump = big-bang; kalau salah, tidak ada jalan mundur cepat.
4. **Stale generated specs** — perubahan target tidak meng-invalidasi spec AI; leak & mis-map (kelas
   bug `option1_name`).
5. **Tidak ada canary/gradual rollout** — tak bisa uji versi baru di 1 store dulu.
6. **Observability nol** — tidak tahu store mana di versi mana, atau success-rate publish per versi.
7. **Sync-service kopling** — URL versi ada di dua tempat (metadata + service :9000) tanpa satu sumber.

---

## 4. Arsitektur Target (to-be)

### 4.1 Prinsip: `apiVersion` sebagai dimensi otoritatif

Naikkan `apiVersion` dari label → **kunci resolusi**. Setiap artefak kontrak channel di-*scope* oleh
`(channelId, apiVersion)`. Label harus **diturunkan dari** bundle, bukan diketik terpisah, sehingga
tidak mungkin drift.

### 4.2 Channel Contract Bundle — versioned & immutable-per-versi

Bungkus seluruh kontrak versi-spesifik jadi **satu unit ber-versi** (collection baru
`channel_api_contracts`, kunci unik `(channelId, apiVersion)`), berisi:

```
ChannelApiContract {
  channelId, apiVersion,               // mis. ("shopify", "2024-01")
  status: DRAFT|ACTIVE|DEPRECATED|RETIRED,
  effectiveFrom, sunsetAt,             // lifecycle
  apiSchema,                           // spec-of-record (bentuk body)
  apiSchemaHash,                       // fingerprint (untuk invalidasi generated spec)
  postProcessingRules[],
  payloadRequirements[],
  attributeMappings,                   // common/product/variant/option field mappings
  endpoints{ createProduct, uploadImage, ... },  // path template dgn {apiVersion}
  engineOpProfile,                     // op/param yang diaktifkan untuk versi ini
  sourceDocUrl, verifiedAt, verifiedBy // provenance & audit
}
```

Aturan emas: **versi yang sudah `ACTIVE`/`DEPRECATED` tidak boleh dimutasi** — perbaikan bentuk = versi
baru (atau `2024-01.1` patch), sehingga store yang berjalan tidak berubah di bawah kaki. Loader berubah
peran: dari "**overwrite current**" menjadi "**register versi N jika belum ada**" (idemponten, additive).

> Catatan realistis: tidak wajib memindahkan semuanya ke Mongo sekaligus. Tahap awal cukup menambahkan
> `apiVersion` + hash pada struktur yang ADA (lihat roadmap §6). Bundle penuh adalah target akhir.

### 4.3 Versi sebagai dimensi resolusi (koeksistensi, rollout, rollback)

- Tambahkan `apiVersion` ke kunci JOLT spec → **`(channelId, categoryId, organizationId, apiVersion)`**
  (`ChannelJoltSpec` + index). Spec 2024-01 dan 2024-07 hidup berdampingan.
- **`ChannelStoreConnection.apiVersion`** (nullable) — pin per store. Null = pakai versi `ACTIVE`
  default channel. Ini yang memungkinkan **canary** (pin 1 store ke DRAFT/new) dan **rollback**
  (kembalikan pin ke versi lama — instan, tanpa deploy).
- Publish/analyze meng-*resolve* versi lebih dulu, lalu memuat bundle + spec untuk versi itu.

Alur resolusi target:

```
publish(masterProductId, storeId)
  └─ apiVersion = store.apiVersion ?? channel.activeVersion(channelId)
      └─ contract = channel_api_contracts[(channelId, apiVersion)]
          ├─ apiSchema, postProcessingRules, endpoints, ...    (dari bundle, bukan literal)
          └─ joltSpec = resolve(channelId, category, orgId, apiVersion)   ← versi ikut jadi kunci
              └─ if joltSpec.targetSchemaHash != contract.apiSchemaHash → STALE
                    → regenerate (agent) atau fallback ke seed + flag review
```

### 4.4 Fingerprint schema → invalidasi generated spec otomatis

Ini yang mencegah kelas bug `option1_name` terulang:

1. Saat generate, stamp spec dengan **`apiVersion`** + **`targetSchemaHash`** (hash dari apiSchema versi
   itu) di `JoltMetadata`.
2. Saat resolve, bandingkan `spec.targetSchemaHash` vs `contract.apiSchemaHash`.
   - **cocok** → pakai.
   - **beda / versi beda** → tandai `STALE` → auto-regenerate (agent menargetkan apiSchema baru), atau
     jatuh ke seed + naikkan flag "needs review". Proteksi human-owned tetap dihormati tapi
     ter-**surface** sebagai peringatan, bukan disembunyikan.
3. Tambahkan **guard di publish**: kalau spec `STALE` dan tak bisa diregenerasi, **tolak/telemetri**
   ketimbang mengirim body rusak sunyi (senada dgn `JoltSemanticValidator`).

### 4.5 Template URL endpoint (generalisasi `{apiVersion}`)

Hapus versi literal dari `build*Metadata`; simpan template dan substitusi runtime — **generalisasi pola
category config yang sudah terbukti** (`ChannelTaxonomyService` `{apiVersion}`):

```
/product/{apiVersion}/products                  (TikTok)
/admin/api/{apiVersion}/products.json           (Shopify)
```

Satu sumber versi (`contract.apiVersion`) mengisi apiSchema, endpoints, dan taxonomy sekaligus →
tidak ada lagi dua tempat yang bisa berbeda. Sync-service (:9000) menerima endpoint yang **sudah
ter-resolve** dari bundle, bukan menyimpan versinya sendiri.

### 4.6 Contract test = pengunci label↔realita

Generalisasi `TikTok202309PipelineTest` (real loader rules + real engine → assert body persis) menjadi
**satu test per `(channel, apiVersion)`**:

- Jalankan bundle versi X pada master "golden" → assert channel body persis versi X.
- **Faithfulness check**: setiap target path apiSchema ⊆ spec resmi channel (tidak ada path karangan);
  required fields hadir. Ini yang seharusnya menangkap "labelled 202309 tapi field legacy".
- CI gagal bila bentuk berubah tanpa menaikkan versi/hash → drift mustahil lolos diam-diam.

### 4.7 Lifecycle & deprecation

```
DRAFT ──(verified + contract test hijau)──▶ ACTIVE ──(versi penerus ACTIVE)──▶ DEPRECATED ──(sunsetAt)──▶ RETIRED
```

- **DRAFT** — hanya store yang di-pin manual (canary).
- **ACTIVE** — default untuk store baru & yang tidak di-pin.
- **DEPRECATED** — masih jalan, tapi UI/telemetri mendorong migrasi; `sunsetAt` diumumkan.
- **RETIRED** — publish ditolak; store wajib migrasi.
- Observability: metrik publish success-rate **per (channel, apiVersion)**, jumlah store per versi,
  daftar spec `STALE`.

---

## 5. Apa yang Harus Dirubah & Disesuaikan (peta konkret)

| Komponen | Sekarang | Perubahan target |
|---|---|---|
| `ChannelConfiguration` | `version` (config) + `metadata.apiVersion` (label) | Tambah `apiVersion` first-class; label diturunkan dari bundle |
| **Contract storage** | Tersebar di 7 seed method, mutasi in-place | Collection `channel_api_contracts` keyed `(channelId, apiVersion)`, **immutable per versi** |
| `ChannelJoltSpec` (kunci) | `(channelId, categoryId, organizationId)` | Tambah `apiVersion` → kunci 4-dimensi + index |
| `ChannelJoltSpec.JoltMetadata` | `supersetSchemaHash` (source) | Tambah `apiVersion` + `targetSchemaHash` (target); dipakai untuk invalidasi |
| `ChannelStoreConnection` | tanpa versi | Tambah `apiVersion` (nullable = pakai ACTIVE) untuk pin/canary/rollback |
| `build*Metadata` endpoints | URL versi literal (`202309`, `2024-01`) | Template `{apiVersion}` + substitusi runtime (generalisasi `ChannelTaxonomyService`) |
| Loader (`ChannelConfigurationDataLoader`) | overwrite `existing.setApiSchema(...)` | "register versi jika belum ada" (additive, tidak menimpa versi ACTIVE) |
| Publish/analyze resolusi | resolve JOLT tanpa versi | Resolve `apiVersion` dulu → muat bundle + spec versi itu |
| Generated-spec regen | manual (bug stale) | Auto-invalidate via `targetSchemaHash` mismatch → regenerate/flag |
| Contract test | hanya TikTok202309 | Satu per `(channel, apiVersion)` + faithfulness check di CI |
| Admin API | edit config in-place | CRUD versi: buat DRAFT, promosikan ACTIVE, deprecate, pin store |

Titik sentuh runtime yang sudah teridentifikasi (untuk implementasi):
`PublishAnalysisService.buildTargetSchema` (`:601`, sumber target schema), `AgentToolHandlerService`
(get_channel_schema / isFlatBody, `:340`), `ChannelPublishService` (resolusi spec + `collectSource*` +
staging), `ChannelJoltSpecRepository.findWithFallback` + `resolutionPriority`.

---

## 6. Roadmap Bertahap (rendah risiko, incremental)

**Fase 0 — Fondasi (non-breaking, nilai tinggi/effort rendah)**
- Tambah `apiVersion` first-class ke `ChannelConfiguration` + turunkan `metadata.apiVersion` darinya.
- Hitung & simpan `apiSchemaHash` per channel.
- Stamp generated spec dengan `apiVersion` + `targetSchemaHash`.
- **Guard invalidasi**: saat resolve, jika hash spec ≠ hash apiSchema → tandai STALE + telemetri
  (belum auto-regen). *Ini saja sudah menutup kelas bug `option1_name`.*

**Fase 1 — Endpoint templating**
- Ganti URL versi literal di `build*Metadata` → template `{apiVersion}`; substitusi runtime dari
  `apiVersion` channel. Satu sumber versi untuk apiSchema + endpoints + taxonomy.

**Fase 2 — Contract bundle + immutability**
- Perkenalkan `channel_api_contracts` (kunci `(channelId, apiVersion)`), pindahkan apiSchema/rules/
  mappings/requirements/endpoints ke bundle. Loader → "register versi jika belum ada".
- Contract test per `(channel, apiVersion)` + faithfulness check di CI.

**Fase 3 — Koeksistensi & rollout**
- Tambah `apiVersion` ke kunci JOLT spec (4-dimensi) + `ChannelStoreConnection.apiVersion`.
- Resolusi publish sadar-versi; lifecycle DRAFT→ACTIVE→DEPRECATED→RETIRED; canary/rollback per store.
- Auto-regenerate spec STALE; observability per versi.

---

## 7. Runbook: Menaikkan Versi API sebuah Channel (target end-state)

1. **Buat bundle DRAFT** `(channelId, newVersion)`: apiSchema baru (setia ke spec resmi — cross-check
   dokumentasi channel), post-processing rules, attribute mappings, endpoints (`{apiVersion}`),
   payload requirements, engine op profile. Isi `sourceDocUrl` + `verifiedAt`.
2. **Contract test** untuk versi baru harus hijau (body persis + faithfulness).
3. **Canary**: pin 1–2 store ke `newVersion` (`ChannelStoreConnection.apiVersion`). Generated spec
   otomatis STALE → regenerate menargetkan apiSchema baru; verifikasi payload nyata.
4. **Promosikan** versi baru ke `ACTIVE`; versi lama → `DEPRECATED` (+ `sunsetAt`).
5. **Migrasi bertahap** store lain; pantau success-rate per versi.
6. **Rollback** bila perlu: kembalikan pin store ke versi lama (instan, tanpa deploy).
7. **Retire** versi lama setelah `sunsetAt`; publish di versi RETIRED ditolak dengan pesan actionable.

Bandingkan dengan hari ini: langkah 1 tersebar di 7 file, langkah 3–6 tidak mungkin (big-bang, tanpa
rollback). Contoh nyata coordinated-change lama:
`docs/product/07-publishing-engine/01-guides/11-tiktok-202309-schema.md`.

---

## 8. Keputusan yang Perlu Diambil

- **Skema versi**: ikuti label channel (`2024-01`, `202309`, `v2`) atau semver internal? (Rekomendasi:
  simpan **label channel** sebagai `apiVersion` — cocok dgn URL & dokumentasi; pakai suffix patch
  `2024-01.1` untuk koreksi bentuk tanpa ganti versi channel.)
- **Granularitas pin**: per store, per org, atau per channel? (Rekomendasi: per store, fallback ke
  ACTIVE channel.)
- **Perilaku STALE saat publish**: auto-regenerate senyap, atau blokir + minta review? (Rekomendasi:
  auto-regenerate untuk spec `ai-agent`; blokir + flag untuk spec human-owned.)
- **Storage bundle**: penuh di Mongo, atau tetap seed-in-code + hash/version overlay? (Rekomendasi:
  mulai overlay `apiVersion`+hash di struktur yang ada — Fase 0/1 — baru pindah ke bundle penuh.)

---

## Lampiran — Glosarium

- **apiSchema** — cerminan setia body create channel; spec-of-record & target JOLT (`CLAUDE.md`).
- **Channel Contract Bundle** — unit kontrak channel per versi (usulan): apiSchema + rules + mappings +
  requirements + endpoints + op profile.
- **targetSchemaHash** — fingerprint apiSchema versi tertentu; pembanding untuk menandai generated spec
  stale.
- **Lockstep surface** — kumpulan seed method yang harus berubah bersamaan untuk satu versi (§2.3).
- **STALE spec** — generated JOLT spec yang di-generate terhadap apiSchema versi lama, kini tak cocok.
