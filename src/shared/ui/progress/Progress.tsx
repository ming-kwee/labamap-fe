import React from "react";

interface ProgressProps {
  value: number; // Progress value (0-100)
  className?: string;
  color?: "primary" | "success" | "warning" | "error";
}

const Progress: React.FC<ProgressProps> = ({ 
  value, 
  className = "", 
  color = "primary" 
}) => {
  const colorClasses = {
    primary: "bg-brand-500",
    success: "bg-success-500",
    warning: "bg-warning-500",
    error: "bg-error-500",
  };

  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700 ${className}`}>
      <div
        className={`h-2 rounded-full transition-all duration-300 ${colorClasses[color]}`}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};

export default Progress;