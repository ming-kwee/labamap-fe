# Penjelasan: JOLT Generation Console vs Publish Diagnostics (Mode 1 & 2), Recommendation Review, dan SKIPPED_PROTECTED

**Untuk:** siapa pun yang bingung "layar mana untuk apa, siapa yang pakai, kapan".
Dokumen ini menjelaskan pelan-pelan, dari model mental sampai detail.

---

## 0. Model mental dulu (baca ini pertama)

Ada **tiga permukaan** yang semuanya berhubungan dengan JOLT spec, tapi **tujuannya berbeda**. Bingung
muncul karena ketiganya menampilkan "JOLT + confidence". Bedakan lewat **dua sumbu**:

- **Menulis (author) vs Membaca (diagnose)** — apakah ia membuat/mengubah spec, atau hanya memeriksa?
- **Produk nyata vs Produk hipotetis** — apakah pakai produk tersimpan, atau JSON yang di-paste?

```
                        MENULIS (author)                 MEMBACA (diagnose)
Produk (channel+kategori) │ JOLT Generation Console      │
Produk NYATA (dari DB)    │                              │ Publish Diagnostics — Mode 1
Produk HIPOTETIS (paste)  │                              │ Publish Diagnostics — Mode 2
```

Satu koleksi tujuan menulis: **`channel_jolt_specs`** (satu record per channel+kategori+organisasi).
Semua tulisan bermuara ke sana.

---

## 1. JOLT Generation Console

**Endpoint:** `POST /api/v1/admin/ai/generate-jolt`
**Backend:** `AiAdminController` → `JoltGenerationAgentService.generateJoltSpec()` (agent LLM langsung, **tanpa** APM)

### Fungsi
Alat **authoring**: sengaja **membuat** JOLT spec untuk sebuah `channel + kategori`, memakai agen LLM,
dari sebuah **produk contoh** (bisa dibangun otomatis dari ProductType).

### Siapa
**Admin / tim platform.** Ada di bawah `/admin/...` dan hanya muncul di permukaan admin.

### Kapan
- **Cold-start**: bikin spec untuk channel/kategori yang **belum ada produk apa pun** (jadi tak ada yang
  memicu pembuatan otomatis).
- **Override / koreksi manual**: admin ingin membuat/menimpa spec dengan sengaja.
- **Tuning**: menyetel spec untuk kombinasi channel/kategori tertentu.

### Apa yang terjadi dengan hasilnya (INI PENTING)
Agen menghasilkan spec + `confidence` (skala 0–1). Routing berdasarkan confidence:

| Confidence      | Status                   | Aksi                                                                                 |
|-----------------|--------------------------|--------------------------------------------------------------------------------------|
| **≥ 0.92**      | `AUTO_APPLIED`           | **Langsung ditulis** ke `channel_jolt_specs` (auto-apply)                            |
| **0.70 – 0.92** | `RECOMMENDATION_CREATED` | Dibuat **AiRecommendation** → masuk **Recommendation Review Queue** (tunggu manusia) |
| **< 0.70**      | `MANUAL_REVIEW_REQUIRED` | Tidak menulis, tidak bikin rekomendasi                                               |

Pengaman: kalau spec punya **konflik kritis** atau **tak bisa di-compile** (Chainr), auto-apply **diblokir**
walau confidence tinggi → diturunkan jadi **rekomendasi** (supaya manusia meninjau, tak menerapkan spec rusak).

> Jadi Console adalah jalur **manual/sengaja** yang bisa langsung menulis (≥0.92) **atau** memberi makan
> antrian review (0.70–0.92).

### 1a. "Kenapa agent LANGSUNG, tanpa APM?" — dua mesin, satu pengetahuan

Console memanggil agent LLM tanpa menjalankan APM. Itu **bukan** karena "APM dititipkan ke RAG", melainkan
karena **APM dan agent adalah dua mesin berbeda yang membaca sumber pengetahuan yang SAMA**:

- **APM** = matcher heuristik 5-tier (cocokkan field satu-per-satu). Deterministik, murah.
- **Agent** = LLM yang **menalar struktur secara holistik** (nesting, kuirk channel), bisa `IMPROVE` spec
  yang sudah ada, dan **memvalidasi** hasilnya (Chainr).

Agent tidak "buta" terhadap yang diketahui APM — ia membaca koleksi yang sama, **langsung via tools**:

| Tool agent | Membaca | Sama dengan… |
|---|---|---|
| `find_field_mappings` | `channel_field_mappings` | sumber **APM Tier-1** |
| `get_semantic_knowledge` | `field_semantic_knowledge` | sumber **APM Tier-2** |
| `search_similar_jolt_specs` | RAG (spec ter-embed) | contoh/preseden |
| `get_channel_schema` | apiSchema channel | — |
| `validate_jolt_spec` | Chainr (compile) | pengaman |

