import { useEffect, useState, useCallback, useMemo } from 'react';
import _ from 'lodash';

interface Overrides {
  [key: string]: unknown;
}

interface AdminConfigResponse {
  overrides?: Overrides;
}

interface UseAdminConfig {
  overrides: Overrides | undefined;
  loading: boolean;
  error: string | null;
  saving: boolean;
  restarting: boolean;
  dirty: boolean;
  draft: Overrides;
  editDraft: (key: string, value: unknown) => void;
  discardDraft: () => void;
  applyChanges: () => Promise<void>;
  isAuthError: boolean;
}

/**
 * React hook for interacting with the GovGPT Admin plugin config endpoints.
 *
 * GET  /admin/config          → fetch overrides
 * POST /admin/config          → { key, value }  (update single path)
 */
export function useAdminConfig(): UseAdminConfig {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // saving is used for background POSTs (should be rare once we batch apply)
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const [overrides, setOverrides] = useState<Overrides>();
  const [draft, setDraft] = useState<Overrides>({});
  const [isAuthError, setIsAuthError] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }, [token]);

  /* ------------------------------------------------------------------ */
  /* Step 1: Obtain an access token by exchanging the refresh cookie.    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    // Only attempt to fetch a token once on mount
    const fetchToken = async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to refresh token (${res.status})`);
        }

        // The endpoint sometimes returns plain text when no token is available
        const data = await res.json().catch(() => null);
        const newToken: string | undefined = (data && data.token) || undefined;

        if (!newToken) {
          // Redirect to login if no token returned
          window.location.replace('/login');
          return;
        }

        setToken(newToken);
      } catch (err) {
        console.warn('[Admin] Unable to obtain JWT token:', err);
        setIsAuthError(true);
        setError((err as Error).message);
        setLoading(false);
      }
    };

    if (token === null) {
      fetchToken();
    }
  }, [token]);

  const handleResponse = async (response: Response) => {
    
    if (response.status === 401) {
      setIsAuthError(true);
      throw new Error('Authentication required. Please log in to LibreChat first.');
    }
    if (response.status === 403) {
      setIsAuthError(true);
      throw new Error('Access denied. Admin privileges required.');
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  };

  /* ------------------------------------------------------------ */
  /* Step 2: Fetch current config after we have a valid token     */
  /* ------------------------------------------------------------ */

  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchConfig = async () => {
      setLoading(true);
      setError(null);
      setIsAuthError(false);
      
      try {
        const url = '/admin/config';
        const headers = getAuthHeaders();
        
        const res = await fetch(url, {
          headers,
          credentials: 'include', // Important: include cookies for authentication
        });
        
        await handleResponse(res);
        
        const data: AdminConfigResponse = await res.json();
        const serverOverrides = data.overrides ?? {};
        setOverrides(serverOverrides);
        setDraft(_.cloneDeep(serverOverrides));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [getAuthHeaders, token]);

  const editDraft = useCallback((key: string, value: unknown) => {
    setDraft((prev) => {
      const clone = _.cloneDeep(prev);
      _.set(clone, key, value);
      return clone;
    });
  }, []);

  const discardDraft = useCallback(() => {
    if (overrides) {
      setDraft(_.cloneDeep(overrides));
    }
  }, [overrides]);

  const applyChanges = useCallback(async () => {
    if (!overrides) return;

    // Applying draft changes
    setSaving(true);
    try {
      // Flatten objects to dot-notated paths to compare values
      const flatten = (obj: any, prefix = ''): Record<string, unknown> => {
        return Object.keys(obj).reduce((acc: any, key) => {
          const path = prefix ? `${prefix}.${key}` : key;
          if (_.isObjectLike(obj[key]) && !Array.isArray(obj[key])) {
            Object.assign(acc, flatten(obj[key], path));
          } else {
            acc[path] = obj[key];
          }
          return acc;
        }, {});
      };

      const flatDraft = flatten(draft);
      const flatOverrides = flatten(overrides);

      const headers = getAuthHeaders();

      const diff: Record<string, unknown> = {};
      for (const [path, val] of Object.entries(flatDraft)) {
        if (!_.isEqual(val, flatOverrides[path])) {
          diff[path] = val;
        }
      }

      // Send entire draft so server writes complete YAML
      setRestarting(true);
      await fetch('/admin/config', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ overrides: draft }),
      });
    } finally {
      setSaving(false);
    }
  }, [draft, overrides, getAuthHeaders, handleResponse]);

  const dirty = useMemo(() => {
    if (!overrides) return false;
    return !_.isEqual(draft, overrides);
  }, [draft, overrides]);

  return {
    overrides,
    loading,
    error,
    saving,
    restarting,
    dirty,
    draft,
    editDraft,
    discardDraft,
    applyChanges,
    isAuthError,
  };
} 