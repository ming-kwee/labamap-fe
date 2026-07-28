/**
 * Publish-Trace Inspector service.
 * POST /api/v1/channels/publish/trace — dry-run stage-by-stage snapshot of the
 * publish pipeline. Read-only: does NOT call the channel API, does NOT write the DB.
 *
 * docs/FRONTEND-PUBLISH-TRACE-INSPECTOR.md
 */

import type {
  PublishTraceRequest,
  PublishTraceResponse,
} from "../types/publish-trace";

const API_ROOT =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8888/labamap/api/v1";

/**
 * Runs the publish trace. This is a **diagnostics** endpoint:
 * - 200 OK is returned for any trace that ran; problems live in the response CONTENT
 *   (e.g. a missing field in `afterJolt`), not the HTTP status.
 * - 500 returns the SAME `PublishTraceResponse` shape with `warnings:["Trace failed: ..."]`,
 *   and an empty `masterProductData` yields `warnings:["masterProductData is required ..."]`,
 *   so we surface the body rather than throwing.
 * Only a network failure or a non-JSON body throws (real transport error / abort).
 */
export async function tracePublish(
  request: PublishTraceRequest,
  signal?: AbortSignal,
): Promise<PublishTraceResponse> {
  const response = await fetch(`${API_ROOT}/channels/publish/trace`, {
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
    throw new Error(`Publish trace gagal: ${response.status} ${response.statusText}`);
  }
  return body as PublishTraceResponse;
}
