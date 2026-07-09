# Recommendations Review Queue — Penjelasan + Wireframe

**Modul:** `src/modules/ai-admin/components/recommendations/RecommendationsReviewQueue.tsx`
**Route:** `/platform-admin/ai-recommendations`
**Spec:** P0-D · human-in-the-loop (`docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P0-D`)

---

## Inti (satu kalimat)

Gerbang **"AI mengusulkan, manusia memutuskan"**: tempat perubahan JOLT/mapping yang **tidak cukup yakin untuk diterapkan otomatis** ditahan sampai admin approve/reject — lengkap dengan bukti.

## Kenapa modul ini ada

Sebuah **JOLT spec** menentukan cara SETIAP produk di satu `channel × category` ditransformasi saat publish. Kalau engine salah menerapkan perubahan otomatis → **semua listing channel itu bisa rusak**. Maka perubahan dibedakan berdasarkan confidence:

| Confidence | Status | Perlakuan |
|---|---|---|
| **≥ 92%** | `AUTO_APPLIED` | Langsung dipakai — tak perlu manusia |
| **70–92%** | `RECOMMENDATION_CREATED` | **Masuk antrian ini** — butuh keputusan manusia |
| **< 70% / gagal** | `MANUAL_REVIEW_REQUIRED` | Masuk antrian ini |
| **Publish gagal (runtime)** | auto-analyze | Otomatis bikin rekomendasi di antrian ini |

> Antrian **kosong = sehat** (tak ada yang perlu keputusan manusia). Ada isi = engine ragu / ada kegagalan yang perlu ditinjau.

---

## Wireframe 1 — Dari mana isi antrian datang

```
              ┌─────────────────────────────┐        ┌──────────────────────────┐
  Publish     │  JOLT Generation Console    │        │  Publish gagal (runtime) │
  gagal ──────►  / engine mapping           │        │  di channel manapun      │
              └──────────────┬──────────────┘        └────────────┬─────────────┘
                             │ confidence?                        │ auto-analyze
              ┌──────────────┼───────────────┐                    │
              ▼              ▼               ▼                     ▼
        ≥92% AUTO      70–92%          <70% / gagal        ╔═══════════════════════╗
        _APPLIED       RECOMMENDATION  MANUAL_REVIEW  ────► ║  RECOMMENDATIONS      ║
        (langsung      _CREATED        _REQUIRED            ║  REVIEW QUEUE (ini)   ║
         dipakai)          │                               ╚═══════╤═══════════════╝
             │             └───────────────────────────────────────┘
             ▼                                                      ▼
      JOLT spec produksi ◄───────────── APPROVE ──────────  Admin baca bukti,
      diperbarui                                            approve / reject
                                        REJECT ───────────► ditolak + alasan dicatat
```

---

