"use client";
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ChannelStepSchemaResponse,
  ChannelSchemaPerStore,
  ChannelProductStatus,
  MasterProductSnapshot,
} from "../../types/channelStore";
import { ChannelSchemaService, ChannelProductDataService, ChannelApiError } from "../../services/channelStore.service";
import { ProductTypeService } from "@/app/(admin)/omni-admin/product-types/_services/product-type.service";
import { normaliseChannelType, applyChannelCategoryDefault } from "../../utils/categoryPrefill";
import { isFieldVisible, isFieldRequired } from "../../hooks/useChannelFieldVisibility";
import { useAuth } from "@/shared/contexts/AuthContext";
import ChannelTypeBadge from "../stores/ChannelTypeBadge";
import ChannelStoreTab from "./ChannelStoreTab";
import ListingDirtyBadge from "./ListingDirtyBadge";
import StoreSidebar, { type StoreSidebarItem } from "./StoreSidebar";
import { useWizardViewMode } from "@/modules/ecommerce-product-v2/utils/viewMode";
import ViewModeToggle from "@/modules/ecommerce-product-v2/components/ViewModeToggle";

const BASE_API = "http://localhost:8888/labamap/api/v1";

// ProductType pre-fill helpers (normaliseChannelType / buildPathNodes /
// applyChannelCategoryDefault) live in ../../utils/categoryPrefill so the wizard-level
// pre-fill (here) and the tab-level pre-fill (ChannelStoreTab) share one leaf/non-leaf rule.

// ─── Tab store form values ────────────────────────────────────────────────────

interface StoreFormValues {
  masterOverrides: Record<string, unknown>;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

/**
 * Build the draft desired-state for the dirty-state diff (ListingDirtyBadge): the master snapshot
 * scalars overlaid with the current Step-2 overrides + channel data — mirroring the publish body so
 * the diff reflects exactly what a re-publish would send. Product-type metadata is dropped (not part
 * of the channel payload). Best-effort: sent to the read-only publish-diff endpoint.
 */
function buildDesiredForDiff(
  snapshot: MasterProductSnapshot | null | undefined,
  values: StoreFormValues,
): Record<string, unknown> {
  const masterScalars: Record<string, unknown> = { ...((snapshot ?? {}) as Record<string, unknown>) };
  // Product-type metadata isn't part of the channel payload — drop it so it can't skew the hash.
  delete masterScalars.productTypeId;
  delete masterScalars.productTypeName;
  delete masterScalars.productTypeVariantDimensions;
  return { ...masterScalars, ...values.masterOverrides, ...values.channelData };
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
  // Machine code from the backend (e.g. PRODUCT_TYPE_MISSING) so we can render an
  // actionable state instead of a raw error string.
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);

  // Master product snapshot — session data merged with backend snapshot.
  // Session supplies variant field values (price, barcode, quantity, etc.) that the
  // backend schema call doesn't echo back; backend wins for top-level fields.
  const [masterProductSnapshot, setMasterProductSnapshot] =
    useState<MasterProductSnapshot | null>(null);

  // Active tab — starts at the store specified by ?storeId= query param, or 0
  const [activeStoreIndex, setActiveStoreIndex] = useState(0);

  // Merchant (guided) vs developer (schema-role form) layout — shared with Step 3, persisted per browser.
  const [viewMode, setViewMode] = useWizardViewMode();

