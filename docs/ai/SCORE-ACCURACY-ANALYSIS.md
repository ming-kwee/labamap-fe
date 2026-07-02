# Analisis Akurasi Score — JOLT Confidence System

**Tanggal**: 2026-06-29  
**Pertanyaan**: Apakah score akurasi JOLT diinput developer? Bisakah developer salah menilai?  
**Jawaban**: Ya dan tidak. Ada 3 sumber score berbeda — masing-masing punya tingkat kepercayaan yang berbeda.

---

## 1. Peta Semua Score di Sistem

```
SUMBER SCORE                    SIAPA YANG TENTUKAN      BISA SALAH?
───────────────────────────────────────────────────────────────────────
ChannelFieldMapping.confidence  Developer (manual)       ✅ Ya, sangat mungkin
ChannelFieldMapping.successRate Sistem (dari publish)    Lebih objektif, tapi ada cacat
Heuristic match score           Algoritma (string sim.)  Tidak bisa salah "niat", tapi bisa tidak tepat
AI agent confidence             Claude + RAG             Bisa halusinasi jika RAG tipis
JoltMetadata.confidence         Weighted avg semua di atas Propagate error dari semua sumber
```

---

## 2. Breakdown per Sumber

### 2.1 `ChannelFieldMapping.confidence` — ⚠️ Paling Rawan

Ini adalah confidence yang **bisa diset developer secara manual**:

```java
// ChannelFieldMappingAdminController.buildFromRequest():
.confidence(req.getConfidence() != null ? req.getConfidence() : 99.0)
// ↑ DEFAULT 99.0 untuk mapping baru — sangat optimistis

// applyUpdates() — developer bisa update langsung:
if (req.getConfidence() != null) existing.setConfidence(req.getConfidence());
```

Ini dipakai di **Tier 1 (CHANNEL_SPECIFIC)** matching — tier tertinggi dan paling dipercaya:

```java
// KnowledgeBasedFieldMatchingService.tryChannelSpecificMapping():
return MatchResult.builder()
    .confidence(mapping.getConfidence())  // ← langsung dari DB, bisa 99.0 walau salah
    .strategy("CHANNEL_SPECIFIC")
    ...
```

**Skenario bahaya**: Developer memasukkan mapping `name → title` dengan confidence 99.0, padahal seharusnya `name → product.title` untuk Shopify. JOLT yang dihasilkan akan salah path, tapi confidence dilaporkan 99%.

---

### 2.2 `ChannelFieldMapping.successRate` — Lebih Objektif, Tapi Ada Cacat

`successRate` **dilindungi dari perubahan manual**:

```java
// applyUpdates():
// successRate, usageCount, lastUsedAt NOT included ← explicitly excluded
// → developer tidak bisa override via PUT /admin/channel-field-mappings/{id}
```

Untuk mapping baru, nilainya adalah:
```java
.successRate(100.0)  // default optimistis — belum ada data nyata
.usageCount(0L)
```

**Masalah**: Mapping baru langsung dapat `successRate=100.0` meski belum pernah dipakai. Ini misleading karena `successRate=100.0` dengan `usageCount=0` tidak sama maknanya dengan `successRate=100.0` dengan `usageCount=500`.

`successRate` seharusnya diupdate oleh `LearningFeedbackService` (Phase 5), tapi **belum diimplementasi** sepenuhnya. Jadi saat ini semua mapping baru tetap di 100.0 sampai Phase 5 aktif.

---

### 2.3 Heuristic Match Score — Algoritmik, Tapi Punya Bias

Score dari Tier 2–5 dihitung **secara algoritmik**, bukan dari input developer:

```
Tier 2 (SEMANTIC_KNOWLEDGE): 85–95%
  - Berdasarkan kesamaan semantic type (PRICE→PRICE = tinggi)
  - Berdasarkan kedalaman path (shallower = lebih tinggi)
  - Computed, tidak bisa di-override manual

Tier 3 (ALIAS_MATCHING): 80–95%
  - Berdasarkan jumlah alias yang cocok
  - aliases × 5.0 bonus, capped di 95%

Tier 4 (PATTERN_MATCHING): 70–85%
  - Berdasarkan pattern rules di field_semantic_knowledge
  - base 70 + pattern.baseConfidence × 0.2

Tier 5 (KEYWORD_SIMILARITY): variabel
  - Jaccard similarity × skala
```

