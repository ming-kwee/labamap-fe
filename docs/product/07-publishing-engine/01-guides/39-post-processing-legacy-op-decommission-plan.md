# Rencana Decommission Post-Processing Legacy (`rule.type` + op legacy)

**Status:** ✅ **SELESAI — Fase 0–5 LENGKAP.** Sistem post-processing legacy `rule.type` sudah dipensiunkan
sepenuhnya: field `type`/`addFields`/`dimensionFields` dihapus dari entity (Fase 5), `convertLegacyRule` +
katalog hantu + leftover `getType()` sudah hilang, dan audit DB (1 env) PASS. `operations[]` kini satu-satunya
bentuk rule. Dokumen ini memandu pemensiunan itu secara bertahap & aman (lihat juga guide 40 untuk Fase 4/5).

**Sudah dilakukan (aman, terpisah):**
- ✅ `PostTransformationEnricher.java` (engine lama, `@Service` tanpa pemanggil) **dihapus**
  (commit `chore(post-processing): remove dead deprecated PostTransformationEnricher`). Ini tidak
  menyentuh kontrak apa pun — murni orphan.
- ✅ **Fase 0 (audit) SELESAI.** Temuan penting: file `resources/json/channel-configurations/*.json`
  **TIDAK dibaca kode apa pun** (satu-satunya loader, `DataInitializationService`, membaca file lain:
  `adaptivepattern/channel-configurations.json`). Jadi `wix-channel-configuration.json` = **artefak
  referensi**, rule legacy-nya tak terjangkau otomatis (hanya bila admin meng-import manual). Seeder
  Java `ChannelConfigurationDataLoader`: 0 rule pakai `.type()`. Satu-satunya data ber-`type` di repo =
  2 rule di wix JSON.
- ✅ **Fase 1 (konversi data) SELESAI.** 2 rule wix (`ENRICH_MEDIA`, `GENERATE_OPTIONS`) dikonversi ke
  `operations[]` modern. Kesetaraan **dibuktikan byte-per-byte** oleh
  `GenericPostProcessingEngineLegacyEquivalenceTest` (jalankan `process()` atas rule legacy vs modern →
  output identik). Repo kini **0** `postProcessingRules[*].type`. Data-only, reversible, tak menyentuh
  engine/katalog/kontrak AI.

- ✅ **Fase 2 (lepas konsumen kode) SELESAI.** `AdaptivePatternMatchingCommandImpl` dilepas dari
  `rule.getType()`: cabang legacy `ENRICH_IMAGES`/`GENERATE_OPTIONS` di `isFieldHandledByRule` +
  `identifyPostProcessing*` dihapus (bedah). Bagian **non-legacy dipertahankan** →
  `identifyPostProcessingConsumedSourceFields` di-rename `identifySystemConfigSourceFields` (hanya
  eksklusi field sistem/config); "handled target fields" kini inline `emptyList()`. **Tanpa efek** pada
  perilaku AI untuk config modern: metode ini hanya menyala saat `type != null` (config modern selalu
  `null`); kesadaran post-processing untuk rule `operations[]` datang dari `PostProcessingContractService`
  yang **tak disentuh**. Regression guard: 16 test `AdaptivePatternMatchingCommandImplTest` (alur
  `execute()`) + 3 enrichment tetap hijau. (`AdaptivePatternBeanTest` = `@SpringBootTest` butuh Mongo →
  gagal load context di sandbox offline; **pre-existing**, gagal sama pada kode asli.)

