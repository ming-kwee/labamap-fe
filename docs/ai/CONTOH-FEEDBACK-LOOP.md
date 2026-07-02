# Contoh Nyata: Feedback Loop AI + RAG (Studi Kasus "Kcategory Baru: Furniture")

> Lanjutan dari [`MEMAHAMI-AI-VS-APM.md`](./MEMAHAMI-AI-VS-APM.md) — bagian 6 ("kenapa sistem makin pintar").
> Dokumen ini menelusuri **satu produk nyata**, hari demi hari, menunjukkan bagaimana keputusan AI berubah menjadi pengetahuan yang membuat sistem makin pintar. Setiap langkah **ditautkan ke kode yang benar-benar menjalankannya** (bukan teori).

---

## Mekanisme yang membuat loop ini nyata (terverifikasi di kode)

Sebelum ke cerita, ini 3 "roda gigi" yang berputar — semua sudah ada di kode Anda:

| Roda gigi                         | Kode yang menjalankan                                                                                                                    | Yang terjadi                                                                                        |
|-----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| **A. Simpan hasil AI → RAG**      | `AiRecommendationService.approve()` (baris ~231: `ragEmbeddingService::embedJoltSpec`) **dan** agent AUTO_APPLIED → `channel_jolt_specs` | JOLT baru langsung di-embed ke RAG begitu disetujui/auto-apply                                      |
| **B. Belajar dari hasil publish** | `ChannelPublishService` → `LearningFeedbackService.updateMappingCounters()`                                                              | Publish sukses → `successCount++`; gagal → `failureCount++` (Beta distribution) + EMA `successRate` |
| **C. Perawatan berkala**          | `AiMaintenanceScheduler` (`@Scheduled` — harian 04:00 refresh embedding basi, Minggu 05:00 hapus orphan)                                 | RAG tetap segar & bersih otomatis                                                                   |

**Kunci:** roda A membuat "pengalaman baru" tersedia untuk di-cari; roda B menempelkan "bukti sukses/gagal" ke tiap mapping; roda C menjaga kebersihan. Ketiganya berputar tanpa developer campur tangan.

---

## Latar: perusahaan mulai jual FURNITURE di Shopify

Sebelumnya platform hanya jual **baju** (clothing). Sekarang mulai **furniture** — kategori yang **belum pernah** ada JOLT-nya. Kita ikuti satu produk: **"Kursi Kayu Jati"**.

```json
{
  "name": "Kursi Makan Kayu Jati",
  "description": "Kursi solid kayu jati, finishing natural",
  "price": 890000,
  "sku": "CHR-JATI-01",
  "material": "Teak Wood",
  "assemblyRequired": true,
  "dimensions": "45x50x90cm",
  "weight": 6.5,
  "mainImage": "https://cdn.../kursi.jpg",
  "variants": [{"finish": "Natural", "sku": "CHR-JATI-01-NAT"}]
}
```

---

## 📅 HARI 1 — Produk furniture PERTAMA (RAG masih kosong soal furniture)

### Langkah 1: APM coba dulu (murah, cepat)
`AdaptivePatternMatchingCommandImpl.execute()` → tak ada stored JOLT untuk `shopify/furniture` → masuk `generateNewJoltResponse()`.

APM mencocokkan string:
```
name              → title           conf 0.85  ✅
price             → price           conf 0.91  ✅
sku               → sku             conf 0.95  ✅
material          → ???             conf 0.40  ❌ (tak ada di baju)
assemblyRequired  → ???             conf 0.20  ❌ (field furniture, belum pernah dilihat)
dimensions        → ???             conf 0.30  ❌
weight            → ???             conf 0.45  ❌
mainImage         → ???             conf 0.30  ❌
```
Confidence rata-rata **~0.55**. Beberapa **required target** (`product.title` butuh wrapper) tak terpetakan benar.

### Langkah 2: Cascade mengeskalasi ke AI
Karena confidence rendah + unmapped required → syarat eskalasi terpenuhi (`cascade.enabled && ... unmappedTargetFields non-empty`). **APM angkat tangan, panggil agent.**

