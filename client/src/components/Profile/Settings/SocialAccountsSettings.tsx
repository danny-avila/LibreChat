import React, { useEffect } from 'react';
import { useSocialAccounts } from '~/hooks/useSocialAccounts';
import { useToastContext } from '@librechat/client';
import { useSearchParams } from 'react-router-dom';

// Platform icons (using emoji for simplicity, can be replaced with actual icons)
const platformIcons: Record<string, string> = {
  linkedin: '💼',
  x: '𝕏',
  instagram: '📷',
  facebook: '👥',
  tiktok: '🎵',
  youtube: '▶️',
  pinterest: '📌',
};

export default function SocialAccountsSettings() {
  const { showToast } = useToastContext();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const {
    accounts,
    status,
    platforms,
    isLoading,
    connectingPlatform,
    isDisconnecting,
    error,
    connectAccount,
    disconnectAccount,
    refreshAccounts,
  } = useSocialAccounts();

  // Log for debugging
  console.log('[SocialAccountsSettings] Render:', { 
    isLoading, 
    platformsCount: platforms.length,
    accountsCount: accounts.length,
    error: error?.message 
  });

  // Handle OAuth callback success/error
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const platform = searchParams.get('platform');

    if (success === 'connected' && platform) {
      showToast({
        message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully!`,
        status: 'success',
      });
      refreshAccounts();
      // Clean up URL params
      setSearchParams({});
    }

    if (error) {
      const errorMessages: Record<string, string> = {
        oauth_failed: 'OAuth authorization failed',
        invalid_state: 'Invalid or expired session',
        postiz_error: 'Failed to connect with Postiz',
        save_failed: 'Failed to save connection',
        connection_failed: 'Connection failed',
      };

      showToast({
        message: errorMessages[error] || 'Failed to connect account',
        status: 'error',
      });
      // Clean up URL params
      setSearchParams({});
    }
  }, [searchParams, showToast, refreshAccounts, setSearchParams]);

  const handleConnect = async (platformId: string) => {
    await connectAccount(platformId);
  };

  const handleDisconnect = async (accountId: string) => {
    await disconnectAccount(accountId);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Social Media Accounts
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Connect your social media accounts to schedule and publish posts directly from LibreChat.
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center">
            <span className="text-2xl">⚠️</span>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Failed to load social accounts
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {error.message || 'Unable to connect to the server. Please check that the backend is running.'}
              </p>
              <button
                onClick={refreshAccounts}
                className="mt-2 rounded-lg bg-red-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback platforms if API fails
  const fallbackPlatforms: Platform[] = [
    { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', color: '#0077B5' },
    { id: 'x', name: 'X (Twitter)', icon: 'twitter', color: '#000000' },
    { id: 'instagram', name: 'Instagram', icon: 'instagram', color: '#E4405F' },
    { id: 'facebook', name: 'Facebook', icon: 'facebook', color: '#1877F2' },
    { id: 'tiktok', name: 'TikTok', icon: 'tiktok', color: '#000000' },
    { id: 'youtube', name: 'YouTube', icon: 'youtube', color: '#FF0000' },
    { id: 'pinterest', name: 'Pinterest', icon: 'pinterest', color: '#E60023' },
  ];

  const displayPlatforms = platforms.length > 0 ? platforms : fallbackPlatforms;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Social Media Accounts
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Connect your social media accounts to schedule and publish posts directly from LibreChat.
        </p>
      </div>

      {/* Error Warning (if API failed but using fallback) */}
      {error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div className="flex items-center">
            <span className="text-2xl">⚠️</span>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Using offline mode
              </h3>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Could not connect to server. Showing available platforms, but connections may not work.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Connected Accounts Summary */}
      {accounts.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-center">
            <span className="text-2xl">✓</span>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} connected
              </h3>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                You can now schedule posts to your connected platforms.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Platforms List */}
      <div className="space-y-4">
        {displayPlatforms.map((platform) => {
          const connectedAccount = status[platform.id];
          const isConnected = !!connectedAccount;

          return (
            <div
              key={platform.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Platform Info */}
              <div className="flex items-center space-x-4">
                {/* Icon */}
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ backgroundColor: `${platform.color}20` }}
                >
                  {platformIcons[platform.id] || '🔗'}
                </div>

                {/* Details */}
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {platform.name}
                  </h3>
                  {isConnected ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Connected as{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {connectedAccount.accountName}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Not connected
                    </p>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div>
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(connectedAccount._id)}
                    disabled={isDisconnecting}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(platform.id)}
                    disabled={connectingPlatform === platform.id}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {connectingPlatform === platform.id ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="flex">
          <span className="text-xl">ℹ️</span>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Setup Required
            </h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
              <p className="mb-2">
                To connect social media accounts, OAuth apps must be configured in Postiz first:
              </p>
              <ol className="list-inside list-decimal space-y-1">
                <li>Open Postiz at <a href="http://localhost:4007" target="_blank" rel="noopener noreferrer" className="underline">http://localhost:4007</a></li>
                <li>Go to Settings → Integrations</li>
                <li>Configure OAuth apps for each platform (LinkedIn, X, etc.)</li>
                <li>Add OAuth credentials from each platform's developer portal</li>
                <li>Once configured, return here to connect your accounts</li>
              </ol>
              <p className="mt-2 text-xs">
                Note: Each platform requires creating a developer app and obtaining OAuth credentials.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={refreshAccounts}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Refresh Accounts
        </button>
      </div>
    </div>
  );
}
