# Memahami: Apa Bedanya AI dengan APM, kalau Datanya Sama-Sama dari MongoDB?

> **Untuk siapa:** Anda yang bertanya — *"AI menganalisa data RAG, RAG diambil dari MongoDB. APM juga baca MongoDB. Jadi apa yang AI bantu jadi lebih baik dibanding APM murni?"*
>
> Ini pertanyaan yang tepat, dan kebingungannya wajar. Dokumen ini menjawabnya pelan-pelan.
> Referensi: [`PROPOSED-SYSTEM.md`](./PROPOSED-SYSTEM.md), [`RAG-DATA-FEEDING-AND-JOLT-GUIDE.md`](./RAG-DATA-FEEDING-AND-JOLT-GUIDE.md)

---

## 0. Jawaban singkat (baca ini dulu)

**Perbedaannya BUKAN pada sumber data — keduanya memang membaca MongoDB.**
**Perbedaannya pada CARA MEMPROSES data itu.**

- **APM** = mesin **pencocok string**. Ia mencocokkan nama field satu per satu berdasarkan kemiripan huruf. Cepat, murah, tapi "buta makna".
- **AI** = mesin **penalaran**. Ia (a) mengambil contoh-contoh yang **terbukti berhasil** dari masa lalu, (b) memahami **aturan channel**, (c) menalar seluruh produk sekaligus, dan (d) **memvalidasi & memperbaiki** hasilnya sendiri.

> **Analogi inti:** Dua murid ujian **open-book** dengan **buku yang sama** (MongoDB).
> - Murid A (APM) cuma bisa **Ctrl-F** mencari kata yang mirip.
> - Murid B (AI) **membaca, memahami, menghubungkan konsep, lalu menalar** jawaban.
>
> Buku sama. Hasil jauh berbeda. **Yang membedakan bukan bukunya, tapi kepala yang memakainya.**

---

## 1. Pertama, luruskan satu miskonsepsi

> "AI selalu menganalisa data RAG."

**Tidak sepenuhnya benar.** RAG hanya **SATU** dari beberapa sumber yang dipakai AI. Agent punya beberapa "alat" (tools):

| Alat AI | Baca dari RAG? | Isinya |
|---------|:---:|--------|
| `search_similar_jolt_specs` | ✅ RAG | JOLT masa lalu yang mirip (vector search) |
| `search_field_mappings` / `find_field_mappings` | ✅ RAG / DB | Mapping field + **successRate** historis |
| `get_channel_schema` | ❌ (baca ChannelConfiguration + aturan domain) | Aturan channel: "Shopify bungkus di `product.`" |
| `validate_jolt_spec` | ❌ (jalankan JOLT & cek) | Apakah JOLT-nya benar-benar valid |
| **Nalar LLM sendiri** | ❌ (pengetahuan umum model) | Paham konsep JOLT, JSON, struktur channel |

**Fakta dari uji nyata kita:** saat agent berhasil membuat JOLT untuk kategori `electronics`/`toys`/`garden` (AUTO_APPLIED 0.95), ia memakai **`get_channel_schema` + `validate_jolt_spec`** — **BUKAN** RAG search. Jadi "AI = analisa RAG saja" itu keliru. RAG adalah **memori/pengalaman**, tapi AI juga punya **aturan + nalar + validasi**.

---

## 2. Apa sebenarnya isi "data RAG" itu?

Ini kunci yang sering disalahpahami. Data RAG **bukan data mentah**. Ia adalah **hasil yang sudah terbukti**:

| Isi RAG | Kenapa berharga |
|---------|-----------------|
| JOLT spec yang **pernah berhasil publish** | "Cara ini terbukti jalan untuk Shopify baju" |
| Field mapping + **`successRate` + `usageCount`** | "`weight → variants[*].grams` sukses **97%** dari **234** kali" |
| Semantic knowledge (alias, pola) | "`title`, `name`, `product_name` itu makna sama" |

Bandingkan: APM juga baca `channel_field_mappings`, **tapi** ia hanya memakai angka `confidence` statis di satu field. AI memakai **bukti empiris** (`successRate` 97%, dipakai 234×) untuk **menimbang keputusan**. Data yang sama, tapi AI **membacanya sebagai bukti**, APM membacanya sebagai skor mati.

