# AI Admin Console — Rencana Fase Implementasi Frontend

> Turunan dari [`FRONTEND-ADMIN-RECOMMENDATIONS.md`](./FRONTEND-ADMIN-RECOMMENDATIONS.md)
> (12 layar, prioritas P0→P2) menjadi **3 fase implementasi** yang bisa dikirim
> bertahap. Setiap fase adalah unit yang koheren & bisa dipakai sendiri.
>
> **Home layar Phase 1–2:** `src/app/(admin)/platform-admin/ai-*` (route tipis) →
> komponen di modul `src/modules/ai-admin/`. Layar Phase 3 (data managers) mengikuti
> konvensi platform-admin (`_types/_services/_components`).
> **Sidebar:** grup **"AI Console"** di `src/layout/AppSidebar.tsx` — **12 item** (P0×4, P1×5, P2×3).
>
> **✅ SEMUA 3 FASE SELESAI (2026-07-02).** 22 e2e test lulus (`npm run test:e2e`).

---

## Ringkasan fase

| Fase | Fokus | Layar | Status |
|------|-------|-------|--------|
| **Phase 1** | P0 · Operational console (cegah salah-diagnosa, kosong senyap, threshold salah, keputusan buta) | P0-A, P0-B, P0-C, P0-D | ✅ **SELESAI (2026-07-01)** |
| **Phase 2** | P1 · Observability & tuning | P1-E, P1-F, P1-G, P1-H, P1-L | ✅ **SELESAI (2026-07-01)** |
| **Phase 3** | P2 · Supporting data managers | P2-I, P2-J, P2-K | ✅ **SELESAI (2026-07-02)** |

---

## ✅ Phase 1 — P0 · Critical Operational Console (SELESAI)

Fondasi bersama + 4 layar P0. Semua kontrak diverifikasi terhadap backend live
(`/api/v1/admin/ai/*`, probe 2026-07-01) — bukan mock.

### Fondasi bersama — `src/modules/ai-admin/`
- `types/common.ts` — `SourceType`, `PageResponse<T>`, **`AiApiError`** (klasifikasi
  `server_down` / `auth` / `not_found` / `http` → pesan yang bisa ditindaklanjuti).
- `types/health.ts`, `types/rag.ts`, `types/recommendation.ts` — kontrak respons nyata.
- `services/aiAdmin.service.ts` — wrapper seluruh endpoint `/admin/ai/*`; menangani
  **dua kontrak error** (job endpoint 200+status body vs Spring error JSON), deteksi
  server-down, Bearer JWT opsional, `buildQs`.
- `components/shared/` — `ui.tsx` (Card, Badge, StatTile, ScoreBar, Toast, ConfirmDialog,
  ErrorNotice, InfoBanner, ChannelBadge, PageHeader, relative-time) + `icons.tsx`.

### Layar
| Kode | Layar | Route | Komponen |
|------|-------|-------|----------|
| **P0-A** | AI Health & Config Dashboard | `/platform-admin/ai-health` | `components/health/AiHealthDashboard.tsx` |
| **P0-B** | RAG Index Management | `/platform-admin/ai-rag-index` | `components/rag-index/RagIndexManagementPage.tsx` |
| **P0-C** | RAG Search Playground | `/platform-admin/ai-search` | `components/search/RagSearchPlayground.tsx` |
| **P0-D** | Recommendations Review Queue | `/platform-admin/ai-recommendations` | `components/recommendations/RecommendationsReviewQueue.tsx` |

### Poin desain kunci yang sudah dipenuhi
- **P0-A:** 3 panggilan paralel + render bertahap; partial-failure per kartu; deteksi
  server-down (halaman penuh); banner degradasi (embedding-off / agent-off / RAG-kosong);
  auto-refresh 30 dtk + "diperbarui X lalu"; **tidak ada 0/kosong tanpa konteks**.
  (Spec penuh: [`SPEC-P0-A-HEALTH-DASHBOARD.md`](./SPEC-P0-A-HEALTH-DASHBOARD.md).)
- **P0-B:** coverage per sourceType (embedded vs live), Reindex per-tipe/ALL dengan hasil
  `total/indexed/skipped/failed`, Scan orphan (read-only on-demand), Cleanup dengan
  **konfirmasi + estimasi dampak**; job status dibaca dari body (bukan HTTP code saja).
- **P0-C:** query bebas + dropdown sourceType/channel + slider limit; **slider minScore
  0–1 dengan RAW mode**; ScoreBar heatmap; indikator config-aktif vs override; hint band
  skor (relevan ~0.65, noise ~0.44); penjelasan "0 hasil" (threshold vs index kosong).
- **P0-D:** antrian + filter status/channel + pagination; drawer detail menampilkan
  **triggerContext (kenapa) · analysis.rootCause/affectedFields/missingRequirements ·
  ragEvidence (bukti grounding) · warnings (banner risiko) · proposedFix (JSON viewer)**;
  Approve (reviewedBy wajib + konfirmasi) · Reject (reason di BODY); Trigger Analysis per channel.

### Verifikasi
- `tsc --noEmit` → 0 error di file baru. `next lint` → 0 warning/error.
- Keempat route render **HTTP 200** tanpa error runtime (dev server, backend live).
- Verifikasi visual browser sungguhan (Playwright) → 4 layar render + interaksi OK, 0 page error.
- **E2E test permanen:** `tests/e2e/ai-console.spec.ts` (10 test, backend di-mock → deterministik,
  tak butuh backend live). Jalankan: `npm run test:e2e`. Config: `playwright.config.ts` (auto-start
  dev server). Lihat `tests/e2e/README.md`.

