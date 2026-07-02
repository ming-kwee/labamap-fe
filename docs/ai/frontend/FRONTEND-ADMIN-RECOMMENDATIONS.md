# AI System — Rekomendasi UI untuk Platform Admin / Developer Console

> **Audiens:** Tim Frontend.
> **Tujuan:** Merekomendasikan tampilan (screens) yang perlu ditambahkan agar **platform admin & developer** bisa **mengoperasikan, memantau, men-tuning, dan mempercayai** sistem Agentic AI + RAG.
> **Status backend:** Semua endpoint di bawah **sudah ada dan berjalan** (`/api/v1/admin/ai/*` dan admin controller terkait).
>
> **📦 Status implementasi frontend: ✅ SEMUA 12 LAYAR SELESAI (2026-07-02).**
> Dipecah menjadi 3 fase di [`IMPLEMENTATION-PHASES.md`](./IMPLEMENTATION-PHASES.md):
> **Phase 1 (P0-A…D)**, **Phase 2 (P1-E,F,G,H,L)**, **Phase 3 (P2-I,J,K)**.
> Modul `src/modules/ai-admin/` + halaman platform-admin, grup sidebar **"AI Console"** (12 item),
> **22 e2e test lulus** (`npm run test:e2e`).

Dokumen ini bukan sekadar daftar fitur — setiap layar disertai **alasan operasional** yang diambil dari masalah nyata yang ditemui saat mengoperasikan sistem ini (provider tersembunyi, index kosong senyap, threshold salah kalibrasi, kuota LLM, embedding yatim). UI yang baik **mencegah** kelas masalah tersebut.

---

## 0. Apa yang dioperasikan (konteks singkat)

Sistem ini punya 3 lapis yang perlu "jendela" bagi operator:

| Lapis | Isi | Kenapa perlu UI |
|-------|-----|-----------------|
| **RAG store** | Embedding dari JOLT spec, field mapping, semantic knowledge (vector store: pgvector/Atlas) | Perlu tahu terisi/tidak, cakupan, kebersihan (orphan), dan bisa dicari |
| **Agent (LLM)** | Menghasilkan/memperbaiki JOLT spec via tool-use + RAG | Perlu observability penalaran + status kuota/error |
| **Learning loop** | Rekomendasi (approve/reject), kalibrasi confidence, success-rate mapping | Perlu antrian review manusia + dashboard kesehatan |

---

## 1. Prinsip desain (WAJIB diterapkan di semua layar)

1. **Transparansi provider.** Selalu tampilkan **provider AKTIF** (vector store: pgvector/atlas, LLM: anthropic/gemini, embedding: openai/gemini). *Alasan: pernah salah diagnosa berjam-jam karena UI tidak menunjukkan store aktif.*
2. **Jangan ada kegagalan senyap.** `resultCount: 0`, `total: 0`, `AGENT_FAILED` harus dijelaskan (kenapa: kuota? threshold? index? key kosong?), bukan sekadar tampil kosong.
3. **Aksi destruktif = konfirmasi + dampak.** Reindex, cleanup-orphan, delete mapping/spec harus konfirmasi dan menampilkan estimasi dampak.
4. **Operasi async = umpan balik.** Reindex & generate-jolt lambat (panggil API eksternal) → spinner/progress, jangan blok UI.
5. **Config terlihat (read-only minimal).** Tampilkan nilai efektif (threshold, model, dimensi) supaya admin paham kenapa sistem berperilaku begitu.
6. **Error LLM dikategorikan.** `429` = kuota, `400` = konfigurasi, `key blank` = belum di-set. Tampilkan pesan yang bisa ditindaklanjuti, bukan stack trace mentah.

---

## 2. Layar yang direkomendasikan (prioritas P0 → P2)

### 🟥 P0-A · AI Health & Config Dashboard  (halaman utama)
**Tujuan:** Dalam 1 layar menjawab "apakah AI sehat & dikonfigurasi seperti apa?"
**Sumber:** `GET /admin/ai/embeddings/stats`, `GET /admin/ai/learning/stats`, `GET /admin/ai/recommendations/stats`

**Tampilkan:**
- **Kartu Provider Aktif** (paling atas, menonjol):
  `Vector Store: pgvector` · `Embedding: gemini / gemini-embedding-001 · 1536-dim` · `Agent LLM: gemini-2.0-flash` · badge `Embedding: ON` / `Agent: ON`
