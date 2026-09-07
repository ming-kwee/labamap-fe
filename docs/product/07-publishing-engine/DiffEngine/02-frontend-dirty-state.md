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

---

## Fix (2026-08-23) — imported listing selalu "N perubahan" padahal tak ada edit

**Gejala.** Buka Step-2 ("edit channel fields") produk hasil import (mis. WIX) tanpa mengubah apa pun,
badge tetap **"Live • 4 perubahan"**. Hitungan itu = `summary.totalChanges`.

**Akar (terverifikasi di kode).** `buildDiffResponse` merinci perubahan dengan membandingkan desired-state
terhadap baseline per-resource: varian → `variantContentHashes`, gambar → `imageChannelIds`. Tetapi jalur
**import** (`ReverseImportService.linkRow` + `stampBaselineHash`) hanya men-stamp `lastPublishedContentHash`,
`variantChannelIds`, dan `imageChannelIds` — **`variantContentHashes` TIDAK PERNAH di-stamp saat import**
(hanya di-stamp oleh publish sukses via `persistContentHashes`). Jadi untuk produk import dengan 4 varian,
`variantContentHashes` kosong → `diffVariants` menandai keempatnya "add" → `totalChanges=4`, **terlepas dari
keputusan NOOP/UPDATE** (bucket dihitung apa adanya).

**Fix A — NOOP otoritatif (de-noise, langsung untuk produk yang sudah terlanjur import).** Di
`buildDiffResponse`, saat `op==NOOP` (hash-keseluruhan == last-published → benar-benar tak berubah), semua
bucket di-collapse ke `noop` (add/update/delete dikosongkan) → `totalChanges=0`. Hash-keseluruhan adalah
kebenaran; bucket per-resource hanya rincian untuk perubahan nyata.

**Fix B — stamp baseline per-resource saat import (akar).** `PublishDiffResponse` kini membawa dua map
internal `@JsonIgnore` (`desiredVariantHashes`, `desiredImageHashes`) yang diisi `buildDiffResponse` dari
desired-state yang sama. `ChannelPublishService.stampDesiredResourceHashes(...)` mem-persist keduanya sebagai
`variantContentHashes`/`imageContentHashes`; `ReverseImportService.stampBaselineHash` memanggilnya **setelah**
`save(row)` (targeted `@Update` tak boleh ke-clobber oleh full-save). Hasil: import ke depan punya baseline
lengkap → diff yang tak berubah = noop, dan UPDATE nyata merinci hanya yang berubah (bukan "semua add").

**Cakupan.** Fix A membereskan produk yang **sudah** di-import (asal hash-keseluruhan cocok → NOOP). Fix B
membereskan itemisasi untuk import berikutnya. Produk lama yang hash-nya memang mismatch (mis. Step-2 sempat
autosave `channelData`) akan tetap `dirty=true` — itu perubahan payload nyata, bukan false-positive; akar
terpisah (stabilitas hash / autosave FE). Unit test: `PublishDiffResponseTest`
(`noop_zeroChanges_evenWhenPerResourceBaselineMissing`, `exposesDesiredResourceHashes_forImportBaselineStamping`).

### Lanjutan (2026-08-23) — masih "N perubahan" saat op=UPDATE (bukan hanya NOOP)

Fix A di atas hanya mengosongkan bucket saat `op==NOOP`. Tapi produk import yang punya **Step-2
masterOverride produk-level** (mis. WIX `price/weight/comparePrice/ribbon`) menghasilkan hash-keseluruhan
**≠ baseline import** → `op=UPDATE`, sehingga bucket varian TETAP dihitung "add" (karena
`variantContentHashes` masih kosong pada produk yang di-import sebelum Fix B). Jadi "N perubahan" masih muncul.