  // ── Lazy per-store schema (scales to many stores) ──────────────────────────
  // The tab bar renders instantly from a lightweight /stores list (skeleton channels
  // with empty `sections`); each store's full schema is fetched on demand and cached.
  // hydratedRef tracks which stores' schemas are loaded; hydratingStoreId drives the
  // per-tab spinner. savedStoreData + productType are fetched once and reused across
  // hydrations (for the restore/prefill logic).
  const hydratedRef = useRef<Set<string>>(new Set());
  // In-flight guard: dedupe concurrent hydrate calls for the same store (React
  // StrictMode double-invokes effects, and two paths can trigger a hydrate before
  // the first fetch resolves → without this, one store fetches N times).
  const hydratingInFlightRef = useRef<Set<string>>(new Set());
  const [hydratingStoreId, setHydratingStoreId] = useState<string | null>(null);
  const savedStoreDataRef = useRef<Awaited<ReturnType<typeof ChannelProductDataService.getAllStoreData>> | null>(null);
  const productTypeIdRef = useRef<string | null>(null);

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
  // In-flight save guard: prevents duplicate concurrent saves for the same store
  // (e.g. autosave timer fires while flushDirtyStores is already running).
  // Backend is idempotent (upsert), but concurrent saves waste resources and
  // can cause a stale completion% to overwrite the latest one.
  const savingInFlight = useRef<Set<string>>(new Set());

  // Navigation warning + field-level errors for the active tab
  const [continueWarning, setContinueWarning] = useState<string | null>(null);
  const [activeTabFieldErrors, setActiveTabFieldErrors] = useState<Set<string>>(new Set());

  // Load schema
  // Fetch (once) the saved store data used to restore Step-2 extras across hydrations.
  const getSavedStoreData = useCallback(async () => {
    if (savedStoreDataRef.current) return savedStoreDataRef.current;
    try {
      const data = await ChannelProductDataService.getAllStoreData(masterProductId);
      savedStoreDataRef.current = data;
      return data;
    } catch {
      savedStoreDataRef.current = [];
      return [];
    }
  }, [masterProductId]);

