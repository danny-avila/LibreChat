import React from 'react';
import LinkedInAccountSettings from './LinkedInAccountSettings';

export default function SocialAccountsSettings() {
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

      {/* LinkedIn Direct Integration */}
      <LinkedInAccountSettings />

      {/* Coming Soon - Other Platforms */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/50">
        <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">
          Coming Soon
        </h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center">
            <span className="mr-3">👥</span>
            <span>Facebook - Direct OAuth integration</span>
          </div>
          <div className="flex items-center">
            <span className="mr-3">𝕏</span>
            <span>X (Twitter) - Direct OAuth integration</span>
          </div>
          <div className="flex items-center">
            <span className="mr-3">📷</span>
            <span>Instagram - Direct OAuth integration</span>
          </div>
        </div>
      </div>
    </div>
  );
}
