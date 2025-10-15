import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FlowMetadata } from '~/flow/types';

export interface OAuthMetadata {
  /** OAuth authorization endpoint */
  authorization_endpoint: string;
  /** OAuth token endpoint */
  token_endpoint: string;
  /** OAuth issuer */
  issuer?: string;
  /** Supported scopes */
  scopes_supported?: string[];
  /** Response types supported */
  response_types_supported?: string[];
  /** Grant types supported */
  grant_types_supported?: string[];
  /** Token endpoint auth methods supported */
  token_endpoint_auth_methods_supported?: string[];
  /** Code challenge methods supported */
  code_challenge_methods_supported?: string[];
  /** Revocation endpoint */
  revocation_endpoint?: string;
  /** Revocation endpoint auth methods supported */
  revocation_endpoint_auth_methods_supported?: string[];
}

export interface OAuthProtectedResourceMetadata {
  /** Resource identifier */
  resource: string;
  /** Authorization servers */
  authorization_servers?: string[];
  /** Scopes supported by the resource */
  scopes_supported?: string[];
}

export interface OAuthClientInformation {
  /** Client ID */
  client_id: string;
  /** Client secret (optional for public clients) */
  client_secret?: string;
  /** Client name */
  client_name?: string;
  /** Redirect URIs */
  redirect_uris?: string[];
  /** Grant types */
  grant_types?: string[];
  /** Response types */
  response_types?: string[];
  /** Scope */
  scope?: string;
  /** Token endpoint auth method */
  token_endpoint_auth_method?: string;
}

export interface MCPOAuthState {
  /** Current step in the OAuth flow */
  step: 'discovery' | 'registration' | 'authorization' | 'token_exchange' | 'complete' | 'error';
  /** Server name */
  serverName: string;
  /** User ID */
  userId: string;
  /** OAuth metadata from discovery */
  metadata?: OAuthMetadata;
  /** Resource metadata */
  resourceMetadata?: OAuthProtectedResourceMetadata;
  /** Client information */
  clientInfo?: OAuthClientInformation;
  /** Authorization URL */
  authorizationUrl?: string;
  /** Code verifier for PKCE */
  codeVerifier?: string;
  /** State parameter for OAuth flow */
  state?: string;
  /** Error information */
  error?: string;
  /** Timestamp */
  timestamp: number;
}

export interface MCPOAuthFlowMetadata extends FlowMetadata {
  serverName: string;
  userId: string;
  serverUrl: string;
  state: string;
  codeVerifier?: string;
  clientInfo?: OAuthClientInformation;
  metadata?: OAuthMetadata;
  resourceMetadata?: OAuthProtectedResourceMetadata;
}

export interface MCPOAuthTokens extends OAuthTokens {
  /** When the tokens were obtained */
  obtained_at: number;
  /** Calculated expiry time */
  expires_at?: number;
}

/** Extended OAuth tokens that may include refresh token expiry */
export interface ExtendedOAuthTokens extends OAuthTokens {
  /** Refresh token expiry in seconds (non-standard, some providers include this) */
  refresh_token_expires_in?: number;
}
