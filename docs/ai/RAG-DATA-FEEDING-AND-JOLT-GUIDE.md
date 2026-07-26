# RAG Data Feeding & JOLT Generation Guide

**Tanggal**: 2026-06-28  
**Relevan ke**: Phase 1 (RAG Foundation) + Phase 2 (Pattern Matching Agent)  
**Pertanyaan yang dijawab**:
1. Data RAG di-feed secara manual atau otomatis?
2. Bagaimana RAG membantu menghasilkan JOLT yang benar?

---

## Bagian 1 — Cara Data Masuk ke RAG

### Gambaran Umum: 3 Lapisan Data

RAG sistem ini memiliki **dua lapis** dalam aliran data:

```
Layer A: SOURCE DATA (MongoDB collections)
  ├── channel_jolt_specs         ← JOLT spec per (channelId, categoryId)
  ├── channel_field_mappings     ← Mapping historis dengan success rate
  └── field_semantic_knowledge   ← Ontologi semantik field

        ↓ di-embed oleh RagEmbeddingService
        ↓ (teks → vektor 1536-dimensi via OpenAI API)

Layer B: VECTOR INDEX (MongoDB Atlas)
  └── ai_schema_embeddings       ← Vektor + metadata, di-query saat agent berjalan
```

Data harus masuk ke **Layer A dulu**, baru kemudian di-embed ke **Layer B**.

---

### ⚠️ Klarifikasi Penting: Publish TIDAK Langsung Embed ke RAG

> **Pertanyaan wajar**: "Apakah setiap publish meng-embed data ke RAG dan membuat data/biaya membengkak?"
>
> **Jawaban**: **TIDAK.** Berikut penjelasan lengkapnya berdasarkan kode aktual.

---

### 1.1 Apa yang Terjadi Saat Publish (Kode Aktual)

```
SETIAP PUBLISH REQUEST
        │
        ▼
AdaptivePatternMatchingCommandImpl.execute()
        │
        ├── canUseStoredJoltSpec()? ──YES──► Pakai JOLT dari DB
        │       (90%+ kasus ini)              Tidak ada matching
        │                                     Tidak ada AI
        │                                     Tidak ada embedding ✓
        │
        └── NO (JOLT belum ada / forceReanalyze=true)
                │
                ▼
            Heuristic matching + AI enrichment (Phase 2)
                │
                ▼
            persistJoltSpecToCollection()
                │
                └── channelJoltSpecRepository.save(joltSpecDoc).then()
                    ← HANYA simpan ke MongoDB
                    ← TIDAK memanggil ragEmbeddingService sama sekali ✓
```

**Kesimpulan**:
- `persistJoltSpecToCollection()` di kode **tidak memanggil embedding** — dicek langsung di baris 683.
- 90%+ publish request menggunakan JOLT yang sudah ada → **tidak ada APM, tidak ada AI, tidak ada embedding**.
- JOLT hanya digenerate ulang saat pertama kali atau `forceReanalyze=true`.

---

### 1.2 Berapa Banyak Dokumen di `ai_schema_embeddings`?

`channel_jolt_specs` memiliki **unique constraint** pada `(channelId, categoryId, organizationId)` — artinya **UPSERT**, bukan INSERT. Satu dokumen per kombinasi channel × kategori.

```
PERHITUNGAN NYATA JUMLAH EMBEDDING:

JOLT_SPEC embeddings:
  6 channels × 10 kategori × 1 org = max 60 dokumen

FIELD_MAPPING embeddings:
  ~300–500 mapping aktif = max 500 dokumen

SEMANTIC_KNOWLEDGE embeddings:
  ~100–200 field knowledge = max 200 dokumen

TOTAL MAKSIMUM: ~800 dokumen di ai_schema_embeddings
(bukan per-publish, tapi total sepanjang lifetime platform)
```

Content hash mencegah re-embed jika isi tidak berubah:
```java
// RagEmbeddingService.upsertEmbedding():
if (hash.equals(existing.getContentHash())) {
    return Mono.just(existing); // skip OpenAI API call
}
```