> **Poin penting:** RAG diisi dari MongoDB, **tapi** yang diembed adalah **outcome yang terbukti** (JOLT sukses, mapping ber-successRate tinggi) — bukan sekadar schema mentah. Ini "pengalaman terkurasi", bukan "data biasa".

---

## 3. Contoh sisi-per-sisi: input SAMA, hasil BEDA

Input master product (baju):
```json
{ "name":"Kemeja Batik", "price":150000, "weight":250, "sku":"KBP-001",
  "mainImage":"https://.../img.jpg", "variants":[{"color":"Merah","size":"M"}] }
```

### 🔵 APM murni (pencocok string)
```
name        → title           conf 0.85  ✅ (huruf mirip)
price       → price           conf 0.91  ✅ (persis)
sku         → sku             conf 0.95  ✅ (persis)
weight      → ???             conf 0.45  ❌ LEMAH — "weight" ≠ "grams" secara huruf
mainImage   → ???             conf 0.30  ❌ LEMAH — tak tahu strukturnya
variants... → ???             conf 0.55  ❌ LEMAH
```
APM **tidak tahu**:
- bahwa Shopify butuh semua field **dibungkus** `product.{...}` (jadi `title` seharusnya `product.title`),
- bahwa `weight` di Shopify masuk ke `product.variants[*].grams`,
- bahwa `mainImage` jadi `product.images[0].src`.

APM buta pada **struktur & aturan** — ia cuma lihat nama field. Hasil: confidence rata-rata rendah (~0.68) → butuh review manual.

### 🟢 AI (penalaran + RAG + aturan + validasi)
```
Tool 1 (RAG): "JOLT baju Shopify sebelumnya" → ketemu, sukses 0.93, ada pola weight & image
Tool 2 (aturan): get_channel_schema → "SEMUA field di bawah 'product.'; images → product.images[*].src"
Tool 3 (bukti): find_field_mappings(weight) → "→ variants[*].grams, successRate 97%, dipakai 234×"
Tool 4 (validasi): validate_jolt_spec → cek JOLT hasil, pastikan valid
→ Nalar: "title jadi product.title, weight jadi variants[*].grams (bukti 97%), image jadi images[0].src"
```
Hasil: JOLT lengkap + benar secara struktur, confidence naik ke ~0.84–0.95 → **auto-apply**.

**Perhatikan:** APM & AI **membaca DB yang sama**. Bedanya, AI **menghubungkan** potongan-potongan (produk + aturan channel + bukti historis + validasi) menjadi keputusan — sesuatu yang tidak bisa dilakukan pencocokan string.

---

## 4. Jadi, apa PERSISNYA yang AI tambahkan? (6 hal)

| # | Kemampuan AI | Kenapa APM tak bisa |
|---|--------------|---------------------|
| 1 | **Cari berdasarkan MAKNA, bukan ejaan** (vector search) | APM cocokkan huruf → `weight` vs `grams` gagal; RAG temukan "mapping weight yang terbukti" walau namanya beda |
| 2 | **Menalar holistik** (lihat seluruh produk + channel sekaligus) | APM skor tiap field terpisah, tak paham "semua harus di bawah `product.`" |
| 3 | **Paham aturan domain channel** | APM tak punya konsep "TikTok price harus STRING", "Shopify butuh wrapper" |
| 4 | **Menimbang dengan BUKTI** (successRate, usageCount) | APM cuma punya confidence statis, tak tahu mapping ini sukses 97% di produksi |
| 5 | **Validasi & perbaiki sendiri** (loop) | APM generate sekali, tak ada umpan balik; AI panggil `validate`, lihat error, perbaiki |
| 6 | **Sintesis untuk kasus BARU** | Kategori tanpa history: APM tak punya yang dicocokkan; AI **menyusun** JOLT baru dari aturan + mapping individual |

---

## 5. "Kalau begitu, buat apa APM? Kenapa tidak AI saja?"

Justru sebaliknya — **APM tetap penting**, dan sistemnya sengaja **APM-dulu, AI-belakangan** (disebut *cascade*):

| | APM | AI (agent) |
|---|-----|-----------|
| Kecepatan | ⚡ milidetik | 🐢 detik (panggil LLM) |
| Biaya | 💰 gratis | 💵 bayar token / kuota |
| Cocok untuk | kasus mudah (field persis, JOLT sudah tersimpan) | kasus sulit (field aneh, kategori baru, publish gagal) |