### Langkah 3: Agent menalar
```
Tool: search_similar_jolt_specs(shopify, furniture)
  → RAG cari... hanya ketemu JOLT BAJU (similarity 0.62, di bawah kategori beda)
  → "tidak ada furniture, tapi baju Shopify mengajarkan STRUKTUR channel"

Tool: get_channel_schema(shopify)
  → "Semua field di bawah product.{}; images → product.images[*].src; weight → variants[*].grams"

Tool: search_field_mappings(weight, shopify)
  → "weight → product.variants[*].grams, successRate 97%, dipakai 234× (dari era baju!)"

Nalar Claude:
  - title, description → product.title, product.body_html (aturan wrapper)
  - weight → variants[*].grams (bukti 97% dari baju — BERLAKU LINTAS KATEGORI!)
  - material, assemblyRequired, dimensions → belum ada bukti → map ke metafields, tandai UNCERTAIN

Tool: validate_jolt_spec(hasil)
  → passed, tapi 3 field furniture belum terbukti
```

### Langkah 4: Keputusan — confidence sedang → RECOMMENDATION
Confidence akhir **0.78** (bukan ≥0.92). Karena 0.70–0.92 → **`RECOMMENDATION_CREATED`**, bukan auto-apply. Tersimpan di `ai_recommendations` dengan `analysis.warnings: ["material/assemblyRequired/dimensions belum terbukti"]` dan `ragEvidence: ["weight mapping 97% dari clothing"]`.

### Langkah 5: Developer review (human-in-the-loop)
Developer buka Review Queue (P0-D), lihat:
- JOLT usulan + `ragEvidence` (kenapa AI yakin soal weight),
- `warnings` (mana yang AI ragu).

Developer setuju, sedikit koreksi `material → product.metafields.material`, klik **Approve**.

### 🔑 Langkah 6: DI SINILAH LOOP MULAI — hasil disimpan ke RAG
`AiRecommendationService.approve()` berjalan (kode nyata):
1. JOLT disimpan ke `channel_jolt_specs` (`shopify/furniture`, `generatedBy: ai-approved-by:budi`).
2. **Langsung di-embed**: `ragEmbeddingService.embedJoltSpec(saved)` (baris ~231) → masuk `ai_schema_embeddings`.

> **Sekarang RAG PUNYA contoh furniture yang terbukti.** Ini yang tak dimiliki APM: APM tak pernah "mengingat" keputusan ini.

---

## 📅 HARI 3 — Publish "Kursi Kayu Jati" ke Shopify → BERHASIL

Publish memakai JOLT tadi. Shopify menerima. `ChannelPublishService` → `LearningFeedbackService.recordPublishOutcome(success=true)`:

```
Untuk tiap mapping yang dipakai JOLT ini:
  name→product.title       : successCount 0→1
  weight→variants[*].grams : successCount 234→235   (makin kuat!)
  material→metafields...    : successCount 0→1        (mapping BARU dapat bukti pertama)
```

Beta distribution confidence tiap mapping naik. **Mapping furniture yang tadinya "tebakan AI" kini punya bukti sukses nyata.**

---

## 📅 HARI 10 — Furniture KEDUA: "Meja Kayu Jati" (RAG sudah belajar)

Produk baru, kategori sama:
```json
{ "name":"Meja Makan Kayu Jati", "price":2400000, "sku":"TBL-JATI-01",
  "material":"Teak Wood", "assemblyRequired":true, "weight":18.0, ... }
```

### APM coba dulu — dan kali ini BEDA
`execute()` → **stored JOLT untuk `shopify/furniture` SUDAH ADA** (dibuat Hari 1)!
→ `canUseStoredJoltSpec()` = true → pakai **jalur stored** (`buildResponseFromStoredJoltSpec`).

```
Semua field furniture cocok dengan superset schema JOLT furniture:
  name, price, sku, material, assemblyRequired, weight → SEMUA terpetakan
  confidence ~0.90  ✅
```

**AI TIDAK DIPANGGIL.** Tak ada biaya LLM. Tak ada rate-limit. Instan.

> Inilah buah loop: keputusan AI Hari 1 → jadi JOLT tersimpan + data RAG → Hari 10 APM/RAG saja sudah cukup. **Sistem jadi lebih murah & cepat seiring waktu.**

