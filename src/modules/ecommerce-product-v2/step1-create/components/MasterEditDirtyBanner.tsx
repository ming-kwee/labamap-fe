"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ArrowRight } from "@/shared/ui/icons/Icons";
import {
  ChannelProductDataService,
  PublishService,
} from "../../step2-channel-fields/services/channelStore.service";
import type { ListingState, PublishDiffResponse } from "../../step2-channel-fields/types/channelStore";

/**
 * Step-1 (master edit) awareness banner — DiffEngine 02-frontend-dirty-state §4.2.
 *
 * When editing a product that is ALREADY live on one or more channels, master-level edits (title,
 * price, description) won't reach the channels until a re-publish. This banner fetches the product's
 * live listings once, then — DEBOUNCED (~600ms) on the master form state — asks the read-only
 * `publish-diff` endpoint per live store (sending the current master draft) and aggregates how many
 * listings now have unpublished changes, linking to Step 3 to push them.
 *
 * Best-effort: hidden entirely when the product isn't live anywhere or the endpoint isn't deployed.
 */
export interface MasterEditDirtyBannerProps {
  masterProductId: string;
  /** Current master form state (flat) — sent as the draft desired-state for the diff. */
  desired: Record<string, unknown>;
}

interface Agg { total: number; dirty: number; blocked: number }

export default function MasterEditDirtyBanner({ masterProductId, desired }: MasterEditDirtyBannerProps) {
  const [liveStores, setLiveStores] = useState<ListingState[]>([]);
  const [agg, setAgg] = useState<Agg | null>(null);
  const desiredKey = useMemo(() => JSON.stringify(desired ?? {}), [desired]);
  const seqRef = useRef(0);

  // 1. Which stores is this product live on? (once)
  useEffect(() => {
    if (!masterProductId) return;
    let cancelled = false;
    ChannelProductDataService.getListings(masterProductId)
      .then((ls) => {
        if (!cancelled) setLiveStores(ls.filter((l) => l.status === "PUBLISHED" && !!l.channelProductId));
      })
      .catch(() => { /* listings endpoint absent — stay silent */ });
    return () => { cancelled = true; };
  }, [masterProductId]);

  // 2. Debounced diff across the live stores whenever the master draft changes (latest-wins).
  useEffect(() => {
    if (liveStores.length === 0) { setAgg(null); return; }
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        liveStores.map((s) =>
          PublishService.publishDiff({ masterProductId, storeId: s.storeId, masterProductData: desired })
            .catch(() => null),
        ),
      );
      if (seq !== seqRef.current) return; // a newer edit superseded this run
      const valid = results.filter((r): r is PublishDiffResponse => r != null);
      if (valid.length === 0) { setAgg(null); return; } // endpoint absent → hide the dirty summary
      const dirty = valid.filter((d) => d.dirty);
      setAgg({
        total: valid.length,
        dirty: dirty.length,
        blocked: dirty.filter((d) => d.decision === "UPDATE_BLOCKED" || d.updateSupported === false).length,
      });
    }, 600);
    return () => clearTimeout(timer);
    // desiredKey stands in for `desired`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStores, desiredKey, masterProductId]);

  if (liveStores.length === 0) return null;

  const publishUrl = `/products/${masterProductId}/publish`;
  const n = liveStores.length;

  // Diff endpoint unavailable → still surface that the product is live + a link to manage publishing.
  if (!agg) {
    return (
      <div className="rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10 px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm text-brand-700 dark:text-brand-300">
          Produk ini tayang di <strong>{n}</strong> channel. Perubahan di sini perlu di-publish ulang agar sampai ke channel.
        </p>
        <Link href={publishUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-400 hover:underline flex-shrink-0">
          Kelola di Step 3 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (agg.dirty === 0) {
    return (
      <div className="rounded-xl border border-success-200 dark:border-success-500/30 bg-success-50/60 dark:bg-success-500/10 px-4 py-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success-600 dark:text-success-400" />
        <p className="text-sm text-success-700 dark:text-success-300">
          Semua <strong>{n}</strong> listing yang tayang sudah sinkron dengan channel.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warning-200 dark:border-warning-500/30 bg-warning-50/60 dark:bg-warning-500/10 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-warning-600 dark:text-warning-400" />
        <p className="text-sm text-warning-700 dark:text-warning-300">
          <strong>{agg.dirty}</strong> dari {agg.total} listing tayang punya perubahan belum ter-publish.
          {agg.blocked > 0 && (
            <> {agg.blocked} di antaranya belum bisa di-update langsung (perlu delist &amp; publish ulang).</>
          )}
        </p>
      </div>
      <Link href={publishUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-warning-700 dark:text-warning-400 hover:underline flex-shrink-0">
        Perbarui di Step 3 <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