- **Kartu RAG Coverage:** total embedding + breakdown (JOLT_SPEC / FIELD_MAPPING / SEMANTIC_KNOWLEDGE), dan **"embedded vs live"** (mis. `88 / 88 mapping = 100%`). Kalau ada gap → tandai kuning ("38 mapping belum ter-embed → Reindex").
- **Kartu Learning Health:** `avgSuccessRate`, jumlah mapping successRate rendah, `pendingRecommendations`.
- **Banner status degradasi:** jika `embeddingEnabled=false` → "RAG nonaktif: API key embedding belum di-set". Jika `agentEnabled=false` → "Agent nonaktif: LLM key belum di-set".

```
┌─ AI SYSTEM HEALTH ─────────────────────────────────────────────┐
│ ● Vector Store: PGVECTOR   ● Embedding: gemini (1536)          │
│ ● Agent LLM: gemini-2.0-flash   [Embedding ON] [Agent ON]      │
├────────────────────────────────────────────────────────────────┤
│ RAG COVERAGE            LEARNING HEALTH        RECOMMENDATIONS   │
│  JOLT_SPEC     7/7       avg success 95.4%      Pending:   3     │
│  FIELD_MAPPING 88/88 ✓   low-success:  4        Approved: 12     │
│  SEMANTIC       3/3      mappings:    88        Rejected:  1     │
│  Total: 98             [⚠ 0 orphan]           [Review Queue →]  │
└────────────────────────────────────────────────────────────────┘
```

---

### 🟥 P0-B · RAG Index Management
**Tujuan:** Isi, jaga kebersihan, dan pantau vector store.
**Sumber:** `GET /admin/ai/embeddings/stats` · `POST /admin/ai/reindex?sourceType=` · `POST /admin/ai/embeddings/cleanup-orphans?sourceType=`

**Fitur:**
- Tabel per sourceType: `embedded count` vs `live source count` → kolom **Coverage %** dan **Orphan count**.
- Tombol **Reindex** (per sourceType / ALL) → tampilkan hasil `total / indexed / skipped / failed` setelah selesai. **Async** → progress + polling.
- Tombol **Cleanup Orphans** (per sourceType / ALL) → **konfirmasi**, lalu tampilkan `orphansDeleted` per tipe (before/after count).
- Indikator "reindex terakhir kapan".

> **Alasan:** Kita menemukan (a) reindex melaporkan `total=0` padahal ada data (bug hitung, sudah diperbaiki), (b) embedding **yatim** menumpuk (526 utk 88 mapping) karena seeder lama. UI ini membuat cakupan & kebersihan **terlihat**, dan menyediakan tombol cleanup + reindex yang aman.

**⚠️ UX penting:** Reindex memanggil API embedding eksternal (bisa kena rate-limit). Tampilkan `failed` dan `skipped` dengan tooltip ("skipped = konten tak berubah/dedup", "failed = error API, mis. kuota").

---

### 🟥 P0-C · RAG Search Playground (Retrieval Tester + Threshold Tuner)
**Tujuan:** Uji & **kalibrasi** pencarian RAG — alat paling penting untuk tuning.
**Sumber:** `POST /admin/ai/search/test?sourceType=&channelId=&limit=&minScore=`

**Fitur:**
- Input query bebas, dropdown `sourceType`, filter `channelId`, slider `limit`.
- **Slider `minScore` (0.0–1.0)** dengan mode "raw" (minScore=0 → lihat skor mentah semua top-K).
- Tabel hasil: **score** (bar/heatmap warna), snippet, referenceId, channel, category.
- Indikator threshold config aktif vs override (respons kini mengembalikan `minScore` yang dipakai).

> **Alasan:** Search sempat balik **0 hasil** padahal data ada — ternyata threshold default `0.70` (kalibrasi OpenAI) terlalu tinggi untuk embedding Gemini (match relevan ~0.65). UI slider ini memungkinkan admin **melihat skor mentah** dan menetapkan `AI_MIN_SIMILARITY_SCORE` yang tepat tanpa menebak. Tampilkan hint: "match relevan biasanya 0.6–0.66; noise ~0.44".

