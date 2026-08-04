# Permintaan enhancement (FE → Backend): `inputExample` / `outputExample` per op di katalog post-processing

> **✅ SELESAI (2026-08-02).** Backend sudah menambahkan `inputExample`, `outputExample`, `exampleCaption`
> ke `GET /post-processing/catalog` — **12 op reshape** ter-cover (BUILD_ATTRIBUTE_LIST, WRAP_ARRAY_TO_OBJECTS,
> EXTRACT_DIMENSIONS, BUILD_CHOICES_MAP, MAP_TO_INDEXED, WRAP_TO_LIST, NEST_FIELD, SET_FROM_LIST_AGGREGATE,
> FOR_EACH, CROSS_LINK, TRANSLATE_VALUE_IDS, STRING_TO_OBJECT). FE sudah wired: `OpExampleView` membaca
> contoh langsung dari katalog (panel **"Cara kerja: sebelum → sesudah"** berlabel *dari engine*), dan kurasi
> manual `opCatalogExamples.ts` sudah **dihapus**. Dokumen ini disimpan sebagai catatan kontrak.

> **Ringkasan (permintaan asli).** Frontend Review Queue kini menampilkan, saat developer meng-klik **op yang disarankan**
> untuk sebuah post-processing gap, sebuah panel **"Apa yang dihasilkan op ini"** — berisi deskripsi, params,
> dan `jsonExample` dari `GET /post-processing/catalog`. Untuk op yang **mengubah bentuk data**
> (mis. `BUILD_ATTRIBUTE_LIST`, `WRAP_ARRAY_TO_OBJECTS`), visual **sebelum → sesudah** jauh lebih cepat
> dipahami daripada prosa. Saat ini contoh before/after itu **di-kurasi manual di FE** (ilustratif, berisiko
> drift). Kami meminta backend menambah **`inputExample` + `outputExample`** (data nyata) ke tiap entri
> katalog agar FE bisa merender contoh **otoritatif & bebas-drift**.
>
> Konteks terkait: [16-jolt-agent-gap-recommendations.md](16-jolt-agent-gap-recommendations.md) (#3 katalog op),
> [05-post-processing-config.md](05-post-processing-config.md) (definisi op), dan
> [../../../FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md](../../../FRONTEND-JOLT-AGENT-POST-PROCESSING-GAPS.md)
> (kontrak gap FE).

---

## 1. Latar & motivasi

Endpoint `GET /labamap/api/v1/post-processing/catalog` sudah dikonsumsi FE
(`AiAdminService.getPostProcessingCatalog()`). Tiap operasi mengembalikan:

```jsonc
{
  "opCode": "BUILD_ATTRIBUTE_LIST",
  "scope": "DOCUMENT",
  "description": "Reshapes the generic staged pairs … [{attribute_id:<int>, attribute_value_list:[{value_id:<int>}]}] …",
  "params": [ /* name, type, required, defaultValue, allowedValues, description */ ],
  "jsonExample": { "op": "BUILD_ATTRIBUTE_LIST" }
}
```

Masalahnya: **`jsonExample` adalah _konfigurasi op_** (cara menuliskan rule), **bukan _data_ input→output**
(apa yang op itu hasilkan). Untuk developer yang harus **membuat post-processing rule** dari sebuah gap,
pertanyaan pertamanya adalah "kalau op ini jalan, data berubah jadi seperti apa?". Deskripsi memuatnya
sebagian dalam bentuk prosa, tapi bentuk **data before→after** lebih tepat.

Sementara ini FE menambal dengan contoh **ter-kurasi manual** (`opCatalogExamples.ts`) untuk segelintir op —
ditandai jelas sebagai **"ilustrasi, bukan output aktual"**. Ini solusi tambal: rawan **drift** dari perilaku
engine dan tak menskala ke 33 op. Sumber kebenaran yang benar adalah **engine itu sendiri**.

## 2. Permintaan

Tambahkan **tiga field opsional** (additive, backward-compatible) ke tiap entri `operations[]`:

| Field | Tipe | Arti |
|---|---|---|
| `inputExample` | any JSON | Cuplikan data **sebelum** op berjalan (nilai di `rule.sourcePath` / field input). |
| `outputExample` | any JSON | Cuplikan data **sesudah** op berjalan (nilai di `rule.targetPath` / field hasil). |
| `exampleCaption` | string (opsional) | Satu kalimat penjelas transform (mis. "numerik → value_id; non-numerik → original_value_name"). |

Contoh untuk `BUILD_ATTRIBUTE_LIST`:

```jsonc
{
  "opCode": "BUILD_ATTRIBUTE_LIST",
  "scope": "DOCUMENT",
  "description": "…",
  "params": [],
  "jsonExample": { "op": "BUILD_ATTRIBUTE_LIST" },

  "inputExample": [
    { "id": 100, "value": 7 },
    { "id": 200, "value": "Cotton" }
  ],
  "outputExample": [
    { "attribute_id": 100, "attribute_value_list": [ { "value_id": 7 } ] },
    { "attribute_id": 200, "attribute_value_list": [ { "original_value_name": "Cotton" } ] }
  ],
  "exampleCaption": "Pasangan {id,value} → attribute_list Shopee. Nilai numerik jadi value_id; non-numerik jadi original_value_name."
}
```

Contoh untuk `WRAP_ARRAY_TO_OBJECTS`:

```jsonc
{
  "opCode": "WRAP_ARRAY_TO_OBJECTS",
  "jsonExample": { "op": "WRAP_ARRAY_TO_OBJECTS", "field": "tags", "wrapKey": "value" },
  "inputExample": ["S", "M", "L"],
  "outputExample": [ { "value": "S" }, { "value": "M" }, { "value": "L" } ],
  "exampleCaption": "Array string datar → array objek satu-kunci (field=tags, wrapKey=value)."
}
```

## 3. Dari mana datanya (usulan implementasi backend)

Beberapa opsi, urut preferensi:

1. **Turunkan dari fixture/unit-test op yang sudah ada.** Tiap op transformasi kemungkinan sudah punya
   test dengan input & expected output — jadikan itu `inputExample`/`outputExample` (nyata, ter-verifikasi CI,
   nol drift karena berasal dari test yang gating perilaku).
2. **Anotasi statis di registry op.** Doc 16 menyebut katalog sudah menyimpan *"satu contoh nyata per op"*
   (`example`) di `AgentToolHandlerService.postProcessingOpCatalog()` — tambahkan `inputExample`/`outputExample`
   di sumber yang sama, sehingga otomatis ikut terekspos.
3. **Generate saat build/serve** dengan menjalankan op pada sampel kecil (kalau op murni & deterministik).

Cukup untuk **op yang mengubah bentuk** (list→objek, flat→nested, agregasi, iterasi, reshape). Op sepele
(`SET_DEFAULT`, `RENAME_FIELD`, `COERCE_TYPE`, `REMOVE_FIELD`, tipe legacy) **tak perlu** contoh — biarkan
field-nya absen.

## 4. Kriteria penerimaan

- [x] `GET /post-processing/catalog` mengembalikan `inputExample`, `outputExample` (dan opsional
      `exampleCaption`) pada op reshape berikut: `BUILD_ATTRIBUTE_LIST`, `WRAP_ARRAY_TO_OBJECTS`,
      `EXTRACT_DIMENSIONS`, `BUILD_CHOICES_MAP`, `MAP_TO_INDEXED`, `WRAP_TO_LIST`, `NEST_FIELD`,
      `SET_FROM_LIST_AGGREGATE`, `FOR_EACH`, `CROSS_LINK`, `TRANSLATE_VALUE_IDS`, `STRING_TO_OBJECT` (12 op).
- [x] Field bersifat **opsional & additive** — konsumen lama (yang hanya baca `description`/`params`/`jsonExample`)
      tak berubah perilakunya.
- [x] `inputExample`/`outputExample` adalah **data nyata** (bukan config op) dan **konsisten** satu sama lain
      (output benar-benar hasil menjalankan op pada input tsb).
- [x] Idealnya berasal dari test/fixture agar terjaga saat perilaku op berubah.

## 5. Dampak di frontend setelah tersedia

FE sudah siap dan hanya perlu perubahan kecil:

- **Tipe:** tambah `inputExample?`, `outputExample?`, `exampleCaption?` di `PostProcessingOp`
  (`src/modules/ai-admin/types/opCatalog.ts`).
- **Render:** `OpExampleView` (`RecommendationsReviewQueue.tsx`) beralih membaca contoh **dari katalog**;
  hapus/hentikan pemakaian `opCatalogExamples.ts` (kurasi manual) setelah op-op utama tercakup.
- **Perilaku:** panel op menampilkan before→after otoritatif untuk op mana pun yang mengirim contoh; op tanpa
  contoh cukup menampilkan deskripsi (seperti sekarang). Label "ilustrasi" bisa dilepas karena data jadi nyata.

## 6. Non-goals / catatan

- **Bukan** endpoint baru — cukup memperkaya payload katalog yang sudah ada.
- Bahasa `description` tetap Inggris (wording engine); FE punya lapisan glos ID sendiri. `exampleCaption`
  boleh Inggris — FE akan menampilkannya apa adanya (atau memberi glos bila perlu).
- Params tetap seperti sekarang; permintaan ini hanya soal contoh **data** input/output.
