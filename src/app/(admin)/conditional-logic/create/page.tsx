'use client';

/**
 * Create Conditional Logic Rule Page
 * Route: /conditional-logic/create
 */

import React from 'react';
import RuleBuilder from '@/modules/ecommerce-conditional-logic/components/RuleBuilder';
import { useRouter } from 'next/navigation';

export default function CreateRulePage() {
  const router = useRouter();

  const handleSave = () => {
    // RuleBuilder handles the save logic internally
    // This callback is called after successful save
    console.log('[CreateRulePage] Rule created successfully');
  };

  const handleCancel = () => {
    console.log('[CreateRulePage] Create cancelled');
    router.push('/conditional-logic');
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Create Conditional Logic Rule
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Define conditions and actions for dynamic form behavior
        </p>
      </div>

      <RuleBuilder onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
