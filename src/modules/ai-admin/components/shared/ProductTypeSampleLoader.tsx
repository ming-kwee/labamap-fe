"use client";

/**
 * Seeds a "Master Product (JSON)" input from a real Product Type's master attributes
 * instead of a hardcoded/blind example. Shared by the JOLT Generation Console and
 * Publish Diagnostics (docs/FRONTEND-SAMPLE-FROM-PRODUCT-TYPE-RECOMMENDATION.md).
 *
 * Single source, no silent fallback: if the Product Type has no active master
 * attributes the backend returns 404 with a config message — we surface it and do
 * NOT populate a hardcoded example. The loaded JSON is a starting point; the caller's
 * textarea stays editable.
 */

import React, { useEffect, useState } from "react";
import { ProductTypeService } from "@/app/(admin)/omni-admin/product-types/_services/product-type.service";
import type { ProductType } from "@/app/(admin)/omni-admin/product-types/_types/product-type";
import { AiAdminService } from "../../services/aiAdmin.service";
import { AiApiError } from "../../types/common";
import { SparklesIcon } from "./icons";
import { Spinner } from "./ui";

export function ProductTypeSampleLoader({
  onLoaded,
  className = "",
}: {
  /** Called with the pretty-printed sample JSON when a Product Type sample loads. */
  onLoaded: (json: string) => void;
  className?: string;
}) {
  const [types, setTypes] = useState<ProductType[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

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
    try {
      const sample = await AiAdminService.getSampleMasterProduct(selectedId);
      onLoaded(JSON.stringify(sample, null, 2));
    } catch (e) {
      // 404 = Product Type has no active master attributes → config message, no fallback.
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
          onChange={(e) => { setSelectedId(e.target.value); setWarning(null); }}
          disabled={typesLoading}
          className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">{typesLoading ? "Memuat product type…" : "Pilih Product Type…"}</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
      {warning && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
          ⚠ {warning}
        </p>
      )}
    </div>
  );
}
