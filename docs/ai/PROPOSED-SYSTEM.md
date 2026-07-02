# Agentic AI System — JOLT Pattern Intelligence

**Tanggal**: 2026-06-26  
**Status**: Proposed  
**Scope**: Augmentasi `adaptivepattern` module dengan LLM + RAG untuk menghasilkan JOLT yang benar secara otomatis, meminimalkan intervensi developer.

---

## 1. Konteks & Motivasi

### Kondisi Saat Ini

Sistem `adaptivepattern` sudah memiliki fondasi:

| Komponen | File | Fungsi |
|---|---|---|
| `SchemaFlattenerService` | adaptivepattern/service/ | Meratakan JSON schema → daftar `FieldInfo` |
| `FieldMatchingService` | adaptivepattern/service/ | Pencocokan field source→target (exact, similarity, semantic) |
| `KnowledgeBasedFieldMatchingService` | adaptivepattern/service/ | Lookup dari `field_semantic_knowledge` collection |
| `JoltSpecGeneratorService` | adaptivepattern/service/ | Menghasilkan JOLT spec dari daftar `MatchResult` |
| `AdaptivePatternMatchingCommandImpl` | adaptivepattern/command/ | Orkestrasi seluruh pipeline |
| `ChannelJoltSpec` | adaptivepattern/model/entity/ | Dokumen JOLT per (channelId, categoryId, orgId) |
| `ChannelFieldMapping` | adaptivepattern/model/entity/ | Knowledge base mapping field dengan confidence & successRate |
| `FieldSemanticKnowledge` | adaptivepattern/model/entity/ | Ontologi semantik field (aliases, patterns, keywords) |

### Masalah yang Tersisa

1. **Heuristik terbatas** — Matching hanya berdasarkan string similarity + keyword lookup. Field seperti `product_weight` → `item.package_weight` gagal karena path berbeda.
2. **Konteks channel hilang** — Tidak ada pemahaman tentang aturan spesifik channel (Amazon mensyaratkan `brand`, Shopify membutuhkan `handle` unik, TikTok Shop butuh `category_id` dari live API).
3. **Tidak ada self-correction** — Jika JOLT salah dan publish gagal, tidak ada mekanisme analisis & perbaikan otomatis.
4. **Developer bottleneck** — Setiap JOLT baru atau perbaikan membutuhkan intervensi manual developer.

### Tujuan Sistem Baru

```
Master Product Schema
        │
        ▼
┌───────────────────┐
│  RAG Retrieval    │  ← Vector search: JOLT serupa, field mapping historis
│  (MongoDB Atlas)  │
└────────┬──────────┘
         │ konteks relevan
         ▼
┌───────────────────┐
│  LLM Agent        │  ← Claude Sonnet 4.6: reasoning, analisis, generate
│  (Claude API)     │
└────────┬──────────┘
         │
    ┌────┴──────────────────┐
    │                       │
    ▼                       ▼
JOLT Generated          Recommendation
    │                   (jika ada masalah)
    ▼                       │
Validation              Developer UI
    │                   approve/reject
    ▼                       │
Auto-apply              ◄───┘
```

---

## 2. Arsitektur Sistem

### 2.1 Komponen Utama

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENTIC AI SYSTEM                            │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │ RAG Engine   │   │ LLM Agent    │   │ Approval Engine  │   │
│  │              │   │              │   │                  │   │
│  │ • Embed      │   │ • Analyze    │   │ • Queue mgmt     │   │
│  │ • Index      │◄──│ • Reason     │──►│ • Dev notify     │   │
│  │ • Retrieve   │   │ • Generate   │   │ • Auto-apply     │   │
│  └──────────────┘   └──────────────┘   └──────────────────┘   │
│          │                  │                    │              │
│          └──────────────────┴────────────────────┘              │
│                          │                                       │
│                   ┌──────▼──────┐                               │
│                   │ Tool Layer  │  (Spring Boot)                 │
│                   │             │                               │
│                   │ search_jolt │                               │
│                   │ validate    │                               │
│                   │ get_schema  │                               │
│                   │ apply_fix   │                               │
│                   └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   MongoDB Atlas        channel_jolt_specs    ai_recommendations
   Vector Search        channel_field_        (new collection)
   (channel_schemas_    mappings
    embeddings, etc.)   field_semantic_
                        knowledge
```

### 2.2 Data Flow Utama

```
Trigger: publish request baru / JOLT validation gagal
    │
    ▼
