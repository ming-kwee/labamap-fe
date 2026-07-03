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
import { isFieldVisible, isFieldRequired } from "../../hooks/useChannelFieldVisibility";
import { useAuth } from "@/shared/contexts/AuthContext";
import ChannelTypeBadge from "../stores/ChannelTypeBadge";
import ChannelStoreTab from "./ChannelStoreTab";

const BASE_API = "http://localhost:8888/labamap/api/v1";

// ─── ProductType pre-fill helpers ─────────────────────────────────────────────

// TikTok is stored as "tiktok" in ChannelType but some stores carry "tiktokshop".
// Normalise both to "tiktok" for matching ProductType channelCategoryDefaults.
function normaliseChannelType(ct: string): string {
  return ct === "tiktokshop" ? "tiktok" : ct;
}

// Reconstruct breadcrumb path nodes from the denormalised categoryFullPath string.
// "Apparel & Accessories › Clothing › Tops" → [{id, name: "Apparel …", hasChildren: true}, ...]
// Only the leaf node carries the real categoryId. Ancestor nodes use placeholder IDs
// because we don't store them — but CategoryTreePicker only uses ancestor entries for
// display (the breadcrumb), not for API calls; actual navigation uses loadLevel(parentId).
function buildPathNodes(
  categoryId: string,
  categoryFullPath: string,
  isLeaf: boolean,
): Array<{ id: string; name: string; hasChildren: boolean }> {
  const sep = categoryFullPath.includes("›") ? "›" : ">";
  const parts = categoryFullPath.split(sep).map(p => p.trim()).filter(Boolean);

  if (parts.length <= 1 || !isLeaf) {
    // Single segment or mid-node: use the LAST segment — that is the node categoryId refers to.
    // parts[0] would be the root ancestor, not the node itself for multi-segment paths.
    const name = parts[parts.length - 1] ?? categoryId;
    return [{ id: categoryId, name, hasChildren: !isLeaf }];
  }

  // Multi-segment leaf: reconstruct ancestor chain.
  // Ancestors get a synthetic id (path-based) sufficient for breadcrumb display.
  return parts.map((name, i) => ({
    id:          i === parts.length - 1 ? categoryId : `__ancestor_${i}_${name}`,
    name,
    hasChildren: i < parts.length - 1,
  }));
}

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
  const loadSchema = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError(null);
    setLoadErrorCode(null);
    try {
      // Backend fetches variants directly from DB — masterVariants not needed.
      const resp = await ChannelSchemaService.generateChannelStepSchema({
        masterProductId,
        organizationId: orgId,
      });
      // Build the master product snapshot for the variant table.
      // Backend now always returns masterProduct.variants from DB — no sessionStorage merge needed.
      const backendSnap = resp.masterProduct ?? null;
      if (backendSnap) {
        setMasterProductSnapshot(backendSnap as MasterProductSnapshot);
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

      // Pre-fill CATEGORY_TREE fields from ProductType.channelCategoryDefaults (Phase 5/6).
      // Works for ALL treeCapable channels: Shopify, Shopee, Amazon, TikTok, eBay, Lazada, etc.
      //   isLeaf=true  → set selectedPath + channelData value (committed, picker shows breadcrumb)
      //   isLeaf=false → set preFillPath (pre-navigation hint, merchant must still pick leaf)
      try {
        const sessionPtId =
          typeof window !== "undefined"
            ? sessionStorage.getItem(`productTypeId_${masterProductId}`)
            : null;
        const ptId = resp.masterProduct?.productTypeId ?? sessionPtId ?? null;
        if (ptId) {
          const pt = await ProductTypeService.get(ptId).catch(() => null);
          if (pt && pt.channelCategoryDefaults.length > 0) {
            const defaultByType = new Map(
              pt.channelCategoryDefaults.map(d => [normaliseChannelType(d.channelType), d])
            );

            for (const ch of resp.channels) {
              const normType = normaliseChannelType(ch.channelType);
              const def = defaultByType.get(normType);
              if (!def) continue;

              const categoryField = ch.sections
                .flatMap(s => s.fields ?? [])
                .find(f => f.fieldType === "CATEGORY_TREE");
              if (!categoryField?.categoryTreeConfig) continue;

              const fn = categoryField.fieldName;
              const existingValue = initValues[ch.storeId]?.channelData[fn];
              if (existingValue) continue;

              const pathNodes = buildPathNodes(def.categoryId, def.categoryFullPath, def.isLeaf);

              if (def.isLeaf) {
                categoryField.categoryTreeConfig.selectedPath = pathNodes;
                initValues[ch.storeId] = {
                  ...initValues[ch.storeId],
                  channelData: {
                    ...initValues[ch.storeId]?.channelData,
                    [fn]: def.categoryId,
                  },
                };
              } else {
                categoryField.categoryTreeConfig.preFillPath = pathNodes;
              }
            }
          }
        }
      } catch {
        // Non-fatal — merchant can browse manually
      }

      // Restore selectedPath for CATEGORY_TREE fields that already have a saved category.
      // When navigating from My Products → channel-fields, the schema is freshly fetched.
      // The backend embeds categoryAttributeSection (with categoryName + categoryPath) when
      // a category is already saved — use those labels to reconstruct the breadcrumb so
      // CategoryTreePicker shows "Apparel › Clothing › Shirts" instead of the raw GID.
      for (const ch of resp.channels) {
        if (!ch.categoryAttributeSection) continue;
        const { categoryId, categoryName, categoryPath } = ch.categoryAttributeSection;
        const categoryField = ch.sections
          .flatMap(s => s.fields ?? [])
          .find(f => f.fieldType === "CATEGORY_TREE");
        if (!categoryField?.categoryTreeConfig) continue;
        if (categoryField.categoryTreeConfig.selectedPath?.length) continue;
        // Skip when backend didn't resolve name (name === id = raw GID).
        // CategoryTreePicker will resolve via search endpoint instead.
        const nameIsUnresolved = categoryName === categoryId;
        if (nameIsUnresolved) continue;
        const ancestorNodes = (categoryPath ?? []).map((name, i) => ({
          id: `__ancestor_${i}_${name}`,
          name,
          hasChildren: true,
        }));
        const leafNode = { id: categoryId, name: categoryName, hasChildren: false };
        categoryField.categoryTreeConfig.selectedPath = [...ancestorNodes, leafNode];
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
      setLoadErrorCode(err instanceof ChannelApiError ? err.code ?? null : null);
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

  // ── Local per-store completion — reactive, no save round-trip needed ────────
  // Mirrors the logic in ChannelStoreTab so the tab bar badges update on every keystroke.
  // Category attribute fields (Scenario D) are omitted here — they live in ChannelStoreTab
  // state and are not accessible from ChannelFieldsWizard; the tab bar is a summary indicator
  // so the approximation from schema sections is sufficient.
  const localPctByStore = useMemo(() => {
    if (!schemaResponse) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    for (const ch of schemaResponse.channels) {
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
            onClick={loadSchema}
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
          const livePct = localPctByStore[ch.storeId] ?? comp.pct;
          const isDone = comp.status === "PUBLISHED" || livePct === 100 || hasNoRequired;
          const isPartial = !isDone && livePct > 0;
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
                {isDone ? "✓" : `${livePct}%`}
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