  // Hydrate ONE store's full schema on demand: fetch { storeId } schema, restore the
  // Step-2 extras + CATEGORY_TREE state, then merge into the skeleton. Cached via hydratedRef.
  const hydrateStore = useCallback(async (storeId: string) => {
    if (hydratedRef.current.has(storeId) || hydratingInFlightRef.current.has(storeId)) return;
    hydratingInFlightRef.current.add(storeId);
    setHydratingStoreId(storeId);
    try {
      const resp = await ChannelSchemaService.generateChannelStepSchema({
        masterProductId,
        organizationId: orgId,
        storeId,
      });
      const channel = resp.channels.find((c) => c.storeId === storeId) ?? resp.channels[0];
      if (!channel) return;
      if (resp.masterProduct) setMasterProductSnapshot(resp.masterProduct as MasterProductSnapshot);

      const initVals = extractInitialValues(channel);

      // Restore channelData / variantOverrides extras the schema doesn't echo back.
      const savedStoreData = await getSavedStoreData();
      const saved = savedStoreData.find((d) => d.storeId === storeId);
      if (saved?.channelData) {
        const extras: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(saved.channelData)) {
          if (!(key in initVals.channelData) && val !== null && val !== undefined) extras[key] = val;
        }
        if (Object.keys(extras).length > 0) initVals.channelData = { ...extras, ...initVals.channelData };
      }
      if (saved?.variantOverrides) {
        const merged: Record<string, Record<string, unknown>> = { ...initVals.variantOverrides };
        for (const [sku, sov] of Object.entries(saved.variantOverrides)) {
          if (!sov || typeof sov !== "object") continue;
          const existing = merged[sku] ?? {};
          const skuExtras: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(sov as Record<string, unknown>)) {
            if (!(key in existing) && val !== null && val !== undefined) skuExtras[key] = val;
          }
          if (Object.keys(skuExtras).length > 0) merged[sku] = { ...skuExtras, ...existing };
        }
        initVals.variantOverrides = merged;
      }

      // Pre-fill CATEGORY_TREE from ProductType.channelCategoryDefaults.
      try {
        const sessionPtId =
          typeof window !== "undefined" ? sessionStorage.getItem(`productTypeId_${masterProductId}`) : null;
        const ptId = resp.masterProduct?.productTypeId ?? productTypeIdRef.current ?? sessionPtId ?? null;
        if (ptId) {
          const pt = await ProductTypeService.get(ptId).catch(() => null);
          const def = pt?.channelCategoryDefaults
            ?.find((d) => normaliseChannelType(d.channelType) === normaliseChannelType(channel.channelType));
          if (def) {
            const categoryField = channel.sections.flatMap((s) => s.fields ?? []).find((f) => f.fieldType === "CATEGORY_TREE");
            if (categoryField?.categoryTreeConfig && !initVals.channelData[categoryField.fieldName]) {
              // leaf → commit categoryId + selectedPath; non-leaf → preFillPath hint only.
              const commitValue = applyChannelCategoryDefault(categoryField, def);
              if (commitValue !== undefined) {
                initVals.channelData = { ...initVals.channelData, [categoryField.fieldName]: commitValue };
              }
            }
          }
        }
      } catch {
        // Non-fatal — merchant can browse manually
      }

      // Restore selectedPath from categoryAttributeSection (already-saved category).
      if (channel.categoryAttributeSection) {
        const { categoryId, categoryName, categoryPath } = channel.categoryAttributeSection;
        const categoryField = channel.sections.flatMap((s) => s.fields ?? []).find((f) => f.fieldType === "CATEGORY_TREE");
        if (
          categoryField?.categoryTreeConfig &&
          !categoryField.categoryTreeConfig.selectedPath?.length &&
          categoryName !== categoryId
        ) {
          const ancestorNodes = (categoryPath ?? []).map((name, i) => ({ id: `__ancestor_${i}_${name}`, name, hasChildren: true }));
          categoryField.categoryTreeConfig.selectedPath = [...ancestorNodes, { id: categoryId, name: categoryName, hasChildren: false }];
        }
      }

      hydratedRef.current.add(storeId);
      setSchemaResponse((prev) =>
        prev
          ? {
              ...prev,
              masterProduct: resp.masterProduct ?? prev.masterProduct,
              channels: prev.channels.map((c) => (c.storeId === storeId ? channel : c)),
            }
          : prev,
      );
      setStoreValues((prev) => ({ ...prev, [storeId]: initVals }));
      setStoreCompletion((prev) => ({
        ...prev,
        [storeId]: { pct: channel.completionPercentage, status: channel.completionStatus },
      }));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load channel schema");
      setLoadErrorCode(err instanceof ChannelApiError ? err.code ?? null : null);
    } finally {
      hydratingInFlightRef.current.delete(storeId);
      setHydratingStoreId((cur) => (cur === storeId ? null : cur));
    }
  }, [masterProductId, orgId, getSavedStoreData]);

  // Load the lightweight store list (renders the tab bar instantly, O(1)), then
  // hydrate the active store's schema. Full per-store schemas load lazily on tab switch.
  const loadStoreList = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError(null);
    setLoadErrorCode(null);
    hydratedRef.current = new Set();
    savedStoreDataRef.current = null;
    const ZERO_STATS = {
      requiredTotal: 0, requiredFilled: 0, channelRequiredTotal: 0, channelRequiredFilled: 0,
      categoryRequiredTotal: 0, categoryRequiredFilled: 0, recommendedTotal: 0, recommendedFilled: 0,
    };
    try {
      const list = await ChannelSchemaService.getChannelStepStores(masterProductId, orgId);
      productTypeIdRef.current = list.productTypeId ?? null;

      const skeleton: ChannelStepSchemaResponse = {
        step: 2,
        masterProductId,
        channels: list.stores.map((s) => ({
          channelType: s.channelType,
          storeId: s.storeId,
          storeName: s.storeName,
          storeUrl: s.storeUrl,
          displayOrder: s.displayOrder,
          completionStatus: s.completionStatus,
          completionPercentage: s.completionPercentage,
          sections: [],
          completionStats: s.completionStats ?? ZERO_STATS,
        })),
      };

      const comp: Record<string, { pct: number; status: ChannelProductStatus }> = {};
      for (const s of list.stores) comp[s.storeId] = { pct: s.completionPercentage, status: s.completionStatus };

      let activeIdx = 0;
      if (targetStoreId) {
        const i = list.stores.findIndex((s) => s.storeId === targetStoreId);
        if (i >= 0) activeIdx = i;
      }

      setStoreCompletion(comp);
      setActiveStoreIndex(activeIdx);
      setSchemaResponse(skeleton);
      setLoading(false);
      // The activeStoreIndex effect below hydrates the active store (dedup-guarded).
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load channel schema");
      setLoadErrorCode(err instanceof ChannelApiError ? err.code ?? null : null);
      setLoading(false);
    }
  }, [masterProductId, orgId, targetStoreId]);

  useEffect(() => { loadStoreList(); }, [loadStoreList]);

  // Hydrate whenever the active store changes (tab switch) — cached after first fetch.
  useEffect(() => {
    const ch = schemaResponse?.channels[activeStoreIndex];
    if (ch && !hydratedRef.current.has(ch.storeId)) hydrateStore(ch.storeId);
  }, [activeStoreIndex, schemaResponse, hydrateStore]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = saveTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  // ── Autosave ──────────────────────────────────────────────────────────────

  const saveStore = useCallback(async (storeId: string, channel: ChannelSchemaPerStore) => {
    const values = storeValues[storeId];
    if (!values) return;
    // Skip if a save for this store is already in flight
    if (savingInFlight.current.has(storeId)) return;
    savingInFlight.current.add(storeId);
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
      savingInFlight.current.delete(storeId);
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
    // Backend GET now reliably returns variants[] and variantCount — no workarounds needed.
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

    // Gate: a BLOCKING variant-axis issue (INCOMPLETE_MATRIX / TOO_MANY_AXES) on the store we'd
    // publish will be rejected by the backend publish pre-flight. Fail fast locally instead of a
    // round-trip. WARNING issues (NOT_EXPRESSIBLE_ON_CHANNEL) stay advisory and do not gate.
    const activeBlockingAxis = (activeChannel.categoryAttributeSection?.axisValidation ?? [])
      .filter((i) => i.severity === "BLOCKING");
    if (activeBlockingAxis.length > 0) {
      setActiveTabFieldErrors(new Set());
      setContinueWarning(
        `Resolve variant-option issues on ${activeChannel.storeName} before continuing:\n` +
        activeBlockingAxis.map((i) => `${i.dimension}: ${i.message}`).join("\n")
      );
      return;
    }

    await flushDirtyStores();

    // Compute missing required fields per store (local validation only)
    const missingByStore: Record<string, string[]> = {};
    const missingFieldNamesByStore: Record<string, string[]> = {};
    for (const ch of schemaResponse.channels) {
      const vals = storeValues[ch.storeId];
      const missingLabels: string[] = [];
      const missingNames: string[] = [];
      const channelData = vals?.channelData ?? {};
      const variantOverrides = vals?.variantOverrides ?? {};
      for (const section of ch.sections) {
        if (section.sectionName === "master_overrides") continue;

        // Variant required fields: check every required variantField across all SKUs
        if (section.sectionName === "variant_overrides") {
          for (const field of section.variantFields ?? []) {
            if (!field.required) continue;
            for (const variant of section.variants ?? []) {
              const v = variantOverrides[variant.sku]?.[field.fieldName];
              if (v === undefined || v === null || v === "") {
                const label = `${field.label} (${variant.variantLabel || variant.sku})`;
                missingLabels.push(label);
                missingNames.push(field.fieldName);
              }
            }
          }
          continue;
        }

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
      ch.sections.some((s) => {
        if (s.sectionName === "master_overrides") return false;
        if (s.sectionName === "variant_overrides") {
          // Has required variant fields AND at least one variant SKU to fill
          return (s.variantFields ?? []).some(f => f.required) && (s.variants ?? []).length > 0;
        }
        return (s.fields ?? []).some((f) => f.required);
      })
    );
    // If no store defines any required fields, always allow continuation.
    // With lazy per-store schema, non-active stores may not be hydrated — so also
    // honour the saved/live completion from the store list (a store at 100% is
    // complete even if its schema isn't loaded in this session).
    const anyStoreCompleteByCompletion = Object.values(storeCompletion).some((c) => (c?.pct ?? 0) >= 100);
    const hasCompleteStore =
      storesWithRequired.length === 0 ||
      storesWithRequired.some((ch) => !missingByStore[ch.storeId]) ||
      anyStoreCompleteByCompletion;
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

  // ── Local per-store completion — reactive, no save round-trip needed ────────
  // Mirrors the logic in ChannelStoreTab so the tab bar badges update on every keystroke.
  // Category attribute fields (Scenario D) are omitted here — they live in ChannelStoreTab
  // state and are not accessible from ChannelFieldsWizard; the tab bar is a summary indicator
  // so the approximation from schema sections is sufficient.
  const localPctByStore = useMemo(() => {
    if (!schemaResponse) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    for (const ch of schemaResponse.channels) {
      // Not-yet-hydrated store (lazy): no sections loaded. Skip so the tab bar falls
      // back to the saved/list completion (storeCompletion) instead of a false 100%.
      if (ch.sections.length === 0) continue;
      const channelData = storeValues[ch.storeId]?.channelData ?? {};
      const variantOverrides = storeValues[ch.storeId]?.variantOverrides ?? {};
      let required = 0, filled = 0;
      for (const section of ch.sections) {
        if (section.sectionName === "master_overrides") continue;
        if (section.sectionName === "variant_overrides") {
          for (const field of section.variantFields ?? []) {
            if (!field.required) continue;
            for (const variant of section.variants ?? []) {
              const v = variantOverrides[variant.sku]?.[field.fieldName];
              required++;
              if (v !== undefined && v !== null && v !== "") filled++;
            }
          }
          continue;
        }
        for (const field of section.fields ?? []) {
          if (!isFieldVisible(field, channelData)) continue;
          if (!isFieldRequired(field, channelData)) continue;
          required++;
          const v = channelData[field.fieldName];
          if (v !== undefined && v !== null && v !== "") filled++;
        }
      }
      result[ch.storeId] = required === 0 ? 100 : Math.round((filled / required) * 100);
    }
    return result;
  }, [schemaResponse, storeValues]);

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

  // Actionable state: the product has no Product Type, so Step 2 can't build a
  // form yet. Backend returns 422 PRODUCT_TYPE_MISSING (not a raw 500). Route the
  // merchant back to Step 1 instead of showing an error dead-end.
  if (loadErrorCode === "PRODUCT_TYPE_MISSING") {
    return (
      <div className="rounded-2xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-6 py-5">
        <p className="font-medium text-warning-700 dark:text-warning-400">Produk ini belum punya Product Type</p>
        <p className="text-sm text-warning-600 dark:text-warning-300 mt-1">
          Channel Fields (Step 2) dibentuk dari <strong>Product Type</strong> produk. Tetapkan Product Type di{" "}
          <strong>Step 1 (Master Product)</strong> dulu, lalu kembali ke sini.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/products/${masterProductId}/edit`}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-warning-500 text-white hover:bg-warning-600 transition-colors"
          >
            Ke Step 1: Master Product
          </Link>
          <button
            onClick={loadStoreList}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-warning-100 dark:bg-warning-500/20 text-warning-700 dark:text-warning-400 hover:bg-warning-200 transition-colors"
          >
            Coba lagi
          </button>
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
          onClick={loadStoreList}
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
  // BLOCKING variant-axis issues on the active store — gate "Continue to Preview" locally so the
  // merchant fixes them before the backend pre-flight rejects the publish (round-trip).
  const activeBlockingAxis = (activeChannel.categoryAttributeSection?.axisValidation ?? [])
    .filter((i) => i.severity === "BLOCKING");

  const doneCount = channels.filter((ch) => {
    const comp = storeCompletion[ch.storeId] ?? { pct: ch.completionPercentage, status: ch.completionStatus };
    return comp.status === "PUBLISHED" || comp.pct === 100;
  }).length;

  // Sidebar rows — same badge logic the old tab bar used (done / partial / live %).
  const storeItems: StoreSidebarItem[] = channels.map((ch) => {
    const comp = storeCompletion[ch.storeId] ?? { pct: ch.completionPercentage, status: ch.completionStatus };
    const hasNoRequired = (ch.completionStats?.requiredTotal ?? 0) === 0;
    const livePct = localPctByStore[ch.storeId] ?? comp.pct;
    const isDone = comp.status === "PUBLISHED" || livePct === 100 || hasNoRequired;
    return {
      storeId: ch.storeId,
      storeName: ch.storeName,
      storeUrl: ch.storeUrl,
      channelType: ch.channelType,
      livePct,
      isDone,
      isPartial: !isDone && livePct > 0,
    };
  });

  const handleSidebarSelect = (storeId: string) => {
    const idx = channels.findIndex((c) => c.storeId === storeId);
    if (idx >= 0) switchTab(idx);
  };

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel-Specific Fields</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {doneCount}/{channels.length} stores complete · autosaves every 30 s
            </p>
          </div>
          {/* View toggle: merchant (guided) vs developer (schema-role form) — shared with Step 3 */}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Store workspace: sidebar navigator + active store form (scales past 10 stores + search) */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-72 lg:flex-shrink-0">
          <StoreSidebar
            items={storeItems}
            activeStoreId={activeStoreId}
            doneCount={doneCount}
            onSelect={handleSidebarSelect}
          />
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          {/* Active store content */}
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-900 dark:text-white text-lg">{activeChannel.storeName}</h2>
                  {/* Live-listing dirty-state: only appears once the listing is published — tells the
                      merchant whether the current (possibly unsaved) edits still need a re-publish. */}
                  <ListingDirtyBadge
                    masterProductId={masterProductId}
                    storeId={activeStoreId}
                    live={storeCompletion[activeStoreId]?.status === "PUBLISHED"}
                    desired={buildDesiredForDiff(masterProductSnapshot, activeValues)}
                  />
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">{activeChannel.storeUrl}</p>
              </div>
              <ChannelTypeBadge channelType={activeChannel.channelType} />
            </div>
            {activeChannel.sections.length === 0 ? (
              // Schema for this store is still loading (lazy per-store fetch).
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {hydratingStoreId === activeStoreId ? "Memuat field channel…" : "Menyiapkan…"}
                </p>
              </div>
            ) : (
              <ChannelStoreTab
                schema={activeChannel}
                values={activeValues}
                onChange={(vals) => handleValuesChange(activeStoreId, activeChannel, vals)}
                isSaving={savingStoreId === activeStoreId}
                lastSaved={lastSaved[activeStoreId]}
                masterProduct={masterProductSnapshot ?? undefined}
                masterProductId={masterProductId}
                fieldErrors={activeTabFieldErrors}
                orgId={orgId}
                viewMode={viewMode}
              />
            )}
          </div>

          {/* Navigation */}
          {activeBlockingAxis.length > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Variant-option issues on {activeChannel.storeName} must be fixed before publishing:
              </p>
              {activeBlockingAxis.map((i, idx) => (
                <p key={`${i.code}-${i.dimension}-${idx}`} className="text-sm text-red-600 dark:text-red-300">
                  • <strong>{i.dimension}</strong>: {i.message}
                </p>
              ))}
            </div>
          )}
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
                disabled={activeBlockingAxis.length > 0}
                title={activeBlockingAxis.length > 0 ? "Resolve the variant-option issues above before continuing" : undefined}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeBlockingAxis.length > 0
                    ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "bg-brand-500 text-white hover:bg-brand-600"
                }`}
              >
                Continue to Preview →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
