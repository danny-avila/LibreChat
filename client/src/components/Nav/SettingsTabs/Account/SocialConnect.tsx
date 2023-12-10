import React from 'react';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';
import { useGetStartupConfig } from 'librechat-data-provider';

type SocialConnectProps = {
  enabledProviders: {
    google?: boolean;
    facebook?: boolean;
    openid?: boolean;
    github?: boolean;
    discord?: boolean;
  };
};

const SocialConnect: React.FC<SocialConnectProps> = ({ enabledProviders }) => {
  const { data: startupConfig } = useGetStartupConfig();

  const socialProviders = [
    { id: 'google', icon: <GoogleIcon />, label: 'Google', enabled: enabledProviders.google },
    {
      id: 'facebook',
      icon: <FacebookIcon />,
      label: 'Facebook',
      enabled: enabledProviders.facebook,
    },
    { id: 'openid', icon: <OpenIDIcon />, label: 'OpenID', enabled: enabledProviders.openid },
    { id: 'github', icon: <GithubIcon />, label: 'GitHub', enabled: enabledProviders.github },
    { id: 'discord', icon: <DiscordIcon />, label: 'Discord', enabled: enabledProviders.discord },
  ];

  const handleConnect = (providerId: string) => {
    window.location.href = `${startupConfig?.serverDomain}/oauth/${providerId}`;
  };

  return (
    <div className="flex flex-col">
      {socialProviders.map(
        (provider) =>
          provider.enabled && (
            <div key={provider.id} className="flex items-center justify-between">
              <div className="bg-dark-500 flex items-center justify-center rounded-md px-4 py-2">
                {provider.icon}
                <span className="ml-2">{provider.label}</span>
              </div>
              <button
                aria-label={`Connect with ${provider.label}`}
                className={cn(
                  'rounded-md bg-white px-4 py-2 text-black hover:bg-gray-200 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800',
                )}
                onClick={() => handleConnect(provider.id)}
              >
                Connect
              </button>
            </div>
          ),
      )}
    </div>
  );
};

export default SocialConnect;
