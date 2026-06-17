# Backend Spec — ProductType Channel Category Default: Leaf vs Mid-Node

**Untuk:** Backend Engineering Team  
**Tanggal:** 2026-06-16  
**Konteks:** Analisis granularity mismatch antara ProductType dan channel category leaf requirement.

---

## Masalah yang Ditemukan

`ChannelCategoryDefault` di `ProductTypeDocument` sebelumnya diasumsikan selalu menyimpan
**leaf node** dari channel taxonomy. Asumsi ini salah untuk ProductType yang broad.

### Contoh Konkret

```
ProductType "Toys" → Shopify default harus dipetakan ke mana?

Shopify taxonomy:
  Toys & Games (non-leaf)
    └── Toys (non-leaf)
          ├── Action Figures & Playsets  ← leaf
          ├── Building Blocks            ← leaf
          ├── Dolls & Accessories        ← leaf
          └── Educational Toys           ← leaf
```

Seorang merchant yang punya ProductType "Toys" menjual action figure, boneka, DAN building
blocks. Tidak ada satu leaf yang benar untuk seluruh ProductType ini.

**Yang seharusnya terjadi:**
- ProductType "Toys" → default Shopify: `"Toys & Games > Toys"` (mid-node, bukan leaf)
- Di Step 2, CategoryTreePicker **pre-navigasi** ke level "Toys & Games > Toys"
- Merchant **pilih sendiri** leaf yang tepat per produk (Action Figures, Dolls, dst.)

Ini berbeda dengan ProductType granular:
- ProductType "Kaos Pria" → default Shopee: `"Pakaian > Pria > Atasan > Kaos"` (leaf langsung)
- Di Step 2, CategoryTreePicker **pre-fill** sebagai final value — tidak perlu klik lagi

---

## Perubahan yang Diperlukan

### 1. Tambah `isLeaf: boolean` ke `ChannelCategoryDefault`

**Frontend sudah diupdate** (2026-06-16). Backend perlu menyimpan dan mengembalikan field ini.

```java
// ProductTypeDocument.java
public static class ChannelCategoryDefault {
    private String  channelType;
    private String  categoryId;
    private String  categoryName;
    private String  categoryFullPath;
    private Boolean isLeaf;          // NEW — null dianggap true (backward compat)
    private Instant updatedAt;
}
```

**DTO:**
```java
// ChannelCategoryDefaultDto.java
public record ChannelCategoryDefaultDto(
    String  channelType,
    String  categoryId,
    String  categoryName,
    String  categoryFullPath,
    Boolean isLeaf,          // NEW
    Instant updatedAt
) {}
```

**Backward compatibility:** Dokumen lama tanpa `isLeaf` → default ke `true` (semua default
lama adalah leaf karena frontend lama hanya mengizinkan leaf selection).

```java
// Mapper
Boolean isLeafValue = doc.getIsLeaf();
Boolean isLeaf = (isLeafValue != null) ? isLeafValue : Boolean.TRUE;
```

---

### 2. Perbarui `PUT /product-types/{id}/channel-defaults/{channelType}`

Terima `isLeaf` dari request body:

```java
// ChannelCategoryDefaultRequest.java
public record ChannelCategoryDefaultRequest(
    String  channelType,
    String  categoryId,
    String  categoryName,
    String  categoryFullPath,
    Boolean isLeaf           // NEW — required, frontend selalu mengirim ini
) {}
```

**Validasi:** Jika `isLeaf = false`, `categoryId` harus merupakan valid non-leaf node di
channel taxonomy yang bersangkutan. Validasi ini opsional (bisa trust frontend).

---

### 3. Perbarui Step 2 Schema Generation — Beda Perilaku isLeaf

Ini adalah perubahan terpenting. Saat `ChannelSchemaService` membangun schema untuk Step 2
dan menemukan ProductType default untuk channel ini:

#### Jika `isLeaf = true` (default granular, e.g., "Kaos Pria")

```java
// CategoryTreeConfig — pre-fill sebagai COMMITTED value
CategoryTreeConfig config = CategoryTreeConfig.builder()
    .rootEndpoint(...)
    .childEndpoint(...)
    .requireLeafNode(true)
    .selectedPath(buildPathNodes(categoryId))  // path dari root ke leaf
    .build();
// CategoryTreePicker akan tampilkan breadcrumb sudah ter-commit
// Merchant tidak perlu klik — langsung bisa submit
```

#### Jika `isLeaf = false` (hint, e.g., "Toys")

```java
// CategoryTreeConfig — pre-navigate TANPA commit
CategoryTreeConfig config = CategoryTreeConfig.builder()
    .rootEndpoint(...)
    .childEndpoint(...)
    .requireLeafNode(true)
    .preFillPath(buildPathNodes(categoryId))   // NEW field — navigate ke level ini
    // selectedPath TIDAK diset — tidak ada committed value
    .build();
// CategoryTreePicker akan buka di level "Toys & Games > Toys"
// Merchant harus pilih leaf sebelum bisa submit
```

---

### 4. Tambah `preFillPath` ke `CategoryTreeConfig`

```java
// CategoryTreeConfig.java
public class CategoryTreeConfig {
    private String rootEndpoint;
    private String childEndpoint;
    private int    maxDepth;
    private boolean requireLeafNode;

    /**
     * Committed path — last node IS the final selected leaf.
     * CategoryTreePicker shows this as the current committed value.
     * null = no category committed yet.
     */
    private List<CategoryTreeNode> selectedPath;

    /**
     * Pre-navigation path — CategoryTreePicker opens at this level
     * WITHOUT committing a value. Merchant must still pick a leaf.
     * Used when ProductType default is a mid-node (isLeaf=false).
     * null = open at root level.
     */
    private List<CategoryTreeNode> preFillPath;    // NEW
}
```

