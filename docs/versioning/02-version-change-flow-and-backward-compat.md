# Alur Perubahan Versi Channel — Hulu ke Hilir & Backward Compatibility

> Pendamping [`01-channel-api-schema-versioning.md`](01-channel-api-schema-versioning.md).
> Dokumen ini **bukan** rencana implementasi — ia menceritakan, langkah demi langkah, apa yang terjadi
> **sekarang (as-is)** ketika sebuah channel mengubah versi API-nya: apa yang harus dilakukan engineer,
> apa yang berubah otomatis, apa efeknya, dan apakah versi lama masih backward-compatible. Di akhir,
> alur yang sama diceritakan ulang untuk arsitektur **target (to-be)** sebagai kontras.

Skenario contoh yang dipakai sepanjang dokumen: **Shopify menaikkan REST Admin API `2024-01 → 2024-07`**
dan mengganti/menata ulang beberapa field body create.

---

## 1. Peta aktor (hulu → hilir)

```
HULU                                                                                   HILIR
────────────────────────────────────────────────────────────────────────────────────────▶
Channel        Engineer         Seed/Loader (startup)        MongoDB              Publish runtime        Sync-service      Channel API
(rilis versi)  (edit kode)      (ChannelConfig/JOLT/         (channel_config,     (ChannelPublish        (:9000)           (endpoint versi)
               + contract test   Metadata/AttrMappings)       channel_jolt_specs,  Service: resolve →
                                                              channel_metadata)    JOLT → post-proc →
                                                                                   buildChannelAttributes)
```

---

## 2. Alur SEKARANG (as-is), langkah demi langkah

### Tahap 1 — Hulu: channel mengumumkan versi baru

Shopify merilis `2024-07` + release notes (field di-rename/ditata ulang, ada yang deprecated). Tidak ada
sinyal otomatis masuk ke sistem kita — **engineer harus membaca release notes** dan memahami bentuk body
baru (persis proses studi apiSchema `2024-01` yang kita lakukan dari sumber resmi).

### Tahap 2 — Engineer mengubah "lockstep surface" (ini yang HARUS dilakukan)

Karena versi bersifat implisit, satu bump = edit banyak permukaan seed **secara bersamaan**. Kalau satu
tertinggal, payload rusak **secara sunyi**.

| # | Yang diedit                | File                                                                   | Efek kalau lupa                                   |
|---|----------------------------|------------------------------------------------------------------------|---------------------------------------------------|
| 1 | apiSchema (spec-of-record) | `ChannelConfigurationDataLoader.create*ApiSchema()`                    | Target JOLT/agent salah → path karangan/bocor     |
| 2 | Default JOLT seed          | `DefaultJoltSpecDataLoader.build*JoltSpec()`                           | Field tidak terpetakan ke path baru               |
| 3 | Post-processing rules      | `ChannelConfigurationDataLoader.create*PostProcessingRules()`          | Struktur versi baru tidak terbentuk               |
| 4 | Attribute mappings         | `ChannelAttributeMappingsMigration.build*AttributeMappings()`          | `attrId`/`vrntId` salah/`isSupportField` salah    |
| 5 | Endpoint URL               | `ChannelMetadataMigration.build*Metadata()` (URL berisi versi literal) | Sync-service memanggil endpoint versi lama        |
| 6 | Payload requirements       | `buildPayloadRequirements()`                                           | Pre-flight gate lolos padahal field wajib berubah |
| 7 | Engine ops (bila perlu)    | `GenericPostProcessingEngine`                                          | Reshape baru tidak tersedia                       |
| 8 | Label + contract test      | `metadata.apiVersion`, `*PipelineTest`                                 | Drift label↔realita tak tertangkap                |

> Referensi contoh nyata coordinated-change: TikTok `202309`
> ([`11-tiktok-202309-schema.md`](../product/07-publishing-engine/01-guides/11-tiktok-202309-schema.md)) —
> di sana satu versi menyentuh apiSchema + JOLT seed + 7 post-processing rules + engine ops + metadata
> endpoints sekaligus.

### Tahap 3 — Deploy & restart: apa yang berubah OTOMATIS vs TIDAK

Ini bagian paling penting dan paling sering disalahpahami. Saat aplikasi restart:

| Artefak                                                                                                                    | Perilaku saat restart | Sumber                                                       |
|----------------------------------------------------------------------------------------------------------------------------|---|--------------------------------------------------------------|
| **Base config** (apiSchema, postProcessingRules, payloadRequirements, apiWrapperConfig, integrationConfig, metadata label) | **DITIMPA** in-place untuk config yang sudah ada | `ChannelConfigurationDataLoader.java:122-130`                |
| **Endpoint list** (`channelMetadataList`, URL versi)                                                                       | **Di-refresh** — kecuali ditandai user-customised (lalu skip) | `ChannelMetadataMigration` (`:56,95,135` skip-if-customised) |
| **Attribute mappings**                                                                                                     | **MERGE** (menambah field yang hilang, tidak menghapus) | `ChannelAttributeMappingsMigration` (Order 101)              |
| **System-default JOLT seed** (`categoryId="default"`)                                                                      | **DITIMPA** bila `isSystemDefault=true` | `DefaultJoltSpecDataLoader.java:60-69`                       |
| **Generated JOLT spec per-kategori** (`categoryId="clothing"`, dst)                                                        | **TIDAK DISENTUH sama sekali** | tak ada loader yang menyentuh baris kategori                 |

