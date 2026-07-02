# Extended AI Intelligence Analysis — Omnichannel Platform

**Tanggal**: 2026-06-27  
**Scope**: Analisis menyeluruh sistem AI untuk Platform Developer dan Platform Admin  
**Dasar Analisis**: 355 Java files, 51 migration files, 57 error-resilience patterns,  
457 log.error/warn calls, existing `PublishAnalysisResponse`, `OAuthAuditLog`,  
`GenericTokenRefreshService`, `CategorySyncJob`, `WebhookService`

---

## 0. Mengapa Phase 1–5 Belum Cukup

Phase 1–5 yang sudah didokumentasikan secara eksklusif fokus pada satu masalah:
**JOLT spec yang salah → publish gagal → AI perbaiki → approve → apply**.

Ini adalah pendekatan **reaktif** terhadap **satu jenis kegagalan** dari **satu lapisan** sistem.

Analisis kode menunjukkan minimal **9 kategori kegagalan berbeda** yang tidak tersentuh:

| # | Kategori Kegagalan            | Contoh                                                            | Phase 1-5 Cover?   |
|---|-------------------------------|-------------------------------------------------------------------|--------------------|
| 1 | JOLT error                    | Field tidak ter-map                                               | ✅                  |
| 2 | Channel API breaking change   | Shopify ubah response format                                      | ❌                  |
| 3 | OAuth token silent expiry     | Token TikTok expired → 401 → publish gagal tanpa notifikasi jelas | ❌                  |
| 4 | Data quality corruption       | Product dengan `price=null`, `sku=""`                             | ❌                  |
| 5 | Migration ordering bug        | Order 5 overwrite Order 111 hasil                                 | ❌                  |
| 6 | Reactive chain anti-pattern   | `.subscribe()` dalam CommandLineRunner, cold observable           | ❌                  |
| 7 | Post-processing rule conflict | Dua rule mengubah field yang sama, hasil non-deterministik        | ❌                  |
| 8 | Category taxonomy staleness   | Category ID yang tersimpan sudah dihapus channel                  | ❌                  |
| 9 | Cross-tenant data leak        | Query tanpa `organizationId` filter                               | ❌                  |

Selain itu, tidak ada sistem yang membantu **developer** dalam fase development (sebelum kode masuk production), hanya sistem yang aktif saat runtime.

---

## 1. Grand Architecture — AI Intelligence Mesh

Proposal ini memperkenalkan **AI Intelligence Mesh**: lapisan kecerdasan yang mencakup seluruh lifecycle platform, dari development hingga production operations.

```
╔══════════════════════════════════════════════════════════════════╗
║              AI INTELLIGENCE MESH — LABAMAP OMNICHANNEL         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  DEVELOPER LAYER                   ADMIN/OPS LAYER              ║
║  ┌────────────────────┐           ┌────────────────────────┐    ║
║  │ 1. Code Guardian   │           │ 5. Predictive Publish  │    ║
║  │    (static AI)     │           │    Engine (pre-flight) │    ║
║  │                    │           │                        │    ║
║  │ 2. API Contract    │           │ 6. Operational Brain   │    ║
║  │    Oracle          │           │    (anomaly detect)    │    ║
║  │                    │           │                        │    ║
║  │ 3. Migration       │           │ 7. Token Sentinel      │    ║
║  │    Safety Advisor  │           │    (proactive auth)    │    ║
║  │                    │           │                        │    ║
║  │ 4. Test Generator  │           │ 8. Data Quality        │    ║
║  │    (from failures) │           │    Steward             │    ║
║  └─────────┬──────────┘           │                        │    ║
║            │                      │ 9. Channel Relation    │    ║
║            │                      │    Knowledge Graph     │    ║
║            │                      │                        │    ║
║            │                      │ 10. Incident Autopilot │    ║
║            │                      └───────────┬────────────┘    ║
║            │                                  │                  ║
║            └──────────────┬───────────────────┘                  ║
║                           ▼                                      ║
║              ┌────────────────────────┐                          ║
║              │ 11. Multi-Agent         │                          ║
║              │     Orchestrator        │                          ║
║              │     + Shared Memory     │                          ║
║              └────────────────────────┘                          ║
║                           │                                      ║
║              ┌────────────▼────────────┐                         ║
║              │ Phase 1-5: JOLT         │ ← sudah direncanakan    ║
║              │ Intelligence System     │                          ║
║              └─────────────────────────┘                         ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 2. DEVELOPER LAYER — 4 Sistem AI

### Sistem 1: Code Guardian Agent

**Masalah yang Diselesaikan**: Developer menulis kode Spring WebFlux yang mengandung anti-pattern berbahaya (blocking call, cold observable, missing subscription) yang hanya terdeteksi saat production.

**Temuan dari Analisis Kode**:
- 57 file menggunakan `.onErrorResume` — konsistensi belum dijamin
- `ChannelCategoryRequirementsMigration` menggunakan `@EventListener(ApplicationReadyEvent)` → race condition potensial dengan `CommandLineRunner` @Order lain
- `JoltSpecGeneratorService` memiliki `@SuppressWarnings("unchecked")` di banyak tempat → type safety diabaikan
- Beberapa migration menggunakan `.block()` — aman di CommandLineRunner tapi berbahaya jika dipindah

**Cara Kerja**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CODE GUARDIAN AGENT                          │
│                                                                  │
│  Trigger: PR/commit baru, atau manual scan via CLI              │
│                                                                  │
│  Rules Engine (domain-specific, bukan generic linting):         │
│                                                                  │
│  RULE C-01: Reactive Anti-Pattern Detector                       │
│  ├── .subscribe() di luar controller/CommandLineRunner → WARN   │
│  ├── .block() di Service layer → ERROR                          │
│  ├── Mono/Flux yang tidak di-subscribe → WARN                   │
│  └── Nested flatMap > 3 level → SUGGEST REFACTOR                │
│                                                                  │
│  RULE C-02: Migration Safety                                     │
│  ├── EventListener + .block() → OK (documented pattern)         │
│  ├── CommandLineRunner + new field reference → CHECK ORDER       │
│  ├── Skip condition tidak ada → WARN (re-run will fail)         │
│  └── Hardcoded ObjectId → ERROR (breaks in prod restore)        │
│                                                                  │
│  RULE C-03: Security Smell                                       │
│  ├── Repository query tanpa organizationId filter → HIGH RISK   │
│  ├── Credential dalam log statement → CRITICAL                   │
│  ├── AES key di hardcode → CRITICAL                             │
│  └── JWT tidak divalidasi sebelum operasi destructive → HIGH    │
│                                                                  │
│  RULE C-04: Channel-Domain Correctness                           │
│  ├── WebClient timeout < 3s ke channel API → WARN               │
│  ├── Mono.zip > 5 → performance concern                         │
│  ├── categoryId hardcoded sebagai String literal → WARN          │
│  └── JOLT spec disimpan sebagai String (bukan List<Map>) → ERR  │
│                                                                  │
│  LLM Layer (Claude):                                             │
│  ├── Untuk setiap finding, generate: rootCause + fix suggestion │
│  ├── RAG lookup: apakah pattern ini pernah menyebabkan bug?     │
│  └── Prioritize: mana yang paling likely menyebabkan runtime err│
└─────────────────────────────────────────────────────────────────┘
```

