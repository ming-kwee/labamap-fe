"use client";

import React, { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MasterProductService } from "../../_services/master-product.service";
import ProductCreatePage from "@/modules/ecommerce-product-v2/step1-create/components/ProductCreatePage";
import type { MasterProduct } from "@/modules/ecommerce-product-v2/types/product";

interface Props {
  params: Promise<{ masterProductId: string }>;
}

export default function EditProductPage({ params }: Props) {
  const { masterProductId } = use(params);
  const router = useRouter();
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await MasterProductService.getById(masterProductId, orgId);

      // Build the initialData for the form from the product's stored attributes.
      // productAttributes is the flat map that was submitted at create time.
      // We also carry over variants so the VariantConfigurator can restore them.
      // Gallery images = all saved images minus the main/featured one
      const galleryImages = (detail.images ?? []).filter(
        (u: string) => u !== detail.imageUrl
      );

      const attrs: Record<string, unknown> = {
        name:          detail.name,
        sku:           detail.sku        ?? undefined,
        basePrice:     detail.basePrice  ?? undefined,
        price:         detail.basePrice  ?? undefined,
        currency:      detail.currency   ?? undefined,
        description:   detail.description ?? undefined,
        // category: intentionally omitted — product_categories removed (2026-06-16).
        // Category-specific schema fields (brand, OS, storage, etc.) will not appear
        // in edit mode until backend migrates /form-schema/generate to accept productTypeId.
        // Tracked in: docs/02-api-reference/14-product-categories-migration-backend.md §Sprint 1
        // Map to both the schema field name AND the legacy key so either is pre-filled
        mainImage:     detail.imageUrl   ?? undefined,
        imageUrl:      detail.imageUrl   ?? undefined,
        galleryImages: galleryImages.length > 0 ? galleryImages : undefined,
      };

      // variantConfigurator: wrap variants in the shape the form expects.
      // Source priority for variant data:
      //   1. detail.variants from backend GET (ideal — often empty due to backend gap)
      //   2. sessionStorage — written by create flow, ChannelFieldsWizard.handlePreviousStep
      // hasVariants toggle is also driven by ?hasVariants=1 URL param set by
      // ChannelFieldsWizard when the product's schema contains a variant_overrides section,
      // which is reliable even when the backend GET returns variantCount=0/1.
      let variantsForForm: Record<string, unknown>[] = detail.variants ?? [];
      if (variantsForForm.length === 0 && typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem(`product_${masterProductId}`);
          if (stored) {
            const parsed = JSON.parse(stored) as { variants?: Record<string, unknown>[] };
            if (Array.isArray(parsed.variants) && parsed.variants.length > 0) {
              variantsForForm = parsed.variants;
            }
          }
        } catch { /**/ }
      }

      // URL param set by ChannelFieldsWizard.handlePreviousStep when the schema
      // contained a variant_overrides section — reliable fallback when backend
      // returns variantCount=0/1 for a product that does have variants.
      const hasVariantsFromUrl = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("hasVariants") === "1"
        : false;

      const hasVariants = variantsForForm.length > 0 || detail.variantCount > 1 || hasVariantsFromUrl;
      if (hasVariants) {
        attrs.hasVariants = true;
        // VariantConfigurator expects a JSON string — JSON.parse(value) is called internally.
        if (variantsForForm.length > 0) {
          attrs.variantConfigurator = JSON.stringify({ variants: variantsForForm });
        }
      }

      setInitialData(attrs);
      setProductName(detail.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [masterProductId, orgId]);

  useEffect(() => { load(); }, [load]);

  function handleProductSaved(_product: MasterProduct) {
    router.push(`/products/${masterProductId}`);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading product…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !initialData) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-error-50 dark:bg-error-500/10 flex items-center justify-center mx-auto mb-4 text-2xl">⚠</div>
        <p className="font-medium text-gray-900 dark:text-white mb-1">Failed to load product</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={load}
            className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            Retry
          </button>
          <Link
            href={`/products/${masterProductId}`}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            ← Back to product
          </Link>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
        <Link href="/products" className="hover:text-brand-500 transition-colors">My Products</Link>
        <span>›</span>
        <Link href={`/products/${masterProductId}`} className="hover:text-brand-500 transition-colors truncate max-w-[200px]">
          {productName || masterProductId}
        </Link>
        <span>›</span>
        <span className="text-gray-600 dark:text-gray-300">Edit</span>
      </div>

      <ProductCreatePage
        mode="edit"
        masterProductId={masterProductId}
        initialData={initialData}
        onProductSaved={handleProductSaved}
      />
    </div>
  );
}
