// Merchant API Operation types
// Corresponds to the `merchant_api_operations` MongoDB collection

export type AuthStrategy =
  | "BEARER_TOKEN"
  | "API_KEY_HEADER"
  | "API_KEY_QUERY"
  | "NO_AUTH";

export const AUTH_STRATEGY_LABELS: Record<AuthStrategy, string> = {
  BEARER_TOKEN:    "Bearer Token",
  API_KEY_HEADER:  "API Key Header",
  API_KEY_QUERY:   "API Key Query",
  NO_AUTH:         "No Auth",
};

export const AUTH_STRATEGY_DESCRIPTIONS: Record<AuthStrategy, string> = {
  BEARER_TOKEN:   "Authorization: Bearer {credential} header",
  API_KEY_HEADER: "X-API-Key: {credential} header (key name configurable)",
  API_KEY_QUERY:  "?apiKey={credential} query param",
  NO_AUTH:        "No authentication required",
};

export interface MerchantApiOperation {
  id: string;
  channelType: string;
  operationName: string;
  baseUrl: string;
  urlPath: string;
  authStrategy: AuthStrategy;
  /** Key in the store's credentials map used for auth */
  authCredentialKey: string;
  /** Always-included query params */
  fixedQueryParams: Record<string, string>;
  /** Params sourced from store credentials */
  credentialQueryParams: Record<string, string>;
  /** Dot-notation path to the items array in the API response */
  itemsJsonPath: string;
  /** Field in each item to use as the option value */
  valueField: string;
  /** Field in each item to use as the display label */
  labelField: string;
  enabled: boolean;
  description?: string;
  updatedAt?: string;
}

export interface CreateOperationRequest {
  channelType: string;
  operationName: string;
  baseUrl: string;
  urlPath: string;
  authStrategy: AuthStrategy;
  authCredentialKey?: string;
  fixedQueryParams?: Record<string, string>;
  credentialQueryParams?: Record<string, string>;
  itemsJsonPath: string;
  valueField: string;
  labelField: string;
  enabled?: boolean;
  description?: string;
}

export interface UpdateOperationRequest {
  channelType?: string;
  operationName?: string;
  baseUrl?: string;
  urlPath?: string;
  authStrategy?: AuthStrategy;
  authCredentialKey?: string;
  fixedQueryParams?: Record<string, string>;
  credentialQueryParams?: Record<string, string>;
  itemsJsonPath?: string;
  valueField?: string;
  labelField?: string;
  enabled?: boolean;
  description?: string;
}

export interface OperationListParams {
  channelType?: string;
  operationName?: string;
  /** Default true; pass false to include disabled operations */
  enabled?: boolean;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapRawOperation(raw: unknown): MerchantApiOperation {
  const r = raw as Record<string, unknown>;
  return {
    id:                    (r.id ?? r._id ?? "") as string,
    channelType:           (r.channelType ?? "") as string,
    operationName:         (r.operationName ?? "") as string,
    baseUrl:               (r.baseUrl ?? "") as string,
    urlPath:               (r.urlPath ?? "") as string,
    authStrategy:          (r.authStrategy ?? "NO_AUTH") as AuthStrategy,
    authCredentialKey:     (r.authCredentialKey ?? "") as string,
    fixedQueryParams:      isStringMap(r.fixedQueryParams) ? r.fixedQueryParams as Record<string, string> : {},
    credentialQueryParams: isStringMap(r.credentialQueryParams) ? r.credentialQueryParams as Record<string, string> : {},
    itemsJsonPath:         (r.itemsJsonPath ?? "") as string,
    valueField:            (r.valueField ?? "") as string,
    labelField:            (r.labelField ?? "") as string,
    enabled:               Boolean(r.enabled ?? r.active ?? true),
    description:           r.description as string | undefined,
    updatedAt:             r.updatedAt as string | undefined,
  };
}

function isStringMap(v: unknown): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