---

## 📅 HARI 30 — Furniture KEDUA PULUH (matang penuh)

- `channel_jolt_specs` punya JOLT furniture matang (confidence tinggi, `usageCount` tinggi).
- Mapping `material → metafields.material`: successCount ~19, successRate ~95%.
- Publish furniture berikutnya: APM instan, confidence 0.90+, **auto** tanpa review.
- Kalau ada varian aneh (mis. furniture impor dengan field `hs_code` baru) → cascade eskalasi ke AI **hanya untuk field baru itu**, sisanya sudah beres.

---

## Kurva pembelajaran (ringkasan)

```
Publish furniture ke-N   │ Siapa menyelesaikan        │ Biaya  │ Confidence
─────────────────────────┼────────────────────────────┼────────┼───────────
#1  (Hari 1)             │ AI (cascade) + review dev   │ LLM    │ 0.78 → approve
#2  (Hari 3)             │ RAG/stored JOLT (AI backup) │ murah  │ 0.85
#10 (Hari 10)            │ APM + stored JOLT           │ gratis │ 0.90
#20 (Hari 30)            │ APM instan, auto            │ gratis │ 0.93
```

**Bandingkan APM murni (tanpa AI):** publish #1, #2, #10, #20 — **SEMUA** kesulitan sama di field furniture (`material`, `assemblyRequired`), **selamanya**, karena APM tak pernah belajar. Developer harus mapping manual **tiap kali ada field baru**.

---

## Kenapa ini "loop", bukan sekadar "sekali pakai"

```
        ┌─────────────────────────────────────────────────┐
        │                                                   │
        ▼                                                   │
  Produk baru ──► APM coba ──► ragu? ──► AI menalar         │
                    │  (murah)      (RAG + aturan + validasi)│
                    │                        │              │
                    ▼ tidak ragu             ▼              │
              pakai stored JOLT      JOLT baru + confidence  │
              (gratis, instan)               │              │
                    ▲                         ▼              │
                    │              approve/auto-apply        │
                    │                         │              │
                    │        ┌────────────────┴───────────┐  │
                    │        ▼                            ▼  │
                    │  embed ke RAG              publish → outcome
                    │  (jadi contoh baru)        successCount/failureCount
                    │        │                            │  │
                    └────────┴──── memperkaya RAG ────────┴──┘
                          (roda A)              (roda B)
```

Setiap putaran: kasus sulit ditangani AI **sekali**, hasilnya disimpan, lalu kasus serupa berikutnya jadi **mudah** (ditangani APM/RAG gratis). Roda B (successRate) membuat mapping yang benar makin dipercaya, yang buruk makin ditinggalkan.

---

## Bukti mekanisme ini ada di kode Anda (bukan janji)

| Klaim di cerita | Kode nyata |
|-----------------|-----------|
| Hasil AI disimpan → langsung di-embed ke RAG | `AiRecommendationService.approve()` → `ragEmbeddingService.embedJoltSpec()` |
| Agent AUTO_APPLIED simpan JOLT | `JoltGenerationAgentService` → `channel_jolt_specs.save()` (terbukti: electronics/toys/garden AUTO_APPLIED 0.95) |
| Publish sukses/gagal → update bukti mapping | `ChannelPublishService` → `LearningFeedbackService.updateMappingCounters()` (successCount/failureCount, Beta) |
| Hari 10 pakai stored JOLT tanpa AI | `AdaptivePatternMatchingCommandImpl.canUseStoredJoltSpec()` |
| RAG tetap segar/bersih otomatis | `AiMaintenanceScheduler` (@Scheduled harian/mingguan) |
| Cascade eskalasi hanya saat ragu | `AdaptivePatternMatchingCommandImpl` cascade block (terbukti: shopify/furniture → `escalatedToAgent:true`) |

---

## Satu kalimat penutup

> **APM tanpa AI = mesin yang mengulang kesalahan yang sama selamanya.**
> **AI + RAG + feedback loop = sistem yang menyelesaikan tiap kesulitan SEKALI, mengingatnya, dan menjadi lebih murah, cepat, dan percaya diri setiap hari.**
