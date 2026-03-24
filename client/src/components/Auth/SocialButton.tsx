import React from 'react';
import useNativeGoogleLogin from '~/hooks/useNativeGoogleLogin';
import { isNativeIOS } from '~/utils/mobile/platform';

const SocialButton = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  const { login: nativeGoogleLogin, isLoading } = useNativeGoogleLogin();

  if (!enabled) {
    return null;
  }

  const isNativeGoogle = id === 'google' && oauthPath === 'google' && isNativeIOS();

  return (
    <div className="mt-2 flex gap-x-2">
      <a
        aria-label={`${label}`}
        className="flex w-full items-center space-x-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3 text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
        href={`${serverDomain}/oauth/${oauthPath}`}
        data-testid={id}
        onClick={
          isNativeGoogle
            ? async (event) => {
                event.preventDefault();
                if (isLoading) {
                  return;
                }
                await nativeGoogleLogin();
              }
            : undefined
        }
      >
        <Icon />
        <p>{isNativeGoogle && isLoading ? `${label}...` : label}</p>
      </a>
    </div>
  );
};

export default SocialButton;
