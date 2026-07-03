# Frontend Addendum — Temuan Sesi 2026-07-02

> **Pelengkap** untuk [`FRONTEND-ADMIN-RECOMMENDATIONS.md`](./FRONTEND-ADMIN-RECOMMENDATIONS.md) dan [`SPEC-P0-A-HEALTH-DASHBOARD.md`](./SPEC-P0-A-HEALTH-DASHBOARD.md).
> Dokumen ini merangkum hal-hal **baru yang muncul saat kami membuat agent benar-benar berjalan end-to-end hari ini** — kontrak API yang berubah, kegagalan nyata yang harus ditangani UI, dan konsep yang perlu tercermin di layar. Semua di sini **sudah diverifikasi terhadap kode & uji live**, dan ditandai jelas mana yang **sudah ada** vs **belum dibangun**.

---

## 0. Konteks: apa yang berubah hari ini

Hari ini agent AI berhasil dijalankan penuh (menghasilkan JOLT, AUTO_APPLIED, tersimpan) di beberapa kategori baru (electronics, toys, garden). Dalam prosesnya kami menemukan & memperbaiki serangkaian masalah. Banyak di antaranya **berimplikasi ke UI** — inilah intinya.

---

## 1. ⚠️ Perubahan kontrak API yang WAJIB diikuti frontend

Beberapa respons **berubah bentuk**. Jika frontend sudah mulai dibangun dari doc lama, sesuaikan:

| Endpoint | Perubahan | Aksi frontend |
|----------|-----------|---------------|
| **Semua 6 list** (recommendations, sessions, field-mappings, channel-mappings, channel-jolt-specs, field-semantic-knowledge) | Kini balik **`PageResponse<T>`** `{content, page, size, totalElements, totalPages, hasNext}` — **bukan** array polos | Parse `.content`; pakai `?page=&size=`; render kontrol paginasi |
| `POST /admin/ai/recommendations/{id}/reject` | `reviewedBy` di **query**, `reason` di **BODY** `{"reason":"..."}` | Kirim reason di request body, bukan query param |
| `GET /admin/ai/embeddings/stats` | Field baru: `vectorStore`, `llmProvider`, `llmModel`, `sourceCounts`; `indexName` → `atlasIndexName` | Tampilkan provider aktif (lihat §3.1); hitung coverage dari `counts`/`sourceCounts` |
| `POST /admin/ai/generate-jolt` | Respons AUTO_APPLIED kini menyertakan **`proposedJoltSpec`** (dulu null) + `joltSpecId` | Tampilkan JOLT langsung tanpa fetch kedua |
| `POST /admin/ai/search/test` | Param opsional **`minScore`**; respons memuat `minScore` efektif | Slider threshold (lihat §3.2) |

**Endpoint baru** (belum ada di doc lama): `GET /admin/ai/config`, `GET /admin/ai/embeddings/orphans-count` — sudah dijelaskan di doc utama (P1-L) & spek P0-A.

---

## 2. 🔴 Yang PALING penting ditambahkan: taksonomi error agent

Hari ini `generate-jolt` gagal dengan **beragam sebab yang sangat berbeda**, semua berujung `AGENT_FAILED`. Kalau UI hanya menampilkan "AGENT_FAILED" mentah, operator tak tahu harus berbuat apa. **UI wajib mengkategorikan `errorMessage`** menjadi pesan yang bisa ditindaklanjuti:

| Pola `errorMessage` | Arti sebenarnya | Yang harus UI tampilkan |
|---------------------|-----------------|-------------------------|
| `Retries exhausted: 3/3` / `429` / `RESOURCE_EXHAUSTED` | Kuota/rate-limit LLM habis | "Kuota LLM habis — coba lagi nanti, atau ganti provider/model. (Free-tier: reset harian)" |
| `quota ... limit: 0` | Model tak punya jatah di akun ini | "Model chat ini tak tersedia di plan Anda — ganti `GEMINI_MODEL` (mis. gemini-2.5-flash) / aktifkan billing" |
| `No JSON found in response` / `Agent returned no text output` | Model tak mengeluarkan output terstruktur | "Model gagal menghasilkan JSON valid — masalah sementara, coba ulang" |
| `Map key ... contains dots` | (sudah diperbaiki di backend) | seharusnya tak muncul lagi |
| `AGENT_FAILED` + `ANTHROPIC_API_KEY`/key blank | Key belum di-set | "LLM belum dikonfigurasi — lihat panel Config" |