```
Query: [ product color and size variant ]  Type:[FIELD_MAPPING▾] minScore:[====0.58====]
┌──────┬──────────────────────────────────────────────┬──────────┬────────┐
│ 0.66 │ color → product.variants[0].color            │ shopify  │ ▓▓▓▓▓▓ │
│ 0.65 │ size  → product.variants[0].size             │ wix      │ ▓▓▓▓▓▓ │
│ 0.63 │ size  → skus[0].size                         │ tiktok   │ ▓▓▓▓▓  │
└──────┴──────────────────────────────────────────────┴──────────┴────────┘
```

---

### 🟥 P0-D · Recommendations Review Queue  (human-in-the-loop)
**Tujuan:** Developer menyetujui/menolak saran AI — inti "AI mengusulkan, manusia memutuskan".
**Sumber:**
- List: `GET /admin/ai/recommendations?status=PENDING&channelId=&page=0&size=20` → `PageResponse<AiRecommendation>`
- Detail: `GET /admin/ai/recommendations/{id}`
- `POST /{id}/approve?reviewedBy=&note=` (query params)
- `POST /{id}/reject?reviewedBy=` **+ body** `{ "reason": "…" }` (⚠️ reason di BODY, bukan query param)
- `GET /admin/ai/recommendations/stats` → `{pending, approved, rejected, total}`
- `POST /trigger-analysis?channelId=` (memicu analisa → rekomendasi baru)

**Struktur objek `AiRecommendation` (tampilkan yang tebal — inti kepercayaan):**
```jsonc
{
  "id", "status", "priority", "channelId", "categoryId", "triggerType",
  "triggerContext": {                 // KENAPA muncul
     "masterProductId", "publishAttemptId", "errorMessage",  // mis. publish gagal
     "joltSpecIdBefore", "sampleProductSnapshot" },
  "analysis": {                       // PENILAIAN AI
     "rootCause", "affectedFields":[], "missingChannelRequirements":[],
     "confidenceScore", "confidenceLevel",
     "ragEvidence":[],                // ← mapping/spec mana yang dipakai AI (BUKTI grounding)
     "warnings":[] },                 // ← risiko yang harus dilihat reviewer
  "proposedFix": { "type", "currentJoltSpecId", /* perubahan JOLT */ },
  "expiresAt", "agentSessionId",      // link ke sesi (P1-E)
  "reviewedBy", "reviewedAt", "rejectionReason", "appliedJoltSpecId"
}
```

**Fitur UI:**
- **Antrian**: badge `confidenceScore`/`confidenceLevel` (≥0.92 hijau=auto, 0.70–0.92 kuning=review, <0.70 merah), channel, `triggerType`, umur → `expiresAt`. Filter `status`/`channelId`.
- **Panel detail** wajib menampilkan:
  - **Kenapa**: `triggerContext.errorMessage` + produk contoh (kalau dari publish gagal).
  - **`analysis.rootCause`** + `affectedFields` + `missingChannelRequirements`.
  - **`analysis.ragEvidence`** (mapping/spec sumber) — *tunjukkan agent memakai pengetahuan terbukti, bukan menebak.*
  - **`analysis.warnings`** (banner risiko sebelum approve).
  - **`proposedFix`** (JSON viewer perubahan JOLT), link ke `agentSessionId` (P1-E).
- **Aksi**: Approve (`reviewedBy` wajib, `note` opsional) · Reject (`rejectionReason`). **Konfirmasi** untuk approve (mengubah JOLT produksi).
- Tombol **Trigger Analysis** per channel.

> **Alasan:** Titik kepercayaan utama. `ragEvidence` + `warnings` + `analysis` harus terlihat agar developer memutuskan **dengan sadar** — bukan sekadar "confidence 0.8, approve". Spek versi awal melewatkan field kaya ini.
>
> **Pagination:** `?page=&size=` → `PageResponse` (lihat §5). Filter `status`/`channelId` tetap dipakai.

---

### 🟧 P1-E · Agent Sessions / Observability
**Tujuan:** Lihat penalaran agent — "apakah agent benar-benar memakai RAG, bukan menebak?"
**Sumber:** `GET /admin/ai/sessions?channelId=&triggerType=&page=0&size=20` (→ `PageResponse<AiAgentSession>`) · `GET /admin/ai/sessions/{sessionId}`

**Struktur `AiAgentSession` (bentuk nyata):**
```jsonc
{
  "id", "triggerType", "channelId", "categoryId", "status",     // COMPLETED | FAILED
  "ragContext": {                       // RINGKASAN retrieval (bukan dump)
     "retrievedJoltSpecs": 2, "retrievedFieldMappings": 8, "topSimilarityScore": 0.66 },
  "agentSteps": [ /* AgentStep: urutan tool-call */ ],
  "summary": { /* ringkasan hasil */ },
  "totalTokensUsed": 1234, "durationMs": 8250,
  "errorMessage", "createdAt", "completedAt"
}
```

