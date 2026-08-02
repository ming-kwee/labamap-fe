# Contoh Nyata: Agentic AI + RAG Mempermudah Kerja Developer

**Platform**: Shopify · **Kategori**: clothing
**Skenario**: dari nol (belum ada JOLT) → developer review sekali → otomatis & mandiri

Dokumen ini menelusuri **satu channel dari awal**, dengan data konkret di setiap langkah,
memakai entitas & endpoint yang benar-benar ada di sistem (Phase 1–5).
Tujuannya menunjukkan bagaimana kerja developer menyusut dari **~jam** → **~menit** → **nol**.

> **Catatan (2026-07-30): pemetaan gambar di contoh ini sudah historis.** Contoh di bawah menampilkan
> agent memetakan `mainImage → product.images[0].src` lewat JOLT — ini masih ilustrasi valid tentang
> *alur* penalaran RAG + tool-call agent untuk field pada umumnya. Namun **gambar produk kini
> JOLT-independent**: `mainImage` + `galleryImages` digabung jadi satu array `images` kanonik saat input,
> lalu tiap channel membangun field gambarnya di post-processing dari staging key `_sourceImages`
> (Shopify via rule `shopify-build-images`). JOLT tidak lagi memetakan gambar, dan agent tidak lagi perlu
> me-mapping-nya — anggap `mainImage` di sini sebagai contoh field generik saja. Lihat
> `docs/product/07-publishing-engine/01-guides/05-post-processing-config.md`.

---

## 0. Masalahnya: Cara Lama (tanpa AI)

Developer harus menerbitkan produk fashion ke Shopify. Ia membuka dokumentasi Shopify dan
menulis JOLT spec **manual**:

```jsonc
// JOLT tulisan tangan — percobaan pertama
[
  { "operation": "shift",
    "spec": {
      "name": "title",                 // ❌ Shopify butuh product.title (ada wrapper)
      "description": "body_html",       // ❌ harus product.body_html
      "price": "price",                 // ❌ harga ada di level varian
      "variants": { "*": { "color": "variants[&1].option1" } }  // ❌ kehilangan size, sku, harga, stok
    }
  }
]
```

**Akibat**: publish ditolak Shopify ("title can't be blank", "variants required").
Developer trial-error baca docs, perbaiki path, ulang berkali-kali — **1–3 jam per kategori baru**.
Pengetahuan ini ada di kepala developer, tidak terdokumentasi, dan hilang saat ia pindah tim.

---

## 1. Hari ke-1 — Produk Pertama (RAG masih kosong / cold start)

### 1.1 Data master product

```json
{
  "masterProductId": "mp-001",
  "name": "Kemeja Batik Premium",
  "description": "Kemeja batik katun premium, motif parang.",
  "price": 250000,
  "sku": "KBP-001",
  "weight": 250,
  "mainImage": "https://cdn.labamap.id/kbp-001.jpg",
  "categorySlug": "clothing",
  "variants": [
    { "color": "Coklat", "size": "M", "sku": "KBP-001-M", "stock": 12 },
    { "color": "Coklat", "size": "L", "sku": "KBP-001-L", "stock": 8 }
  ]
}
```

### 1.2 Developer memicu agent — satu panggilan

```bash
curl -X POST ".../api/v1/admin/ai/generate-jolt?channelId=shopify&categoryId=clothing" \
     -H "Content-Type: application/json" \
     -d @master-product-mp-001.json
```

### 1.3 Phase 1 — RAG retrieval (kosong, karena belum ada data)

Tool `search_similar_jolt_specs` dipanggil agent. `ai_schema_embeddings` masih kosong untuk
shopify/clothing:

```json
{ "count": 0, "results": [] }
```

→ Tidak ada contoh historis. Agent tidak menyerah — ia pakai sumber lain.

### 1.4 Phase 2/3 — Agent reasoning (tool-use loop)

`ai_agent_sessions` mencatat langkah agent:

```json
{
  "id": "jolt-gen-7f3a...",
  "triggerType": "JOLT_GENERATION",
  "channelId": "shopify", "categoryId": "clothing",
  "agentSteps": [
    { "step": 1, "tool": "search_similar_jolt_specs", "output": "{count:0}", "durationMs": 210 },
    { "step": 2, "tool": "get_channel_schema",
      "output": "{rootWrapper:'all under product', variantPath:'product.variants[*]', imageStructure:'product.images[*].src'}",
      "durationMs": 45 },
    { "step": 3, "tool": "find_field_mappings", "input": {"sourceField":"weight","channelId":"shopify"},
      "output": "{mappings:[{targetField:'product.variants.*.grams', successRate:50, verificationTier:'UNVERIFIED'}]}",
      "durationMs": 60 },
    { "step": 4, "tool": "validate_jolt_spec", "output": "{passed:true, missingRequiredFields:[]}",
      "durationMs": 95 }
  ],
  "summary": { "toolRoundsUsed": 4, "confidenceAfter": 0.78 },
  "status": "COMPLETED"
}
```