**Alur cascade (hemat + pintar):**
```
Produk masuk
   │
   ▼
APM coba dulu (murah, cepat)
   │
   ├─ Confidence TINGGI / JOLT sudah ada  → pakai hasil APM. SELESAI. (AI tak dipanggil → hemat)
   │
   └─ Confidence RENDAH / kategori baru / required field kosong
                                          → ESKALASI ke AI (baru bayar LLM di sini)
```

> Jadi AI **bukan pengganti** APM — AI adalah **"ahli yang dipanggil saat APM ragu"**. 90% kasus mudah diselesaikan APM gratis; 10% kasus sulit ditangani AI. Ini yang Anda uji dengan `AI_CASCADE_ENABLED=true`.

---

## 6. Kenapa sistem jadi makin pintar (yang APM tak bisa)

Ini keunggulan besar yang mudah terlewat — **feedback loop**:

```
AI hasilkan JOLT untuk kategori baru "electronics"
   → developer approve (atau AI auto-apply karena confidence tinggi)
   → JOLT itu TERSIMPAN ke MongoDB
   → di-embed ke RAG
   → PUBLISH BERIKUTNYA di "electronics": RAG sudah punya contoh terbukti!
   → confidence langsung tinggi, mungkin tak perlu AI lagi (APM/RAG cukup)
```

**APM statis** — aturannya tak pernah belajar dari hasil. **AI + RAG tumbuh** — tiap keputusan yang terbukti benar menjadi bahan pengetahuan berikutnya. Makin sering dipakai, makin sedikit AI dibutuhkan (karena RAG makin kaya).

Inilah kenapa dokumen menyebut RAG lebih baik dari fine-tuning: data baru **langsung** tersedia setelah di-embed (real-time), bisa di-audit (`ai_agent_sessions`), dan tak perlu retrain model.

---

## 7. Ringkasan satu kalimat

> **APM membaca MongoDB dan mencocokkan huruf. AI membaca MongoDB (lewat RAG + aturan + validasi) dan MENALAR — memakai pengalaman yang terbukti untuk memutuskan pemetaan yang benar, memvalidasi sendiri, dan menjadi lebih pintar setiap kali dipakai. Sumber datanya sama; kecerdasan pemrosesannya yang berbeda.**

### Peta cepat kapan siapa membantu
| Situasi | Yang menyelesaikan |
|---------|--------------------|
| Field persis (`price`→`price`), JOLT sudah tersimpan | **APM** (gratis, instan) |
| Nama field beda tapi maknanya sama (`weight`→`grams`) | **AI** (RAG makna + bukti successRate) |
| Aturan channel rumit (TikTok price=STRING, Shopify wrapper) | **AI** (aturan domain) |
| Kategori/channel baru tanpa history | **AI** (sintesis dari aturan + mapping) → lalu jadi data RAG baru |
| Publish gagal, perlu diperbaiki | **AI** (analisa root cause + patch) |
| JOLT lengkap sudah terbukti berkali-kali | **APM/RAG** (AI tak perlu lagi) |

---

## 8. Bukti dari sistem Anda sendiri (bukan teori)

Dari sesi uji nyata:
- **electronics/toys/garden** (kategori tanpa JOLT tersimpan) → AI menyusun JOLT baru, `validate_jolt_spec` lolos, **AUTO_APPLIED confidence 0.95**, tersimpan ke DB → **kini jadi data RAG** untuk publish elektronik berikutnya.
- **RAG search** (`min-similarity 0.58`) → query "color and size variant" mengembalikan mapping yang **benar-benar relevan** lintas channel (shopify/wix/tiktok) — dicari berdasarkan **makna**, bukan ejaan.
- **Cascade** → APM mendeteksi required field (title/sku) tak terpetakan pada kategori baru → **otomatis mengeskalasi ke AI**; saat AI tak tersedia (kuota habis) → **fallback aman ke APM** tanpa crash.

Ketiganya menunjukkan hal yang sama: **AI menambah penalaran & pengalaman di atas pencocokan mentah APM — dan hasilnya tersimpan kembali agar sistem tumbuh.**
