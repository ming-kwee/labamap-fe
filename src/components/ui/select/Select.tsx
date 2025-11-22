import React, { useState, useEffect } from "react";

interface SelectProps {
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
  value?: string;
  defaultValue?: string;
}

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  name?: string;
}

interface SelectContentProps {
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({ 
  children, 
  onValueChange, 
  value, 
  defaultValue 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || defaultValue || "");

  // Sync internal state with external value prop
  useEffect(() => {
    console.log('Select value prop changed:', value);
    if (value !== undefined) {
      setSelectedValue(value);
      console.log('Selected value updated to:', value);
    }
  }, [value]);

  const handleValueChange = (newValue: string) => {
    console.log('Select handleValueChange called with:', newValue);
    setSelectedValue(newValue);
    setIsOpen(false);
    if (onValueChange) {
      console.log('Calling onValueChange with:', newValue);
      onValueChange(newValue);
    } else {
      console.log('No onValueChange function provided');
    }
  };

  return (
    <div className="relative">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            isOpen,
            setIsOpen,
            selectedValue,
            handleValueChange,
          });
        }
        return child;
      })}
    </div>
  );
};

export const SelectTrigger: React.FC<SelectTriggerProps & any> = ({ 
  children, 
  className = "", 
  id,
  name,
  isOpen, 
  setIsOpen,
  selectedValue 
}) => {
  return (
    <>
      <input
        type="hidden"
        name={name}
        value={selectedValue || ''}
        readOnly
      />
      <button
        type="button"
        id={id}
        className={`flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 ${className}`}
        onClick={() => {
          console.log('Select trigger clicked, isOpen:', isOpen);
          setIsOpen(!isOpen);
        }}
      >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          console.log('SelectTrigger passing selectedValue to child:', selectedValue);
          return React.cloneElement(child as React.ReactElement<any>, {
            selectedValue,
          });
        }
        return child;
      })}
      <svg
        className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    </>
  );
};

export const SelectContent: React.FC<SelectContentProps & any> = ({ 
  children, 
  isOpen, 
  handleValueChange 
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <div className="max-h-60 overflow-auto p-1">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              handleValueChange,
            });
          }
          return child;
        })}
      </div>
    </div>
  );
};

export const SelectItem: React.FC<SelectItemProps & any> = ({ 
  value, 
  children, 
  handleValueChange 
}) => {
  return (
    <div
      className="cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('SelectItem clicked with value:', value);
        if (handleValueChange) {
          console.log('handleValueChange exists, calling it');
          handleValueChange(value);
        } else {
          console.log('No handleValueChange function provided to SelectItem');
        }
      }}
    >
      {children}
    </div>
  );
};

export const SelectValue: React.FC<SelectValueProps & any> = ({ 
  placeholder, 
  selectedValue 
}) => {
  console.log('SelectValue rendering with selectedValue:', selectedValue, 'placeholder:', placeholder);
  return (
    <span className={selectedValue ? "" : "text-gray-400"}>
      {selectedValue || placeholder}
    </span>
  );
};