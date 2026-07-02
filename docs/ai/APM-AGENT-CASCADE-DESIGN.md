# Design — APM → Agent Cascade

**Tanggal**: 2026-06-29
**Status**: Design (belum diimplementasi)
**Tujuan**: Mengubah dua jalur penghasil JOLT yang **paralel** (APM heuristik & Agent LLM)
menjadi satu pipeline **kaskade**: jalur murah deterministik dulu, eskalasi ke LLM hanya
saat APM tidak yakin. Menghapus *design smell* "dua penulis ke `channel_jolt_specs`".

---

## 1. Masalah Saat Ini

Ada **dua** mekanisme penghasil JOLT yang menulis ke koleksi yang sama, **independen**:

```
JALUR A — APM (heuristik-first, deterministik, $0)
  AdaptivePatternMatchingCommandImpl.execute()
    └─ FieldMatchingService (5-tier) → Phase 2 enrichment → JoltSpecGeneratorService
    └─ persist ke channel_jolt_specs  [generatedBy="adaptive-pattern-matching"]
  Dipicu: /adaptive-pattern/*, PublishAnalysisService (/analyze)

JALUR B — Agent (LLM-first, RAG, berbiaya)
  JoltGenerationAgentService.generateJoltSpec()
    └─ RAG + Claude tool-use loop + validate
    └─ persist ke channel_jolt_specs  [generatedBy="ai-agent-v1"]
  Dipicu: POST /admin/ai/generate-jolt, publish FAILED
```

**Akibat (design smell):**
- Ambigu: siapa yang menghasilkan spec aktif? Bisa saling timpa (race condition penulisan).
- Confidence ganda: `calculateOverallConfidence()` (APM) vs `JoltGenerationResult.confidenceScore` (agent).
- Validasi terduplikasi: `checkReadiness()` (APM) vs `validate_jolt_spec` tool (agent).
- Tidak ada keputusan tunggal kapan LLM (mahal) layak dipakai.

---

## 2. Arsitektur Target — Kaskade

Prinsip: **cheap-path-first, escalate-on-low-confidence.**

```
JOLT dibutuhkan (publish-prep / analyze)
        │
        ▼
┌──────────────────────────────────────────────┐
│ TAHAP 1 — APM (heuristik + Phase 2 enrich)    │  $0, deterministik, cepat
│   FieldMatching 5-tier → JoltSpecGenerator     │
│   → checkReadiness() + calculateOverall()      │
└───────────────────┬──────────────────────────┘
                    │
          escalate?  (lihat §3)
          ┌─────────┴──────────┐
          │ TIDAK              │ YA
          ▼                    ▼
   ┌──────────────┐   ┌──────────────────────────────────┐
   │ APM persist  │   │ TAHAP 2 — Agent (LLM + RAG)        │  berbiaya, untuk kasus sulit
   │ spec-nya     │   │   JoltGenerationAgentService       │
   │ langsung     │   │   .generateJoltSpec(sample)        │
   │ (jalur murah)│   │     ├─ ≥0.92 → AUTO_APPLIED         │
   └──────────────┘   │     ├─ 0.70–0.91 → RECOMMENDATION   │
                      │     └─ <0.70 → MANUAL_REVIEW        │
                      │   (gagal/timeout → fallback ke APM) │
                      └──────────────────────────────────┘
```

Target: ~90% kasus selesai di Tahap 1 (gratis & instan); LLM hanya untuk ~10% kasus sulit.

---

## 3. Aturan Eskalasi (kapan Tahap 2 dipicu)

Eskalasi terjadi jika **APM tidak cukup yakin** ATAU **AI memang dimatikan tidak boleh**.
Setelah APM menghitung `overallConfidence` + `ReadinessReport`:

| Kondisi APM | Aksi |
|---|---|
| `!readiness.isReadyToPersist()` (compile/dry-run/required gagal) | **Eskalasi** |
| `overallConfidence < ESCALATION_THRESHOLD` (default 0.85) | **Eskalasi** |
| Ada required field yang unmapped (gap) | **Eskalasi** |
| `validation.hasCriticalConflicts()` | **Eskalasi** |
| Selain itu (confidence ≥ 0.85, readiness OK, tak ada gap) | **APM persist langsung** (tak ada LLM) |

Prasyarat eskalasi: `props.isAgentEnabled()` true **dan** `app.ai.cascade.enabled=true`.
Jika AI mati → APM jalan apa adanya (perilaku hari ini, zero regression).