RAG **juga** berisi embedding dari ketiga koleksi (`embedJoltSpec`/`embedFieldMapping`/`embedSemanticKnowledge`),
jadi "pengetahuan APM ada di RAG" memang benar — tapi agent tak bergantung pada RAG saja; ia query koleksi
aslinya langsung + memakai RAG untuk contoh.

**Kenapa bypass APM di Console:** agent lebih mampu untuk authoring kasus sulit. Itu sebabnya jalur otomatis
(**cascade**) meng-eskalasi **APM → agent** justru saat APM lemah; **Console = versi sengaja** dari eskalasi itu
("langsung pakai mesin pintar"). Menjalankan APM dulu = redundan untuk tujuan authoring.

**Keduanya saling memberi makan** — dan **kini simetris** (beda hanya pada TIER; sejarah asimetri di **§4a**):

```
AUTO-APPLY (agent ≥0.92)                      APPROVE (manusia, Review Queue)
     │ enrichFieldMappings (UNVERIFIED)            │ enrichFromJoltSpec (MANUALLY_TESTED)
     ▼                                              ▼
channel_field_mappings ──▶ APM Tier-1         channel_field_mappings ──▶ APM Tier-1
     │ embedFieldMapping + embedJoltSpec           │ embedFieldMapping + embedJoltSpec
     ▼                                              ▼
   RAG ──▶ Agent (contoh mapping + spec)        RAG ──▶ Agent (contoh mapping + spec)
```

> Dua-duanya kini meng-enrich `channel_field_mappings` **dan** meng-embed spec+mapping ke RAG. Beda satu-satunya:
> auto-apply menulis tier **UNVERIFIED** (mesin, ceiling 60), approve menulis **MANUALLY_TESTED** (manusia menjamin,
> ceiling 75 — belum ada bukti produksi). Harus tier kanonik: string non-tangga seperti "VERIFIED" akan jatuh ke
> ceiling UNVERIFIED dan membatalkan kenaikan kepercayaan.

---

## 2. Publish Diagnostics — Mode 1 ("Dari My Products")

**Endpoint:** `POST /api/v1/channels/publish/analyze`
**Backend:** `PublishAnalysisService` (menjalankan **APM**, `persistJolt=true`, `forceReanalyze=true`)

### Fungsi
**Dry-run kesiapan** untuk **produk NYATA** yang tersimpan. Menjalankan seluruh pipeline publish sebagai
laporan 7-stage (data produk → data Step-2 → merge → APM → JOLT → transform → post-processing).
**Tidak mem-publish apa pun.**

### Siapa
**Admin / ops.** (Per doc frontend Phase-0, ini "admin Publish Diagnostics screen" — kategori & diagnostik
"not merchant-facing".) **Bukan** tugas rutin merchant.

### Kapan
- Debug: *"kenapa produk INI belum siap publish ke channel INI?"*
- Verifikasi kesiapan sebelum sync sungguhan.

### Menulis atau tidak?
**Bisa menulis** — walau namanya "diagnostics". Karena internalnya `persistJolt=true`:
- APM mem-persist spec hasil regenerasi ke `channel_jolt_specs`, **dan**
- karena `persistJolt=true`, **cascade boleh jalan** → agen bisa auto-apply (≥0.92) atau bikin rekomendasi
  (0.70–0.92).

> Jadi Mode 1 = diagnostik yang **punya efek tulis** (by design). Itu sebabnya guard presedensi (Bagian 4)
> penting agar ia tak menimpa spec milik manusia.

---

## 3. Publish Diagnostics — Mode 2 ("Paste JSON")

**Endpoint:** `POST /api/v1/adaptive-pattern-matching/analyze`
**Backend:** `AdaptivePatternMatchingController` → **APM langsung** (`persistJolt=false`, `forceReanalyze=true`)

### Fungsi
**Dry-run schema-level** untuk **produk HIPOTETIS** (JSON yang di-paste). Menampilkan breakdown 5-tier
matching, field mappings + confidence, unmapped fields, JOLT readiness, dan raw spec.

### Siapa
**Developer / QA / admin.** Alat untuk memeriksa perilaku matching atas sebuah bentuk data **tanpa** harus
menyimpan produk lebih dulu.

### Kapan
- Uji bentuk produk baru sebelum benar-benar membuatnya.
- Reproduksi masalah matching dengan JSON minimal.

### Menulis atau tidak?
**Tidak menulis.** `persistJolt=false` → APM tak persist. Dan sejak perbaikan #3, **cascade tak dipicu saat
dry-run** → agen tak dijalankan → tak ada tulisan, tak ada biaya LLM. Mode 2 kini benar-benar bebas
efek-samping.

---

## 4. Bagian mana yang masuk ke Recommendation Review?

