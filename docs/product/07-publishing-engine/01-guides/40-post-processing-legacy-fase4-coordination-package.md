# Fase 4 — Paket Koordinasi: Rekonsiliasi Katalog Op & Kontrak AI

**Untuk:** pemilik AI agent (JOLT-generation) + pemilik Frontend + ops/DBA.
**Dari:** decommission `rule.type` (lanjutan guide 39; Fase 0–3 sudah selesai).
**Sifat:** dokumen koordinasi + audit. **Belum ada perubahan kode di Fase 4.**

---

## TL;DR — bahayanya JAUH lebih kecil dari dugaan awal

Danger-banner di guide 39 menduga "kontrak AI" berisiko tinggi. **Audit kode membuktikan sebaliknya:**

1. **AI TIDAK meng-emit post-processing `operations[]`.** Agent menghasilkan **JOLT spec** (shift /
   modify-overwrite-beta / default), disimpan di `channel_jolt_specs.joltSpec`. Op post-processing
   (`FOR_EACH`, `ENRICH_*`, dll) **bukan** kosakata yang di-emit AI. → **Tidak ada spec AI di DB yang perlu
   dimigrasi** (kekhawatiran DB di guide 39 §Fase 4 poin 2 = moot).
2. **AI TIDAK membaca `OperationCatalogService`.** Katalog itu (hardcoded, di `channel/service/catalog/`)
   hanya diekspos via REST `GET /api/v1/post-processing/catalog` (`PostProcessingCatalogController`) —
   untuk **FE / manusia / tooling eksternal**, bukan agent. Tidak ada pemanggil Java internal.
3. **Katalog yang DILIHAT AI dibangun dinamis dari config live**, bukan dari `OperationCatalogService`.
   `AgentToolHandlerService.postProcessingOpCatalog()` meng-iterasi `postProcessingRules` tiap system-default
   config → mencatat op dari `rule.getOperations()`. Karena Fase 1–3 sudah menghapus semua `rule.type`,
   **katalog yang dilihat AI otomatis sudah bebas op legacy.**