**Tampilkan:**
- Daftar sesi: `triggerType`, channel/category, **status**, `durationMs`, `totalTokensUsed`, waktu. (paginated `?page=&size=` → `PageResponse`.)
- Detail: **`ragContext`** (X jolt + Y mapping diambil, topScore) — *bukti grounding*; **`agentSteps`** (urutan tool-call); `summary`; `errorMessage`.
- Sesi FAILED: kategorikan error (`429`=kuota, `400`=config, `Retries exhausted`=kuota habis walau retry).

> **Alasan:** Kepercayaan + debug. `ragContext.retrievedFieldMappings > 0` = agent benar-benar grounded ke RAG. `totalTokensUsed` = biaya.

---

### 🟧 P1-F · JOLT Generation Console ("Coba Agent")
**Tujuan:** Developer menjalankan agent secara manual untuk 1 produk contoh.
**Sumber:** `POST /admin/ai/generate-jolt?channelId=&categoryId=` (body = master product)

**Fitur:**
- Form: pilih channel + category, editor JSON produk contoh (atau pilih produk nyata).
- Hasil: **status** (`AUTO_APPLIED` / `RECOMMENDATION_CREATED` / `MANUAL_REVIEW_REQUIRED` / `AGENT_FAILED`), `confidenceScore`, **proposedJoltSpec** (JSON viewer), explanation, validationSummary, link ke sesi (P1-E).
- Kalau `AGENT_FAILED` → tampilkan penyebab yang bisa ditindaklanjuti (mis. "kuota Gemini habis — coba lagi nanti / pakai Anthropic").

> **Alasan:** Ini demonstrasi konkret "AI membantu". Beri tombol "Terapkan sebagai JOLT spec" jika status RECOMMENDATION.

---

### 🟧 P1-G · Field Mappings Manager (editor knowledge base)
**Tujuan:** CRUD mapping field yang menjadi bahan RAG + heuristik.
**Sumber:** `GET /admin/channel-field-mappings?channelId=&sourceField=&targetField=&strategy=&isRequired=&isActive=&minConfidence=&page=0&size=20` (→ `PageResponse`) · `POST` · `GET/PUT/DELETE /{id}` · `PUT /{id}/activate|deactivate`

**Tampilkan/aksi:** list & filter per channel; kolom sourceField → targetField, strategy, **confidence**, **successRate**, **verificationTier**, isActive. Edit, activate/deactivate, delete. Sorot mapping successRate rendah (<50%). Setelah edit → hint "Reindex agar embedding sinkron".

---

### 🟨 P1-H · Learning Dashboard (tren)
**Tujuan:** Tunjukkan sistem "belajar" seiring waktu.
**Sumber:** `GET /admin/ai/learning/stats?days=`

**Tampilkan:** per-channel approval/rejection rate + threshold terkalibrasi; kesehatan mapping (total, low-success, avg); ukuran index RAG; pending recommendations. Grafik tren N hari.

---

### 🟧 P1-L · Config & Cascade Panel  (config transparency)
**Tujuan:** Tampilkan **config efektif** (read-only) agar admin paham kenapa sistem berperilaku begitu — dan status **cascade** (APM→Agent).
**Sumber:** `GET /admin/ai/config`

**Bentuk respons (tanpa secret — key hanya boolean):**
```jsonc
{
  "enabled": true,
  "llm":        { "provider":"gemini", "model":"gemini-2.0-flash", "keyConfigured":true },
  "embedding":  { "provider":"gemini", "model":"gemini-embedding-001", "dimensions":1536, "keyConfigured":true },
  "vectorStore":{ "provider":"pgvector", "minSimilarityScore":0.58, "searchLimit":5, "atlasIndexName":"…" },
  "agent":      { "maxTokens":8192, "maxToolRounds":5, "agentTimeoutSeconds":5 },
  "recommendation": { "autoApplyThreshold":0.92, "recommendThreshold":0.70, "expiryDays":30 },
  "cascade":    { "enabled":false, "escalationThreshold":85.0, "mode":"sync", "escalationTimeoutSeconds":30 },
  "reindexOnStartup": false
}
```