**Output**:
```json
{
  "findings": [
    {
      "ruleId": "C-03",
      "severity": "HIGH_RISK",
      "file": "CategoryCacheServiceImpl.java",
      "line": 207,
      "code": "findByChannelTypeAndStoreIdAndCategoryId(channelType, storeId, categoryId)",
      "issue": "Query tidak menyertakan organizationId. Jika storeId tidak unique antar organization, data org A bisa terbaca oleh org B.",
      "fix": "Tambahkan organizationId parameter ke repository query dan index compound.",
      "evidence": "3 bug serupa ditemukan di channel_category_api_config queries (fixes: commit 68bb99f, c293689)"
    }
  ],
  "summary": {
    "critical": 0, "high": 2, "medium": 7, "low": 12,
    "estimatedFixTime": "4 hours"
  }
}
```

**Integration Point**: GitHub Actions hook → POST `/api/v1/admin/ai/code-review` → hasil tampil sebagai PR comment.

---

### Sistem 2: API Contract Oracle

**Masalah yang Diselesaikan**: Channel (Shopify, Amazon, TikTok) memperbarui API mereka secara berkala tanpa pemberitahuan yang cukup. Saat ini tidak ada mekanisme deteksi dini — developer baru tahu saat publish gagal massal.

**Temuan dari Analisis Kode**:
- `ChannelCategoryApiConfig` menyimpan `baseUrl`, `urlPath`, `itemsJsonPath`, `nodeIdField` — semua ini bisa berubah saat channel update API
- `GenericMerchantDataService` memanggil channel API tanpa contract snapshot
- `GenericCategoryService` parse response dengan hardcoded field names
- Tidak ada test suite yang mem-validate response format aktual dari channel

**Cara Kerja**:

```
WEEKLY CONTRACT CHECK (setiap Senin 06:00):

Untuk setiap channel yang aktif:
  1. Ambil ChannelCategoryApiConfig untuk channel tersebut
  2. Panggil endpoint kritis dengan minimal valid request:
     - GET /categories/{channelType}/{storeId}/root (untuk tree API)
     - GET /merchant-data/{channelType}/{storeId}/category-attributes
     - Panggil langsung channel sandbox API jika tersedia
  3. Parse response dengan field mapping yang tersimpan
  4. Bandingkan dengan snapshot minggu lalu:
     - Field baru yang tidak ada di config → SCHEMA_ADDITION
     - Field lama yang hilang → BREAKING_CHANGE (CRITICAL)
     - Type berubah (number → string) → BREAKING_CHANGE (HIGH)
     - Response structure berubah (object → array) → BREAKING_CHANGE (CRITICAL)
  5. Kirim LLM analysis:
     - "Field X hilang dari Shopify response. Cek apakah JOLT menggunakan field ini."
     - Generate: daftar JOLT specs yang terpengaruh
     - Generate: auto-patch suggestion jika perubahan sederhana
```

**Collections Baru**:
```
api_contract_snapshots:
  channelId, endpoint, snapshotDate
  responseStructure: {...}   // hash + field paths
  fieldTypes: {fieldName: type}
  
api_contract_violations:
  channelId, detectedAt, violationType
  affectedJoltSpecs: [spec_id, ...]
  recommendedAction: "..."
  status: OPEN | PATCHED | IGNORED
```

