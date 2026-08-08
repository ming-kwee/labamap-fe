"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChannelType, ChannelImageSpec, ImageIssue } from "../../types/channelStore";
import { ChannelImageSpecService } from "../../services/channelImageSpec.service";
import { MediaUploadService } from "../../../services/media-upload.service";
import { specAspect, specMaxWidth, blobToFile } from "../../../utils/image-crop";
import ImageCropModal from "./ImageCropModal";

/**
 * Step-2 per-store image override editor (images I4 — contract docs/images/06).
 *
 * Master `images` stay canonical and are shown read-only as the inheritance baseline. When the seller
 * customises, an ordered URL list is written to `channelData.images` (the existing per-store override
 * mechanism the backend merges before publish). Empty override = nothing sent = publish falls back to
 * master. Crop/resize produces a new derivative file (upload) — the master is never mutated.
 *
 * Validation against the channel's ChannelImageSpec is warning-first (observe-only): issues are shown
 * inline and never block save. Everything channel-specific (aspect, max count, dimensions) comes from
 * the spec DATA, not literals.
 */

const PLACEHOLDER =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"%3E%3Crect width="120" height="120" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="11"%3Eunavailable%3C/text%3E%3C/svg%3E';

interface Props {
  channelType: ChannelType;
  orgId: string;
  masterProductId: string;
  /** Canonical master gallery (read-only reference / fallback). */
  masterImages: string[];
  /** channelData.images override (ordered) or undefined when inheriting master. */
  value: string[] | undefined;
  /** Write the override (non-empty) or clear it (undefined = fall back to master). */
  onChange: (urls: string[] | undefined) => void;
}

type CropTask = { src: string; revoke: boolean; replaceIndex?: number };