**Fix C (robust, apa pun op).** `diffVariants`/`diffImages` kini menerima flag `onChannel` (= `op != CREATE`).
Bila produk **sudah di-channel** tetapi baseline per-resource untuk resource itu **kosong** (belum pernah
di-stamp), diff **tidak** mengklaim semuanya "add" — dikembalikan sebagai `noop`. Sinyal `dirty` tetap dari
hash-keseluruhan (jujur: "ada perubahan produk-level"), tapi hitungan varian/gambar palsu hilang. CREATE
(belum di-channel) tak terpengaruh — listing baru tetap merinci semua sebagai "add".

Konsekuensi jujur: untuk import lama tanpa baseline, perubahan varian **nyata** pun tak ter-itemisasi
per-varian (hanya `dirty` keseluruhan) sampai satu publish/import ulang men-stamp baseline
(`persistContentHashes` / `stampDesiredResourceHashes`) — setelah itu itemisasi akurat. Trade-off ini lebih
baik daripada melaporkan N perubahan hantu. Test: `PublishDiffResponseTest`
(`update_withMissingVariantBaseline_doesNotFalseAddVariants`, `create_withEmptyBaseline_stillItemizesEverythingAsAdd`).

**Kalau badge MASIH menandai dirty (bukan hitungan) padahal "tak diubah":** itu karena ada beda produk-level
nyata antara desired-state (master + Step-2 override) vs baseline import — override Step-2 yang belum pernah
dipublish. Publish sekali menyinkronkan baseline → diff berikutnya NOOP.

### Fix D (2026-08-23) — "tetap ada perubahan tepat setelah Perbarui" (baseline di-stamp dari payload terfilter)

**Gejala.** Klik "Perbarui" (UPDATE) sukses, tapi badge tetap "Live • ada perubahan" tanpa edit apa pun.

**Akar (channel yang track image, mis. Shopify).** `doChannelSyncPublish` **memutasi `wrappedData` di
tempat** lewat filter add-only (`filterProductImagesForUpdate` / `filterVariantImagesForUpdate` membuang
gambar yang sudah dikenal saat UPDATE), lalu `response.publishedData = wrappedData` yang **sudah terfilter**.
`updateChannelProductStatus` men-stamp `lastPublishedContentHash = ContentHash.of(publishedData)` =
hash(subset terfilter). Padahal `/publish/diff` menghitung `intendedHash = ContentHash.of(wrappedData PENUH)`.
`terfilter ≠ penuh` → baseline **tak pernah** cocok → setiap re-publish jadi UPDATE (dirty) selamanya.

**Fix.** Tangkap `desiredContentHash = ContentHash.of(wrappedData)` di **awal** `doChannelSyncPublish`
(sebelum filter), bawa lewat `response.contentHash` (termasuk jalur PROCESSING/timeout → publish_job →
reconciler), dan `updateChannelProductStatus` + `recordHistory` memakai `response.contentHash` alih-alih
me-rehash `publishedData` yang terfilter. Kini baseline == `intendedHash` diff → re-publish tanpa perubahan
= NOOP.

**Catatan cakupan.** Ini membereskan channel yang track image (`idtracking#images` → Shopify). **WIX/Shopee
tidak track image** (filter no-op), jadi dirtiness mereka **berbeda sebab**. Ditambahkan log diagnostik
`[DIRTY-DIAG]` di titik keputusan (hanya jalur UPDATE/BLOCKED) yang mencetak `intendedHash` vs
`lastPublishedContentHash` — untuk memastikan apakah WIX dirty karena (a) nilai beda (perubahan nyata /
transform non-deterministik) atau (b) baseline null (tak pernah ke-stamp). Tindak lanjut menunggu nilai
hash aktual dari log itu.

### Fix E (2026-08-23) — ROOT: content hash memasukkan staging key `_source` → selalu dirty

**Bukti definitif (dari `[DIRTY-DIAG-KEYS]`).** Per-top-level-key hash **stabil sempurna** lintas reload
(`product`, `_source`, `_sourceImages` identik tiap kali) → transform **deterministik**, bukan
non-determinisme. Namun `intendedHash` tetap ≠ `lastPublishedHash` bahkan tepat setelah republish.