> Catatan ambang: `ESCALATION_THRESHOLD` (0.85) diset **di atas** ambang persist APM lama
> tapi **mendekati** ambang auto-apply agent (0.92). Tujuannya: APM yang "lumayan tapi tak
> meyakinkan" tetap dikoreksi LLM sebelum dipakai produksi. Angka ini dikalibrasi belakangan
> oleh `ConfidenceCalibrationService` (Phase 5).

---

## 4. Siapa Menulis `channel_jolt_specs` (anti double-write)

Aturan **satu penulis** per keputusan:

| Skenario | Penulis | `generatedBy` |
|---|---|---|
| APM yakin (tak eskalasi) | APM `persistJoltSpecToCollection()` | `adaptive-pattern-matching` |
| Eskalasi → agent AUTO_APPLIED | Agent `autoApply()` | `ai-agent-v1` |
| Eskalasi → agent RECOMMENDATION | **Tidak ada** sampai developer approve | `ai-approved-by:<dev>` |
| Eskalasi → agent gagal/timeout | Fallback: APM persist **jika** confidence-nya ≥ persist threshold; selain itu tidak persist | `adaptive-pattern-matching` |

**Kunci**: saat APM mengeskalasi, ia **tidak** menulis spec-nya sendiri lebih dulu — penulisan
diserahkan ke hasil agent. Ini menghapus race "dua penulis". `generatedBy` tetap dibedakan
untuk audit jejak engine mana yang menghasilkan spec aktif.

---

## 5. Sync vs Async Eskalasi

| Mode | Kapan dipakai | Perilaku |
|---|---|---|
| **SYNC** (timeout) | `/analyze` interaktif (developer menunggu) | APM tunggu agent (budget mis. 30 dtk); fallback ke hasil APM bila timeout/gagal |
| **ASYNC** (fire-and-forget) | Publish-prep volume tinggi | APM kembalikan hasil terbaiknya **segera**; agent perbaiki di background → publish berikutnya yang menikmati |

Default direkomendasikan: **SYNC dengan timeout** untuk `/analyze`, **ASYNC** untuk jalur
publish (selaras pola Phase 3 publish-failure yang sudah `.subscribe()` async).
Dikontrol `app.ai.cascade.mode`.

---

## 6. Titik Integrasi di Kode (presisi)

Di `AdaptivePatternMatchingCommandImpl` (sekitar baris **519–555**), tepat setelah
`overallConfidence` + `readiness` dihitung dan **sebelum** `persistMono` diputuskan:

```java
// SESUDAH: double overallConfidence = ...; boolean hasCriticalConflicts = !readiness.isReadyToPersist();

boolean shouldEscalate = cascadeProps.isEnabled()
        && joltGenerationAgentService /* injected */ != null
        && agentProps.isAgentEnabled()
        && ( hasCriticalConflicts
          || overallConfidence < cascadeProps.getEscalationThreshold()
          || hasUnmappedRequiredFields(unmappedTargetFields, channelConfig) );

if (shouldEscalate) {
    // Jangan persist spec APM; serahkan ke agent.
    Map<String,Object> sample = buildSampleFromRequest(request);   // sourceFields → nilai contoh
    Mono<AdaptivePatternMatchingResponse> escalated =
        joltGenerationAgentService
            .generateJoltSpec(request.getChannelId(), categoryId, sample, request.getOrganizationId())
            .timeout(Duration.ofSeconds(cascadeProps.getEscalationTimeoutSeconds()))
            .map(agentResult -> mergeAgentIntoResponse(response, agentResult)) // status/joltSpec/confidence dari agent
            .onErrorResume(e -> {
                log.warn("Cascade escalation failed, falling back to APM: {}", e.getMessage());
                return persistMonoFallback(...).thenReturn(response); // APM persist bila layak
            });
    return escalated;
}

// else: jalur murah — APM persist seperti sekarang
return persistMono.thenReturn(response);
```

Yang perlu ditambah:
- Inject `JoltGenerationAgentService` + `AiCascadeProperties` ke `AdaptivePatternMatchingCommandImpl`.
- Helper `buildSampleFromRequest()` (ubah `FieldInfo` source → map nilai contoh untuk agent).
- Helper `mergeAgentIntoResponse()` (isi `joltSpec`, `overallConfidence`, status, + tandai `escalatedToAgent=true`).
- Field baru di `AdaptivePatternMatchingResponse`: `escalatedToAgent`, `agentStatus`, `recommendationId`.

> Hati-hati siklus DI: `JoltGenerationAgentService` **tidak** bergantung ke APM (sudah dicek —
> nol referensi), jadi APM → Agent searah, **tidak** ada circular dependency.

