"use client";

/**
 * BlockCanvas — the Scratch-style ("Blocks") editor for the pipeline.
 *
 * Model & why it is only two levels deep:
 *   The pipeline is a flat, ordered list of top-level steps. The ONE container op is
 *   FOR_EACH (a LIST-scope op declaring a `steps` param — detected data-drivenly by
 *   `isContainerOp`). Its `children` are PER_ITEM leaves applied to each array item.
 *   FOR_EACH is root-only and cannot nest in FOR_EACH, so the maximum nesting is:
 *       root statements  +  one FOR_EACH's per-item children  =  depth 2.
 *   We therefore use dnd-kit's *multiple-containers* pattern rather than an
 *   arbitrary-depth tree: one root SortableContext, plus one droppable SortableContext
 *   per FOR_EACH "mouth".
 *
 * Scope-gated drops (the smart part), enforced in onDragOver / onDragEnd:
 *   • PER_ITEM block  → only inside a FOR_EACH mouth (never at root).
 *   • DOCUMENT / LIST block (incl. FOR_EACH itself) → root only (never in a mouth).
 *   Invalid moves are rejected (no-op) and the rejected target shows a red ring.
 */

import React, { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { OperationSpec, OpScope, PipelineStep } from "../_types/playground";
import { isContainerOp, seedStepFromSpec } from "./paramKind";
import BlockItem, { BlockBody } from "./BlockItem";
import OpPalette from "./OpPalette";

const ROOT = "root";

const PlusIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5v14" /></svg>);
const PuzzleIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" /></svg>);

// ─── Scope helpers ─────────────────────────────────────────────────────────────

/** Root-legal = DOCUMENT or LIST scope (containers are LIST). PER_ITEM is mouth-only. */
function isRootLegal(scope: OpScope | undefined): boolean {
  return scope === "DOCUMENT" || scope === "LIST";
}
/** Mouth-legal = PER_ITEM scope only. */
function isMouthLegal(scope: OpScope | undefined): boolean {
  return scope === "PER_ITEM";
}

// ─── Nested-model helpers (single source of truth = steps: PipelineStep[]) ──────

/**
 * The container id ("root" or a FOR_EACH step id) that holds `itemId`.
 * `itemId` may be a top-level step, a child step, or a container used as a drop target.
 */
function findContainer(steps: PipelineStep[], itemId: UniqueIdentifier): string | null {
  if (itemId === ROOT) return ROOT;
  // A top-level step (incl. a FOR_EACH used as its own drop target) lives at root.
  if (steps.some((s) => s.id === itemId)) return ROOT;
  // Otherwise it may be a child of some FOR_EACH.
  const parent = steps.find((s) => s.children?.some((c) => c.id === itemId));
  return parent ? parent.id : null;
}

/** Ordered ids in a container ("root" → top-level ids; else that FOR_EACH's child ids). */
function itemsIn(steps: PipelineStep[], containerId: string): string[] {
  if (containerId === ROOT) return steps.map((s) => s.id);
  const c = steps.find((s) => s.id === containerId);
  return (c?.children ?? []).map((s) => s.id);
}

/** Locate a step (searching root + one level of children) and return it. */
function findStep(steps: PipelineStep[], id: UniqueIdentifier): PipelineStep | undefined {
  for (const s of steps) {
    if (s.id === id) return s;
    const child = s.children?.find((c) => c.id === id);
    if (child) return child;
  }
  return undefined;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function BlockCanvas({
  steps,
  specByCode,
  onChange,
}: {
  steps: PipelineStep[];
  specByCode: Record<string, OperationSpec>;
  onChange: (steps: PipelineStep[]) => void;
}) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [invalidTargetId, setInvalidTargetId] = useState<string | null>(null);
  // Which palette is open: null | { container: "root" | <forEachId> }
  const [palette, setPalette] = useState<{ container: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const specFor = (opCode: string): OperationSpec | undefined => specByCode[opCode];
  const scopeFor = (id: UniqueIdentifier): OpScope | undefined => {
    const s = findStep(steps, id);
    return s ? specFor(s.opCode)?.scope : undefined;
  };

  const rootIds = useMemo(() => steps.map((s) => s.id), [steps]);
  const activeStep = activeId ? findStep(steps, activeId) : undefined;

  // ── Mutations ────────────────────────────────────────────────────────────────

  const patchStep = (id: string, patch: Partial<PipelineStep>) => {
    onChange(
      steps.map((s) => {
        if (s.id === id) return { ...s, ...patch };
        if (s.children?.some((c) => c.id === id)) {
          return { ...s, children: s.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
        }
        return s;
      }),
    );
  };

  const removeStep = (id: string) => {
    onChange(
      steps
        .filter((s) => s.id !== id)
        .map((s) => (s.children ? { ...s, children: s.children.filter((c) => c.id !== id) } : s)),
    );
  };

  const addStep = (spec: OperationSpec, containerId: string) => {
    const seeded = seedStepFromSpec(spec, uuidv4());
    if (containerId === ROOT) {
      onChange([...steps, seeded]);
    } else {
      onChange(
        steps.map((s) =>
          s.id === containerId ? { ...s, children: [...(s.children ?? []), seeded] } : s,
        ),
      );
    }
    setPalette(null);
  };

  // ── Drag: compute a would-be reordered `steps`, gating by scope ────────────────

  /**
   * Move `activeId` so it sits at `overId`'s slot in `overContainer`, returning the new
   * nested steps — or null if the move is scope-illegal (caller shows the red ring).
   */
  function computeMove(
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier,
    overContainer: string,
  ): PipelineStep[] | null {
    const active = findStep(steps, activeId);
    if (!active) return null;
    const scope = specFor(active.opCode)?.scope;

    // Scope gate: which container may this block land in?
    if (overContainer === ROOT && !isRootLegal(scope)) return null;
    if (overContainer !== ROOT && !isMouthLegal(scope)) return null;

    const fromContainer = findContainer(steps, activeId);
    if (!fromContainer) return null;

    // Pull the active step out of its current home.
    let working = steps;
    let moved: PipelineStep | undefined;
    if (fromContainer === ROOT) {
      moved = working.find((s) => s.id === activeId);
      working = working.filter((s) => s.id !== activeId);
    } else {
      working = working.map((s) => {
        if (s.id !== fromContainer || !s.children) return s;
        moved = s.children.find((c) => c.id === activeId);
        return { ...s, children: s.children.filter((c) => c.id !== activeId) };
      });
    }
    if (!moved) return null;

    // Insert into the target container at the over-item's index.
    if (overContainer === ROOT) {
      const ids = working.map((s) => s.id);
      let idx = overId === ROOT ? ids.length : ids.indexOf(overId as string);
      if (idx < 0) idx = ids.length;
      const next = working.slice();
      next.splice(idx, 0, moved);
      return next;
    }
    return working.map((s) => {
      if (s.id !== overContainer) return s;
      const children = (s.children ?? []).slice();
      const ids = children.map((c) => c.id);
      // Dropping onto the container itself (empty mouth) → append.
      let idx = overId === overContainer ? children.length : ids.indexOf(overId as string);
      if (idx < 0) idx = children.length;
      children.splice(idx, 0, moved as PipelineStep);
      return { ...s, children };
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(e.active.id);
    setInvalidTargetId(null);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) {
      setInvalidTargetId(null);
      return;
    }
    const overContainer = findContainer(steps, over.id);
    if (!overContainer) {
      setInvalidTargetId(null);
      return;
    }
    const scope = scopeFor(active.id);
    const legal =
      overContainer === ROOT ? isRootLegal(scope) : isMouthLegal(scope);
    if (!legal) {
      // Mark the rejected target (the container or the over-item) with a red ring.
      setInvalidTargetId(overContainer === ROOT ? (over.id as string) : overContainer);
      return;
    }
    setInvalidTargetId(null);

    // Live cross-list move (reorder within a list is finalized on drop).
    const fromContainer = findContainer(steps, active.id);
    if (fromContainer && fromContainer !== overContainer) {
      const next = computeMove(active.id, over.id, overContainer);
      if (next) onChange(next);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setInvalidTargetId(null);
    if (!over) return;

    const overContainer = findContainer(steps, over.id);
    const activeContainer = findContainer(steps, active.id);
    if (!overContainer || !activeContainer) return;

    const scope = scopeFor(active.id);
    const legal = overContainer === ROOT ? isRootLegal(scope) : isMouthLegal(scope);
    if (!legal) return; // reject invalid drop (no-op)

    if (activeContainer === overContainer) {
      // Pure reorder within one list.
      const ids = itemsIn(steps, overContainer);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = over.id === overContainer ? ids.length - 1 : ids.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const reordered = arrayMove(ids, oldIndex, newIndex);
      if (overContainer === ROOT) {
        const byId = new Map(steps.map((s) => [s.id, s]));
        onChange(reordered.map((id) => byId.get(id)!).filter(Boolean));
      } else {
        onChange(
          steps.map((s) => {
            if (s.id !== overContainer || !s.children) return s;
            const byId = new Map(s.children.map((c) => [c.id, c]));
            return { ...s, children: reordered.map((id) => byId.get(id)!).filter(Boolean) };
          }),
        );
      }
      return;
    }

    // Cross-list drop was already applied live in onDragOver; finalize position here.
    const next = computeMove(active.id, over.id, overContainer);
    if (next) onChange(next);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalBlocks = steps.length + steps.reduce((n, s) => n + (s.children?.length ?? 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel toolbar */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-[11px] text-gray-400">
          {totalBlocks} block{totalBlocks !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => setPalette({ container: ROOT })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <PlusIcon /> Add block
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><PuzzleIcon /></div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No blocks yet</p>
            <p className="text-xs text-gray-400 mb-3 max-w-xs">Snap blocks together — drag to reorder, and drop per-item ops inside a FOR EACH loop.</p>
            <button
              type="button"
              onClick={() => setPalette({ container: ROOT })}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <PlusIcon /> Add your first block
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              setInvalidTargetId(null);
            }}
          >
            <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {steps.map((step) => {
                  const spec = specFor(step.opCode);
                  const container = isContainerOp(spec);
                  return (
                    <BlockItem
                      key={step.id}
                      step={step}
                      spec={spec}
                      onChange={(patch) => patchStep(step.id, patch)}
                      onRemove={() => removeStep(step.id)}
                      invalidDrop={invalidTargetId === step.id}
                      mouth={
                        container ? (
                          <ForEachMouth
                            containerId={step.id}
                            items={step.children ?? []}
                            specByCode={specByCode}
                            invalidTargetId={invalidTargetId}
                            onPatchChild={patchStep}
                            onRemoveChild={removeStep}
                            onAddClick={() => setPalette({ container: step.id })}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeStep ? (
                <div className="opacity-90">
                  <BlockBody
                    step={activeStep}
                    spec={specFor(activeStep.opCode)}
                    isContainer={isContainerOp(specFor(activeStep.opCode))}
                    ghost
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Palette — filtered by where it was opened from. */}
      {palette && (
        <OpPalette
          operations={Object.values(specByCode)}
          scopeFilter={palette.container === ROOT ? ["DOCUMENT", "LIST"] : ["PER_ITEM"]}
          title={palette.container === ROOT ? "Add block" : "Add per-item op"}
          onSelect={(spec) => addStep(spec, palette.container)}
          onClose={() => setPalette(null)}
        />
      )}
    </div>
  );
}

// ─── FOR_EACH mouth ─────────────────────────────────────────────────────────────

function ForEachMouth({
  containerId,
  items,
  specByCode,
  invalidTargetId,
  onPatchChild,
  onRemoveChild,
  onAddClick,
}: {
  containerId: string;
  items: PipelineStep[];
  specByCode: Record<string, OperationSpec>;
  invalidTargetId: string | null;
  onPatchChild: (id: string, patch: Partial<PipelineStep>) => void;
  onRemoveChild: (id: string) => void;
  onAddClick: () => void;
}) {
  // The mouth is itself a droppable so an empty loop can still receive a block.
  const { setNodeRef, isOver } = useDroppable({ id: containerId, data: { type: "mouth" } });
  const childIds = items.map((c) => c.id);
  const invalid = invalidTargetId === containerId;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-colors ${
        invalid
          ? "ring-2 ring-red-400 dark:ring-red-500"
          : isOver
            ? "ring-2 ring-amber-300 dark:ring-amber-600"
            : ""
      }`}
    >
      <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic py-2 px-1">
              Drop per-item ops here, or use the button below.
            </p>
          ) : (
            items.map((child) => (
              <BlockItem
                key={child.id}
                step={child}
                spec={specByCode[child.opCode]}
                onChange={(patch) => onPatchChild(child.id, patch)}
                onRemove={() => onRemoveChild(child.id)}
              />
            ))
          )}
        </div>
      </SortableContext>

      <button
        type="button"
        onClick={onAddClick}
        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium rounded-lg transition-colors"
      >
        <PlusIcon /> add per-item op
      </button>
    </div>
  );
}