**Kesimpulan Tahap 3:** hampir semua yang di-seed-in-code ikut ter-refresh saat restart — **kecuali
generated spec per-kategori**. Itulah lubangnya.

### Tahap 4 — Generated spec menjadi STALE (efek diam-diam)

`channel_jolt_specs` untuk kategori yang sudah pernah di-generate AI (`generatedBy="ai-agent-v1"`)
**menang** atas seed default (prioritas resolusi: `org+category(120) > system+category(110) >
org+default(70) > system+default(60)`, `ChannelJoltSpec.java:142`). Setelah bump:

- Seed default sudah versi baru (ter-refresh), **tapi** kategori yang punya generated spec **tetap
  memakai spec lama** yang memetakan **path versi lama**.
- Akibatnya persis kelas bug `option1_name`: field support bocor ke `channelAttributes`, target decoy
  men-scramble pemetaan (`product name → product.title` gagal).
- Tidak ada invalidasi otomatis. Engineer **harus manual**: hapus/regenerasi baris kategori terdampak
  di `channel_jolt_specs` (agent regen menargetkan apiSchema baru).

### Tahap 5 — Hilir: publish → sync-service → channel API

Untuk tiap publish:

1. `ChannelPublishService` me-*resolve* JOLT spec via fallback + prioritas → dapat generated spec
   (mungkin stale) atau seed (sudah baru).
2. JOLT transform → staging `_`-key (JOLT-independent) → post-processing (rules versi baru) →
   `buildChannelAttributes` → wrap.
