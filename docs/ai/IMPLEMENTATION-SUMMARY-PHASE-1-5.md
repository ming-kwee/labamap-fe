# AI Intelligence System — Ringkasan Implementasi Phase 1–5

**Tanggal**: 2026-06-29
**Status**: ✅ Terimplementasi penuh, compile bersih, nol regresi
**Module**: `adaptivepattern` (augmentasi sistem JOLT pattern matching yang sudah ada)

> Dokumen ini merangkum **semua perubahan kode aktual** dari Phase 1 sampai Phase 5.
> Untuk desain detail per phase, lihat `PHASE-1` s/d `PHASE-5-*.md`.
> Untuk analisis statistik confidence, lihat `SCORE-ACCURACY-DEEP-ANALYSIS.md`.

---

## 1. Gambaran Besar

Sistem ini menambahkan **lapisan kecerdasan AI** di atas pipeline JOLT pattern matching yang sudah ada, tanpa mengubah perilaku lama. Tujuannya: menghasilkan JOLT yang benar secara otomatis, dengan developer review minimal.

```
Master Product Schema
        │
        ▼
[Phase 1] RAG Retrieval ──── MongoDB Atlas Vector Search (ai_schema_embeddings)
        │                     embedding via OpenAI text-embedding-3-small (1536-dim)
        ▼
[Phase 2] Pattern Matching Agent ──── Claude enrichment + RAG context
        │                              fallback ke heuristik jika AI mati/timeout
        ▼
[Phase 3] JOLT Generation Agent ──── generate/improve JOLT + validation loop (max 3x)
        │
    confidence?
        ├── ≥ 0.92 → AUTO_APPLY ke channel_jolt_specs
        ├── 0.70–0.91 → [Phase 4] RECOMMENDATION (antrian approval developer)
        └── < 0.70 → MANUAL_REVIEW_REQUIRED
        │
        ▼
[Phase 5] Learning Loop ──── update successCount/failureCount (Beta distribution)
                              schema drift detection, threshold calibration
```

**Prinsip kunci**: Jika `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` kosong → semua AI mati bersih, pipeline lama jalan tanpa perubahan (zero impact).

---

## 2. Inventaris File

### Phase 1 — RAG Foundation (7 file baru + 2 modifikasi)
| File                                          | Tipe    | Fungsi                                                        |
|-----------------------------------------------|---------|---------------------------------------------------------------|
| `model/entity/AiSchemaEmbedding.java`         | baru    | Entity `ai_schema_embeddings` — vektor 1536-dim + contentHash |
| `repository/AiSchemaEmbeddingRepository.java` | baru    | Repo embedding                                                |
| `config/AiRagProperties.java`                 | baru    | `@ConfigurationProperties("app.ai")`                          |
| `service/RagEmbeddingService.java`            | baru    | Embed JOLT/mapping/semantic + reindex; SHA-256 dedup          |
| `service/RagSearchService.java`               | baru    | MongoDB Atlas `$vectorSearch` aggregation                     |
| `config/AiEmbeddingInitializer.java`          | baru    | `CommandLineRunner @Order(200)` startup reindex               |
| `controller/AiAdminController.java`           | baru    | `POST /reindex`, `GET /embeddings/stats`, `POST /search/test` |
| `configuration/WebClientConfig.java`          | mod     | `embeddingWebClient` bean                                     |
| `configuration/MongoConfig.java`              | (sudah) | Package `adaptivepattern.repository` sudah teregistrasi       |

### Phase 2 — Pattern Matching Agent (4 file baru + 3 modifikasi)
| File                                                   | Tipe   | Fungsi                                                    |
|--------------------------------------------------------|--------|-----------------------------------------------------------|
| `model/entity/AiAgentSession.java`                     | baru   | Observability `ai_agent_sessions` — steps, tokens, timing |
| `repository/AiAgentSessionRepository.java`             | baru   | Repo session                                              |
| `model/dto/EnrichedMatchResult.java`                   | baru   | MatchResult + AI status/reasoning/RAG evidence            |
| `service/AgentToolHandlerService.java`                 | baru*  | Dispatch 6 tools Claude (4 Phase 2 + 2 Phase 3)           |
| `service/PatternMatchingAgentService.java`             | baru   | Claude tool-use loop, enrich heuristic matches            |
| `command/impl/AdaptivePatternMatchingCommandImpl.java` | mod    | Inject AI enrichment + 5s timeout + fallback              |
| `model/response/AdaptivePatternMatchingResponse.java`  | mod    | 7 field AI baru                                           |
| `configuration/WebClientConfig.java`                   | mod    | `anthropicWebClient` bean                                 |