function Thumb({ url, className = "" }: { url: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={`object-cover bg-gray-100 dark:bg-gray-800 ${className}`}
      onError={(e) => {
        (e.target as HTMLImageElement).src = PLACEHOLDER;
      }}
    />
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 flex items-center justify-center rounded-md bg-white/90 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-white hover:text-gray-900 dark:hover:text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

export default function StoreImageOverrideEditor({
  channelType,
  orgId,
  masterProductId,
  masterImages,
  value,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [spec, setSpec] = useState<ChannelImageSpec | null>(null);
  const [issues, setIssues] = useState<ImageIssue[]>([]);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localEditing, setLocalEditing] = useState(false);
  const [cropTask, setCropTask] = useState<CropTask | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropInputRef = useRef<HTMLInputElement>(null);
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overrideActive = value !== undefined;
  const editing = overrideActive || localEditing;
  const list = useMemo(() => value ?? [], [value]);

  // The list that will actually publish — used for validation + the "n images" summary.
  const effectiveList = editing && list.length ? list : masterImages;

  // ── Fetch the channel image spec (best-effort, per channel) ──────────────────
  useEffect(() => {
    let cancelled = false;
    ChannelImageSpecService.getSpec(channelType).then((s) => {
      if (!cancelled) setSpec(s);
    });
    return () => {
      cancelled = true;
    };
  }, [channelType]);

  // ── Debounced spec validation (warning-first, never blocks) ──────────────────
  useEffect(() => {
    if (validateTimer.current) clearTimeout(validateTimer.current);
    if (!effectiveList.length) {
      setIssues([]);
      return;
    }
    validateTimer.current = setTimeout(async () => {
      setValidating(true);
      const result = await ChannelImageSpecService.validate(channelType, {
        images: effectiveList.map((url) => ({ url })),
      });
      setIssues(result);
      setValidating(false);
    }, 600);
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
    // effectiveList is derived; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelType, effectiveList.join("|")]);

  // ── Override mutation (empty → clear = fall back to master) ───────────────────
  const commit = useCallback(
    (next: string[]) => {
      setLocalEditing(true); // stay in edit mode even if the list empties out
      onChange(next.length ? next : undefined);
    },
    [onChange],
  );

  function startCustomize() {
    setExpanded(true);
    if (masterImages.length) onChange([...masterImages]);
    else setLocalEditing(true);
  }

  function resetToMaster() {
    setLocalEditing(false);
    setIssues([]);
    onChange(undefined);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function setMain(index: number) {
    if (index === 0) return;
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    commit(next);
  }

  function removeAt(index: number) {
    commit(list.filter((_, i) => i !== index));
  }

  function addFromMaster(url: string) {
    if (list.includes(url)) return;
    commit([...list, url]);
  }

  // ── Upload ───────────────────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      const pid = masterProductId || "unknown";
      try {
        // Prefer presign (offloads transfer from the backend); fall back to proxied upload.
        const r = await MediaUploadService.uploadViaPresign(file, orgId, pid, "gallery");
        return r.publicUrl;
      } catch {
        const r = await MediaUploadService.uploadImage(file, orgId, pid, "gallery");
        return r.publicUrl;
      }
    },
    [orgId, masterProductId],
  );

  async function handleAddFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true);
    setError(null);
    const added: string[] = [];
    try {
      for (let i = 0; i < arr.length; i++) {
        setUploadNote(`Uploading ${i + 1}/${arr.length}…`);
        added.push(await uploadFile(arr[i]));
      }
      commit([...list, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadNote(null);
    }
  }

  // ── Crop ───────────────────────────────────────────────────────────────────
  function openCropForNewFile(file: File) {
    setCropTask({ src: URL.createObjectURL(file), revoke: true });
  }

  function openReCrop(index: number) {
    // Best-effort: re-crop an already-listed URL. Requires CORS-readable storage; the modal shows a
    // clear message and the caller keeps the original if the browser can't read the pixels.
    setCropTask({ src: list[index], revoke: false, replaceIndex: index });
  }

  async function handleCropped(blob: Blob) {
    const task = cropTask;
    setCropTask(null);
    if (task?.revoke) URL.revokeObjectURL(task.src);
    setUploading(true);
    setUploadNote("Uploading cropped image…");
    setError(null);
    try {
      const url = await uploadFile(blobToFile(blob, `crop-${Date.now()}.jpg`));
      if (task?.replaceIndex != null) {
        commit(list.map((u, i) => (i === task.replaceIndex ? url : u)));
      } else {
        commit([...list, url]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadNote(null);
    }
  }

  function cancelCrop() {
    if (cropTask?.revoke) URL.revokeObjectURL(cropTask.src);
    setCropTask(null);
  }

  // ── Derived display ──────────────────────────────────────────────────────────
  const cropAspect = specAspect(spec);
  const cropMaxWidth = specMaxWidth(spec);
  const overCount = spec?.maxCount != null && effectiveList.length > spec.maxCount;

  const reqParts: string[] = [];
  if (spec?.maxCount != null) reqParts.push(`up to ${spec.maxCount} images`);
  if (spec?.requireSquare) reqParts.push("square (1:1)");
  else if (spec?.allowedAspectRatios?.length) reqParts.push(`aspect ${spec.allowedAspectRatios.join(" / ")}`);
  if (spec?.minWidth || spec?.minHeight) reqParts.push(`min ${spec?.minWidth ?? "?"}×${spec?.minHeight ?? "?"}px`);
  if (spec?.maxBytes) reqParts.push(`≤ ${(spec.maxBytes / (1024 * 1024)).toFixed(0)}MB`);
  if (spec?.allowedFormats?.length) reqParts.push(spec.allowedFormats.join("/").toUpperCase());

  return (
    <div className="rounded-xl border border-l-4 border-l-sky-400 dark:border-l-sky-500 border-sky-200/70 dark:border-sky-500/20 bg-sky-50/40 dark:bg-sky-500/5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 rounded-xl hover:brightness-[0.98] dark:hover:brightness-110 transition"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[10px] font-bold text-sky-500 dark:text-sky-400 uppercase tracking-wider flex-shrink-0">
            Images
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">Images (per store)</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${
              overrideActive
                ? "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
            }`}
          >
            {overrideActive ? `${list.length} custom` : `Master · ${masterImages.length}`}
          </span>
          {issues.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-md font-medium bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex-shrink-0">
              {issues.length} warning{issues.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Channel requirements (from spec DATA) */}
          {reqParts.length > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-600 dark:text-gray-300">{channelType} requirements:</span>{" "}
              {reqParts.join(" · ")}
              {spec?.channelSideUpload ? " · channel fetches the public URL" : ""}
            </p>
          )}

          {/* Master reference (read-only) */}
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              Master images <span className="font-normal text-gray-400">· read-only · shared baseline</span>
            </p>
            {masterImages.length ? (
              <div className="flex flex-wrap gap-2">
                {masterImages.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative">
                    <Thumb url={url} className="h-16 w-16 rounded-lg border border-gray-200 dark:border-gray-700" />
                    {editing && !list.includes(url) && (
                      <button
                        type="button"
                        title="Add to this store"
                        onClick={() => addFromMaster(url)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-sky-500 text-white text-sm leading-none shadow hover:bg-sky-600"
                      >
                        +
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">No master images.</p>
            )}
          </div>

          {/* Inherited state (no override yet) */}
          {!editing ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This store publishes the master images. Customise to reorder, replace, crop, or set a
                different main image — the master stays untouched.
              </p>
              <button
                type="button"
                onClick={startCustomize}
                className="flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors"
              >
                Customise
              </button>
            </div>
          ) : (
            <>
              {/* Override list (ordered) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    This store’s images <span className="font-normal text-gray-400">· drag order via arrows · first = main</span>
                  </p>
                  <button
                    type="button"
                    onClick={resetToMaster}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
                  >
                    Reset to master
                  </button>
                </div>

                {list.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {list.map((url, i) => (
                      <div
                        key={`${url}-${i}`}
                        className={`relative group aspect-square rounded-lg overflow-hidden border ${
                          i === 0 ? "border-sky-400 dark:border-sky-500 ring-1 ring-sky-300" : "border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <Thumb url={url} className="h-full w-full" />
                        {i === 0 && (
                          <span className="absolute top-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500 text-white shadow">
                            Main
                          </span>
                        )}
                        {/* Controls */}
                        <div className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <IconBtn title="Move left" onClick={() => move(i, -1)} disabled={i === 0}>
                            ‹
                          </IconBtn>
                          <IconBtn title="Move right" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                            ›
                          </IconBtn>
                          {i !== 0 && (
                            <IconBtn title="Set as main" onClick={() => setMain(i)}>
                              ★
                            </IconBtn>
                          )}
                          <IconBtn title="Crop / resize" onClick={() => openReCrop(i)}>
                            ✂
                          </IconBtn>
                          <IconBtn title="Remove" onClick={() => removeAt(i)}>
                            ✕
                          </IconBtn>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    No images selected for this store yet — add from master above or upload below.
                  </p>
                )}
              </div>

              {/* Upload / add controls */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) handleAddFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cropInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openCropForNewFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  + Upload images
                </button>
                <button
                  type="button"
                  onClick={() => cropInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  ✂ Crop &amp; add
                </button>
                {uploading && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                    {uploadNote ?? "Uploading…"}
                  </span>
                )}
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Spec validation warnings (observe-first) */}
          {(validating || issues.length > 0 || overCount) && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                {validating ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Checking channel image
                    rules…
                  </>
                ) : (
                  <>Channel image warnings (won’t block publishing)</>
                )}
              </p>
              {overCount && issues.every((x) => x.code !== "MAX_COUNT") && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  • {effectiveList.length} images exceeds the channel max of {spec?.maxCount}.
                </p>
              )}
              {issues.map((issue, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
                  • {issue.message}
                  {issue.code ? <span className="text-amber-500/70"> ({issue.code})</span> : null}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {cropTask && (
        <ImageCropModal
          src={cropTask.src}
          aspect={cropAspect}
          maxWidth={cropMaxWidth}
          title={cropTask.replaceIndex != null ? "Crop / resize image" : "Crop & add image"}
          onCancel={cancelCrop}
          onCropped={handleCropped}
        />
      )}
    </div>
  );
}
