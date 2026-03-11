import React, { useState, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import { useSearchParams } from 'react-router-dom';

interface LinkedInAccount {
  accountName: string;
  accountId: string;
  connectedAt: string;
  metadata?: {
    email?: string;
    picture?: string;
    givenName?: string;
    familyName?: string;
  };
}

export default function LinkedInAccountSettings() {
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<LinkedInAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch LinkedIn connection status
  const fetchStatus = async () => {
    if (!token) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/linkedin/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch LinkedIn status');
      }

      const data = await response.json();
      setConnected(data.connected);
      setAccount(data.account);
    } catch (err: any) {
      console.error('[LinkedIn] Failed to fetch status:', err);
      setError(err.message || 'Failed to load LinkedIn status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [token]);

  // Handle OAuth callback
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const platform = searchParams.get('platform');
    const message = searchParams.get('message');

    if (success === 'connected' && platform === 'linkedin') {
      showToast({
        message: 'LinkedIn connected successfully!',
        status: 'success',
      });
      fetchStatus();
      setSearchParams({});
    }

    if (error && platform === 'linkedin') {
      const errorMessages: Record<string, string> = {
        oauth_access_denied: 'You denied access to LinkedIn',
        invalid_callback: 'Invalid OAuth callback',
        connection_failed: message || 'Failed to connect LinkedIn account',
        connect_failed: 'Failed to initiate LinkedIn connection',
      };

      showToast({
        message: errorMessages[error] || 'Failed to connect LinkedIn',
        status: 'error',
      });
      setSearchParams({});
    }
  }, [searchParams, showToast, setSearchParams]);

  // Connect LinkedIn account
  const handleConnect = async () => {
    setIsConnecting(true);
    
    try {
      // In development, use explicit backend URL and pass token as query param
      // In production, use relative path (same server, cookie auth works)
      const isDevelopment = import.meta.env.DEV;
      
      console.log('[LinkedIn] isDevelopment:', isDevelopment);
      console.log('[LinkedIn] token available:', !!token);
      
      if (isDevelopment) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3080';
        const connectUrl = `${backendUrl}/api/linkedin/connect?token=${encodeURIComponent(token || '')}`;
        console.log('[LinkedIn] Redirecting to:', connectUrl);
        // Pass token as query parameter for cross-origin dev mode
        window.location.href = connectUrl;
      } else {
        // Production: use relative path, cookie auth works
        console.log('[LinkedIn] Production mode, using relative path');
        window.location.href = '/api/linkedin/connect';
      }
    } catch (err: any) {
      console.error('[LinkedIn] Connect failed:', err);
      showToast({
        message: err.message || 'Failed to connect LinkedIn',
        status: 'error',
      });
      setIsConnecting(false);
    }
  };

  // Disconnect LinkedIn account
  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your LinkedIn account?')) {
      return;
    }

    setIsDisconnecting(true);

    try {
      const response = await fetch('/api/linkedin/disconnect', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect LinkedIn');
      }

      showToast({
        message: 'LinkedIn disconnected successfully',
        status: 'success',
      });

      setConnected(false);
      setAccount(null);
    } catch (err: any) {
      console.error('[LinkedIn] Disconnect failed:', err);
      showToast({
        message: err.message || 'Failed to disconnect LinkedIn',
        status: 'error',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          LinkedIn Integration
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Connect your LinkedIn account to post, comment, and engage directly from LibreChat.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center">
            <span className="text-2xl">⚠️</span>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Error loading LinkedIn status
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={fetchStatus}
                className="mt-2 rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between">
          {/* LinkedIn Info */}
          <div className="flex items-start space-x-4">
            {/* LinkedIn Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-3xl dark:bg-blue-900/30">
              💼
            </div>

            {/* Details */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                LinkedIn
              </h3>
              
              {connected && account ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connected as{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {account.accountName}
                    </span>
                  </p>
                  {account.metadata?.email && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      {account.metadata.email}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Connected on {new Date(account.connectedAt).toLocaleDateString()}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Not connected
                </p>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div>
            {connected ? (
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting ? 'Connecting...' : 'Connect LinkedIn'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Features List */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
          What you can do with LinkedIn integration:
        </h3>
        <ul className="space-y-3">
          <li className="flex items-start">
            <span className="mr-3 text-green-600">✓</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Post content</strong> - Share updates, articles, and thoughts with your network
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-3 text-green-600">✓</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Comment on posts</strong> - Engage with content from your connections
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-3 text-green-600">✓</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Reply to comments</strong> - Have conversations and build relationships
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-3 text-green-600">✓</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              <strong>AI-powered drafts</strong> - Generate LinkedIn posts using AI and approve before posting
            </span>
          </li>
        </ul>
      </div>

      {/* Setup Instructions (if not connected) */}
      {!connected && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex">
            <span className="text-xl">ℹ️</span>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                How to connect
              </h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <ol className="list-inside list-decimal space-y-1">
                  <li>Click "Connect LinkedIn" above</li>
                  <li>You'll be redirected to LinkedIn</li>
                  <li>Authorize LibreChat to access your account</li>
                  <li>You'll be redirected back here</li>
                </ol>
                <p className="mt-2 text-xs">
                  Note: We only request permissions to post and engage on your behalf. We never access your private messages or connections.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy & Security */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
        <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
          Privacy & Security
        </h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
          <li>• Your LinkedIn credentials are never stored in LibreChat</li>
          <li>• Access tokens are encrypted and stored securely</li>
          <li>• You can disconnect at any time</li>
          <li>• We only access what you explicitly authorize</li>
        </ul>
      </div>
    </div>
  );
}