Agent tahu (dari `get_channel_schema`) aturan Shopify: wrapper `product`, varian di
`product.variants[*]`, gambar di `product.images[*].src`. Ia memvalidasi JOLT dengan
`validate_jolt_spec` terhadap data sampel sebelum menyerahkan.

### 1.5 JOLT yang dihasilkan agent

```json
[
  { "operation": "shift",
    "spec": {
      "name":        "product.title",
      "description": "product.body_html",
      "mainImage":   "product.images[0].src",
      "variants": {
        "*": {
          "color":  "product.variants[&1].option1",
          "size":   "product.variants[&1].option2",
          "sku":    "product.variants[&1].sku",
          "price":  "product.variants[&1].price",
          "stock":  "product.variants[&1].inventory_quantity",
          "@(2,weight)": "product.variants[&1].grams"
        }
      }
    }
  },
  { "operation": "default",
    "spec": { "product": { "status": "active", "vendor": "Labamap" } } }
]
```

### 1.6 Routing berdasarkan confidence → RECOMMENDATION

`confidence = 0.78` (di bawah AUTO_APPLY 0.92, di atas RECOMMEND 0.70) → masuk antrian approval.
`JoltGenerationResult`:

```json
{ "status": "RECOMMENDATION_CREATED", "recommendationId": "rec-101",
  "confidenceScore": 0.78, "sessionId": "jolt-gen-7f3a..." }
```

### 1.7 Developer review — sudah disiapkan lengkap

```bash
curl ".../api/v1/admin/ai/recommendations/rec-101"
```
```json
{
  "id": "rec-101", "status": "PENDING", "priority": "MEDIUM",
  "channelId": "shopify", "categoryId": "clothing",
  "analysis": {
    "rootCause": "Shopify requires the 'product' wrapper and per-variant pricing; raw master fields are flat.",
    "confidenceScore": 0.78, "confidenceLevel": "MEDIUM",
    "warnings": []
  },
  "proposedFix": {
    "type": "JOLT_PATCH",
    "explanation": "[shift] map master fields to Shopify product structure; [default] add status+vendor.",
    "diff": { "added": [ { "operation": "shift", "after": "product.* mappings", "reason": "new spec" } ],
              "totalChanges": 8 }
  }
}
```

Developer **tidak menulis JOLT** — ia hanya **membaca** alasan + diff, lalu approve:

```bash
curl -X POST ".../api/v1/admin/ai/recommendations/rec-101/approve?reviewedBy=dev@labamap.id&note=Verified"
```

**Waktu developer: ~5 menit baca + 1 klik** (vs 1–3 jam menulis manual).

### 1.8 Yang terjadi otomatis saat approve

1. JOLT ditulis ke `channel_jolt_specs`:
```json
{
  "channelId": "shopify", "categoryId": "clothing", "isSystemDefault": true,
  "joltSpec": [ /* spec dari 1.5 */ ],
  "joltMetadata": { "version": "v1.0", "confidence": 0.78,
                    "generatedBy": "ai-approved-by:dev@labamap.id", "mappingCount": 8 }
}
```
2. JOLT itu **di-embed ke RAG** (`ai_schema_embeddings`) — jadi bahan belajar:
```json
{
  "sourceType": "JOLT_SPEC", "referenceId": "<jolt-id>",
  "channelId": "shopify", "categoryId": "clothing",
  "embeddedText": "channelId=shopify categoryId=clothing requiredFields=[name,description,price,sku,variants] confidence=0.78 ...",
  "embedding": [0.0123, -0.0456, ...]   // 1536-dim
}
```

---

## 2. Hari ke-5 — Produk Kedua (kategori sama)

Setelah Hari 1, JOLT shopify/clothing **sudah tersimpan** di `channel_jolt_specs`. Penting
membedakan **dua hal yang berbeda** di sini — keduanya "0 menit kerja developer" tapi lewat
mekanisme yang **tidak sama**:

| | (A) Publish normal — **REUSE** | (B) Regenerasi — **AUTO_APPLIED** |
|---|---|---|
| Kapan | Setiap publish produk biasa | Saat agent dijalankan ulang (lihat 2.3) |
| Komponen | `ChannelPublishService.findJoltSpecWithFallback()` | `JoltGenerationAgentService` |
| Agent/LLM/RAG dipakai? | **TIDAK** | **YA** |
| Biaya | $0, ~0 ms | 1 panggilan LLM + embedding |
| Hasil | Pakai JOLT yang sudah ada | Tulis JOLT baru/diperbarui ke `channel_jolt_specs` |

### 2.1 Yang TERJADI saat publish produk kedua → REUSE (bukan agent)

```json
{ "masterProductId": "mp-014", "name": "Dress Linen Casual", "price": 320000,
  "sku": "DLC-014", "categorySlug": "clothing",
  "variants": [ { "color": "Putih", "size": "S", "sku": "DLC-014-S", "stock": 5 } ] }
```

Publish biasa (storeId Shopify). `ChannelPublishService` **membaca JOLT tersimpan**:

```
ChannelPublishService.publishProduct(mp-014)
  └─ findJoltSpecWithFallback("shopify", "clothing", orgId)
       └─ channel_jolt_specs → JOLT v1.0 (hasil approval Hari 1)   ← REUSE
  └─ transform → publish
```

**Agent TIDAK jalan. APM TIDAK jalan. RAG TIDAK di-query. LLM TIDAK dipanggil.**
Produk kedua "gratis & instan" **karena JOLT-nya sudah ada** — bukan karena AI bekerja lagi.
Inilah nilai utama: kurasi sekali (Hari 1), pakai berkali-kali tanpa biaya AI.

### 2.2 Kapan RAG & agent BARU dipakai lagi?

Agent (`JoltGenerationAgentService`) hanya jalan saat di-trigger eksplisit:
- `POST /admin/ai/generate-jolt` (manual)
- Publish **GAGAL** karena error JOLT → trigger regenerasi (`isJoltRelatedError`)
- Schema drift terdeteksi (cron harian 02:00)

### 2.3 Saat agent dijalankan ulang → RAG menemukan pola → AUTO_APPLIED

Misal developer memicu regenerasi untuk menyempurnakan JOLT. Sekarang RAG **sudah punya data**:

```bash
# search_similar_jolt_specs dipanggil agent (internal)
```
```json
{ "count": 1, "results": [
  { "referenceId": "<jolt-id mp-001>", "channelId": "shopify", "categoryId": "clothing",
    "similarityScore": 0.91,
    "context": "channelId=shopify categoryId=clothing requiredFields=[name,description,price,sku,variants]..." }
]}
```

JOLT terbukti (score 0.91) + validasi lulus → `confidence = 0.94 ≥ 0.92` → langsung diterapkan
**tanpa review developer**:

```json
{ "status": "AUTO_APPLIED", "joltSpecId": "<jolt-id>", "confidenceScore": 0.94 }
```

Bedanya dengan Hari 1: dulu `RECOMMENDATION_CREATED` (perlu approve) karena RAG kosong &
confidence 0.78. Sekarang `AUTO_APPLIED` karena RAG sudah punya pola terbukti. **Itulah dampak
RAG**: menaikkan confidence sampai melewati ambang auto-apply, menghapus langkah review.

---

## 3. Hari ke-30 — Sistem Menjadi Mandiri (learning loop)

### 3.1 Setiap publish sukses menaikkan kepercayaan (Beta distribution)

`ChannelFieldMapping` untuk `weight → product.variants.*.grams` berkembang via
`LearningFeedbackService.recordPublishOutcome()`:

| Waktu | successCount | failureCount | verificationTier | getEffectiveConfidence() |
|---|---|---|---|---|
| Hari 1 (baru) | 0 | 0 | UNVERIFIED | **50%** (Beta(1,1)) |
| Hari 5 | 3 | 0 | MANUALLY_TESTED | **75%** (capped tier) |
| Hari 15 | 12 | 0 | VERIFIED_PRODUCTION | **90%** |
| Hari 30 | 47 | 1 | CERTIFIED_HIGH_VOLUME | **96.0%** (Beta(48,2)) |

> Angka bukan tebakan developer — dihitung otomatis dari hasil publish nyata
> (`(s+1)/(s+f+2)`), dengan tier ceiling sebagai pengaman.

### 3.2 Dashboard learning