## Wireframe 2 — Halaman antrian (list)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  ✦ Recommendations Review Queue                                          [⟳]     │
│    AI mengusulkan, manusia memutuskan — approve / reject dengan bukti.            │
├────────────────────────────────────────────────────────────────────────────────┤
│  [ Pending | Approved | Rejected | All ]  Channel:[All▾]  [shopify▾][Apparel→cloth│
│   ▲ filter status         ▲ filter channel  trigger channel▲  ▲scope kategori▾][Trg│
├────────────────────────────────────────────────────────────────────────────────┤
│  Confidence   Channel   Trigger            Root cause              Status  Expires│
│ ─────────────────────────────────────────────────────────────────────────────── │
│  ● 78% review  Shopify  PUBLISH_FAILURE   "variant.price tak ter…" PENDING  2h  →│
│  ● 85% review  eBay     JOLT_GENERATION   "kategori clothing mis…" PENDING  5h  →│
│  ● 61% low     Lazada   PUBLISH_FAILURE   "field 'material' hilang" PENDING 1j🔶 →│
│  ● 95% auto    TikTok   JOLT_GENERATION   "—"                     APPROVED  —   →│
│                                                        klik baris → buka detail ──┘
├────────────────────────────────────────────────────────────────────────────────┤
│  12 total · halaman 1 dari 1                              [← Prev]   [Next →]     │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Confidence** berwarna: hijau `auto` (≥92%), amber `review` (70–92%), merah `low` (<70%).
- **Expires** — rekomendasi kedaluwarsa (mis. "2h lagi"); amber bila ≤2 hari, merah bila lewat.
- **Trigger Analysis** (kanan) — admin bisa **memicu** agent menganalisa satu channel manual (tak cuma menunggu kegagalan). Ada elapsed timer + tombol Batalkan + timeout 120s (agent LLM bisa lambat / 429).
  - **Scope kategori (opsional)** — picker Product Type di samping channel. Jika dipilih, trigger menyertakan `categoryId` (dari `categorySlug` type itu) + **sample produk representatif** dari type tsb, sehingga JOLT digenerate untuk **channel × kategori yang tepat**, bukan `default` dengan sample kosong. Dikosongkan = perilaku lama (kategori `default`).
  - ⚠ **Outcome tidak dijanjikan**: trigger balikin `{ sessionId, status:"TRIGGERED" }` saja. Rekomendasi hanya muncul di antrian bila confidence di **band review (~70–92%)**; confidence tinggi → **AUTO_APPLIED** ke JOLT spec produksi (cek **Channel JOLT Specs** / **Agent Sessions**), tidak masuk antrian.

---

## Wireframe 3 — Panel detail (tempat keputusan diambil)

```
┌──────────────────────────────────────────────────────────────┐
│  ● 78% review   🛍 Shopify   [PENDING]                    [✕] │
├──────────────────────────────────────────────────────────────┤
│ ⚠ Peringatan (2)                        ← RISIKO di paling atas│
│   • Perubahan menyentuh 3 field variant                        │
│   • Tak ada mapping proven untuk 'compare_at_price'            │
├──────────────────────────────────────────────────────────────┤
│ ▍Kenapa muncul            (triggerContext)                     │
│   Trigger type : PUBLISH_FAILURE                               │
│   ┌────────────────────────────────────────────────────────┐  │
│   │ error: "variant.price failed to map to Shopify schema"  │  │
│   └────────────────────────────────────────────────────────┘  │
│   Master product : prod_1766…      ▸ sample product snapshot   │
├──────────────────────────────────────────────────────────────┤
│ ▍Penilaian AI             (analysis)                           │
│   Root cause : "source path variants[].price tidak cocok"      │
│   Affected fields      : [price] [variants[].price]            │
│   Missing channel req  : [—]                                   │
├──────────────────────────────────────────────────────────────┤
│ ▍RAG Evidence     ← BUKTI grounding (bukan halusinasi)         │
│   ▸ 3 evidence  (mapping/spec yang jadi dasar usulan)          │
│   (kalau kosong → ⚠ "agent mungkin menebak — tinjau ekstra")   │
├──────────────────────────────────────────────────────────────┤
│ ▍Proposed Fix     (perubahan JOLT yang diusulkan)              │
│   ▾ ADD_SHIFT_OPERATION                                        │
│     { "operation":"shift", "spec":{ "price":"variants[0]…" } } │
│   Sesi agent: sess_abc →   (tautan ke observability P1-E)      │
├──────────────────────────────────────────────────────────────┤
│  Reviewer *   [ backend-ai2@bhakti.co.id        ]              │
│  Note         [ opsional untuk approve          ]              │
│  Alasan tolak [ kenapa ditolak…                 ]              │
│    [ ✓ Approve ]                    [ ✕ Reject ]              │
│  ⚠ Approve mengubah JOLT spec PRODUKSI untuk channel ini.      │
│    Pastikan sudah meninjau evidence & warnings.                │
└──────────────────────────────────────────────────────────────┘
```

Bila status **bukan** PENDING, panel aksi diganti ringkasan audit: `Reviewed by`, `Reviewed at`, `Rejection reason`, `Applied JOLT spec`.

---

## Alur keputusan admin

```
1. Buka detail  ─►  baca ⚠ Warnings (risiko dulu)
2.               ─►  Kenapa muncul (konteks kegagalan / trigger)
3.               ─►  Penilaian AI (root cause, affected fields)
4.               ─►  RAG Evidence  (bukti grounded, bukan tebakan)
5.               ─►  Proposed Fix  (perubahan JOLT konkret)
6. Isi Reviewer* ─►  ┌ Approve ─► konfirmasi ─► fix diterapkan ke JOLT spec PRODUKSI
                     └ Reject  ─► wajib alasan ─► dicatat (umpan balik ke learning)
```

Kontrak API (kuirk yang ditangani di komponen):
- **approve**: `reviewedBy` + `note` = query param.
- **reject**: `reviewedBy` = query param, tapi `reason` = body.

---

## Ringkasan: "gunanya" apa?

| Fungsi | Penjelasan |
|---|---|
| **Safety gate** | Cegah perubahan transformasi berisiko diterapkan otomatis ke semua listing sebuah channel |
| **Trust / grounding** | Reviewer memutuskan dari bukti (analysis + RAG evidence + warnings), bukan skor telanjang |
| **Recovery** | Publish gagal otomatis jadi usulan perbaikan — bukan error yang hilang begitu saja |
| **Audit + feedback** | Siapa approve/reject, kapan, alasan — jejak lengkap + umpan balik ke learning loop |

**Analogi:** rem tangan + kotak bukti untuk otomasi JOLT. Engine boleh pintar, tapi perubahan yang menyentuh produksi dan belum cukup yakin **harus lewat mata manusia dulu** — modul ini menyediakan konteks agar keputusan itu cepat & sadar.

---

## Peta konsep terkait

```
Publish Diagnostics ── "apakah produk ini siap?" (dry-run, tak publish)
JOLT Generation Console ── generate/tune JOLT spec (bisa hasilkan RECOMMENDATION_CREATED)
        │
        └─► Recommendations Review Queue ── approve/reject usulan → update JOLT spec produksi
                    │
                    └─► Agent Sessions (P1-E) ── observability tiap run agent (via agentSessionId)
```
