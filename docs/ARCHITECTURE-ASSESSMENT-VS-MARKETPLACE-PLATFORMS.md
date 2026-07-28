# Penilaian Arsitektur Labamap vs Platform Marketplace Komersial

> Analisis arsitek — jujur, termasuk sisi yang kurang. Berbasis pembedahan **jalur katalog/publish**
> Labamap (bukan brosur). Ditulis 2026-07-27.
>
> **Disclaimer cakupan:** yang dinilai adalah **listing/publish path**. Belum termasuk inventory-sync,
> order-routing, repricing, WMS — yang justru inti operasional platform komersial. Perbandingan
> "kecanggihan arsitektur" harus memperhitungkan perbedaan cakupan ini.

---

## 1. Taruhan arsitektur yang mendefinisikan Labamap

Satu keputusan besar membedakan Labamap dari semua platform lain:

> **Transformasi master→channel bersifat deklaratif & data-driven (JOLT spec + post-processing pipeline
> + metadata workflow), dan JOLT spec-nya di-*generate oleh LLM* per-kategori (RAG + adversarial
> validation + auto-apply).**

Semua mekanisme lain — `apiSchema` sebagai target authoritative, support-field staging, JOLT-independence,
`_`-key staging — sebagian besar **ada untuk membuat spec hasil AI itu aman**. Ini kunci untuk menilai
"over-engineered atau tidak": sebagian besar kompleksitas **diinduksi oleh taruhan AI-generation**.

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

---

## 2. Perbandingan dengan platform komersial

| Dimensi | Labamap | Sellbrite | BigSeller | Linnworks | ChannelAdvisor/Rithum |
|---|---|---|---|---|---|
| Transformasi | **AI-generated JOLT + post-proc DSL** | Template UI sederhana | Per-channel hardcoded (SEA) | Adapter + rules UI | Feed/rule engine + ML taksonomi |
| Determinisme | **Non-deterministik** (LLM) | Deterministik | Deterministik | Deterministik | Deterministik |
| Onboarding channel baru | Idealnya *data + generate* | Tim engineer | Tim engineer | Adapter + config | Tim integrasi besar |
| Data-driven purity | **Ekstrem** (semua di Mongo) | Rendah | Rendah–sedang | Sedang–tinggi | Tinggi |
| Kematangan | Muda, evolving | Matang (SMB) | Matang (SEA) | Sangat matang | Paling matang (enterprise) |
| Cakupan produk | Listing/publish (yg terlihat) | Listing+inv+order | Listing+inv+order+ship | Full ops + WMS | Full ops + marketing + fulfillment |

**Poin penting:** tak satu pun dari keempat platform meng-*generate* logika transformasi dengan AI.
Mereka menulis adapter per-channel **sekali, oleh engineer, deterministik**. ML di ChannelAdvisor dipakai
untuk *saran* kategori/atribut, bukan menghasilkan spec transformasi yang langsung dieksekusi. Di dimensi
ini, Labamap **lebih ambisius daripada semuanya — termasuk ChannelAdvisor**.

---

## 3. Verdict: canggih? Ya. Over-engineered? Juga ya

### Canggih — tulus
- Resolusi JOLT category-aware dengan fallback priority (`org+cat > sys+cat > org+default > seed`) — elegan.
- **Capability enrichment** (resolve logistik/brand/attribute-tree live lalu di-stage) — bagian *tersulit*
  integrasi marketplace, ditangani data-driven. ChannelAdvisor pun melakukan hal serupa.
- OAuth penuh + token refresh + webhook uninstall + enkripsi kredensial AES-GCM — production-grade.
- Pre-flight gate (fail-fast dengan pesan per-field) — UX validasi yang bagus.
- Alur dua-langkah Shopee (media pre-upload → create → write-back id) — ditangani benar.

### Over-engineered — juga tulus, dan terkonsentrasi di satu tempat
Bukti terkuatnya adalah **sesi debugging ini sendiri**. Empat bug beruntun yang diperbaiki
(`category_id`, `image`, `image_id_list` write-back, `attribute_list`) punya **akar yang sama**:

> Spec AI-generated hanya melihat *master fields → apiSchema*. Semua yang hidup di luar itu (kategori
> pilihan Step-2, image_id hasil upload, atribut kategori, support field) **dijatuhkan diam-diam**, lalu
> meledak sebagai penolakan channel di produksi.

Platform komersial **tidak punya kelas bug ini** — engineer menulis adapter Shopee sekali, deterministik,
bisa di-golden-test. Anda memelihara **dua sumber kebenaran** (seed hand-written + spec generated yang
menang atasnya), dan bug bersembunyi di celah keduanya.

