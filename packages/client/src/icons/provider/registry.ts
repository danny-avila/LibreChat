import { ProviderId } from 'librechat-data-provider';
import type { ComponentType, SVGProps } from 'react';
import GoogleMinimalIcon from '../../svgs/GoogleMinimalIcon';
import CustomMinimalIcon from '../../svgs/CustomMinimalIcon';
import AzureMinimalIcon from '../../svgs/AzureMinimalIcon';
import AnthropicIcon from '../../svgs/AnthropicIcon';
import MoonshotIcon from '../../svgs/MoonshotIcon';
import BedrockIcon from '../../svgs/BedrockIcon';
import GeminiIcon from '../../svgs/GeminiIcon';
import GPTIcon from '../../svgs/GPTIcon';
import XAIcon from '../../svgs/XAIcon';
import anyscale from './assets/anyscale.png';
import apipie from './assets/apipie.png';
import cohere from './assets/cohere.png';
import deepseek from './assets/deepseek.svg';
import fireworks from './assets/fireworks.png';
import groq from './assets/groq.png';
import helicone from './assets/helicone.svg';
import huggingface from './assets/huggingface.svg';
import mistral from './assets/mistral.png';
import mlx from './assets/mlx.png';
import ollama from './assets/ollama.png';
import openrouter from './assets/openrouter.png';
import perplexity from './assets/perplexity.png';
import qwen from './assets/qwen.svg';
import shuttleai from './assets/shuttleai.png';
import together from './assets/together.png';
import unify from './assets/unify.webp';

type ProviderArtComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export type ProviderArt =
  | { kind: 'component'; Component: ProviderArtComponent }
  | { kind: 'asset'; src: string };

export interface ProviderIconDef {
  art: ProviderArt;
  label: string;
  /** Avatar tile background. Absent means the tile renders with no background. */
  brandColor?: string;
  /** Art inherits currentColor and follows the active theme. */
  mono?: boolean;
  /** Per provider layout correction, replacing the old knownEndpointClasses map. */
  className?: string;
  /** Model level refinement merged over the base definition. */
  byModel?: (model: string) => Partial<ProviderIconDef> | undefined;
}

const asset = (src: string): ProviderArt => ({ kind: 'asset', src });

const component = (Component: ProviderArtComponent): ProviderArt => ({
  kind: 'component',
  Component,
});

const openAIBrandColor = (model: string): string => {
  const value = model.toLowerCase();
  if (/\b(o\d)\b/.test(value) || /\bgpt-[5-9](?:\.\d+)?\b/.test(value)) {
    return 'var(--provider-openai-reasoning)';
  }
  return value.includes('gpt-4') ? 'var(--provider-openai-gpt4)' : 'var(--provider-openai)';
};

const googleByModel = (model: string): Partial<ProviderIconDef> | undefined => {
  const value = model.toLowerCase();
  if (/gemini|learnlm/.test(value)) {
    return { art: component(GeminiIcon), mono: false, label: 'Gemini' };
  }
  if (value.includes('gemma')) {
    return { art: component(GeminiIcon), mono: false, label: 'Gemma' };
  }
  return undefined;
};

export const providerIcons: Record<ProviderId, ProviderIconDef> = {
  [ProviderId.openai]: {
    art: component(GPTIcon),
    label: 'OpenAI',
    mono: true,
    brandColor: 'var(--provider-openai)',
    byModel: (model) => ({ brandColor: openAIBrandColor(model) }),
  },
  [ProviderId.anthropic]: {
    art: component(AnthropicIcon),
    label: 'Anthropic',
    mono: true,
    brandColor: 'var(--provider-anthropic)',
  },
  [ProviderId.google]: {
    art: component(GoogleMinimalIcon),
    label: 'Google',
    mono: true,
    byModel: googleByModel,
  },
  [ProviderId.azure]: {
    art: component(AzureMinimalIcon),
    label: 'Azure OpenAI',
    mono: true,
    brandColor: 'var(--provider-azure)',
  },
  [ProviderId.bedrock]: {
    art: component(BedrockIcon),
    label: 'AWS Bedrock',
    mono: true,
    brandColor: 'var(--provider-bedrock)',
  },
  [ProviderId.xai]: { art: component(XAIcon), label: 'xAI', mono: true },
  [ProviderId.moonshot]: { art: component(MoonshotIcon), label: 'Moonshot', mono: true },
  [ProviderId.anyscale]: { art: asset(anyscale), label: 'Anyscale' },
  [ProviderId.apipie]: { art: asset(apipie), label: 'APIpie' },
  [ProviderId.cohere]: {
    art: asset(cohere),
    label: 'Cohere',
  },
  [ProviderId.deepseek]: { art: asset(deepseek), label: 'DeepSeek' },
  [ProviderId.fireworks]: { art: asset(fireworks), label: 'Fireworks' },
  [ProviderId.groq]: { art: asset(groq), label: 'Groq' },
  [ProviderId.helicone]: { art: asset(helicone), label: 'Helicone' },
  [ProviderId.huggingface]: { art: asset(huggingface), label: 'Hugging Face' },
  [ProviderId.mistral]: { art: asset(mistral), label: 'Mistral' },
  [ProviderId.mlx]: { art: asset(mlx), label: 'MLX' },
  [ProviderId.ollama]: { art: asset(ollama), label: 'Ollama' },
  [ProviderId.openrouter]: { art: asset(openrouter), label: 'OpenRouter' },
  [ProviderId.perplexity]: { art: asset(perplexity), label: 'Perplexity' },
  [ProviderId.qwen]: { art: asset(qwen), label: 'Qwen' },
  [ProviderId.shuttleai]: { art: asset(shuttleai), label: 'ShuttleAI' },
  [ProviderId.together]: { art: asset(together), label: 'Together AI' },
  [ProviderId.unify]: { art: asset(unify), label: 'Unify' },
  [ProviderId.vercel]: {
    art: component(CustomMinimalIcon),
    label: 'Vercel',
    mono: true,
  },
};

/** Merges any model level refinement over the base definition for a provider. */
export function getProviderIconDef(
  provider?: ProviderId | null,
  model?: string | null,
): ProviderIconDef {
  const base = provider ? providerIcons[provider] : undefined;
  if (!base) {
    return { art: component(CustomMinimalIcon), label: 'Custom', mono: true };
  }
  const refinement = model ? base.byModel?.(model) : undefined;
  return refinement ? { ...base, ...refinement } : base;
}