**AiRecommendation dibuat oleh agen** (`JoltGenerationAgentService`) ketika:
- confidence **0.70 – 0.92**, **atau**
- auto-apply diblokir (konflik kritis / spec tak compile) → diturunkan jadi rekomendasi.

Rekomendasi bisa datang dari **jalur mana pun yang memanggil agen**:

| Sumber | Memicu agen? | Bisa bikin rekomendasi? |
|---|---|---|
| **JOLT Generation Console** | Ya (agen langsung) | **Ya** (0.70–0.92) |
| **Publish Diagnostics Mode 1** | Ya (cascade, `persistJolt=true`) | **Ya** (via cascade, sering async di background) |
| **Publish Diagnostics Mode 2** | **Tidak** (dry-run, cascade mati) | **Tidak** |

**Alur review:**
1. Rekomendasi masuk **Recommendation Review Queue** (`RecommendationsReviewQueue.tsx` /
   `AiRecommendationController`).
2. Manusia **approve / reject**.
3. **Approve** → `AiRecommendationService.approve()` menulis spec ke `channel_jolt_specs` dengan
   `generatedBy = "ai-approved-by:<reviewer>"` (dan key 3-bagian: channel+kategori+org yang benar).

> Ringkas: **≥0.92 lewat Console/Mode-1 = tulis otomatis**; **0.70–0.92 = mampir ke Review Queue dulu**;
> **approve = tulisan resmi manusia**.

---

## 4a. Asimetri pembelajaran auto-apply vs approve (celah — kini DITUTUP)

Dulu dua jalur "apply" menulis **sisi pengetahuan yang berbeda**, dan tidak simetris. Kini keduanya
menulis kedua sisi; beda satu-satunya adalah **tier**.

| Aksi (waktu) | `channel_field_mappings` | RAG: field-mapping | RAG: jolt-spec |
|---|---|---|---|
| **Auto-apply** (agent ≥0.92) — **dulu** | ✅ create (UNVERIFIED) | ✅ `embedFieldMapping` | ❌ tidak |
| **Manual approve** — **dulu** | ❌ tidak sama sekali | ❌ tidak | ✅ `embedJoltSpec` |
| **Auto-apply** — **sekarang** | ✅ create (**UNVERIFIED**, ceiling 60) | ✅ | ✅ **`embedJoltSpec` (baru)** |
| **Manual approve** — **sekarang** | ✅ create (**MANUALLY_TESTED**, ceiling 75, baru) | ✅ (efek samping upsert) | ✅ `embedJoltSpec` |

**Apa yang diperbaiki (commit fix):**
- `autoApply → embedJoltSpec(saved)` — spec auto-applied kini jadi contoh di RAG (dulu tidak).
- `approve → enrichFromJoltSpec(..., "MANUALLY_TESTED")` — spec yang di-approve kini mengajari APM Tier-1, di
  tier kanonik **MANUALLY_TESTED** (ceiling 75, "manusia menjamin, belum ada bukti produksi" — lebih tinggi dari
  UNVERIFIED/60 milik auto-apply), diatribusikan ke reviewer (`ai-approved-by:X`). Tier harus nilai tangga
  kanonik (`UNVERIFIED / MANUALLY_TESTED / VERIFIED_PRODUCTION / CERTIFIED_HIGH_VOLUME`) — string lain jatuh ke
  ceiling UNVERIFIED.
- Ekstraksi mapping dipusatkan di `LearnedMappingWriter` (`enrichFromJoltSpec` + `extractSimpleMappings` +
  overload `upsert` ber-tier), dipakai kedua jalur.
- Keduanya menghormati kill-switch yang sama (`recommendation.enrichMappings`).

**Kenapa dulu begitu (bukan bug refactor — inkonsisten sejak lahir):** model `ProposedFix.type`
(`AiRecommendation.java:149`) sejak awal mengantisipasi **empat** jenis fix —
`JOLT_PATCH | NEW_JOLT | FIELD_MAPPING_ADD | FIELD_MAPPING_UPDATE`. Struktur `FieldMappingChange`
(`source/old-target/new-target/confidence`) + `recordApprovalFeedback`/`processRejection` (counter
success/failure Beta) dibangun untuk jenis **FIELD_MAPPING_ADD/UPDATE** (mengoreksi mapping satu-per-satu).
Tapi di commit yang **sama** (`3e77098 implementasi ai phase 3,4,5`) hanya **produsen `JOLT_PATCH`**
(`createFromJoltGeneration`) yang di-wire — `fieldMappingChanges` tak pernah diisi siapa pun, jadi
`recordApprovalFeedback` adalah **dead code** (konsumen tanpa produsen), sementara `enrichFieldMappings`
ditempel hanya ke auto-apply. Ringkas: **arsitektur aspiratif setengah jadi** — dua jenis rekomendasi +
dua feedback-loop dirancang, hanya jalur JOLT yang disambung. `recordApprovalFeedback` sengaja dibiarkan
(no-op untuk `JOLT_PATCH`) kalau-kalau produsen `FIELD_MAPPING_*` dibangun nanti; enrichment di atas kini
yang mengajari APM dari sebuah approval JOLT.