Dua *smell* arsitektur klasik yang menyertai:
1. **Distributed monolith** — BFF (Labamap) & sync-service adalah dua service dengan **kontrak implisit**
   (metadata workflow, `transformPaths`, aturan support-field) yang menyebar lintas-repo. Waktu sesi ini
   habis untuk menebak semantik `transformPaths` dan error "neither a List nor a Map" persis karena
   kontrak itu tak eksplisit.
2. **Data model = DSL tanpa tooling** — katalog post-processing op, JOLT spec, metadata workflow
   sebenarnya adalah *bahasa pemrograman* yang disimpan sebagai data, tapi tanpa test/versioning/debugger
   selayaknya bahasa.

---

## 4. Bukti dari sesi ini (bug = gejala arsitektur)

| Bug | Akar | Kelas |
|---|---|---|
| `CategoryId is required` | kategori Step-2 (`channelData`) tak dipetakan spec generated ke `category_id` | AI blind-spot |
| `Image is required` (tahap 1) | atribut `image` dijatuhkan spec generated (bukan master→apiSchema) | AI blind-spot |
| `image_id_list` berisi URL | BFF mengisi target write-back milik sync-service (anti-pattern) | kontrak implisit BFF↔sync |
| `Image is required` (tahap 2) | `image` di-flag `isSupportField=true` → dikecualikan dari body | filter support-field |
| `Attribute mandatory 200134/200162` | tak ada builder `attribute_list` dari channelData + support-excluded | AI blind-spot + filter |

Semua diperbaiki **JOLT-spec-independent** (stage `_`-key + post-processing rule), yaitu menambal
blind-spot AI dengan lapisan deterministik — persis pola yang membuktikan kompleksitasnya diinduksi
taruhan AI-generation.

Prinsip yang mengkristal (berguna untuk seterusnya):
- Field yang **nilainya diketahui BFF saat publish** (category_id) → **BFF isi** (post-processing bila
  perlu JOLT-independent).
- Field yang **nilainya lahir dari panggilan channel** (image_id, item_id, model_id) → **BFF sediakan
  placeholder kosong; sync-service isi** via `updatePaths.to`. Mengisinya di BFF = anti-pattern.
- Data merchant yang **genuinely kosong** (weight=0, price=0, <2 gambar) → **jangan dipalsukan**;
  fail-fast lewat pre-flight gate.

---

## 5. Rekomendasi konkret (berdampak tinggi → rendah)

1. **Golden-payload tests per channel/kategori.** Perbaikan tunggal paling berdampak. Sudah ada
   `shopee_add_model_e2e_payload.json` — jadikan assertion: "master X + kategori Y → body add_item HARUS =
   Z". Bug seperti `category_id`/`image` yang hilang tertangkap **sebelum** channel menolak, bukan lewat
   iterasi debug live.
2. **Turunkan AI-generation dari "auto-apply" ke "draft untuk direview".** Kode sudah punya split
   review-vs-autoApply — condongkan ke review. Jadikan spec kurasi (hand-written/reviewed) sebagai
   **jalur utama deterministik**; AI hanya membantu draft kategori baru. Ini meruntuhkan sebagian besar
   mesin JOLT-independence karena tak lagi harus mengkompensasi blind-spot AI.
3. **Eksplisitkan kontrak BFF↔sync-service.** Contract test / schema bersama untuk metadata workflow.
   Hilangkan tebak-tebakan `transformPaths`.
4. **Pertahankan data-driven purity — tapi perlakukan sebagai DSL.** Versioning + test untuk op catalog &
   JOLT spec.

---

## 6. Kesimpulan

Labamap **bukan over-engineering sia-sia** — ini over-engineering yang **cerdas dan disengaja**, dengan
taruhan strategis jelas: *cover banyak channel tanpa tim integrasi sebesar ChannelAdvisor, dengan
menjadikan onboarding sebagai operasi data + AI.* Jika taruhan itu berhasil, leverage-nya luar biasa.

Tapi jujur: **saat ini kompleksitasnya melampaui kematangannya.** Taruhan AI-generation sekarang tampak
**menciptakan lebih banyak bug daripada effort yang dihemat** — persis kelas bug yang diperbaiki seharian.
Platform komersial yang "membosankan" (adapter deterministik) menang di keandalan karena alasan itu.

> **Analogi:** Labamap membangun **compiler + IDE** untuk integrasi marketplace, sementara kompetitor
> menulis **script per-channel**. Compiler lebih elegan dan berpotensi jauh lebih powerful — tapi hanya
> menang kalau Anda benar-benar berinvestasi pada *tooling*-nya (test, kontrak eksplisit, determinisme).
> Tanpa itu, script yang membosankan lebih cepat sampai ke produk yang stabil.

**Rekomendasi ringkas:** pertahankan substrat data-driven-nya (itu aset), jadikan **determinisme +
golden-tests sebagai fondasi**, dan **turunkan AI dari pilot menjadi co-pilot**.
