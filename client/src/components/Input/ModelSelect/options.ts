import { EModelEndpoint } from 'librechat-data-provider';
import type { FC } from 'react';
import type { TModelSelectProps } from '~/common';
import Anthropic from './Anthropic';
import OpenAI from './OpenAI';
import Google from './Google';

export const options: { [key: string]: FC<TModelSelectProps> } = {
  [EModelEndpoint.openAI]: OpenAI,
  [EModelEndpoint.custom]: OpenAI,
  [EModelEndpoint.bedrock]: OpenAI,
  [EModelEndpoint.azureOpenAI]: OpenAI,
  [EModelEndpoint.google]: Google,
  [EModelEndpoint.anthropic]: Anthropic,
};

export const multiChatOptions = {
  ...options,
};