- ✅ **Fase 3 (hapus mesin legacy) SELESAI.** `convertLegacyRule` + helper mati `getDefaultForField`
  dihapus dari `GenericPostProcessingEngine`. Cabang `else if (rule.getType() != null)` di
  `executePipeline` **tidak** menjadi silent-skip: ia kini **WARN + SKIP** (fail-loud) supaya sebuah rule
  ber-`type` yang mungkin tersisa di DB (hasil import admin lama) **tersurface**, bukan diam-diam hilang.
  Prasyarat repo terpenuhi (0 `type` di JSON/seed). **Caveat DB:** staging/prod tak terlihat dari repo —
  jika ada config ber-`type` di DB, rule-nya kini di-skip (dengan warning) dan **harus** dimigrasi ke
  `operations[]`. Test `GenericPostProcessingEngineLegacyEquivalenceTest` (Fase 1) **diganti**
  `GenericPostProcessingEngineLegacyTypeDecommissionedTest` (legacy type = no-op; operations[] tetap jalan).
  8 engine test hijau. Tak menyentuh katalog/kontrak AI.

**Berikutnya (belum):** Fase 4 (katalog/kontrak AI) — **paket koordinasi + audit sudah disiapkan di guide
`40-post-processing-legacy-fase4-coordination-package.md`**. Audit membuktikan risikonya JAUH lebih kecil
dari dugaan (AI tak emit post-processing ops & tak baca `OperationCatalogService`); koordinasi utama = FE,
bukan AI. Lalu Fase 5 (hapus field `type` di entity).

> ## ⚠️ PERINGATAN BAHAYA — baca sebelum menyentuh apa pun
> Status per Fase 3 (diperbarui):
> 1. **Kontrak AI agent — MASIH BERBAHAYA (Fase 4, belum digarap).** `OperationCatalogService` masih
>    mengiklankan op-op legacy ini ke JOLT-generation agent (via `PostProcessingCatalogController`).
>    Menghapus dari katalog = **mengubah kemampuan yang dilihat AI**. **JANGAN** menyentuh katalog tanpa
>    koordinasi dengan pemilik AI agent. Ini satu-satunya bahaya yang tersisa.
> 2. ~~Config admin-import wix pakai `type`~~ → **RESOLVED (Fase 1)**: dikonversi ke `operations[]`.
>    `convertLegacyRule` sudah **dihapus (Fase 3)**; sebuah rule ber-`type` (mis. dari DB lama) kini
>    **di-WARN + di-skip**, bukan dikonversi. Jika DB staging/prod punya config ber-`type`, migrasikan.
> 3. ~~Command adaptive-pattern bereaksi ke `rule.getType()`~~ → **RESOLVED (Fase 2)**.
>
> **Urutan salah = produksi rusak diam-diam.** Ikuti fase sesuai urutan; jangan lompat.

---

## 1. Peta subsistem legacy (apa, di mana, terhubung ke apa)

| Komponen        | File                                                                                    | Peran                                                                                                 | Dikonsumsi oleh                                  |
|-----------------|-----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| Field `type`    | `ChannelConfiguration.PostProcessingRule.type`                                          | penanda rule gaya lama                                                                                | executePipeline, adaptive command                |
| Jalur legacy    | `GenericPostProcessingEngine.executePipeline` (±153) → `convertLegacyRule` (±1371–1465) | `type` → operations modern on-the-fly                                                                 | dipicu saat `operations` kosong & `type != null` |
| 6 tipe legacy   | `convertLegacyRule`                                                                     | ENRICH_IMAGES, ENRICH_MEDIA, GENERATE_OPTIONS, MAP_DIMENSIONS, ENRICH_VARIANTS, LINK_MEDIA_TO_CHOICES | (lihat pemetaan §4)                              |
| Config JSON     | `resources/json/channel-configurations/wix-channel-configuration.json`                  | 2 rule pakai `type` ENRICH_MEDIA + GENERATE_OPTIONS                                                   | admin import (bukan seeder startup)              |
| Command         | `adaptivepattern/command/impl/AdaptivePatternMatchingCommandImpl` (±1082,1166,1180)     | percabangan `rule.getType()` legacy                                                                   | jalur adaptive-pattern                           |
| Katalog/kontrak | `channel/service/catalog/OperationCatalogService` + `PostProcessingCatalogController`   | daftar op yang "sah"                                                                                  | **AI JOLT agent** + FE                           |

