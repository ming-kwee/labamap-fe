# 18 — Rencana: `validate_jolt_spec` jadi data-driven (bayar hardcoding di `AgentToolHandlerService`)

> **Status: Fase 1, 2 & 3 SELESAI.** Ketiga blok `switch(channelId)` di `AgentToolHandlerService`
> (required-fields, warnings, channel-notes) sudah data-driven. Dokumen ini merinci pemindahan pengetahuan
> domain per-channel ke **data di MongoDB** + **evaluator generic** yang menggantikan `switch(channelId)`.
>
> **Terimplementasi (Fase 1):** `ChannelConfiguration.payloadRequirements` + nested `PayloadRequirement`;
> evaluator `AgentToolHandlerService.checkRequiredFields` (+ `requirementSatisfied`/`valueAtPath`/…);
> `validateJoltSpec` meneruskan config; seeder `ChannelConfigurationDataLoader.buildPayloadRequirements`
> untuk shopify/amazon/ebay/wix/tiktokshop (+ update-block meng-copy field ke DB lama saat restart).
>
> **Terimplementasi (Fase 2):** `PayloadRequirement.itemFieldTypes` (cek tipe field per-elemen array);
> `AgentToolHandlerService.detectWarnings` (WARNING-severity); `validateJoltSpec` mengambil warnings dari
> sini; seed WARNING untuk shopify (wrapper `product`) + tiktokshop (`skus[*].price` harus string).
>
> **Hardcode DIHAPUS (bukan disisakan sebagai fallback):** kedua `switch(channelId)` lama
> (`checkRequiredFieldsForChannel`, `detectChannelWarnings`) + helper `hasNestedPath` **dihapus total**; param
> `channelId`/`categoryId` yang tak terpakai di evaluator ikut dibuang. Channel tanpa `payloadRequirements`
> kini **tidak membuat klaim required** (hasil kosong) — bukan fallback ke logika hardcoded. **Konsekuensi:**
> cek lama `lazada → primary_category` **hilang** (lazada tak punya `ChannelConfiguration` di loader ini, jadi
> cek itu praktis tak terpakai di alur agen yang config-driven; seed sebagai data bila lazada dapat config).
> Test: `AgentPayloadRequirementEvaluatorTest` (14) + `ChannelPayloadRequirementsSeedTest` (5);
> `AgentToolHandlerServiceTest` (15) tetap hijau.
>
> Konteks: [15-jolt-agent-post-processing-split](15-jolt-agent-post-processing-split-konvergensi.md) ·
> [16-jolt-agent-gap-recommendations](16-jolt-agent-gap-recommendations.md) ·
> aturan repo *"No hardcoded domain knowledge in runtime code"* di `CLAUDE.md`.

---

## 0. Ringkasan eksekutif

`validate_jolt_spec` (tool yang dipanggil agen tiap ronde) memvalidasi output JOLT terhadap **tiga blok
`switch(channelId)` hardcoded** di `AgentToolHandlerService`. Ini melanggar aturan repo sendiri
(*runtime consumer* tak boleh meng-encode vocabulary domain sebagai literal) dan sudah menyebabkan bug
nyata (validator TikTok lolos untuk `skus={}` kosong — lihat §7).