---

### 1.3 Estimasi Biaya Embedding (OpenAI text-embedding-3-small)

```
Harga: $0.020 per 1 juta tokens

Rata-rata teks per dokumen: ~300 token

SKENARIO 1 — First deploy reindex semua data:
  800 dokumen × 300 token = 240,000 token
  Biaya: $0.005 (setengah sen dollar)

SKENARIO 2 — Update harian (admin edit 5 JOLT/hari):
  5 dokumen × 300 token = 1,500 token/hari
  Biaya: $0.00003/hari ≈ $0.001/bulan

SKENARIO 3 — Publish 10,000 produk per hari:
  Biaya embedding: $0 (publish tidak trigger embedding)
  → hanya pakai stored JOLT dari DB
```

Embedding benar-benar **bukan fungsi dari volume publish**, tapi fungsi dari **seberapa sering JOLT spec atau field mapping diupdate**.

---

### 1.4 Kapan Embedding BENAR-BENAR Terjadi?

Hanya 3 trigger:

| Trigger | Kondisi | Frekuensi |
|---|---|---|
| `PUT /admin/channel-jolt-specs/{id}` | Admin edit JOLT di admin UI | Sesekali (jika ada perbaikan) |
| `POST /admin/ai/reindex` | Developer jalankan manual | Saat first deploy atau bulk update |
| `AI_REINDEX_ON_STARTUP=true` | Startup dengan flag | 1x saat pertama deploy |

**Yang TIDAK trigger embedding:**
- ❌ Publish produk
- ❌ Adaptive pattern matching berjalan
- ❌ Phase 2 AI agent enrichment
- ❌ `persistJoltSpecToCollection()` (JOLT tersimpan tapi tidak di-embed otomatis)

---

### 1.5 Yang Perlu Dibenahi (Gap Saat Ini)

Ada **satu gap**: saat `persistJoltSpecToCollection()` menyimpan JOLT baru, embedding tidak langsung terjadi. JOLT baru ini baru tersedia di RAG setelah:
1. Admin mengedit ulang JOLT tersebut (memicu auto-embed), atau
2. Developer menjalankan manual reindex

Untuk Phase 5, hook bisa ditambah di `persistJoltSpecToCollection()`:
```java
return channelJoltSpecRepository.save(joltSpecDoc)
        .doOnSuccess(saved -> ragEmbeddingService.embedJoltSpec(saved)
                .subscribe())  // ← tambahkan ini
        .then();
```

Tapi ini **opsional** — RAG tetap berjalan dengan baik menggunakan JOLT lama yang sudah ter-embed. JOLT baru hanya akan dibutuhkan RAG pada publish *berikutnya* di channel/kategori yang sama.

---

### 1.6 Feeding Otomatis yang Sudah Ada

#### B. Saat Admin Update JOLT via Admin UI

Setiap kali admin memperbarui JOLT spec melalui:
```
PUT /api/v1/admin/channel-jolt-specs/{id}
```

Hook sudah dipasang di `ChannelJoltSpecAdminController`:
```java
return repository.save(existing)
    .doOnSuccess(saved -> ragEmbeddingService.embedJoltSpec(saved)
        .subscribe(...));   // ← auto re-embed setelah save
```

**Ini adalah satu-satunya path yang benar-benar fully automatic end-to-end**: edit JOLT di admin → tersimpan → langsung ter-embed ke RAG.

#### C. Data Semantic Knowledge — Seeded by DataInitializationService

`DataInitializationService` (`CommandLineRunner` @Order(~10)) mem-populate `field_semantic_knowledge` saat startup pertama kali dengan data seperti:

```java
// Contoh data yang di-seed:
FieldSemanticKnowledge.builder()
    .fieldName("price")
    .semanticType("PRICE")
    .aliases(List.of("harga", "cost", "retail_price", "item_price", "list_price"))
    .keywords(List.of("price", "cost", "amount", "value"))
    .validChannels(Set.of("shopify", "amazon", "lazada", "tiktokshop"))
    .build()
```

