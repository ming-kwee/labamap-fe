import React from "react";

interface AlertProps {
  children: React.ReactNode;
  variant?: "default" | "destructive" | "warning" | "success";
  className?: string;
}

interface AlertDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ 
  children, 
  variant = "default", 
  className = "" 
}) => {
  const variantClasses = {
    default: "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100",
    destructive: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/10 dark:text-red-400",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/10 dark:text-yellow-400",
    success: "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/10 dark:text-green-400",
  };

  return (
    <div
      className={`relative w-full rounded-lg border p-4 ${variantClasses[variant]} ${className}`}
      role="alert"
    >
      {children}
    </div>
  );
};

export const AlertDescription: React.FC<AlertDescriptionProps> = ({ 
  children, 
  className = "" 
}) => {
  return (
    <div className={`text-sm [&_p]:leading-relaxed ${className}`}>
      {children}
    </div>
  );
};