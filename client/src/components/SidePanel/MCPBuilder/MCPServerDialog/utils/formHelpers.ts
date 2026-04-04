/**
 * Pure utility functions for building MCP server config payloads.
 * These are extracted to be shared between the hook and tests to ensure
 * test logic matches production logic exactly.
 */

import type { MCPServerFormData } from '../hooks/useMCPServerForm';

/**
 * Builds the headers map and secretHeaderKeys array from form data.
 * @param headers - Array of header entries from the form
 * @param isEditMode - Whether the form is in edit mode (allows blank secret values)
 * @returns Object with headers map and secretHeaderKeys array, or empty object if no valid headers
 */
export function buildHeaders(
  headers: MCPServerFormData['headers'],
  isEditMode = false,
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
    // For non-secret headers, skip blank values (no point sending an empty header).
    // For secret headers, only allow blank values in edit mode (to keep existing secrets).
    if (!trimmedValue && (!isSecret || !isEditMode)) {
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