**Akar.** `intendedHash = ContentHash.of(wrappedData)` ikut menghash key staging reserved **`_source`**
(= seluruh `masterProductData`, referensi HIDUP) dan `_sourceImages`. Di jalur UPDATE, antara `intendedHash`
dihitung (di `publishToChannel`) dan baseline di-stamp (`desiredContentHash` di `doChannelSyncPublish`),
langkah UPDATE (`applyImageReorder`/`computeDeleteImageIds`/set request) menyentuh request/master → `_source`
bergeser → hash-stamp ≠ hash-diff. Baseline **tak pernah** cocok → listing live "ada perubahan" selamanya,
walau baru sukses di-Perbarui.

**Fix.** `contentHashOfChannelPayload(wrappedData)` — hash HANYA payload channel, **buang semua key
`_`-prefixed** (`_source`, `_sourceImages`, `_categoryAttributes`, …). Ini juga definisi identitas konten yang
benar: yang menentukan "berubah/tidak" adalah **yang dikirim ke channel** (`product`, …) — dan payload itu
sudah memantulkan setiap perubahan gambar/field lewat transform. Diterapkan di keempat titik hash
(intendedHash diff, desiredContentHash stamp, dua fallback publishedData). Test: `ContentHashPayloadTest`
(hash abai `_`-keys; berubah saat `product` berubah).

**Catatan migrasi.** Baseline lama (di-stamp dengan `_`-keys) belum cocok dengan hash baru → produk tetap
dirty sampai **satu publish lagi** dengan build ini men-stamp ulang. Setelah itu re-publish tanpa perubahan =
NOOP. (Diagnostik `[DIRTY-DIAG]`/`[DIRTY-DIAG-KEYS]` boleh dibiarkan; hanya jalur dirty, murah.)

### Fix F (2026-08-23) — ROOT of Shopify false-positive: diff input ≠ publish input (FE fix)

**Bukti penentu (`[DIRTY-DIAG] diffOnly=false`).** Publish sungguhan menghitung `op=NOOP`
(`intendedHash == lastPublishedHash`, equal=true) — jadi publish **konsisten sempurna** (stamp → NOOP).
Tapi diff-probe (`diffOnly=true`) menghitung `product` berbeda. Perbandingan `[DIRTY-DIAG-KEYS]`:

| sub-field | diff-probe | publish sungguhan |
|---|---|---|
| `product.status` | ❌ absen | ✅ ada |
| `product.product_type` | ✅ ada | ❌ absen |
| lainnya | identik | identik |

**Akar (di FE, bukan BFF).** `refreshDiff` memanggil `/publish/diff` **tanpa** `masterProductData` → BFF
**menghidrasi desired-state dari stored master**, menghasilkan payload BEDA dari publish sungguhan (yang
mengirim `buildPublishMasterData` = master + Step-2 `masterOverrides` + `channelData`, termasuk field
`status`). Karena input beda → `product` beda → `intendedHash` diff **tak pernah** sama dengan baseline
(yang di-stamp jalur publish) → badge "ada perubahan" permanen walau baru sukses publish.

**Fix (FE, repo free-nextjs-admin-dashboard, commit 849f154).** `refreshDiff` kini mengirim
`masterProductData` yang SAMA dengan publish (`buildPublishMasterData(product, store)`), lewat ref-snapshot
agar callback tetap stabil (tak memicu ulang effect diff tiap poll). Hasil: payload diff == payload publish
→ NOOP saat tak berubah → badge akurat. (BFF `publishDiff` sudah menerima `masterProductData` opsional dan
melewati hidrasi bila ada — tak perlu perubahan BFF.)

**Pelajaran umum.** Dirty-detection HARUS membandingkan apel-dengan-apel: probe diff wajib memakai input
yang identik dengan publish. Menghidrasi dari sumber berbeda (DB vs FE-form) menjamin false-positive untuk
field apa pun yang hanya ada di satu sumber.
