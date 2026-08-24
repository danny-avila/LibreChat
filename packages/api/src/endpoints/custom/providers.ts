import { ProviderId, resolveProviderId } from 'librechat-data-provider';

const providerHosts: ReadonlyArray<readonly [string, ProviderId]> = [
  ['openrouter.ai', ProviderId.openrouter],
  ['api.openai.com', ProviderId.openai],
  ['api.anthropic.com', ProviderId.anthropic],
  ['api.deepseek.com', ProviderId.deepseek],
  ['api.groq.com', ProviderId.groq],
  ['api.mistral.ai', ProviderId.mistral],
  ['api.perplexity.ai', ProviderId.perplexity],
  ['api.together.xyz', ProviderId.together],
  ['api.x.ai', ProviderId.xai],
  ['api.moonshot.cn', ProviderId.moonshot],
  ['api.moonshot.ai', ProviderId.moonshot],
  ['api.cohere.com', ProviderId.cohere],
  ['api.cohere.ai', ProviderId.cohere],
  ['api.fireworks.ai', ProviderId.fireworks],
  ['api-inference.huggingface.co', ProviderId.huggingface],
  ['api.endpoints.anyscale.com', ProviderId.anyscale],
  ['apipie.ai', ProviderId.apipie],
  ['api.shuttleai.app', ProviderId.shuttleai],
  ['api.unify.ai', ProviderId.unify],
  ['helicone.ai', ProviderId.helicone],
  ['ai-gateway.vercel.sh', ProviderId.vercel],
  ['dashscope.aliyuncs.com', ProviderId.qwen],
];

function providerFromBaseURL(baseURL?: string): ProviderId | undefined {
  if (!baseURL) {
    return undefined;
  }

  let host = '';
  try {
    host = new URL(baseURL).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  for (const [candidate, provider] of providerHosts) {
    if (host === candidate || host.endsWith(`.${candidate}`)) {
      return provider;
    }
  }

  return undefined;
}

/**
 * Resolves a custom endpoint's brand identity once at config load, where `baseURL`
 * is available. `endpointType` is not consulted: every custom endpoint is typed
 * `custom`, so it carries no brand signal.
 */
export function resolveEndpointProviderId({
  name,
  baseURL,
  iconURL,
}: {
  name: string;
  baseURL?: string;
  iconURL?: string;
}): ProviderId | undefined {
  return (
    resolveProviderId(iconURL) ??
    providerFromBaseURL(baseURL) ??
    resolveProviderId(name) ??
    undefined
  );
}
