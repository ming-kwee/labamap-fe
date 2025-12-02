'use client';

/**
 * Edit Conditional Logic Rule Page
 * Route: /conditional-logic/edit/[id]
 */

import React from 'react';
import RuleBuilder from '@/modules/ecommerce-conditional-logic/components/RuleBuilder';
import { useRouter, useParams } from 'next/navigation';

export default function EditRulePage() {
  const router = useRouter();
  const params = useParams();
  const ruleId = params.id as string;

  const handleSave = () => {
    // RuleBuilder handles the save logic internally
    // This callback is called after successful save
    console.log('[EditRulePage] Rule updated successfully:', ruleId);
  };

  const handleCancel = () => {
    console.log('[EditRulePage] Edit cancelled:', ruleId);
    router.push('/conditional-logic');
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Edit Conditional Logic Rule
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Modify conditions and actions for this rule
        </p>
      </div>

      <RuleBuilder ruleId={ruleId} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
