"use client";

import { useCallback, useState } from "react";
import { ReverseSyncService, ReverseApiError, isNotConfigured } from "../services/reverse.service";
import type {
  ChannelListPage,
  ReverseImportRequest,
  ReverseImportResult,
} from "../types/reverse";

/**
 * Drives the FE-0 "Import Listings" flow (use case B — channel-native → new master):
 *  • `browse()`  → `GET /import/list` (paginated catalogue; not all channels support it)
 *  • `preview()` → `POST /import/preview` (draftMaster + dedup matches; writes nothing)
 *
 * Commit (`/import`) is left to the caller/modal since it flips create-vs-link and
 * routes to the new master afterward.
 */
export function useReverseImport(organizationId: string) {
  // Browse
  const [listing, setListing] = useState<ChannelListPage | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  /** true when the channel does not support catalogue browse (needs manual payload). */
  const [listNotConfigured, setListNotConfigured] = useState(false);

  // Preview
  const [preview, setPreview] = useState<ReverseImportResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const browse = useCallback(
    async (storeId: string, limit = 50, offset = 0) => {
      setListLoading(true);
      setListError(null);
      setListNotConfigured(false);
      try {
        const page = await ReverseSyncService.listChannelListings({ organizationId, storeId, limit, offset });
        setListing(page);
      } catch (err) {
        if (isNotConfigured(err)) {
          setListing(null);
          setListNotConfigured(true);
        } else {
          setListError(err instanceof ReverseApiError ? err.message : "Failed to browse channel catalogue");
        }
      } finally {
        setListLoading(false);
      }
    },
    [organizationId],
  );

  const runPreview = useCallback(async (req: ReverseImportRequest): Promise<ReverseImportResult | null> => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const result = await ReverseSyncService.importPreview(req);
      setPreview(result);
      return result;
    } catch (err) {
      setPreviewError(err instanceof ReverseApiError ? err.message : "Failed to preview import");
      return null;
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const resetPreview = useCallback(() => {
    setPreview(null);
    setPreviewError(null);
  }, []);

  const resetBrowse = useCallback(() => {
    setListing(null);
    setListError(null);
    setListNotConfigured(false);
  }, []);

  return {
    // browse
    listing,
    listLoading,
    listError,
    listNotConfigured,
    browse,
    resetBrowse,
    // preview
    preview,
    previewLoading,
    previewError,
    runPreview,
    resetPreview,
  };
}