---

## 7. Konfigurasi

```yaml
app:
  ai:
    cascade:
      enabled: ${AI_CASCADE_ENABLED:false}     # opt-in; false = perilaku lama (APM saja)
      escalation-threshold: 0.85                # di bawah ini → eskalasi ke agent
      mode: sync                                # sync | async
      escalation-timeout-seconds: 30            # budget agent untuk mode sync
```

Default `enabled=false` → **tidak ada perubahan perilaku** sampai sengaja diaktifkan.

---

## 8. Analisis Biaya & Perilaku

| Metrik | Sebelum (paralel) | Sesudah (kaskade) |
|---|---|---|
| Panggilan LLM per JOLT-prep | 0 (APM) atau 1 penuh (agent), tergantung jalur | **0 untuk ~90%** (APM yakin), 1 untuk ~10% (eskalasi) |
| Penulis `channel_jolt_specs` | 2 independen (bisa balapan) | 1 per keputusan (deterministik) |
| Determinisme | tergantung jalur | jalur murah deterministik; LLM hanya untuk kasus sulit |
| Graceful degradation | ya (masing-masing) | ya — AI mati → APM penuh |
| Latensi rata-rata | rendah (APM) / tinggi (agent) | rendah untuk mayoritas; tinggi hanya saat eskalasi |

---

## 9. Migrasi Bertahap (non-breaking)

1. **Tahap 0** — Tambah `AiCascadeProperties` + field response baru. `enabled=false`. Tidak ada perubahan perilaku. Deploy aman.
2. **Tahap 1** — Implementasi `shouldEscalate` + escalation call (mode SYNC, timeout). Aktifkan di staging (`enabled=true`). Ukur: berapa % eskalasi, berapa biaya LLM, berapa yang membaik.
3. **Tahap 2** — Kalibrasi `escalation-threshold` via data nyata (`ConfidenceCalibrationService`). Aktifkan mode ASYNC untuk jalur publish volume tinggi.
4. **Tahap 3** — Setelah stabil, jadikan `/generate-jolt` murni sebagai *manual override* (developer paksa regenerasi), dan biarkan kaskade jadi jalur otomatis utama.

Rollback kapan saja: set `AI_CASCADE_ENABLED=false` → kembali ke APM-only.

---

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Agent timeout memperlambat `/analyze` | Mode SYNC pakai timeout (30s) + fallback ke hasil APM |
| Biaya LLM membengkak bila threshold terlalu tinggi | Mulai `escalation-threshold=0.85`; kalibrasi turun bila eskalasi terlalu sering |
| Double-write tetap terjadi | Aturan §4: saat eskalasi, APM **tidak** persist; satu penulis per keputusan |
| Circular dependency DI | Searah APM→Agent (terverifikasi nol referensi balik) |
| Regresi pada flow lama | `enabled=false` default; semua perubahan opt-in |

---

## 11. Keputusan yang Masih Terbuka

1. **Threshold awal**: 0.85 tebakan konservatif — perlu data nyata untuk kalibrasi. Apakah berbeda per-channel (Amazon kompleks → lebih tinggi)?
2. **Mode default untuk `/analyze`**: SYNC (developer dapat hasil terbaik tapi tunggu) vs ASYNC (cepat tapi hasil saat ini pakai APM). Rekomendasi: SYNC.
3. **Apakah Phase 2 enrichment tetap di dalam APM** sebelum keputusan eskalasi? Ya — enrichment murah (5s timeout) menaikkan confidence APM, mengurangi eskalasi yang lebih mahal. Pertahankan.
4. **`buildSampleFromRequest()`**: agent butuh data produk contoh (bukan hanya nama field). Dari mana? `request.getSourceSchema()` punya struktur tapi tidak selalu nilai. Mungkin perlu sampel master product nyata.

---

## 12. Ringkasan

APM **tetap dipertahankan** sebagai baseline deterministik tanpa-biaya (lantai yang menjamin
sistem hidup tanpa AI). Agent menjadi **tahap eskalasi** untuk kasus yang APM tak yakin —
bukan jalur tandingan. Hasilnya: satu pipeline, satu penulis per keputusan, biaya LLM minimal,
dan determinisme untuk mayoritas kasus.

Komponen terkait:
- APM: `AdaptivePatternMatchingCommandImpl` (titik integrasi §6)
- Agent: `JoltGenerationAgentService.generateJoltSpec()`
- Confidence APM: `calculateOverallConfidence()` + `checkReadiness()`
- Kalibrasi threshold: `ConfidenceCalibrationService` (Phase 5)
