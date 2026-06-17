"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ChannelStepSchemaResponse,
  ChannelSchemaPerStore,
  ChannelProductStatus,
  MasterProductSnapshot,
} from "../../types/channelStore";
import { ChannelSchemaService, ChannelProductDataService } from "../../services/channelStore.service";
import { isFieldVisible, isFieldRequired } from "../../hooks/useChannelFieldVisibility";
import { useAuth } from "@/shared/contexts/AuthContext";
import ChannelTypeBadge from "../stores/ChannelTypeBadge";
import ChannelStoreTab from "./ChannelStoreTab";

const BASE_API = "http://localhost:8888/labamap/api/v1";

// ─── Tab store form values ────────────────────────────────────────────────────

interface StoreFormValues {
  masterOverrides: Record<string, unknown>;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

function extractInitialValues(schema: ChannelSchemaPerStore): StoreFormValues {
  const masterOverrides: Record<string, unknown> = {};
  const channelData: Record<string, unknown> = {};
  const variantOverrides: Record<string, Record<string, unknown>> = {};

  for (const section of schema.sections) {
    if (section.sectionName === "variant_overrides") {
      for (const variant of section.variants ?? []) {
        variantOverrides[variant.sku] = { ...variant.currentOverrides };
      }
    } else if (section.sectionName === "master_overrides") {
      for (const field of section.fields ?? []) {
        if (field.currentValue !== undefined && field.currentValue !== null) {
          masterOverrides[field.fieldName] = field.currentValue;
        }
      }
    } else {
      for (const field of section.fields ?? []) {
        if (field.currentValue !== undefined && field.currentValue !== null) {
          channelData[field.fieldName] = field.currentValue;
        }
      }
    }
  }
  return { masterOverrides, channelData, variantOverrides };
}

// ─── Read master product data from sessionStorage ─────────────────────────────
// The create page stores the full product as JSON under `product_${id}`.
// Two helpers:
//   getMasterVariantsFromSession — extracts {sku, label} for the schema API call
//   getMasterSnapshotFromSession — builds a full MasterProductSnapshot so the
//     variant table can show inherited values (price, barcode, quantity, etc.)
//     without relying on the backend to echo them back in the schema response.

type StoredVariant = {
  sku: string;
  options?: Record<string, string>;
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  barcode?: string;
  weight?: number;
  [key: string]: unknown;
};

type StoredProduct = {
  name?: string;
  description?: string;
  price?: number;
  compareAtPrice?: number;
  quantity?: number;
  sku?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number; unit: string };
  mainImage?: string;
  variants?: StoredVariant[];
};

function getMasterVariantsFromSession(
  masterProductId: string
): Array<{ sku: string; label: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(`product_${masterProductId}`);
    if (!raw) return [];
    const product = JSON.parse(raw) as StoredProduct;
    return (product.variants ?? []).map((v) => ({
      sku: v.sku,
      label: v.options && Object.keys(v.options).length > 0
        ? Object.values(v.options).join(" / ")
        : v.sku,
    }));
  } catch {
    return [];
  }
}

/**
 * Builds a MasterProductSnapshot from the product stored in sessionStorage.
 * The backend schema response may not include variant field values (price,
 * barcode, quantity, etc.) because the schema call only forwards {sku, label}.
 * Reading directly from session guarantees the full data is available for the
 * variant table's inherited-value display.
 *
 * If the backend also returns a masterProduct snapshot, callers should merge:
 *   { ...sessionSnapshot, ...backendSnapshot, variants: sessionSnapshot.variants }
 * so backend wins for top-level fields but session supplies the variant values.
 */
