import React from "react";

interface Props {
  score: number; // 0-100
  showLabel?: boolean;
}

export const HealthScoreBar: React.FC<Props> = ({ score, showLabel = true }) => {
  const color =
    score >= 85 ? "bg-success-500" : score >= 70 ? "bg-warning-400" : "bg-error-500";
  const textColor =
    score >= 85 ? "text-success-600 dark:text-success-400" : score >= 70 ? "text-warning-600 dark:text-warning-400" : "text-error-600 dark:text-error-400";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-semibold tabular-nums ${textColor}`}>{score}</span>
      )}
    </div>
  );
};