> **Kenapa krusial:** hampir semua waktu debugging hari ini habis karena "AGENT_FAILED" tak menjelaskan apa-apa. Backend kini menyertakan detail di `errorMessage` (mis. cuplikan output mentah pada "No JSON found") — UI harus **memunculkan & menerjemahkannya**, bukan menyembunyikannya. Terapkan di **P1-F (JOLT Generation Console)** dan **P1-E (Sessions)**.

---

## 3. Penajaman layar yang sudah ada

### 3.1 Health Dashboard (P0-A) — tampilkan Model & "kesehatan LLM"
Temuan hari ini: **model yang dipilih menentukan hidup/matinya agent** (gemini-2.0-flash punya jatah 0 di akun ini; 2.5-flash jalan). Jadi P0-A / Config panel harus **menonjolkan `llmModel`** — bukan hanya provider. Tambahkan indikator: kalau agent baru saja gagal karena kuota, tampilkan badge "LLM: rate-limited" (turunkan dari sesi FAILED terakhir bertipe kuota).

### 3.2 Search Playground (P0-C) — ini terbukti WAJIB, bukan opsional
Hari ini search RAG balik **0 hasil** semata karena threshold `0.70` (kalibrasi OpenAI) terlalu tinggi untuk embedding Gemini (match relevan ~0.65). **Slider `minScore` + tombol "raw (minScore=0)"** adalah alat yang membuat kami menemukan angka benar (0.58). UI ini bukan "nice to have" — tanpa itu, operator akan menyimpulkan "RAG rusak" padahal hanya salah threshold. Tampilkan hint band skor: **relevan ~0.6–0.66, noise ~0.44**.

### 3.3 Recommendations Review (P0-D) — catatan "successRate itu LIVE"
Saat menampilkan detail mapping/rekomendasi, angka **successRate/confidence** harus diambil dari data **live** (endpoint field-mappings / find), **bukan** dari teks/snippet hasil RAG search. Backend kini sengaja **tidak** menaruh successRate di dalam embedding (agar tak basi). Jadi kalau UI menampilkan snippet RAG, jangan tampilkan angka successRate dari situ — ambil dari sumber live. Beri label "successRate (live)".

---

## 4. 🆕 Layar/komponen baru yang disarankan (dari temuan hari ini)

### P1-M · Cascade Outcome Indicator (APM → Agent)
Hari ini kami mengaktifkan cascade dan membuktikan eskalasi. Respons `POST /api/v1/adaptive-pattern-matching/analyze` kini punya field cascade — UI yang memanggil APM harus menampilkannya:

```jsonc
{
  "overallConfidence": 85.0,
  "escalatedToAgent": true,          // APM menyerah → panggil agent?
  "agentStatus": "AUTO_APPLIED",     // AUTO_APPLIED | RECOMMENDATION_CREATED | MANUAL_REVIEW_REQUIRED | AGENT_FAILED | FALLBACK_APM
  "agentJoltSpecId": "6a45...",      // JOLT yang ditulis agent (jika sukses)
  "aiAgentSessionId": "jolt-gen-...",// link ke sesi (P1-E)
  // Phase-2 enrichment (jika aiEnriched):
  "aiEnriched": true, "aiConfidenceDelta": 0.12,
  "aiCorrectedFields": [...], "aiGapsFilled": [...],
  "aiChannelRequiredUnmapped": [...], "aiWarnings": [...]
}
```

**Tampilkan sebagai badge "engine yang menyelesaikan":**
- `escalatedToAgent=false` → **"APM"** (hijau, murah/instan)
- `escalatedToAgent=true, agentStatus=AUTO_APPLIED` → **"AI (auto)"**
- `agentStatus=RECOMMENDATION_CREATED` → **"AI → perlu review"** (link ke P0-D)
- `agentStatus=FALLBACK_APM` → **"AI timeout → fallback APM"** (kuning; agent tak sempat, APM yang pakai) + tooltip: "naikkan `AI_CASCADE_TIMEOUT_SECONDS` atau pakai LLM berbayar"

