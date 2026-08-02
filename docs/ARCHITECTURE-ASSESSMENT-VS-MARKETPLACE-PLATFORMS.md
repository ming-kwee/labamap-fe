# Penilaian Arsitektur Labamap vs Platform Marketplace Komersial

> Analisis arsitek — jujur, termasuk sisi yang kurang. Berbasis pembedahan **jalur katalog/publish**
> Labamap (bukan brosur).
>
> **Disclaimer cakupan:** yang dinilai adalah **listing/publish path**. Belum termasuk inventory-sync,
> order-routing, repricing, WMS — yang justru inti operasional platform komersial.

> ### ⟳ Revisi 2026-07-28 (setelah analisis mendalam + data runtime)
> Penilaian awal (2026-07-27) ditulis **sebelum** saya membaca guardrail auto-apply dan **sebelum**
> memeriksa data runtime. Tiga klaim awal saya **KELIRU** dan dikoreksi di sini:
> 1. **"Bug sesi ini disebabkan blind-spot AI-generation."** ❌ — trace membuktikan produk yang gagal
>    memakai **seed hand-written** (`generated_by=DefaultJoltSpecDataLoader`), **bukan** spec AI. Bug-nya
>    adalah masalah **layering pipeline** (flag support-field, staging kurang, JOLT-independence), yang ada
>    *terlepas* spec-nya AI atau tulisan tangan. Jadi bukan bukti AI menginduksi bug.
> 2. **"AI dipakai sebagai auto-apply pilot yang berisiko."** ❌ — data menunjukkan auto-apply **berlapis
>    jaga** dan dalam praktik sistem **sudah co-pilot** (spec yang dipakai = seed + human-approved).
> 3. **"Provider LLM tak andal (23% gagal)."** ❌ — itu **historis Gemini free-tier** (rate-limit);
>    sekarang DeepSeek Flash.
>
> Yang **tetap valid**: beban kognitif dari kedalaman lapisan, dan kontrak implisit BFF↔sync-service.

---

## 1. Taruhan arsitektur yang mendefinisikan Labamap

Satu keputusan besar membedakan Labamap dari semua platform lain:

> **Transformasi master→channel bersifat deklaratif & data-driven (JOLT spec + post-processing pipeline
> + metadata workflow), dengan JOLT spec bisa di-*generate LLM* per-kategori (RAG + validasi berlapis +
> auto-apply ter-gate) — tapi jalur runtime yang sebenarnya dipakai tetap deterministik.**

**Koreksi dari versi awal:** saya sebelumnya bilang "sebagian besar kompleksitas diinduksi taruhan
AI-generation". Itu **berlebihan**. Sebagian besar lapisan di bawah ini **inheren** ke adaptasi marketplace
(media pre-upload→create→write-back, resolusi atribut-kategori, per-model variant) — ada atau tidak ada AI.
AI-generation menambah **satu** lapisan (JOLT-independence), bukan menginduksi semuanya.

Lapisan pipeline satu publish (yang harus dipahami untuk men-debug 1 field):

```
masterProduct
  → merge channelData / masterOverrides / variantOverrides (Step-2)
  → resolve kategori (UnifiedCategoryResolver)
  → resolve JOLT spec (findWithFallback + calculatePriority)
        org+category > system+category > org+default > system+default(seed)
  → JOLT transform
  → stage reserved _-keys (_sourceImages, _channelCategoryId, _categoryAttributes, _resolvedLogistics…)
  → post-processing pipeline (FOR_EACH, BUILD_TIER_VARIATION, BUILD_MODEL, COPY_PATH, BUILD_ATTRIBUTE_LIST…)
  → buildChannelAttributes (filter isSupportField, skip _-keys)
  → [sync-service] metadata workflow (body-reshape-to, response-update-to: updatePaths/transformPaths)
  → panggilan API channel (HMAC sign, upload media, create, write-back id)
```

Beban nyatanya: memperbaiki **satu** field bisa menyentuh 5–7 lapisan ini. Itu **beban kognitif yang riil**
— tapi berasal dari kedalaman lapisan, **bukan** dari AI.

---

## 2. Perbandingan dengan platform komersial

| Dimensi                 | Labamap                                                            | Sellbrite         | BigSeller                   | Linnworks          | ChannelAdvisor/Rithum |
|-------------------------|--------------------------------------------------------------------|-------------------|-----------------------------|--------------------|---|
| Transformasi            | **JOLT + post-proc DSL**, opsional AI-draft                        | Template UI       | Per-channel hardcoded (SEA) | Adapter + rules UI | Feed/rule engine + ML taksonomi |
| Determinisme runtime    | **Deterministik** (spec seed/approved); AI hanya menyusun kandidat | Deterministik     | Deterministik               | Deterministik      | Deterministik |
| Onboarding channel baru | Data + (opsional) AI-draft → review                                | Tim engineer      | Tim engineer                | Adapter + config   | Tim integrasi besar |
| Data-driven purity      | **Ekstrem** (semua di Mongo)                                       | Rendah            | Rendah–sedang               | Sedang–tinggi      | Tinggi |
| Kematangan              | Muda, evolving                                                     | Matang (SMB)      | Matang (SEA)                | Sangat matang      | Paling matang (enterprise) |
| Cakupan produk          | Listing/publish (yg terlihat)                                      | Listing+inv+order | Listing+inv+order+ship      | Full ops + WMS     | Full ops + marketing + fulfillment |