**Rencana:** jadikan aturan validasi sebagai **data** (`ChannelConfiguration.payloadRequirements`,
mengikuti resolusi fallback system→org yang sudah ada), tulis **satu evaluator generic**, dan pindahkan
literal ke **seeder** (`ChannelConfigurationDataLoader` — rumah yang sah menurut pengecualian CLAUDE.md).
Efek samping: perbaikan "skus harus array non-kosong" (#3) menjadi **satu baris data**, bukan patch Java.

---

## 1. Masalah: tiga blok hardcoded (semua runtime)

Semua di `src/main/java/.../adaptivepattern/service/AgentToolHandlerService.java`, dipanggil dari
`validateJoltSpec` (L570) → tool `validate_jolt_spec` (L106/150), jadi **dieksekusi saat request**, bukan seed:

| Blok | Baris | Yang di-hardcode |
|---|---|---|
| `checkRequiredFieldsForChannel` | ~697 | nama field required per channel: `category_id`, `skus`, `title`, `brand`, `item_name`, `primary_category`, `condition_id`, `product.title`, `product.variants`, `name`/`product.name` |
| `detectChannelWarnings` | ~738 | aturan advisory: TikTok `price` harus STRING; Shopify wajib wrapper `product` |
| channel-notes untuk `get_channel_schema` | ~776 | `Map` hint per channel (shopify/amazon/tiktokshop/lazada/ebay/wix) |

**Tiga kegagalan (persis yang disebut CLAUDE.md):**
- **Drift** — `apiSchema` di DB bisa berubah; `switch` di Java tidak → validator menilai realitas yang beda.
- **Duplication** — pengetahuan ini **sudah ada** sebagai data (lihat §2), ini salinan kedua yang menyimpang.
- **Redeploy** — admin tak bisa memperbaiki misklasifikasi lewat data.

---

## 2. Datanya sudah ada di Mongo (kenapa hardcoding ini benar-benar duplikasi)

| Sumber | Status sekarang | Bukti |
|---|---|---|
| **`ChannelConfiguration.apiSchema`** | **Dipakai** agen | Memuat key top-level `category_id`, `skus`, `title`, `main_images`, … (`ChannelConfigurationDataLoader` L1127/1188). `get_channel_schema` mengembalikannya sebagai *"the authoritative target paths"*. Nama field yang di-hardcode validator **sudah** dibaca agen dari sini. |
| **`ChannelConfiguration.RequiredField` + `validationRules:Map`** | **MATI** (0 consumer) | Struktur "field wajib + aturan" ada di entity (L122–128) tapi grep = tak ada `getValidationRules()`/`RequiredField` dipakai runtime. |
| **`channel_category_requirements` + `MissingRequiredFieldsResolver`** | **Dipakai** jalur publish | `resolveRequiredFields(...)` + resolver menghitung required per channel/kategori dari data (dipakai `PublishPreflightGate`, completion %). Jalur publish **sudah** data-driven; agen mengabaikannya. |

**Kesimpulan:** `apiSchema` memberi **bentuk** (key apa yang ada) tapi tak menandai **wajib vs opsional**
maupun constraint bentuk ("array non-kosong"). Lapisan "wajib + constraint" itulah yang perlu jadi data —
dan struktur untuk itu (`RequiredField`) sudah ada tapi mati. Validator agen lahir sebagai *sanity-gate*
inline dan tak pernah di-wire ke sumber ini.

---

## 3. Prinsip desain

1. **Aturan = data, keputusan = kode generic.** Nol `switch(channelId)` di runtime.
2. **Reuse mekanisme yang sudah ada:** resolusi fallback config (system-default → org) seperti resolusi
   JOLT spec; filter `postProcessingOwnedTargets(config)` yang **sudah** data-driven tetap dipakai.
3. **Literal pindah ke seeder** (`ChannelConfigurationDataLoader`) — bukan dihapus, tapi dipindah ke rumah
   yang sah (pengecualian CLAUDE.md untuk `*DataLoader`/`*Migration`).
4. **Satu model menyatukan** required-check + warning (beda hanya `severity`). Channel-notes (panduan
   prompt LLM) **tidak** ikut — ditunda (§8), karena itu genuinely agent-specific.
5. **Agnostik-konsumen, bukan milik agen.** `payloadRequirements` mendeskripsikan **kontrak create-body
   channel** (fakta API), bukan artefak agen. Kini baru dipakai `validate_jolt_spec`, tapi konsumen
   non-agen sudah menanti: `PublishPreflightGate` sekarang **hanya cek INPUT form** dan *sengaja*
   mengecualikan kegagalan transformasi — jadi **tak ada** yang memvalidasi bentuk **payload output**
   sebelum kirim ke sync. Kontrak yang sama bisa memberi cek pre-send itu (+ mengisi publish-trace
   inspector, guide 14). Karena itu namanya **bukan** `agentXxx`. *(Nama `payloadRequirements` = nama
   kerja; boleh diganti mis. `bodyRequirements` — yang penting agnostik-konsumen.)*
6. **Tanpa hardcoded fallback.** Channel tanpa `payloadRequirements` **tidak membuat klaim required**
   (hasil kosong) — evaluator murni data. Tidak ada `switch(channelId)` sisa; kontrak channel hidup
   sepenuhnya sebagai data.

---

## 4. Skema config yang diusulkan

Field baru pada `ChannelConfiguration` (typed, bukan `Map` longgar):

```java
private List<PayloadRequirement> payloadRequirements;   // null/empty = channel tak punya klaim required

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public static class PayloadRequirement {
    private String path;             // dot-notation di output transform, mis. "skus", "product.title"
    private List<String> anyOfPaths; // alternatif (WIX: ["name","product.name"]) — cukup salah satu ada
    private String type;             // "string" | "number" | "boolean" | "array" | "object" (opsional)
    private Integer minItems;        // untuk type=array (skus → 1)
    private List<String> itemRequires; // tiap elemen array wajib punya key ini (skus → ["seller_sku"])
    private String severity;         // "ERROR" (masuk missing/gap) | "WARNING" (advisory)
    private Boolean ownedByPostProcessing; // opsional override; default: pakai deteksi dinamis (§6)
    private String message;          // pesan advisory (untuk WARNING) / hint gap
}
```

**Kenapa tipe baru, bukan `ValidationRule`/`RequiredField` yang ada?**
`ValidationRule` (fieldPattern/rule/value/severity, *"for compatibility with tests"*) semantiknya untuk
validasi **pola field input**, bukan **path output + constraint bentuk**. `RequiredField` lebih dekat tapi
dirancang untuk **source field** (`acceptableSourceFields`) dan `validationRules` yang tak bertipe. Tipe
`PayloadRequirement` baru = eksplisit, minim ambiguitas; dua struktur lama dibiarkan (atau `RequiredField`
di-deprecate terpisah). **Alternatif** yang juga sah: hidupkan kembali `RequiredField` + isi
`validationRules:Map` dengan `{minItems, itemRequires, …}` — hemat 1 tipe baru tapi kurang type-safe.

**Lapisan kategori (fase lanjutan):** override per kategori bisa masuk `channel_category_requirements`
(sudah ada) atau `apiSchemaExtension`; v1 cukup level channel di `ChannelConfiguration`.

---

## 5. Resolusi fallback

`payloadRequirements` ikut resolusi `ChannelConfiguration` yang sudah dipakai `validate_jolt_spec`
(config di-load lewat `channelConfigurationRepository.findActiveByChannelId` / system-default). Prioritas
sama seperti resolusi lain: **org+category > system+category > org+default > system+default**. v1 minimal:
ambil dari config aktif yang sama yang sudah dipakai untuk `apiSchema` + `postProcessingRules` — tak perlu
lookup baru.

---

## 6. Evaluator generic (ganti `checkRequiredFieldsForChannel` + `detectChannelWarnings`)

```
List<Finding> evaluate(output, config):
    reqs = config.payloadRequirements ?: []
    if reqs empty: return []                                // tak ada klaim required (tanpa hardcoded fallback)
    owned = postProcessingOwnedTargets(config)             // SUDAH data-driven, dipertahankan
    findings = []
    for r in reqs:
        present = r.anyOfPaths ? any(hasPath(output,p)) : hasPath(output, r.path)
        ok = present
        if present and r.type:       ok &= typeMatches(valueAt(output,r.path), r.type)
        if present and r.minItems:   ok &= isArray && size >= r.minItems
        if present and r.itemRequires: ok &= every element has all keys
        if not ok:
            ownedFlag = r.ownedByPostProcessing ?? owned.contains(topLevel(r.path))
            if ownedFlag: continue                          // dibangun post-processing → bukan tugas JOLT
            findings.add(Finding(r.path, r.severity ?: ERROR, r.message))
    return findings

// di validateJoltSpec:
missing  = findings.filter(ERROR).map(path)      // → passed & postProcessingGaps (perilaku sekarang)
warnings = findings.filter(WARNING).map(message) // → warnings[]
```

- `passed = missing.isEmpty() && !hasCriticalConflicts && indexCollisions.isEmpty()` **tak berubah**.
- Deteksi conflict/collision (`JoltTargetCollisionValidator`, dsb.) **tetap** — itu struktural, bukan
  vocabulary domain, jadi bukan target refactor ini.
- Filter `ownedByPostProcessing` menggantikan `missing.removeIf(ppOwned.contains(...))` yang sekarang.

---

## 7. Contoh: bug `skus` (#3) jadi murni data

Aturan sekarang (hardcoded, lemah): `if (!output.containsKey("skus")) missing.add("skus")` → `skus={}`
kosong **lolos** (key ada). Dengan `PayloadRequirement`:

```jsonc
{ "path": "skus", "type": "array", "minItems": 1, "itemRequires": ["seller_sku"], "severity": "ERROR" }
```

→ `skus={}` (map kosong / bukan array) **gagal** `type=array` & `minItems=1` → masuk `missing` →
`postProcessingGaps` → tersurface untuk developer. **Nol perubahan Java** untuk memperketatnya; menambah
channel lain = tambah entri. (Root-cause pengisian skus tetap urusan #2 — lihat guide 16 & analisis split.)

---

## 8. Warnings jadi data (channel-notes DITUNDA)

- **Warnings** (`detectChannelWarnings`) melebur ke `payloadRequirements` dengan `severity:"WARNING"`.
  Contoh TikTok: `{ "path":"skus", "itemRequires":["price"], "type":"array", "severity":"WARNING",
  "message":"TikTok price must be STRING not number — add modify-overwrite-beta" }` (atau constraint tipe
  pada `skus[*].price`). Shopify wrapper: `{ "path":"product", "severity":"WARNING", "message":"…" }`.
  Ini **agnostik-konsumen** juga (publish payload-preflight bisa memunculkan warning yang sama).
- **Channel-notes** (blok ke-3) — **✅ SELESAI (Fase 3).** Teks panduan prompt LLM: note struktural di-derive
  dari config, residual free-text di `ai_prompt_snippets`. Redundansi ~80%, derive-vs-store, rumah — di **§15**.

---

## 9. Seeder: pemindahan literal (nilai persis sekarang)

Isi `payloadRequirements` di `ChannelConfigurationDataLoader.create*Configuration()` per channel — hasil
terjemahan langsung dari `switch` yang ada:

| channel | payloadRequirements (ERROR kecuali disebut) |
|---|---|
| shopify | `product.title` · `product.variants` · WARNING: `product` (wrapper) |
| amazon | `brand` · `item_name` |
| tiktokshop | `category_id` (ownedByPostProcessing) · `skus` (array, minItems 1, itemRequires `seller_sku`) · WARNING `skus[*].price` string |
| ~~lazada~~ | **tak diseed** — lazada tak punya `ChannelConfiguration` di loader ini; cek lama `primary_category` dihapus (seed sebagai data bila lazada dapat config) |
| wix | anyOf `["name","product.name"]` |
| ebay | `title` · `condition_id` |

Presence-only kecuali disebut (mirror `containsKey`/`hasNestedPath` lama). Channel-notes **tidak** dipindah —
ditunda (§8). walmart/shopee: tak punya cek required sebelumnya → tetap kosong.

---

## 10. Rencana bertahap

- **Fase 1 — required-fields (mencakup #3). ✅ SELESAI.** `PayloadRequirement` + field di entity; seed 5
  channel (shopify/amazon/ebay/wix/tiktokshop); evaluator generic membaca ERROR-rules. **`switch` lama
  `checkRequiredFieldsForChannel` + `hasNestedPath` DIHAPUS** (bukan disisakan sebagai fallback).
- **Fase 2 — warnings. ✅ SELESAI.** `detectWarnings` data-driven (`severity:WARNING`); model diperluas
  `itemFieldTypes` untuk cek tipe field per-elemen array (TikTok `skus[*].price` harus string); seed WARNING
  untuk shopify + tiktokshop. **`switch` lama `detectChannelWarnings` DIHAPUS.**
- **Fase 3 — channel-notes. ✅ SELESAI.** `switch channelDomainNotes` DIHAPUS → note struktural di-derive
  dari config + residual free-text di collection **`ai_prompt_snippets`**. Detail & rasional di **§15**.

Tiap fase mandiri & bisa di-merge terpisah; Fase 1 memberi nilai terbesar (bayar offender utama + #3).

---

## 11. Dampak test

- **Baru:** unit test evaluator generic — array minItems, itemRequires, anyOfPaths, ownedByPostProcessing,
  severity ERROR vs WARNING, dan **kasus regresi `skus={}` → ERROR** (guard #3).
- **Update:** `AgentToolHandlerServiceTest` (15 test) — yang mengasumsikan required per channel kini
  bergantung pada `payloadRequirements` config test; sediakan config in-memory (bukan `switch`).
- **Seeder test:** verifikasi tiap system-default channel punya `payloadRequirements` non-kosong yang
  konsisten dengan `apiSchema` (mis. tiap `path` yang ERROR ada sebagai key di `apiSchema`).
- Test JOLT-gen (`JoltGeneration*Test`) diperkirakan tak berubah (mereka mem-mock CommandExecutor).

---

## 12. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Regresi saat migrasi | 5 channel utama diseed = paritas dengan `switch` lama; satu-satunya yang hilang = `lazada→primary_category` (tak punya config di loader ini, praktis tak terpakai di alur config-driven) |
| Seed drift dari `apiSchema` | Seeder-test yang meng-assert tiap ERROR-path ada di `apiSchema` |
| Over-strict memblok spec yang sebelumnya lolos | Fase 1 seed **hanya** menyamai `switch` sekarang; #3 (skus minItems) satu-satunya pengetatan, memang disengaja |
| `ownedByPostProcessing` ganda (flag vs deteksi dinamis) | Default = deteksi dinamis `postProcessingOwnedTargets`; flag hanya override eksplisit |

---

## 13. Hubungan ke #2 / #3

- **#3** (skus non-kosong) **selesai sebagai data** di Fase 1 (§7) — bukan patch Java.
- **#2** (skus benar-benar terisi: variant-scope sku/price/inventory, atau build via post-processing)
  **di luar** scope refactor ini; ini soal klasifikasi master attribute / rule post-processing, bukan
  validator. Refactor ini hanya memastikan kekosongan **tersurface jujur**, mengarahkan ke #2.

---

## 14. Out of scope / ditunda

- **Channel-notes → data (blok ke-3): ✅ SELESAI** (Fase 3) — derive dari config + `ai_prompt_snippets`. Lihat **§15**.
- Deteksi conflict/collision JOLT (struktural, bukan vocabulary domain) — tetap di kode.
- Perubahan alur agen/timeout (sudah ditangani terpisah).
- Lapisan requirement per-kategori (bisa fase lanjutan; v1 cukup level channel).

---

## 15. Studi Fase 3 — `channelDomainNotes` (blok ke-3) → data

> **Status: ✅ SELESAI (mengikuti keputusan studi ini).** Blok ke-3 (`AgentToolHandlerService.channelDomainNotes`,
> `switch(channelId)`) berbeda sifat dari blok 1–2: ia **bukan** kontrak body, melainkan **teks panduan
> prompt untuk LLM**, disuntik ke hasil tool `get_channel_schema` (`schema.put("domainNotes", …)`) lalu
> dibaca model saat menulis spec. Arah: **developer → agent (LLM)**, bukan agent → user.
>
> **Terimplementasi:** `switch channelDomainNotes` **DIHAPUS**. `domainNotes` kini = (a) `deriveDomainNotes(config)`
> — note struktural (rootWrapper, requiredPaths, advisories) diturunkan dari `apiWrapperConfig` +
> `payloadRequirements` (nol drift; kontradiksi amazon "flat" vs `rootKey=Item` **resolved** ke sumber
> terstruktur) + (b) residual free-text dari collection baru **`ai_prompt_snippets`** (`AiPromptSnippet` +
> `AiPromptSnippetRepository` di `adaptivepattern.repository` yang sudah ter-scan MongoConfig +
> `AiPromptSnippetDataLoader` @Order(140), gated `app.data.seed-on-startup`). Seed residual = 4 note unik
> (shopify/handle, amazon/bulletPoints, amazon/brand, ebay/conditionId); note redundan **tidak** diseed.
> `get_channel_schema` menambah lookup snippet ke `Mono.zip` (zip4). Test: `AgentDeriveDomainNotesTest` (5,
> termasuk guard resolusi drift amazon) + `AiPromptSnippetDataLoaderTest` (2).

### 15.1 Temuan utama: ~80% redundan

Tiap note dicek terhadap struktur yang **sudah** ada. Sebagian besar hanya mengulang data yang lain:

| Note (per channel) | Status | Sumber sebenarnya |
|---|---|---|
| `rootWrapper` (shopify/tiktok/amazon/…) | **REDUNDAN** | `ChannelConfiguration.apiWrapperConfig.rootKey` |
| `variantPath` / `skuPath` / `imageStructure` / `stockInfo` / price-path | **REDUNDAN** | `apiSchema` + post-processing rules (BUILD_STOCK_INFOS, image, BUILD_CHOICES_MAP) |
| `category*` / `primaryCategory` "dari live Taxonomy API, bukan master" | **REDUNDAN** | subsistem `ChannelCategoryApiConfig` (treeApiConfig) + COPY_PATH + `ownedByPostProcessing` |
| tiktok `priceType` "STRING not number" | **REDUNDAN** | sudah **WARNING** `payloadRequirement` (Fase 2) |
| amazon `brand REQUIRED`, ebay `conditionId REQUIRED`, wix `titleField` name | **REDUNDAN** | `payloadRequirements` (brand / condition_id / anyOf[name, product.name]) |
| shopify `handle` "auto-generated from title if missing" | **UNIK** | — |
| amazon `bulletPoints` "array, max 5 items, max 500 chars" | **UNIK** | — |
| amazon `brand` "match registry exactly", ebay `conditionId` "numeric" | **Sebagian unik** | required-nya ada; kalimat bebasnya belum |

**Bukti drift (menguatkan alasan jangan simpan-ulang):** note amazon `rootWrapper` = *"No root wrapper — flat
JSON"* sedangkan `apiWrapperConfig.rootKey` amazon = **`"Item"`**. Dua sumber hardcoded ini **saling
bertentangan** — persis risiko drift yang aturan CLAUDE.md peringatkan. Menyimpan-ulang note yang seharusnya
berasal dari struktur = menciptakan sumber-kebenaran ganda. **Resolusi kontradiksi ini bagian dari studi.**

### 15.2 Keputusan: derive-atau-buang yang redundan, simpan hanya residual

Jangan copy-paste `domainNotes` ke Mongo (itu mengulang duplikasi yang sedang dibayar). Pisahkan:

1. **Note redundan → JANGAN disimpan.** Pilihan:
   - **(a) Derive saat request** — `get_channel_schema` merakit note dari `apiWrapperConfig` +
     `payloadRequirements` + `ChannelCategoryApiConfig` + post-processing (nol storage, nol drift), **atau**
   - **(b) Buang** — LLM sudah menerima `apiSchema` + `apiWrapperConfig` di tool result; note-nya sekadar
     parafrase. Uji dulu apakah kualitas spec turun tanpa note redundan (kemungkinan tidak).
2. **Hanya residual free-text unik** (handle auto-gen, bullet-points 5/500, "match registry exactly")
   yang butuh rumah baru.

### 15.3 Rumah untuk residual: collection terpisah `ai_prompt_*` (direkomendasikan)

Untuk residual (murni panduan LLM), **collection terpisah `ai_prompt_*` lebih baik** daripada menempel di
`ChannelConfiguration`:

| Alasan | Kenapa terpisah menang |
|---|---|
| **Audience/lifecycle beda** | Teks prompt di-tune prompt-engineer, bisa diversi & A/B — beda dari `ChannelConfiguration` (kontrak API yang dikonsumsi banyak service non-agen). Mencampur = kopling dua lifecycle. |
| **Preseden penamaan** | Repo sudah punya `ai_agent_sessions`, `ai_recommendations`, `ai_schema_embeddings`, `ai_calibration_config`. `ai_prompt_*` masuk keluarga itu & self-documenting. |
| **Extensible** | Kalau nanti fragmen system-prompt / deskripsi tool / few-shot / panduan per-kategori jadi data, `ai_prompt_*` jadi rumah alaminya. |
| **Prinsip nama (terbalik dari payloadRequirements)** | `payloadRequirements` agnostik-konsumen karena kontrak bersama; ini **genuinely agent-only** → nama ber-`ai_` **justru tepat**. |

**Kapan TIDAK perlu:** kalau setelah buang redundan cuma tersisa 2–3 hint mungil → satu collection penuh =
over-engineering; cukup `field_semantic_knowledge` (sudah "reference data untuk agen") atau field kecil di
config. Mulai `ai_prompt_*` **hanya** bila visi "prompt-as-data" lebih luas (system-prompt, tool-desc, few-shot).

**Usulan bentuk** (collection `ai_prompt_snippets`), key `(scope, channelId, categoryId?, key)`:
```jsonc
{ "scope": "channel_schema_note", "channelId": "amazon", "key": "bulletPoints",
  "text": "bullet_points as array, max 5 items, max 500 chars each", "enabled": true }
```
`get_channel_schema` lookup by `channelId` → gabung dengan note yang **di-derive** dari struktur (15.2a).

### 15.4 Rencana implementasi Fase 3 (bila di-ACC)

1. Audit final note redundan vs unik (tabel 15.1) + **resolve kontradiksi amazon** (flat vs `Item`).
2. Untuk redundan: pilih derive (15.2a) atau drop (15.2b); ukur dampak ke kualitas spec (RAG/eval).
3. Untuk residual: buat `ai_prompt_snippets` + repository + `*DataLoader` seed (rumah literal yang sah).
4. `get_channel_schema`: ganti `channelDomainNotes(switch)` → derive + lookup `ai_prompt_snippets`; **hapus
   `switch`**.
5. Test: derive dari config benar; lookup snippet benar; kontradiksi amazon tak muncul lagi.

### 15.5 Open questions

- Apakah note redundan boleh **dibuang total** (LLM cukup dari `apiSchema`/`apiWrapperConfig`), atau perlu
  di-derive eksplisit demi keterbacaan prompt? (butuh eval kualitas spec sebelum/sesudah)
- `ai_prompt_snippets` generik (multi-scope) sejak awal, atau `ai_prompt_channel_notes` spesifik dulu?
- Perlukah versioning/A-B pada snippet (kolom `version`/`variant`), atau cukup `enabled`?
