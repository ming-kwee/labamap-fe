"use client";

import React, { useState, useEffect } from "react";
import {
  MerchantApiOperation,
  AuthStrategy,
  AUTH_STRATEGY_LABELS,
  AUTH_STRATEGY_DESCRIPTIONS,
  CreateOperationRequest,
  UpdateOperationRequest,
} from "../_types/merchant-api-operation";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";

const CHANNEL_TYPES = Object.keys(CHANNEL_TYPE_LABELS);
const AUTH_STRATEGIES: AuthStrategy[] = ["BEARER_TOKEN", "API_KEY_HEADER", "API_KEY_QUERY", "NO_AUTH"];

interface Props {
  mode: "create" | "edit";
  operation?: MerchantApiOperation;
  onSave: (data: CreateOperationRequest | UpdateOperationRequest) => Promise<void>;
  onClose: () => void;
}

function jsonToString(obj: Record<string, string>): string {
  if (Object.keys(obj).length === 0) return "{}";
  return JSON.stringify(obj, null, 2);
}

function parseJsonMap(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

export default function AddEditOperationModal({ mode, operation, onSave, onClose }: Props) {
  const [channelType,    setChannelType]    = useState(operation?.channelType    ?? "shopify");
  const [operationName,  setOperationName]  = useState(operation?.operationName  ?? "");
  const [baseUrl,        setBaseUrl]        = useState(operation?.baseUrl        ?? "");
  const [urlPath,        setUrlPath]        = useState(operation?.urlPath        ?? "");
  const [authStrategy,   setAuthStrategy]   = useState<AuthStrategy>(operation?.authStrategy ?? "BEARER_TOKEN");
  const [authCredKey,    setAuthCredKey]    = useState(operation?.authCredentialKey ?? "");
  const [fixedRaw,       setFixedRaw]       = useState(jsonToString(operation?.fixedQueryParams ?? {}));
  const [credRaw,        setCredRaw]        = useState(jsonToString(operation?.credentialQueryParams ?? {}));
  const [itemsJsonPath,  setItemsJsonPath]  = useState(operation?.itemsJsonPath  ?? "");
  const [valueField,     setValueField]     = useState(operation?.valueField     ?? "");
  const [labelField,     setLabelField]     = useState(operation?.labelField     ?? "");
  const [description,    setDescription]    = useState(operation?.description    ?? "");

  const [fixedError, setFixedError] = useState<string | null>(null);
  const [credError,  setCredError]  = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const noAuth = authStrategy === "NO_AUTH";

  useEffect(() => {
    setFixedError(parseJsonMap(fixedRaw) === null ? "Invalid JSON object" : null);
  }, [fixedRaw]);

  useEffect(() => {
    setCredError(parseJsonMap(credRaw) === null ? "Invalid JSON object" : null);
  }, [credRaw]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fixedError || credError) return;

    const fixedParsed = parseJsonMap(fixedRaw);
    const credParsed  = parseJsonMap(credRaw);
    if (!fixedParsed || !credParsed) return;

    setSaving(true);
    setError(null);
    try {
      const shared = {
        baseUrl:               baseUrl.trim(),
        urlPath:               urlPath.trim(),
        authStrategy,
        authCredentialKey:     noAuth ? undefined : (authCredKey.trim() || undefined),
        fixedQueryParams:      fixedParsed,
        credentialQueryParams: credParsed,
        itemsJsonPath:         itemsJsonPath.trim(),
        valueField:            valueField.trim(),
        labelField:            labelField.trim(),
        description:           description.trim() || undefined,
      };

      if (mode === "create") {
        await onSave({
          channelType,
          operationName: operationName.trim(),
          ...shared,
          enabled: true,
        } as CreateOperationRequest);
      } else {
        await onSave({
          channelType,
          operationName: operationName.trim(),
          ...shared,
        } as UpdateOperationRequest);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {mode === "create" ? "Add Merchant API Operation" : "Edit Operation"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              New operations take effect immediately on the next Step 2 form load.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Identity */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Channel <span className="text-red-500">*</span>
                </label>
                <select value={channelType} onChange={(e) => setChannelType(e.target.value)} required
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {CHANNEL_TYPES.map((ct) => (
                    <option key={ct} value={ct}>{CHANNEL_TYPE_LABELS[ct]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Operation Name <span className="text-red-500">*</span>
                </label>
                <input type="text" value={operationName}
                  onChange={(e) => setOperationName(e.target.value)} required
                  placeholder="e.g. GetWarehouses, GetBrands"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <p className="text-xs text-gray-400 mt-1">Unique per channel. Must match merchantApiOperation in master attribute.</p>
              </div>
            </div>

            {/* URL */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base URL <span className="text-red-500">*</span>
              </label>
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required
                placeholder="https://{storeId}/admin/api/2024-01  or  https://api.example.com"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <p className="text-xs text-gray-400 mt-1">Supports <code className="font-mono">{"{storeId}"}</code> placeholder — replaced with the merchant&apos;s store domain at runtime.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL Path <span className="text-red-500">*</span>
              </label>
              <input type="text" value={urlPath} onChange={(e) => setUrlPath(e.target.value)} required
                placeholder="/locations.json  or  /v3/fulfillment/centers"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>

            {/* Auth */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Auth Strategy <span className="text-red-500">*</span>
                </label>
                <select value={authStrategy} onChange={(e) => setAuthStrategy(e.target.value as AuthStrategy)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {AUTH_STRATEGIES.map((s) => (
                    <option key={s} value={s}>{AUTH_STRATEGY_LABELS[s]}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{AUTH_STRATEGY_DESCRIPTIONS[authStrategy]}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Auth Credential Key
                </label>
                <input type="text" value={authCredKey} onChange={(e) => setAuthCredKey(e.target.value)}
                  disabled={noAuth} placeholder="e.g. accessToken, apiKey, clientId"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                {!noAuth && (
                  <p className="text-xs text-gray-400 mt-1">Key name in the store&apos;s credentials map to use for auth.</p>
                )}
              </div>
            </div>

            {/* Response mapping */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Items JSON Path <span className="text-red-500">*</span>
                </label>
                <input type="text" value={itemsJsonPath} onChange={(e) => setItemsJsonPath(e.target.value)} required
                  placeholder="locations  or  data.warehouses"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <p className="text-xs text-gray-400 mt-1">Dot-notation path to the items array in the API response.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Value Field <span className="text-red-500">*</span>
                </label>
                <input type="text" value={valueField} onChange={(e) => setValueField(e.target.value)} required
                  placeholder="id  or  centerId"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <p className="text-xs text-gray-400 mt-1">Field used as the option value.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Label Field <span className="text-red-500">*</span>
                </label>
                <input type="text" value={labelField} onChange={(e) => setLabelField(e.target.value)} required
                  placeholder="name  or  centerName"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <p className="text-xs text-gray-400 mt-1">Field used as the display label.</p>
              </div>
            </div>

            {/* Query params */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Fixed Query Params</label>
                  {fixedError && <span className="text-xs text-red-500">{fixedError}</span>}
                </div>
                <textarea value={fixedRaw} onChange={(e) => setFixedRaw(e.target.value)}
                  rows={4} spellCheck={false}
                  className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${fixedError ? "border-red-400 focus:ring-red-400" : "border-gray-300 dark:border-gray-600 focus:ring-orange-500"}`} />
                <p className="text-xs text-gray-400 mt-1">Always appended to request. JSON object.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Credential Query Params</label>
                  {credError && <span className="text-xs text-red-500">{credError}</span>}
                </div>
                <textarea value={credRaw} onChange={(e) => setCredRaw(e.target.value)}
                  rows={4} spellCheck={false}
                  className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${credError ? "border-red-400 focus:ring-red-400" : "border-gray-300 dark:border-gray-600 focus:ring-orange-500"}`} />
                <p className="text-xs text-gray-400 mt-1">Params sourced from store credentials. JSON object.</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Shopify store locations for inventory management"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Changes take effect immediately on the next Step 2 form load.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving || !!fixedError || !!credError}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                {saving ? "Saving…" : mode === "create" ? "Create Operation" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
