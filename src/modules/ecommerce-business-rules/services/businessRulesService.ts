/**
 * Business Rules Service - Business rules execution and management
 * Extracted from backendService.ts for modular architecture
 */

const BACKEND_BASE_URL = 'http://localhost:8888/labamap/api/v1/ecommerce';

export class BusinessRulesService {
  /**
   * Business Rules APIs
   */

  // POST /api/v1/ecommerce/business-rules/execute
  static async executeBusinessRules(organizationId: string, ruleExecutionRequest: any): Promise<any> {
    const response = await fetch(`${BACKEND_BASE_URL}/business-rules/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId,
        ...ruleExecutionRequest
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to execute business rules: ${response.statusText}`);
    }

    return response.json();
  }

  // Add more business rules methods here as needed
}

// Re-export for convenience
export { BusinessRulesService as BackendAPIService };