---

## ✅ Phase 2 — P1 · Observability & Tuning (SELESAI)

Menambah metode service `listSessions`/`getSession`/`generateJolt`, tipe `session.ts`, dan
shared UI baru (`JsonViewer`, `KeyValue`, `classifyLlmError`) + 4 layar. Kontrak diverifikasi
ke backend live (2026-07-01).

| Kode | Layar | Route | Komponen |
|------|-------|-------|----------|
| **P1-E** | Agent Sessions / Observability | `/platform-admin/ai-sessions` | `components/sessions/AgentSessionsPage.tsx` |
| **P1-F** | JOLT Generation Console | `/platform-admin/ai-generate` | `components/generate/JoltGenerationConsole.tsx` |
| **P1-G** | Field Mappings Manager | `/platform-admin/channel-field-mappings` | **sudah ada** — ditautkan di grup sidebar AI Console |
| **P1-H** | Learning Dashboard | `/platform-admin/ai-learning` | `components/learning/LearningDashboard.tsx` |
| **P1-L** | Config & Cascade Panel | `/platform-admin/ai-config` | `components/config/AiConfigPanel.tsx` |

### Poin desain kunci
- **P1-E:** channel selector (list `sessions` **wajib** `channelId`); tabel status/grounding/durasi/token;
  drawer detail = ragContext (bukti grounding) + agentSteps + summary; FAILED → error diklasifikasi
  (kuota/config/key). Deep-link `?sessionId=` dari P0-D (detail tak butuh channelId).
- **P1-F:** editor JSON produk (validasi live) + channel/category; async 10–20 dtk (spinner, tak blok);
  hasil = status (AUTO_APPLIED/RECOMMENDATION_CREATED/MANUAL_REVIEW/AGENT_FAILED) + proposedJoltSpec
  (JSON viewer) + link ke sesi; AGENT_FAILED → penyebab yang bisa ditindaklanjuti (kuota → coba Anthropic).
- **P1-H:** KPI (avg success, total/low mappings, pending, index size) + day selector 7/30/90; empty-state
  eksplisit untuk `channels`/`calibration` (sering kosong).
- **P1-L:** config efektif read-only (provider + `keyConfigured`, threshold penentu perilaku, cascade
  APM-only/on, agent runtime) + hint env var per nilai.

### Verifikasi
- `tsc --noEmit` 0 error di file baru · `next lint` 0 warning.
- 4 layar render dengan data live (Playwright), 0 page error.
- **E2E:** `tests/e2e/ai-console-phase2.spec.ts` (8 test) + fixtures mock sessions/generate.
  Total suite **18 test lulus** (`npm run test:e2e`).

---

## ✅ Phase 3 — P2 · Supporting Data Managers (SELESAI)

P2-I & P2-J sudah lengkap sebagai halaman platform-admin — ditautkan ke grup sidebar AI Console.
P2-K dibangun baru mengikuti konvensi platform-admin (`_types/_services/_components`).

| Kode | Layar | Route | Status |
|------|-------|-------|--------|
| **P2-I** | JOLT Specs Manager | `/platform-admin/channel-jolt-specs` | sudah ada (page+service+modals) → ditautkan |
| **P2-J** | Semantic Knowledge Manager | `/platform-admin/field-semantic-knowledge` | sudah ada (page+service+modals) → ditautkan |
| **P2-K** | Value Mappings Manager | `/platform-admin/channel-value-mappings` | **baru** — CRUD nilai master→channel |

### P2-K desain
- Sumber: `GET/POST/PUT/DELETE /admin/channel-mappings`. Dokumen:
  `{ channelType, masterFieldName, channelFieldName, mappings[{masterValue,channelValue,channelLabel}],
  fallbackStrategy }` (PROMPT_USER/USE_CLOSEST/FREE_TEXT).
- List + filter channel + search (field/value); baris expandable → chip pasangan master→channel; stats
  (total mappings, total values, channels covered).
- Modal add/edit: header field (channel/master/channel field; channel+master immutable saat edit) +
  editor baris dinamis (tambah/hapus pasangan) + fallback strategy (dengan deskripsi). Delete pakai konfirmasi.
- Konvensi platform-admin (`_types/_services/_components/page.tsx`) — sejajar P2-I/P2-J.

### Verifikasi
- `tsc --noEmit` 0 error · `next lint` 0 warning.
- Data-path live: **21 assertion lolos** (list+filter shape, entry fields, fallback enum; P2-I/P2-J reachable).
- P2-K render dengan data live (15 mappings, 139 values, 6 channels), 0 page error.
- **E2E:** `tests/e2e/ai-console-phase3.spec.ts` (4 test: list+expand, filter, create+POST, delete+confirm).
  Total suite **22 test lulus** (`npm run test:e2e`).

---

## Catatan integrasi (berlaku semua fase)
- **Base URL:** `NEXT_PUBLIC_BACKEND_API_URL` (fallback `http://localhost:8888/labamap/api/v1`).
- **Auth:** `/admin/**` di belakang OAuth2 Resource Server (JWT Bearer). Service melampirkan
  `Authorization: Bearer` bila token ada di localStorage; whitelist backend saat ini longgar.
- **Pagination:** 6 list endpoint konsisten `?page=&size=` → `PageResponse`.
- **Async:** reindex & generate-jolt lambat (API eksternal) → optimistic UI + polling.