---

## 5. Hubungan dengan `SKIPPED_PROTECTED`

`SKIPPED_PROTECTED` adalah **rem presedensi**: penulis **otomatis** tak boleh menimpa spec yang **dimiliki
manusia**.

Sebuah spec dianggap **"protected"** bila `ChannelJoltSpec.isProtectedFromAutoOverwrite()` true, yaitu:
- `isManuallyConfigured == true` (dikonfigurasi admin), **atau**
- `generatedBy` diawali `"ai-approved-by:"` (**hasil approve di Recommendation Review**).

**Inilah simpul yang menyambungkan semuanya:** begitu sebuah spec **di-approve** lewat Review Queue, ia
menjadi **protected**. Setelah itu:

- **Agent auto-apply** (dari Console ≥0.92, atau cascade Mode-1) yang mencoba menimpa → **dilewati**,
  mengembalikan status **`SKIPPED_PROTECTED`** (tak menulis).
- **APM persist** (Mode-1) yang mencoba menimpa → **dilewati** (log `[JOLT-PRECEDENCE]`).
- **Hanya manusia** (approve lagi, atau edit manual) yang boleh menimpanya.

```
Recommendation Review ──approve──▶ spec "ai-approved-by:X"  (PROTECTED)
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                  ▼
  APM /analyze (Mode 1)          Agent auto-apply (Console/cascade)   Human approve/edit
  → SKIP                          → SKIPPED_PROTECTED                  → boleh menimpa
```

### Apakah skip-nya tercatat? (Ya — tidak senyap)
- **APM persist (Mode 1):** respons memuat pesan jujur *"JOLT not persisted: existing spec is human-owned
  (approved/manual) — kept as-is."* (bukan lagi keliru "persisted") + log `[JOLT-PRECEDENCE]`.
- **Agent auto-apply:** status `SKIPPED_PROTECTED` di respons (Console/cascade-sync), **dan** dicatat
  permanen di `AiAgentSession.applyOutcome` (bisa di-query) — jadi cascade async pun tak lagi "log-only".

> Intinya: **Review + approve = mengunci spec.** `SKIPPED_PROTECTED` adalah bukti bahwa penulis otomatis
> menghormati kunci itu, sehingga kerja review manusia tak hilang ditimpa `/analyze` atau cascade —
> dan setiap skip terlacak (respons + `AiAgentSession.applyOutcome`).

---

## 6. Tabel ringkas

|                               | JOLT Generation Console                  | Publish Diag — Mode 1                 | Publish Diag — Mode 2                |
|-------------------------------|------------------------------------------|---------------------------------------|--------------------------------------|
| Endpoint                      | `/admin/ai/generate-jolt`                | `/channels/publish/analyze`           | `/adaptive-pattern-matching/analyze` |
| Backend                       | Agen LLM langsung                        | `PublishAnalysisService` (APM)        | APM langsung                         |
| Tujuan                        | **Author** spec                          | **Diagnose** produk nyata             | **Diagnose** schema hipotetis        |
| Siapa                         | Admin                                    | Admin / ops                           | Developer / QA / admin               |
| Input                         | channel+kategori (+ sample)              | `masterProductId` (produk nyata)      | JSON di-paste                        |
| Menulis `channel_jolt_specs`? | **Ya** (≥0.92) / rekomendasi (0.70–0.92) | **Ya** (`persistJolt=true`) + cascade | **Tidak** (dry-run)                  |
| Feed Review Queue?            | Ya                                       | Ya (via cascade)                      | Tidak                                |
| Hormati `SKIPPED_PROTECTED`?  | Ya (auto-apply)                          | Ya (APM skip + cascade)               | Tidak relevan (tak menulis)          |

---

## 7. Kalau harus memilih satu kalimat per permukaan

- **JOLT Generation Console** — *admin sengaja membuat/menyetel spec channel; bisa langsung dipakai atau
  masuk antrian review.*
- **Publish Diagnostics Mode 1** — *admin memeriksa kesiapan publish sebuah produk nyata; ikut menulis
  spec (tapi kini tak menimpa yang dikunci manusia).*
- **Publish Diagnostics Mode 2** — *developer menguji bentuk data hipotetis; murni baca, tanpa efek samping.*
- **SKIPPED_PROTECTED** — *sinyal bahwa spec sudah dikunci manusia (approved/manual), jadi penulis otomatis
  menolak menimpanya.*
