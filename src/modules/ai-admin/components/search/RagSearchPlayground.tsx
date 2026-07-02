"use client";

/**
 * P0-C · RAG Search Playground (Retrieval Tester + Threshold Tuner).
 *
 * The most important tuning tool: run a free query, see RAW scores, and
 * calibrate the similarity threshold. Search once returned 0 hits because the
 * default 0.70 (OpenAI-calibrated) was too high for Gemini (~0.65 relevant).
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P0-C
 */

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { SOURCE_TYPES, SOURCE_TYPE_LABELS, SourceType } from "../../types/common";
import { AiConfig } from "../../types/health";
import { SearchHit, SearchTestResponse } from "../../types/rag";
import { AiAdminService } from "../../services/aiAdmin.service";
import { InfoIcon, SearchIcon } from "../shared/icons";
import {
  Badge,
  Card,
  ChannelBadge,
  CHANNEL_OPTIONS,
  CHANNEL_LABELS,
  ErrorNotice,
  InfoBanner,
  PageHeader,
  ScoreBar,
  SectionCard,
  Spinner,
} from "../shared/ui";

export default function RagSearchPlayground() {
  const [query, setQuery] = useState("product color and size variant");
  const [sourceType, setSourceType] = useState<SourceType>("FIELD_MAPPING");
  const [channelId, setChannelId] = useState<string>("");
  const [limit, setLimit] = useState(10);
  const [minScore, setMinScore] = useState(0); // start in RAW mode (see all top-K)

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [result, setResult] = useState<SearchTestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Fetch effective threshold config once — lets us show config vs override.
  useEffect(() => {
    AiAdminService.getConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await AiAdminService.searchTest({
        query: query.trim(),
        sourceType,
        channelId: channelId || undefined,
        limit,
        minScore,
      });
      setResult(res);
    } catch (e) {
      setError(e);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [query, sourceType, channelId, limit, minScore]);

  const configThreshold = config?.vectorStore.minSimilarityScore;
  const isOverride = configThreshold != null && minScore !== configThreshold;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<SearchIcon size={20} />}
        title="RAG Search Playground"
        subtitle="Uji retrieval & kalibrasi threshold similarity."
      />

      <InfoBanner tone="blue">
        <p>
          <strong>Band skor (Gemini):</strong> match relevan biasanya <strong>0.60–0.66</strong>, noise
          sekitar <strong>0.44</strong>. Set <em>minScore = 0</em> untuk melihat skor mentah seluruh top-K, lalu
          tetapkan <code className="font-mono">AI_MIN_SIMILARITY_SCORE</code> di antara band relevan & noise.
        </p>
      </InfoBanner>

      {/* Query controls */}
      <Card className="p-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <SearchIcon size={15} />
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Ketik query bebas… (mis. 'product color and size variant')"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? <Spinner size={14} /> : <SearchIcon size={14} />}
            Search
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: type + channel + limit */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0">Source type</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0">Channel</label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <option value="">All channels</option>
                {CHANNEL_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c] ?? c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0">Limit</label>
              <input
                type="range"
                min={1}
                max={25}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="flex-1 accent-violet-600"
              />
              <span className="text-xs font-mono text-gray-600 dark:text-gray-300 w-6 text-right">{limit}</span>
            </div>
          </div>

          {/* Right: minScore slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                minScore {minScore === 0 && <span className="text-violet-500 font-medium">· RAW mode</span>}
              </label>
              <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-200">
                {minScore.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
              <span>0.0 (raw)</span>
              <span className="text-red-400">~0.44 noise</span>
              <span className="text-green-500">~0.65 relevan</span>
              <span>1.0</span>
            </div>
            {configThreshold != null && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-gray-400">
                  Config aktif: <code className="font-mono">{configThreshold}</code>
                </span>
                {isOverride ? (
                  <Badge tone="amber">override {minScore.toFixed(2)}</Badge>
                ) : (
                  <Badge tone="gray">memakai config</Badge>
                )}
                {configThreshold !== minScore && (
                  <button
                    onClick={() => setMinScore(configThreshold)}
                    className="text-[11px] text-blue-500 hover:underline"
                  >
                    reset ke config
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Results */}
      {error ? (
        <ErrorNotice error={error} onRetry={runSearch} />
      ) : result ? (
        <SectionCard
          title="Hasil"
          subtitle={`query "${result.query}" · minScore efektif ${result.minScore.toFixed(2)}`}
          icon={<SearchIcon size={16} />}
          right={
            <Badge tone={result.resultCount > 0 ? "green" : "amber"}>
              {result.resultCount} hasil
            </Badge>
          }
        >
          {result.resultCount === 0 ? (
            <ZeroResults minScore={result.minScore} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 w-56">Score</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Snippet</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Channel</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Category</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((hit, i) => (
                    <ResultRow key={`${hit.referenceId}-${i}`} hit={hit} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : (
        !loading && (
          <div className="text-center py-16 text-sm text-gray-400">
            Masukkan query dan tekan <strong>Search</strong> untuk menguji retrieval.
          </div>
        )
      )}
    </div>
  );
}

function ResultRow({ hit }: { hit: SearchHit }) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
      <td className="px-3 py-2.5">
        <ScoreBar score={hit.score} />
      </td>
      <td className="px-3 py-2.5">
        <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{hit.snippet}</code>
      </td>
      <td className="px-3 py-2.5">
        <ChannelBadge channelId={hit.channelId} />
      </td>
      <td className="px-3 py-2.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {hit.categoryId && hit.categoryId !== "null" ? hit.categoryId : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <code className="text-[11px] font-mono text-gray-400" title={hit.referenceId}>
          {hit.referenceId.slice(-8)}
        </code>
      </td>
    </tr>
  );
}

function ZeroResults({ minScore }: { minScore: number }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 mb-3">
        <InfoIcon size={20} />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">0 hasil</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
        {minScore > 0 ? (
          <>
            Kemungkinan threshold <code className="font-mono">{minScore.toFixed(2)}</code> terlalu tinggi.
            Turunkan slider <strong>minScore</strong> (coba 0 = RAW) untuk melihat skor mentah — bukan berarti
            index kosong.
          </>
        ) : (
          <>
            Bahkan di mode RAW tidak ada kandidat. Kemungkinan index kosong untuk source type ini — cek{" "}
            <Link href="/platform-admin/ai-rag-index" className="text-blue-500 hover:underline">
              RAG Index Management
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
