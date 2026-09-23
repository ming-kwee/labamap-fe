"use client";

/**
 * PipelineBuilder — the ordered list of OpCards + "Add operation" trigger.
 * Owns nothing but rendering; all mutations bubble up to PlaygroundClient.
 */

import React from "react";
import { OperationSpec, PipelineStep } from "../_types/playground";
import OpCard from "./OpCard";

const PlusIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5v14" /></svg>);
const PuzzleIcon = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" /></svg>);

export default function PipelineBuilder({
  steps,
  specByCode,
  onAddClick,
  onStepChange,
  onMove,
  onRemove,
}: {
  steps: PipelineStep[];
  specByCode: Map<string, OperationSpec>;
  onAddClick: () => void;
  onStepChange: (id: string, patch: Partial<PipelineStep>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar (the panel above renders the "Pipeline" title + mode toggle). */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-[11px] text-gray-400">{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <PlusIcon /> Add operation
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><PuzzleIcon /></div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No operations yet</p>
            <p className="text-xs text-gray-400 mb-3 max-w-xs">Compose a pipeline by snapping operations together — each one transforms the JSON in order.</p>
            <button
              onClick={onAddClick}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <PlusIcon /> Add your first operation
            </button>
          </div>
        ) : (
          steps.map((step, i) => (
            <OpCard
              key={step.id}
              step={step}
              spec={specByCode.get(step.opCode)}
              index={i}
              total={steps.length}
              onChange={(patch) => onStepChange(step.id, patch)}
              onMove={(dir) => onMove(step.id, dir)}
              onRemove={() => onRemove(step.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
