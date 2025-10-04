import React, { createContext, useContext, useState } from "react";

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

interface TabsProps {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  children: React.ReactNode;
  value: string;
  className?: string;
}

interface TabsContentProps {
  children: React.ReactNode;
  value: string;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ 
  children, 
  defaultValue = "", 
  value, 
  onValueChange,
  className = "" 
}) => {
  const [internalValue, setInternalValue] = useState(value || defaultValue);
  
  const currentValue = value !== undefined ? value : internalValue;
  
  const handleValueChange = (newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue);
    }
    if (onValueChange) {
      onValueChange(newValue);
    }
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

export const TabsList: React.FC<TabsListProps> = ({ children, className = "" }) => {
  return (
    <div
      className={`inline-flex h-10 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500 dark:bg-gray-800 dark:text-gray-400 ${className}`}
      role="tablist"
    >
      {children}
    </div>
  );
};

export const TabsTrigger: React.FC<TabsTriggerProps> = ({ 
  children, 
  value: triggerValue, 
  className = "" 
}) => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used within a Tabs component");
  }

  const { value, onValueChange } = context;
  const isActive = value === triggerValue;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-gray-950 ${
        isActive
          ? "bg-white text-gray-950 shadow-sm dark:bg-gray-950 dark:text-gray-50"
          : "hover:bg-white/50 hover:text-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50"
      } ${className}`}
      onClick={() => onValueChange(triggerValue)}
    >
      {children}
    </button>
  );
};

export const TabsContent: React.FC<TabsContentProps> = ({ 
  children, 
  value: contentValue, 
  className = "" 
}) => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("TabsContent must be used within a Tabs component");
  }

  const { value } = context;
  
  if (value !== contentValue) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      className={`mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:ring-offset-gray-950 ${className}`}
    >
      {children}
    </div>
  );
};