**Alerting**:
```
CRITICAL (Breaking Change):
→ Buat AiRecommendation (Phase 4) dengan priority=HIGH
→ Kirim notifikasi developer IMMEDIATELY
→ Auto-pause publish untuk channel tersebut hingga ditangani

HIGH (Schema Addition):
→ Cek apakah field baru adalah required field baru
→ Jika ya: generate JOLT patch proposal
→ Jika tidak: log saja untuk developer awareness

INFO (Minor change):
→ Catat di api_contract_snapshots saja
```

---

### Sistem 3: Migration Safety Advisor

**Masalah yang Diselesaikan**: 51 migration files dengan 14 ordering points yang interdependent. Saat ini tidak ada validasi otomatis bahwa:
1. Migration tidak saling bertabrakan
2. Skip condition benar
3. Field yang dimodifikasi tidak digunakan oleh service lain

**Temuan Konkret dari Analisis Kode**:
- `ChannelConfigurationDataLoader` @Order(5) + `ChannelCategoryRequirementsMigration` @Order(111): DataLoader meng-overwrite beberapa fields → jika urutan salah, migration Order 111 berjalan dengan data yang sudah di-overwrite
- `ChannelAttributeMappingsMigration` @Order(101) menggunakan `.block()` — aman, tapi jika di-refactor ke async di masa depan akan break
- Beberapa migration memiliki skip condition yang mengecek satu field saja padahal migrasi menyentuh banyak field

**Analisis Otomatis**:

```
PRE-DEPLOYMENT MIGRATION ANALYSIS:

Input: semua @Component migration classes + @Order values

RULE M-01: Order Gap Detection
→ Deteksi gap besar dalam order numbers (e.g., Order 5 → Order 100)
→ Warning: ada 95 slot kosong — migrasi baru mungkin di-insert dengan order yang salah

RULE M-02: Field Dependency Graph
→ Build graph: migration X menulis field F1, F2, F3
→ migration Y membaca field F1
→ Jika order(Y) < order(X): DEPENDENCY VIOLATION

RULE M-03: Idempotency Check
→ Analisis: apakah migration aman jika dijalankan 2x?
→ Yang tidak idempotent: migrasi yang INSERT tanpa IF NOT EXISTS
→ Yang idempotent: migrasi yang UPDATE + IF-condition

RULE M-04: Skip Condition Completeness
→ Cek: apakah skip condition mengecek SEMUA field yang akan dimodifikasi?
→ Contoh bug: skip jika 'categoryRequirements != null' tapi migrasi juga mengubah 'postProcessingRules'

LLM Output:
"Migration Order 101 (ChannelAttributeMappingsMigration) membaca field 'channelId' 
yang dimigrasikan oleh Order 100. Namun Order 100 menggunakan @EventListener sedangkan 
Order 101 juga @EventListener. Keduanya terdaftar sebagai bean Spring — eksekusi order 
dijamin oleh @Order annotation, BUKAN oleh waktu event. AMAN: konfirmasi bahwa 
ApplicationReadyEvent listener dieksekusi secara sekuensial dalam satu thread."
```

---

### Sistem 4: Failure-Driven Test Generator

**Masalah yang Diselesaikan**: Test suite saat ini memiliki 13 test files yang banyak menggunakan mock sehingga tidak menangkap bug integrasi antar layer. Bug real ditemukan di production.

**Temuan dari Analisis Kode**:
- `MongoConnectionTest` dan semua repository tests FAIL karena butuh koneksi MongoDB → tidak ada embedded MongoDB di test suite
- `AdaptivePatternMatchingCommandImplTest` FAIL karena unstubbed Mockito → tes tidak mencerminkan kode actual
- Tidak ada test untuk webhook signature verification
- Tidak ada test untuk token refresh lifecycle
- Tidak ada contract test terhadap response format sync API (`/sync_channel_product_impl`)

**Cara Kerja**:

```
INPUT: ai_agent_sessions (failure records dari Phase 1-5)
       + publish error history
       + api_contract_violations

PROCESS (LLM-powered):
1. Cluster kegagalan berdasarkan rootCause
2. Untuk setiap cluster yang belum ada testnya:
   a. Identifikasi komponen yang terlibat (service, repository, controller)
   b. Generate test scenario: given → when → then
   c. Generate test code (JUnit 5 + Mockito + StepVerifier)
   d. Submit sebagai PR draft dengan label "ai-generated-test"

OUTPUT EXAMPLES:

Test dari failure "TikTok price must be STRING not number":
@Test
void tiktokPublish_priceAsNumber_shouldBeConvertedToString() {
    Map<String, Object> masterData = Map.of("price", 99.99);  // number
    // ... JOLT transform
    assertThat(result.get("price")).isInstanceOf(String.class);
    assertThat(result.get("price")).isEqualTo("99.99");
}

Test dari failure "Shopify token expired mid-publish":
@Test
void shopifyPublish_expiredToken_shouldRefreshAndRetry() {
    // Mock: first call returns 401, refresh returns new token, retry succeeds
    when(syncApiWebClient.post()...)
        .thenReturn(errorResponse(401))  // first call
        .thenReturn(successResponse());  // after refresh
    
    StepVerifier.create(channelPublishService.publish(request))
        .expectNextMatches(r -> r.getSuccess())
        .verifyComplete();
    
    verify(tokenRefreshService).refresh(any());
}
```