**Koreksi baris "Determinisme":** versi awal menandai Labamap "non-deterministik (LLM)". **Salah** — runtime
memakai spec yang **sudah tersimpan & di-review** (seed atau `ai-approved-by:*`). LLM hanya *mengusulkan*
kandidat yang harus lolos gate + (kini) cek kelengkapan sebelum jadi otoritatif. Runtime-nya **deterministik**.

**Yang tetap benar:** tak satu pun kompetitor meng-generate transformasi dengan AI; Labamap **lebih
ambisius** di dimensi ini — tapi memakainya sebagai *co-pilot ter-review*, bukan pilot buta.

---

## 3. Verdict (direvisi): canggih & terjaga; biayanya beban kognitif, bukan kecerobohan AI

### Canggih & terjaga — tulus
- Resolusi JOLT category-aware dengan fallback priority (`org+cat > sys+cat > org+default > seed`) — elegan.
- **Capability enrichment** (resolve logistik/brand/attribute-tree live) — bagian *tersulit* integrasi.
- OAuth penuh + token refresh + webhook + enkripsi kredensial AES-GCM — production-grade.
- Pre-flight gate (fail-fast per-field), alur dua-langkah Shopee — benar.
- **Auto-apply AI ter-gate berlapis** (lihat §5): org-scoped, protected-skip, no-downgrade,
  resolved-category-only, conflict/compile/semantic, confidence ≥ 0.92 — dan kini **completeness-gate +
  kill-switch**. Ini rekayasa keselamatan yang **matang**, bukan "AI menulis semuanya".

### Biaya nyata — juga tulus
1. **Beban kognitif dari kedalaman lapisan.** Memperbaiki 1 field menelusuri 5–7 lapisan. Ini biaya
   **inheren** dari pipeline berlapis, bukan induksi AI. **Obatnya observability**, bukan membuang lapisan.
2. **Distributed monolith / kontrak implisit.** BFF (Labamap) & sync-service = dua service dengan kontrak
   **tak eksplisit** (metadata workflow, `transformPaths`, aturan support-field) menyebar lintas-repo. Sesi
   ini banyak habis menebak semantik `transformPaths` dan error "neither a List nor a Map". **Masih valid.**
3. **Data model = DSL tanpa tooling.** Katalog op, JOLT spec, metadata workflow adalah *bahasa* yang
   disimpan sebagai data — layak diperlakukan sebagai bahasa (versioning/test/golden). **Masih valid.**

---

## 4. Bug sesi ini — DIKLASIFIKASI ULANG (koreksi)

Versi awal menyebut ini "gejala blind-spot AI". **Trace membuktikan sebaliknya:** produk yang gagal
memakai **seed** (`category_id=default`, `generated_by=DefaultJoltSpecDataLoader`), bukan spec AI. Akar
sebenarnya = **layering pipeline**, yang muncul apa pun asal spec-nya:

| Bug | Akar SEBENARNYA | Kelas (dikoreksi) |
|---|---|---|
| `CategoryId is required` | `category_id` tak diproduksi JOLT **maupun** post-processing (belum ada rule) | gap pipeline (bukan AI) |
| `Image is required` (1) | atribut `image` tak dibangun untuk spec yang tak memetakannya | gap pipeline |
| `image_id_list` = URL | BFF mengisi target write-back milik sync-service | **kontrak implisit BFF↔sync** |
| `Image is required` (2) | `image` di-flag `isSupportField=true` → dikecualikan dari body | **flag salah** |
| `Attribute mandatory 200134/200162` | tak ada builder `attribute_list` dari channelData + support-excluded | gap pipeline |

Semua diperbaiki lewat **post-processing deterministik** — bukan "menambal AI", melainkan **melengkapi
pipeline**. Ini memperkuat poin sebenarnya: **kekuatan sistem ada di lapisan deterministiknya**, dan AI
adalah pelengkap ter-review, bukan sumber bug.

Prinsip yang mengkristal (tetap valid & berguna):
- Field yang **nilainya diketahui BFF saat publish** (category_id) → **BFF isi** (post-processing).
- Field yang **lahir dari panggilan channel** (image_id, item_id, model_id) → **BFF sediakan placeholder;
  sync-service isi** via `updatePaths.to`. Mengisinya di BFF = anti-pattern.
- Data merchant yang **benar-benar kosong** → **jangan dipalsukan**; fail-fast (pre-flight). Tapi
  **verifikasi dulu**: weight/price ternyata **ada di varian** (item-level kosong) → itu **derive**, bukan
  data hilang. (Trace yang mengoreksi asumsi ini.)

---