### Phase 3 — JOLT Generation Agent (2 file baru + 3 modifikasi)
| File                                            | Tipe  | Fungsi                                                |
|-------------------------------------------------|-------|-------------------------------------------------------|
| `model/dto/JoltGenerationResult.java`           | baru  | Output: AUTO_APPLIED/RECOMMENDATION/MANUAL/FAILED     |
| `service/JoltGenerationAgentService.java`       | baru  | Generate/improve JOLT + validation loop               |
| `service/AgentToolHandlerService.java`          | mod*  | Tools `validate_jolt_spec` + `get_existing_jolt_spec` |
| `controller/AiAdminController.java`             | mod   | `POST /generate-jolt`, `GET /sessions/{id}`           |
| `publishing/service/ChannelPublishService.java` | mod   | Trigger agent saat publish FAILED (async)             |

### Phase 4 — Recommendation & Approval (4 file baru + 3 modifikasi)
| File                                         | Tipe     | Fungsi                                         |
|----------------------------------------------|----------|------------------------------------------------|
| `model/entity/AiRecommendation.java`         | baru     | Antrian `ai_recommendations` + diff + analysis |
| `repository/AiRecommendationRepository.java` | baru     | Repo + aggregation avg confidence              |
| `service/AiRecommendationService.java`       | baru     | create/approve/reject + event publish          |
| `controller/AiRecommendationController.java` | baru     | 6 endpoint approval workflow                   |
| `service/JoltGenerationAgentService.java`    | mod      | Wire `createFromJoltGeneration()`              |
| `service/AiMaintenanceScheduler.java`        | baru→Ph5 | Expire PENDING + refresh/clean embedding       |
| `application.yml`                            | mod      | `app.ai.recommendation.*`                      |

### Phase 5 — Auto-Correction & Learning (5 file baru + 3 modifikasi)
| File                                            | Tipe  | Fungsi                                                      |
|-------------------------------------------------|-------|-------------------------------------------------------------|
| `model/entity/AiCalibrationConfig.java`         | baru  | `ai_calibration_config` per-channel threshold               |
| `repository/AiCalibrationConfigRepository.java` | baru  | Repo calibration                                            |
| `service/LearningFeedbackService.java`          | baru  | EMA + Beta counter update; rejection downgrade              |
| `service/SchemaDriftDetectorService.java`       | baru  | Daily 02:00 — drift detection + regenerate                  |
| `service/ConfidenceCalibrationService.java`     | baru  | Weekly Sun 03:00 — threshold calibration                    |
| `service/AiMaintenanceScheduler.java`           | baru  | Daily 01:00/04:00 + Sun 05:00 maintenance                   |
| `publishing/service/ChannelPublishService.java` | mod   | `recordPublishOutcome()` setelah COMPLETED/FAILED           |
| `service/AiRecommendationService.java`          | mod   | approve→`recordApprovalFeedback`, reject→`processRejection` |
| `controller/AiAdminController.java`             | mod   | `GET /learning/stats` dashboard                             |

> *`AgentToolHandlerService` dibuat di Phase 2, diperluas di Phase 3.

---

## 3. Collection MongoDB Baru

| Collection              | Phase   | Isi                                                                     |
|-------------------------|---------|-------------------------------------------------------------------------|
| `ai_schema_embeddings`  | 1       | Vektor 1536-dim + metadata (JOLT_SPEC/FIELD_MAPPING/SEMANTIC_KNOWLEDGE) |
| `ai_agent_sessions`     | 2       | Audit trail setiap run agent: steps, tools, tokens, timing              |
| `ai_recommendations`    | 4       | Antrian approval: status, priority, diff, analysis, lifecycle           |
| `ai_calibration_config` | 5       | Threshold terkalibrasi per channel                                      |

Modifikasi collection existing:
- `channel_field_mappings` — tambah `successCount`, `failureCount`, `verificationTier` (untuk Beta distribution confidence)

---

## 4. REST API Baru