---

## 3. ADMIN/OPS LAYER — 6 Sistem AI

### Sistem 5: Predictive Publish Engine (Pre-flight Intelligence)

**Masalah yang Diselesaikan**: `PublishAnalysisResponse` sudah ada (`POST /api/v1/channels/publish/analyze`) dan melakukan dry-run. Namun ia hanya mengecek kondisi saat ini — tidak **memprediksi** apakah publish akan berhasil berdasarkan pola historis.

**Gap yang Ditemukan**:
- Sistem saat ini: "field required X ada ✓, JOLT valid ✓, token aktif ✓ → readyToPublish=true"
- Kenyataan: Masih bisa gagal karena:
  - Channel sedang maintenance (tidak dideteksi oleh dry-run)
  - Image URL yang dipakai sudah expired (CDN link)
  - Harga melebihi batas channel tanpa explisit error
  - SKU sudah ada di channel (duplicate) → 409 yang tidak ter-handle

**Architecture**:

```
ENHANCED PRE-FLIGHT (menggantikan/augmenting PublishAnalysisService):

Layer 1 — EXISTING (sudah ada):
  ✅ Field completeness check
  ✅ JOLT spec validation
  ✅ Required fields presence
  ✅ Token aktif check

Layer 2 — NEW: Historical Failure Predictor
  Input: channelId + categoryId + productAttributes
  Query: ai_publish_outcome_history (new collection)
  
  "Produk dengan price > $500 dan channelId=lazada memiliki failure rate 34%
   berdasarkan 127 publish attempts (most common: 'price exceeds category limit')"
   
  "Produk dengan 8 variant options ke TikTok Shop memiliki failure rate 67%
   (TikTok limits: max 3 option types, max 50 SKUs per product)"

Layer 3 — NEW: Real-time Channel Health Probe
  Sebelum suggest publish, probe channel health:
  - GET ringan ke channel API (auth check)
  - Cek api_contract_violations untuk channel ini
  - Cek apakah ada maintenance window yang diketahui
  
Layer 4 — NEW: LLM Risk Assessor
  Semua data di atas + product data → LLM → structured risk report:
  
  {
    "overallRisk": "MEDIUM",
    "predictedSuccessRate": 0.73,
    "riskFactors": [
      {
        "factor": "HIGH_PRICE_LAZADA",
        "description": "Harga Rp 1.250.000 melebihi kategori fashion Lazada average (Rp 450.000). Lazada seringkali reject produk yang harganya 3x rata-rata kategori.",
        "mitigation": "Cek Lazada price guidelines untuk kategori 'Clothing'. Atau kurangi harga untuk initial listing.",
        "confidence": 0.81
      }
    ],
    "recommendation": "PROCEED_WITH_CAUTION"
  }
```

**New Collection**: `ai_publish_outcome_history`
```json
{
  "channelId": "lazada",
  "categorySlug": "clothing",
  "productAttributes": {
    "priceRange": "500-1000",      // bucketed, bukan exact price
    "variantCount": "5-10",
    "hasImages": true,
    "weightGrams": "200-500"
  },
  "outcome": "FAILED",
  "failureCategory": "PRICE_LIMIT_EXCEEDED",
  "publishedAt": "2026-06-20T14:23:00"
}
```

---

### Sistem 6: Operational Brain — Multi-Signal Anomaly Detection

**Masalah yang Diselesaikan**: 457 log.error/log.warn tersebar di 355 file. Tidak ada sistem yang menganalisis **pola** dari log tersebut untuk mendeteksi degradasi sebelum menjadi outage.