**Fakta reachability (hasil audit):**
- Seeder Java `ChannelConfigurationDataLoader`: **0** rule memakai `.type()` → dari jalur startup, legacy **dorman**.
- Tetapi config JSON (admin-importable) **memakai** `type` → legacy **masih bisa hidup** lewat import.

---

## 2. Yang BUKAN target decommission (jangan dihapus)

Op berikut **valid dan hidup sebagai kapabilitas** (ada di engine + katalog), hanya **kebetulan tak
dipakai** di seed saat ini. Mereka **bukan** legacy dan **tidak boleh** dihapus dalam tugas ini:
`FILTER`, `COPY_FIELD`, `UNWRAP_FIELD`, `CONCAT_INTO`, `NEST_FIELD`, dst. Menghapusnya = mengurangi
kemampuan yang bisa dipakai AI/rule mendatang. Fokus tugas ini **hanya** sistem `rule.type` + 6 tipe legacy.

> Catatan: `UNWRAP_FIELD` **dipakai** oleh konversi `ENRICH_MEDIA`. Jadi ia harus tetap ada sampai
> `ENRICH_MEDIA` benar-benar hilang dari semua data — dan tetap dipertahankan sesudahnya karena ia op sah.

---

## 3. Prinsip aman (kenapa urutannya begini)

Aturan emas: **hapus produsen sebelum konsumen? Bukan — hapus DATA yang memakai fitur, lalu KONSUMEN
kode, baru MESIN, dan kontrak paling akhir & terpisah.** Alasannya: selama masih ada *satu* data yang
memakai `type`, mesin legacy wajib ada. Selama katalog mengiklankan, AI masih boleh memakainya.

Urutan invarian:
```
Fase 1 (data)  →  Fase 2 (konsumen kode non-kontrak)  →  Fase 3 (mesin convertLegacyRule)
                                                        →  Fase 4 (katalog/kontrak AI — TERPISAH, koordinasi)
                                                        →  Fase 5 (field type di entity)
```
Setiap fase harus **hijau + reversible** sebelum lanjut.

---

## 4. Pemetaan legacy `type` → operations modern (untuk konversi data)

Sumber kebenaran: `convertLegacyRule` (jangan menebak — salin dari sana). Ringkasnya:

| Legacy `type` | Ekuivalen modern `operations[]` |
|---|---|
| `ENRICH_IMAGES` | `FOR_EACH[ STRING_TO_OBJECT(keyField=src), SET_DEFAULT(alt=""), AUTO_INCREMENT(position, startAt=1) ]` (SET_DEFAULT/AUTO_INCREMENT hanya jika `addFields` memuatnya) |
| `ENRICH_MEDIA` | `FOR_EACH[ UNWRAP_FIELD(url), SET_DEFAULT(altText=""), SET_DEFAULT(mediaType="image") ]` |
| `GENERATE_OPTIONS` | `EXTRACT_DIMENSIONS(nameTransform=CAPITALIZE, valueStructure=FLAT_LIST[, dimensionFields]) + MAP_TO_INDEXED(fieldPrefix=option, startIndex=1[, dimensionFields])` |
| `MAP_DIMENSIONS` | `MAP_TO_INDEXED(fieldPrefix=option, startIndex=1[, dimensionFields])` |
| `ENRICH_VARIANTS` | `FOR_EACH[ SET_DEFAULT(field, <default>) per addField ]` (+ `CONDITIONAL_SET(product.manageVariants=true)` jika `configuration.requiresManageVariants`) |
| `LINK_MEDIA_TO_CHOICES` | `CROSS_LINK(matchField=<cfg|auto>, mediaField=<cfg|variantImages>)` |

Cara paling aman menghasilkan hasil identik: **jalankan `convertLegacyRule` sekali** (unit test / skrip
sekali-pakai) atas tiap rule legacy, lalu **tempel output `operations[]`-nya** ke config. Dengan begitu
hasil konversi terjamin sama byte-per-byte dengan perilaku lama.

---