[Phase 1] RAG Retrieval
    - Embed source schema fields
    - Search: JOLT serupa (channel, category)
    - Search: field mappings historis
    - Fetch: channel requirements (required/optional fields)
    │
    ▼
[Phase 2] LLM Analysis
    - Agent menerima konteks dari RAG
    - Analisis gap: field apa yang tidak ter-map?
    - Analisis error: JOLT sebelumnya gagal kenapa?
    │
    ▼
[Phase 3] JOLT Generation / Correction
    - LLM generate JOLT spec baru atau patch existing
    - Validate JOLT dengan sample data
    - Hitung confidence score
    │
    ▼
[Phase 4] Recommendation & Approval
    - confidence >= 0.9: auto-apply (Phase 5 opt-in)
    - confidence 0.7–0.9: create recommendation, notify dev
    - confidence < 0.7: flag untuk manual review
    │
    ▼
[Phase 5] Auto-correction & Learning
    - Approved recommendation → auto-apply ke channel_jolt_specs
    - Feedback loop: update ChannelFieldMapping.successRate
    - Re-embed updated JOLT ke vector store
```

---

## 3. Stack Teknologi

| Layer           | Technology                                                              | Alasan                                                           |
|-----------------|-------------------------------------------------------------------------|------------------------------------------------------------------|
| LLM             | Claude Sonnet 4.6 (`claude-sonnet-4-6`)                                 | Sudah dipakai di project, reasoning kuat untuk structured output |
| Embeddings      | Claude (`text-embedding-3` via Anthropic) atau `voyage-3` via Voyage AI | Semantic similarity untuk RAG                                    |
| Vector Store    | **MongoDB Atlas Vector Search**                                         | Tetap dalam ekosistem MongoDB yang sudah ada                     |
| Agent Framework | Custom Spring Boot + Anthropic SDK (Java)                               | Konsisten dengan tech stack                                      |
| Approval UI     | REST API + existing frontend                                            | Memanfaatkan admin panel yang sudah ada                          |
| Cache           | Spring Cache + MongoDB                                                  | Sudah ada `CacheConfig`                                          |

### Mengapa MongoDB Atlas Vector Search?

- **Zero infrastructure baru** — project sudah pakai MongoDB Atlas
- **Unified data layer** — JOLT specs, embeddings, dan metadata dalam satu DB
- **$vectorSearch aggregation** — native Spring Data MongoDB support
- Tidak perlu Pinecone/Qdrant terpisah

---

## 4. New Collections (MongoDB)

### 4.1 `ai_schema_embeddings`
Menyimpan embedding dari channel schemas, JOLT specs, dan field mappings.

```json
{
  "_id": "emb-001",
  "sourceType": "JOLT_SPEC | CHANNEL_SCHEMA | FIELD_MAPPING",
  "referenceId": "channel_jolt_specs._id",
  "channelId": "shopify",
  "categoryId": "clothing",
  "contentHash": "sha256...",
  "embedding": [0.123, -0.456, ...],  // 1536-dim vector
  "metadata": {
    "sourceFields": ["name", "price", "variants"],
    "targetFields": ["product.title", "product.variants[].price"],
    "confidence": 0.92
  },
  "createdAt": "2026-06-26T00:00:00",
  "updatedAt": "2026-06-26T00:00:00"
}
```

### 4.2 `ai_recommendations`
Antrian rekomendasi yang menunggu approval developer.

```json
{
  "_id": "rec-001",
  "status": "PENDING | APPROVED | REJECTED | AUTO_APPLIED",
  "priority": "HIGH | MEDIUM | LOW",
  "channelId": "shopify",
  "categoryId": "clothing",
  "triggerType": "PUBLISH_FAILED | VALIDATION_WARNING | SCHEMA_DRIFT | MANUAL_TRIGGER",
  "triggerContext": {
    "masterProductId": "...",
    "errorMessage": "Field 'brand' required but missing",
    "publishAttemptId": "..."
  },
  "analysis": {
    "rootCause": "...",
    "affectedFields": ["brand"],
    "confidenceScore": 0.85
  },
  "proposedFix": {
    "type": "JOLT_PATCH | FIELD_MAPPING | NEW_JOLT",
    "currentJoltSpecId": "...",
    "proposedJoltSpec": [...],
    "diff": {...},
    "explanation": "..."
  },
  "developerNote": "...",
  "approvedBy": null,
  "approvedAt": null,
  "appliedAt": null,
  "createdAt": "2026-06-26T00:00:00"
}
```

### 4.3 `ai_agent_sessions`
Menyimpan history reasoning agent untuk observability & debugging.

```json
{
  "_id": "sess-001",
  "triggerType": "PUBLISH_FAILED",
  "channelId": "shopify",
  "status": "COMPLETED | FAILED | IN_PROGRESS",
  "ragContext": {
    "retrievedDocs": 5,
    "topSimilarityScore": 0.94
  },
  "agentSteps": [
    {
      "step": 1,
      "action": "search_similar_jolt",
      "input": {...},
      "output": {...},
      "durationMs": 234
    }
  ],
  "finalOutput": {
    "recommendationId": "rec-001",
    "confidenceScore": 0.85
  },
  "totalTokensUsed": 4521,
  "durationMs": 1823,
  "createdAt": "2026-06-26T00:00:00"
}
```

---

## 5. Agent Tools (Spring Boot)

Agent Claude akan diperlengkapi 7 tools:

| Tool | Fungsi | Dipanggil kapan |
|---|---|---|
| `search_similar_jolt_specs` | Vector search JOLT serupa | Saat generate JOLT baru |
| `get_channel_schema` | Ambil required/optional fields channel | Sebelum analisis gap |
| `find_field_mappings` | Cari mapping historis yang berhasil | Saat mapping field spesifik |
| `validate_jolt_spec` | Jalankan JOLT dengan sample data | Setelah generate JOLT |
| `get_publish_error_history` | Ambil error publish terkini untuk channel/category | Analisis root cause |
| `create_recommendation` | Simpan rekomendasi ke `ai_recommendations` | Setelah generate fix |
| `apply_approved_fix` | Auto-apply JOLT yang sudah di-approve | Phase 5 |

---

## 6. Fase Implementasi

| Phase | Nama | Deliverable | Estimasi |
|---|---|---|---|
| **1** | RAG Foundation | Vector index, embedding pipeline, schema ingestion | 1 minggu |
| **2** | Pattern Matching Agent | LLM-powered field analysis, gap detection | 1 minggu |
| **3** | JOLT Generation Agent | AI-generate JOLT + validation loop | 1 minggu |
| **4** | Recommendation & Approval | Antrian rekomendasi + developer API + notifikasi | 1 minggu |
| **5** | Auto-correction & Learning | Auto-apply + feedback loop + embedding update | 1 minggu |

**Total: ~5 minggu** untuk sistem lengkap end-to-end.

---

## 7. Integration Points dengan Kode Existing

```
AdaptivePatternMatchingCommandImpl  ←── AUGMENTED (Phase 2)
  │ panggil existing services + LLM agent untuk enrichment
  │
