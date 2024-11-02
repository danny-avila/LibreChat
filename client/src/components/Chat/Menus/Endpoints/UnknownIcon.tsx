import { EModelEndpoint, KnownEndpoints } from 'librechat-data-provider';
import { CustomMinimalIcon } from '~/components/svg';
import { IconContext } from '~/common';

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
  [KnownEndpoints.perplexity]: '/assets/perplexity.png',
  [KnownEndpoints.shuttleai]: '/assets/shuttleai.png',
  [KnownEndpoints['together.ai']]: '/assets/together.png',
  [KnownEndpoints.unify]: '/assets/unify.webp',
};

const knownEndpointClasses = {
  [KnownEndpoints.cohere]: {
    [IconContext.landing]: 'p-2',
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
  if (currentEndpoint === KnownEndpoints.openrouter) {
    return className;
  }

  const match = knownEndpointClasses[currentEndpoint]?.[context];
  const defaultClass = context === IconContext.landing ? '' : className;

  return match ?? defaultClass;
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

  console.log('UnknownIcon', endpoint);
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
