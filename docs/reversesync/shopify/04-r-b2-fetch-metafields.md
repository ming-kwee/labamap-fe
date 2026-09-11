# 04 — R-B2: Perluas Item-Fetch agar Memuat Metafields (implementasi)

**Status:** ✅ IMPLEMENTED (`bff-v20`). **Sifat:** aditif, gated, dorman (best-effort).
**Bagian dari:** rancangan [01](01-category-attributes-reverse-shape-b.md) §11 fase R-B2.
**Prasyarat:** [02 — R-B0](02-r-b0-pure-inverse-implementation.md) (yang **membaca** metafields dari item).

R-B0 + R-B1 sudah membangun seluruh mesin keputusan — tapi mereka membaca metafields **dari item yang
ditarik**. Masalahnya: **item Shopify yang ditarik reverse tidak memuat metafields.** R-B2 memperbaiki itu:
membuat payload hasil-fetch **mengandung** `product.metafields`, sehingga R-B0 punya sesuatu untuk dibaca.

---

## 1. Kenapa tahap ini ada (temuan penting)

Reverse item-fetch Shopify = **REST GET** `products/{id}.json` (via `reverseSyncConfig.readEndpoints`). REST
**tidak** mengembalikan category metafields — di Shopify metafields itu **GraphQL-only** (resource terpisah
di REST). Jadi tanpa langkah tambahan, payload yang ditarik **tak punya** `product.metafields` → op
`METAFIELD_INVERSE` (R-B0) tak menemukan apa-apa → nol category attribute masuk.

> Ini **soal bentuk query, bukan tembok API** (seperti dicatat jujur di [`01` §7](01-category-attributes-reverse-shape-b.md)):
> metafields bisa diminta lewat GraphQL; yang kurang cuma **panggilannya**.

**Kabar baik: pola untuk ini sudah ada.** Persoalan identik sudah dipecahkan untuk **kategori** —
`products/{id}.json` juga tak membawa taxonomy category, jadi ada `categoryFetch`: **panggilan GraphQL
kedua** yang mengambil apa yang REST hilangkan lalu **inject** ke payload di `targetPath`. R-B2 = **mirror
pola itu** untuk metafields.

---

## 2. Ide inti: panggilan GraphQL kedua yang inject ARRAY

```
readEndpoints (REST GET, sudah ada)                 metafieldsFetch (GraphQL kedua, R-B2)
─────────────────────────────────                   ─────────────────────────────────────
products/{id}.json → { product: { …, variants,      { product(id:"gid…"){ metafields(namespace:"shopify",
                       images, options, status } }     first:250){ nodes{ namespace key value } } } }
        │                                                       │
        │  (metafields TAK ADA di sini)                         │  nodes = [{namespace,key,value}, …]
        ▼                                                       ▼
        └──────────── deep-merge + inject ──────────────────────┘
                         payload.product.metafields = [{namespace,key,value}, …]
                                     │
                                     ▼   (dibaca R-B0 di metafieldsPath)
                         METAFIELD_INVERSE → channelData
```

Beda dari `categoryFetch`: kategori meng-inject **satu skalar** (`category id`); metafields meng-inject
**array**. Sisanya identik (GraphQL POST, reuse header+token yang sama, best-effort).

---

## 3. Yang dibangun

### (a) Config `MetafieldsFetchConfig` (mirror `CategoryFetchConfig`)
Field `metafieldsFetch` pada `ReverseSyncConfig`. Semua **data**, nol literal channel:

| Field | Arti | Seed Shopify (R-B4) |
|---|---|---|
| `urlTemplate` | endpoint GraphQL (`{storeUrl}`,`{apiVersion}`) | `https://{storeUrl}/admin/api/{apiVersion}/graphql.json` |
| `productGidTemplate` | bangun GID (`{channelProductId}`) | `gid://shopify/Product/{channelProductId}` |
| `query` | query GraphQL (`{productGid}`) | `{ product(id:"{productGid}"){ metafields(namespace:"shopify",first:250){ nodes{ namespace key value } } } }` |
| `itemsJsonPath` | dot-path ke array nodes | `data.product.metafields.nodes` |
| `targetPath` | ke mana array di-inject (= `metafieldsPath` R-B0) | `product.metafields` |

