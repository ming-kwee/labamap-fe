"use client";
import React from "react";
import Button from "@/components/ui/button/Button";
import { BoltIcon, InfoIcon } from "@/icons";

export type TemplateCreationPath = 'quick-start' | 'advanced-builder';

interface TemplateEntrySelectorProps {
  onSelectPath: (path: TemplateCreationPath) => void;
}

const TemplateEntrySelector: React.FC<TemplateEntrySelectorProps> = ({ onSelectPath }) => {
  const pathOptions = [
    {
      id: 'quick-start' as const,
      title: 'Quick Start Templates',
      subtitle: 'Ready in 3-5 minutes',
      description: 'Pre-configured templates for common business scenarios. Perfect for getting started quickly with popular channels like Amazon, eBay, or Shopify.',
      icon: <BoltIcon className="w-8 h-8 text-green-600" />,
      features: [
        'Pre-configured for popular channels',
        'Minimal setup required',
        'Best practices included',
        'Start selling immediately'
      ],
      buttonText: 'Get Started Quickly',
      buttonVariant: 'default' as const,
      recommended: true
    },
    {
      id: 'advanced-builder' as const,
      title: 'Advanced Template Builder',
      subtitle: 'Full customization power',
      description: 'Complete control over field mappings, transformations, and complex rules. For power users who need maximum flexibility and real-world complexity.',
      icon: <InfoIcon className="w-8 h-8 text-purple-600" />,
      features: [
        'Complex field transformations',
        'Amazon validation & eBay pricing',
        'Shopify dimensions & Facebook rich content',
        'Real-world business scenarios'
      ],
      buttonText: 'Open Advanced Builder',
      buttonVariant: 'outline' as const,
      recommended: false
    }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Create Channel Template
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Choose the approach that best fits your needs and experience level. You can always upgrade to more advanced options later.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {pathOptions.map((option) => (
          <div
            key={option.id}
            className={`relative bg-white dark:bg-gray-800 rounded-xl border-2 p-6 hover:shadow-lg transition-all duration-200 ${
              option.recommended 
                ? 'border-green-200 dark:border-green-800 ring-2 ring-green-100 dark:ring-green-900' 
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {option.recommended && (
              <div className="absolute -top-3 left-6 bg-green-600 text-white text-sm font-medium px-3 py-1 rounded-full">
                Recommended
              </div>
            )}
            
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {option.icon}
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {option.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {option.subtitle}
                    </p>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                  {option.description}
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                  Key Features:
                </h4>
                <ul className="space-y-1">
                  {option.features.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                onClick={() => onSelectPath(option.id)}
                variant={option.buttonVariant}
                className={`w-full ${
                  option.recommended 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : ''
                }`}
              >
                {option.buttonText}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-sm font-bold">?</span>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-blue-900 dark:text-blue-100">
              Not sure which option to choose?
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-200 leading-relaxed">
              Start with <strong>Quick Start Templates</strong> if you&apos;re new to multi-channel selling or want to get up and running fast. 
              You can always create more advanced templates later as your needs grow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEntrySelector;