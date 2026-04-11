/**
 * Pure utility functions for building MCP server config payloads.
 * These are extracted to be shared between the hook and tests to ensure
 * test logic matches production logic exactly.
 */

import type {
  MCPServerFormData,
  ServerInstructionsMode,
  AuthConfig,
} from '../hooks/useMCPServerForm';
import type { MCPServerDefinition } from '~/hooks';

// Auth type enum - duplicated from hook to avoid circular dependency
export enum AuthTypeEnum {
  None = 'none',
  ServiceHttp = 'service_http',
  OAuth = 'oauth',
}

// Authorization type enum - duplicated from hook to avoid circular dependency
export enum AuthorizationTypeEnum {
  Basic = 'basic',
  Bearer = 'bearer',
  Custom = 'custom',
}

/**
 * Derives form defaultValues from an existing MCPServerDefinition.
 * This is the production logic for populating the form in edit mode.
 */
export function deriveDefaultValues(server: MCPServerDefinition): MCPServerFormData {
  let authType = AuthTypeEnum.None;
  if (server.config.oauth) {
    authType = AuthTypeEnum.OAuth;
  } else if ('apiKey' in server.config && server.config.apiKey) {
    authType = AuthTypeEnum.ServiceHttp;
  }

  const apiKeyConfig = 'apiKey' in server.config ? server.config.apiKey : undefined;

  const headersConfig =
    'headers' in server.config && server.config.headers ? server.config.headers : {};
  const customUserVarsConfig = server.config.customUserVars ?? {};
  const rawSecretHeaderKeys =
    'secretHeaderKeys' in server.config && Array.isArray(server.config.secretHeaderKeys)
      ? server.config.secretHeaderKeys
      : undefined;
  const secretHeaderKeysSet = new Set(rawSecretHeaderKeys ?? []);

  const si = server.config.serverInstructions;
  let serverInstructionsMode: ServerInstructionsMode = 'none';
  if (typeof si === 'string') {
    // Normalize case-insensitive "true"/"false" strings from YAML configs
    const normalized = si.toLowerCase().trim();
    if (normalized === 'true') {
      serverInstructionsMode = 'server';
    } else if (normalized === 'false' || normalized === '') {
      serverInstructionsMode = 'none';
    } else {
      serverInstructionsMode = 'custom';
    }
  } else if (si === true) {
    serverInstructionsMode = 'server';
  }

  // Normalize 'http' transport alias to 'streamable-http'
  const rawType = 'type' in server.config ? server.config.type : 'streamable-http';
  const normalizedType =
    rawType === 'http' ? 'streamable-http' : (rawType as 'streamable-http' | 'sse');

  return {
    title: server.config.title || '',
    description: server.config.description || '',
    url: 'url' in server.config ? (server.config as { url: string }).url : '',
    type: normalizedType || 'streamable-http',
    icon: server.config.iconPath || '',
    auth: {
      auth_type: authType,
      api_key: '', // Never pre-fill secrets
      api_key_source: (apiKeyConfig?.source as 'admin' | 'user') || 'admin',
      api_key_authorization_type:
        (apiKeyConfig?.authorization_type as AuthorizationTypeEnum) || AuthorizationTypeEnum.Bearer,
      api_key_custom_header: apiKeyConfig?.custom_header || '',
      oauth_client_id: server.config.oauth?.client_id || '',
      oauth_client_secret: '', // Never pre-fill secrets
      oauth_authorization_url: server.config.oauth?.authorization_url || '',
      oauth_token_url: server.config.oauth?.token_url || '',
      oauth_scope: server.config.oauth?.scope || '',
      server_id: server.serverName,
    },
    trust: true, // Pre-checked for existing servers
    headers: Object.entries(headersConfig).map(([key, value]) => ({
      key,
      value: value as string,
      isSecret: secretHeaderKeysSet.has(key),
    })),
    customUserVars: Object.entries(customUserVarsConfig).map(([key, cfg]) => ({
      key,
      title: (cfg as { title: string; description: string }).title,
      description: (cfg as { title: string; description: string }).description,
    })),
    chatMenu: server.config.chatMenu !== false,
    serverInstructionsMode,
    serverInstructionsCustom:
      serverInstructionsMode === 'custom' && typeof si === 'string' ? si : '',
  };
}

/**
 * Returns the default form values for a new server (create mode).
 */
export function getNewServerDefaults(): MCPServerFormData {
  return {
    title: '',
    description: '',
    url: '',
    type: 'streamable-http',
    icon: '',
    auth: {
      auth_type: AuthTypeEnum.None,
      api_key: '',
      api_key_source: 'admin',
      api_key_authorization_type: AuthorizationTypeEnum.Bearer,
      api_key_custom_header: '',
      oauth_client_id: '',
      oauth_client_secret: '',
      oauth_authorization_url: '',
      oauth_token_url: '',
      oauth_scope: '',
    },
    trust: false,
    headers: [],
    customUserVars: [],
    chatMenu: true,
    serverInstructionsMode: 'none',
    serverInstructionsCustom: '',
  };
}

/**
 * Builds the base config object from form data (without auth).
 * This includes basic fields, chatMenu, serverInstructions, headers, and customUserVars.
 */
export function buildBaseConfig(
  formData: MCPServerFormData,
  _isEditMode = false,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    type: formData.type,
    url: formData.url,
    title: formData.title,
    ...(formData.description && { description: formData.description }),
    ...(formData.icon && { iconPath: formData.icon }),
    ...(!formData.chatMenu && { chatMenu: false }),
    ...(formData.serverInstructionsMode === 'server' && { serverInstructions: true }),
    ...(formData.serverInstructionsMode === 'custom' &&
      formData.serverInstructionsCustom.trim() && {
        serverInstructions: formData.serverInstructionsCustom.trim(),
      }),
  };

  // Add HTTP headers
  const headersResult = buildHeaders(formData.headers, _isEditMode);
  if (headersResult.headers) {
    config.headers = headersResult.headers;
    config.secretHeaderKeys = headersResult.secretHeaderKeys;
  }

  // Add custom user variable definitions
  const customUserVarsMap = buildCustomUserVars(formData.customUserVars);
  if (customUserVarsMap) {
    config.customUserVars = customUserVarsMap;
  }

  return config;
}

/**
 * Adds OAuth configuration to a config object.
 */
export function addOAuthConfig(
  config: Record<string, unknown>,
  auth: AuthConfig,
): Record<string, unknown> {
  if (
    auth.auth_type === AuthTypeEnum.OAuth &&
    (auth.oauth_client_id ||
      auth.oauth_client_secret ||
      auth.oauth_authorization_url ||
      auth.oauth_token_url ||
      auth.oauth_scope)
  ) {
    config.oauth = {
      ...(auth.oauth_client_id && { client_id: auth.oauth_client_id }),
      ...(auth.oauth_client_secret && { client_secret: auth.oauth_client_secret }),
      ...(auth.oauth_authorization_url && { authorization_url: auth.oauth_authorization_url }),
      ...(auth.oauth_token_url && { token_url: auth.oauth_token_url }),
      ...(auth.oauth_scope && { scope: auth.oauth_scope }),
    };
  }
  return config;
}

/**
 * Adds API Key configuration to a config object.
 */
export function addApiKeyConfig(
  config: Record<string, unknown>,
  auth: AuthConfig,
): Record<string, unknown> {
  if (auth.auth_type === AuthTypeEnum.ServiceHttp) {
    const source = auth.api_key_source || 'admin';
    const authorizationType = auth.api_key_authorization_type || 'bearer';

    config.apiKey = {
      source,
      authorization_type: authorizationType,
      ...(source === 'admin' && auth.api_key && { key: auth.api_key }),
      ...(authorizationType === 'custom' &&
        auth.api_key_custom_header && {
          custom_header: auth.api_key_custom_header,
        }),
    };
  }
  return config;
}

/**
 * Builds the complete config payload from form data.
 * This is the production logic for the onSubmit handler.
 */
export function buildCompleteConfig(
  formData: MCPServerFormData,
  isEditMode = false,
): Record<string, unknown> {
  let config = buildBaseConfig(formData, isEditMode);
  config = addOAuthConfig(config, formData.auth);
  config = addApiKeyConfig(config, formData.auth);
  return config;
}

/**
 * Builds the headers map and secretHeaderKeys array from form data.
 * @param headers - Array of header entries from the form
 * @param _isEditMode - Whether the form is in edit mode (no longer used, kept for API compatibility)
 * @returns Object with headers map and secretHeaderKeys array, or empty object if no valid headers
 */
export function buildHeaders(
  headers: MCPServerFormData['headers'],
  _isEditMode = false,
): {
  headers?: Record<string, string>;
  secretHeaderKeys?: string[];
} {
  if (headers.length === 0) {
    return {};
  }
  const headersMap: Record<string, string> = {};
  const secretHeaderKeysList: string[] = [];
  for (const { key, value, isSecret } of headers) {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey) {
      continue;
    }
    // Skip headers with blank values entirely.
    // In edit mode, blank secret headers are omitted from the payload (not sent as ''),
    // allowing the backend to preserve existing encrypted values.
    // Non-secret headers with blank values are always skipped (no point sending empty header).
    if (!trimmedValue) {
      continue;
    }
    headersMap[trimmedKey] = trimmedValue;
    if (isSecret) {
      secretHeaderKeysList.push(trimmedKey);
    }
  }
  if (Object.keys(headersMap).length === 0) {
    return {};
  }
  // Deduplicate to avoid inconsistent payloads if form has duplicate keys
  return { headers: headersMap, secretHeaderKeys: Array.from(new Set(secretHeaderKeysList)) };
}

/**
 * Builds the customUserVars map from form data.
 * @param vars - Array of custom user variable entries from the form
 * @returns Record mapping variable keys to their title/description, or undefined if none
 */
export function buildCustomUserVars(
  vars: MCPServerFormData['customUserVars'],
): Record<string, { title: string; description: string }> | undefined {
  if (vars.length === 0) {
    return undefined;
  }
  const map: Record<string, { title: string; description: string }> = {};
  for (const { key, title, description } of vars) {
    const trimmedKey = key.trim();
    const trimmedTitle = title.trim();
    if (trimmedKey && trimmedTitle) {
      map[trimmedKey] = {
        title: trimmedTitle,
        description: description.trim(),
      };
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}