**Frontend sudah siap membaca `preFillPath`** — perlu implementasi di `CategoryTreePicker.tsx`
untuk menangani kasus ini (saat ini hanya membaca `selectedPath`).

---

### 5. `CategoryTreePicker.tsx` — Perlu Update Frontend (Phase Berikutnya)

Setelah backend mengirim `preFillPath`, frontend `CategoryTreePicker.tsx` perlu:

```typescript
// Saat komponen mount:
if (config.selectedPath) {
  // Sudah ada committed value — tampilkan breadcrumb ter-commit
  setCommittedPath(config.selectedPath);
} else if (config.preFillPath && config.preFillPath.length > 0) {
  // Ada hint — navigate ke level itu, tapi belum commit
  const lastNode = config.preFillPath[config.preFillPath.length - 1];
  loadLevel(lastNode.id, config.preFillPath);  // buka di level ini
  // committedPath tetap null — merchant harus pilih leaf
}
```

Ini adalah **next sprint item** — dependent pada backend `preFillPath` tersedia.

---

## Diagram Alur Lengkap

```
Merchant set ProductType "Toys" default di Channel Rules tab
    │
    ├── Browse "Toys & Games > Toys" (mid-node)
    │   → Klik "Use ↙" (bukan "Select ✓")
    │   → Frontend save: isLeaf=false, categoryId="toys-mid-id"
    │
    └── Browse "Toys & Games > Toys > Action Figures" (leaf)
        → Klik "Select ✓"
        → Frontend save: isLeaf=true, categoryId="action-figures-leaf-id"

Merchant buka Step 2 untuk produk bertipe "Toys"
    │
    ├── Backend ambil ProductType default: isLeaf=false, categoryId="toys-mid-id"
    │   → Schema generation: set preFillPath = [Toys & Games, Toys]
    │   → CategoryTreePicker buka di level "Toys" — belum ada committed value
    │   → Merchant pilih "Action Figures" → save ke channel_product_data
    │
    └── isLeaf=true, categoryId="action-figures-leaf-id"
        → Schema generation: set selectedPath = [Toys & Games, Toys, Action Figures]
        → CategoryTreePicker tampilkan pre-filled leaf — langsung bisa submit
```

---

## Checklist Backend ✅ DEPLOYED 2026-06-16

```
[x] Tambah isLeaf: Boolean ke ChannelCategoryDefault entity
    → nullable; null treated as true in schema generation (backward compat)
    → Javadoc: null/true = leaf commit, false = mid-node pre-navigate
[x] GET /product-types/{id} mengembalikan isLeaf (field ada di entity, serialized otomatis)
[x] PUT /product-types/{id} menerima isLeaf di body (field ada di entity, deserialized otomatis)
[x] GET /product-types/{id}/channel-defaults/{channelType} returns isLeaf (dari entity langsung)
[x] Tambah preFillPath ke CategoryTreeConfig record (NON_NULL, @JsonInclude)
[x] Step 2 schema generation (ChannelStepSchemaService):
    → productType threaded dari outer Mono.zip ke buildStoreSchema (parameter baru)
    → preFillPaths Map<fieldName, List<CategoryNode>> dibangun dari ProductType default isLeaf=false
    → preFillPaths dithread ke buildStoreResult → buildRequiredSection / buildRecommendedSection
       / buildOptionalSection → buildFormField (parameter baru di semua)
    → buildFormField: jika selectedPath null DAN preFillPaths punya entry → preFillPath diset
    → CategoryTreeConfig dibuat dengan preFillPath (sebelumnya hardcoded null)

Tidak diimplementasikan (next sprint):
[ ] buildPathNodes() full path reconstruction untuk preFillPath
    (saat ini hanya satu node — categoryId langsung dari default, bukan full ancestry chain)
    → Frontend perlu handle ini: jika preFillPath hanya 1 node, navigate langsung ke child level itu

Verifikasi:
[ ] ProductType "Kaos Pria" + isLeaf=true → savedChannelData ada → categoryPaths → selectedPath
[ ] ProductType "Toys" + isLeaf=false → no saved value → preFillPaths → preFillPath diset
[ ] Old data (isLeaf absent/null) → treated as true → no preFillPath (backward compat)
[ ] Respons GET /product-types/{id}: channelCategoryDefaults[].isLeaf ada
```

---

## Catatan Penting

**Kenapa ini penting:**  
Tanpa `preFillPath`, merchant yang punya ProductType broad (Electronics, Clothing, Toys)
tidak bisa set default yang berguna — mereka dipaksa pilih satu leaf yang tidak cocok untuk
semua produk di type tersebut. Dengan `preFillPath`, mereka bisa set "pre-navigation hint"
yang menghemat klik tanpa menyalahkan merchant.

**Mengapa Shopify/Shopee tetap require leaf:**  
Channel taxonomy requirement tidak berubah — `requireLeafNode: true` tetap. Perbedaannya
hanya di starting point: leaf default = langsung commit, mid-node default = pre-navigate
dan merchant pilih leaf.

**Referensi:**  
`docs/product/01-catalog-schema/01-guides/11-category-architecture-analysis.md` —
ChannelAdvisor quote: *"Product type classification works. Category hierarchy mapping does not."*
