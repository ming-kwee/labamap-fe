# Frontend dirty-state — deteksi "ada perubahan atau tidak" yang andal

> **Status:** rekomendasi enhancement (kontrak untuk tim FE + sketsa endpoint BE). Belum diimplementasi.
> **Konteks:** dibangun di atas fondasi [DiffEngine](01-update-diff-engine.md) (P0–P3). Semua primitif
> yang dibutuhkan **sudah ada** di backend; enhancement-nya adalah **satu endpoint baca** yang
> mengeksposnya.

---

## 0. TL;DR

FE butuh tahu, per **(masterProductId × storeId)**: *"apakah ada yang berubah sejak terakhir dipublish?"*
— untuk badge "Up to date" vs "N perubahan", enable/disable tombol Publish/Resync, dan menampilkan **apa**
yang berubah. **FE tidak bisa menghitung ini secara andal sendiri.** Solusinya: endpoint baca
**`publish-diff`** yang menjalankan `DesiredStateExtractor` + `PublishDiffPlanner` + decider **tanpa
mem-publish**, dan mengembalikan ringkasan dirty per-resource.

---

## 1. Kenapa FE tidak bisa andal sendiri

| Alasan | Penjelasan |
|---|---|
| **Baseline hanya di backend** | "Apa yang terakhir dikirim ke channel" tersimpan di `listing-state` (`lastPublishedContentHash`, `variantContentHashes`, `imageContentHashes`, `variantChannelIds`) — **per (produk, store)**. FE tak memilikinya. |
| **Definisi "berubah" harus otoritatif** | "Berubah" yang benar = **content-hash atas payload yang benar-benar dikirim** (setelah merge override + transform). Banding field mentah di FE salah untuk `"10"` vs `"10.00"`, urutan array, spasi, field yang di-drop transform, dll. |
| **Per-store, banyak store** | Satu master bisa terpublish ke banyak store pada waktu berbeda; tiap store punya baseline sendiri. |
| **Dirty menumpuk lintas step** | Desired-state = **master + override Step-2 (channel) + override variant**. Ketiganya menyatu jadi satu payload. FE yang men-track dirty per-step akan rapuh & mudah tak sinkron. |

**Kesimpulan:** backend harus jadi **satu sumber kebenaran** dirty-state. FE cukup menanyakannya.

---

## 2. Enhancement: endpoint `publish-diff` (baca-saja, tanpa publish)

```
POST /api/v1/channels/publish/diff
Body: { "masterProductId": "...", "storeId": "...", "masterProductData": { ... }? }
```

- `masterProductData` **opsional**: bila diberikan (mis. draft yang belum disimpan di Step 1/2), backend
  memakainya sebagai desired; bila tidak, backend meng-hydrate dari master tersimpan (sama seperti resync)
  lalu me-merge override Step-2 — jadi jawabannya **sudah lintas-step**.
- **Read-only:** tak menyentuh channel, tak menulis listing-state. Aman dipanggil sering (debounce di FE).

Backend menjalankan pipeline **sampai keputusan operasi** (persis jalur `PublishOperationDecider` hari ini,
tapi berhenti sebelum dispatch) + `PublishDiffPlanner` untuk rincian per-resource.

---

## 3. Kontrak response

```json
{
  "masterProductId": "fa20a688-...",
  "storeId": "shopify-shopify-01",
  "channelType": "shopify",
  "listingStatus": "PUBLISHED",          // NEVER_PUBLISHED | PUBLISHED | DELISTED
  "decision": "UPDATE",                  // CREATE | NOOP | UPDATE | UPDATE_BLOCKED
  "dirty": true,                         // false ⟺ decision NOOP (tak ada yang perlu dikirim)
  "updateSupported": true,               // false → channel ini belum dukung UPDATE (Mode B belum wired)
  "product": { "changed": true },        // body produk (nama/deskripsi/harga produk) berubah?
  "variants": {
    "add":    ["SKU-D", "SKU-E"],
    "update": ["SKU-B"],
    "delete": ["SKU-A"],
    "noop":   ["SKU-C"]
  },
  "productImages": { "add": ["https://.../2.jpg"], "delete": ["https://.../old.jpg"], "noop": ["https://.../1.jpg"] },
  "variantImages": { "add": ["SKU-B::https://.../new.jpg"], "delete": ["SKU-B::https://.../old.jpg"] },
  "summary": { "variantsChanged": 4, "imagesChanged": 3, "totalChanges": 8 }
}
```

Field penting untuk FE:
- **`dirty`** — sinyal utama badge/tombol. `false` = "Up to date" (publish akan NOOP, tak menyentuh channel).
- **`decision`** — `UPDATE_BLOCKED` artinya ada perubahan **tapi** UPDATE channel belum aktif/di-support →
  FE tampilkan "perubahan belum bisa dikirim" (bukan "up to date", bukan error).
