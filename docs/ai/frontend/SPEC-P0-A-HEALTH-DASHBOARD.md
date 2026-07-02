# Spec Detail — P0-A · AI Health & Config Dashboard

> **✅ IMPLEMENTED (Phase 1, 2026-07-01)** — `src/modules/ai-admin/components/health/AiHealthDashboard.tsx`
> di route `/platform-admin/ai-health`. Lihat [`IMPLEMENTATION-PHASES.md`](./IMPLEMENTATION-PHASES.md).
>
> **Contoh spek lengkap** untuk 1 layar, sebagai template yang bisa tim frontend replikasi untuk layar lain.
> Mencakup: kontrak request/response, pohon komponen, binding data, nilai turunan, semua state (loading/degraded/error/empty), refresh, interaksi, dan **gap backend** yang perlu ditutup.
> Referensi induk: [`FRONTEND-ADMIN-RECOMMENDATIONS.md`](./FRONTEND-ADMIN-RECOMMENDATIONS.md)

---

## 1. Tujuan & ruang lingkup
Halaman landing operator AI. Dalam 1 layar menjawab: **provider apa yang aktif, apakah RAG/agent sehat, dan apa yang perlu tindakan.** Read-only (tidak ada aksi destruktif) — aman jadi halaman pertama.

**Refresh:** on-mount + tombol manual + auto-poll tiap **30 dtk** (data operasional, bukan real-time).

---

## 2. Endpoint yang dikonsumsi (3 panggilan paralel)

| # | Request | Guna |
|---|---------|------|
| 1 | `GET /api/v1/admin/ai/embeddings/stats` | provider aktif + jumlah embedding |
| 2 | `GET /api/v1/admin/ai/learning/stats?days=30` | kesehatan mapping + flag agent/embedding + live count mapping |
| 3 | `GET /api/v1/admin/ai/recommendations/stats` | ringkasan antrian rekomendasi |

Semua butuh header `Authorization: Bearer <admin-token>`. Panggil **paralel**; render per-kartu begitu datanya tiba (jangan tunggu ketiganya).

---

## 3. Kontrak respons (bentuk nyata)

### 3.1 `embeddings/stats` → 200  (diperbarui — gap §8 sudah ditutup)
```jsonc
{
  "embeddingEnabled": true,
  "vectorStore": "pgvector",            // "pgvector" | "atlas"  ← STORE AKTIF (sumber kebenaran)
  "embeddingProvider": "gemini",        // "openai" | "gemini" | "disabled"
  "embeddingModel": "gemini-embedding-001",
  "dimensions": 1536,
  "llmProvider": "gemini",              // agent LLM: "anthropic" | "gemini"   (gap §8.3 ✔)
  "llmModel": "gemini-2.0-flash",
  "atlasIndexName": "ai_schema_embeddings_vector_idx", // hanya relevan jika vectorStore="atlas"
  "counts": {                           // EMBEDDED (vector store)
    "JOLT_SPEC": 7, "FIELD_MAPPING": 88, "SEMANTIC_KNOWLEDGE": 3, "total": 98
  },
  "sourceCounts": {                     // LIVE source docs — untuk coverage %  (gap §8.1 ✔)
    "JOLT_SPEC": 7, "FIELD_MAPPING": 88, "SEMANTIC_KNOWLEDGE": 3
  },
  "queriedAt": "2026-07-01T09:02:10.969"
}
```

### 3.2 `learning/stats?days=30` → 200
```jsonc
{
  "period": "last_30_days",
  "channels": [ /* per-channel approval/threshold — dipakai P1-H, boleh diabaikan di sini */ ],
  "fieldMappings": {
    "avgSuccessRate": 95.45,   // persen (0–100)
    "totalMappings": 88,       // LIVE count field mapping (bukan embedding)
    "lowSuccessRate": 4        // jumlah mapping successRate < 50%
  },
  "modelHealth": {
    "mappingEmbeddingCount": 88,
    "joltEmbeddingCount": 7,
    "pendingRecommendations": 3,
    "agentEnabled": true,
    "embeddingEnabled": true
  },
  "calibration": [ /* dipakai P1-H */ ]
}
```