Data ini di-embed ke RAG saat **startup reindex** (lihat §1.3).

#### D. Field Mappings — Dari Publish History

Setiap kali publish berhasil, `ChannelFieldMapping.successRate` diperbarui (Phase 5). Mapping baru bisa ditambah via:
```
POST /api/v1/admin/channel-field-mappings
```

---

### 1.2 Feeding Manual

Kapan developer perlu feed data secara manual:

#### A. First Deploy — Populate Semua Data Sekaligus

Saat pertama deploy dengan RAG aktif, jalankan:

```bash
# Set env var
export OPENAI_API_KEY=sk-...

# Option 1: Restart dengan flag (embed semua data existing)
AI_REINDEX_ON_STARTUP=true  # di environment variables

# Option 2: Panggil admin endpoint setelah startup
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/reindex?sourceType=ALL"
```

**Apa yang terjadi**: `AiEmbeddingInitializer` @Order(200) akan mem-proses semua dokumen yang ada di `channel_jolt_specs`, `channel_field_mappings`, dan `field_semantic_knowledge`, lalu menyimpan vektornya ke `ai_schema_embeddings`.

Output log yang diharapkan:
```
Reindex JOLT_SPEC complete: total=47 indexed=47 skipped=0 failed=0
Reindex FIELD_MAPPING complete: total=312 indexed=312 skipped=0 failed=0
Reindex SEMANTIC_KNOWLEDGE complete: total=89 indexed=89 skipped=0 failed=0
```

#### B. Menambah JOLT Baru Secara Manual (Curated)

Untuk channel yang belum punya JOLT atau membutuhkan JOLT custom:

**Step 1**: Tambah JOLT via Admin UI atau API:
```bash
PUT /api/v1/admin/channel-jolt-specs/{id}
```

**Step 2**: Embedding terjadi otomatis (hook sudah dipasang di controller).

Atau, kalau langsung insert ke MongoDB:
```bash
# Setelah insert manual ke MongoDB, jalankan reindex:
curl -X POST "http://localhost:8888/labamap/api/v1/admin/ai/reindex?sourceType=JOLT_SPEC"
```

#### C. Menambah Field Mapping Knowledge

Tambah field mapping yang sudah diverifikasi:
```bash
POST /api/v1/admin/channel-field-mappings
{
  "channelId": "shopify",
  "sourceField": "product_weight_grams",
  "targetField": "product.variants.*.grams",
  "sourceSemanticType": "WEIGHT",
  "mappingStrategy": "SEMANTIC",
  "confidence": 0.92,
  "successRate": 0.97,
  "usageCount": 150,
  "isActive": true
}
```

Kemudian re-embed:
```bash
curl -X POST ".../admin/ai/reindex?sourceType=FIELD_MAPPING"
```

#### D. Verifikasi RAG Berjalan

Test apakah data sudah ter-embed dengan benar:
```bash
POST /api/v1/admin/ai/search/test
?sourceType=JOLT_SPEC&channelId=shopify

{
  "query": "clothing variants price sku inventory shopify"
}
```

Response yang diharapkan (score > 0.70 = berhasil):
```json
{
  "query": "clothing variants price sku inventory shopify",
  "resultCount": 3,
  "results": [
    {
      "referenceId": "6789abcdef...",
      "channelId": "shopify",
      "categoryId": "clothing",
      "score": 0.89,
      "snippet": "channelId=shopify categoryId=clothing requiredFields=[title, price, sku]..."
    }
  ]
}
```

---

### 1.3 Lifecycle Data di RAG

