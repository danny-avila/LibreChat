import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocalize } from '~/hooks';

export default function OAuthSuccess() {
  const localize = useLocalize();
  const [searchParams] = useSearchParams();
  const [secondsLeft, setSecondsLeft] = useState(3);
  const serverName = searchParams.get('serverName');

  useEffect(() => {
    const countdown = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          window.close();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          {localize('com_ui_oauth_success_title') || 'Authentication Successful'}
        </h1>
        <p className="mb-2 text-sm text-gray-600">
          {localize('com_ui_oauth_success_description') ||
            'Your authentication was successful. This window will close in'}{' '}
          <span className="font-medium text-indigo-500">{secondsLeft}</span>{' '}
          {localize('com_ui_seconds') || 'seconds'}.
        </p>
        {serverName && (
          <p className="mt-4 text-xs text-gray-500">
            {localize('com_ui_oauth_connected_to') || 'Connected to'}:{' '}
            <span className="font-medium">{serverName}</span>
          </p>
        )}
      </div>
    </div>
  );
}
