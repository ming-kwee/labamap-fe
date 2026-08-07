"use client";

/**
 * Seeds a "Master Product (JSON)" input from a real Product Type's master attributes
 * instead of a hardcoded/blind example. Shared by the JOLT Generation Console and
 * Publish Diagnostics (docs/FRONTEND-SAMPLE-FROM-PRODUCT-TYPE-RECOMMENDATION.md).
 *
 * Single source, no silent fallback: the sample comes only from a Product Type — global/common
 * fields (name, price, sku, description, brand) are ALWAYS included, type-specific fields are
 * added when they belong to the picked Product Type, and variant dimensions (color/size) come
 * from ProductType.variantDimensions. So even a Product Type with no type-specific attributes
 * (attributeCount: 0) still returns a usable sample — and may still carry variant axes, which is
 * why we do NOT label it "global only". The backend returns 404 only when the catalog has no
 * master attributes at all — a real config signal we surface as-is (no hardcoded fallback).
 *
 * The endpoint returns `{ sample, meta }` (backend update #2, 2026-07-08): we populate the
 * caller's textarea from `.sample` (editable), and render an accurate composition label from
 * `.meta` (e.g. "5 global · axes: color, size").
 */

import React, { useEffect, useState } from "react";
import { ProductTypeService } from "@/app/(admin)/omni-admin/product-types/_services/product-type.service";
import type { ProductType } from "@/app/(admin)/omni-admin/product-types/_types/product-type";
import { AiAdminService } from "../../services/aiAdmin.service";
import { AiApiError } from "../../types/common";
import type { SampleMasterProductMeta } from "../../types/session";
import { SparklesIcon } from "./icons";
import { Spinner } from "./ui";

/** "5 global · 2 khusus · axes: color, size · 3 channel" — accurate composition from the sample's meta. */
function compositionLabel(meta: SampleMasterProductMeta): string {
  const parts = [`${meta.globalFieldCount} global`];
  if (meta.typeSpecificFieldCount > 0) parts.push(`${meta.typeSpecificFieldCount} khusus`);
  if (meta.variantDimensions.length) parts.push(`axes: ${meta.variantDimensions.join(", ")}`);
  if (meta.channelFieldCount && meta.channelFieldCount > 0) parts.push(`${meta.channelFieldCount} channel`);
  return parts.join(" · ");
}

export function ProductTypeSampleLoader({
  onLoaded,
  onProductTypeChange,
  channelId,
  className = "",
}: {
  /** Called with the pretty-printed sample JSON when a Product Type sample loads. */
  onLoaded: (json: string) => void;
  /**
   * Optional — called with the currently selected Product Type (or null when cleared)
   * as the dropdown changes. Lets a caller drive category resolution from
   * ProductType.categorySlug (Phase 0B) off the same picker used for sample seeding.
   */
  onProductTypeChange?: (pt: ProductType | null) => void;
  /**
   * A1 (optional) — when given, a "sertakan channel fields" toggle appears; enabling it makes the
   * loaded sample ALSO include this channel's Step-2 channel-specific fields. Absent → toggle hidden
   * and behaviour is unchanged (master-only sample), so other callers stay unaffected.
   */
  channelId?: string;
  className?: string;
}) {
  const [types, setTypes] = useState<ProductType[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [meta, setMeta] = useState<SampleMasterProductMeta | null>(null);
  const [includeChannel, setIncludeChannel] = useState(false);

  useEffect(() => {
    let alive = true;
    setTypesLoading(true);
    ProductTypeService.list({ active: true })
      .then((ts) => { if (alive) setTypes(ts); })
      .catch(() => { if (alive) setTypes([]); })
      .finally(() => { if (alive) setTypesLoading(false); });
    return () => { alive = false; };
  }, []);

  async function load() {
    if (!selectedId || loading) return;
    setLoading(true);
    setWarning(null);
    setMeta(null);
    try {
      // Response envelope { sample, meta }: `.sample` seeds the textarea, `.meta` labels it.
      const { sample, meta } = await AiAdminService.getSampleMasterProduct(
        selectedId,
        channelId && includeChannel ? { channelId, includeChannelFields: true } : undefined,
      );
      onLoaded(JSON.stringify(sample, null, 2));
      setMeta(meta);
    } catch (e) {
      // 404 = catalog has no master attributes at all (not just this type) → config message, no fallback.
      if (e instanceof AiApiError) {
        setWarning(e.message.replace(/^\d{3}\s*/, ""));
      } else {
        setWarning(e instanceof Error ? e.message : "Gagal memuat sample");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedId(id); setWarning(null); setMeta(null);
            onProductTypeChange?.(types.find((t) => t.id === id) ?? null);
          }}
          disabled={typesLoading}
          className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">{typesLoading ? "Memuat product type…" : "Pilih Product Type…"}</option>
          {/* attributeCount = type-specific fields only; 0 is NOT "global only" (variant
              axes may still exist), so we only annotate when there are extra fields. */}
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.attributeCount > 0 ? ` · ${t.attributeCount} attribute khusus` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          disabled={!selectedId || loading}
          className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
        >
          {loading ? <Spinner size={12} /> : <SparklesIcon size={13} />}
          Load from Product Type
        </button>
      </div>
      {channelId && (
        <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeChannel}
            onChange={(e) => setIncludeChannel(e.target.checked)}
            className="h-3 w-3 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-400"
          />
          Sertakan channel fields (Step-2) untuk <strong>{channelId}</strong> — agar field channel-unique ikut terpetakan.
        </label>
      )}
      {warning ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
          ⚠ {warning}
        </p>
      ) : meta ? (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5">
          ✓ Sample dimuat — {compositionLabel(meta)}
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
          Field global (name, harga, sku, deskripsi, brand) selalu disertakan — Product Type tanpa
          attribute khusus tetap menghasilkan sample (bisa termasuk axis variasi seperti color/size).
        </p>
      )}
    </div>
  );
}