```
DATA LIFECYCLE:
                                                          
  [Baru] → channel_jolt_specs  →  RagEmbeddingService  →  ai_schema_embeddings
              (saved first)         (embed teks → vektor)    (vector store)
                  ↑                        ↑                      ↓
                  │              trigger (manual/auto)     $vectorSearch saat
           JOLT dihasilkan                                  agent butuh context
           oleh AdaptivePattern                                   
           MatchingCommandImpl                                     
                  │                                               
                  └── jika confidence tinggi → persist → embed → tersedia di RAG
                       untuk publish berikutnya

  [Update] → admin edit JOLT → save → doOnSuccess(embed) → RAG updated otomatis

  [Expire] → AiMaintenanceScheduler (Phase 5) hapus embedding lama (>7 hari stale)
```

### 1.4 Mekanisme Skip Duplikasi (Content Hash)

`RagEmbeddingService` menggunakan **SHA-256** dari teks yang akan di-embed untuk mendeteksi apakah dokumen sudah berubah:

```java
String hash = sha256(text);
if (hash.equals(existing.getContentHash())) {
    return Mono.just(existing); // skip — tidak ada perubahan
}
// else: panggil OpenAI API dan update embedding
```

Artinya: menjalankan `reindex` berkali-kali **tidak akan memanggil OpenAI API** untuk dokumen yang tidak berubah. Hemat biaya.

---

## Bagian 2 — Bagaimana RAG Membantu Menghasilkan JOLT yang Benar

### 2.1 Masalah Tanpa RAG

Sistem heuristic (`FieldMatchingService`) bekerja berdasarkan:
- **String similarity**: `product_name` ↔ `title` (similarity score)
- **Keyword matching**: cari kata kunci semantik yang sama
- **Exact match**: nama field identik

**Kelemahan heuristik**:

| Masalah                | Contoh                       | Hasil Heuristik     | Hasil Seharusnya                        |
|------------------------|------------------------------|---------------------|-----------------------------------------|
| Nama berbeda tapi sama | `weight` → `grams`           | confidence rendah   | Perlu mapping eksplisit                 |
| Nested path kompleks   | `price` → `variants.*.price` | path salah          | `product.variants[*].price` (Shopify)   |
| Channel-specific rule  | `category` di TikTok         | map ke static value | Harus dari live API!                    |
| Array vs single value  | `images`                     | map ke `images`     | `images[*].src` (Shopify structure)     |
| Wrap requirement       | `title`                      | map ke `title`      | Harus `product.title` (Shopify wrapper) |

### 2.2 Bagaimana RAG Membantu: Step by Step

#### Contoh Nyata: Publish produk baju ke Shopify

**Input Master Product:**
```json
{
  "name": "Kemeja Batik Premium",
  "description": "Bahan katun berkualitas...",
  "price": 150000,
  "weight": 250,
  "sku": "KBP-001",
  "mainImage": "https://cdn.../image.jpg",
  "variants": [
    {"color": "Merah", "size": "M", "sku": "KBP-001-M", "stock": 10}
  ]
}
```

**Step 1: Heuristic Matching (existing pipeline)**

```
name         → title         [confidence: 0.85, strategy: SEMANTIC]
description  → body_html     [confidence: 0.78, strategy: KEYWORD]
price        → price         [confidence: 0.91, strategy: EXACT]
weight       → ???           [confidence: 0.45, strategy: SIMILARITY] ← LEMAH
sku          → sku           [confidence: 0.95, strategy: EXACT]
mainImage    → ???           [confidence: 0.30, strategy: SIMILARITY] ← LEMAH
variants.*.color → ???       [confidence: 0.55, strategy: SIMILARITY] ← LEMAH
```

**Step 2: Agent Dipanggil (PatternMatchingAgentService)**

Agent menerima heuristic results di atas, lalu:

**Tool Call #1**: `search_similar_jolt_specs`
```json
{
  "channelId": "shopify",
  "categoryId": "clothing",
  "sourceFieldSample": ["name", "price", "weight", "sku", "variants"]
}
```

RAG menemukan JOLT spec dari publish baju Shopify sebelumnya (similarity score: 0.89):
```
Dokumen ditemukan: channelId=shopify categoryId=clothing
requiredFields=[name, description, price, sku, variants.*.sku, variants.*.price]
confidence=0.93 version=v2.1
mappingCount=12
strategies={EXACT: 5, SEMANTIC: 4, SIMILARITY: 3}
```