## 5. Rencana fase demi fase

### Fase 0 — Audit ulang (wajib, karena data bisa berubah)
**Tujuan:** memastikan daftar pemakai `type` masih akurat saat eksekusi.
1. Cari semua rule legacy di **semua** sumber data (bukan hanya wix):
   ```bash
   grep -rIl "postProcessingRules" src/main/resources/json
   # untuk tiap file: cek entri rule yang punya "type"
   ```
2. Cari penetapan `.type(` pada `PostProcessingRule.builder()` di **seluruh** `src/main/java`.
3. Cek DB non-lokal (staging/prod) apakah ada dokumen `channel_configurations.postProcessingRules[*].type`
   (config yang pernah di-import admin). **Ini tak terlihat dari repo** — tanyakan/inspeksi DB.
4. Konfirmasi konsumen kode: `AdaptivePatternMatchingCommandImpl` (grep `getType()`), dan pastikan tak
   ada konsumen baru.
**Verifikasi:** daftar lengkap "siapa memakai `type`" tertulis. **Rollback:** —(read-only).

### Fase 1 — Konversi DATA legacy → operations modern
**Tujuan:** membuat **tidak ada lagi** data yang memakai `type`.
1. Untuk `wix-channel-configuration.json` (dan file lain hasil Fase 0): ganti tiap rule ber-`type` dengan
   `operations[]` modern hasil §4 (metode "jalankan convertLegacyRule lalu tempel").
2. Jika ada dokumen DB yang memakai `type` (staging/prod): siapkan skrip migrasi idempoten yang menulis
   `operations` dan menghapus `type` pada dokumen tersebut. Jalankan di staging dulu.
**Verifikasi:**
- Publish satu produk per channel terdampak (mis. Wix) **sebelum & sesudah** konversi → payload akhir
  identik (bandingkan output JOLT+post-processing).
- Golden test: rule legacy vs rule modern menghasilkan `data` sama.
**Rollback:** revert file/skrip (data-only, tak menyentuh mesin — aman).

### Fase 2 — Lepas konsumen kode non-kontrak
**Tujuan:** tak ada kode selain mesin yang membaca `type`.
1. `AdaptivePatternMatchingCommandImpl`: hapus percabangan `("ENRICH_IMAGES"/"GENERATE_OPTIONS").equals(getType())`.
   Pastikan jalur modern (operations) sudah mencakup kebutuhannya; jika command butuh info itu, ambil dari
   `operations[]`/config modern, bukan `type`.
**Verifikasi:** test adaptive-pattern hijau; jalankan command atas produk contoh → hasil sama.
**Rollback:** revert file.

### Fase 3 — Hapus mesin legacy (`convertLegacyRule`)
**Prasyarat:** Fase 1 & 2 selesai + **dikonfirmasi tidak ada** data ber-`type` di semua environment.
1. `GenericPostProcessingEngine.executePipeline`: hapus cabang `else if (rule.getType() != null)`.
2. Hapus method `convertLegacyRule` + helper yang hanya dipakainya (mis. `getDefaultForField` jika tak
   terpakai lagi — cek dulu).
**Verifikasi:** compile + seluruh suite post-processing hijau; publish per channel tetap sama.
**Rollback:** revert; mudah karena Fase 1/2 memastikan tak ada data yang butuh mesin ini.

### Fase 4 — Rekonsiliasi katalog & kontrak AI ⚠️ (TERPISAH, KOORDINASI)
**Ini menyentuh kontrak yang dikonsumsi AI agent — JANGAN digabung dengan Fase 1–3.**
Kondisi saat ini: `OperationCatalogService` mengiklankan `ENRICH_IMAGES/ENRICH_MEDIA/ENRICH_VARIANTS/
GENERATE_OPTIONS/MAP_DIMENSIONS/LINK_MEDIA_TO_CHOICES` sebagai **op**, padahal engine hanya menanganinya
sebagai **rule type** (setelah Fase 3, tak ditangani sama sekali). Ini "category error" yang harus
dibereskan **bersama pemilik AI agent**:
1. Putuskan bersama: apakah op-op itu (a) dihapus dari katalog, atau (b) dipetakan ke ekuivalen modern
   yang di-emit agent (mis. arahkan agent memakai `FOR_EACH`/`EXTRACT_DIMENSIONS`+`MAP_TO_INDEXED`).
