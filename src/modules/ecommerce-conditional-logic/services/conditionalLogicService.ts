/**
 * Conditional Logic Service - API integration
 * Communicates with backend conditional rules APIs
 */

import {
  ConditionalLogicRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  ConditionalLogicStats,
  ValidateRuleRequest,
  ValidateRuleResponse,
  ConditionType
} from '../types/conditionalLogic';

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1/ecommerce';

export class ConditionalLogicService {
  /**
   * CRUD Operations
   */

  // Create a new rule
  static async createRule(rule: CreateRuleRequest): Promise<ConditionalLogicRule> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        // If parsing fails, use statusText
      }
      throw new Error(`Failed to create rule: ${errorMessage}`);
    }

    return response.json();
  }

  // Get all rules
  static async getAllRules(): Promise<ConditionalLogicRule[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get rules: ${response.statusText}`);
    }

    return response.json();
  }

  // Get rule by ID
  static async getRuleById(id: string): Promise<ConditionalLogicRule> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get rule: ${response.statusText}`);
    }

    return response.json();
  }

  // Update rule
  static async updateRule(id: string, rule: UpdateRuleRequest): Promise<ConditionalLogicRule> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rule),
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        // If parsing fails, use statusText
      }
      throw new Error(`Failed to update rule: ${errorMessage}`);
    }

    return response.json();
  }

  // Delete rule
  static async deleteRule(id: string): Promise<void> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete rule: ${response.statusText}`);
    }
  }

  /**
   * Filtering & Querying
   */

  // Get rules by trigger field
  static async getRulesByTriggerField(triggerField: string): Promise<ConditionalLogicRule[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/trigger/${triggerField}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get rules by trigger field: ${response.statusText}`);
    }

    return response.json();
  }

  // Get rules by trigger field and value
  static async getRulesByTriggerFieldValue(
    triggerField: string,
    triggerValue: string
  ): Promise<ConditionalLogicRule[]> {
    const response = await fetch(
      `${BACKEND_BASE_URL}/conditional-rules/trigger/${triggerField}/value/${triggerValue}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get rules by trigger field and value: ${response.statusText}`);
    }

    return response.json();
  }

  // Get rules by condition type
  static async getRulesByConditionType(conditionType: ConditionType): Promise<ConditionalLogicRule[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/condition-type/${conditionType}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get rules by condition type: ${response.statusText}`);
    }

    return response.json();
  }

  // Get rules by categories
  static async getRulesByCategories(categories: string[]): Promise<ConditionalLogicRule[]> {
    const categoriesParam = categories.join(',');
    const response = await fetch(
      `${BACKEND_BASE_URL}/conditional-rules/category?categories=${categoriesParam}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get rules by categories: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Utilities
   */

  // Get statistics
  static async getStats(): Promise<ConditionalLogicStats> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get stats: ${response.statusText}`);
    }

    return response.json();
  }

  // Toggle rule enabled/disabled
  static async toggleRule(id: string): Promise<ConditionalLogicRule> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/${id}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to toggle rule: ${response.statusText}`);
    }

    return response.json();
  }

  // Validate rule
  static async validateRule(rule: CreateRuleRequest): Promise<ValidateRuleResponse> {
    const response = await fetch(`${BACKEND_BASE_URL}/conditional-rules/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rule }),
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (e) {
        // If parsing fails, use statusText
      }
      throw new Error(`Failed to validate rule: ${errorMessage}`);
    }

    return response.json();
  }

  /**
   * Helper Methods
   */

  // Get rules for specific context (category, channels, etc.)
  static async getRulesForContext(context: {
    category?: string;
    channels?: string[];
    userRole?: string;
    organizationId?: string;
  }): Promise<ConditionalLogicRule[]> {
    // Start with all rules
    let rules = await this.getAllRules();

    // Filter by category if provided
    if (context.category) {
      rules = rules.filter(
        rule =>
          !rule.applicableCategories ||
          rule.applicableCategories.length === 0 ||
          rule.applicableCategories.includes(context.category!)
      );
    }

    // Filter by channels if provided
    if (context.channels && context.channels.length > 0) {
      rules = rules.filter(
        rule =>
          !rule.supportedChannels ||
          rule.supportedChannels.length === 0 ||
          rule.supportedChannels.some(channel => context.channels!.includes(channel))
      );
    }

    // Filter by user role if provided
    if (context.userRole) {
      rules = rules.filter(
        rule =>
          !rule.applicableUserRoles ||
          rule.applicableUserRoles.length === 0 ||
          rule.applicableUserRoles.includes(context.userRole!)
      );
    }

    // Filter by organization if provided
    if (context.organizationId) {
      rules = rules.filter(
        rule =>
          !rule.organizationId ||
          rule.organizationId === context.organizationId
      );
    }

    // Only return enabled rules
    rules = rules.filter(rule => rule.enabled);

    // Sort by priority (lower number = higher priority)
    rules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    return rules;
  }
}

// Re-export for convenience
export default ConditionalLogicService;
