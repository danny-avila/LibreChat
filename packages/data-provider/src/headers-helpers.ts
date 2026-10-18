import axios from 'axios';
import { EXPECTED_TENANT_HEADER } from './types/organizations';

export function setAcceptLanguageHeader(value: string): void {
  axios.defaults.headers.common['Accept-Language'] = value;
}

export function setTokenHeader(token: string | undefined) {
  if (token === undefined) {
    delete axios.defaults.headers.common['Authorization'];
  } else {
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
  }
}

export function getTokenHeader(): string | undefined {
  const authorization = axios.defaults.headers.common['Authorization'];
  return typeof authorization === 'string' ? authorization : undefined;
}

/**
 * Names the organization the UI is showing on every request, so a request from a tab whose
 * session another tab moved to a different organization is refused rather than misapplied.
 */
export function setExpectedTenantHeader(tenantId: string | undefined): void {
  if (tenantId) {
    axios.defaults.headers.common[EXPECTED_TENANT_HEADER] = tenantId;
  } else {
    delete axios.defaults.headers.common[EXPECTED_TENANT_HEADER];
  }
}

/** The organization header for requests that bypass axios (fetch, SSE). */
export function getExpectedTenantHeader(): Record<string, string> {
  const tenantId = axios.defaults.headers.common[EXPECTED_TENANT_HEADER];
  return typeof tenantId === 'string' ? { [EXPECTED_TENANT_HEADER]: tenantId } : {};
}