- **`summary.totalChanges`** — untuk teks "N perubahan siap dipublish".
- Daftar `add/update/delete/noop` — untuk **menampilkan apa** yang berubah (mis. highlight variant/gambar).

---

## 4. Cara FE memakainya

1. **Listing dashboard / Step 3 (Publish):** panggil `publish-diff` per store → badge per store
   (`Up to date` / `N changes` / `Changes pending (update not enabled)` / `Not published`).
2. **Sewaktu edit di Step 1/2/variant:** desired berubah → panggil ulang (debounce ~500ms, kirim draft
   `masterProductData` bila belum tersimpan) → badge & tombol Publish ter-refresh **tanpa** menebak sendiri.
3. **Tombol Publish/Resync:** disable saat `dirty=false`; label "Publish changes (N)" saat `dirty=true`;
   "Update not supported yet" saat `decision=UPDATE_BLOCKED`.
4. **Tampilkan diff (opsional):** pakai daftar `variants`/`*Images` untuk highlight baris yang add/update/delete.

> FE **tidak perlu** menyimpan/menghitung baseline atau membandingkan field sendiri — cukup render hasil
> `publish-diff`. Satu panggilan = jawaban lintas-step yang otoritatif.

---

## 5. Yang backend sudah punya (reuse) + sketsa implementasi BE

Endpoint ini **tipis** — nyaris tanpa logika baru; semuanya reuse:

| Butuh | Sudah ada |
|---|---|
| Desired sets (variant/gambar + hash) | `DesiredStateExtractor.extract(mergedMaster)` (P2) |
| Diff vs known | `PublishDiffPlanner.plan(mergedMaster, listingState)` (P3) |
| Keputusan CREATE/NOOP/UPDATE/BLOCKED | `PublishOperationDecider` + gate `variantUpdateMode`/`channelUpdateEnabled` (P6) |
| Known state | `listing-state` (`variantChannelIds`, `*ContentHashes`, `lastPublishedContentHash`) (P0/P2) |
| Merge override Step-2 + hydrate master | `loadAndMergeChannelData` + `ensureMasterProductData` (sudah ada) |
| Dirty body-produk (match NOOP) | jalankan transform read-only (seperti `tracePublish`) → `ContentHash.of` vs `lastPublishedContentHash` |

**Sketsa handler (read-only):**
1. Load `listing-state(masterProductId, storeId)`.
2. Siapkan desired: pakai `masterProductData` request, atau hydrate dari master + `loadAndMergeChannelData`
   (override Step-2) — agar lintas-step.
3. `product.changed` = `ContentHash.of(transform(desired)) != lastPublishedContentHash` (reuse jalur trace).
4. `plan = PublishDiffPlanner.plan(desired, listingState)` → petakan Ops ke `variants`/`*Images`.
5. `decision` = `PublishOperationDecider` + gate mode; `dirty = decision != NOOP`.
6. Balikan DTO. **Nol write, nol call channel.**

Biaya: satu transform read-only + baca listing-state. Tak ada round-trip channel → murah, aman di-poll.

---

## 6. Caveat (jujur — jangan overclaim ke FE)

- **Gambar belum penuh.** Image id round-trip (`idtracking#images`) belum di-wire, jadi
  `imageChannelIds`/`imageContentHashes` untuk gambar bisa kosong sampai fase gambar selesai. Sampai itu,
  `productImages`/`variantImages` mungkin melaporkan semua gambar sebagai `add` (bukan noop) — **beri catatan
  di FE** atau sembunyikan bagian gambar sampai fase gambar live. Variant sudah akurat (P0 variant surfacing live).
- **`variantContentHashes` terisi mulai publish berikutnya.** Hash di-persist saat publish sukses (P2). Untuk
  listing yang dipublish **sebelum** P2 aktif, hash variant kosong → variant present-in-both dilaporkan
  `update` (bukan `noop`) sampai publish sukses pertama pasca-P2. Aman (fail-safe: "anggap berubah").
- **`decision=UPDATE_BLOCKED`** normal untuk channel non–Mode-A (Shopee/TikTok) sampai Mode B selesai —
  FE harus membedakannya dari `dirty=false`.

---

## 7. Ringkas

**Ya, FE butuh enhancement ini, dan backend sudah 90% siap.** Yang kurang hanya **satu endpoint baca**
(`publish-diff`) yang membungkus `DesiredStateExtractor` + `PublishDiffPlanner` + decider. Itu memberi FE
deteksi dirty-state **lintas-step, per-store, otoritatif** dengan satu panggilan — tanpa FE menebak,
menyimpan baseline, atau membandingkan field sendiri.

**Rekomendasi urutan:** implementasi endkonter ini **setelah** E2E Mode A hijau (agar `decision`/`dirty`
mencerminkan perilaku UPDATE yang sudah terbukti), atau paralel bila FE butuh badge lebih dulu (variant +
product sudah akurat; gambar diberi catatan).
