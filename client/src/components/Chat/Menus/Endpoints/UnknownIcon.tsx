import { EModelEndpoint, KnownEndpoints } from 'librechat-data-provider';
import { CustomMinimalIcon } from '~/components/svg';

export default function UnknownIcon({
  className = '',
  endpoint,
  iconURL,
  context,
}: {
  iconURL?: string;
  className?: string;
  endpoint: EModelEndpoint | string | null;
  context?: 'landing' | 'menu-item' | 'nav' | 'message';
}) {
  if (!endpoint) {
    return <CustomMinimalIcon className={className} />;
  }

  const currentEndpoint = endpoint.toLowerCase();

  if (iconURL) {
    return <img className={className} src={iconURL} alt={`${endpoint} Icon`} />;
  } else if (currentEndpoint === KnownEndpoints.mistral) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/mistral.png"
        alt="Mistral AI Icon"
      />
    );
  } else if (currentEndpoint === KnownEndpoints.openrouter) {
    return <img className={className} src="/assets/openrouter.png" alt="OpenRouter Icon" />;
  }

  return <CustomMinimalIcon className={className} />;
}