3. Body dikirim ke **sync-service (:9000)**, yang memanggil endpoint channel dari `channelMetadataList`
   (URL versi baru — bila Tahap 2#5 tidak lupa).
4. **Efek akhir:** kalau semua permukaan konsisten → body versi baru benar. Kalau generated spec masih
   stale → body campur (support field bocor, path salah) meski apiSchema & endpoint sudah baru.

---

## 3. Apa efeknya, dan siapa yang terdampak

| Terdampak                       | Efek saat bump (as-is)                                                                                                      |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **Semua store channel itu**     | Langsung memakai config versi baru begitu restart — **serentak, big-bang**. Tidak ada yang bisa tetap di versi lama.        |
| **Produk yang sudah ada**       | Publish berikutnya memakai bentuk baru; produk yang tadinya benar bisa jadi rusak bila generated spec-nya stale.            |
| **Generated spec per-kategori** | Menjadi stale → sumber bug utama sampai diregenerasi manual.                                                                |
| **Publish in-flight**           | Yang lolos sebelum restart pakai versi lama; sesudah restart pakai versi baru — tidak ada penomoran versi pada hasil.       |
| **Store yang di-customise**     | Endpoint/metadata mereka di-skip refresh (flag user-customised) → bisa **tertinggal** di endpoint versi lama tanpa sengaja. |

---

## 4. Apakah versi lama masih backward-compatible? (jawaban jujur)

Perlu dibedakan **dua sisi**:

### 4.1 Sisi channel (di luar kendali kita) — YA, sementara

Mayoritas channel menjaga versi lama tetap hidup selama **jendela deprecation** (mis. Shopify menyimpan
versi REST ± 12 bulan; TikTok/Shopee juga punya masa transisi). Jadi endpoint `2024-01` **masih bisa
dipanggil** channel-side untuk sementara. REST product Shopify sendiri di-*deprecate* mulai `2024-04`
tapi tetap berfungsi selama jendela transisi.

### 4.2 Sisi sistem kita (as-is) — TIDAK, tidak terkontrol

Meskipun channel masih menerima versi lama, **sistem kita tidak bisa menargetkannya lagi** setelah bump,
karena:

- Config **satu-versi** dan **dimutasi in-place** — begitu ditimpa, bentuk versi lama **lenyap** dari
  sistem (tidak ada histori/koeksistensi).
- Kunci JOLT spec tanpa dimensi versi `(channelId, categoryId, organizationId)` — tidak mungkin menyimpan
  dua versi berdampingan.
- Tidak ada pin per-store → tidak bisa "store A tetap 2024-01, store B ke 2024-07".
- Generated spec lama tidak menjadi "kompatibel", melainkan **rusak** (memetakan ke bentuk yang sudah
  tidak diproduksi apiSchema baru).

Artinya: **bump = hard cutover.** Versi lama tidak dipertahankan secara terkendali; ia hanya "kebetulan
masih diterima channel", bukan didukung sistem.

### 4.3 "Kompat lemah" yang memang ada (dan batasnya)

Ada beberapa hal yang **melunakkan** kerusakan, tapi bukan koeksistensi versi:

- **JOLT superset/additive** — seed default memakai wildcard passthrough; banyak field source tetap
  mengalir walau target sedikit berubah.
- **Fallback post-processing** — mis. `BUILD_OPTIONS_FROM_FLAT_KEYS` jatuh ke `EXTRACT_DIMENSIONS` saat
  key baru absen → tidak crash, hanya degradasi.
- **Migrasi MERGE** — attribute mappings/category requirements menambah, tidak menghapus → key lama tidak
  hancur (tapi juga bisa **menumpuk** key usang).
- **Rantai fallback spec** — bila generated spec absen, seed default (versi baru) dipakai.

Batasnya: semua ini hanya mengurangi ledakan, **tidak** memberi kemampuan menyajikan versi lama ke store
tertentu, dan **tidak** menyelamatkan generated spec yang stale.

### 4.4 Cara rollback hari ini — mahal

Tidak ada tombol rollback. Untuk kembali ke versi lama: **revert kode** (7 permukaan) → **redeploy** →
**restart** (agar loader menimpa balik) → **hapus/regenerasi** generated spec agar cocok versi lama lagi.
Lambat, manual, dan berisiko selama proses.

---

## 5. Alur yang sama di arsitektur TARGET (to-be) — bagaimana backward-compat dijaga

Dengan usulan di [`01-...`](01-channel-api-schema-versioning.md) (bundle kontrak **immutable per versi**
+ `apiVersion` sebagai kunci resolusi + pin per store + fingerprint stale):

1. **Hulu** — engineer membuat **bundle DRAFT** `(shopify, 2024-07)` **tanpa menyentuh** bundle
   `(shopify, 2024-01)` yang masih ACTIVE. Versi lama **utuh, tak berubah**.
2. **Deploy** — loader "register versi jika belum ada" (additive). Store existing **tetap** di
   `2024-01` (default ACTIVE mereka). Tidak ada yang big-bang.
3. **Canary** — pin 1 store ke `2024-07`. Generated spec untuk store itu otomatis ditandai **STALE**
   (`targetSchemaHash` beda) → diregenerasi menargetkan apiSchema baru. Store lain **tak terpengaruh**.
4. **Promosi** — `2024-07` → ACTIVE, `2024-01` → DEPRECATED (+ `sunsetAt`). Store bermigrasi bertahap.
5. **Rollback** — cukup kembalikan pin store ke `2024-01` (instan, **tanpa deploy**), karena bundle
   lama masih ada.
6. **Retire** — setelah `sunsetAt` (selaras jendela deprecation channel), `2024-01` → RETIRED.

Di sini "backward compatible" menjadi **properti sistem yang eksplisit**: versi lama tetap tersimpan,
tetap resolvable, tetap bisa dipublish sampai sengaja di-retire.

---

## 6. Perbandingan ringkas

| Aspek | Sekarang (as-is) | Target (to-be) |
|---|---|---|
| Ubah versi | Edit 7 permukaan lockstep, in-place | Buat bundle baru, additive, immutable |
| Cakupan efek | Semua store serentak (big-bang) | Per store (pin), bertahap |
| Versi lama tersimpan? | Tidak (ditimpa) | Ya (immutable) |
| Backward-compat sistem | Tidak terkontrol | Eksplisit & terkendali |
| Generated spec stale | Manual, sering terlupa → bug | Auto-invalidate via `targetSchemaHash` |
| Rollback | Revert kode + redeploy + restore spec | Ubah pin store (instan) |
| Canary / gradual | Tidak ada | Ada |
| Endpoint versi | URL literal per permukaan | Template `{apiVersion}` satu sumber |

---

## 7. Checklist melakukan bump HARI INI (as-is, sampai target diimplementasikan)

1. Pelajari spec resmi versi baru (bentuk body, field rename, endpoint).
2. Edit **7 permukaan** (Tahap 2) + `metadata.apiVersion` + contract test — dalam satu perubahan.
3. Jalankan contract/pipeline test sampai hijau (body persis + tidak ada path karangan).
4. Deploy + restart → verifikasi log: apiSchema/endpoint/seed ter-refresh.
5. **Wajib**: hapus/regenerasi `channel_jolt_specs` untuk **kategori yang punya generated spec**
   (kalau tidak → stale-spec bug). Ini langkah yang paling sering terlupa.
6. Uji publish nyata per kategori terdampak; cek `channelAttributes` + endpoint yang dipanggil.
7. Siapkan rencana revert (kode + regen spec) sebelum rollout luas — belum ada rollback instan.

---

## 8. Kesimpulan

- **Sisi channel**: versi lama biasanya masih diterima selama jendela deprecation → backward-compatible
  sementara, **di luar kendali kita**.
- **Sisi sistem (as-is)**: **tidak** backward-compatible secara terkontrol — bump adalah hard cutover
  in-place; versi lama lenyap dari sistem dan generated spec lama menjadi rusak, bukan kompatibel.
- **Perbaikan** ada di arsitektur target: bundle immutable per versi + pin per store + auto-invalidate,
  yang menjadikan backward compatibility sebagai jaminan sistem, bukan kebetulan.
