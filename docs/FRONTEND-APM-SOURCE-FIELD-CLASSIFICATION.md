# FRONTEND — Warnai source field: universal vs channel-specific

> **Untuk tim FE.** Respons analyze kini menyertakan **`sourceFieldClassification`** — penanda per source
> field yang membedakan field **universal** dari field **channel-specific** (dan yang **unik** ke channel
> terpilih). Gunakan untuk mewarnai font/badge di panel JSON source, sehingga developer langsung membedakan
> mana field milik channel. Tersedia untuk **kedua** mode Publish Diagnostics — **"Dari My Products"**
> (JSON produk) dan **"Paste JSON"** (JSON manual).

---

## 1. Kontrak (BE → FE)

Field baru di root `AdaptivePatternMatchingResponse` (endpoint `/adaptive-pattern-matching/analyze`) dan —
melalui jalur yang sama — di respons `/channels/publish/analyze`:

```jsonc
"sourceFieldClassification": {
  "name":                 { "scope": "UNIVERSAL",      "isChannelField": false },
  "material":             { "scope": "CHANNEL_SHARED",  "isChannelField": true, "supportedChannels": ["tiktokshop","lazada"] },
  "tiktokshopCategoryId": { "scope": "CHANNEL_UNIQUE",  "isChannelField": true, "supportedChannels": ["tiktokshop"] }
}
```

- **Key** = source path (sama dengan kolom "Source" / key di panel JSON).
- **`scope`**: `UNIVERSAL` | `CHANNEL_SHARED` | `CHANNEL_UNIQUE`.
- **`isChannelField`**: boolean — apakah ini master attribute channel-specific (`isChannelField=true`).
- **`supportedChannels`**: daftar channel yang mendeklarasikan field ini (dihilangkan bila universal).

`@JsonInclude(NON_NULL)`: field **dihilangkan** bila tak terhitung (mis. tak ada `channelId` / tak ada
source field). Jadi FE harus perlakukan ketiadaannya sebagai "tak ada info klasifikasi" (fallback netral).

## 2. Makna scope

| scope | arti | contoh | warna saran |
|---|---|---|---|
| `UNIVERSAL` | bukan channel field — master field umum | `name`, `price`, `description` | abu-abu (default) |
| `CHANNEL_SHARED` | channel field yang dibagi channel terpilih **+ channel lain** | `material` (tiktokshop+lazada) | biru |
| `CHANNEL_UNIQUE` | channel field yang **hanya** channel terpilih deklarasikan | `tiktokshopCategoryId` | oranye / tegas |

Klasifikasi **relatif terhadap channel terpilih**: field yang unik untuk channel A akan tampil UNIVERSAL saat
menganalisa channel B (karena bukan channel field milik B). Ini benar & diinginkan.

## 3. Cara pakai (saran)

```tsx
const cls = response.sourceFieldClassification ?? {};
const SCOPE_CLASS: Record<string, string> = {
  UNIVERSAL:      "text-gray-500",
  CHANNEL_SHARED: "text-blue-600",
  CHANNEL_UNIQUE: "text-orange-600 font-semibold",
};
// saat merender tiap source key / baris:
const scope = cls[sourcePath]?.scope;
const className = SCOPE_CLASS[scope ?? ""] ?? "text-gray-500";   // fallback netral bila tak ada info
```

Tambahkan legenda kecil (Universal · Channel-shared · Channel-unique) + tooltip yang menampilkan
`supportedChannels` pada field channel.

Tipe TS yang disarankan:

```ts
type SourceFieldScope = "UNIVERSAL" | "CHANNEL_SHARED" | "CHANNEL_UNIQUE";
interface SourceFieldTag {
  scope: SourceFieldScope;
  isChannelField: boolean;
  supportedChannels?: string[];
}
// tambahkan ke response type:
sourceFieldClassification?: Record<string, SourceFieldTag>;
```

## 4. Catatan

- **Data-driven**: klasifikasi dibaca dari `ecommerce_master_attributes` (`isChannelField` +
  `supportedChannels`) — tak ada daftar field hardcoded; menambah/ubah field channel = ubah data, bukan kode.
- **Name-based**: cocok berdasarkan nama field (leaf), jadi berlaku untuk JSON manual (tanpa produk) sama
  seperti JSON produk.
- **Best-effort**: bila lookup gagal, respons tetap normal tanpa `sourceFieldClassification` — jangan
  jadikan blocking.
- Berpasangan dengan `reasoning` per mapping (lihat `FRONTEND-APM-INSPECTOR-REFRAME.md`): scope menandai
  **field**, reasoning menjelaskan **match** — dua lensa berbeda untuk inspektur developer.

---

## 5. Implementasi FE (SELESAI, 2026-08-02)

- **Tipe** (`ecommerce-product-v2/types/channel-mapping.ts`): `SourceFieldScope`, `SourceFieldTag`, dan
  `sourceFieldClassification?` di `AdaptivePatternMatchingResponse`; field yang sama ditambahkan ke
  `PublishAnalysisResponse` (`types/publish-analysis.ts`).
- **UI** (`ai-admin/components/diagnostics/PublishDiagnosticsPage.tsx`):
  - Helper `SCOPE_META` (warna: universal=abu, channel-shared=biru, channel-unique=oranye+bold),
    `classifySourceField()` (lookup exact → leaf), `scopeTooltip()` (menampilkan `supportedChannels`).
  - `SourceScopeLegend`, `SourceFieldName` (kode source berwarna), `SourceFieldClassificationCard`
    (legenda + chip semua source field, channel-unique diurut dulu) — dipakai **kedua** mode.
  - **Mode Paste JSON** (`DiagnosticsResult`): kolom "Source" di tabel mapping + badge unmapped source
    diwarnai per scope; legenda di atas tabel; card klasifikasi.
  - **Mode My Products** (`PublishAnalysisResult`): card klasifikasi.
- **Null-safe**: semua elemen tersembunyi bila `sourceFieldClassification` absen (fallback netral).
  Kontrak terverifikasi live di `POST /adaptive-pattern-matching/analyze`.
