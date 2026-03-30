/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EModelEndpoint } from 'librechat-data-provider';
import { MarketplaceProvider } from '../MarketplaceContext';
import { useChatContext } from '~/Providers';

// Mock the ChatContext from Providers
jest.mock('~/Providers', () => ({
  ChatContext: {
    Provider: ({ children, value }: { children: React.ReactNode; value: any }) => (
      <div data-testid="chat-context-provider" data-value={JSON.stringify(value)}>
        {children}
      </div>
    ),
  },
  useChatContext: jest.fn(),
}));

// Mock useChatHelpers to avoid Recoil dependency
jest.mock('~/hooks', () => ({
  useChatHelpers: jest.fn(),
}));

const mockedUseChatContext = useChatContext as jest.MockedFunction<typeof useChatContext>;

// Test component that consumes the context
const TestConsumer: React.FC = () => {
  const context = mockedUseChatContext();

  return (
    <div>
      <div data-testid="endpoint">{context?.conversation?.endpoint}</div>
      <div data-testid="conversation-id">{context?.conversation?.conversationId}</div>
      <div data-testid="title">{context?.conversation?.title}</div>
    </div>
  );
};

describe('MarketplaceProvider', () => {
  beforeEach(() => {
    mockedUseChatContext.mockClear();

    // Mock useChatHelpers return value
    const { useChatHelpers } = require('~/hooks');
    (useChatHelpers as jest.Mock).mockReturnValue({
      conversation: {
        endpoint: EModelEndpoint.agents,
        conversationId: 'marketplace',
        title: 'Agent Marketplace',
      },
    });
  });

  it('provides correct marketplace context values', () => {
    const mockContext = {
      conversation: {
        endpoint: EModelEndpoint.agents,
        conversationId: 'marketplace',
        title: 'Agent Marketplace',
      },
    };

    mockedUseChatContext.mockReturnValue(mockContext as ReturnType<typeof useChatContext>);

    render(
      <MarketplaceProvider>
        <TestConsumer />
      </MarketplaceProvider>,
    );

    expect(screen.getByTestId('endpoint')).toHaveTextContent(EModelEndpoint.agents);
    expect(screen.getByTestId('conversation-id')).toHaveTextContent('marketplace');
    expect(screen.getByTestId('title')).toHaveTextContent('Agent Marketplace');
  });

  it('creates ChatContext.Provider with correct structure', () => {
    render(
      <MarketplaceProvider>
        <div>{/* eslint-disable-line i18next/no-literal-string */}Test Child</div>
      </MarketplaceProvider>,
    );

    const provider = screen.getByTestId('chat-context-provider');
    expect(provider).toBeInTheDocument();

    const valueData = JSON.parse(provider.getAttribute('data-value') || '{}');
    expect(valueData.conversation).toEqual({
      endpoint: EModelEndpoint.agents,
      conversationId: 'marketplace',
      title: 'Agent Marketplace',
    });
  });

  it('renders children correctly', () => {
    render(
      <MarketplaceProvider>
        <div data-testid="test-child">
          {/* eslint-disable-line i18next/no-literal-string */}Test Content
        </div>
      </MarketplaceProvider>,
    );

    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByTestId('test-child')).toHaveTextContent('Test Content');
  });

  it('provides stable context value (memoization)', () => {
    const { rerender } = render(
      <MarketplaceProvider>
        <TestConsumer />
      </MarketplaceProvider>,
    );

    const firstProvider = screen.getByTestId('chat-context-provider');
    const firstValue = firstProvider.getAttribute('data-value');

    // Rerender should provide the same memoized value
    rerender(
      <MarketplaceProvider>
        <TestConsumer />
      </MarketplaceProvider>,
    );

    const secondProvider = screen.getByTestId('chat-context-provider');
    const secondValue = secondProvider.getAttribute('data-value');

    expect(firstValue).toBe(secondValue);
  });

  it('provides minimal context without bloated functions', () => {
    render(
      <MarketplaceProvider>
        <div>{/* eslint-disable-line i18next/no-literal-string */}Test</div>
      </MarketplaceProvider>,
    );

    const provider = screen.getByTestId('chat-context-provider');
    const valueData = JSON.parse(provider.getAttribute('data-value') || '{}');

    // Should only have conversation object, not 44 empty functions
    expect(Object.keys(valueData)).toContain('conversation');
    expect(valueData.conversation).toEqual({
      endpoint: EModelEndpoint.agents,
      conversationId: 'marketplace',
      title: 'Agent Marketplace',
    });
  });
});
