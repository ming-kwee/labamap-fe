/**
 * Publish Diagnostics (product-aware) service.
 * POST /api/v1/channels/publish/analyze — pre-flight dry-run of the publish pipeline.
 *
 * docs/FRONTEND-PHASE0-CATEGORY-ANCHORING-AND-PUBLISH-DIAGNOSTICS.md §2–3.
 */

import type {
  PublishAnalysisRequest,
  PublishAnalysisResponse,
} from "../types/publish-analysis";

const API_ROOT =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8888/labamap/api/v1";

/**
 * Runs the readiness analysis. This is a **diagnostics** endpoint:
 * - `readyToPublish: false` is a valid 200 verdict — do NOT treat it as an error.
 * - 400 (masterProductId missing) / 500 return the SAME `PublishAnalysisResponse`
 *   shape with one ERROR issue, so we surface the body rather than throwing.
 * Only a network failure or a non-JSON body throws (real transport error / abort).
 */
export async function analyzePublish(
  request: PublishAnalysisRequest,
  signal?: AbortSignal,
): Promise<PublishAnalysisResponse> {
  const response = await fetch(`${API_ROOT}/channels/publish/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body on a hard failure — nothing structured to render.
    throw new Error(`Publish analyze gagal: ${response.status} ${response.statusText}`);
  }
  return body as PublishAnalysisResponse;
}