4. Katalog itu diberikan ke AI sebagai **konteks read-only / saran** saja (note-nya: *"kalau field wajib tak
   punya sumber JOLT dan belum ada rule post-processing, SARANKAN menambah rule post-processing pakai salah
   satu op ini"*) — bukan menu op untuk dieksekusi AI.

**Kesimpulan:** Fase 4 tidak mengubah perilaku AI. Ia hanya (a) merapikan katalog REST yang dilihat
manusia/FE, dan (b) membersihkan sisa `rule.getType()` yang mati di jalur AI. Satu-satunya koordinasi
yang benar-benar diperlukan adalah dengan **pemilik FE** (konsumen endpoint katalog), bukan AI.

---

## ✅ Hasil konfirmasi FE (2026-09-07) — repo `MyReact/free-nextjs-admin-dashboard`

**Kesimpulan: FE TIDAK punya dependensi keras pada 6 op legacy → 4a AMAN dijalankan.**

FE **memang** memanggil `GET /post-processing/catalog` (`aiAdmin.service.ts:271`, dipakai
`RecommendationsReviewQueue.tsx` untuk menampilkan deskripsi op pada panel "post-processing gaps").
Tapi semua referensi ke nama op legacy hanyalah **tampilan/dokumentasi**, bukan kontrak keras:

| Referensi FE | Sifat | Efek bila BE hapus op legacy |
|---|---|---|
| `EditRuleModal.tsx:96-100` | **help-text** contoh di editor rule | Tak break. Editor menyimpan `operations[]` via **textarea JSON bebas** (`JSON.parse`, save `{name,enabled,operations}`) — bukan dropdown. |
| `channel-configuration.ts:15` | `type: string` + **komentar** contoh | Tak break — tipe `string` bebas, bukan union ketat. |
| `opCatalogGlossId.ts:69-79` | **glossary display** (ID) per opCode | Tak break — didokumentasikan "display aid, not the contract"; op tanpa entri fallback ke teks EN. Entri legacy jadi mubazir (tak pernah di-lookup). |

**Catatan bug FE (temuan sampingan, perlu diperbaiki FE — bukan blocker):** help-text di
`EditRuleModal.tsx:96-100` **stale/salah** — tertulis *"Each operation needs a `type` field — e.g.
ENRICH_IMAGES, CONCAT_INTO, GENERATE_OPTIONS"*. Padahal: (a) operasi memakai kunci **`op`**, bukan `type`
(yang `type` adalah field rule LEGACY yang sedang dipensiunkan); (b) ENRICH_IMAGES/GENERATE_OPTIONS adalah
**rule-type legacy**, bukan op. Harusnya: *"Each operation needs an `op` field — e.g. FOR_EACH, COPY_PATH,
EXTRACT_DIMENSIONS."*

**Follow-up FE (nice-to-have, non-blocking 4a):**
1. Perbaiki help-text `EditRuleModal.tsx` (`type`→`op`, contoh op modern).
2. (Opsional) hapus 6 entri legacy di `opCatalogGlossId.ts` + rapikan komentar `channel-configuration.ts:15`.
3. (Fase 5) field `type` masih ada di model rule FE (`channel-configuration.ts`) — koordinasikan saat field
   `type` dihapus dari entity BE.

---

## Temuan audit (bukti)

| Klaim | Bukti (file:baris) |
|---|---|
| AI emit JOLT, bukan post-processing ops | `AgentToolHandlerService:77` ("JOLT shift spec"), `:417/432/443` (shift-spec handling); `ChannelJoltSpec.joltSpec` (`channel_jolt_specs`) |
| AI tak baca `OperationCatalogService` | grep `OperationCatalogService` di `adaptivepattern/` = 0; pemanggil hanya `PostProcessingCatalogController` (REST) |
| Katalog yang dilihat AI = data-driven | `AgentToolHandlerService.postProcessingOpCatalog()` (`:471`) baca `findAllSystemDefaults().postProcessingRules[].operations` |
| Katalog = saran, bukan eksekusi | `postProcessingOpCatalogNote` (`:267`) |
| `OperationCatalogService` mengiklankan 6 op legacy | `register("ENRICH_IMAGES"/"ENRICH_MEDIA"/"ENRICH_VARIANTS"/"GENERATE_OPTIONS"/"LINK_MEDIA_TO_CHOICES"/"MAP_DIMENSIONS", …)` |

### Divergensi katalog ↔ engine (perlu dibereskan sekalian)
`OperationCatalogService` (33 op) **tidak sinkron** dengan op yang benar-benar ditangani `executeOperation`:
- **6 op HANTU** (diiklankan, TAK ditangani engine sebagai op — dulu hanya rule-`type`, kini benar-benar
  tak ada): `ENRICH_IMAGES, ENRICH_MEDIA, ENRICH_VARIANTS, GENERATE_OPTIONS, LINK_MEDIA_TO_CHOICES,
  MAP_DIMENSIONS`. Jika di-emit sebagai op → hit `default` → WARN "Unknown atomic operation" (no-op).
- **7 op NYATA tapi TAK terdaftar** (ditangani engine, tak diiklankan): `CONCAT_INTO, REMOVE_PATH,
  BUILD_OPTIONS_FROM_FLAT_KEYS, BUILD_TIER_VARIATION, BUILD_MODEL, BUILD_METAFIELD_LIST,
  BUILD_VARIANT_IMAGE_UPLOAD`.

### Sisa `rule.getType()` di jalur AI (leftover Fase 2 — Fase 2 hanya menggarap `AdaptivePatternMatchingCommandImpl`)
- `AgentToolHandlerService:484-485` — cabang `else if (rule.getType() != null)` di `postProcessingOpCatalog()`. **Mati** untuk config modern.
- `AiRecommendationService:180` (`firstOp`) — `return rule.getType()` sebagai fallback saat rule tak punya `operations[]`. **Mati** untuk config modern.
- (BUKAN legacy, JANGAN sentuh: `AgentToolHandlerService:770` = `constraint.getType()` field-type; `KnowledgeBasedFieldMatchingService:1038`, `PatternMatchingAgentService:347` = `field.getType()`.)

---

## Ruang lingkup Fase 4 (usulan, 3 sub-tugas)

### 4a — Rekonsiliasi `OperationCatalogService` (REST/FE) ⚠️ koordinasi FE
Hapus 6 registrasi op HANTU; (opsional) tambah 7 op NYATA yang hilang, atau tandai internal.
- **Risiko:** hanya konsumen `GET /api/v1/post-processing/catalog` (FE / dok / tooling). **Bukan AI.**
- **Prasyarat:** konfirmasi pemilik FE (lihat checklist).

### 4b — Bersihkan leftover `rule.getType()` di jalur AI (lanjutan Fase 2)
Hapus cabang legacy di `AgentToolHandlerService:484-486` + `AiRecommendationService.firstOp:180`.
- **Risiko:** ~nol (mati untuk config modern; katalog-AI tetap data-driven).
- **Bukan** kontrak-changing.

### 4c — Migrasi spec AI di DB: **TIDAK DIPERLUKAN**
AI tak pernah emit post-processing ops → tak ada `channel_jolt_specs` yang memakai op legacy. (Audit
konfirmasi di §Skrip.)

---

## Checklist pertanyaan untuk pemilik AI agent + FE

**Untuk pemilik AI agent (konfirmasi, kode sudah mengindikasikan "aman"):**
- [ ] Konfirmasi agent **hanya** meng-emit JOLT spec (+ rekomendasi teks), **tidak pernah** menulis
      `postProcessingRules.operations[]` ke config/DB. (Kode: ya.)
- [ ] Adakah **prompt/system-prompt di LUAR repo** (template di service lain, config agent eksternal, few-shot
      examples) yang **meng-hardcode nama op post-processing** termasuk yang legacy? Jika ada, perbarui di
      sana juga. (Repo: katalog-AI data-driven, jadi seharusnya tidak — tapi hanya pemilik yang tahu
      out-of-repo.)

**Untuk pemilik FE / tooling:**
- [x] **TERJAWAB (lihat §Hasil konfirmasi FE):** FE memanggil endpoint tapi hanya untuk display; **tidak**
      mengandalkan 6 op legacy secara keras (help-text + glossary + komentar saja). **4a aman.**
- [ ] Apakah FE ingin 7 op nyata yang hilang **ditambahkan** ke katalog (biar admin bisa memakainya saat
      menulis rule manual via `EditRuleModal`), atau biarkan internal? (Keputusan produk — belum dijawab.)

**Untuk ops/DBA:**
- [ ] Jalankan skrip audit di bawah pada **staging & prod**: pastikan **0** `channel_configurations`
      `postProcessingRules[*].type` (caveat Fase 3). Jika ada, migrasi ke `operations[]` (pakai pemetaan
      guide 39 §4) — rule ber-`type` kini di-WARN+skip oleh engine.

---

## Skrip audit (DB, read-only)

```javascript
// mongosh — pada tiap environment (staging, prod)

// 1) Config ber-`type` legacy yang tersisa (caveat Fase 3 — HARUS 0)
db.channel_configurations.aggregate([
  { $unwind: "$postProcessingRules" },
  { $match: { "postProcessingRules.type": { $ne: null } } },
  { $project: { channelId: 1, ruleName: "$postProcessingRules.name",
               legacyType: "$postProcessingRules.type",
               hasOperations: { $gt: [ { $size: { $ifNull:["$postProcessingRules.operations",[]] } }, 0 ] } } }
]);

// 2) Sanity: spec AI TIDAK memakai op post-processing (harus kosong).
//    joltSpec hanya berisi {operation: shift|modify-overwrite-beta|default}; cari "op" post-processing = anomali.
db.channel_jolt_specs.find(
  { "joltSpec.op": { $in: ["ENRICH_IMAGES","ENRICH_MEDIA","ENRICH_VARIANTS",
                            "GENERATE_OPTIONS","MAP_DIMENSIONS","LINK_MEDIA_TO_CHOICES","FOR_EACH"] } },
  { channelId:1, categoryId:1 }
);
```
```bash
# 3) Apakah endpoint katalog dipakai (grep akses log / FE repo, di luar repo BE ini)
#    Cari pemanggil: GET .../post-processing/catalog
```

---

## Rencana eksekusi aman (setelah konfirmasi)

1. **4b dulu** (leftover getType di jalur AI) — nol risiko, tak butuh koordinasi. Test:
   `AgentToolHandlerService` op-catalog masih benar untuk config modern; `AiRecommendationService.firstOp`
   mengembalikan op pertama dari `operations[]`.
2. **4a** setelah pemilik FE konfirmasi — hapus 6 op hantu di `OperationCatalogService` (+ opsional tambah 7
   nyata). Test: `getAllSpecs()` tak lagi memuat op legacy; endpoint 200.
3. **4c** = audit-only (skrip di atas). Jika DB bersih → tak ada aksi.
4. Terakhir **Fase 5** (hapus field `type` di entity) — setelah 4a/4b + audit DB bersih.

**Rollback:** tiap sub-tugas satu commit terpisah, reversible. 4b/4a tak menyentuh data.

## Definition of Done (Fase 4)
- [ ] Pemilik FE konfirmasi tak ada dependensi pada 6 op legacy di endpoint katalog.
- [ ] Pemilik AI konfirmasi tak ada prompt out-of-repo yang meng-hardcode op legacy.
- [ ] `OperationCatalogService` sinkron dengan op yang benar-benar ditangani engine (0 hantu).
- [ ] `rule.getType()` legacy hilang dari `AgentToolHandlerService` + `AiRecommendationService`.
- [ ] Audit DB staging/prod: 0 `postProcessingRules[*].type`; 0 `channel_jolt_specs` beranomali.
- [ ] Semua test hijau.

**Kaitan:** guide 39 (Fase 0–3) · [[tiktok-reverse-sync-progress]] tidak terpengaruh (reverse `ReverseOps` = interpreter terpisah).