## 5. Temuan empiris (data runtime, 2026-07-27) — ini yang mengoreksi opini

**`channel_jolt_specs` (12 spec yang dipakai runtime):**
| generated_by | jumlah | arti |
|---|---|---|
| `DefaultJoltSpecDataLoader` | 7 | seed deterministik (per channel) |
| `ai-approved-by:ming` | 4 | AI-draft → **disetujui manusia** (kategori clothing) |
| `adaptive-pattern-matching` | 1 | pattern matching |
| **`ai-agent-v1` (auto-apply murni)** | **0** | — |

→ **Nol spec AI auto-apply murni di runtime.** Sistem **sudah** co-pilot dalam praktik.

**`ai_agent_sessions` (93):** 77% COMPLETED, 23% FAILED — **~95% kegagalan = API Gemini free-tier**
(429/retry/404), **historis**; provider sekarang DeepSeek Flash. Bukan cerminan kompetensi AI.

**`ai_recommendations` (15):** 73% APPROVED oleh manusia → co-pilot berfungsi sehat.

**Guardrail auto-apply (terverifikasi di kode):** org-scoped (blast radius = 1 org/1 kategori) · tak
menimpa spec human-owned · tak menurunkan confidence · tolak kategori "default" · gate
conflict/compile/semantic · confidence ≥ 0.92.

---

## 6. Apakah menerapkan AI itu kesalahan? — Tidak

Berdasarkan data + kode, bukan opini:
- AI dipakai sebagai **penyusun-draft + saran** (73% disetujui manusia) — **penggunaan yang menang** dan
  memang tempat LLM unggul di domain ini.
- **Runtime bersandar deterministik**; AI tak pernah jadi otoritas tanpa gate + (kini) cek kelengkapan.
- Yang perlu dijaga bukan "AI atau tidak", tapi **keandalan provider** (sudah ditangani: DeepSeek) dan
  **gate objektif** (ditambah sesi ini).

Peran yang tepat (dan sudah/kini diterapkan): **AI = co-pilot di setup-time (draft spec) + diagnostic-time**,
deterministik untuk eksekusi runtime. Kekhawatiran keras di versi awal **tidak sesuai** dengan bagaimana
sistem sebenarnya berjalan.

---

## 7. Rekomendasi (status diperbarui)

| #   | Rekomendasi                                                                                                                            | Status                                                                                     |
|-----|----------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| 1   | **Golden-payload test per channel/kategori** — assertion "master X + kategori Y → body HARUS = Z". Perbaikan tunggal paling berdampak. | ⬜ **belum** (prioritas #1)                                                                 |
| 2   | **Observability pipeline** — lihat output antar-tahap tanpa publish live.                                                              | ✅ **selesai** — publish-trace inspector (`/publish/trace`)                                 |
| 3   | **Gate objektif sebelum auto-apply** — jangan andalkan confidence LLM saja.                                                            | ✅ **selesai** — completeness-gate (fail-closed) + kill-switch `AI_JOLT_AUTO_APPLY_ENABLED` |
| 4   | **Eksplisitkan kontrak BFF↔sync-service** — contract test / schema bersama untuk metadata workflow; hilangkan tebak `transformPaths`.  | ⬜ **belum** (prioritas #2)                                                                 |
| 5   | **Perlakukan data-model sebagai DSL** — versioning + test untuk op catalog & JOLT spec.                                                | ⬜ sebagian (katalog op terdokumentasi)                                                     |

---

## 8. Kesimpulan (direvisi)

Labamap adalah over-engineering yang **cerdas, disengaja, dan ternyata lebih matang dari kesan pertama**.
Guardrail auto-apply, org-scoping, ownership-contract, dan validator berlapis menunjukkan **rekayasa
keselamatan yang serius** — bukan "AI liar". Taruhan strategisnya (cover banyak channel via data + AI-draft)
**sah**, dan datanya menunjukkan AI dipakai dengan benar sebagai **co-pilot ter-review**.

Biaya nyatanya **bukan** taruhan AI (itu terjaga), melainkan **beban kognitif dari pipeline berlapis** dan
**kontrak lintas-service yang implisit**. Keduanya diobati dengan **tooling** (observability + golden-test +
kontrak eksplisit), bukan dengan membongkar arsitektur.

> **Analogi (direvisi):** Labamap membangun **compiler + IDE** untuk integrasi marketplace. Versi awal saya
> khawatir "compiler-nya menyetir sendiri". Data menunjukkan **compiler-nya sudah punya rem, sabuk pengaman,
> dan pengemudi manusia** untuk keputusan berisiko. Yang kurang bukan rem, tapi **dashboard** (observability)
> dan **uji tabrak** (golden-test) — dan sesi ini menambah dashboard-nya.

**Rekomendasi ringkas:** pertahankan substrat data-driven + guardrail AI (itu aset yang matang). Fokus
berikutnya: **golden-tests** (fondasi determinisme) dan **kontrak BFF↔sync eksplisit**. AI sudah di kursi
yang benar (co-pilot) — tak perlu dibongkar.