2. Audit **spec JOLT/post-processing yang sudah di-generate & tersimpan di DB** — apakah ada yang meng-emit
   op legacy ini? Jika ya, migrasi dulu (mirip Fase 1) sebelum mengubah katalog.
3. Perbarui `OperationCatalogService` + prompt/tooling agent + FE yang membaca katalog **serempak**.
4. Selaraskan juga inkonsistensi katalog↔engine yang lain (op engine yang tak ada di katalog:
   `CONCAT_INTO`, `REMOVE_PATH`, `BUILD_MODEL`, `BUILD_TIER_VARIATION`, `BUILD_METAFIELD_LIST`,
   `BUILD_VARIANT_IMAGE_UPLOAD`, `BUILD_OPTIONS_FROM_FLAT_KEYS`) — putuskan tambah ke katalog atau biarkan
   internal.
**Verifikasi:** agent regen atas beberapa kategori → tak memakai op legacy; katalog == kemampuan engine.
**Rollback:** revert katalog + tooling (harus atomik dengan poin 3).

### Fase 5 — Hapus field `type` di entity (opsional, paling akhir)
**Prasyarat:** Fase 1–4 selesai + tak ada satupun kode/data/DB yang membaca/menulis `type`.
1. Hapus `type` dari `ChannelConfiguration.PostProcessingRule` (+ getter, + `@Builder` default jika ada).
2. Cek serialisasi: dokumen DB lama yang masih punya `type` akan diabaikan Jackson (unknown field) — pastikan
   `FAIL_ON_UNKNOWN_PROPERTIES=false` pada deserializer config (biasanya sudah).
**Verifikasi:** compile + startup + baca config lama tanpa error.
**Rollback:** revert entity.

---

## 6. Definition of Done
- [ ] Tak ada file config / dokumen DB yang memakai `postProcessingRules[*].type`.
- [ ] Tak ada kode (selain histori) membaca `rule.getType()`.
- [ ] `convertLegacyRule` dan cabang legacy di `executePipeline` hilang.
- [ ] Katalog `OperationCatalogService` konsisten dengan op yang benar-benar ditangani engine, disepakati
      pemilik AI agent, dan spec generated di DB sudah dimigrasi.
- [ ] (Opsional) field `type` dihapus dari entity.
- [ ] Publish per channel terdampak menghasilkan payload identik dengan sebelum decommission (golden).

## 7. Lampiran — perintah audit (reproducible)
```bash
# rule legacy di config JSON
for f in src/main/resources/json/channel-configurations/*.json; do
  python3 - "$f" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for r in (d.get('postProcessingRules') or []):
    if isinstance(r,dict) and 'type' in r: print(sys.argv[1], '→ type=', r['type'])
PY
done
# penetapan .type( pada rule di kode
grep -rIn "\.type(" src/main/java | grep -i "postprocess\|rule"
# konsumen getType()
grep -rIn "getType()" src/main/java/com/labamap/labamapomnichannelbe4fe/adaptivepattern
# katalog vs engine (op yang diiklankan tapi tak ditangani sebagai op, dan sebaliknya)
#   bandingkan OperationCatalogService.getAllSpecs() dengan case di executeOperation switch
```

**Kaitan:** [[GenericPostProcessingEngine]] · guide `POST-PROCESSING-CONTRACT-DESIGN.md` (top-level docs) ·
CLAUDE.md ("apiSchema/support-field" + "no hardcoded domain knowledge"). Engine reverse (`ReverseOps`) **tidak**
terpengaruh — ia interpreter terpisah (lihat `docs/reversesync/`).
