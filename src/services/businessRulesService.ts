// /**
//  * Business Rules API Service
//  * Handles all API calls to the backend business rules endpoints
//  */

// import type {
//   BusinessRule,
//   BusinessRulesResponse,
//   CreateRuleRequest,
//   UpdateRuleRequest,
//   RuleFilter,
// } from '@/types/businessRules';

// // Use Next.js API routes to avoid CORS issues
// const BUSINESS_RULES_ENDPOINT = '/api/business-rules';

// /**
//  * Get all business rules with optional filtering
//  */
// export async function getBusinessRules(filter?: RuleFilter): Promise<BusinessRulesResponse> {
//   try {
//     const params = new URLSearchParams();

//     if (filter?.type) {
//       params.append('type', filter.type);
//     }
//     if (filter?.fields && filter.fields.length > 0) {
//       params.append('fields', filter.fields.join(','));
//     }
//     if (filter?.categories && filter.categories.length > 0) {
//       params.append('categories', filter.categories.join(','));
//     }
//     if (filter?.channels && filter.channels.length > 0) {
//       params.append('channels', filter.channels.join(','));
//     }

//     const url = params.toString()
//       ? `${BUSINESS_RULES_ENDPOINT}?${params.toString()}`
//       : BUSINESS_RULES_ENDPOINT;

//     const response = await fetch(url, {
//       method: 'GET',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`Failed to fetch business rules: ${response.statusText}`);
//     }

//     const data = await response.json();
//     return data;
//   } catch (error) {
//     console.error('Error fetching business rules:', error);
//     throw error;
//   }
// }

// /**
//  * Get a single business rule by ID
//  */
// export async function getBusinessRule(ruleId: string): Promise<BusinessRulesResponse> {
//   try {
//     const response = await fetch(`${BUSINESS_RULES_ENDPOINT}/${ruleId}`, {
//       method: 'GET',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });

//     if (!response.ok) {
//       if (response.status === 404) {
//         throw new Error(`Rule not found: ${ruleId}`);
//       }
//       throw new Error(`Failed to fetch business rule: ${response.statusText}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error(`Error fetching business rule ${ruleId}:`, error);
//     throw error;
//   }
// }

// /**
//  * Create a new business rule
//  */
// export async function createBusinessRule(
//   rule: CreateRuleRequest
// ): Promise<BusinessRulesResponse> {
//   try {
//     const response = await fetch(BUSINESS_RULES_ENDPOINT, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(rule),
//     });

//     if (!response.ok) {
//       if (response.status === 409) {
//         throw new Error(`Rule with ID ${rule.ruleId} already exists`);
//       }
//       throw new Error(`Failed to create business rule: ${response.statusText}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error('Error creating business rule:', error);
//     throw error;
//   }
// }

// /**
//  * Update an existing business rule
//  */
// export async function updateBusinessRule(
//   ruleId: string,
//   rule: UpdateRuleRequest
// ): Promise<BusinessRulesResponse> {
//   try {
//     const response = await fetch(`${BUSINESS_RULES_ENDPOINT}/${ruleId}`, {
//       method: 'PUT',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(rule),
//     });

//     if (!response.ok) {
//       if (response.status === 404) {
//         throw new Error(`Rule not found: ${ruleId}`);
//       }
//       throw new Error(`Failed to update business rule: ${response.statusText}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error(`Error updating business rule ${ruleId}:`, error);
//     throw error;
//   }
// }

// /**
//  * Delete a business rule
//  */
// export async function deleteBusinessRule(ruleId: string): Promise<BusinessRulesResponse> {
//   try {
//     const response = await fetch(`${BUSINESS_RULES_ENDPOINT}/${ruleId}`, {
//       method: 'DELETE',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });

//     if (!response.ok) {
//       if (response.status === 404) {
//         throw new Error(`Rule not found: ${ruleId}`);
//       }
//       throw new Error(`Failed to delete business rule: ${response.statusText}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error(`Error deleting business rule ${ruleId}:`, error);
//     throw error;
//   }
// }

// /**
//  * Toggle a business rule's enabled status
//  */
// export async function toggleBusinessRule(ruleId: string): Promise<BusinessRulesResponse> {
//   try {
//     const response = await fetch(`${BUSINESS_RULES_ENDPOINT}/${ruleId}/toggle`, {
//       method: 'PATCH',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });

//     if (!response.ok) {
//       if (response.status === 404) {
//         throw new Error(`Rule not found: ${ruleId}`);
//       }
//       throw new Error(`Failed to toggle business rule: ${response.statusText}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error(`Error toggling business rule ${ruleId}:`, error);
//     throw error;
//   }
// }

// /**
//  * Get business rules statistics
//  */
// export async function getBusinessRulesStatistics(): Promise<BusinessRulesResponse> {
//   try {
//     const response = await fetch(`${BUSINESS_RULES_ENDPOINT}/statistics`, {
//       method: 'GET',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`Failed to fetch statistics: ${response.statusText}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error('Error fetching business rules statistics:', error);
//     throw error;
//   }
// }

// /**
//  * Client-side filtering for search and enabled status
//  * (These are not supported by backend API, so we filter on frontend)
//  */
// export function filterRulesLocally(
//   rules: BusinessRule[],
//   filter: RuleFilter
// ): BusinessRule[] {
//   let filtered = [...rules];

//   // Filter by enabled status
//   if (filter.enabled !== undefined) {
//     filtered = filtered.filter((rule) => rule.enabled === filter.enabled);
//   }

//   // Filter by search text
//   if (filter.search) {
//     const searchLower = filter.search.toLowerCase();
//     filtered = filtered.filter(
//       (rule) =>
//         rule.ruleName.toLowerCase().includes(searchLower) ||
//         rule.ruleId.toLowerCase().includes(searchLower) ||
//         rule.ruleDescription?.toLowerCase().includes(searchLower) ||
//         rule.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
//     );
//   }

//   return filtered;
// }