JoltSpecGeneratorService            ←── AUGMENTED (Phase 3)
  │ LLM bisa override/patch hasil generator
  │
ChannelPublishService               ←── TRIGGER POINT (Phase 4)
  │ publish failure → trigger AI agent session
  │
ChannelJoltSpecAdminController      ←── OUTPUT (Phase 4, 5)
  │ recommendation approval endpoint
  │
channel_field_mappings              ←── FEEDBACK LOOP (Phase 5)
  │ successRate diupdate setelah publish berhasil/gagal
  │
channel_jolt_specs                  ←── AUTO-APPLY TARGET (Phase 5)
    auto-patched ketika rekomendasi di-approve
```

---

## 8. Prinsip Desain

1. **Backward-compatible** — Semua phase bersifat additive; existing flow tetap berjalan tanpa AI jika Claude API down (`fallbackToHeuristic=true`).
2. **Developer tetap in-control** — Tidak ada yang di-apply ke production tanpa approval, kecuali confidence ≥ threshold yang diset developer.
3. **Observability first** — Setiap keputusan AI tersimpan di `ai_agent_sessions` dengan full reasoning chain.
4. **Incremental learning** — Setiap approval/rejection menjadi training signal untuk meningkatkan akurasi.
5. **Channel-aware** — Agent memahami perbedaan constraints antar channel (Shopify vs Amazon vs TikTok).

---

## 9. File Documentation Index

| File | Konten |
|---|---|
| `PHASE-1-RAG-FOUNDATION.md` | Vector store setup, embedding pipeline, schema ingestion |
| `PHASE-2-PATTERN-MATCHING-AGENT.md` | LLM agent, tool definitions, gap analysis |
| `PHASE-3-JOLT-GENERATION-AGENT.md` | JOLT generation, validation loop, confidence scoring |
| `PHASE-4-RECOMMENDATION-APPROVAL.md` | Recommendation queue, developer API, notification |
| `PHASE-5-AUTO-CORRECTION-LEARNING.md` | Auto-apply, feedback loop, continuous embedding update |
