import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, Providers, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import { render, screen } from 'test/layout-test-utils';
import { ChatContext } from '~/Providers';
import EndpointSettings from '../EndpointSettings';

/**
 * Behavior 3.2 — the picklist stays available while settings render nothing.
 *
 * Both endpoints are arbitrarily named, because the endpoint name is admin-chosen:
 * nothing in the render path may key off a magic display name. The endpoint and
 * model data is the exact shape BAML discovery publishes, seeded through the same
 * React Query keys the production hooks read.
 */

const BAML_ENDPOINTS = ['Team-BAML', 'Skunkworks [v2]'] as const;

const bamlEndpointConfig = {
  type: EModelEndpoint.custom,
  userProvide: false,
  userProvideURL: false,
  customParams: { defaultParamsEndpoint: Providers.BAML },
  modelDisplayLabel: undefined,
  iconURL: undefined,
};

const endpointsConfig = {
  'Team-BAML': bamlEndpointConfig,
  'Skunkworks [v2]': bamlEndpointConfig,
  Proxy: {
    type: EModelEndpoint.custom,
    userProvide: false,
    userProvideURL: false,
  },
} as unknown as TEndpointsConfig;

const modelsConfig = {
  'Team-BAML': ['OpenRouter', 'OpenRouterFast'],
  'Skunkworks [v2]': ['OpenRouter'],
  Proxy: ['gpt-4o'],
} as unknown as TModelsConfig;

const conversationFor = (endpoint: string, model: string) =>
  ({
    conversationId: 'convo-1',
    endpoint,
    endpointType: EModelEndpoint.custom,
    model,
    title: 'test',
  }) as unknown as TConversation;

/** Every OpenAI-shaped generation control BAML must never surface. */
const OPENAI_CONTROL_KEYS = [
  'max_tokens',
  'maxOutputTokens',
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
];

const renderedControlKeys = (container: HTMLElement) =>
  OPENAI_CONTROL_KEYS.filter((key) => container.querySelector(`[id^="${key}-dynamic"]`) != null);

/** The settings controls read only `preset` off the chat context. */
const chatContextValue = { preset: null } as unknown as React.ContextType<typeof ChatContext>;

const renderSettings = (conversation: TConversation) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData([QueryKeys.endpoints], endpointsConfig);
  queryClient.setQueryData([QueryKeys.models], modelsConfig);

  return render(
    <QueryClientProvider client={queryClient}>
      <ChatContext.Provider value={chatContextValue}>
        <EndpointSettings conversation={conversation} setOption={() => () => undefined} />
      </ChatContext.Provider>
    </QueryClientProvider>,
  );
};

describe('EndpointSettings for BAML endpoints', () => {
  it('renders the OpenAI controls for an ordinary custom endpoint', () => {
    const { container } = renderSettings(conversationFor('Proxy', 'gpt-4o'));

    expect(renderedControlKeys(container)).toEqual(
      OPENAI_CONTROL_KEYS.filter((k) => k !== 'maxOutputTokens'),
    );
  });

  it.each(BAML_ENDPOINTS)('renders no parameter panel for %s', (endpoint) => {
    const { container } = renderSettings(conversationFor(endpoint, 'OpenRouter'));

    expect(renderedControlKeys(container)).toEqual([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces no max output token control for a BAML endpoint', () => {
    renderSettings(conversationFor('Team-BAML', 'OpenRouterFast'));

    expect(screen.queryByText(/max.*output.*token/i)).toBeNull();
    expect(screen.queryByText(/temperature/i)).toBeNull();
  });
});
