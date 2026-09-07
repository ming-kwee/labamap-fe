/**
 * Indonesian gloss for post-processing op descriptions.
 *
 * The engine catalog (`GET /post-processing/catalog`) returns English descriptions — the exact
 * engine wording. These are faithful ID translations keyed by opCode, shown to make the "what
 * this op produces" panel readable for the review team. The original EN stays available behind a
 * toggle in the UI (source of truth for developers).
 *
 * ⚠ Drift note: if the backend rewords a description, this gloss can go stale. It is a display
 * aid, not the contract — hence the EN original is always one click away. Ops with no entry here
 * fall back to the English text.
 */
export const OP_GLOSS_ID: Record<string, string> = {
  SET_FIELD:
    "Menetapkan nilai pada path dot-notation mana pun di dokumen tingkat atas. Membuat map perantara bila perlu.",
  CONDITIONAL_SET:
    "Menetapkan nilai pada suatu path hanya ketika kondisi tertentu bernilai true.",
  CROSS_LINK:
    "Mengelompokkan URL media varian berdasarkan nilai dimensi (mis. warna) menjadi daftar objek {choiceValue, optionKey, mediaUrls} yang dipakai WIX Link Media to Choices.",
  TRANSLATE_VALUE_IDS:
    "Menerjemahkan nama nilai menjadi value ID channel pada array target (rule.targetPath) memakai indeks kapabilitas ter-stage di rule.sourcePath. Untuk tiap entri target, mencocokkan matchField dengan value indeks, lalu menulis valueIdField dari pencarian nama (case-insensitive). No-op bila indeks tak ada atau tak ada kecocokan — dipakai untuk resolusi value_id attribute_list Shopee (§6).",
  WRAP_TO_LIST:
    "Membungkus skalar di rule.sourcePath menjadi list satu objek [{itemKey: value}] di rule.targetPath (mis. normal_stock N → seller_stock [{stock: N}]). Memakai defaultValue bila sumber tak ada agar field wajib tetap terisi; no-op bila keduanya tak ada.",
  COPY_PATH:
    "Menyalin nilai di rule.sourcePath ke rule.targetPath apa adanya (skalar/objek). Mengangkat nilai ter-stage yang independen dari JOLT (mis. \"_channelCategoryId\") menjadi field payload nyata (mis. \"category_id\") sehingga selalu ada, apa pun spec JOLT-nya. No-op bila sumber kosong; tak menimpa target dengan nilai kosong. Tidak 'memiliki' target, jadi spec yang menulis target dibiarkan.",
  BUILD_ATTRIBUTE_LIST:
    "Membentuk ulang pasangan ter-stage generik di rule.sourcePath ([{id, value}] — pilihan atribut-kategori Step-2 yang dikunci per attribute_id native) menjadi bentuk attribute_list add_item Shopee di rule.targetPath: [{attribute_id:<int>, attribute_value_list:[{value_id:<int>}]}]. id/value dikonversi ke angka bila numerik; nilai non-numerik ditulis sebagai original_value_name. No-op bila sumber kosong.",
  SET_FROM_LIST_AGGREGATE:
    "Menulis field dokumen dari agregat (MIN/MAX) sebuah field numerik di sepanjang list — meringkas nilai per-varian menjadi satu field tingkat-item yang diminta channel (mis. Shopee original_price item = MIN dari variants[].price; weight = MAX dari variants[].weight). Dengan onlyIfBlankOrZero=true hanya mengisi bila target kosong/nol, sehingga nilai item asli tak tertimpa. Menulis nilai mentah pemenang (tipe dipertahankan); tak mengarang/menskala nilai. No-op bila list kosong atau tanpa nilai numerik.",
  FOR_EACH:
    "Mengiterasi tiap item di list rule.sourcePath dan menerapkan urutan operasi PER_ITEM. Hasil ditulis ke rule.targetPath.",
  EXTRACT_DIMENSIONS:
    "Mengekstrak nilai dimensi unik dari daftar varian dan membangun struktur options/attributes siap-channel (mis. options[] Shopify atau productOptions[] WIX).",
  MAP_TO_INDEXED:
    "Menulis tiap nilai dimensi dari varian ke field ber-indeks seperti option1, option2, option3 langsung pada tiap map varian. Diwajibkan varian Shopify.",
  FILTER:
    "Menghapus item dari list yang tak memenuhi kondisi. Hasil menggantikan list di rule.targetPath.",
  BUILD_CHOICES_MAP:
    "Menambahkan field map 'choices' (atau outputField kustom) ke tiap item, berisi pasangan kunci→nilai dimensinya. Dipakai choices varian WIX.",
  ENRICH_VARIANT_MEDIA:
    "Mengubah field array URL (variantImages) pada tiap varian menjadi objek media siap-channel dengan anchor choice opsional. Jalan setelah CROSS_LINK.",
  BUILD_SALES_ATTRIBUTES:
    "Membangun array sales_attributes TikTok Shop dari dimensi varian. CATATAN: dikonfigurasi di channel data tetapi belum diimplementasikan di engine — akan memunculkan peringatan unknown-op sampai diimplementasikan.",
  SET_DEFAULT:
    "Menetapkan field pada item hanya bila field belum ada. Nilai yang sudah ada tak pernah ditimpa.",
  UNWRAP_FIELD:
    "Membuka list satu-elemen menjadi skalar, atau melepas notasi kurung dari nilai string seperti \"[https://...]\". No-op bila field punya banyak elemen.",
  STRING_TO_OBJECT:
    "Mengubah item string mentah (disimpan sebagai _raw_value oleh FOR_EACH) menjadi field ber-kunci. Harus jadi langkah pertama saat item list berupa string biasa.",
  AUTO_INCREMENT:
    "Memberikan integer yang naik berurutan ke sebuah field. Counter reset ke startAt di awal tiap eksekusi FOR_EACH.",
  RENAME_FIELD:
    "Mengganti nama kunci field, mempertahankan nilainya. No-op bila field sumber tak ada.",
  REMOVE_FIELD:
    "Menghapus field dari map item sepenuhnya. No-op bila field tak ada.",
  COPY_FIELD:
    "Menyalin nilai dari satu field ke field lain tanpa menghapus field sumbernya.",
  NEST_FIELD:
    "Memindahkan field datar ke path dot-notation bersarang dalam item yang sama, membuat map perantara. No-op bila field sumber tak ada. Dipakai membentuk ulang varian datar menjadi bentuk bersarang channel (mis. WIX variant.priceData.price).",
  COERCE_TYPE:
    "Mengonversi nilai field ke tipe primitif JSON tertentu. Berguna untuk channel yang meminta price atau weight sebagai string.",
  WRAP_ARRAY_TO_OBJECTS:
    "Mengubah array string datar menjadi array objek satu-kunci. Contoh: [\"S\",\"M\"] → [{\"value\":\"S\"},{\"value\":\"M\"}].",
  BUILD_STOCK_INFOS:
    "Membangun array stock_infos TikTok Shop dengan warehouse_id dan quantity. CATATAN: dikonfigurasi di channel data tetapi belum diimplementasikan di engine — akan memunculkan peringatan unknown-op sampai diimplementasikan.",
  TO_STRING:
    "Mengonversi nilai field ke representasi string-nya. CATATAN: dikonfigurasi di channel data tetapi belum diimplementasikan di engine — pakai COERCE_TYPE dengan toType=string sebagai gantinya.",
  // (The 6 legacy `type` ops — ENRICH_IMAGES/ENRICH_MEDIA/ENRICH_VARIANTS/GENERATE_OPTIONS/MAP_DIMENSIONS/
  //  LINK_MEDIA_TO_CHOICES — were decommissioned on the backend; the catalog no longer returns them.)
};