### Admin RAG/Embedding (Phase 1)
```
POST /labamap/api/v1/admin/ai/reindex?sourceType=ALL|JOLT_SPEC|FIELD_MAPPING|SEMANTIC_KNOWLEDGE
GET  /labamap/api/v1/admin/ai/embeddings/stats
POST /labamap/api/v1/admin/ai/search/test                  Body: {"query":"..."}
```

### JOLT Generation (Phase 3)
```
POST /labamap/api/v1/admin/ai/generate-jolt?channelId=&categoryId=&organizationId=   Body: sample product
GET  /labamap/api/v1/admin/ai/sessions/{sessionId}
GET  /labamap/api/v1/admin/ai/sessions?channelId=&triggerType=JOLT_GENERATION
```

### Recommendation Approval (Phase 4)
```
GET  /labamap/api/v1/admin/ai/recommendations?status=PENDING&channelId=&limit=20
GET  /labamap/api/v1/admin/ai/recommendations/{id}
POST /labamap/api/v1/admin/ai/recommendations/{id}/approve?reviewedBy=&note=
POST /labamap/api/v1/admin/ai/recommendations/{id}/reject?reviewedBy=   Body: {"reason":"..."}
POST /labamap/api/v1/admin/ai/recommendations/trigger-analysis?channelId=&categoryId=   Body: sample
GET  /labamap/api/v1/admin/ai/recommendations/stats
```

### Learning Dashboard (Phase 5)
```
GET  /labamap/api/v1/admin/ai/learning/stats?days=30
```

---

## 5. Konfigurasi (`application.yml`)

```yaml
app:
  ai:
    enabled: ${AI_ENABLED:true}
    embedding:
      provider: openai                 # openai | disabled
      model: text-embedding-3-small
      dimensions: 1536
      api-key: ${OPENAI_API_KEY:}      # kosong = embedding mati
      base-url: https://api.openai.com
    rag:
      search-limit: 5
      min-similarity-score: 0.70
      index-name: ai_schema_embeddings_vector_idx
      num-candidates: 100
    reindex:
      on-startup: ${AI_REINDEX_ON_STARTUP:false}
    recommendation:
      auto-apply-threshold: ${AI_AUTO_APPLY_THRESHOLD:0.92}
      recommend-threshold: ${AI_RECOMMEND_THRESHOLD:0.70}
      expiry-days: 30
    anthropic:
      api-key: ${ANTHROPIC_API_KEY:}   # kosong = agent mati
      base-url: https://api.anthropic.com
      model: claude-sonnet-4-6
      max-tokens: 8192
      timeout-seconds: 30
      max-tool-rounds: 5
      agent-timeout-seconds: 5
```

---

## 6. Scheduled Jobs (Phase 5)

| Cron                        | Service                      | Tugas                                   |
|-----------------------------|------------------------------|-----------------------------------------|
| `0 0 1 * * ?` (01:00)       | AiMaintenanceScheduler       | Expire PENDING recommendation > 30 hari |
| `0 0 2 * * ?` (02:00)       | SchemaDriftDetectorService   | Deteksi drift → regenerate JOLT         |
| `0 0 3 ? * SUN` (Min 03:00) | ConfidenceCalibrationService | Kalibrasi threshold per channel         |
| `0 0 4 * * ?` (04:00)       | AiMaintenanceScheduler       | Refresh embedding stale > 7 hari        |
| `0 0 5 ? * SUN` (Min 05:00) | AiMaintenanceScheduler       | Hapus orphan embedding                  |

---

## 7. Feedback Loop (Phase 5)

```
Publish COMPLETED/FAILED
  → extractMappingIds() dari request.fieldMappings.additionalContext (hanya CHANNEL_SPECIFIC punya ID)
  → LearningFeedbackService.recordPublishOutcome()
      → successCount++ / failureCount++ (Beta)
      → EMA update successRate (legacy)
      → effectiveConfidence naik/turun OTOMATIS via ChannelFieldMapping.getEffectiveConfidence()

Recommendation APPROVED → recordApprovalFeedback() + re-embed JOLT
Recommendation REJECTED → processRejection() (failureCount++ & confidence -5)
```