> **Kenapa penting:** ini membuat perbedaan APM vs AI **terlihat** — operator langsung tahu keputusan ini murah (APM) atau mahal (AI), dan apakah fallback terjadi. Lihat konsepnya di [`MEMAHAMI-AI-VS-APM.md`](../MEMAHAMI-AI-VS-APM.md).

### P1-N · Cascade Settings (read-only) — di dalam Config Panel (P1-L)
Dari `GET /admin/ai/config` → blok `cascade`: `enabled`, `escalationThreshold`, `mode` (sync/async), `escalationTimeoutSeconds`. Tampilkan + hint: mode `sync` bisa memblok respons sampai `escalationTimeoutSeconds` (kami temukan free-tier butuh 90s); mode `async` = APM balas segera, agent menyempurnakan di background. Env: `AI_CASCADE_ENABLED`, `AI_CASCADE_MODE`, `AI_CASCADE_TIMEOUT_SECONDS`.

---

## 5. Konsep yang sebaiknya tercermin di UX (dari diskusi hari ini)

1. **"Kematangan kategori" (feedback loop).** Kategori baru → ditangani AI (mahal) → JOLT tersimpan → publish berikutnya ditangani APM (gratis). UI bisa menampilkan, per (channel, kategori): apakah sudah ada stored JOLT (`channel-jolt-specs`), berapa `usageCount`, kapan terakhir dipakai — agar operator melihat kategori "mendewasa". (Konsep di [`CONTOH-FEEDBACK-LOOP.md`](../CONTOH-FEEDBACK-LOOP.md).)
2. **successRate = bukti dari publish, bukan input manual.** Saat menampilkan health mapping, jelaskan bahwa successRate/successCount berasal dari **hasil publish nyata** (roda B), bukan tebakan. Ini membangun kepercayaan pada angka.
3. **RAG = pencarian makna, bukan ejaan.** Di Search Playground, tampilkan bahwa hasil diurut berdasarkan **similarity makna** (bukan kecocokan huruf) — bantu operator memahami kenapa `weight` bisa menemukan `grams`.

---

## 6. Honest — yang BELUM dibangun (jangan bikin UI-nya dulu)

Supaya frontend tidak membangun layar untuk fitur yang belum ada:

| Fitur | Status | Catatan |
|-------|:---:|---------|
| AI menyarankan **penambahan/perubahan field mapping** untuk memperkaya `channel_field_mappings` (agar APM makin benar) | ❌ **belum dibangun** | Struktur `ProposedFix.fieldMappingChanges` ada, TAPI agent tak memproduksinya & `approve()` tak membuat mapping baru. Jangan bikin UI "review saran mapping baru" dulu. |
| Threshold **per-channel** | ❌ belum | `min-similarity-score` & `auto-apply-threshold` masih global (env). UI cukup tampilkan nilai global (read-only). |
| Peran auth granular (read vs write admin) | ❌ belum | Semua `/admin/**` di balik JWT tunggal; belum ada scope terpisah. |
| Pagination DB-level (cursor) | ⚠️ in-memory | `PageResponse` sudah ada tapi slicing in-memory; cukup untuk skala admin. |
| Field-mapping embedding di-refresh otomatis | ⚠️ manual | Scheduler hanya refresh JOLT_SPEC; field-mapping perlu reindex manual (tak masalah karena successRate dibaca live). |

Kalau salah satu ini dibangun nanti, addendum akan diperbarui.

---

## 7. Prioritas addendum ini

| Prioritas | Item | Alasan |
|-----------|------|--------|
| **P0** | §1 Sesuaikan kontrak API (PageResponse, reject body, stats fields) | UI lama akan rusak tanpa ini |
| **P0** | §2 Taksonomi error agent | Tanpa ini operator buntu saat agent gagal (pelajaran termahal hari ini) |
| **P0** | §3.2 Search Playground + slider threshold | Terbukti wajib — mencegah kesimpulan "RAG rusak" |
| **P1** | §4 P1-M Cascade Outcome Indicator | Membuat APM-vs-AI terlihat + deteksi FALLBACK |
| **P1** | §3.1 Model & kesehatan LLM di dashboard | Model salah = agent mati total |
| **P2** | §5 Konsep kematangan/feedback loop | Nilai edukatif & kepercayaan |

---

