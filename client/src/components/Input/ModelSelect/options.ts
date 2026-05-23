import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import type { FC } from 'react';

import OpenAI from './OpenAI';
import Google from './Google';
import Anthropic from './Anthropic';

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