**Masalah**: Algoritma ini tidak tahu tentang **channel-specific wrapping rules**. `name → title` mendapat score 95% (semantic match bagus) padahal untuk Shopify harus `product.title`. Heuristik tidak cukup pintar untuk path-level correctness.

---

### 2.4 AI Agent Confidence — Grounded tapi Tidak Infallible

Score dari `PatternMatchingAgentService` lebih baik dari heuristik karena:
- Didukung RAG context (bukti dari publish sebelumnya)
- Channel-aware (tahu Shopify butuh wrapper, TikTok butuh STRING)
- Tapi masih bisa **halusinasi** jika:
  - RAG database tipis (tidak ada historical data)
  - Claude salah interpretasi channel rules
  - Tool call timeout → fallback ke heuristic

---

## 3. Diagram Aliran Score (End-to-End)

```
INPUT: Master product schema + Channel target schema
            │
            ▼
┌───────────────────────────────────────────────────────┐
│ Tier 1: CHANNEL_SPECIFIC (DB lookup)                  │
│   confidence = mapping.getConfidence()                │
│   ← Bisa diset developer. Default 99.0. ⚠️ RAWAN     │
└───────────────────────────────────────────────────────┘
            │ (jika Tier 1 tidak ditemukan)
            ▼
┌───────────────────────────────────────────────────────┐
│ Tier 2: SEMANTIC_KNOWLEDGE (algoritmik)               │
│   confidence = f(semanticType match, path depth)      │
│   ← Tidak bisa diinput manual. Relatif objektif. ✓   │
└───────────────────────────────────────────────────────┘
            │
            ▼ (semua hasil Tier 1-5 digabung)
┌───────────────────────────────────────────────────────┐
│ AI ENRICHMENT (PatternMatchingAgentService)           │
│   confidence = Claude analisis + RAG evidence         │
│   ← Grounded, tapi bisa halusinasi. Semi-objektif.   │
└───────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────┐
│ calculateOverallConfidence()                          │
│   = weighted average (PRICE 1.3x, NAME 1.4x, dll)   │
│   ← Propagate semua error dari sumber di atas        │
└───────────────────────────────────────────────────────┘
            │
            ▼
    overallConfidence → JoltMetadata.confidence
    (menentukan auto-apply vs recommendation vs manual review)
```

---

## 4. Masalah Utama & Risikonya

### Masalah #1: "Ghost High Confidence"

Developer memasukkan mapping yang salah dengan confidence tinggi:

```
Mapping di DB: name → title (confidence=99.0, successRate=100.0, usageCount=0)
Realita Shopify: harus name → product.title

JOLT dihasilkan:
  { "name": "title" }  ← salah path
  
overallConfidence dilaporkan: 95%  ← misleading!
Publish ke Shopify: GAGAL karena tidak ada product wrapper
```

Ini terjadi karena `successRate=100.0` dengan `usageCount=0` tidak ada buktinya, tapi sistem mempercayainya.

### Masalah #2: "Optimistic Default"

```java
.successRate(100.0)  // mapping baru belum pernah dipakai
.usageCount(0L)
```

Sistem tidak membedakan:
- `successRate=100.0, usageCount=500` ← 500 kali publish berhasil, sangat dipercaya
- `successRate=100.0, usageCount=0` ← belum pernah dipakai, tidak ada bukti

Keduanya mendapat confidence yang sama di Tier 1.

### Masalah #3: Heuristik Tidak Path-Aware

```
name → title   [score: 93%, semantic match]
```

Heuristik tidak tahu bahwa untuk Shopify, `title` harus menjadi `product.title`. Ini hanya bisa diketahui dari:
- Channel-specific domain knowledge (sudah ada di `AgentToolHandlerService.channelDomainNotes()`)
- Historical data sukses yang sudah ter-embed di RAG
- Tapi hanya jika AI agent aktif (ANTHROPIC_API_KEY disetel)

---

## 5. Arsitektur Score yang Lebih Objektif (Rekomendasi)

### Fix #1: Pisahkan "Configured Confidence" dari "Verified Confidence"