**Signals yang Dimonitor**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPERATIONAL BRAIN                            │
│                                                                  │
│  Signal Sources (real-time):                                    │
│  ├── publish_attempt_rate per channel (expected: stable)        │
│  ├── publish_failure_rate per channel (threshold: < 5%)         │
│  ├── sync_workflow_p99_latency (threshold: < 30s)               │
│  ├── token_refresh_failure_count (expected: 0)                  │
│  ├── category_cache_miss_rate (expected: < 10% after warmup)    │
│  ├── webhook_rejection_rate (expected: < 1%)                    │
│  └── MongoDB query latency p99 (threshold: < 500ms)             │
│                                                                  │
│  Anomaly Detection Algorithms:                                   │
│  ├── Sliding window comparison (now vs same time last week)     │
│  ├── Z-score for sudden spikes (> 3σ = anomaly)                 │
│  ├── Seasonality-aware (peak jam 09:00 dan 19:00)               │
│  └── Correlation detection (failure spike + latency spike = ?   │
│                              → likely channel API degradation)   │
│                                                                  │
│  LLM Root Cause Analysis (saat anomali terdeteksi):            │
│  Input:                                                          │
│  - Anomaly description + metrics                                 │
│  - Recent code deployments (git log)                            │
│  - Recent schema changes (migration run times)                  │
│  - api_contract_violations untuk channel terkait                │
│  - Correlated signals                                            │
│                                                                  │
│  Output:                                                         │
│  "Publish failure rate Shopify naik dari 2% ke 31% sejak 14:23. │
│   Korelasi dengan: api_contract_violations record pada 14:15     │
│   (Shopify response tidak lagi mengandung 'published_at' field). │
│   Kemungkinan: Shopify API update tanpa changelog.               │
│   Recommended action: Pause Shopify publishes. Run contract check│
│   sekarang. Patch JOLT yang menggunakan 'published_at'."        │
│                                                                  │
│  Actions Available:                                              │
│  ├── AUTO: Pause channel publish jika failure rate > 50%        │
│  ├── AUTO: Trigger API Contract Oracle untuk channel             │
│  ├── NOTIFY: Alert developer dengan context                      │
│  └── AUTO: Scale back workflow polling frequency jika API slow  │
└─────────────────────────────────────────────────────────────────┘
```

**New Collection**: `ai_operational_events`
```json
{
  "eventType": "ANOMALY_DETECTED | ANOMALY_RESOLVED | ACTION_TAKEN",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "affectedChannel": "shopify",
  "signal": "publish_failure_rate",
  "currentValue": 0.31,
  "expectedValue": 0.02,
  "deviation": "15.5σ",
  "rootCauseAnalysis": "...",
  "automatedActions": ["PAUSED_SHOPIFY_PUBLISHES"],
  "requiresHumanAction": true,
  "humanActionDescription": "...",
  "detectedAt": "2026-06-27T14:23:00",
  "resolvedAt": null
}
```

---

### Sistem 7: Token Sentinel — Proactive OAuth Health

**Masalah yang Diselesaikan**: `GenericTokenRefreshService` sudah ada dan bekerja dengan baik. Namun ia bersifat **reactive**: hanya refresh saat token sudah expired. Sistem tidak memperingatkan sebelum expiry, tidak mendeteksi refresh failure patterns, dan tidak menangani skenario "semua token org expire bersamaan" (thundering herd).

**Analisis Kode**:
- `ChannelStoreConnection.tokenExpiry: Map<String, LocalDateTime>` — per-credential expiry tracking sudah ada
- `GenericTokenRefreshService` membaca `TokenRefreshConfig` dari `ChannelConfiguration` — data-driven, bagus
- Tidak ada scheduled job yang memonitor token health secara proaktif
- `OAuthAuditLog` tersimpan tapi tidak dianalisis untuk failure patterns

**Architecture**:

```
TOKEN SENTINEL — Runs every 15 minutes:

Phase A — Health Inventory:
  Scan semua ChannelStoreConnection dimana isActive=true
  Untuk setiap store:
  - Hitung time_to_expiry untuk setiap credential
  - Klasifikasi:
    HEALTHY   : time_to_expiry > bufferMinutes × 3
    WARNING   : time_to_expiry dalam bufferMinutes × 2
    CRITICAL  : time_to_expiry < bufferMinutes
    EXPIRED   : time_to_expiry <= 0

Phase B — Thundering Herd Prevention:
  Kelompokkan token yang akan expire dalam 1 jam
  Jika > 10 token expire dalam window 5 menit:
  → Distribute refresh schedule: rate limit to 2 refresh/minute
  → Prevent 429 dari channel OAuth server

Phase C — Historical Failure Analysis (LLM):
  Query OAuthAuditLog 24 jam terakhir:
  - Failure rate per channel per organizationId
  - Pattern: "TikTok token untuk 3 org selalu gagal di-refresh pada Senin pagi"
  → Cross-reference dengan TikTok maintenance window docs
  → Store pattern di ai_token_patterns collection
  → Pre-refresh pada Minggu malam untuk org-org tersebut

Phase D — Anomaly Alerting:
  CRITICAL: token EXPIRED dan publish sedang berjalan → immediate alert
  HIGH: refresh berhasil tapi token baru expire dalam 1 jam (short-lived)
  MEDIUM: refresh failure rate > 10% untuk channel tertentu
  LOW: token approaching warning threshold
```

**New Capability: Adaptive Buffer**:

```
Saat ini: bufferMinutes adalah nilai static dari TokenRefreshConfig

Enhancement:
  LLM analisis: berapa lama rata-rata refresh call untuk channel ini?
  - TikTok refresh rata-rata 1.2s (stabil)
  - WIX refresh rata-rata 3.7s (variable, kadang 8s)
  
  Adaptive buffer = max(configuredBuffer, p99_refresh_latency × 2 + 5 minutes)
  → WIX: buffer dinaikkan otomatis dari default 5 menit ke 20 menit