**Tampilkan:**
- **Provider aktif** (LLM/embedding/vector store) + badge `keyConfigured` (kalau `false` → "key belum di-set").
- **Threshold** yang menentukan perilaku: `minSimilarityScore` (search), `autoApplyThreshold`/`recommendThreshold` (rekomendasi). Ini menjelaskan "kenapa search 0 hasil" atau "kenapa auto-apply".
- **Cascade**: status `enabled`, `escalationThreshold` (APM di bawah ini → eskalasi ke agent), `mode` (sync/async). Kalau `enabled=false` → badge "APM-only (agent tidak dipanggil dari pipeline)".
- Catatan: semua ini **read-only** (diatur via env var, butuh restart untuk ubah). Tampilkan hint env var per nilai (mis. `AI_MIN_SIMILARITY_SCORE`).

> **Alasan:** Menutup gap "config transparency". Tanpa layar ini, threshold & cascade adalah kotak hitam — persis sumber kebingungan yang kita alami (threshold 0.70, cascade off). Tidak ada UI edit (config env-driven) — cukup **tampilkan + jelaskan**.

---

### 🟦 P2-I · JOLT Specs Manager
**Sumber:** `GET /admin/channel-jolt-specs?channelId=&categoryId=&…&page=0&size=20` (→ `PageResponse`) · `PUT/DELETE /{id}` · `DELETE` (bulk) — lihat/edit/hapus JOLT spec per channel+category (JSON editor + validasi).

### 🟦 P2-J · Semantic Knowledge Manager
**Sumber:** `GET /admin/field-semantic-knowledge?semanticType=&category=&search=&…&page=0&size=20` (→ `PageResponse`) · `POST` · `GET /{id}` · `GET /by-name/{fieldName}` · `PUT/DELETE /{id}` · `PUT /{id}/activate|deactivate` — kelola sinonim/pattern semantic type (mis. PRODUCT_NAME, PRICE).

### 🟦 P2-K · Value Mappings Manager
**Sumber (CRUD lengkap — `ChannelMappingAdminController`):**
- `GET /admin/channel-mappings?channelType=&masterFieldName=&page=0&size=20` → `PageResponse<ChannelFieldValueMappingDocument>`
- `POST /admin/channel-mappings` (body = dokumen mapping) · `PUT /{id}` · `DELETE /{id}`

Mapping nilai master → nilai channel (mis. material "cotton" → kode channel). Seed awal via `ChannelValueMappingDataLoader`.

---

## 3. Ringkasan prioritas

| Prioritas | Layar | Nilai |
|-----------|-------|-------|
| **P0** | Health & Config Dashboard | Visibilitas provider + kesehatan (cegah salah-diagnosa) |
| **P0** | RAG Index Management | Isi/bersihkan/pantau store (cegah kosong senyap & orphan) |
| **P0** | RAG Search Playground | Uji + tuning threshold (cegah "0 hasil" misterius) |
| **P0** | Recommendations Review Queue | Human-in-the-loop (inti kepercayaan) |
| **P1** | Config & Cascade Panel (P1-L) | Transparansi threshold/provider/cascade |
| **P1** | Agent Sessions Observability | Kepercayaan + debug penalaran |
| **P1** | JOLT Generation Console | Demo & operasi agent manual |
| **P1** | Field Mappings Manager | Editor knowledge base |
| **P1** | Learning Dashboard | Tren pembelajaran |
| **P2** | JOLT Specs / Semantic / Value Mappings Manager | Manajemen data pendukung |

---

## 4. Concern lintas-layar (dari pengalaman operasional nyata)

| Masalah yang pernah terjadi | Yang harus dicegah UI |
|-----------------------------|------------------------|
| Provider aktif tak terlihat → salah diagnosa (kira Atlas padahal pgvector) | Kartu provider aktif menonjol di setiap konteks RAG |
| `total=0` / `resultCount=0` tanpa penjelasan | Selalu jelaskan penyebab kosong (kuota/threshold/index/key) |
| Threshold `0.70` salah kalibrasi untuk Gemini | Slider minScore + hint band skor (relevan ~0.65, noise ~0.44) |
| Embedding yatim menumpuk (526 vs 88) | Indikator coverage + orphan + tombol cleanup |
| Reindex jalan sebelum data ter-seed (timing) | Tombol reindex manual + "embedded vs live" + waktu reindex terakhir |
| Kuota LLM habis (429) tampil sebagai kegagalan misterius | Kategori error LLM: kuota / config / key-kosong, dengan saran tindakan |
| Aksi destruktif tanpa peringatan | Konfirmasi + estimasi dampak untuk reindex/cleanup/delete |