Claude melihat: "Shopify sebelumnya berhasil dengan confidence 0.93. Lihat field weight dan image dari spec ini."

**Tool Call #2**: `get_channel_schema` → channelId=shopify
```json
{
  "domainNotes": {
    "rootWrapper": "All fields must be nested under 'product': {product: {...}}",
    "variantPath": "Variants map to 'product.variants[*]' array",
    "imageStructure": "Images map to 'product.images[*].src'"
  }
}
```

Claude melihat: "Semua field harus di bawah 'product.' — ini berarti `title` seharusnya `product.title`!"

> ℹ️ **`get_channel_schema` mengembalikan lebih dari `domainNotes`** (disingkat di contoh Shopify di
> atas). Field deterministik penuh — semuanya diturunkan dari data, jadi berlaku untuk channel/kategori
> baru sekalipun:
> - `apiSchema` — struktur target persis (base + ekstensi per-kategori) = path otoritatif.
> - `postProcessingHandledFields` — target/source yang **diisi post-processing** → agent JANGAN map ke
>   sini. Untuk body **flat** (Shopee/TikTok) ini termasuk target top-level tanpa titik
>   (`logistic_info`, `brand`, `seller_stock`); untuk body wrapper (Shopify) token telanjang `product`
>   tetap dibuang.
> - `categoryAttributes` — atribut riil kategori + **value-names** (dibaca dari
>   `channel_capability_cache`/`GetAttributeTree`). Contoh Shopee/clothing:
>   `[{attribute:"Material", values:["Cotton","Polyester",…]}, {attribute:"Pattern", values:[…]}]`.
>   Agent memetakan **nama value** ke `attribute_list`; `value_id` diisi post-processing
>   (`TRANSLATE_VALUE_IDS`) — agent tidak boleh mengeluarkan `value_id`. Kosong bila kategori belum
>   pernah publish (cache dingin) → fallback ke `attribute_list` generik.
>
> Detail kontrak: `docs/POST-PROCESSING-CONTRACT-DESIGN.md` (Lapis 3) &
> `docs/product/07-publishing-engine/01-guides/09-channel-capability-resolution.md` (§6b).

**Tool Call #3**: `find_field_mappings` → sourceField=weight, channelId=shopify
```json
{
  "mappings": [
    {
      "targetField": "product.variants.*.grams",
      "strategy": "SEMANTIC",
      "confidence": 0.88,
      "successRate": 0.97,   ← 97% sukses di production!
      "usageCount": 234
    }
  ]
}
```

**Tool Call #4**: `find_field_mappings` → sourceField=mainImage, channelId=shopify
```json
{
  "mappings": [
    {
      "targetField": "product.images[0].src",
      "successRate": 0.95,
      "usageCount": 412
    }
  ]
}
```

**Step 3: Agent Output (Final Analysis)**

```json
{
  "fieldAnalysis": [
    {
      "sourceField": "name",
      "proposedTarget": "product.title",
      "confidence": 0.95,
      "status": "CORRECTED",
      "reasoning": "Heuristic mapped to 'title' but Shopify requires 'product.title' wrapper. Channel schema confirms root wrapper.",
      "evidenceFromRag": "Similar JOLT spec (score=0.89) shows product.title as confirmed mapping"
    },
    {
      "sourceField": "description",
      "proposedTarget": "product.body_html",
      "confidence": 0.90,
      "status": "CONFIRMED",
      "reasoning": "Mapping correct. RAG confirms 94% success rate for description→body_html"
    },
    {
      "sourceField": "weight",
      "proposedTarget": "product.variants.*.grams",
      "confidence": 0.88,
      "status": "CORRECTED",
      "reasoning": "Heuristic failed (conf 0.45). Historical mapping shows weight→grams with 97% success rate",
      "evidenceFromRag": "234 successful publishes with successRate=0.97"
    },
    {
      "sourceField": "mainImage",
      "proposedTarget": "product.images[0].src",
      "confidence": 0.91,
      "status": "CORRECTED",
      "reasoning": "Shopify image structure requires array format with .src field",
      "evidenceFromRag": "412 successful publishes with successRate=0.95"
    },
    {
      "sourceField": "variants.*.color",
      "proposedTarget": "product.variants.*.option1",
      "confidence": 0.82,
      "status": "CORRECTED",
      "reasoning": "Shopify uses option1/option2/option3 for variant dimensions, not named attributes"
    }
  ],
  "warningsForDeveloper": [
    "product.variants[*].inventory_quantity must be set per location — single value will be assigned to all locations"
  ],
  "overallConfidence": 0.91
}
```

