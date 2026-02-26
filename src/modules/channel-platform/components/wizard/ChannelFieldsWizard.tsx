"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ChannelStepSchemaResponse,
  ChannelSchemaPerStore,
  ChannelProductStatus,
} from "../../types/channelStore";
import { ChannelSchemaService, ChannelProductDataService } from "../../services/channelStoreService";
import ChannelTypeBadge from "../stores/ChannelTypeBadge";
import ChannelStoreTab from "./ChannelStoreTab";

const ORGANIZATION_ID = "org_123"; // from auth context in production

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusDot(status: ChannelProductStatus | undefined, pct: number) {
  if (status === "FAILED")     return { color: "bg-error-500",   label: "Error" };
  if (status === "PUBLISHED")  return { color: "bg-success-500", label: "Published" };
  if (pct === 100)             return { color: "bg-success-500", label: "Complete" };
  if (pct > 0)                 return { color: "bg-warning-500", label: "Partial" };
  return { color: "bg-gray-300 dark:bg-gray-600", label: "Empty" };
}

// ─── Tab store form values ────────────────────────────────────────────────────

interface StoreFormValues {
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
}

function extractInitialValues(schema: ChannelSchemaPerStore): StoreFormValues {
  const channelData: Record<string, unknown> = {};
  const variantOverrides: Record<string, Record<string, unknown>> = {};

  for (const section of schema.sections) {
    if (section.sectionName === "variant_overrides") {
      for (const variant of section.variants ?? []) {
        variantOverrides[variant.sku] = { ...variant.currentOverrides };
      }
    } else {
      for (const field of section.fields ?? []) {
        if (field.currentValue !== undefined && field.currentValue !== null) {
          channelData[field.fieldName] = field.currentValue;
        }
      }
    }
  }
  return { channelData, variantOverrides };
}

// ─── Local completion check ────────────────────────────────────────────────────
// Returns true if every required field in the store's schema has a non-empty value
// in the current (possibly unsaved) form values.
function isLocallyComplete(channel: ChannelSchemaPerStore, vals: StoreFormValues): boolean {
  for (const section of channel.sections) {
    if (section.sectionName === "variant_overrides") continue;
    for (const field of section.fields ?? []) {
      if (!field.required) continue;
      const v = vals.channelData[field.fieldName];
      if (v === undefined || v === null || v === "") return false;
    }
  }
  return true;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  masterProductId: string;
}

export default function ChannelFieldsWizard({ masterProductId }: Props) {
  const router = useRouter();

  // Schema state
  const [schemaResponse, setSchemaResponse] = useState<ChannelStepSchemaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active tab
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

  // Navigation warning
  const [continueWarning, setContinueWarning] = useState<string | null>(null);

  // Load schema
  const loadSchema = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await ChannelSchemaService.generateChannelStepSchema({
        masterProductId,
        organizationId: ORGANIZATION_ID,
      });
      setSchemaResponse(resp);

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
      setStoreValues(initValues);
      setStoreCompletion(initCompletion);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load channel schema");
    } finally {
      setLoading(false);
    }
  }, [masterProductId]);

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
      const result = await ChannelProductDataService.saveChannelData(ORGANIZATION_ID, {
        masterProductId,
        storeId,
        channelType: channel.channelType,
        channelData: values.channelData,
        variantOverrides: values.variantOverrides,
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
  }, [masterProductId, storeValues]);

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
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async function handlePreviousStep() {
    await flushDirtyStores();
    router.push(`/products/create`);
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
    await flushDirtyStores();
    const anyReady =
      Object.values(storeCompletion).some((c) => c.status === "READY" || c.pct === 100) ||
      (schemaResponse?.channels ?? []).some((ch) => {
        const vals = storeValues[ch.storeId];
        return vals ? isLocallyComplete(ch, vals) : false;
      });
    if (!anyReady) {
      setContinueWarning("At least one store must have all required fields filled to continue.");
      return;
    }
    router.push(`/products/${masterProductId}/publish`);
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
  const activeValues = storeValues[activeStoreId] ?? { channelData: {}, variantOverrides: {} };
  // A store is "ready" if the backend confirmed it (after save), OR if all required
  // fields are already filled locally (before the next autosave fires).
  const anyReady =
    Object.values(storeCompletion).some((c) => c.status === "READY" || c.pct === 100) ||
    channels.some((ch) => {
      const vals = storeValues[ch.storeId];
      return vals ? isLocallyComplete(ch, vals) : false;
    });
  const isLastTab = activeStoreIndex === channels.length - 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
          <a href="/products/create" className="hover:text-brand-500 transition-colors">Step 1: Master Product</a>
          <span>›</span>
          <span className="font-medium text-gray-900 dark:text-white">Step 2: Channel Fields</span>
          <span>›</span>
          <span>Step 3: Preview & Publish</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Channel-Specific Fields</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Fill channel-specific fields for each connected store. Data autosaves every 30 seconds.
        </p>
      </div>

      {/* Overall progress bar */}
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl px-6 py-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Overall Progress
        </p>
        <div className="space-y-2">
          {channels.map((ch) => {
            const comp = storeCompletion[ch.storeId] ?? { pct: ch.completionPercentage, status: ch.completionStatus };
            const dot = statusDot(comp.status, comp.pct);
            return (
              <div key={ch.storeId} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-36 truncate">{ch.storeName}</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      comp.pct === 100 ? "bg-success-500" : comp.pct > 0 ? "bg-warning-500" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    style={{ width: `${comp.pct}%` }}
                  />
                </div>
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot.color}`} title={dot.label} />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{comp.pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
        {channels.map((ch, idx) => {
          const comp = storeCompletion[ch.storeId] ?? { pct: ch.completionPercentage, status: ch.completionStatus };
          const dot = statusDot(comp.status, comp.pct);
          const isActive = idx === activeStoreIndex;
          return (
            <button
              key={ch.storeId}
              onClick={() => switchTab(idx)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${dot.color}`} title={dot.label} />
              <span>{ch.storeName}</span>
              <ChannelTypeBadge channelType={ch.channelType} size="sm" />
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
        />
      </div>

      {/* Navigation */}
      {continueWarning && (
        <div className="rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-4 py-3">
          <p className="text-sm text-warning-700 dark:text-warning-400">{continueWarning}</p>
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
            disabled={!anyReady}
            className="px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue to Preview →
          </button>
        </div>
      </div>
    </div>
  );
}