**Confidence model (dari SCORE-ACCURACY-DEEP-ANALYSIS):**
- Beta(successCount+1, failureCount+1).mean — mapping baru = 50% (jujur "belum tahu")
- Time decay half-life 180 hari
- Tier ceiling: UNVERIFIED 60% / MANUALLY_TESTED 75% / VERIFIED_PRODUCTION 90% / CERTIFIED 99%
- Hard constraint: required field lemah (IDENTIFIER/NAME/PRICE/SKU < 70%) membottleneck seluruh score

---

## 8. Verifikasi & Status Test

| Item                                     | Status                                                        |
|------------------------------------------|---------------------------------------------------------------|
| `mvn clean compile`                      | ✅ BUILD SUCCESS                                               |
| Circular dependency                      | ✅ Tidak ada (DAG)                                             |
| Bean wiring (4 WebClient)                | ✅ By-name resolution (MethodParameters di bytecode)           |
| `AdaptivePatternMatchingCommandImplTest` | ✅ 8/8 PASS                                                    |
| `ChannelCategoryApiConfigTest`           | ✅ 68/68 PASS                                                  |
| Graceful degradation (key kosong)        | ✅ Semua entry point ter-guard                                 |
| Regresi dari AI work                     | ✅ Nol (kegagalan lain pre-existing: Mockito strict + MongoDB) |

---

## 9. Prasyarat Runtime (SEBELUM Produksi)

1. **Set environment variables:**
   ```bash
   export OPENAI_API_KEY=sk-...
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **Buat MongoDB Atlas Vector Search index** (`$vectorSearch` tidak jalan tanpa ini):
   ```json
   {
     "name": "ai_schema_embeddings_vector_idx",
     "type": "vectorSearch",
     "fields": [
       { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
       { "type": "filter", "path": "sourceType" },
       { "type": "filter", "path": "channelId" },
       { "type": "filter", "path": "categoryId" }
     ]
   }
   ```
   > Catatan: Atlas Vector Search butuh tier M10+ (Free tier tidak support).

3. **Populate index pertama kali:**
   ```bash
   # Set AI_REINDEX_ON_STARTUP=true sekali, ATAU panggil:
   curl -X POST ".../labamap/api/v1/admin/ai/reindex?sourceType=ALL"
   ```

4. **Verifikasi:**
   ```bash
   curl -X POST ".../labamap/api/v1/admin/ai/search/test?sourceType=JOLT_SPEC" \
        -d '{"query":"shopify clothing variants price sku"}'
   # Expect: resultCount > 0, score > 0.70
   ```

---

## 10. Yang Belum Dikerjakan (Keterbatasan Jujur)

- **Tidak ada unit test khusus** untuk service AI baru (butuh API key live + Atlas Vector Search untuk uji bermakna). Yang terverifikasi: compile & wiring bersih. Yang **belum**: output AI benar terhadap API sungguhan.
- **Belum tes runtime end-to-end** dengan API key + Atlas index aktif.
- **Per-channel auto-apply threshold** dari `ai_calibration_config` saat ini bersifat informational (di-log); `JoltGenerationAgentService` masih pakai konstanta statis 0.92. Membaca threshold per-channel dari DB adalah ekstensi Phase 5+.
- **Field-level error attribution** (parse error response channel untuk tahu field mana penyebab gagal) belum diimplementasi — `recordPublishOutcome` saat ini menghukum semua mapping yang dipakai secara merata.

---

## 11. Dokumen Terkait

| Dokumen                                | Isi                                               |
|----------------------------------------|---------------------------------------------------|
| `PROPOSED-SYSTEM.md`                   | Arsitektur awal & overview                        |
| `PHASE-1-RAG-FOUNDATION.md`            | Detail RAG + Atlas index                          |
| `PHASE-2-PATTERN-MATCHING-AGENT.md`    | Detail tool-use agent                             |
| `PHASE-3-JOLT-GENERATION-AGENT.md`     | Detail JOLT generation                            |
| `PHASE-4-RECOMMENDATION-APPROVAL.md`   | Detail approval workflow                          |
| `PHASE-5-AUTO-CORRECTION-LEARNING.md`  | Detail learning loop                              |
| `RAG-DATA-FEEDING-AND-JOLT-GUIDE.md`   | Cara feeding data + biaya embedding               |
| `SCORE-ACCURACY-DEEP-ANALYSIS.md`      | Analisis statistik confidence + Beta distribution |
| `AI-INTELLIGENCE-EXTENDED-ANALYSIS.md` | 10 sistem AI lanjutan (di luar Phase 1-5)         |