**Step 4: Hasil Akhir — JOLT yang Dihasilkan**

Dengan enriched field mappings, `JoltSpecGeneratorService.generateAdvancedJoltSpec()` menghasilkan:

**Tanpa RAG (heuristik saja)**:
```json
[{
  "operation": "shift",
  "spec": {
    "name": "title",
    "description": "body_html",
    "price": "price",
    "sku": "sku",
    "variants": {
      "*": {
        "color": "variants[&1].option1"
      }
    }
  }
}]
```
❌ **Masalah**: Tidak ada `product.*` wrapper, `weight` tidak ter-map, `mainImage` hilang.

**Dengan RAG (AI-enriched)**:
```json
[{
  "operation": "shift",
  "spec": {
    "name": "product.title",
    "description": "product.body_html",
    "price": "product.variants[0].price",
    "sku": "product.variants[0].sku",
    "weight": "product.variants[0].grams",
    "mainImage": "product.images[0].src",
    "variants": {
      "*": {
        "color": "product.variants[&1].option1",
        "size": "product.variants[&1].option2",
        "sku": "product.variants[&1].sku",
        "stock": "product.variants[&1].inventory_quantity"
      }
    }
  }
}]
```
✅ **Benar**: Shopify wrapper ada, semua field ter-map dengan path yang tepat.

---

### 2.3 Skenario-Skenario di Mana RAG Paling Berdampak

#### Skenario 1: JOLT Baru untuk Channel yang Sudah Punya History

RAG menemukan pattern yang terbukti berhasil. Confidence langsung tinggi dari awal.

```
Tanpa RAG: confidence 0.61 → butuh review manual
Dengan RAG: confidence 0.89 → auto-apply
```

#### Skenario 2: Field Nama Berbeda Antar Channel

```
Master product:  "weight_grams"
Amazon:          "item_weight.value" + "item_weight.unit"  ← complex split
TikTok:          "weight" (sebagai STRING)                 ← type berbeda
Shopify:         "variants.*.grams"                        ← nested + numeric

Tanpa RAG: heuristik gagal untuk TikTok dan Amazon
Dengan RAG: agent melihat historical mappings per channel → map dengan benar
```

#### Skenario 3: Channel API Berubah (Breaking Change)

Misalnya Shopify mengubah `images[*].attachment` → `images[*].src` di versi baru:
- JOLT lama yang pakai `attachment` mulai gagal
- RAG masih berisi JOLT lama (dengan `attachment`)
- **Tanpa API Contract Oracle**: RAG akan merekomendasikan pattern yang salah!

Ini sebabnya **Sistem 2 (API Contract Oracle)** diperlukan untuk invalidate embedding lama saat ada breaking change.

#### Skenario 4: Produk di Kategori Baru (Belum Ada History)

Misal: pertama kali publish produk kategori "Automotive" ke Amazon.

- RAG: tidak menemukan JOLT serupa (similarity score < 0.50)
- Agent: `search_similar_jolt_specs` returns empty
- Agent: fallback ke `get_channel_schema` untuk Amazon
- Agent: mencari `find_field_mappings` untuk field-field individual
- Hasil: confidence lebih rendah (~0.70), rekomendasi dikirim ke developer untuk review
- Setelah developer approve: JOLT baru tersimpan → langsung menjadi data training untuk publish berikutnya di kategori yang sama

