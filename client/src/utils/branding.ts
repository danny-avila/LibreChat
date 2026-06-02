import React from 'react';
import { Sparkles } from '@librechat/client';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';

export const ASSISTANT_DISPLAY_NAME = 'AI Assistant';

const PROVIDER_BRAND_PATTERN =
  /\b(claude|openai|chatgpt|gpt-|gemini|anthropic|groq|mistral|perplexity|cohere|deepseek|bedrock|ollama|azure|google|meta-llama|llama|openrouter|xai|moonshot|kimi|qwen|sonnet|opus|haiku)\b/i;

const MODEL_ID_PATTERN = /^(claude|gpt|gemini|o\d|anthropic\.|meta-llama|llama|mistral|deepseek)/i;

export function containsProviderBrand(text: string): boolean {
  return PROVIDER_BRAND_PATTERN.test(text);
}

export function isProviderModelId(model?: string | null): boolean {
  if (!model?.trim()) {
    return false;
  }
  return MODEL_ID_PATTERN.test(model.trim());
}

export function getAssistantDisplayName(label?: string | null): string {
  if (label?.trim() && !containsProviderBrand(label)) {
    return label.trim();
  }
  return ASSISTANT_DISPLAY_NAME;
}

export function getEndpointDisplayName(endpoint?: string | null, label?: string | null): string {
  if (endpoint && (isAgentsEndpoint(endpoint) || isAssistantsEndpoint(endpoint))) {
    return label?.trim() || ASSISTANT_DISPLAY_NAME;
  }
  return getAssistantDisplayName(label);
}

export function getPublicModelName(model?: string | null): string | undefined {
  if (!model || isProviderModelId(model)) {
    return undefined;
  }
  if (containsProviderBrand(model)) {
    return undefined;
  }
  return model;
}

export function shouldWhiteLabelEndpoint(endpoint?: string | null): boolean {
  if (!endpoint) {
    return true;
  }
  if (isAgentsEndpoint(endpoint) || isAssistantsEndpoint(endpoint)) {
    return false;
  }
  return true;
}

export function NeutralAssistantIcon({
  className = '',
  size,
}: Pick<IconMapProps, 'className' | 'size'>) {
  return React.createElement(Sparkles, {
    className,
    size: size ?? 20,
    'aria-hidden': true,
  });
}

export const NEUTRAL_ASSISTANT_ICON_BG = 'rgb(121, 137, 255)';
