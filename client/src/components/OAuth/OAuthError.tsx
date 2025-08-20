import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';

export default function OAuthError() {
  const localize = useLocalize();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error') || 'unknown_error';

  const getErrorMessage = (error: string): string => {
    switch (error) {
      case 'missing_code':
        return (
          localize('com_ui_oauth_error_missing_code') ||
          'Authorization code is missing. Please try again.'
        );
      case 'missing_state':
        return (
          localize('com_ui_oauth_error_missing_state') ||
          'State parameter is missing. Please try again.'
        );
      case 'invalid_state':
        return (
          localize('com_ui_oauth_error_invalid_state') ||
          'Invalid state parameter. Please try again.'
        );
      case 'callback_failed':
        return (
          localize('com_ui_oauth_error_callback_failed') ||
          'Authentication callback failed. Please try again.'
        );
      default:
        return localize('com_ui_oauth_error_generic') || error.replace(/_/g, ' ');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          {localize('com_ui_oauth_error_title') || 'Authentication Failed'}
        </h1>
        <p className="mb-6 text-sm text-gray-600">{getErrorMessage(error)}</p>
        <button
          onClick={() => window.close()}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          aria-label={localize('com_ui_close_window') || 'Close Window'}
        >
          {localize('com_ui_close_window') || 'Close Window'}
        </button>
      </div>
    </div>
  );
}
