import React from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { RecoilRoot, RecoilState } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import type { TConversation, TMessage, TPreset, TUser } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  recoilState?: Array<[RecoilState<any>, any]>;
  queryClient?: QueryClient;
  includeRouter?: boolean;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

interface ProvidersProps {
  children: React.ReactNode;
  options?: CustomRenderOptions;
}

export function TestProviders({ children, options = {} }: ProvidersProps) {
  const { recoilState = [], queryClient = createQueryClient(), includeRouter = false } = options;

  const content = (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot
        initializeState={({ set }) => {
          recoilState.forEach(([atom, value]) => set(atom, value));
        }}
      >
        {children}
      </RecoilRoot>
    </QueryClientProvider>
  );

  return includeRouter ? <BrowserRouter>{content}</BrowserRouter> : content;
}

export function renderWithState(
  ui: React.ReactElement,
  options?: CustomRenderOptions,
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <TestProviders options={options}>{children}</TestProviders>,
    ...options,
  });
}

export const mockUser: TUser = {
  id: 'user-1',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  plugins: [],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

export function createMockConversation(overrides: Partial<TConversation> = {}): TConversation {
  return {
    conversationId: 'conv-1',
    title: 'Test Conversation',
    user: 'user-1',
    endpoint: EModelEndpoint.openAI,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    model: 'gpt-3.5-turbo',
    chatGptLabel: null,
    promptPrefix: null,
    temperature: 1,
    topP: 1,
    topK: 5,
    context: null,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    ...overrides,
  };
}

export function createMockMessage(overrides: Partial<TMessage> = {}): TMessage {
  return {
    messageId: 'msg-1',
    conversationId: 'conv-1',
    clientId: 'client-1',
    parentMessageId: null,
    text: 'Test message',
    isCreatedByUser: true,
    model: 'gpt-3.5-turbo',
    endpoint: EModelEndpoint.openAI,
    error: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    searchResult: false,
    unfinished: false,
    children: [],
    ...overrides,
  };
}

export function createMockPreset(overrides: Partial<TPreset> = {}): TPreset {
  return {
    presetId: 'preset-1',
    title: 'Test Preset',
    endpoint: EModelEndpoint.openAI,
    model: 'gpt-3.5-turbo',
    chatGptLabel: null,
    promptPrefix: null,
    temperature: 1,
    top_p: 1,
    topP: 1,
    topK: 5,
    context: null,
    frequency_penalty: 0,
    presence_penalty: 0,
    user: 'user-1',
    ...overrides,
  };
}

export const mockUseLocalize = () => (key: string) => key;
