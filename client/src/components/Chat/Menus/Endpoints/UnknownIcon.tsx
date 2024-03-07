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
  } else if (currentEndpoint === KnownEndpoints.groq) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/groq.png"
        alt="Groq Cloud Icon"
      />
    );
  } else if (currentEndpoint === KnownEndpoints.anyscale) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/anyscale.png"
        alt="Anyscale Icon"
      />
    );
  } else if (currentEndpoint === KnownEndpoints.fireworks) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/fireworks.png"
        alt="Fireworks Icon"
      />
    );
  } else if (currentEndpoint === KnownEndpoints.ollama) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/ollama.png"
        alt="Ollama Icon"
      />
    );
  } else if (currentEndpoint === KnownEndpoints.perplexity) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/perplexity.png"
        alt="Perplexity Icon"
      />
    );
  } else if (currentEndpoint === KnownEndpoints['together.ai']) {
    return (
      <img
        className={context === 'landing' ? '' : className}
        src="/assets/together.png"
        alt="together.ai Icon"
      />
    );
  }

  return <CustomMinimalIcon className={className} />;
}