### Ringkasan satu kalimat untuk tim frontend
> Selain layar di doc utama, **prioritaskan: (1) sesuaikan bentuk respons yang berubah (paginasi & stats), (2) terjemahkan `AGENT_FAILED` jadi pesan actionable (kuota/model/parse/config), (3) slider threshold di Search Playground, dan (4) badge "engine mana yang menyelesaikan" (APM / AI / fallback)** — semuanya lahir dari masalah nyata yang kami temui saat membuat sistem ini benar-benar jalan hari ini.

---

## 8. Tambahan — 3 kapabilitas backend BARU (Q2/Q3 apiSchema + Jalur C enrich mapping)

> Ditambahkan setelah §1–§7: tiga kemampuan baru diimplementasikan hari ini yang punya implikasi UI langsung.

### 8.1 · Jalur C — AI kini MEMBUAT field mapping baru (P1-G harus dibedakan)
Ketika JOLT di-AUTO_APPLY, agent otomatis membuat `ChannelFieldMapping` baru (source→target dari JOLT) agar APM heuristik membaik. **Terverifikasi live:** kategori baru → muncul mapping `createdBy: ai-agent-v1`, `mappingStrategy: AI_GENERATED`, `verificationTier: UNVERIFIED`, `successCount: 0`.

**Enhancement untuk P1-G (Field Mappings Manager)** — field ini **sudah** ada di respons (`createdBy`, `mappingStrategy`, `verificationTier`, `successCount`, `failureCount`):
- **Badge asal-usul:** bedakan `AI_GENERATED` / `UNVERIFIED` (kuning "AI, belum terverifikasi") vs seeded/verified (hijau). Operator harus tahu mana buatan AI.
- **Kolom bukti (Beta):** tampilkan `successCount` / `failureCount` — "mapping AI ini sudah sukses N kali, gagal M kali". Ini menunjukkan mapping AI **sedang mendapatkan kepercayaan** (roda B). Mapping UNVERIFIED dengan failureCount tinggi = kandidat hapus.
- **Aksi review:** tombol **"Promosikan"** (naikkan verificationTier setelah terbukti) dan **"Hapus"** (buang mapping AI yang salah). Keduanya pakai endpoint yang sudah ada (`PUT /{id}`, `DELETE /{id}`).
- **Filter "buatan AI":** ✅ backend list kini punya param `createdBy` + `verificationTier`. Contoh: `GET /admin/channel-field-mappings?channelId=shopify&createdBy=ai-agent-v1&verificationTier=UNVERIFIED&page=0&size=20` → hanya mapping buatan AI yang belum terverifikasi.

> **Alasan:** Jalur C membuat AI menulis ke tabel yang dipakai APM. Operator butuh **jendela** untuk mengawasi & mengoreksi tulisan AI itu — kalau tidak, mapping salah bisa menyebar diam-diam. Ini human-in-the-loop untuk enrichment.

### 8.2 · Q2/Q3 — layar baru: Channel Category API Schema Manager
Agent kini membaca `apiSchema` (base dari `channel_configuration` + ekstensi per-kategori dari `channel_category_api_schemas`) untuk grounding channel/kategori baru. Data grounding ini perlu **dikelola & di-preview** operator.

**Layar baru P2-O · API Schema Manager** — CRUD sudah tersedia:
> *(kode P2-O dipilih agar huruf tidak bentrok dengan P1-L "Config & Cascade Panel".)*
- **Sumber:** `/api/v1/admin/channel-category-schemas` → `GET` (list), `GET /active`, `GET /{id}`, `POST`, `PUT /{id}`, `PUT /{id}/activate|deactivate`.
- **Preview schema ter-merge (yang DILIHAT agent):** `GET /api/v1/channels/{channelId}/schema?categorySlug={cat}` → mengembalikan `targetSchema` (base + ekstensi ter-merge, mis. 32 field untuk shopify/clothing). Tampilkan sebagai pohon/daftar path target.

> **Alasan:** Kualitas JOLT untuk channel baru kini **bergantung** pada kelengkapan apiSchema. Kalau agent menghasilkan JOLT buruk untuk suatu kategori, operator perlu cek: "apakah apiSchema untuk kategori ini lengkap?" Layar ini + preview memberi jawabannya. Untuk channel BARU tanpa mapping, ini satu-satunya sumber grounding.