```

---

### Sistem 8: Data Quality Steward

**Masalah yang Diselesaikan**: Tidak ada validasi data quality yang komprehensif di level master product. Product dengan data korup (null price, empty SKU, broken image URL, duplicate SKU antar variant) baru terdeteksi saat publish gagal di channel.

**Analisis Data yang Diperlukan**:
- `MasterProductData.productAttributes` — Map<String, Object>, bisa berisi nilai apapun
- `MasterProductData.variants` — List<Map<String, Object>>, bisa ada duplicate SKU
- Image URLs tersimpan sebagai String — bisa expired CDN links
- `price` bisa tersimpan sebagai String atau Double atau null

**Scanning Rules (jalankan setiap malam, 03:00)**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA QUALITY STEWARD                          │
│                                                                  │
│  RULE DQ-01: Required Field Presence                             │
│  - name/title: null atau "" → ERROR                             │
│  - price: null atau <= 0 → ERROR                                │
│  - SKU: null, "" atau whitespace only → ERROR                   │
│  - mainImage: null → WARNING (beberapa channel wajibkan gambar)  │
│                                                                  │
│  RULE DQ-02: SKU Uniqueness within Product                       │
│  - Duplicate SKU antar variant → ERROR                          │
│  - SKU yang sama dengan produk lain dalam org → WARNING          │
│                                                                  │
│  RULE DQ-03: Image URL Health                                    │
│  - HEAD request ke mainImage URL (sampling: 20% produk/hari)    │
│  - 404 → ERROR (image sudah tidak exist)                        │
│  - 403 → WARNING (access control issue)                         │
│  - > 5MB → WARNING (beberapa channel reject large images)       │
│                                                                  │
│  RULE DQ-04: Price Consistency                                   │
│  - compareAtPrice < price → LOGICAL ERROR                       │
│  - price tersimpan sebagai String "99.99" → TYPE INCONSISTENCY  │
│  - price = 0 untuk produk non-giveaway → SUSPICIOUS             │
│                                                                  │
│  RULE DQ-05: Variant Completeness                                │
│  - Variant ada tapi options kosong → INCOMPLETE                 │
│  - Produk punya hasVariants=true tapi variants=[] → ERROR       │
│  - Variant count > 100 untuk Shopify → WILL_FAIL_SHOPIFY        │
│                                                                  │
│  RULE DQ-06: Channel-Specific Readiness                          │
│  - For Amazon: brand field harus ada → CHECK_BRAND_REQUIRED      │
│  - For TikTok: price harus integer-compatible → CHECK_PRICE_INT  │
│  - For WIX: name < 255 chars → CHECK_NAME_LENGTH                │
│                                                                  │
│  LLM Enhancement:                                                │
│  Untuk setiap produk dengan banyak issues:                       │
│  "Produk 'Kemeja Batik Premium' memiliki 3 critical issues.      │
│   Berdasarkan data historis, produk serupa dari kategori yang    │
│   sama berhasil dipublish setelah: (1) isi SKU per variant,     │
│   (2) tambahkan brand field, (3) upload minimal 1 gambar produk."│
└─────────────────────────────────────────────────────────────────┘
```

**Output**: `ai_data_quality_reports` collection + endpoint:
```
GET /api/v1/admin/ai/data-quality?organizationId=&severity=ERROR
→ Daftar produk dengan masalah + suggested fixes
```

---

### Sistem 9: Channel Relationship Knowledge Graph

**Masalah yang Diselesaikan**: Platform saat ini menyimpan data sebagai dokumen terpisah. Tidak ada representasi yang memungkinkan query seperti: "Produk mana yang paling berisiko jika Shopify mengubah category taxonomy?" atau "Channel mana yang memiliki JOLT paling sering dipatch?"

**Graf Relationships**:

```
Knowledge Graph Nodes:
  Organization ──── owns ────► ChannelStoreConnection
  ChannelStoreConnection ──── uses ────► ChannelConfiguration
  ChannelConfiguration ──── has ────► ChannelJoltSpec (per category)
  ChannelJoltSpec ──── transforms ────► MasterProductData
  MasterProductData ──── published_to ────► ChannelProductData
  ChannelProductData ──── belongs_to ────► CategoryNode
  CategoryNode ──── parent ────► CategoryNode
  ChannelFieldMapping ──── maps ────► (sourceField, targetField)
  AiRecommendation ──── patches ────► ChannelJoltSpec
  PublishError ──── caused_by ────► (JOLT_ERROR | TOKEN_ERROR | SCHEMA_ERROR | ...)

Key Queries Enabled:
  Q1: "Jika Shopify taxonomy category 'aa-1-1-2' dihapus, 
       berapa produk yang terdampak dan JOLT spec mana yang perlu diupdate?"
  
  Q2: "Channel mana yang memiliki dependency paling dalam terhadap 
       satu field master product 'brand'?"
  
  Q3: "Organisasi mana yang memiliki highest publish failure correlation 
       dengan channel X?" (tanda credentials mereka bermasalah)
  
  Q4: "Jika JoltSpec 'shopify-clothing-v2.1' diupdate, 
       berapa produk yang akan ikut terpengaruh?"

Implementation:
  Option A: MongoDB dengan manual reference traversal
            → Sudah punya semua data, cukup query patterns
            → Tidak perlu infrastructure baru
  
  Option B: Neo4j graph database (dedicated)
            → Query lebih powerful ($MATCH pathfinding)
            → Tambah infrastructure complexity
  
  Recommendation: OPTION A dulu (MVP), migrate ke Neo4j jika query complexity > 5 hops
```

**LLM Integration**: Knowledge graph digunakan sebagai context tambahan untuk agent lain:
```
"Sebelum generate JOLT patch untuk Shopify, 
 cek knowledge graph: ada berapa produk aktif di channel ini?
 Jika > 1000 produk, patch memerlukan staged rollout."
```

---

### Sistem 10: Incident Autopilot

**Masalah yang Diselesaikan**: Saat ini insiden ditangani sepenuhnya manual. Tidak ada runbook otomatis, tidak ada first-response yang terstandarisasi, dan pemahaman tentang "apa yang perlu dilakukan saat X gagal" tersebar di kepala developer.

**Incident Taxonomy untuk Platform Ini**:

```
Level 1 — Self-Resolving (Autopilot handles fully):
  INC-01: Token expired + refresh berhasil
          → Auto: refresh → retry publish → update successRate
          → No human needed
  
  INC-02: Category cache miss
          → Auto: fetch from API → cache → continue
          → No human needed
  
  INC-03: Temporary channel API timeout (< 10s)
          → Auto: retry with exponential backoff (max 3x)
          → No human needed

Level 2 — Semi-Automatic (Autopilot triages, human decides):
  INC-04: JOLT validation failure
          → Auto: trigger JoltGenerationAgentService
          → Auto: create AiRecommendation
          → Human: approve/reject fix
  
  INC-05: Publish failure rate > 15% untuk channel
          → Auto: pause new publishes untuk channel tersebut
          → Auto: root cause analysis
          → Human: review analysis + decide resume/fix

Level 3 — Human Required (Autopilot provides full context):
  INC-06: Credential compromise suspected
          → Auto: pause ALL channel operations
          → Auto: rotate encryption keys (if possible)
          → Human: verify + reconnect stores
          
  INC-07: Data corruption detected
          → Auto: snapshot current state
          → Auto: generate rollback plan
          → Human: execute rollback with review

Runbook as Code:
  Setiap incident type memiliki YAML runbook yang dapat di-execute oleh Autopilot:
  
  runbooks/INC-04-jolt-failure.yaml:
    trigger: publish.failure.reason CONTAINS 'jolt'
    steps:
      - action: CALL_AI_AGENT
        agent: JoltGenerationAgentService
        params: {channelId: "${event.channelId}", categoryId: "${event.categoryId}"}
      - action: CREATE_RECOMMENDATION
        conditions: {confidence: ">0.70"}
      - action: NOTIFY_DEVELOPER
        template: "JOLT fix suggestion ready for review"
      - action: PAUSE_CHANNEL_PUBLISH
        conditions: {failureCount: ">5", timeWindow: "10m"}
```

---

## 4. Unified Intelligence — Shared Context & Memory

Semua 10 sistem di atas menggunakan **Shared Context Store** agar tidak bekerja dalam silo:

```
SHARED CONTEXT STORE (ai_platform_context collection):

{
  "channelId": "shopify",
  "lastUpdated": "2026-06-27T14:00:00",
  
  "health": {
    "apiHealthScore": 0.97,
    "lastContractCheck": "2026-06-25T06:00:00",
    "activeIncidents": [],
    "tokenHealthSummary": {"healthy": 23, "warning": 2, "critical": 0}
  },
  
  "intelligence": {
    "predictedFailureTopics": ["variant_option_limit", "image_size"],
    "avgJoltConfidence": 0.91,
    "pendingRecommendations": 1,
    "recentCalibration": {"threshold": 0.90, "approvalRate": 0.89}
  },
  
  "dataQuality": {
    "totalProducts": 1247,
    "criticalIssues": 3,
    "warningIssues": 28,
    "lastScanAt": "2026-06-27T03:00:00"
  },
  
  "knowledgeGraph": {
    "categoryDependencyRisk": "LOW",
    "joltVersions": {"shopify-default": "v2.1", "shopify-clothing": "v1.8"},
    "lastGraphUpdate": "2026-06-27T03:30:00"
  }
}
```

**Multi-Agent Orchestrator** (Sistem 11):

```
Saat developer atau admin melakukan query natural language:

"Kenapa publish produk 'Baju Batik' ke Shopify kemarin gagal?"

Orchestrator memutuskan agent mana yang relevan:
→ Check ai_publish_outcome_history (Sistem 5)
→ Check ai_operational_events untuk waktu tersebut (Sistem 6)
→ Check token health log untuk store tersebut (Sistem 7)
→ Lihat JoltSpec yang dipakai + AiRecommendation (Phase 3-4)

LLM merangkum semua context:
"Publish produk 'Baju Batik' pada 2026-06-26 14:23 gagal karena dua faktor 
bersamaan: (1) JOLT spec 'shopify-clothing-v1.8' tidak memiliki mapping untuk 
field 'fabric_composition' yang baru diwajibkan Shopify sejak API update 14:15, 
(2) token untuk store 'labamap.myshopify.com' mengalami refresh failure pada 
14:18 (TikTok maintenance). Kedua masalah telah dideteksi: AiRecommendation 
REC-2026-06-26-003 sudah dibuat untuk fix JOLT, dan token sudah berhasil 
di-refresh pada 14:45. Produk bisa dipublish ulang sekarang."
```

---

## 5. Gap Analysis Matrix — Phase 1-5 vs Extended Systems

| Skenario Kegagalan | Phase 1-5 | Extended AI |
|---|---|---|
| JOLT field tidak ter-map | ✅ RAG + Generate | ✅ (diperkuat) |
| Channel API ubah response format | ❌ | ✅ Sistem 2 (Contract Oracle) |
| OAuth token silent expiry | ❌ | ✅ Sistem 7 (Token Sentinel) |
| Product data corrupt (null price, dup SKU) | ❌ | ✅ Sistem 8 (Data Steward) |
| Migration ordering bug | ❌ | ✅ Sistem 3 (Migration Advisor) |
| Reactive chain anti-pattern di kode baru | ❌ | ✅ Sistem 1 (Code Guardian) |
| Post-processing rule conflict | ❌ | ✅ Sistem 1 C-04 + Sistem 9 Graph |
| Category taxonomy staleness | ❌ | ✅ Sistem 2 + Sistem 9 Graph |
| Cross-tenant data leak (query tanpa orgId) | ❌ | ✅ Sistem 1 C-03 |
| Publish failure rate spike tidak terdeteksi | ❌ | ✅ Sistem 6 (Operational Brain) |
| Thundering herd token refresh | ❌ | ✅ Sistem 7 (Token Sentinel) |
| Developer tidak tahu kenapa publish gagal | ❌ | ✅ Sistem 10 + Orchestrator |
| Test suite tidak menangkap bug integrasi | ❌ | ✅ Sistem 4 (Test Generator) |
| TikTok variant limit akan terlampaui | ❌ | ✅ Sistem 5 (Predictive Engine) |
| Shopify image > 5MB akan rejected | ❌ | ✅ Sistem 8 (Data Steward) |