```bash
curl ".../api/v1/admin/ai/learning/stats?days=30"
```
```json
{
  "period": "last_30_days",
  "channels": [ { "channelId": "shopify", "approved": 1, "rejected": 0, "approvalRate": 1.0 } ],
  "calibration": [ { "channelId": "shopify", "autoApplyThreshold": 0.90, "reason": "CALIBRATED", "sampleSize": 12 } ],
  "fieldMappings": { "totalMappings": 23, "lowSuccessRate": 0, "avgSuccessRate": 94.2 },
  "modelHealth": { "joltEmbeddingCount": 4, "pendingRecommendations": 0, "embeddingEnabled": true, "agentEnabled": true }
}
```

### 3.3 Schema drift — sistem menjaga dirinya sendiri

Jika admin mengubah `categoryRequirements` Shopify (mis. menambah field wajib `fabric`),
`SchemaDriftDetectorService` (harian 02:00) mendeteksi hash berubah dan memicu regenerasi
JOLT otomatis → developer dapat 1 recommendation untuk di-review, bukan publish massal yang gagal.

---

## 4. Ringkasan: Kerja Developer Menyusut

| Tahap | Tanpa AI | Dengan Agentic AI + RAG |
|---|---|---|
| Produk pertama (kategori baru) | 1–3 jam tulis JOLT + trial-error | **~5 menit** baca + approve 1 recommendation (agent) |
| Produk ke-2..N (kategori sama) | ulang validasi tiap kali | **0 menit** — **reuse** JOLT tersimpan (tanpa AI, tanpa biaya) |
| Regenerasi/penyempurnaan JOLT | tulis ulang manual | **0 menit** — **AUTO_APPLIED** bila RAG sudah punya pola (confidence ≥ ambang) |
| Channel API berubah | publish massal gagal, debugging panik | **1 recommendation** dari drift detector |
| Pengetahuan mapping | di kepala developer, hilang saat pindah | tersimpan di `channel_field_mappings` + RAG, makin akurat |
| Skor akurasi | tebakan subjektif | Beta distribution dari hasil nyata |

> **Reuse ≠ AUTO_APPLIED.** *Reuse* = publish normal membaca JOLT tersimpan (tak menyentuh AI).
> *AUTO_APPLIED* = agent dijalankan ulang & confidence cukup tinggi untuk menerapkan JOLT baru
> tanpa review. Keduanya 0 menit kerja developer, tapi hanya AUTO_APPLIED yang melibatkan LLM+RAG.

**Inti**: RAG mengubah pengalaman publish pertama menjadi **aset yang dapat dipakai ulang**.
Developer cukup mengkurasi sekali; sistem mereplikasi & menyempurnakannya sendiri.

---

## 5. Peta ke Kode (semua nyata, bukan ilustrasi)

| Langkah contoh | Komponen kode |
|---|---|
| 1.2 picu generate | `AiAdminController POST /generate-jolt` → `JoltGenerationAgentService` |
| 1.3 RAG search | `RagSearchService` → `VectorStore.search()` (Atlas / pgvector) |
| 1.4 tool-use | `AgentToolHandlerService` (6 tools) + `ai_agent_sessions` |
| 1.6 routing | `JoltGenerationAgentService.routeResult()` (0.92 / 0.70 threshold) |
| 1.7 review | `AiRecommendation` + `AiRecommendationController` |
| 1.8 approve→embed | `AiRecommendationService.approve()` → `RagEmbeddingService.embedJoltSpec()` |
| 2.1 **reuse** (publish normal) | `ChannelPublishService.findJoltSpecWithFallback()` → baca `channel_jolt_specs` (tanpa agent/APM) |
| 2.3 **auto-apply** (regenerasi) | `JoltGenerationAgentService.autoApply()` → tulis `channel_jolt_specs` |
| 3.1 belajar | `LearningFeedbackService` + `ChannelFieldMapping.getEffectiveConfidence()` |
| 3.2 dashboard | `AiAdminController GET /learning/stats` |
| 3.3 drift | `SchemaDriftDetectorService` (cron 02:00) |

> **Catatan jalur**: `JoltGenerationAgentService` (yang dipakai contoh ini) **tidak** memanggil
> APM (`AdaptivePatternMatchingCommandImpl`). APM adalah jalur paralel terpisah (dipicu
> `/adaptive-pattern/*` & `PublishAnalysisService /analyze`) yang memakai heuristik
> `FieldMatchingService` + Phase 2 enrichment + `JoltSpecGeneratorService`. Keduanya menulis ke
> `channel_jolt_specs` yang sama, tapi independen. Publish normal tidak memanggil keduanya —
> hanya membaca JOLT tersimpan.

Setup backend: [SETUP-ATLAS.md](setup/SETUP-ATLAS.md) atau [SETUP-PGVECTOR.md](setup/SETUP-PGVECTOR.md).
