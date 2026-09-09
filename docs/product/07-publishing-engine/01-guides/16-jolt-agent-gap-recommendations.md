# JOLT-Generation Agent: rekomendasi gap ke developer (#3 katalog op + surfacing ke `AiRecommendation`)

> **Ringkasan.** Lanjutan dari
> [15-jolt-agent-post-processing-split-konvergensi.md](15-jolt-agent-post-processing-split-konvergensi.md).
> Setelah agent bisa **konvergen** (#1) dan mendeteksi **gap sejati** (#2), dua hal berikut mengubah gap
> itu menjadi **tugas developer yang actionable**:
> - **#3 — katalog op post-processing (data-driven)**: agent bisa menyebut **op yang tepat** saat
>   merekomendasikan penambahan rule, tanpa hardcode `field → op`.
> - **Surfacing gap ke `AiRecommendation`**: gap ditulis sebagai field terstruktur di entity recommendation
>   agar **UI review** menampilkannya rapi ke developer.

---

## 1. Mengapa perlu langkah ini

Dari #2, `validate_jolt_spec` menghasilkan `postProcessingGaps` = required field yang **bukan** hasil JOLT
**dan bukan** post-processing-owned. Untuk gap sejati, jawaban yang benar **bukan** "agent memaksakan
mapping JOLT" (tak mungkin), melainkan: **rekomendasikan ke developer post-processing apa yang harus
ditambah** — field mana, op mana, dan (idealnya) contohnya. Lalu spec **di-blokir** ke review sampai
developer mengerjakannya.

Dua pertanyaan turunan:
1. **Dari mana agent tahu op apa yang tersedia** (tanpa hardcode `field → op`)? → **#3 katalog op**.
2. **Bagaimana gap sampai ke developer** yang membuka Review Queue? → **surfacing ke `AiRecommendation`**.

---

## 2. #3 — katalog op post-processing (data-driven)

### 2.1 Prinsip: turunkan dari rule yang sudah ada

Katalog **tidak** ditulis tangan (itu akan melanggar prinsip *no hardcoded domain knowledge*). Ia
**diturunkan dari rule post-processing yang benar-benar dipakai** di semua channel system-default:

```
findAllSystemDefaults()  →  untuk tiap rule  →  kumpulkan op distinct (operations[].op / legacy type)
                                              →  simpan satu contoh nyata per op
```

Implementasi: `AgentToolHandlerService.postProcessingOpCatalog()` → daftar entri:

```json
{
  "op": "BUILD_TIER_VARIATION",
  "buildsTarget": "tier_variation",
  "usedBy": "shopee / shopee-build-tier-variation",
  "example": { "op": "BUILD_TIER_VARIATION", "dimensionSource": "_source._productTypeVariantDimensions", … }
}
```

Karena diturunkan dari data, katalog ini **= apa pun yang pipeline nyata pakai** dan **swa-perbarui**
saat rule berubah. Contoh op yang muncul: `BUILD_TIER_VARIATION`, `BUILD_MODEL`, `BUILD_SALES_ATTRIBUTES`,
`BUILD_STOCK_INFOS`, `BUILD_ATTRIBUTE_LIST`, `WRAP_ARRAY_TO_OBJECTS`, `FOR_EACH`, `SET_DEFAULT`,
`EXTRACT_DIMENSIONS`, `MAP_TO_INDEXED`, dll (lihat juga
[02-api-reference/04-post-processing-operations.md](../02-api-reference/04-post-processing-operations.md)).

### 2.2 Disajikan sebagai *knowledge*, bukan tool baru

Katalog disuntikkan ke hasil `get_channel_schema` (dipanggil **sekali** per sesi), bukan tool tersendiri —
jadi **tak menambah round-trip** dan tak menambah jumlah tool. Field yang ditambahkan:

```json
"postProcessingOpCatalog": [ … ],
"postProcessingOpCatalogNote":
  "Kalau ada REQUIRED target field tanpa JOLT source & tanpa post-processing rule (gap dari
   validate_jolt_spec), JANGAN loop memetakan di JOLT — rekomendasikan menambah post-processing rule
   pakai salah satu op ini (pilih yang contohnya membangun field/shape serupa)."
```

### 2.3 Apa yang bisa & tak bisa

| Kemampuan | Status |
|---|---|
| Deteksi **field** yang butuh post-processing (dari #2) | ✅ andal |
| Menyebut **op** kandidat + contoh nyata | ✅ dari katalog data-driven |
| Menyusun **konfigurasi op** persis & final | ⚠️ *best-effort* — developer memverifikasi (op punya param spesifik) |

---

## 3. Surfacing gap ke `AiRecommendation` (untuk UI review)

Gap dihitung di `validate_jolt_spec` (dalam `AgentToolHandlerService`), tapi recommendation dibuat di
`JoltGenerationAgentService`. Jadi gap perlu **di-alirkan** — dan secara **deterministik** (dari hasil
tool, bukan self-report LLM).

### 3.1 Alur end-to-end

```
validate_jolt_spec  →  "postProcessingGaps": [ … ]        (dihitung kode, #2)
        │
        ▼  loop menangkap gaps terbaru tiap validate  (lastGaps: AtomicReference)
AgentRawOutput.postProcessingGaps                          (di-attach saat loop selesai)
        │
        ▼  finalizeAndRoute → build JoltGenerationResult
JoltGenerationResult.ValidationSummary.postProcessingGaps
        │
        ▼  AiRecommendationService.createFromJoltGeneration
AiRecommendation.Analysis.postProcessingGaps   @Field("post_processing_gaps")   ← tersimpan
```

Titik-titik penting:
- **Capture per-validate:** setiap hasil `validate_jolt_spec` meng-update `lastGaps` (`gapsFromResult(r)`).
  Pada *stop-on-pass* (lolos), gaps kosong — benar (spec yang lolos memang tak punya gap).
- **Deterministik:** gaps berasal dari **hasil tool** (kode), bukan dari `validationResult` yang
  di-*self-report* LLM.

### 3.2 Field baru di entity

`AiRecommendation.Analysis` mendapat field khusus, **dibedakan** dari `missingChannelRequirements`:

```java
/** Required target fields with no JOLT source AND no post-processing rule — the reviewer must add a
 *  post-processing rule for each (distinct from missingChannelRequirements, which may be JOLT-fixable). */
@Field("post_processing_gaps")
private List<String> postProcessingGaps;
```

| Field di `Analysis` | Arti |
|---|---|
| `missingChannelRequirements` | Required field yang kurang — **mungkin** cukup diperbaiki di JOLT |
| **`postProcessingGaps`** | Required field yang butuh **rule post-processing baru** (tak bisa via JOLT) |

Perbedaan ini yang berharga untuk reviewer: ia langsung tahu **jenis** pekerjaan yang diperlukan.

### 3.3 Pengalaman developer di Review Queue

Saat gap sejati muncul, spec **tak auto-apply** (`passed=false`) → `AiRecommendation` berstatus `PENDING`
(lihat [/docs/AI-RECOMMENDATIONS-REVIEW-QUEUE-EXPLAINER.md](../../../AI-RECOMMENDATIONS-REVIEW-QUEUE-EXPLAINER.md)).
Reviewer melihat:
- `analysis.postProcessingGaps` — daftar field yang butuh post-processing rule.
- (dari #3) katalog op sebagai referensi op yang bisa dipakai.

Sehingga alih-alih **kegagalan senyap + timeout**, developer mendapat **daftar tugas post-processing yang
jelas** untuk di-wire, lalu approve/re-generate.

---

## 4. Berkas & verifikasi

| Berkas | Perubahan |
|---|---|
| `AgentToolHandlerService.java` | `postProcessingOpCatalog()` (data-driven) + disuntik ke `get_channel_schema`; dependency `ChannelConfigurationRepository` |
| `JoltGenerationAgentService.java` | holder `lastGaps` + capture per-validate + attach ke `raw`; field ke-7 `postProcessingGaps` di record `AgentRawOutput` (+ konstruktor 6-arg convenience); helper `gapsFromResult`; set di `ValidationSummary` |
| `JoltGenerationResult.java` | `ValidationSummary.postProcessingGaps` |
| `AiRecommendation.java` | `Analysis.postProcessingGaps` (`@Field("post_processing_gaps")`) |
| `AiRecommendationService.java` | map gaps → `Analysis` di `createFromJoltGeneration` |

**Verifikasi:** compile **BUILD SUCCESS**; `AgentToolHandlerServiceTest` 15/15, `JoltGeneration*Test` 8/8
→ **23/23**, tanpa regresi. Konstruktor 6-arg convenience membuat test lama tak perlu diubah.

---

## 5. Batasan & sisa pekerjaan

- **Katalog:** menambah ~1 query + sedikit context ke `get_channel_schema` (sekali per sesi) — ringan.
- **Gap muncul hanya saat ada gap sejati** (terminal non-passing yang di-route ke review). Pada spec
  lolos, `postProcessingGaps` kosong.
- **Konfigurasi op** yang diusulkan bersifat *best-effort* — developer memverifikasi param.
- **Frontend:** UI Review Queue perlu me-*render* `analysis.postProcessingGaps` (perubahan FE kecil, di
  luar scope backend ini).
- **Belum E2E:** terverifikasi unit + compile; pembuktian akhir adalah run live Shopee/clothing.

---

## 6. Gambaran utuh arc JOLT-agent

| # | Lapisan | Efek |
|---|---|---|
| **#1** | Strip owned-target di `validate` + capture spec bersih | Collision gambar hilang → Shopee konvergen |
| **#2** | Completeness sadar-cakupan + deteksi gap sejati | Tak false-fail; gap sejati → blokir→review |
| **#3** | Katalog op data-driven di `get_channel_schema` | Agent usulkan op yang tepat |
| **Surface** | Gaps → `AiRecommendation.Analysis.postProcessingGaps` | Developer lihat tugas post-processing di Review Queue |

Bersama: agent (a) **tidak lagi bertempur di wilayah post-processing** (konvergen, bukan loop),
(b) **tidak false-fail** untuk field yang sudah ter-cover, dan (c) saat ada **gap sejati**, mengubah
kegagalan senyap menjadi **rekomendasi developer yang jelas** — lengkap dengan menu op yang tersedia.
</content>