### 3.3 `recommendations/stats` → 200
```jsonc
{ "pending": 3, "approved": 12, "rejected": 1, "total": 16 }
```

---

## 4. Pohon komponen

```
<AiHealthDashboard>
├── <DashboardHeader>            // judul + tombol Refresh + timestamp "diperbarui …"
├── <ProviderStatusCard>         // dari #1 (+ agentEnabled dari #2)
├── <RagCoverageCard>            // dari #1 (embedded) + #2 (live)
├── <LearningHealthCard>         // dari #2
├── <RecommendationsCard>        // dari #3  → link ke P0-D
└── <DegradedStateBanner>        // kondisional: embedding/agent off, RAG kosong
```

---

## 5. Spesifikasi per komponen

### 5.1 `<ProviderStatusCard>`  (paling menonjol)
**Binding:**
- `vectorStore` → chip besar: `PGVECTOR` / `ATLAS`.
- `embeddingProvider` + `embeddingModel` + `dimensions` → `gemini · gemini-embedding-001 · 1536-dim`.
- `agentEnabled` (dari #2.modelHealth) → badge `Agent ON/OFF`.
- `embeddingEnabled` (#1) → badge `Embedding ON/OFF`.
- Jika `vectorStore="atlas"` → tampilkan `atlasIndexName`; jika `pgvector` → sembunyikan (tidak relevan).

**Derived:**
- `Agent LLM` → `#1.llmProvider` + `#1.llmModel` (mis. `gemini · gemini-2.0-flash`) — kini tersedia langsung (gap §8.3 ✔).

**Alasan (WAJIB):** ini penangkal masalah #1 — provider aktif harus terlihat jelas agar tidak salah diagnosa (Atlas vs pgvector).

### 5.2 `<RagCoverageCard>`
Tabel 3 baris (JOLT_SPEC / FIELD_MAPPING / SEMANTIC_KNOWLEDGE):

| Kolom | Sumber | Catatan |
|-------|--------|---------|
| Embedded | `#1.counts.<type>` | selalu ada |
| Live | `#1.sourceCounts.<type>` | tersedia untuk **ketiga** tipe (gap §8.1 ✔) |
| Coverage % | `embedded / live × 100` | untuk ketiga tipe |
| Status | derived | ✓ hijau bila coverage=100%, ⚠ kuning bila <100% (embedding kurang), 🔴 bila embedded>live (indikasi orphan → sarankan Scan/Cleanup di P0-B) |

Coverage kini dihitung dari satu sumber (`#1`): `coverage(type) = counts.<type> / sourceCounts.<type> × 100`.
Contoh: `FIELD_MAPPING 88/88 = 100% ✓`. Bila `embedded > live` → kemungkinan orphan → tampilkan CTA "Scan orphan" (memanggil `GET embeddings/orphans-count`).

Footer kartu: total embedding = `#1.counts.total`.
Jika `coverage < 100%` untuk FIELD_MAPPING → CTA "Reindex" (link ke P0-B).

**Alasan:** penangkal masalah "reindex belum lengkap / embedding kurang" — cakupan harus terlihat.

### 5.3 `<LearningHealthCard>`
- `#2.fieldMappings.avgSuccessRate` → gauge/persen (hijau ≥90, kuning 70–90, merah <70).
- `#2.fieldMappings.lowSuccessRate` → "N mapping success-rate rendah" (link filter ke P1-G).
- `#2.fieldMappings.totalMappings` → total mapping.

### 5.4 `<RecommendationsCard>`
- `#3.pending` → angka besar + badge (kuning bila >0).
- `#3.approved` / `#3.rejected` → sekunder.
- Tombol "Buka Review Queue →" → P0-D.
- (validasi silang) `#3.pending` sebaiknya == `#2.modelHealth.pendingRecommendations`; jika beda, pakai `#3` dan log.

### 5.5 `<DegradedStateBanner>` (kondisional, prioritas atas)
Tampilkan banner (dan sembunyikan kartu terkait bila perlu):

| Kondisi | Banner |
|---------|--------|
| `#1.embeddingEnabled=false` | 🔴 "RAG nonaktif — API key embedding belum di-set. Set `OPENAI_API_KEY`/`GEMINI_API_KEY` + restart." |
| `#2.modelHealth.agentEnabled=false` | 🟠 "Agent nonaktif — LLM key belum di-set (`ANTHROPIC_API_KEY` atau `GEMINI_API_KEY` + `AI_LLM_PROVIDER`)." |
| `#1.counts.total=0` (tapi embedding ON) | 🟠 "RAG kosong — belum ada embedding. Jalankan Reindex (P0-B)." |

---

## 6. State layar

| State | Trigger | Tampilan |
|-------|---------|----------|
| **Loading** | belum semua respons tiba | skeleton per kartu (render bertahap saat masing-masing tiba) |
| **Loaded** | ketiga OK | dashboard penuh |
| **Partial failure** | 1–2 endpoint gagal | render kartu yang berhasil; kartu gagal → inline error + "Coba lagi" (jangan gagalkan seluruh halaman) |
| **Degraded** | embedding/agent OFF atau RAG kosong | banner §5.5 + kartu relevan menampilkan state "nonaktif/kosong" |
| **Auth error (401/403)** | token invalid | redirect ke login / pesan "sesi berakhir" |
| **Total failure** | ketiga gagal (mis. server down) | full-page error + "Coba lagi"; deteksi `HTTP 000`/connection-refused → "Server AI tidak dapat dihubungi" |

**Aturan emas:** angka `0`/kosong **tidak pernah** ditampilkan tanpa konteks. Selalu bedakan "nol karena nonaktif" vs "nol karena kosong" vs "gagal ambil data".

---

## 7. Interaksi
- **Refresh** (manual + auto 30 dtk); tampilkan `queriedAt` sebagai "diperbarui X detik lalu".
- Link keluar: RagCoverage→P0-B, Recommendations→P0-D, lowSuccessRate→P1-G.
- Tidak ada aksi tulis di layar ini (aman/read-only).

---

## 8. ✅ Gap backend — SUDAH DITUTUP (2026-07-01)

Ketiga gap ini sudah diimplementasikan di backend:

1. ✅ **Live source counts** → `embeddings/stats` kini mengembalikan `sourceCounts: { JOLT_SPEC, FIELD_MAPPING, SEMANTIC_KNOWLEDGE }` (jumlah dokumen sumber hidup). **Coverage % kini bisa dihitung untuk KETIGA tipe** = `counts.<type> / sourceCounts.<type>`.

2. ✅ **Orphan count read-only** → endpoint baru **`GET /admin/ai/embeddings/orphans-count?sourceType=ALL`** (scan tanpa hapus):
   ```jsonc
   { "sourceType":"ALL", "totalOrphans":0, "queriedAt":"...",
     "details":[ { "sourceType":"FIELD_MAPPING", "orphanCount":0,
                   "liveCount":88, "embeddedCount":88 }, ... ] }
   ```
   Lebih berat dari `/stats` → panggil **on-demand** (mis. tombol "Scan orphan" di P0-B), bukan di auto-refresh dashboard.

3. ✅ **Provider LLM aktif** → `embeddings/stats` kini mengembalikan `llmProvider` (anthropic/gemini) + `llmModel`.

> Dampak ke spek: `<RagCoverageCard>` kini bisa menampilkan Coverage % untuk ketiga tipe (pakai `sourceCounts`); `<ProviderStatusCard>` kini punya provider LLM asli (bukan label statis); indikator orphan tersedia via endpoint on-demand di P0-B.

---

## 9. Checklist implementasi  (✅ semua selesai — Phase 1, 2026-07-01)
- [x] 3 panggilan paralel + render bertahap (tidak menunggu semua).
- [x] `ProviderStatusCard` menonjolkan `vectorStore` aktif.
- [x] Coverage% dihitung untuk **ketiga** tipe (gap #1 sudah ditutup — pakai `sourceCounts`).
- [x] Banner degradasi untuk embedding-off / agent-off / RAG-kosong.
- [x] Partial-failure per kartu (bukan gagal total).
- [x] Deteksi server-down (connection refused) dengan pesan jelas.
- [x] Auto-refresh 30 dtk + timestamp relatif.
- [x] Semua "0/kosong" diberi konteks (nonaktif vs kosong vs gagal).
