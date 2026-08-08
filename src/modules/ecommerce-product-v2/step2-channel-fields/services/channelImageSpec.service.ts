/**
 * Channel Image Spec service (images I2/I4).
 *
 * Reads the per-channel image constraints (DATA — docs/images/03) and validates a set of image URLs
 * against them. Both calls are *best-effort and non-fatal*: the admin endpoints are part of the images
 * roadmap and may be absent in a given environment. On any failure we resolve to `null` / `[]` so the
 * Step-2 editor degrades gracefully (no spec hints, no warnings) instead of breaking the wizard —
 * consistent with the observe-first / warning-first policy of the feature.
 *
 * Contract: docs/images/06 §2.
 *   GET  /api/v1/admin/channel-image-specs/{channelType}[?categorySlug=…]        → ChannelImageSpec
 *   POST /api/v1/admin/channel-image-specs/{channelType}/validate                → ImageIssue[]
 *        body { categorySlug?, images:[{url,width?,height?,bytes?,format?}] }
 */
import type {
  ChannelType,
  ChannelImageSpec,
  ImageIssue,
  ImageValidationRequest,
} from "../types/channelStore";

const BASE = "http://localhost:8888/labamap/api/v1";

export const ChannelImageSpecService = {
  /**
   * Fetch the image spec for a channel (optionally scoped to a category slug).
   * Returns null when the endpoint is unavailable or has no spec for the channel.
   */
  async getSpec(
    channelType: ChannelType | string,
    categorySlug?: string,
  ): Promise<ChannelImageSpec | null> {
    const qs = categorySlug ? `?categorySlug=${encodeURIComponent(categorySlug)}` : "";
    try {
      const res = await fetch(
        `${BASE}/admin/channel-image-specs/${encodeURIComponent(channelType)}${qs}`,
        { method: "GET", headers: { "Content-Type": "application/json" } },
      );
      if (!res.ok) return null;
      return (await res.json()) as ChannelImageSpec;
    } catch {
      return null;
    }
  },

  /**
   * Validate the given images against the channel spec. Dimensions/bytes/format are filled
   * server-side from the recorded ImageAsset when the request omits them (I2b). Returns an empty
   * array on any failure (observe-first — a missing endpoint must never block the editor).
   */
  async validate(
    channelType: ChannelType | string,
    request: ImageValidationRequest,
  ): Promise<ImageIssue[]> {
    if (!request.images.length) return [];
    try {
      const res = await fetch(
        `${BASE}/admin/channel-image-specs/${encodeURIComponent(channelType)}/validate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as ImageIssue[] | { issues?: ImageIssue[] };
      // Tolerate both a bare array and an { issues:[…] } envelope.
      return Array.isArray(data) ? data : (data.issues ?? []);
    } catch {
      return [];
    }
  },
};
