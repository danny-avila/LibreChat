import { EModelEndpoint, KnownEndpoints } from 'librechat-data-provider';
import { CustomMinimalIcon } from '~/components/svg';
import { IconContext } from '~/common';
import { cn } from '~/utils';

const knownEndpointAssets = {
  [KnownEndpoints.anyscale]: '/assets/anyscale.png',
  [KnownEndpoints.apipie]: '/assets/apipie.png',
  [KnownEndpoints.cohere]: '/assets/cohere.png',
  [KnownEndpoints.deepseek]: '/assets/deepseek.svg',
  [KnownEndpoints.fireworks]: '/assets/fireworks.png',
  [KnownEndpoints.groq]: '/assets/groq.png',
  [KnownEndpoints.huggingface]: '/assets/huggingface.svg',
  [KnownEndpoints.mistral]: '/assets/mistral.png',
  [KnownEndpoints.mlx]: '/assets/mlx.png',
  [KnownEndpoints.ollama]: '/assets/ollama.png',
  [KnownEndpoints.openrouter]: '/assets/openrouter.png',
  [KnownEndpoints.novitaai]: '/assets/novita.png',
  [KnownEndpoints.perplexity]: '/assets/perplexity.png',
  [KnownEndpoints.shuttleai]: '/assets/shuttleai.png',
  [KnownEndpoints['together.ai']]: '/assets/together.png',
  [KnownEndpoints.unify]: '/assets/unify.webp',
  [KnownEndpoints.xai]: '/assets/xai.svg',
};

const knownEndpointClasses = {
  [KnownEndpoints.cohere]: {
    [IconContext.landing]: 'p-2',
  },
  [KnownEndpoints.xai]: {
    [IconContext.landing]: 'p-2',
    [IconContext.menuItem]: 'bg-white',
    [IconContext.message]: 'bg-white',
    [IconContext.nav]: 'bg-white',
  },
};

const getKnownClass = ({
  currentEndpoint,
  context = '',
  className,
}: {
  currentEndpoint: string;
  context?: string;
  className: string;
}) => {
  if (currentEndpoint === KnownEndpoints.openrouter || currentEndpoint === KnownEndpoints.novitaai) {
    return className;
  }

  const match = knownEndpointClasses[currentEndpoint]?.[context] ?? '';
  const defaultClass = context === IconContext.landing ? '' : className;

  return cn(match, defaultClass);
};

export default function UnknownIcon({
  className = '',
  endpoint: _endpoint,
  iconURL = '',
  context,
}: {
  iconURL?: string;
  className?: string;
  endpoint?: EModelEndpoint | string | null;
  context?: 'landing' | 'menu-item' | 'nav' | 'message';
}) {
  const endpoint = _endpoint ?? '';
  if (!endpoint) {
    return <CustomMinimalIcon className={className} />;
  }

  const currentEndpoint = endpoint.toLowerCase();

  if (iconURL) {
    return <img className={className} src={iconURL} alt={`${endpoint} Icon`} />;
  }

  const assetPath: string = knownEndpointAssets[currentEndpoint] ?? '';

  if (!assetPath) {
    return <CustomMinimalIcon className={className} />;
  }

  return (
    <img
      className={getKnownClass({
        currentEndpoint,
        context: context,
        className,
      })}
      src={assetPath}
      alt={`${currentEndpoint} Icon`}
    />
  );
}
