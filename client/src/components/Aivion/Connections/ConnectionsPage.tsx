import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import type { ServiceConnection } from '../Workflow/types';

const SERVICE_ICON: Record<string, JSX.Element> = {
  gmail: (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  google_drive: (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
      <path d="M12 2L2 19h20L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 19l5-9 5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 19l-5-9-5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  google_calendar: (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ConnectionsPage() {
  const { token } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<ServiceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const r = await fetch('/api/aivion/workflow/connections', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setConnections(await r.json());
    } catch {
      setError('Could not load connections.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  // Handle OAuth callback redirect params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const oauthError = searchParams.get('error');
    if (connected) {
      setSuccessKey(connected);
      setSearchParams({}, { replace: true });
      setTimeout(() => setSuccessKey(null), 6000);
    }
    if (oauthError) {
      setError(`Google OAuth failed: ${oauthError}`);
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect(serviceKey: string) {
    setConnecting(serviceKey);
    setError(null);
    try {
      const r = await fetch(`/api/aivion/workflow/connections/${serviceKey}/initiate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const { auth_url } = await r.json();
      window.location.href = auth_url;
    } catch {
      setError('Failed to start OAuth flow. Please try again.');
      setConnecting(null);
    }
  }

  async function handleDisconnect(serviceKey: string) {
    if (!window.confirm('Disconnect this service? Workflows that use it will stop working until you reconnect.')) return;
    setDisconnecting(serviceKey);
    setError(null);
    try {
      const r = await fetch(`/api/aivion/workflow/connections/${serviceKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      await fetchConnections();
    } catch {
      setError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="min-h-full p-6 lg:p-10">
      <Link
        to="/workflow"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Workflows
      </Link>

      <div className="mt-6 max-w-xl">
        <h1 className="text-xl font-bold text-text-primary">Connected services</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Connect your Google account so workflows can send email, upload files, and access calendar on your behalf.
        </p>

        {successKey && (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-700/40 dark:bg-green-900/20 dark:text-green-300">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Successfully connected {successKey.replace('_', ' ')}.
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : (
          <div className="mt-6 divide-y divide-border-light rounded-2xl border border-border-light">
            {connections.length === 0 && (
              <p className="px-5 py-6 text-sm text-text-secondary">No services available.</p>
            )}
            {connections.map((svc) => (
              <div key={svc.service_key} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary">
                  {SERVICE_ICON[svc.service_key] ?? (
                    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary">{svc.display_name}</p>
                  {svc.connected && svc.account_email ? (
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {svc.account_email}
                      {svc.connected_at ? ` · Connected ${relativeDate(svc.connected_at)}` : ''}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-text-secondary">Not connected</p>
                  )}
                </div>

                {svc.connected ? (
                  <button
                    onClick={() => handleDisconnect(svc.service_key)}
                    disabled={disconnecting === svc.service_key}
                    className="shrink-0 rounded-lg border border-border-light px-3 py-1.5 text-sm text-text-secondary hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:hover:border-red-700 dark:hover:text-red-400"
                  >
                    {disconnecting === svc.service_key ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(svc.service_key)}
                    disabled={connecting === svc.service_key}
                    className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {connecting === svc.service_key ? 'Redirecting…' : 'Connect'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