```java
// ChannelFieldMapping — tambah field baru:
private Double configuredConfidence;    // yang developer set manual
private Double verifiedConfidence;      // yang dihitung dari successRate × usageCount

// Computed property:
public double getEffectiveConfidence() {
    if (usageCount == null || usageCount < 10) {
        // Belum cukup bukti: downgrade configured confidence
        return configuredConfidence != null
            ? configuredConfidence * 0.7  // 30% haircut untuk data tipis
            : 50.0;
    }
    // Cukup bukti: gunakan successRate langsung
    return successRate != null ? successRate : configuredConfidence;
}
```

Dengan ini, mapping baru dengan `usageCount=0` akan mendapat effective confidence ~70% (bukan 99%), mendorong ke recommendation bukan auto-apply.

### Fix #2: Minimum Usage Threshold untuk Tier 1

```java
// KnowledgeBasedFieldMatchingService.tryChannelSpecificMapping():
return MatchResult.builder()
    .confidence(computeEffectiveConfidence(mapping))  // bukan langsung mapping.getConfidence()
    ...

private double computeEffectiveConfidence(ChannelFieldMapping mapping) {
    long uses = mapping.getUsageCount() != null ? mapping.getUsageCount() : 0;
    double base = mapping.getConfidence() != null ? mapping.getConfidence() : 99.0;
    
    if (uses == 0)   return base * 0.65;  // belum teruji
    if (uses < 5)    return base * 0.80;  // sedikit bukti
    if (uses < 20)   return base * 0.90;  // cukup bukti
    // uses >= 20: percayai sepenuhnya
    return Math.max(base, mapping.getSuccessRate() != null ? mapping.getSuccessRate() : base);
}
```

### Fix #3: successRate Wajib Diupdate Setelah Publish

Phase 5 `LearningFeedbackService.recordPublishOutcome()` harus benar-benar dipanggil dari `ChannelPublishService` setelah setiap publish COMPLETED/FAILED. Saat ini belum terhubung.

```java
// ChannelPublishService — setelah updateChannelProductStatus():
.then(learningFeedbackService.recordPublishOutcome(
        channelId, categoryId,
        extractUsedMappingIds(filteredMatches),  // mapping IDs yang dipakai
        response.getSuccess(),
        publishId))
```

Ini membuat `successRate` benar-benar mencerminkan realitas lapangan.

### Fix #4: Confidence Floor di AI Agent

Jika RAG tidak punya data (similarity score < 0.5 untuk semua hasil), AI agent harus menurunkan confidence output-nya:

```java
// PatternMatchingAgentService — tambah guard:
if (ragJolts.isEmpty() && ragMappings.isEmpty()) {
    log.warn("RAG returned no context for {}/{} — AI confidence will be capped at 0.75", channelId, categoryId);
    // Inject ke system prompt: "RAG has no data for this channel/category. Be conservative."
}
```

---

## 6. Kesimpulan: Berapa Sebenarnya Score Bisa Dipercaya?

| Sumber Score | Siapa Tentukan | Tingkat Kepercayaan | Kondisi Sekarang |
|---|---|---|---|
| `ChannelFieldMapping.confidence` | Developer manual | ⭐⭐ Rendah — bisa bias | Tidak ada guard terhadap nilai salah |
| `ChannelFieldMapping.successRate` | Sistem (publish outcomes) | ⭐⭐⭐⭐ Tinggi | Belum diupdate otomatis (Phase 5 belum aktif) |
| Heuristic Tier 2-5 | Algoritma | ⭐⭐⭐ Sedang | Tidak channel-aware untuk path |
| AI agent confidence | Claude + RAG | ⭐⭐⭐ Sedang | Bagus jika RAG berisi data, lemah jika RAG kosong |
| `overallConfidence` final | Weighted avg | ⭐⭐⭐ Sedang | Mewarisi kelemahan dari semua sumber |

**Score paling bisa dipercaya saat ini**: `successRate` dari `ChannelFieldMapping` — tapi hanya setelah Phase 5 aktif dan ada cukup publish history (minimal 20 kali per mapping).

**Score paling tidak bisa dipercaya**: `ChannelFieldMapping.confidence` yang baru dibuat dengan default 99.0 dan usageCount=0.

**Rekomendasi segera**: Implementasi Fix #1 dan #2 dari section 5 sebelum sistem digunakan di production — mereka mencegah "ghost high confidence" yang paling berbahaya.