---

## 6. Implementation Priority Matrix

Berdasarkan **impact × implementability**:

```
TIER 1 — QUICK WINS (implementasi 1-2 minggu, impact tinggi):

  Sistem 7: Token Sentinel
  → Paling mudah: codebase sudah punya tokenExpiry tracking
  → Cukup tambah scheduled job + simple alerting
  → Impact: eliminasi silent publish failure karena expired token
  → Effort: RENDAH (1 minggu)

  Sistem 8: Data Quality Steward  
  → Rules-based (tidak perlu LLM untuk basic check)
  → Admin bisa langsung melihat produk bermasalah sebelum publish
  → Impact: kurangi publish failure 20-30%
  → Effort: RENDAH (1 minggu)

TIER 2 — MEDIUM EFFORT, HIGH VALUE (2-3 minggu):

  Sistem 5: Predictive Publish Engine
  → Augment existing PublishAnalysisService
  → Butuh ai_publish_outcome_history collection
  → Impact: developer tahu risiko sebelum publish
  → Effort: SEDANG (2 minggu)

  Sistem 6: Operational Brain (simplified version)
  → Start dengan: failure rate monitoring + LLM root cause
  → Tidak perlu full anomaly detection dulu
  → Impact: admin bisa tindak lebih cepat saat ada masalah
  → Effort: SEDANG (2-3 minggu)

TIER 3 — SIGNIFICANT EFFORT, STRATEGIC VALUE (3-4 minggu):

  Sistem 2: API Contract Oracle
  → Butuh: real channel sandbox access + snapshot infrastructure
  → Impact: deteksi channel API breaking change before production impact
  → Effort: TINGGI (3-4 minggu)

  Sistem 1: Code Guardian
  → Butuh: custom AST rules untuk Spring WebFlux patterns
  → Bisa dimulai dengan rules yang paling simple (C-03 security smell)
  → Impact: prevent future bugs masuk ke production
  → Effort: TINGGI (3-4 minggu)

TIER 4 — COMPLEX, LONG-TERM (1-2 bulan):

  Sistem 10: Incident Autopilot
  → Butuh: stable Tier 1-3 sebagai prerequisite
  → Butuh: runbook library yang mature
  → Effort: SANGAT TINGGI (6-8 minggu)

  Sistem 9: Knowledge Graph
  → Butuh: MongoDB change streams atau event sourcing
  → Effort: SANGAT TINGGI (4-6 minggu)
```

---

## 7. Teknologi Tambahan yang Diperlukan

| Kebutuhan | Current Stack | Proposed Addition | Alasan |
|---|---|---|---|
| Structured log analysis | `log.error/warn` → console | MongoDB `ai_operational_logs` + tailing | LLM butuh structured input, bukan log text |
| Metric collection | Tidak ada | Spring Actuator + Micrometer → MongoDB | Anomaly detection butuh time-series metrics |
| Scheduled AI jobs | Hanya 1 `CategorySyncJob` | Extend `SchedulingConfig` | Token Sentinel, Data Steward, Contract Oracle |
| Event streaming | ApplicationEventPublisher (sync) | Spring WebFlux + MongoDB Change Streams | Real-time incident detection |
| Graph traversal | Manual repository queries | Custom `MongoTemplate` aggregation pipeline | Knowledge Graph queries |

**Tidak perlu** infrastructure baru yang signifikan — semua bisa diimplementasi di atas MongoDB + Spring Boot yang sudah ada.

---

## 8. Prinsip Desain Seluruh Sistem

1. **Zero new infrastructure untuk Tier 1-2** — Semua cukup dengan MongoDB + Spring Boot existing.
2. **LLM sebagai reasoning layer, bukan execution layer** — LLM memberikan insight dan saran; eksekusi selalu melalui kode Java yang deterministik.
3. **Developer tetap in-control** — Tidak ada sistem yang mengubah data production tanpa approval, kecuali operasi maintenance yang jelas-jelas aman (token refresh, cache invalidation).
4. **Graceful degradation** — Jika AI layer gagal, sistem core tetap berjalan normal.
5. **Observable by design** — Setiap keputusan AI tersimpan dengan alasan, dapat di-audit kapanpun.
6. **Incremental complexity** — Mulai dengan rules-based (Tier 1), tambah LLM reasoning (Tier 2), tambah learning (Tier 3), baru full autonomous (Tier 4).
7. **Domain-specific, bukan generic** — Tidak menggunakan generic APM tools (Datadog, New Relic). Semua intelligence domain-aware (tahu tentang JOLT, channel constraints, OAuth flows omnichannel).