### (b) Extractor pure `ReverseMetafieldFetch.extractNodes`
Ambil array nodes dari respons GraphQL di `itemsJsonPath`, normalisasi ke `List<Map>`. Null/absen/bukan-list
→ kosong (never-guess). **Pure → testable** (paruh reactive-nya dipisah, seperti pola forward).

### (c) Reactive fetch+inject `enrichWithMetafields` (di `ReverseChannelFetchService`)
Mirror `enrichWithCategory`: GraphQL POST → `extractNodes` → `putByPath(payload, targetPath, array)`.
Di-chain **setelah** enrichWithCategory di `fetchEndpoints`.

---

## 4. Kapan jalan (gating) — dan kenapa di kedua use-case

```
enrichWithCategory   : jalan bila (import & categoryFetch != null & bearer)      → IMPORT saja
enrichWithMetafields : jalan bila (metafieldsFetch != null & bearer)             → IMPORT + RECONCILE
```

Kenapa metafields jalan di **reconcile** juga (beda dari kategori yang import-saja)? Karena payoff terbesar
SHAPE B adalah **round-trip dirty-detection pada reconcile** ([`01` §9](01-category-attributes-reverse-shape-b.md)):
saat produk ter-link ditarik ulang, metafields harus terbaca agar status sinkron jujur. Gating hanya pada
**config + bearer** → begitu di-seed (R-B4), aktif di kedua jalur.

**Dorman sekarang:** `metafieldsFetch` belum di-seed untuk channel mana pun → `rc.getMetafieldsFetch()`
null → langkah di-skip → nol perubahan perilaku (semua channel, termasuk Shopify hari ini). Aman.

---

## 5. Sifat: aman

- **Best-effort:** fetch gagal / nol metafields → payload tak diubah (log info/warn), tak pernah blok pull.
- **Gated + dorman:** tanpa `metafieldsFetch` di config → tak jalan.
- **Aditif:** langkah baru di chain fetch; REST GET + `categoryFetch` tak berubah. Reuse header+token yang sama.
- **Generic:** semua path/query/namespace = config; channel SHAPE B berikutnya cukup seed `metafieldsFetch`.

---

## 6. Cakupan test (`ReverseMetafieldFetchTest`, 3)

| Test | Membuktikan |
|---|---|
| `extracts` | `extractNodes` menarik array metafields di `itemsJsonPath` |
| `nullAndAbsentSafe` | null / path tak ada / skalar (bukan list) → kosong |
| `extractInjectInvert` | **end-to-end shape:** extract → `putByPath` di `product.metafields` → R-B0 `invert` → `channelData` benar |

Test ketiga adalah kunci: membuktikan **bentuk** array hasil-fetch (`[{namespace,key,value}]`) **persis** yang
R-B0 baca — jadi R-B2 dan R-B0 bertaut rapat. Regresi `ReverseChannelFetchServiceTest` (17) tetap hijau
(chain baru tak merusak jalur fetch lama).

---

## 7. Pointer kode

| Potongan | File |
|---|---|
| Config | `ChannelConfiguration.MetafieldsFetchConfig` + field `ReverseSyncConfig.metafieldsFetch` |
| Extractor pure | `reversesync/service/ReverseMetafieldFetch.extractNodes` |
| Reactive fetch+inject | `reversesync/service/ReverseChannelFetchService.enrichWithMetafields` (+ chain di `fetchEndpoints`) |
| Test | `reversesync/ReverseMetafieldFetchTest` |

---

## 8. Berikutnya (R-B3..B5)

- **R-B3** — wire: **reuse read-only** fetch forward (defs + metaobjects, TANPA Jalur B write) → bangun dua
  peta via `ReverseMetafieldResolvers` (R-B1) → `ReverseMetafieldInverse.invert` (R-B0) atas item ber-metafields
  (R-B2) → MERGE ke `channelData`. Import vs Reconcile.
- **R-B4** — seed Shopify: op `METAFIELD_INVERSE` + config `metafieldsFetch`.
- **R-B5** — live-verify round-trip (publish → import → diff kosong).

Kembali ke rancangan → [01](01-category-attributes-reverse-shape-b.md).