### 8.3 · Observability (P1-E) — apiSchema kini terlihat di step
Batas simpan output tool dinaikkan (300→4000 char), jadi step `get_channel_schema` di sesi kini menampilkan **`apiSchema` penuh** (path target yang diterima agent). UI Sessions harus me-render output panjang ini (JSON viewer collapsible). Sesi yang sukses juga akan menghasilkan mapping baru (Jalur C) — pertimbangkan tautkan sesi → mapping yang ia buat.

### 8.4 · Config Panel (P1-L) — tampilkan flag enrichment
✅ `GET /admin/ai/config` → `recommendation.enrichMappings` (env `AI_ENRICH_MAPPINGS`, default true). Tampilkan sebagai status read-only: "AI enrich field mappings: ON/OFF".

### 8.5 · Feedback-loop maturity — sinyal konkret baru
Konsep "kematangan kategori" (§5.1) kini punya metrik nyata: **jumlah mapping `createdBy: ai-agent` per channel** + berapa yang sudah "dipromosikan" (verificationTier naik) + successRate-nya. Dashboard bisa menampilkan tren ini: "AI telah menyumbang N mapping; M terbukti (successRate>0.8)". Ini bukti visual bahwa sistem **benar-benar belajar**.

### 8.6 · Prioritas tambahan
| Prioritas | Item | Alasan |
|-----------|------|--------|
| **P1** | §8.1 P1-G bedakan + review mapping AI (badge, counts, promote/delete) | Human-in-the-loop untuk tulisan AI ke tabel APM |
| **P2** | §8.2 API Schema Manager + preview merged schema | Grounding channel baru bergantung ini |
| **P2** | §8.3 Sessions render apiSchema panjang | Observability grounding agent |
| **P3** | §8.4/8.5 flag enrichment + metrik maturity | Transparansi & bukti pembelajaran |

> **Gap backend (8.1/8.4) — ✅ SUDAH DITUTUP (2026-07-02):** (a) filter `createdBy` + `verificationTier` ditambahkan ke list field-mappings; (b) `enrichMappings` diekspos di `GET /admin/ai/config`. Frontend bisa langsung memakainya tanpa workaround.

---

## ✅ Status implementasi frontend §8 (2026-07-02)

Semua §8 **sudah diimplementasikan** (detail: [`IMPLEMENTATION-PHASES.md`](./IMPLEMENTATION-PHASES.md)):

- **§8.1 (P1-G):** `channel-field-mappings` — tipe diperluas (`createdBy`, `verificationTier`,
  `successCount/failureCount`, strategy `AI_GENERATED` dll); OriginBadge "🤖 AI · Unverified", kolom
  bukti Beta (✓success ✗failure), tombol **Promote** (naikkan tier via PUT), filter **Origin** (AI/human),
  banner Jalur C, stat "AI-made (unverified)". Filter service `createdBy`+`verificationTier`.
  **Bonus fix:** service `listMappings` dulu hanya ambil 20 dari 92 (default page size) — kini `size=100`
  → semua mapping (termasuk buatan AI) tampil.
- **§8.2 (P2-O):** `channel-category-schemas` — tombol **Preview** per baris → modal "Merged schema"
  (target path yang dilihat agent, via `GET /channels/{ch}/schema?categorySlug=`), + link sidebar
  "API Schema Manager".
- **§8.3:** Sessions — apiSchema panjang ter-render (JsonViewer collapsible); sesi COMPLETED punya link
  ke mapping buatan AI channel-nya (deep-link `?channelId=&origin=ai`).
- **§8.4:** Config Panel — badge "AI enrich field mappings: ON/OFF" (guarded — hanya render bila backend
  mengekspos `recommendation.enrichMappings`).
- **§8.5:** Learning Dashboard — seksi "Kematangan AI enrichment (Jalur C)": jumlah mapping AI, dipromosikan,
  UNVERIFIED, avg successRate live, breakdown per-channel.

**Verifikasi:** tsc 0 error · lint 0 warning · 4 mapping AI live tampil dengan badge+Promote · schema preview
& maturity render live (0 page error) · **E2E +7 test** (`ai-console-addendum-p8.spec.ts`). Total suite **42 lulus**.
§6/§8 yang dilarang (UI approve saran mapping, threshold per-channel, auth granular) **tidak** dibangun.
