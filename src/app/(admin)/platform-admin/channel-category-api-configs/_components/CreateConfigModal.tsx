"use client";

import React, { useState, useEffect } from "react";
import {
  CreateChannelCategoryApiConfigRequest,
  CategoryTreeApiConfig,
  AttributeApiConfig,
} from "../_types/channel-category-api-config";

interface Props {
  onSave: (req: CreateChannelCategoryApiConfigRequest) => Promise<void>;
  onClose: () => void;
}

const TREE_API_PLACEHOLDER = JSON.stringify({
  baseUrl:          "https://partner.shopeemobile.com",
  httpMethod:       "GET",
  childrenUrlPath:  "/api/v2/product/get_category",
  authStrategy:     "HMAC_SHA256",
  authCredentialKey:"accessToken",
  credentialQueryParams: {
    access_token: "accessToken",
    shop_id:      "shopId",
    partner_id:   "partnerId",
  },
  itemsJsonPath:    "response.category_list",
  nodeIdField:      "catid",
  nodeNameField:    "display_category_name",
  nodeHasChildrenField: "has_children",
  treeStructure:    "NESTED",
  nestedChildrenField: "children",
  fullTreeStrategy: "SINGLE_CALL",
  paginationStrategy: "NONE",
}, null, 2);

const ATTR_API_PLACEHOLDER = JSON.stringify({
  urlPath:                "/api/v2/product/get_attributes",
  categoryIdQueryParam:   "category_id",
  itemsJsonPath:          "response.attribute_list",
  idField:                "attribute_id",
  nameField:              "attribute_name",
  requiredField:          "is_mandatory",
  valuesField:            "attribute_value_list",
  valueIdField:           "value_id",
  valueNameField:         "display_value_name",
}, null, 2);

export default function CreateConfigModal({ onSave, onClose }: Props) {
  const [channelType, setChannelType] = useState("");
  const [label,       setLabel]       = useState("");
  const [enabled,     setEnabled]     = useState(true);
  const [treeRaw,     setTreeRaw]     = useState("{\n  \n}");
  const [attrRaw,     setAttrRaw]     = useState("");

  const [treeError, setTreeError] = useState<string | null>(null);
  const [attrError, setAttrError] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [apiError,  setApiError]  = useState<string | null>(null);

  useEffect(() => {
    if (!treeRaw.trim()) { setTreeError(null); return; }
    try { JSON.parse(treeRaw); setTreeError(null); }
    catch (e) { setTreeError((e as Error).message); }
  }, [treeRaw]);

  useEffect(() => {
    if (!attrRaw.trim()) { setAttrError(null); return; }
    try { JSON.parse(attrRaw); setAttrError(null); }
    catch (e) { setAttrError((e as Error).message); }
  }, [attrRaw]);

  const hasErrors = !!treeError || !!attrError || !channelType.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasErrors) return;
    setSaving(true);
    setApiError(null);
    try {
      const req: CreateChannelCategoryApiConfigRequest = {
        channelType: channelType.trim().toLowerCase(),
        label:       label.trim() || undefined,
        enabled,
        treeApiConfig: treeRaw.trim() ? JSON.parse(treeRaw) as CategoryTreeApiConfig : undefined,
        attributeConfig: attrRaw.trim() ? JSON.parse(attrRaw) as AttributeApiConfig : undefined,
      };
      await onSave(req);
      onClose();
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function Field({ label: lbl, children, error }: { label: React.ReactNode; children: React.ReactNode; error?: string | null }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{lbl}</label>
          {error && <span className="text-xs text-red-500 font-mono">{error}</span>}
        </div>
        {children}
      </div>
    );
  }

  const inputCls = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const textareaCls = (hasErr: boolean) =>
    `w-full border rounded-lg px-3 py-2.5 text-xs font-mono bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 resize-y ${
      hasErr ? "border-red-400 focus:ring-red-400" : "border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
    }`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">New Channel Category API Config</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Add category tree and attribute API configuration for a new channel
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-4">
              <Field label={<>Channel Type <span className="text-red-500">*</span></>}>
                <input
                  type="text"
                  value={channelType}
                  onChange={(e) => setChannelType(e.target.value)}
                  placeholder="e.g. shopee_sg"
                  className={inputCls}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Lowercase slug, e.g. <code className="font-mono">shopee_sg</code></p>
              </Field>
              <Field label="Label">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Shopee SG"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="enabled" checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="enabled" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                Enabled — CategorySyncJob will include this channel
              </label>
            </div>

            {/* Note about non-editable fields */}
            <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              <strong>Note:</strong>{" "}
              <code className="font-mono">taxonomyConfig</code> is code-managed.
              Set it via backend seed data or direct DB patch — not editable via this admin API.
            </div>

            {/* Tree API Config */}
            <Field label={<>Tree API Config <span className="text-xs text-gray-400 font-normal">(treeApiConfig)</span></>} error={treeError}>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Defines how the category tree is fetched. Required for category sync to work.
                For HMAC_SHA256 channels, set <code className="font-mono">credentialQueryParams</code> for per-request credential injection
                and optionally override <code className="font-mono">hmacSigningCredentialKey</code> (default: <code className="font-mono">&quot;partnerId&quot;</code>).{" "}
                <button type="button" onClick={() => setTreeRaw(TREE_API_PLACEHOLDER)}
                  className="text-indigo-500 hover:underline">Load example (Shopee)</button>
              </p>
              <textarea
                value={treeRaw}
                onChange={(e) => setTreeRaw(e.target.value)}
                rows={14}
                spellCheck={false}
                className={textareaCls(!!treeError)}
              />
            </Field>

            {/* Attribute API Config (optional) */}
            <Field label={<>Attribute API Config <span className="text-xs text-gray-400 font-normal">(attributeConfig — optional)</span></>} error={attrError}>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Defines how per-category attributes are fetched. Leave blank if not yet known.{" "}
                <button type="button" onClick={() => setAttrRaw(ATTR_API_PLACEHOLDER)}
                  className="text-indigo-500 hover:underline">Load example</button>
              </p>
              <textarea
                value={attrRaw}
                onChange={(e) => setAttrRaw(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder="{}"
                className={textareaCls(!!attrError)}
              />
            </Field>

            {apiError && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                {apiError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || hasErrors}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
              {saving ? "Creating…" : "Create Config"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