---

### 2.4 Formula: RAG Score → JOLT Confidence

```
Confidence Akhir JOLT ditentukan oleh:

Base Score = rata-rata confidence semua field mapping (dari heuristic)

AI Bonus:
  + per field yang RAG confirm (successRate > 0.9): +0.05
  + per field yang AI koreksi berdasarkan RAG (evidence dari >50 publish): +0.03
  - per field UNCERTAIN: -0.10
  - per field yang masih unmapped: -0.05 × jumlah field

Contoh perhitungan (kasus baju Shopify):
  Base: (0.85 + 0.78 + 0.91 + 0.45 + 0.95 + 0.30 + 0.55) / 7 = 0.68

  AI corrections:
    name corrected (ev: 0.89 RAG score): +0.05
    weight corrected (ev: 97% successRate): +0.03
    mainImage corrected (ev: 95% successRate): +0.03
    description confirmed: +0.05
    
  Final: 0.68 + 0.05 + 0.03 + 0.03 + 0.05 = 0.84 → RECOMMEND (> 0.70)
  
  Jika confidence ≥ 0.92 → AUTO_APPLY (tanpa approval)
  Jika confidence 0.70–0.91 → RECOMMENDATION (butuh approval developer)
  Jika confidence < 0.70 → MANUAL_REVIEW
```

---

### 2.5 Mengapa RAG Lebih Baik dari Fine-tuning?

| Aspek                     | RAG                                     | Fine-tuning LLM                 |
|---------------------------|-----------------------------------------|---------------------------------|
| **Update data**           | Real-time (tambah embedding baru)       | Harus retrain model (jam/hari)  |
| **Data baru channel**     | Langsung tersedia setelah embed         | Tidak tercover sampai retrain   |
| **Biaya**                 | Hanya biaya embedding (~$0.02/1M token) | Biaya training GPU sangat mahal |
| **Kontrol**               | Bisa inspect data apa yang digunakan    | Black box                       |
| **Audit trail**           | `ai_agent_sessions` + `embeddedText`    | Tidak ada                       |
| **Hallucination risk**    | Rendah (grounded pada data nyata)       | Tetap ada                       |
| **Adaptasi channel baru** | Tambah field mappings → embed           | Harus collect data + retrain    |

Kesimpulan: untuk use case ini (data mapping yang sering berubah, multi-channel, butuh audit), **RAG jauh lebih tepat** dari fine-tuning.

---

## Bagian 3 — Ringkasan Operasional

### Kapan Harus Jalankan Reindex Manual?

| Situasi                       | Perintah                                | Waktu                                   |
|-------------------------------|-----------------------------------------|-----------------------------------------|
| First deploy                  | `reindex?sourceType=ALL`                | 1x saat awal                            |
| Channel baru ditambah         | `reindex?sourceType=JOLT_SPEC`          | Setiap ada JOLT baru                    |
| Tambah field mapping bulk     | `reindex?sourceType=FIELD_MAPPING`      | Setelah import data                     |
| Semantic knowledge diperbarui | `reindex?sourceType=SEMANTIC_KNOWLEDGE` | Setelah DataInitializationService rerun |
| JOLT di-edit via admin UI     | **Otomatis** (hook sudah dipasang)      | —                                       |

### Yang Belum Otomatis (Perlu Ditambah di Phase 5)

- [ ] Setelah `ChannelFieldMappingAdminController` create/update → auto embed
- [ ] Setelah `FieldSemanticKnowledgeAdminController` create/update → auto embed  
- [ ] Setelah `AdaptivePatternMatchingCommandImpl` persist JOLT baru → auto embed
- [ ] Setelah Phase 5 approval → auto embed JOLT yang baru di-apply

Semua ini dapat ditambah dengan pola `doOnSuccess(saved -> embeddingService.embed...subscribe())` yang sama seperti di `ChannelJoltSpecAdminController`.
