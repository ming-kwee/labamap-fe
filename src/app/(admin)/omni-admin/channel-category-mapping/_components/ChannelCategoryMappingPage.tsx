"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { useAuth } from "@/shared/contexts/AuthContext";
import { ProductTypeRulesTab } from "./ProductTypeRulesTab";
import { BulkAssignTab } from "./BulkAssignTab";

const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

export default function ChannelCategoryMappingPage() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [stores, setStores]           = useState<ChannelStoreConnection[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [activeTab, setActiveTab]     = useState<"rules" | "bulk">("rules");

  const loadStores = useCallback(async () => {
    if (!orgId) { setLoadingStores(false); return; }
    try {
      const all = await ChannelStoreService.listAllStores(orgId);
      setStores(all.filter(s => s.isActive && s.connectionStatus !== "INACTIVE"));
    } catch {
      // non-fatal — tabs handle their own empty states
    } finally {
      setLoadingStores(false);
    }
  }, [orgId]);

  useEffect(() => { loadStores(); }, [loadStores]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Page header */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            <LinkIcon />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Channel Category Rules</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {stores.length} store{stores.length !== 1 ? "s" : ""} connected
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-4 -mb-[1px]">
          {(["rules", "bulk"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-white dark:bg-gray-800/60"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab === "rules" ? "Channel Rules" : "Bulk Assign"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "rules" && (
        <ProductTypeRulesTab stores={stores} storesLoading={loadingStores} orgId={orgId} />
      )}

      {activeTab === "bulk" && (
        <BulkAssignTab stores={stores} orgId={orgId} />
      )}
    </div>
  );
}