function getMasterSnapshotFromSession(
  masterProductId: string
): MasterProductSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`product_${masterProductId}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredProduct;
    return {
      name: p.name ?? "",
      description: p.description,
      price: p.price ?? 0,
      compareAtPrice: p.compareAtPrice,
      quantity: p.quantity,
      sku: p.sku,
      weight: p.weight,
      dimensions: p.dimensions,
      mainImage: p.mainImage,
      variants: (p.variants ?? []).map((v) => {
        // Spread every field on the stored variant so any fieldName lookup works.
        const { options, ...rest } = v;
        return {
          ...rest,
          variantLabel: options && Object.keys(options).length > 0
            ? Object.values(options).join(" / ")
            : v.sku,
          // Preserve structured options so Step 2's Apply can auto-populate
          // per-variant option{n} values (e.g. { Color: "Black", Size: "XS" }).
          variantOptions: options ?? {},
        };
      }),
    };
  } catch {
    return null;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  masterProductId: string;
}

export default function ChannelFieldsWizard({ masterProductId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetStoreId = searchParams.get("storeId") ?? null;
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  // Schema state
  const [schemaResponse, setSchemaResponse] = useState<ChannelStepSchemaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Master product snapshot — session data merged with backend snapshot.
  // Session supplies variant field values (price, barcode, quantity, etc.) that the
  // backend schema call doesn't echo back; backend wins for top-level fields.
  const [masterProductSnapshot, setMasterProductSnapshot] =
    useState<MasterProductSnapshot | null>(null);

  // Active tab — starts at the store specified by ?storeId= query param, or 0
  const [activeStoreIndex, setActiveStoreIndex] = useState(0);

  // Per-store form values map: storeId → values
  const [storeValues, setStoreValues] = useState<Record<string, StoreFormValues>>({});


  // Per-store completion (from backend after save)
  const [storeCompletion, setStoreCompletion] = useState<
    Record<string, { pct: number; status: ChannelProductStatus }>
  >({});

  // Autosave state
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Record<string, Date>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dirtyStores = useRef<Set<string>>(new Set());

  // Navigation warning + field-level errors for the active tab
  const [continueWarning, setContinueWarning] = useState<string | null>(null);
  const [activeTabFieldErrors, setActiveTabFieldErrors] = useState<Set<string>>(new Set());

  // Load schema
  const loadSchema = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const masterVariants = getMasterVariantsFromSession(masterProductId);
      const resp = await ChannelSchemaService.generateChannelStepSchema({
        masterProductId,
        organizationId: orgId,
        ...(masterVariants.length > 0 && { masterVariants }),
      });
      // Build the master product snapshot for the variant table.
      // Session storage has full variant field data (price, barcode, quantity, etc.)
      // that we can't guarantee the backend echoes back in the schema response.
      // Merge strategy: session supplies the base (variant values), backend wins
      // for top-level product fields, session variants always win.
      const sessionSnap = getMasterSnapshotFromSession(masterProductId);
      const backendSnap = resp.masterProduct ?? null;
      if (sessionSnap || backendSnap) {
        setMasterProductSnapshot({
          ...(sessionSnap ?? {}),
          ...(backendSnap ?? {}),
          // Session variants carry the actual field values — always prefer them
          variants: sessionSnap?.variants ?? backendSnap?.variants,
        } as MasterProductSnapshot);
      }

      // Initialize values from schema's currentValue
      const initValues: Record<string, StoreFormValues> = {};
      const initCompletion: Record<string, { pct: number; status: ChannelProductStatus }> = {};
      for (const ch of resp.channels) {
        initValues[ch.storeId] = extractInitialValues(ch);
        initCompletion[ch.storeId] = {
          pct: ch.completionPercentage,
          status: ch.completionStatus,
        };
      }

      // Restore state that the schema API does not echo back via field.currentValue:
      //   • channelData extras — option{n}_name / option{n}_values written by the
      //     "Apply as variant options" panel (not schema fields, so no currentValue)
      //   • variantOverrides extras — option1/option2/option3 per-SKU values written
      //     by the same panel (schema currentOverrides may omit them when the backend
      //     only returns pre-registered variant fields)
      // Without this, navigating away and back clears the dynamic variant columns,
      // their per-variant values, and the "Applied — Re-apply" button state.
      try {
        const savedStoreData = await ChannelProductDataService.getAllStoreData(masterProductId);
        for (const saved of savedStoreData) {
          if (!initValues[saved.storeId]) continue;

          // ── channelData: restore extra keys missing from schema ──────────────
          if (saved.channelData) {
            const extracted = initValues[saved.storeId].channelData;
            const extras: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(saved.channelData)) {
              if (!(key in extracted) && val !== null && val !== undefined) {
                extras[key] = val;
              }
            }
            if (Object.keys(extras).length > 0) {
              initValues[saved.storeId] = {
                ...initValues[saved.storeId],
                channelData: { ...extras, ...extracted },
              };
            }
          }

          // ── variantOverrides: restore per-SKU keys missing from currentOverrides ──
          if (saved.variantOverrides) {
            const extractedVariants = initValues[saved.storeId].variantOverrides;
            const mergedVariants: Record<string, Record<string, unknown>> = { ...extractedVariants };
            for (const [sku, savedSkuOverrides] of Object.entries(saved.variantOverrides)) {
              if (!savedSkuOverrides || typeof savedSkuOverrides !== "object") continue;
              const existing = mergedVariants[sku] ?? {};
              const skuExtras: Record<string, unknown> = {};
              for (const [key, val] of Object.entries(savedSkuOverrides as Record<string, unknown>)) {
                if (!(key in existing) && val !== null && val !== undefined) {
                  skuExtras[key] = val;
                }
              }
              if (Object.keys(skuExtras).length > 0) {
                mergedVariants[sku] = { ...skuExtras, ...existing };
              }
            }
            initValues[saved.storeId] = {
              ...initValues[saved.storeId],
              variantOverrides: mergedVariants,
            };
          }
        }
      } catch {
        // Non-fatal — user can re-apply variant options manually
      }

      // Set schema AFTER restoring saved state so field values are visible to CategoryTreePicker
      setSchemaResponse(resp);
      setStoreValues(initValues);
      setStoreCompletion(initCompletion);

      // Jump to the store specified by ?storeId= (e.g. clicked "Set up & publish" on a specific store)
      if (targetStoreId) {
        const idx = resp.channels.findIndex(ch => ch.storeId === targetStoreId);
        if (idx > 0) setActiveStoreIndex(idx);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load channel schema");
    } finally {
      setLoading(false);
    }
  }, [masterProductId, orgId]);

  useEffect(() => { loadSchema(); }, [loadSchema]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = saveTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  // ── Autosave ──────────────────────────────────────────────────────────────

  const saveStore = useCallback(async (storeId: string, channel: ChannelSchemaPerStore) => {
    const values = storeValues[storeId];
    if (!values) return;
    dirtyStores.current.delete(storeId);
    setSavingStoreId(storeId);
    try {
      // Derive top-level categoryId from the CATEGORY_TREE field value (not channelData["categoryId"]).
      // Backend resolveCategorySlug() skips GID-format values and falls back to categoryPath (Priority 3).
      const categoryTreeFieldName = channel.sections
        .flatMap((s) => s.fields ?? [])
        .find((f) => f.fieldType === "CATEGORY_TREE")
        ?.fieldName;
      const categoryId = categoryTreeFieldName
        ? (values.channelData[categoryTreeFieldName] as string | undefined)
        : undefined;
      const result = await ChannelProductDataService.saveChannelData(orgId, {
        masterProductId,
        storeId,
        channelType: channel.channelType,
        masterOverrides: values.masterOverrides,
        channelData: values.channelData,
        variantOverrides: values.variantOverrides,
        ...(categoryId ? { categoryId } : {}),
      });
      setStoreCompletion((prev) => ({
        ...prev,
        [storeId]: { pct: result.completionPercentage, status: result.status },
      }));
      setLastSaved((prev) => ({ ...prev, [storeId]: new Date() }));
    } catch {
      // silent — user can retry by saving via navigation
    } finally {
      setSavingStoreId(null);
    }
  }, [masterProductId, orgId, storeValues]);

  function scheduleAutosave(storeId: string, channel: ChannelSchemaPerStore) {
    dirtyStores.current.add(storeId);
    if (saveTimers.current[storeId]) clearTimeout(saveTimers.current[storeId]);
    saveTimers.current[storeId] = setTimeout(() => {
      saveStore(storeId, channel);
    }, 30_000);
  }

  function handleValuesChange(storeId: string, channel: ChannelSchemaPerStore, values: StoreFormValues) {
    setStoreValues((prev) => ({ ...prev, [storeId]: values }));
    scheduleAutosave(storeId, channel);
    // Clear field errors when user edits the active tab
    if (storeId === activeStoreId) {
      setActiveTabFieldErrors(new Set());
      setContinueWarning(null);
    }
  }

  // ── Tab switch: save current tab immediately ──────────────────────────────

  async function switchTab(newIndex: number) {
    if (!schemaResponse) return;
    const currentChannel = schemaResponse.channels[activeStoreIndex];
    const currentStoreId = currentChannel?.storeId;
    if (currentStoreId && dirtyStores.current.has(currentStoreId)) {
      if (saveTimers.current[currentStoreId]) clearTimeout(saveTimers.current[currentStoreId]);
      await saveStore(currentStoreId, currentChannel);
    }
    setActiveStoreIndex(newIndex);
    setContinueWarning(null);
    setActiveTabFieldErrors(new Set());
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async function handlePreviousStep() {
    await flushDirtyStores();
    router.push(`/products/${masterProductId}/edit`);
  }

  async function handleNext() {
    if (!schemaResponse) return;
    if (activeStoreIndex < schemaResponse.channels.length - 1) {
      await switchTab(activeStoreIndex + 1);
    } else {
      await handleContinueToPreview();
    }
  }

  async function handleContinueToPreview() {
    if (!schemaResponse) return;
    await flushDirtyStores();

    // Compute missing required fields per store (local validation only)
    const missingByStore: Record<string, string[]> = {};
    const missingFieldNamesByStore: Record<string, string[]> = {};
    for (const ch of schemaResponse.channels) {
      const vals = storeValues[ch.storeId];
      const missingLabels: string[] = [];
      const missingNames: string[] = [];
      const channelData = vals?.channelData ?? {};
      for (const section of ch.sections) {
        if (section.sectionName === "variant_overrides") continue;
        if (section.sectionName === "master_overrides") continue;
        for (const field of section.fields ?? []) {
          // Scenario E: skip fields that are hidden or not required given current values
          if (!isFieldVisible(field, channelData)) continue;
          if (!isFieldRequired(field, channelData)) continue;
          const v = channelData[field.fieldName];
          if (v === undefined || v === null || v === "") {
            missingLabels.push(field.label);
            missingNames.push(field.fieldName);
          }
        }
      }
      if (missingLabels.length > 0) {
        missingByStore[ch.storeId] = missingLabels;
        missingFieldNamesByStore[ch.storeId] = missingNames;
      }
    }

    // At least one store that actually has required fields must be fully complete.
    // Stores with zero required fields are excluded from this check — they are always
    // "trivially complete" and must not mask stores that have unfilled required fields.
    const storesWithRequired = schemaResponse.channels.filter((ch) =>
      ch.sections.some(
        (s) =>
          s.sectionName !== "variant_overrides" &&
          s.sectionName !== "master_overrides" &&
          (s.fields ?? []).some((f) => f.required)
      )
    );
    // If no store defines any required fields, always allow continuation.
    const hasCompleteStore =
      storesWithRequired.length === 0 ||
      storesWithRequired.some((ch) => !missingByStore[ch.storeId]);
    if (!hasCompleteStore) {
      // Highlight missing fields in the active tab
      const activeErrors = missingFieldNamesByStore[activeChannel.storeId];
      setActiveTabFieldErrors(new Set(activeErrors ?? []));

      // Build warning listing each store's missing fields
      const lines = schemaResponse.channels
        .map((ch) => {
          const missing = missingByStore[ch.storeId];
          if (!missing?.length) return null;
          return `${ch.storeName}: ${missing.join(", ")}`;
        })
        .filter(Boolean);
      setContinueWarning(
        "Please fill all required fields in at least one store before continuing.\n" + lines.join("\n")
      );
      return;
    }

    setActiveTabFieldErrors(new Set());
    setContinueWarning(null);
    const activeStoreId = schemaResponse?.channels[activeStoreIndex]?.storeId;
    const publishUrl = activeStoreId
      ? `/products/${masterProductId}/publish?storeId=${encodeURIComponent(activeStoreId)}`
      : `/products/${masterProductId}/publish`;
    router.push(publishUrl);
  }

  async function flushDirtyStores() {
    if (!schemaResponse) return;
    const dirtyIds = Array.from(dirtyStores.current);
    await Promise.all(
      dirtyIds.map((storeId) => {
        const channel = schemaResponse.channels.find((c) => c.storeId === storeId);
        if (!channel) return Promise.resolve();
        if (saveTimers.current[storeId]) clearTimeout(saveTimers.current[storeId]);
        return saveStore(storeId, channel);
      })
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading channel fields…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-6 py-5">
        <p className="font-medium text-error-700 dark:text-error-400">Failed to load channel schema</p>
        <p className="text-sm text-error-600 dark:text-error-300 mt-1">{loadError}</p>
        <button
          onClick={loadSchema}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-400 hover:bg-error-200 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!schemaResponse || schemaResponse.channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">🔌</div>
        <p className="font-medium text-gray-900 dark:text-white">No stores connected</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect stores in <a href="/channels/stores" className="text-brand-500 underline">Channel Stores</a> before filling channel-specific fields.
        </p>
      </div>
    );
  }

  const channels = schemaResponse.channels;
  const activeChannel = channels[activeStoreIndex];
  const activeStoreId = activeChannel.storeId;
  const activeValues = storeValues[activeStoreId] ?? { masterOverrides: {}, channelData: {}, variantOverrides: {} };
  const isLastTab = activeStoreIndex === channels.length - 1;

  const doneCount = channels.filter((ch) => {
    const comp = storeCompletion[ch.storeId] ?? { pct: ch.completionPercentage, status: ch.completionStatus };
    return comp.status === "PUBLISHED" || comp.pct === 100;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
          <Link href={`/products/${masterProductId}/edit`} className="hover:text-brand-500 transition-colors">Step 1: Master Product</Link>
          <span>›</span>
          <span className="font-medium text-gray-900 dark:text-white">Step 2: Channel Fields</span>
          <span>›</span>
          <Link href={`/products/${masterProductId}/publish`} className="hover:text-brand-500 transition-colors">Step 3: Preview &amp; Publish</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel-Specific Fields</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {doneCount}/{channels.length} stores complete · autosaves every 30 s
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 dark:border-gray-800 pb-3">
        {channels.map((ch, idx) => {
          const comp = storeCompletion[ch.storeId] ?? { pct: ch.completionPercentage, status: ch.completionStatus };
          const isActive = idx === activeStoreIndex;
          const hasNoRequired = (ch.completionStats?.requiredTotal ?? 0) === 0;
          const isDone = comp.status === "PUBLISHED" || comp.pct === 100 || hasNoRequired;
          const isPartial = !isDone && comp.pct > 0;
          return (
            <button
              key={ch.storeId}
              onClick={() => switchTab(idx)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent"
              }`}
            >
              <span>{ch.storeName}</span>
              <ChannelTypeBadge channelType={ch.channelType} size="sm" />
              {/* Completion badge — replaces the tiny 2px dot */}
              <span className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                isDone
                  ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-400"
                  : isPartial
                  ? "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
              }`}>
                {isDone ? "✓" : `${comp.pct}%`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-lg">{activeChannel.storeName}</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500">{activeChannel.storeUrl}</p>
          </div>
          <ChannelTypeBadge channelType={activeChannel.channelType} />
        </div>
        <ChannelStoreTab
          schema={activeChannel}
          values={activeValues}
          onChange={(vals) => handleValuesChange(activeStoreId, activeChannel, vals)}
          isSaving={savingStoreId === activeStoreId}
          lastSaved={lastSaved[activeStoreId]}
          masterProduct={masterProductSnapshot ?? undefined}
          fieldErrors={activeTabFieldErrors}
          savedCompletionPct={storeCompletion[activeStoreId]?.pct}
          orgId={orgId}
        />
      </div>

      {/* Navigation */}
      {continueWarning && (
        <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 space-y-1">
          {continueWarning.split("\n").map((line, i) => (
            <p key={i} className={`text-sm ${i === 0 ? "font-medium text-red-700 dark:text-red-400" : "text-red-600 dark:text-red-300"}`}>
              {line}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={handlePreviousStep}
          className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          ← Previous Step
        </button>
        <div className="flex items-center gap-3">
          {!isLastTab && (
            <button
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next: {channels[activeStoreIndex + 1]?.storeName ?? "Next"} →
            </button>
          )}
          <button
            onClick={handleContinueToPreview}
            className="px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            Continue to Preview →
          </button>
        </div>
      </div>
    </div>
  );
}