---

## 5. Catatan integrasi untuk Frontend

- **Auth:** `/api/v1/admin/**` di belakang OAuth2 Resource Server (JWT Bearer, issuer Keycloak — lihat `spring.security.oauth2.resourceserver` di `application.yml`). Sertakan `Authorization: Bearer <jwt>`. Whitelist saat ini hanya `/swagger-ui/**`. **Belum ada pembatasan peran granular** di controller — kalau perlu pisahkan admin read vs write, minta backend menambah `@PreAuthorize`/scope.
- **Async:** `reindex` & `generate-jolt` lama (API eksternal). Optimistic UI + polling (`embeddings/stats` untuk reindex, `sessions/{id}` untuk agent). `generate-jolt` bisa 10–20 dtk (tool-loop + retry).
- **Pagination:** ✅ **semua 6 list endpoint** (`recommendations`, `sessions`, `field-mappings`, `channel-mappings`, `channel-jolt-specs`, `field-semantic-knowledge`) **berpaginasi konsisten** — param `?page=0&size=20` (size di-cap 100), respons berbentuk **`PageResponse`**:
  ```jsonc
  { "content":[...], "page":0, "size":20, "totalElements":137, "totalPages":7, "hasNext":true }
  ```
  (Slicing in-memory di skala admin; kalau suatu koleksi tumbuh sangat besar, backend tinggal ganti ke `Pageable` DB-level tanpa ubah kontrak.)
- **Kontrak error (tidak seragam — tangani keduanya):**
  - Endpoint "job" (reindex/cleanup) mengembalikan **200 + body status**: `{ "status":"FAILED", "error":"…" }` atau `"SKIPPED"`. Jangan hanya cek HTTP code — baca `status`.
  - Endpoint lain melempar `ResponseStatusException` → **error JSON Spring standar** (`{timestamp, status, error, message, path}`) dengan HTTP 4xx/5xx (mis. `sessions/{id}` 404 "Session not found").
  - `HTTP 000`/connection-refused → server AI down.
- **Bentuk respons:** JSON datar (lihat contoh per bagian). `embeddings/stats` → `vectorStore` + `sourceCounts` + `llmProvider/llmModel`; `search/test` → `minScore` efektif; `config` → seluruh config (tanpa secret).
- **Empty/degraded states:** rancang khusus untuk "RAG kosong", "embedding disabled", "agent disabled", "server down" — bukan tabel kosong tanpa konteks.
- **First-run / onboarding (fresh install):** sarankan wizard urutan: (1) cek `config` (provider + key configured) → (2) seed data → (3) `reindex` → (4) `search/test` untuk tuning `AI_MIN_SIMILARITY_SCORE` → (5) verifikasi coverage 100% & 0 orphan. Ini mencegah operator baru "tersesat" seperti debugging panjang yang kita alami.

---

### Lampiran — pemetaan endpoint → layar
| Endpoint | Layar |
|----------|-------|
| `GET /admin/ai/embeddings/stats` (→ `vectorStore`, `counts`, `sourceCounts`, `llmProvider/llmModel`) | P0-A, P0-B |
| `GET /admin/ai/embeddings/orphans-count` (read-only scan) | P0-A, P0-B |
| `GET /admin/ai/config` (config efektif, tanpa secret) | P1-L, P0-A |
| `POST /admin/ai/reindex` | P0-B |
| `POST /admin/ai/embeddings/cleanup-orphans` | P0-B |
| `POST /admin/ai/search/test` (+ `minScore` override) | P0-C |
| `GET /admin/ai/recommendations` (+ `/{id}`, approve/reject/stats/trigger-analysis) | P0-D, P1-H |
| `GET /admin/ai/sessions` (+ `/{id}`) | P1-E, P1-F |
| `POST /admin/ai/generate-jolt` | P1-F |
| `GET /admin/ai/learning/stats` | P0-A, P1-H |
| `/admin/channel-field-mappings/*` | P1-G |
| `/admin/channel-jolt-specs/*` | P2-I |
| `/admin/field-semantic-knowledge/*` | P2-J |
| `/admin/channel-mappings/*` | P2-K |
